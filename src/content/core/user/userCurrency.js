import { callRobloxApiJson } from '../api.js';
import { getAuthenticatedUserId } from '../user.js';

const currencyCache = new Map();

/**
 * Fetches the user's currency (Robux) from the economy API.
 * Caches the result in memory to prevent redundant API calls.
 *
 * @param {string|number} [userId] - The user ID to fetch currency for. If not provided, uses the authenticated user.
 * @returns {Promise<{robux: number}>} - A promise resolving to the user's currency.
 */
export async function getUserCurrency(userId) {
    const targetId = userId || (await getAuthenticatedUserId());

    if (!targetId) {
        throw new Error('User ID is required to fetch currency.');
    }

    const key = String(targetId);

    if (currencyCache.has(key)) {
        return currencyCache.get(key);
    }

    const requestPromise = callRobloxApiJson({
        subdomain: 'economy',
        endpoint: `/v1/users/${targetId}/currency`,
        method: 'GET',
    }).catch((error) => {
        currencyCache.delete(key);
        throw error;
    });

    currencyCache.set(key, requestPromise);
    return requestPromise;
}
