// Gets the user id of the authed user

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

export async function getAuthenticatedUserId() {
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
