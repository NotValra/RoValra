import { callRobloxApi, callRobloxApiJson } from '../../api';
import { getAuthenticatedUserId } from '../../user';
import { settings } from '../../settings/getSettings.js';
import * as indexedDb from '../../storage/indexedDb.js';
import { runExclusiveScan } from './scanLock.js';

const TRANSACTIONS_STORE = 'transactions';
const LEGACY_TRANSACTIONS_DATA_KEY = 'rovalra_transactions_v2';
const LEGACY_TRANSACTION_SCAN_LOCKS_KEY = 'rovalra_transaction_scan_locks';
const TRANSACTIONS_STORAGE_VERSION = 7;
const TRANSACTION_REFRESH_DURATION = 5 * 60 * 1000;
const TRANSACTION_REQUEST_DELAY = 5000;
const TRANSACTION_MAX_INTERNAL_ERRORS = 5;
const TRANSACTION_MAX_INTERNAL_ERROR_DELAY = 60 * 1000;
const TRANSACTION_MAX_INTERNAL_ERROR_RUNS = 3;
const TRANSACTION_MAX_INCREMENTAL_PAGES = 5;
const LATEST_TRANSACTION_HASH_COUNT = 2;

const activeScans = new Set();
let legacyCleanup = null;
let transactionRefreshInterval = null;
let transactionScanUserId = null;

const createEmptyAggregate = () => ({
    totals: { totalSpent: 0, totalTransactions: 0 },
    creators: {},
});

export async function getTransactionData() {
    const userId = await getAuthenticatedUserId();
    if (!userId) return null;

    const currentUserData = await indexedDb.get(TRANSACTIONS_STORE, userId);

    return {
        ...createEmptyAggregate(),
        transactions: {},
        ...(currentUserData || {}),
        isScanning: !!currentUserData?.isScanning,
    };
}

export async function getCachedTransactionData() {
    const userId = await getAuthenticatedUserId();
    if (!userId) return null;

    return indexedDb.get(TRANSACTIONS_STORE, userId);
}

export function onTransactionDataChanged(callback) {
    return indexedDb.onChanged(TRANSACTIONS_STORE, callback);
}

export function clearTransactionData() {
    return indexedDb.clearStore(TRANSACTIONS_STORE);
}

export async function getTransactions() {
    const data = await getTransactionData();
    if (!data) return [];

    return Object.entries(data.transactions || {})
        .map(([id, tx]) => ({ id, ...tx }))
        .sort((a, b) => (b.created || 0) - (a.created || 0));
}

async function getUniverseIdFromPlaceId(placeId) {
    try {
        const response = await callRobloxApiJson({
            subdomain: 'apis',
            endpoint: `/universes/v1/places/${placeId}/universe`,
            useBackground: true,
        });

        if (response && response.universeId) {
            return String(response.universeId);
        }
    } catch (error) {
        console.warn(
            'RoValra: Failed to get universe ID for place',
            placeId,
            error,
        );
    }
    return null;
}

/**
 * Get total spending for a specific game
 * Accepts either Place ID OR Universe ID automatically
 * @param {number|string} id Place ID or Universe ID
 * @returns {Object} Game spending data
 */
export async function getGameSpending(id) {
    const data = await getTransactionData();

    if (!data) {
        return { totalSpent: 0, totalTransactions: 0, isScanning: false };
    }

    id = String(id);
    const isScanning = !!data.isScanning;
    let totalSpent = 0;
    let totalTransactions = 0;
    let gameName = '';

    for (const key in data.creators) {
        const creator = data.creators[key];

        if (creator.games[id]) {
            totalSpent += creator.games[id].totalSpent;
            totalTransactions += creator.games[id].totalTransactions;
            gameName = creator.games[id].name;
        }
    }

    if (totalTransactions > 0) {
        return {
            name: gameName,
            totalSpent,
            totalTransactions,
            isScanning,
        };
    }

    const universeId = await getUniverseIdFromPlaceId(id);

    if (universeId) {
        for (const key in data.creators) {
            const creator = data.creators[key];
            if (creator.games[universeId]) {
                totalSpent += creator.games[universeId].totalSpent;
                totalTransactions +=
                    creator.games[universeId].totalTransactions;
                gameName = creator.games[universeId].name;
            }
        }
    }

    return { name: gameName, totalSpent, totalTransactions, isScanning };
}

