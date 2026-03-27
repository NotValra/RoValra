const CACHE_KEY = 'rovalra_cache';
let storageSupported = { session: true, local: true };
let memoryFallback = { session: {}, local: {} };

let _ramcache = new Map();
const cachevaluemissing = Symbol("CacheValueMissing");

const getramcache = (section, key, area) => {
    return {
        get x() { 
            if (!_ramcache.has(`${area}-${section}::${key}`))
                return cachevaluemissing;
            return _ramcache.get(`${area}-${section}::${key}`);
        },
        set x(value) { _ramcache.set(`${area}-${section}::${key}`, value);}
    }
}

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' && areaName !== 'session') return;
    _ramcache = new Map();
});


/**
 * Retrieves the entire cache object from the specified storage area.
 * @param {string} area - The storage area ('session' or 'local').
 * @returns {object} The cache object, or an empty object if not found.
 */
const getCache = async (area = 'session') => {
    if (!storageSupported[area]) return memoryFallback[area];

    try {
        if (!chrome?.storage?.[area]) {
            storageSupported[area] = false;
            return memoryFallback[area];
        }
        const result = await chrome.storage[area].get(CACHE_KEY);
        return result[CACHE_KEY] || {};
    } catch (e) {
        if (e.message.includes('Access to storage is not allowed')) {
            storageSupported[area] = false;
        } else {
            console.error(
                `RoValra (CacheHandler): Failed to get cache from ${area}`,
                e,
            );
        }
        return memoryFallback[area];
    }
};

/**
 * Stores the entire cache object into the specified storage area.
 * @param {object} cache - The cache object to store.
 * @param {string} area - The storage area ('session' or 'local').
 */
const setCache = async (cache, area = 'session') => {
    if (!storageSupported[area]) {
        memoryFallback[area] = cache;
        return;
    }

    try {
        await chrome.storage[area].set({ [CACHE_KEY]: cache });
    } catch (e) {
        if (e.message.includes('Access to storage is not allowed')) {
            storageSupported[area] = false;
            memoryFallback[area] = cache;
        } else {
            console.error(
                `RoValra (CacheHandler): Failed to set cache in ${area}`,
                e,
            );
        }
    }
};

/**
 * Sets a value in the cache under a specific section.
 * @param {string} section - The section within the cache.
 * @param {string} key - The cache key.
 * @param {any} value - The value to store.
 * @param {string} area - The storage area ('session' or 'local').
 */
export const set = async (section, key, value, area = 'session') => {
    const ram = getramcache(section, key, area);
    const cache = await getCache(area);
    ram.x = value;
    cache[section] = cache[section] || {};
    cache[section][key] = value;
    await setCache(cache, area);
};

/**
 * Retrieves a value from the cache under a specific section.
 * @param {string} section - The section within the cache.
 * @param {string} key - The cache key within the section.
 * @param {string} area - The storage area ('session' or 'local').
 * @returns {any} The cached value, or undefined if not found.
 */
export const get = async (section, key, area = 'session') => {
    const ram = getramcache(section, key, area);
    if (ram.x != cachevaluemissing) {
        return ram.x;
    }
    const cache = await getCache(area);
    const v = cache[section] ? cache[section][key] : undefined;
    ram.x = v;
    return v;
};

/**
 * Removes a specific key from a section in the cache.
 * @param {string} section - The section within the cache.
 * @param {string} key - The cache key within the section to remove.
 * @param {string} area - The storage area ('session' or 'local').
 */
export const remove = async (section, key, area = 'session') => {
    _ramcache.delete(`${area}-${section}::${key}`);
    try {
        const cache = await getCache(area);
        if (cache[section]) {
            delete cache[section][key];
            await setCache(cache, area);
        }
    } catch (e) {
        console.error(
            `RoValra (CacheHandler): Failed to remove item "${key}" from ${area}`,
            e,
        );
    }
};
