import { getAuthenticatedUserId } from '../../user';
import { callRobloxApi } from '../../api.js';
import * as indexedDb from '../../storage/indexedDb.js';
import { runExclusiveScan } from './scanLock.js';

const BADGES_STORE = 'badges';
const LEGACY_BADGES_DATA_KEY = 'rovalra_badges_v1';
const BADGES_STORAGE_VERSION = 2;
const BADGE_REFRESH_DURATION = 5 * 60 * 1000;
const BADGE_FULL_REFRESH_DURATION = 30 * 60 * 1000;
const BADGE_REQUEST_DELAY = 150;

const activeScans = new Set();
let legacyMigration = null;
let badgeRefreshInterval = null;
let badgeFullScanInterval = null;
let badgeScanUserId = null;

export async function getBadgeData() {
    const userId = await getAuthenticatedUserId();
    if (!userId) return null;

    const currentUserData = await indexedDb.get(BADGES_STORE, userId);

    return {
        totals: { totalBadges: 0 },
        badges: {},
        places: {},
        ...(currentUserData || {}),
        isScanning: !!currentUserData?.isScanning,
    };
}

export async function getCachedBadgeData() {
    const userId = await getAuthenticatedUserId();
    if (!userId) return null;

    return indexedDb.get(BADGES_STORE, userId);
}

export function onBadgeDataChanged(callback) {
    return indexedDb.onChanged(BADGES_STORE, callback);
}

export function clearBadgeData() {
    return indexedDb.clearStore(BADGES_STORE);
}

export async function getGameBadges(placeId) {
    const data = await getBadgeData();
    if (!data) return { badges: [], totalBadges: 0, isScanning: false };

    const badgeIds = data.places?.[String(placeId)]?.badgeIds || [];
    const badges = badgeIds
        .map((badgeId) => data.badges?.[String(badgeId)])
        .filter(Boolean);

    return {
        badges,
        totalBadges: badges.length,
        isScanning: !!data.isScanning,
    };
}

export async function hasBadge(badgeId) {
    const data = await getBadgeData();
    return !!data?.badges?.[String(badgeId)];
}