/**
 * Get total spending for every game in the cached transaction scan.
 * @returns {Promise<{games: Array, isScanning: boolean}>}
 */
export async function getAllGameSpending() {
    const data = await getTransactionData();
    if (!data) return { games: [], isScanning: false };

    const games = new Map();

    for (const creator of Object.values(data.creators || {})) {
        for (const [id, gameData] of Object.entries(creator.games || {})) {
            const existing = games.get(id) || {
                id,
                name: gameData.name || 'Unknown game',
                totalSpent: 0,
                totalTransactions: 0,
            };

            existing.name = gameData.name || existing.name;
            existing.totalSpent += Number(gameData.totalSpent) || 0;
            existing.totalTransactions +=
                Number(gameData.totalTransactions) || 0;
            games.set(id, existing);
        }
    }

    return { games: [...games.values()], isScanning: data.isScanning };
}

export async function getTotalSpent() {
    const data = await getTransactionData();
    return data?.totals?.totalSpent || 0;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getRateLimitDelay(response) {
    const retryAfter = response.headers.get('retry-after');
    if (retryAfter) {
        const retryAfterSeconds = Number(retryAfter);
        if (Number.isFinite(retryAfterSeconds)) {
            return Math.max(0, retryAfterSeconds * 1000) + 1000;
        }

        const retryAt = Date.parse(retryAfter);
        if (Number.isFinite(retryAt)) {
            return Math.max(0, retryAt - Date.now()) + 1000;
        }
    }

    const remaining = Number(response.headers.get('x-ratelimit-remaining'));
    const resetValue = Number(response.headers.get('x-ratelimit-reset'));

    if (
        Number.isFinite(remaining) &&
        remaining <= 1 &&
        Number.isFinite(resetValue) &&
        resetValue > 0
    ) {
        return (
            (resetValue > 1e9
                ? Math.max(0, resetValue * 1000 - Date.now())
                : resetValue * 1000) + 1000
        );
    }

    return 0;
}

async function fetchTransactionsPage(userId, cursor = null) {
    let endpoint = `/transaction-records/v1/users/${userId}/transactions?limit=100&transactionType=Purchase&itemPricingType=PaidAndLimited`;
    if (cursor) endpoint += `&cursor=${encodeURIComponent(cursor)}`;

    while (true) {
        try {
            const response = await callRobloxApi({
                useBackground: true,
                noCache: true,
                subdomain: 'apis',
                endpoint,
            });

            if (response.status === 429) {
                await sleep(getRateLimitDelay(response) || 2000);
                continue;
            }

            if (response.status >= 500 && response.status < 600) {
                return {
                    internalError: true,
                    status: response.status,
                    rateLimitDelay: getRateLimitDelay(response),
                };
            }

            if (!response.ok) return null;
            return {
                body: await response.json(),
                rateLimitDelay: getRateLimitDelay(response),
            };
        } catch (error) {
            console.error('RoValra: Failed to fetch transactions page', error);
            return null;
        }
    }
}

function processTransaction(transaction) {
    const id = transaction?.purchaseToken || transaction?.idHash;
    if (!id || !transaction.currency || !transaction.agent) return null;

    const created = Date.parse(transaction.created);
    const details = transaction.details;
    const place = details?.place;

    return {
        id: String(id),
        amount: Math.abs(transaction.currency.amount || 0),
        created: Number.isFinite(created) ? created : null,
        creatorId: String(transaction.agent.id || 0),
        creatorType: transaction.agent.type || 'User',
        creatorName: transaction.agent.name || 'Unknown',
        universeId: place?.universeId ? String(place.universeId) : null,
        gameName: place?.name || null,
        itemId: details?.id ? String(details.id) : null,
        itemName: details?.name || null,
        itemType: details?.type || null,
    };
}

function aggregateTransactions(transactions) {
    const aggregated = createEmptyAggregate();

    for (const tx of Object.values(transactions || {})) {
        aggregated.totals.totalSpent += tx.amount;
        aggregated.totals.totalTransactions += 1;

        if (!aggregated.creators[tx.creatorId]) {
            aggregated.creators[tx.creatorId] = {
                name: tx.creatorName,
                type: tx.creatorType,
                totalSpent: 0,
                totalTransactions: 0,
                games: {},
            };
        }

        const creator = aggregated.creators[tx.creatorId];
        creator.totalSpent += tx.amount;
        creator.totalTransactions += 1;

        if (tx.universeId) {
            if (!creator.games[tx.universeId]) {
                creator.games[tx.universeId] = {
                    name: tx.gameName,
                    totalSpent: 0,
                    totalTransactions: 0,
                };
            }

            const game = creator.games[tx.universeId];
            game.name = game.name || tx.gameName;
            game.totalSpent += tx.amount;
            game.totalTransactions += 1;
        }
    }

    return aggregated;
}

async function runTransactionScan(userId) {
    userId = String(userId);

    if (!(await settings.TotalSpentGamesEnabled)) return;
    if (activeScans.has(userId)) return;
    activeScans.add(userId);

    try {
        const userData =
            (await indexedDb.get(TRANSACTIONS_STORE, userId)) || {};

        if (userData.storageVersion !== TRANSACTIONS_STORAGE_VERSION) {
            await runTransactionLoop(
                userId,
                {
                    ...createEmptyAggregate(),
                    transactions: {},
                    latestTransactionHashes: [],
                    scanCursor: null,
                },
                false,
            );
            return;
        }

        if (!userData.isFullyScanned) {
            await runTransactionLoop(userId, userData, false);
            return;
        }

        const lastCheck =
            userData.lastIncrementalCheck || userData.lastFullScan || 0;
        if (Date.now() - lastCheck < TRANSACTION_REFRESH_DURATION) return;

        await runTransactionLoop(userId, userData, true);
    } finally {
        activeScans.delete(userId);
    }
}

async function runTransactionLoop(userId, existingData, isIncremental) {
    let cursor = isIncremental ? null : existingData.scanCursor || null;
    let pagesChecked = 0;
    let foundMatch = false;
    let emptyPageCount = 0;
    let internalErrorCount = 0;
    let internalErrorCursor = existingData.internalErrorCursor ?? null;
    let internalErrorRuns = existingData.internalErrorRuns || 0;
    const transactions = { ...(existingData.transactions || {}) };
    let latestTransactionHashes = existingData.latestTransactionHashes || [];
    let aggregated = {
        totals: existingData.totals || createEmptyAggregate().totals,
        creators: existingData.creators || {},
    };

    const persistTransactionData = async (scanFinished) => {
        if (isIncremental || scanFinished) {
            aggregated = aggregateTransactions(transactions);
        }

        await indexedDb.set(TRANSACTIONS_STORE, userId, {
            ...existingData,
            ...aggregated,
            transactions,
            latestTransactionHashes,
            scanCursor: isIncremental ? null : cursor,
            internalErrorCursor: isIncremental ? null : internalErrorCursor,
            internalErrorRuns: isIncremental ? 0 : internalErrorRuns,
            isFullyScanned: isIncremental || scanFinished,
            isScanning: !isIncremental && !scanFinished,
            storageVersion: TRANSACTIONS_STORAGE_VERSION,
            [isIncremental ? 'lastIncrementalCheck' : 'lastFullScan']:
                Date.now(),
        });
    };

    while (true) {
        const page = await fetchTransactionsPage(userId, cursor);
        if (!page) break;

        if (page.internalError) {
            internalErrorCount++;

            if (internalErrorCount >= TRANSACTION_MAX_INTERNAL_ERRORS) {
                if (isIncremental) break;

                internalErrorRuns =
                    internalErrorCursor === cursor ? internalErrorRuns + 1 : 1;
                internalErrorCursor = cursor;
                const giveUp =
                    internalErrorRuns >= TRANSACTION_MAX_INTERNAL_ERROR_RUNS;
                console.warn(
                    giveUp
                        ? 'RoValra: Treating repeated Roblox transaction internal errors as end of scan'
                        : 'RoValra: Roblox transaction internal errors, resuming scan later',
                    {
                        userId,
                        cursor,
                        status: page.status,
                        internalErrorRuns,
                    },
                );
                await persistTransactionData(giveUp);
                break;
            }

            await sleep(
                Math.max(
                    Math.min(
                        TRANSACTION_REQUEST_DELAY *
                            2 ** (internalErrorCount - 1),
                        TRANSACTION_MAX_INTERNAL_ERROR_DELAY,
                    ),
                    page.rateLimitDelay || 0,
                ),
            );
            continue;
        }

        internalErrorCount = 0;
        internalErrorCursor = null;
        internalErrorRuns = 0;
        const data = page.body;

        if (!data.data || data.data.length === 0) {
            emptyPageCount++;
            cursor = data.nextPageCursor;
            if (emptyPageCount >= 5 || !cursor) {
                await persistTransactionData(true);
                break;
            }
            continue;
        }
        emptyPageCount = 0;

        const processedPage = data.data.map(processTransaction).filter(Boolean);

        for (const processed of processedPage) {
            if (
                isIncremental &&
                latestTransactionHashes.includes(processed.id)
            ) {
                foundMatch = true;
                break;
            }

            const { id, ...record } = processed;
            transactions[id] = record;
        }

        if (pagesChecked === 0) {
            latestTransactionHashes = [
                ...new Set([
                    ...processedPage
                        .slice(0, LATEST_TRANSACTION_HASH_COUNT)
                        .map((tx) => tx.id),
                    ...latestTransactionHashes,
                ]),
            ].slice(0, LATEST_TRANSACTION_HASH_COUNT);
        }

        cursor = data.nextPageCursor;
        pagesChecked++;
        await persistTransactionData(!cursor);

        if (
            !cursor ||
            foundMatch ||
            (isIncremental && pagesChecked >= TRANSACTION_MAX_INCREMENTAL_PAGES)
        )
            break;
        await sleep(Math.max(TRANSACTION_REQUEST_DELAY, page.rateLimitDelay));
    }

    if (
        isIncremental &&
        !foundMatch &&
        pagesChecked >= TRANSACTION_MAX_INCREMENTAL_PAGES
    ) {
        await runTransactionLoop(
            userId,
            { ...existingData, transactions, latestTransactionHashes },
            false,
        );
    }
}

function scanTransactions(userId) {
    legacyCleanup ??= chrome.storage.local
        .remove([
            LEGACY_TRANSACTIONS_DATA_KEY,
            LEGACY_TRANSACTION_SCAN_LOCKS_KEY,
        ])
        .catch(() => {});

    return legacyCleanup
        .then(() =>
            runExclusiveScan(`rovalra-transaction-scan-${userId}`, () =>
                runTransactionScan(userId),
            ),
        )
        .catch((error) =>
            console.warn('RoValra: Transaction scan failed', error),
        );
}

export function initTransactionsTracking() {
    getAuthenticatedUserId().then((userId) => {
        if (!userId) return;
        userId = String(userId);

        scanTransactions(userId);

        if (transactionScanUserId === userId) return;
        clearInterval(transactionRefreshInterval);

        transactionScanUserId = userId;
        transactionRefreshInterval = setInterval(
            () => scanTransactions(userId),
            TRANSACTION_REFRESH_DURATION,
        );
    });
}
