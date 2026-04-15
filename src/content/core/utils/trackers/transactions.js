import { callRobloxApiJson } from '../../api';
import { getAuthenticatedUserId } from '../../user';

const TRANSACTIONS_DATA_KEY = 'rovalra_transactions_data';
const TRANSACTIONS_CACHE_DURATION = 30 * 60 * 1000;
const INCREMENTAL_REFRESH_DURATION = 1 * 60 * 1000;
const EMPTY_PAGE_CONFIRMATION_COUNT = 3;
const API_REQUEST_DELAY = 5000;
let isScanning = false;

async function fetchTransactionsPage(userId, cursor = null) {
    let endpoint = `/transaction-records/v1/users/${userId}/transactions?limit=100&transactionType=Purchase&itemPricingType=PaidAndLimited`;
    if (cursor) endpoint += `&cursor=${encodeURIComponent(cursor)}`;

    while (true) {
        try {
            return await callRobloxApiJson({
                subdomain: 'apis',
                endpoint: endpoint,
                useBackground: true,
            });
        } catch (error) {
            if (error.status === 429 || error.message?.includes('429')) {
                console.warn(
                    'RoValra: Rate limited while fetching transactions, retrying after 10 seconds...',
                );
                await new Promise((resolve) => setTimeout(resolve, 10000));
                continue;
            }

            console.error('RoValra: Failed to fetch transactions page', error);
            return null;
        }
    }
}

function processTransaction(transaction) {
    const base = {
        amount: Math.abs(transaction.currency.amount),
        purchaseToken: transaction.purchaseToken,
        creatorId: transaction.agent.id,
        creatorType: transaction.agent.type,
        creatorName: transaction.agent.name,
    };

    if (transaction.details.place) {
        return {
            ...base,
            universeId: transaction.details.place.universeId,
            gameName: transaction.details.place.name,
        };
    }
    return base;
}

