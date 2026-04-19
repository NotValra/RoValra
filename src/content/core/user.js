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

export async function getAuthenticatedUserId() {
    const storage = await chrome.storage.local.get('rovalra_authed_user_id');
    const cachedId = storage.rovalra_authed_user_id;

    const scrapeId = () => {
        const meta = document.querySelector('meta[name="user-data"]');
        const actualId = meta
            ? parseInt(meta.getAttribute('data-userid'), 10)
            : null;

        if (actualId !== cachedId) {
            chrome.storage.local.set({ rovalra_authed_user_id: actualId });
        }
        return actualId;
    };

    if (document.readyState !== 'loading') {
        return scrapeId();
    }

    if (cachedId) {
        document.addEventListener('DOMContentLoaded', scrapeId, { once: true });
        return cachedId;
    }

    await new Promise((resolve) => {
        document.addEventListener('DOMContentLoaded', resolve, { once: true });
    });

    return scrapeId();
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
