import { callRobloxApiJson } from '../../api';
import { getAuthenticatedUserId } from '../../user';

const TRANSACTIONS_DATA_KEY = 'rovalra_transactions_data';

export async function getTransactionData() {
    const userId = await getAuthenticatedUserId();
    if (!userId) return null;

    const result = await new Promise((resolve) =>
        chrome.storage.local.get([TRANSACTIONS_DATA_KEY], resolve),
    );

    const allUsersTransactions = result[TRANSACTIONS_DATA_KEY] || {};
    const currentUserData = allUsersTransactions[userId];

    return {
        totals: { totalSpent: 0, totalTransactions: 0 },
        creators: {},
        ...(currentUserData || {}),
        isScanning: !!currentUserData?.isScanning,
    };
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

            return {
                name: gameName,
                totalSpent,
                totalTransactions,
                isScanning,
            };
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

    return { name: gameName, totalSpent, totalTransactions, isScanning };
}

export async function getTotalSpent() {
    const data = await getTransactionData();
    return data?.totals?.totalSpent || 0;
}

export function initTransactionsTracking() {
    getAuthenticatedUserId().then((userId) => {
        if (!userId) return;
        chrome.runtime.sendMessage({
            action: 'triggerTransactionScan',
            userId,
        });
    });
}
