import {
    BOOKMARKS_KEY,
    applyBookmarkOperation,
} from '../shared/gameBookmarks.js';

let writes = Promise.resolve();

export function updateGameBookmarks(operation) {
    const result = writes.then(async () => {
        const data = await chrome.storage.local.get(BOOKMARKS_KEY);
        if (data[BOOKMARKS_KEY]?.version > 1)
            throw new Error('Unsupported bookmark version');
        const state = applyBookmarkOperation(data[BOOKMARKS_KEY], operation);
        await chrome.storage.local.set({ [BOOKMARKS_KEY]: state });
        return state;
    });
    writes = result.catch(() => {});
    return result;
}
