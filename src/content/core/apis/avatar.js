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

/**
 * Fetch every editable outfit belonging to a user, following pagination.
 *
 * @param {string|number} userId
 * @returns {Promise<Array<{id: number, name: string}>>}
 */
export async function getUserOutfits(userId) {
    if (!userId) throw new Error('userId is required');

    const outfits = [];
    let paginationToken = null;

    // The page size is capped at 50, so keep paging while a token comes back.
    // The loop bound stops a malformed response from spinning forever.
    for (let page = 0; page < 20; page += 1) {
        const params = new URLSearchParams({
            outfitType: '1',
            page: '1',
            itemsPerPage: '50',
            isEditable: 'true',
        });
        if (paginationToken) params.set('paginationToken', paginationToken);

        const data = await callRobloxApiJson({
            subdomain: 'avatar',
            endpoint: `/v2/avatar/users/${encodeURIComponent(String(userId))}/outfits?${params}`,
        });

        if (Array.isArray(data?.data)) outfits.push(...data.data);

        paginationToken = data?.paginationToken || null;
        if (!paginationToken) break;
    }

    return outfits;
}

const outfitDetailsCache = new Map();

/**
 * Read what an outfit is made of. Held onto so it can be fetched ahead of time
 * and the write path does not have to wait on it.
 *
 * @param {string|number} outfitId
 * @returns {Promise<Object>}
 */
export function getOutfitDetails(outfitId) {
    const key = String(outfitId);
    if (outfitDetailsCache.has(key)) return outfitDetailsCache.get(key);

    const request = callRobloxApiJson({
        subdomain: 'avatar',
        endpoint: `/v3/outfits/${encodeURIComponent(key)}/details`,
    }).catch((error) => {
        outfitDetailsCache.delete(key);
        throw error;
    });

    outfitDetailsCache.set(key, request);
    return request;
}

/**
 * Wear a saved outfit, writing each part of the avatar the outfit defines.
 *
 * @param {string|number} outfitId
 * @param {string|null} currentAvatarType Skips the R6/R15 write when it already
 *   matches, which keeps the whole thing to a single round trip.
 * @returns {Promise<boolean>} Whether every write succeeded.
 */
export async function applyOutfit(outfitId, currentAvatarType = null) {
    const details = await getOutfitDetails(outfitId);

    // Switching between R6 and R15 changes what can be worn, so when the type
    // does have to change it is settled first and the rest written against it.
    if (
        details?.playerAvatarType &&
        details.playerAvatarType !== currentAvatarType
    ) {
        const typeResponse = await callRobloxApi({
            subdomain: 'avatar',
            endpoint: '/v1/avatar/set-player-avatar-type',
            method: 'POST',
            body: { playerAvatarType: details.playerAvatarType },
            noCache: true,
        });

        if (!typeResponse.ok) return false;
    }

    const requests = [];

    if (details?.bodyColor3s) requests.push(setBodyColors(details.bodyColor3s));

    if (details?.assets) {
        requests.push(
            callRobloxApi({
                subdomain: 'avatar',
                endpoint: '/v2/avatar/set-wearing-assets',
                method: 'POST',
                body: { assets: details.assets },
                noCache: true,
            }),
        );
    }

    if (details?.scale) {
        requests.push(
            callRobloxApi({
                subdomain: 'avatar',
                endpoint: '/v1/avatar/set-scales',
                method: 'POST',
                body: details.scale,
                noCache: true,
            }),
        );
    }

    if (requests.length === 0) return Boolean(details?.playerAvatarType);

    const responses = await Promise.all(requests);
    return responses.every((response) => response.ok);
}
