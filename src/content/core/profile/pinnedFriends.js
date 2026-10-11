export const PINNED_FRIENDS_STORAGE_KEY = 'rovalra_pinned_friends';

export async function loadPinnedFriends() {
    const result = await chrome.storage.local.get({ [PINNED_FRIENDS_STORAGE_KEY]: [] });
    const stored = result?.[PINNED_FRIENDS_STORAGE_KEY];
    return new Set(Array.isArray(stored) ? stored.map(String) : []);
}

export async function savePinnedFriends(pinnedFriends) {
    await chrome.storage.local.set({ [PINNED_FRIENDS_STORAGE_KEY]: [...pinnedFriends] });
}
