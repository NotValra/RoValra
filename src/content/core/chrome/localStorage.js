/**
 * A wrapper around chrome.storage.local to provide a promise-based API
 * and a centralized point for storage access.
 */

/**
 * Retrieves items from local storage.
 * @param {string|string[]|Object|null} keys A key, an array of keys, or an object with default values.
 * @returns {Promise<Object>} A promise that resolves with the retrieved items.
 */
export function get(keys) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(keys, (result) => {
            if (chrome.runtime.lastError) {
                return reject(chrome.runtime.lastError);
            }
            resolve(result);
        });
    });
}

/**
 * Sets items in local storage.
 * @param {Object} items An object with items to store.
 * @returns {Promise<void>} A promise that resolves when the items have been set.
 */
export function set(items) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.set(items, () => {
            if (chrome.runtime.lastError) {
                return reject(chrome.runtime.lastError);
            }
            resolve();
        });
    });
}

/**
 * Removes one or more items from storage.
 * @param {string|string[]} keys A single key or an array of keys to remove.
 * @returns {Promise<void>} A promise that resolves when the items have been removed.
 */
export function remove(keys) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.remove(keys, () => {
            if (chrome.runtime.lastError) {
                return reject(chrome.runtime.lastError);
            }
            resolve();
        });
    });
}

/**
 * Removes all items from storage.
 * @returns {Promise<void>} A promise that resolves when the storage has been cleared.
 */
export function clear() {
    return new Promise((resolve, reject) => {
        chrome.storage.local.clear(() => {
            if (chrome.runtime.lastError) {
                return reject(chrome.runtime.lastError);
            }
            resolve();
        });
    });
}
