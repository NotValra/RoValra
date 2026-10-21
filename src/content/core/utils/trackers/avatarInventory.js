import { getAuthenticatedUserId } from '../../user';
import { callRobloxApi } from '../../api.js';
import * as indexedDb from '../../storage/indexedDb.js';
import { runExclusiveScan } from './scanLock.js';

const AVATAR_INVENTORY_STORE = 'avatarInventory';
const LEGACY_AVATAR_INVENTORY_DATA_KEY = 'rovalra_avatar_inventory_v1';
const AVATAR_INVENTORY_REFRESH_DURATION = 60 * 1000;
const AVATAR_INVENTORY_REQUEST_DELAY = 150;
const AVATAR_INVENTORY_SCAN_TYPES = {
    recentEquipped: {
        sortOption: 'recentEquipped',
        timeField: 'lastEquipTime',
        latestKey: 'latestRecentlyEquippedItems',
    },
    recentAdded: {
        sortOption: 'recentAdded',
        timeField: 'acquisitionTime',
        latestKey: 'latestRecentlyAddedItems',
    },
};

const activeScans = new Set();
let legacyMigration = null;
let avatarInventoryInterval = null;
let avatarInventoryScanUserId = null;

export async function getAvatarInventoryData() {
    const userId = await getAuthenticatedUserId();
    if (!userId) return null;

    const currentUserData = await indexedDb.get(AVATAR_INVENTORY_STORE, userId);

    return {
        totals: { totalItems: 0 },
        items: {},
        scanCursors: {},
        scanComplete: {},
        ...(currentUserData || {}),
        isScanning: !!currentUserData?.isScanning,
    };
}

export async function getCachedAvatarInventoryData() {
    const userId = await getAuthenticatedUserId();
    if (!userId) return null;

    return indexedDb.get(AVATAR_INVENTORY_STORE, userId);
}

export function onAvatarInventoryDataChanged(callback) {
    return indexedDb.onChanged(AVATAR_INVENTORY_STORE, callback);
}

export async function getAvatarInventoryItem(itemId) {
    const data = await getAvatarInventoryData();
    if (!data) return null;

    return data.items?.[String(itemId)] || null;
}

async function fetchAvatarInventoryPage(sortOption, pageToken = null) {
    let endpoint = `/v1/avatar-inventory?sortOption=${encodeURIComponent(sortOption)}&pageLimit=120`;
    if (pageToken) endpoint += `&pageToken=${encodeURIComponent(pageToken)}`;

    while (true) {
        try {
            const response = await callRobloxApi({
                useBackground: true,
                noCache: true,
                subdomain: 'avatar',
                endpoint,
            });

            if (response.status === 429) {
                const resetSeconds = parseInt(
                    response.headers.get('x-ratelimit-reset'),
                    10,
                );
                const retryDelay = Number.isFinite(resetSeconds)
                    ? Math.max(resetSeconds, 1) * 1000
                    : 10000;
                await new Promise((resolve) => setTimeout(resolve, retryDelay));
                continue;
            }

            if (!response.ok) return null;
            return await response.json();
        } catch (error) {
            console.error(
                'RoValra: Failed to fetch avatar inventory page',
                error,
            );
            return null;
        }
    }
}

function getAvatarInventorySignature(item, timeField) {
    const itemId = item?.itemId ? String(item.itemId) : null;
    if (!itemId) return null;

    return `${itemId}:${item?.[timeField] || ''}`;
}

function mergeAvatarInventoryIntoAggregated(
    existingAggregated,
    rawItems,
    timeField,
) {
    const updated = existingAggregated || {
        totals: { totalItems: 0 },
        items: {},
    };

    updated.totals = updated.totals || { totalItems: 0 };
    updated.items = updated.items || {};

    rawItems.forEach((item) => {
        const itemId = item?.itemId ? String(item.itemId) : null;
        if (!itemId) return;

        const existingItem = updated.items[itemId] || { itemId };
        const isNewItem = !updated.items[itemId];

        updated.items[itemId] = {
            ...existingItem,
            itemId,
            itemName: item.itemName || existingItem.itemName || '',
            availabilityStatus:
                item.availabilityStatus ||
                existingItem.availabilityStatus ||
                '',
            itemCategory: item.itemCategory || existingItem.itemCategory || {},
            [timeField]: item[timeField] || existingItem[timeField] || null,
        };

        if (isNewItem) {
            updated.totals.totalItems += 1;
        }
    });

    return updated;
}

async function runAvatarInventoryScan(userId) {
    userId = String(userId);

    if (activeScans.has(userId)) return;
    activeScans.add(userId);

    try {
        const userData =
            (await indexedDb.get(AVATAR_INVENTORY_STORE, userId)) || {};

        const now = Date.now();
        if (userData.isFullyScanned) {
            const lastCheck =
                userData.lastIncrementalCheck || userData.lastFullScan || 0;
            if (now - lastCheck < AVATAR_INVENTORY_REFRESH_DURATION) return;

            await runAvatarInventoryScanTypes(userId, userData, true);
        } else {
            await runAvatarInventoryScanTypes(userId, userData, false);
        }
    } finally {
        activeScans.delete(userId);
    }
}