function aggregateSpending(transactions) {
    const aggregated = {
        totals: {
            totalSpent: 0,
            totalTransactions: 0,
        },
        creators: {},
    };

    transactions.forEach((tx) => {
        aggregated.totals.totalSpent += tx.amount;
        aggregated.totals.totalTransactions += 1;

        const creatorKey = `${tx.creatorId}_${tx.creatorName}`;
        if (!aggregated.creators[creatorKey]) {
            aggregated.creators[creatorKey] = {
                name: tx.creatorName,
                type: tx.creatorType,
                totalSpent: 0,
                totalTransactions: 0,
                games: {},
            };
        }
        const creator = aggregated.creators[creatorKey];
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
            game.totalSpent += tx.amount;
            game.totalTransactions += 1;
        }
    });

    return aggregated;
}
function mergeTransactionsIntoAggregated(existingAggregated, rawTransactions) {
    const updated = existingAggregated || {
        totals: { totalSpent: 0, totalTransactions: 0 },
        creators: {},
    };

    rawTransactions.forEach((tx) => {
        const processed = processTransaction(tx);

        updated.totals.totalSpent += processed.amount;
        updated.totals.totalTransactions += 1;

        const creatorKey = `${processed.creatorId}_${processed.creatorName}`;
        if (!updated.creators[creatorKey]) {
            updated.creators[creatorKey] = {
                name: processed.creatorName,
                type: processed.creatorType,
                totalSpent: 0,
                totalTransactions: 0,
                games: {},
            };
        }

        const creator = updated.creators[creatorKey];
        creator.totalSpent += processed.amount;
        creator.totalTransactions += 1;

        if (processed.universeId) {
            if (!creator.games[processed.universeId]) {
                creator.games[processed.universeId] = {
                    name: processed.gameName,
                    totalSpent: 0,
                    totalTransactions: 0,
                };
            }
            const game = creator.games[processed.universeId];
            game.totalSpent += processed.amount;
            game.totalTransactions += 1;
        }
    });

    return updated;
}
export async function fullScanTransactions(userId) {
    if (isScanning) return null;
    isScanning = true;

    let cursor = null;
    let emptyPageCount = 0;
    let latestPurchaseToken = null;
    let aggregatedData = {
        totals: { totalSpent: 0, totalTransactions: 0 },
        creators: {},
    };

    try {
        const storageResult = await new Promise((resolve) =>
            chrome.storage.local.get([TRANSACTIONS_DATA_KEY], resolve),
        );
        const allUsersTransactions = storageResult[TRANSACTIONS_DATA_KEY] || {};
        const existingData = allUsersTransactions[userId] || {};

        if (existingData.scanCursor && !existingData.isFullyScanned) {
            cursor = existingData.scanCursor;
            aggregatedData = {
                totals: existingData.totals || aggregatedData.totals,
                creators: existingData.creators || aggregatedData.creators,
            };
        }

        while (emptyPageCount < EMPTY_PAGE_CONFIRMATION_COUNT) {
            const data = await fetchTransactionsPage(userId, cursor);

            if (!data) {
                console.error(
                    'RoValra: Transaction page failed permanently, will resume later',
                );
                return null;
            }

            if (!data.data || data.data.length === 0) {
                emptyPageCount++;
                if (data.nextPageCursor) {
                    cursor = data.nextPageCursor;
                    continue;
                }
                break;
            }

            emptyPageCount = 0;

            const latestCheck = await new Promise((resolve) =>
                chrome.storage.local.get([TRANSACTIONS_DATA_KEY], resolve),
            );
            if (latestCheck[TRANSACTIONS_DATA_KEY]?.[userId]?.isFullyScanned) {
                isScanning = false;
                return latestCheck[TRANSACTIONS_DATA_KEY][userId];
            }

            if (data.data.length > 0 && !latestPurchaseToken) {
                latestPurchaseToken = data.data[0].purchaseToken;
            }

            aggregatedData = mergeTransactionsIntoAggregated(
                aggregatedData,
                data.data,
            );

            cursor = data.nextPageCursor;

            const progressUpdate = await new Promise((resolve) =>
                chrome.storage.local.get([TRANSACTIONS_DATA_KEY], resolve),
            );
            const currentAllData = progressUpdate[TRANSACTIONS_DATA_KEY] || {};

            currentAllData[userId] = {
                ...(currentAllData[userId] || {}),
                ...aggregatedData,
                latestPurchaseToken:
                    latestPurchaseToken ||
                    currentAllData[userId]?.latestPurchaseToken ||
                    existingData.latestPurchaseToken,
                scanCursor: cursor,
                isFullyScanned: false,
            };

            await chrome.storage.local.set({
                [TRANSACTIONS_DATA_KEY]: currentAllData,
            });

            if (!cursor) break;

            await new Promise((resolve) =>
                setTimeout(resolve, API_REQUEST_DELAY),
            );
        }

        const finalStorageFetch = await new Promise((resolve) =>
            chrome.storage.local.get([TRANSACTIONS_DATA_KEY], resolve),
        );
        const finalAllData = finalStorageFetch[TRANSACTIONS_DATA_KEY] || {};

        const finalData = {
            ...(finalAllData[userId] || {}),
            ...aggregatedData,
            latestPurchaseToken:
                latestPurchaseToken ||
                finalAllData[userId]?.latestPurchaseToken,
            isFullyScanned: true,
            lastFullScan: Date.now(),
            scanCursor: null,
            partialTransactions: null,
        };

        finalAllData[userId] = finalData;
        await chrome.storage.local.set({
            [TRANSACTIONS_DATA_KEY]: finalAllData,
        });

        return finalData;
    } catch (error) {
        console.error('RoValra: Full transaction scan failed', error);
        return null;
    } finally {
        isScanning = false;
    }
}

export async function incrementalUpdate(userId, existingData) {
    try {
        const data = await fetchTransactionsPage(userId, null);

        if (!data || !data.data) {
            return existingData;
        }

        const newTransactions = [];
        for (const tx of data.data) {
            if (tx.purchaseToken === existingData.latestPurchaseToken) {
                break;
            }
            newTransactions.push(tx);
        }

        if (newTransactions.length === 0) {
            return {
                ...existingData,
                lastIncrementalCheck: Date.now(),
            };
        }

        const processedNew = newTransactions.map(processTransaction);

        const merged = { ...existingData };

        processedNew.forEach((tx) => {
            merged.totals.totalSpent += tx.amount;
            merged.totals.totalTransactions += 1;

            const creatorKey = `${tx.creatorId}_${tx.creatorName}`;
            if (!merged.creators[creatorKey]) {
                merged.creators[creatorKey] = {
                    name: tx.creatorName,
                    type: tx.creatorType,
                    totalSpent: 0,
                    totalTransactions: 0,
                    games: {},
                };
            }
            const creator = merged.creators[creatorKey];
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
                game.totalSpent += tx.amount;
                game.totalTransactions += 1;
            }
        });

        merged.latestPurchaseToken = data.data[0].purchaseToken;
        merged.lastIncrementalCheck = Date.now();

        return merged;
    } catch (error) {
        console.error('RoValra: Incremental transaction update failed', error);
        return existingData;
    }
}

