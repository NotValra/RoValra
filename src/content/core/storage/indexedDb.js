function send(action, payload) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action, ...payload }, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            if (response?.error) {
                reject(new Error(response.error));
                return;
            }
            resolve(response?.value ?? null);
        });
    });
}

export function get(store, key) {
    return send('indexedDbGet', { store, key: String(key) });
}

export function set(store, key, value) {
    return send('indexedDbSet', { store, key: String(key), value });
}

export function remove(store, key) {
    return send('indexedDbRemove', { store, key: String(key) });
}

export function clearStore(store) {
    return send('indexedDbClearStore', { store });
}

export async function migrateFromChromeStorage(legacyKey, store) {
    try {
        const storage = await chrome.storage.local.get([legacyKey]);
        const legacyData = storage[legacyKey];
        if (!legacyData) return;

        for (const [key, value] of Object.entries(legacyData)) {
            if (!(await get(store, key))) {
                await set(store, key, value);
            }
        }
    } catch (error) {
        console.warn(`RoValra: Failed to migrate ${legacyKey}`, error);
    } finally {
        await chrome.storage.local.remove(legacyKey).catch(() => {});
    }
}

export function onChanged(store, callback) {
    const listener = (request) => {
        if (request?.action !== 'indexedDbChanged' || request.store !== store)
            return;
        callback(request.key);
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
}
