import { callRobloxApiJson } from '../api.js';

const avatarCache = new Map();

/**
 * Fetch a user's current Avatar V2 data.
 * Concurrent requests for the same user share the same promise.
 *
 * @param {string|number} userId
 * @returns {Promise<Object>}
 */
export function getUserAvatar(userId) {
    if (!userId) throw new Error('userId is required');

    const cacheKey = String(userId);
    if (avatarCache.has(cacheKey)) return avatarCache.get(cacheKey);

    const requestPromise = callRobloxApiJson({
        subdomain: 'avatar',
        endpoint: `/v2/avatar/users/${encodeURIComponent(cacheKey)}/avatar`,
    }).catch((error) => {
        avatarCache.delete(cacheKey);
        throw error;
    });

    avatarCache.set(cacheKey, requestPromise);
    return requestPromise;
}

export function clearUserAvatarCache(userId) {
    if (userId == null) {
        avatarCache.clear();
        return;
    }
    avatarCache.delete(String(userId));
}