async function fetchBadgesPage(userId, cursor = null) {
    let endpoint = `/v1/users/${userId}/badges?limit=100&sortOrder=Desc`;
    if (cursor) endpoint += `&cursor=${encodeURIComponent(cursor)}`;

    while (true) {
        try {
            const response = await callRobloxApi({
                useBackground: true,
                noCache: true,
                subdomain: 'badges',
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
            console.error('RoValra: Failed to fetch badges page', error);
            return null;
        }
    }
}

function processBadge(badge) {
    const badgeId = badge?.id;
    const placeId = badge?.awarder?.id;

    if (!badgeId || !placeId || badge?.enabled !== false) return null;

    return {
        badgeId: String(badgeId),
        placeId: String(placeId),
    };
}

function removeBadgeFromAggregated(aggregated, badgeId, placeId) {
    delete aggregated.badges[badgeId];

    const badgeIds = aggregated.places?.[placeId]?.badgeIds;
    if (!badgeIds) return;

    aggregated.places[placeId].badgeIds = badgeIds.filter(
        (id) => id !== badgeId,
    );

    if (aggregated.places[placeId].badgeIds.length === 0) {
        delete aggregated.places[placeId];
    }
}

function mergeBadgesIntoAggregated(existingAggregated, rawBadges) {
    const updated = existingAggregated || {
        totals: { totalBadges: 0 },
        badges: {},
        places: {},
    };

    updated.totals = updated.totals || { totalBadges: 0 };
    updated.badges = updated.badges || {};
    updated.places = updated.places || {};

    rawBadges.forEach((badge) => {
        const rawBadgeId = badge?.id ? String(badge.id) : null;
        const rawPlaceId = badge?.awarder?.id ? String(badge.awarder.id) : null;

        if (rawBadgeId && rawPlaceId && badge?.enabled !== false) {
            removeBadgeFromAggregated(updated, rawBadgeId, rawPlaceId);
            return;
        }

        const processed = processBadge(badge);
        if (!processed) return;

        const { badgeId, placeId } = processed;
        const isNewBadge = !updated.badges[badgeId];

        updated.badges[badgeId] = processed;

        if (!updated.places[placeId]) {
            updated.places[placeId] = { badgeIds: [] };
        }

        if (!updated.places[placeId].badgeIds.includes(badgeId)) {
            updated.places[placeId].badgeIds.push(badgeId);
        }

        if (isNewBadge) {
            updated.totals.totalBadges += 1;
        }
    });

    updated.totals.totalBadges = Object.keys(updated.badges).length;

    return updated;
}

async function runBadgeScan(userId, options = {}) {
    userId = String(userId);
    const forceFullScan = !!options.forceFullScan;

    if (activeScans.has(userId)) return;
    activeScans.add(userId);

    try {
        const userData = (await indexedDb.get(BADGES_STORE, userId)) || {};
        const needsStorageMigration =
            userData.storageVersion !== BADGES_STORAGE_VERSION;

        const now = Date.now();
        if (userData.isFullyScanned && !needsStorageMigration) {
            const lastFullBadgeCheck =
                userData.lastFullBadgeCheck || userData.lastFullScan || 0;
            const isFullBadgeCheckDue =
                now - lastFullBadgeCheck >= BADGE_FULL_REFRESH_DURATION;

            if (forceFullScan && !isFullBadgeCheckDue) return;

            if (forceFullScan || isFullBadgeCheckDue) {
                await runBadgeLoop(userId, userData, false, {
                    resetCursor: true,
                    timestampKey: 'lastFullBadgeCheck',
                });
                return;
            }

            const lastCheck =
                userData.lastIncrementalCheck || userData.lastFullScan || 0;
            if (now - lastCheck < BADGE_REFRESH_DURATION) return;

            await runBadgeLoop(userId, userData, true);
        } else {
            await runBadgeLoop(
                userId,
                needsStorageMigration
                    ? {
                          ...userData,
                          totals: { totalBadges: 0 },
                          badges: {},
                          places: {},
                          scanCursor: null,
                      }
                    : userData,
                false,
            );
        }
    } finally {
        activeScans.delete(userId);
    }
}

async function runBadgeLoop(userId, existingData, isIncremental, options = {}) {
    let cursor =
        isIncremental || options.resetCursor
            ? null
            : existingData.scanCursor || null;
    let pagesChecked = 0;
    let foundMatch = false;
    let emptyPageCount = 0;
    const seenBadgeIds = new Set();

    let currentAggregated = {
        totals: existingData.totals || { totalBadges: 0 },
        badges: existingData.badges || {},
        places: existingData.places || {},
        latestBadgeIds: existingData.latestBadgeIds || [],
    };

    while (true) {
        const data = await fetchBadgesPage(userId, cursor);
        if (!data) break;

        if (!data.data || data.data.length === 0) {
            emptyPageCount++;
            if (emptyPageCount >= 5 || !data.nextPageCursor) break;
            cursor = data.nextPageCursor;
            continue;
        }
        emptyPageCount = 0;

        const newBatch = [];
        for (const badge of data.data) {
            const badgeId = badge?.id ? String(badge.id) : null;
            if (!badgeId || seenBadgeIds.has(badgeId)) continue;
            seenBadgeIds.add(badgeId);

            if (
                isIncremental &&
                currentAggregated.latestBadgeIds.includes(badgeId)
            ) {
                foundMatch = true;
                break;
            }

            newBatch.push(badge);
        }

        currentAggregated = mergeBadgesIntoAggregated(
            currentAggregated,
            newBatch,
        );

        if (pagesChecked === 0) {
            const firstBadgeIds = data.data
                .map((badge) => (badge?.id ? String(badge.id) : null))
                .filter(Boolean)
                .slice(0, 10);

            currentAggregated.latestBadgeIds = [
                ...new Set([
                    ...firstBadgeIds,
                    ...currentAggregated.latestBadgeIds,
                ]),
            ].slice(0, 10);
        }

        cursor = data.nextPageCursor;
        pagesChecked++;

        const timestampKey =
            options.timestampKey ||
            (isIncremental ? 'lastIncrementalCheck' : 'lastFullScan');

        await indexedDb.set(BADGES_STORE, userId, {
            ...existingData,
            ...currentAggregated,
            latestBadgeId: currentAggregated.latestBadgeIds[0],
            scanCursor: isIncremental ? null : cursor,
            isFullyScanned: isIncremental || !cursor,
            isScanning: !isIncremental && !!cursor,
            storageVersion: BADGES_STORAGE_VERSION,
            [timestampKey]: Date.now(),
        });

        if (!cursor || foundMatch || (isIncremental && pagesChecked >= 10))
            break;
        await new Promise((r) => setTimeout(r, BADGE_REQUEST_DELAY));
    }

    if (isIncremental && !foundMatch && pagesChecked >= 10) {
        await runBadgeLoop(userId, currentAggregated, false);
    }
}

function scanBadges(userId, options = {}) {
    legacyMigration ??= indexedDb.migrateFromChromeStorage(
        LEGACY_BADGES_DATA_KEY,
        BADGES_STORE,
    );

    return legacyMigration
        .then(() =>
            runExclusiveScan(`rovalra-badge-scan-${userId}`, () =>
                runBadgeScan(userId, options),
            ),
        )
        .catch((error) => console.warn('RoValra: Badge scan failed', error));
}

export function initBadgesTracking() {
    getAuthenticatedUserId().then((userId) => {
        if (!userId) return;
        userId = String(userId);

        scanBadges(userId);

        if (badgeScanUserId === userId) return;
        clearInterval(badgeRefreshInterval);
        clearInterval(badgeFullScanInterval);

        badgeScanUserId = userId;
        badgeRefreshInterval = setInterval(
            () => scanBadges(userId),
            BADGE_REFRESH_DURATION,
        );
        badgeFullScanInterval = setInterval(
            () => scanBadges(userId, { forceFullScan: true }),
            BADGE_FULL_REFRESH_DURATION,
        );
    });
}
