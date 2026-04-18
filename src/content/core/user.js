// Gets the user id of the authed user
let cachedAuthenticatedUserId = undefined;
let pendingAuthenticatedUserId = null;

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

export async function getAuthenticatedUserId() {
    if (cachedAuthenticatedUserId !== undefined) {
        return cachedAuthenticatedUserId;
    }

    if (pendingAuthenticatedUserId) {
        return pendingAuthenticatedUserId;
    }

    pendingAuthenticatedUserId = (async () => {
    let cachedId = null;

    try {
        const storage = await chrome.storage.local.get('rovalra_authed_user_id');
        cachedId = storage.rovalra_authed_user_id;
    } catch (error) {
        if (
            error instanceof Error &&
            error.message.includes('Extension context invalidated')
        ) {
            cachedAuthenticatedUserId = null;
            return cachedAuthenticatedUserId;
        }
        throw error;
    }

    const scrapeId = () => {
        const meta = document.querySelector('meta[name="user-data"]');
        const actualId = meta
            ? parseInt(meta.getAttribute('data-userid'), 10)
            : null;

        if (actualId !== cachedId) {
            chrome.storage.local
                .set({ rovalra_authed_user_id: actualId })
                .catch((error) => {
                    if (
                        !(
                            error instanceof Error &&
                            error.message.includes(
                                'Extension context invalidated',
                            )
                        )
                    ) {
                        console.error(
                            'RoValra: Failed to cache authenticated user id.',
                            error,
                        );
                    }
                });
        }
        cachedAuthenticatedUserId = actualId;
        return cachedAuthenticatedUserId;
    };

    if (document.readyState !== 'loading') {
        return scrapeId();
    }

    if (cachedId) {
        document.addEventListener('DOMContentLoaded', scrapeId, { once: true });
        cachedAuthenticatedUserId = cachedId;
        return cachedAuthenticatedUserId;
    }

    await new Promise((resolve) => {
        document.addEventListener('DOMContentLoaded', resolve, { once: true });
    });

    return scrapeId();
    })();

    try {
        return await pendingAuthenticatedUserId;
    } finally {
        pendingAuthenticatedUserId = null;
    }
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
