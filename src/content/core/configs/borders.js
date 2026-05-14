import { callRobloxApiJson } from '../api.js';

let inMemoryCache = null;
let fetchPromise = null;

export async function getBorders() {
    if (inMemoryCache && inMemoryCache.length > 0) return inMemoryCache;

    if (!fetchPromise) {
        fetchPromise = (async () => {
            try {
                const data = await callRobloxApiJson({
                    subdomain: 'www',
                    endpoint: '/borders/config.json',
                    isRovalraApi: true,
                });

                inMemoryCache = Array.isArray(data) ? data : [];
                return inMemoryCache;
            } catch {
                return [];
            } finally {
                fetchPromise = null;
            }
        })();
    }

    return fetchPromise;
}

export function getCachedBorders() {
    return inMemoryCache || [];
}

getBorders();
