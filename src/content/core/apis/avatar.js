import { callRobloxApi, callRobloxApiJson } from '../api.js';

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

/**
 * The six body part keys Roblox uses in the Avatar V2 `bodyColor3s` object.
 * The order matches how the parts are listed in the avatar editor.
 */
export const BODY_COLOR_KEYS = [
    'headColor3',
    'torsoColor3',
    'leftArmColor3',
    'rightArmColor3',
    'leftLegColor3',
    'rightLegColor3',
];

/**
 * Read the authenticated user's avatar without going through the shared
 * `getUserAvatar` cache, so callers always see the current state after a write.
 *
 * @param {string|number} userId
 * @returns {Promise<Object>}
 */
export function getCurrentAvatar(userId) {
    if (!userId) throw new Error('userId is required');

    return callRobloxApiJson({
        subdomain: 'avatar',
        endpoint: `/v2/avatar/users/${encodeURIComponent(String(userId))}/avatar`,
        noCache: true,
    });
}

/**
 * Apply body colours to the authenticated user's avatar.
 *
 * @param {Object} bodyColor3s Object keyed by {@link BODY_COLOR_KEYS}.
 * @returns {Promise<Response>}
 */
export function setBodyColors(bodyColor3s) {
    return callRobloxApi({
        subdomain: 'avatar',
        endpoint: '/v2/avatar/set-body-colors',
        method: 'POST',
        body: bodyColor3s,
        noCache: true,
    });
}