async function runAvatarInventoryScanTypes(
    userId,
    existingData,
    isIncremental,
) {
    let currentAggregated = {
        totals: existingData.totals || { totalItems: 0 },
        items: existingData.items || {},
        scanCursors: existingData.scanCursors || {},
        scanComplete: existingData.scanComplete || {},
        latestRecentlyEquippedItems:
            existingData.latestRecentlyEquippedItems || [],
        latestRecentlyAddedItems: existingData.latestRecentlyAddedItems || [],
    };

    for (const [scanType, config] of Object.entries(
        AVATAR_INVENTORY_SCAN_TYPES,
    )) {
        currentAggregated = await runAvatarInventoryLoopForType(
            userId,
            existingData,
            currentAggregated,
            scanType,
            config,
            isIncremental,
        );
    }
}

async function runAvatarInventoryLoopForType(
    userId,
    existingData,
    currentAggregated,
    scanType,
    config,
    isIncremental,
) {
    let cursor = isIncremental
        ? null
        : currentAggregated.scanCursors?.[scanType] || null;
    let pagesChecked = 0;
    let foundMatch = false;
    let emptyPageCount = 0;
    const seenSignatures = new Set();

    while (true) {
        const data = await fetchAvatarInventoryPage(config.sortOption, cursor);
        if (!data) break;

        const items = data.avatarInventoryItems || [];
        if (items.length === 0) {
            emptyPageCount++;
            if (emptyPageCount >= 5 || !data.nextPageToken) break;
            cursor = data.nextPageToken;
            continue;
        }
        emptyPageCount = 0;

        const newBatch = [];
        for (const item of items) {
            const signature = getAvatarInventorySignature(
                item,
                config.timeField,
            );
            if (!signature || seenSignatures.has(signature)) continue;
            seenSignatures.add(signature);

            if (
                isIncremental &&
                currentAggregated[config.latestKey].includes(signature)
            ) {
                foundMatch = true;
                break;
            }

            newBatch.push(item);
        }

        currentAggregated = mergeAvatarInventoryIntoAggregated(
            currentAggregated,
            newBatch,
            config.timeField,
        );

        if (pagesChecked === 0) {
            const firstSignatures = items
                .map((item) =>
                    getAvatarInventorySignature(item, config.timeField),
                )
                .filter(Boolean)
                .slice(0, 20);

            currentAggregated[config.latestKey] = [
                ...new Set([
                    ...firstSignatures,
                    ...currentAggregated[config.latestKey],
                ]),
            ].slice(0, 20);
        }

        cursor = data.nextPageToken;
        pagesChecked++;

        currentAggregated.scanCursors = {
            ...(currentAggregated.scanCursors || {}),
            [scanType]: isIncremental ? null : cursor,
        };
        currentAggregated.scanComplete = {
            ...(currentAggregated.scanComplete || {}),
            [scanType]: isIncremental || !cursor,
        };

        const scanComplete = currentAggregated.scanComplete || {};
        const isFullyScanned = Object.keys(AVATAR_INVENTORY_SCAN_TYPES).every(
            (key) => !!scanComplete[key],
        );

        await indexedDb.set(AVATAR_INVENTORY_STORE, userId, {
            ...existingData,
            ...currentAggregated,
            isFullyScanned,
            isScanning: !isIncremental && !isFullyScanned,
            [isIncremental ? 'lastIncrementalCheck' : 'lastFullScan']:
                Date.now(),
        });

        if (!cursor || foundMatch || (isIncremental && pagesChecked >= 5))
            break;
        await new Promise((r) => setTimeout(r, AVATAR_INVENTORY_REQUEST_DELAY));
    }

    if (isIncremental && !foundMatch && pagesChecked >= 5) {
        currentAggregated.scanCursors = {
            ...(currentAggregated.scanCursors || {}),
            [scanType]: null,
        };
        currentAggregated.scanComplete = {
            ...(currentAggregated.scanComplete || {}),
            [scanType]: false,
        };
        return runAvatarInventoryLoopForType(
            userId,
            existingData,
            currentAggregated,
            scanType,
            config,
            false,
        );
    }

    return currentAggregated;
}

function scanAvatarInventory(userId) {
    legacyMigration ??= indexedDb.migrateFromChromeStorage(
        LEGACY_AVATAR_INVENTORY_DATA_KEY,
        AVATAR_INVENTORY_STORE,
    );

    return legacyMigration
        .then(() =>
            runExclusiveScan(`rovalra-avatar-inventory-scan-${userId}`, () =>
                runAvatarInventoryScan(userId),
            ),
        )
        .catch((error) =>
            console.warn('RoValra: Avatar inventory scan failed', error),
        );
}

export function initAvatarInventoryTracking() {
    getAuthenticatedUserId().then((userId) => {
        if (!userId) return;
        userId = String(userId);

        scanAvatarInventory(userId);

        if (avatarInventoryScanUserId === userId) return;
        clearInterval(avatarInventoryInterval);

        avatarInventoryScanUserId = userId;
        avatarInventoryInterval = setInterval(
            () => scanAvatarInventory(userId),
            AVATAR_INVENTORY_REFRESH_DURATION,
        );
    });
}