export async function getTransactionData() {
    const userId = await getAuthenticatedUserId();
    if (!userId) return null;

    const result = await new Promise((resolve) =>
        chrome.storage.local.get([TRANSACTIONS_DATA_KEY], resolve),
    );

    const allUsersTransactions = result[TRANSACTIONS_DATA_KEY] || {};
    const currentUserData = allUsersTransactions[userId];

    const now = Date.now();

    if (!currentUserData || !currentUserData.isFullyScanned) {
        const scannedData = await fullScanTransactions(userId);
        if (scannedData) {
            return scannedData;
        }
        return null;
    }

    if (currentUserData.isFullyScanned) {
        const needsFullRefresh =
            now - currentUserData.lastFullScan > TRANSACTIONS_CACHE_DURATION;
        const needsIncrementalUpdate =
            now -
                (currentUserData.lastIncrementalCheck ||
                    currentUserData.lastFullScan) >
            INCREMENTAL_REFRESH_DURATION;

        if (needsFullRefresh) {
            const scannedData = await fullScanTransactions(userId);
            if (scannedData) return scannedData;
        } else if (needsIncrementalUpdate) {
            const updatedData = await incrementalUpdate(
                userId,
                currentUserData,
            );

            const freshStorage = await new Promise((resolve) =>
                chrome.storage.local.get([TRANSACTIONS_DATA_KEY], resolve),
            );
            const latestMap = freshStorage[TRANSACTIONS_DATA_KEY] || {};
            latestMap[userId] = updatedData;

            await chrome.storage.local.set({
                [TRANSACTIONS_DATA_KEY]: latestMap,
            });
            return updatedData;
        }
    }

    return currentUserData;
}

export async function getCachedTransactionData() {
    const userId = await getAuthenticatedUserId();
    if (!userId) return null;

    const result = await new Promise((resolve) =>
        chrome.storage.local.get([TRANSACTIONS_DATA_KEY], resolve),
    );

    const allUsersTransactions = result[TRANSACTIONS_DATA_KEY] || {};
    return allUsersTransactions[userId] || null;
}

/**
 * Convert Place ID to Universe ID
 * @param {number|string} placeId
 * @returns {Promise<string|null>} Universe ID or null
 */
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
        return { totalSpent: 0, totalTransactions: 0 };
    }

    id = String(id);
    let totalSpent = 0;
    let totalTransactions = 0;
    let gameName = '';

    for (const key in data.creators) {
        const creator = data.creators[key];

        if (creator.games[id]) {
            totalSpent += creator.games[id].totalSpent;
            totalTransactions += creator.games[id].totalTransactions;
            gameName = creator.games[id].name;

            return { name: gameName, totalSpent, totalTransactions };
        }
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

                break;
            }
        }
    }

    return { name: gameName, totalSpent, totalTransactions };
}

export async function getTotalSpent() {
    const data = await getTransactionData();
    return data?.totals?.totalSpent || 0;
}

let backgroundScanActive = false;

export function initTransactionsTracking() {
    if (backgroundScanActive) return;
    backgroundScanActive = true;

    getTransactionData();

    setInterval(async () => {
        const userId = await getAuthenticatedUserId();
        if (!userId) return;

        const result = await new Promise((resolve) =>
            chrome.storage.local.get([TRANSACTIONS_DATA_KEY], resolve),
        );

        const allUsersTransactions = result[TRANSACTIONS_DATA_KEY] || {};
        const currentUserData = allUsersTransactions[userId];

        if (currentUserData) {
            if (currentUserData.isFullyScanned) {
                const now = Date.now();
                const needsUpdate =
                    now -
                        (currentUserData.lastIncrementalCheck ||
                            currentUserData.lastFullScan) >
                    INCREMENTAL_REFRESH_DURATION;

                if (needsUpdate) {
                    await getTransactionData();
                }
            } else {
                await fullScanTransactions(userId);
            }
        } else {
            await fullScanTransactions(userId);
        }
    }, INCREMENTAL_REFRESH_DURATION);
}
