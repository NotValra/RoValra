// Firefox only. Added to the Firefox build by scripts/build-firefox.js and loaded
// before background.js.
//
// Firefox only allows chrome.permissions.request() from a user input handler on an
// extension page. RoValra requests optional permissions from the background script
// (when a setting is toggled on the settings page), which Chrome allows but Firefox
// rejects. When that happens, this opens a small extension window where the user
// clicks Allow, which makes the request with real user input, and hands the result
// back to the original caller. It also makes permissions.remove() behave like
// Chrome for regular permissions (see below).
(() => {
    const permissionsApi = chrome.permissions;
    const nativeRequest = permissionsApi.request.bind(permissionsApi);
    const nativeContains = permissionsApi.contains.bind(permissionsApi);
    const pendingRequests = new Map();

    const resolvePending = (id, granted) => {
        const pending = pendingRequests.get(id);
        if (!pending) return;
        pendingRequests.delete(id);
        pending.resolve(granted);
        if (pending.windowId !== undefined) {
            chrome.windows.remove(pending.windowId).catch(() => {});
        }
    };

    const requestFromExtensionPage = (permissions) =>
        new Promise((resolve) => {
            const id = crypto.randomUUID();
            pendingRequests.set(id, { resolve });
            const params = new URLSearchParams({
                id,
                permissions: JSON.stringify(permissions),
            });
            chrome.windows
                .create({
                    url: chrome.runtime.getURL(
                        `firefox-permission-request.html?${params}`,
                    ),
                    type: 'popup',
                    width: 440,
                    height: 300,
                })
                .then((createdWindow) => {
                    const pending = pendingRequests.get(id);
                    if (pending) pending.windowId = createdWindow.id;
                })
                .catch(() => resolvePending(id, false));
        });

    chrome.windows.onRemoved.addListener((windowId) => {
        for (const [id, pending] of pendingRequests) {
            if (pending.windowId === windowId) resolvePending(id, false);
        }
    });

    chrome.runtime.onMessage.addListener((message) => {
        if (message?.action === 'firefoxPermissionResult') {
            resolvePending(message.id, !!message.granted);
        }
    });

    const request = async (permissions) => {
        const missing = { permissions: [], origins: [] };
        for (const permission of permissions.permissions || []) {
            if (!(await nativeContains({ permissions: [permission] }))) {
                missing.permissions.push(permission);
            }
        }
        for (const origin of permissions.origins || []) {
            if (!(await nativeContains({ origins: [origin] }))) {
                missing.origins.push(origin);
            }
        }
        if (!missing.permissions.length && !missing.origins.length) return true;

        try {
            return await nativeRequest(missing);
        } catch (error) {
            if (!/user input/i.test(String(error?.message))) throw error;
            return requestFromExtensionPage(missing);
        }
    };

    permissionsApi.request = function (permissions, callback) {
        const result = request(permissions || {});
        if (typeof callback !== 'function') return result;
        result.then(
            (granted) => callback(granted),
            (error) => {
                console.warn('RoValra: Permission request failed', error);
                callback(false);
            },
        );
        return undefined;
    };

    const nativeRemove = permissionsApi.remove.bind(permissionsApi);
    const requiredPermissions = new Set(
        chrome.runtime.getManifest().permissions || [],
    );

    const remove = async (permissions) => {
        const removable = {
            permissions: (permissions.permissions || []).filter(
                (permission) => !requiredPermissions.has(permission),
            ),
            origins: permissions.origins || [],
        };
        if (!removable.permissions.length && !removable.origins.length) {
            return false;
        }
        return nativeRemove(removable);
    };

    permissionsApi.remove = function (permissions, callback) {
        const result = remove(permissions || {});
        if (typeof callback !== 'function') return result;
        result.then(
            (removed) => callback(removed),
            (error) => {
                console.warn('RoValra: Permission removal failed', error);
                callback(false);
            },
        );
        return undefined;
    };
})();
