// Gets the user id of the authed user
import { callRobloxApiJson } from './api.js';
import { get as getCache, set as setCache } from './storage/cacheHandler.js';

function waitForDom() {
    return new Promise((resolve) => {
        if (document.readyState !== 'loading') {
            resolve();
        } else {
            document.addEventListener('DOMContentLoaded', resolve, {
                once: true,
            });
        }
    });
}

let inMemoryAuthenticatedUserId = null;
let isScrapingInProgress = false;
let scrapingPromise = null;

async function scrapeAndCacheId() {
    if (isScrapingInProgress && scrapingPromise) {
        return scrapingPromise;
    }

    isScrapingInProgress = true;
    scrapingPromise = (async () => {
        try {
            const meta = document.querySelector('meta[name="user-data"]');
            const actualId = meta
                ? parseInt(meta.getAttribute('data-userid'), 10)
                : null;

            if (actualId !== null && actualId !== inMemoryAuthenticatedUserId) {
                inMemoryAuthenticatedUserId = actualId;
                await chrome.storage.local.set({
                    rovalra_authed_user_id: actualId,
                });
            }

            return actualId;
        } finally {
            isScrapingInProgress = false;
            scrapingPromise = null;
        }
    })();

    return scrapingPromise;
}

export async function getAuthenticatedUserId(refresh = false) {
    if (refresh) {
        await waitForDom();
        const refreshedId = await scrapeAndCacheId();

        if (refreshedId !== null) return refreshedId;
    }

    if (inMemoryAuthenticatedUserId !== null) {
        if (document.readyState !== 'loading' && !isScrapingInProgress) {
            scrapeAndCacheId();
        } else if (document.readyState === 'loading' && !isScrapingInProgress) {
            document.addEventListener(
                'DOMContentLoaded',
                () => scrapeAndCacheId(),
                { once: true },
            );
        }
        return inMemoryAuthenticatedUserId;
    }

    const storage = await chrome.storage.local.get('rovalra_authed_user_id');
    const cachedId = storage.rovalra_authed_user_id;

    if (cachedId !== undefined && cachedId !== null) {
        inMemoryAuthenticatedUserId = cachedId;
        if (document.readyState !== 'loading' && !isScrapingInProgress) {
            scrapeAndCacheId();
        } else if (document.readyState === 'loading' && !isScrapingInProgress) {
            document.addEventListener(
                'DOMContentLoaded',
                () => scrapeAndCacheId(),
                { once: true },
            );
        }
        return cachedId;
    }

    await new Promise((resolve) => {
        document.addEventListener('DOMContentLoaded', resolve, { once: true });
    });

    const scrapedId = await scrapeAndCacheId();

    return scrapedId;
}
export async function getAuthenticatedUsername() {
    await waitForDom();
    const userDataMeta = document.querySelector('meta[name="user-data"]');
    if (userDataMeta) {
        const username = userDataMeta.getAttribute('data-name');
        if (username) {
            return username;
        }
    }
    return null;
}

const VERIFIED_CACHE_SECTION = 'authed_user_verified';

let verifiedPromise = null;

async function fetchAndCacheVerified(userId) {
    const result = await callRobloxApiJson({
        subdomain: 'users',
        endpoint: '/v1/users',
        method: 'POST',
        body: { userIds: [userId] },
    });
    const user = result?.data?.find((u) => u.id === userId);
    const isVerified = user?.hasVerifiedBadge === true;

    await setCache(
        VERIFIED_CACHE_SECTION,
        userId.toString(),
        isVerified,
        'local',
    );
    return isVerified;
}

export async function getAuthenticatedUserVerified(refresh = false) {
    const userId = await getAuthenticatedUserId();
    if (!userId) return false;

    if (!refresh) {
        const cached = await getCache(
            VERIFIED_CACHE_SECTION,
            userId.toString(),
            'local',
        );
        if (typeof cached === 'boolean') return cached;
    }

    if (!verifiedPromise) {
        verifiedPromise = fetchAndCacheVerified(userId)
            .catch((error) => {
                console.warn('RoValra: Failed to fetch verified status', error);
                return false;
            })
            .finally(() => {
                verifiedPromise = null;
            });
    }
    return verifiedPromise;
}
