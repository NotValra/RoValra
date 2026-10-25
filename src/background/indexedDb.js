import Dexie from 'dexie';

const db = new Dexie('rovalra');
db.version(1).stores({
    entries: '[store+key], store',
});

function notifyChange(store, key) {
    chrome.tabs.query({}, (tabs) => {
        for (const tab of tabs || []) {
            chrome.tabs
                .sendMessage(tab.id, {
                    action: 'indexedDbChanged',
                    store,
                    key,
                })
                .catch(() => {});
        }
    });
}

export async function get(store, key) {
    const entry = await db.entries.get([store, String(key)]);
    return entry ? entry.value : null;
}

export async function set(store, key, value) {
    await db.entries.put({ store, key: String(key), value });
    notifyChange(store, String(key));
}

export async function remove(store, key) {
    await db.entries.delete([store, String(key)]);
    notifyChange(store, String(key));
}

export async function clearStore(store) {
    await db.entries.where('store').equals(store).delete();
    notifyChange(store, null);
}

const messageHandlers = {
    indexedDbGet: (request) => get(request.store, request.key),
    indexedDbSet: (request) => set(request.store, request.key, request.value),
    indexedDbRemove: (request) => remove(request.store, request.key),
    indexedDbClearStore: (request) => clearStore(request.store),
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const handler = messageHandlers[request?.action];
    if (!handler) return false;

    handler(request)
        .then((value) => sendResponse({ value: value ?? null }))
        .catch((error) => sendResponse({ error: error.message }));
    return true;
});
