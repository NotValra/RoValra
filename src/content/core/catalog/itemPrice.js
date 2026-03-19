import { callRobloxApiJson } from '../api.js';

const itemDetailsCache = new Map();

/**
 * Fetches item details from the catalog API, caching the result in memory.
 *
 * @param {string|number} itemId - The ID of the item to fetch.
 * @param {string} itemType - The type of the item ('Asset' or 'Bundle').
 * @returns {Promise<Object>} - A promise resolving to the item details.
 */
export function getItemDetails(itemId, itemType) {
    if (!itemId) throw new Error('itemId is required');
    if (!itemType) throw new Error('itemType is required (Asset or Bundle)');

    const key = `${itemId}|${itemType}`;

    if (itemDetailsCache.has(key)) {
        return itemDetailsCache.get(key);
    }

    const requestPromise = callRobloxApiJson({
        subdomain: 'catalog',
        endpoint: `/v1/catalog/items/${itemId}/details?itemType=${itemType}`,
        method: 'GET',
    }).catch((error) => {
        itemDetailsCache.delete(key);
        throw error;
    });

    itemDetailsCache.set(key, requestPromise);
    return requestPromise;
}
