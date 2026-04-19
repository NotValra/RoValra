import { callRobloxApiJson } from '../api.js';

const itemDetailsCache = new Map();

/**
 * Fetches item details from the marketplace-items API for collectible IDs (UUIDs).
 *
 * @param {string} itemId - The collectible ID (UUID) to fetch.
 * @returns {Promise<Object>} - A promise resolving to the item details.
 */
export function getMarketplaceItemDetails(itemId) {
    if (!itemId) throw new Error('itemId is required');

    const key = `marketplace|${itemId}`;

    if (itemDetailsCache.has(key)) {
        return itemDetailsCache.get(key);
    }

    const requestPromise = callRobloxApiJson({
        subdomain: 'apis',
        endpoint: '/marketplace-items/v1/items/details',
        method: 'POST',
        body: { itemIds: [itemId] },
    })
        .then((response) => {
            return response;
        })
        .catch((error) => {
            itemDetailsCache.delete(key);
            throw error;
        });

    itemDetailsCache.set(key, requestPromise);
    return requestPromise;
}

/**
 * Fetches item details from the catalog API, caching the result in memory.
 *
 * @param {string|number} itemId - The ID of the item to fetch.
 * @param {string} [itemType] - The type of the item ('Asset', 'Bundle', or 'GamePass').
 * @returns {Promise<Object>} - A promise resolving to the item details.
 */
export function getItemDetails(itemId, itemType) {
    if (!itemId) throw new Error('itemId is required');

    if (
        typeof itemId === 'string' &&
        itemId.includes('-') &&
        itemId.length === 36
    ) {
        return getMarketplaceItemDetails(itemId).then((data) =>
            Array.isArray(data) ? data[0] : data,
        );
    }

    if (!itemType)
        throw new Error('itemType is required (Asset, Bundle, or GamePass)');

    const key = `${itemId}|${itemType}`;

    if (itemDetailsCache.has(key)) {
        return itemDetailsCache.get(key);
    }

    if (itemType === 'GamePass') {
        const requestPromise = callRobloxApiJson({
            subdomain: 'apis',
            endpoint: `/game-passes/v1/game-passes/${itemId}/details`,
            method: 'GET',
        }).catch((error) => {
            itemDetailsCache.delete(key);
            throw error;
        });
        itemDetailsCache.set(key, requestPromise);
        return requestPromise;
    }

    const requestPromise = callRobloxApiJson({
        subdomain: 'catalog',
        endpoint: `/v1/catalog/items/${itemId}/details?itemType=${itemType}`,
        method: 'GET',
    })
        .then(async (details) => {
            if (details && details.collectibleItemId) {
                try {
                    const marketplaceData = await getMarketplaceItemDetails(
                        details.collectibleItemId,
                    );
                    if (
                        Array.isArray(marketplaceData) &&
                        marketplaceData.length > 0
                    ) {
                        return { ...details, ...marketplaceData[0] };
                    }
                } catch (error) {
                    console.warn(
                        'RoValra: Failed to fetch marketplace details for item',
                        error,
                    );
                }
            }
            return details;
        })
        .catch((error) => {
            itemDetailsCache.delete(key);
            throw error;
        });

    itemDetailsCache.set(key, requestPromise);
    return requestPromise;
}
