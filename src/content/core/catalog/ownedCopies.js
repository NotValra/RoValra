import { callRobloxApiJson } from '../api.js';
import * as CacheHandler from '../storage/cacheHandler.js';

const MAX_PAGES = 10;
const CACHE_SECTION = 'owned_copies';
const CACHE_AREA = 'local';
export const OTHER_USER_CACHE_MS = 24 * 60 * 60 * 1000;
export const OWN_USER_CACHE_MS = 10 * 60 * 1000;
const MAX_CONCURRENT = 3;
const ownershipCache = new Map();

let activeRequests = 0;
const requestQueue = [];

export const SKIPPED_ERROR = 'rovalra-owned-copies-skipped';

function runQueued(task, shouldRun) {
    return new Promise((resolve, reject) => {
        requestQueue.push({ task, shouldRun, resolve, reject });
        drainQueue();
    });
}

function drainQueue() {
    while (activeRequests < MAX_CONCURRENT && requestQueue.length) {
        const { task, shouldRun, resolve, reject } = requestQueue.shift();
        if (shouldRun && !shouldRun()) {
            reject(new Error(SKIPPED_ERROR));
            continue;
        }
        activeRequests++;
        task()
            .then(resolve, reject)
            .finally(() => {
                activeRequests--;
                drainQueue();
            });
    }
}

async function fetchOwnedCopies(userId, assetId) {
    const copies = [];
    let pageToken = '';
    let pages = 0;

    do {
        const params = new URLSearchParams({
            filter: `assetIds=${assetId}`,
            maxPageSize: '100',
        });
        if (pageToken) params.set('pageToken', pageToken);

        const data = await callRobloxApiJson({
            subdomain: 'apis',
            endpoint: `/cloud/v2/users/${userId}/inventory-items?${params}`,
            method: 'GET',
            useBackground: true,
            useApiKey: true,
        });

        for (const item of data?.inventoryItems || []) {
            if (String(item?.assetDetails?.assetId) !== String(assetId))
                continue;
            copies.push({
                addTime: item.addTime,
                instanceId: item.assetDetails?.instanceId,
            });
        }

        pageToken = data?.nextPageToken || '';
        pages++;
    } while (pageToken && pages < MAX_PAGES);

    return copies
        .filter((copy) => copy.addTime)
        .sort((a, b) => new Date(a.addTime) - new Date(b.addTime));
}

function createStatusError(status) {
    const error = new Error(`API request failed with status ${status}`);
    error.status = status;
    return error;
}

async function loadOwnedCopies(userId, assetId, key, shouldRun, maxAgeMs) {
    const cached = await CacheHandler.get(
        CACHE_SECTION,
        key,
        CACHE_AREA,
        maxAgeMs,
    );
    if (cached?.status) throw createStatusError(cached.status);
    if (Array.isArray(cached?.copies)) return cached.copies;

    let copies;
    try {
        copies = await runQueued(
            () => fetchOwnedCopies(userId, assetId),
            shouldRun,
        );
    } catch (err) {
        if (err?.status === 403) {
            CacheHandler.set(CACHE_SECTION, key, { status: 403 }, CACHE_AREA);
        }
        throw err;
    }

    if (copies.length) {
        CacheHandler.set(
            CACHE_SECTION,
            key,
            {
                copies: copies.map(({ addTime, instanceId }) => ({
                    addTime,
                    instanceId,
                })),
            },
            CACHE_AREA,
        );
    }
    return copies;
}

export function getOwnedCopies(
    userId,
    assetId,
    { shouldRun, maxAgeMs = OTHER_USER_CACHE_MS } = {},
) {
    const key = `${userId}:${assetId}`;
    if (!ownershipCache.has(key)) {
        const promise = loadOwnedCopies(
            userId,
            assetId,
            key,
            shouldRun,
            maxAgeMs,
        ).catch((err) => {
            ownershipCache.delete(key);
            throw err;
        });
        ownershipCache.set(key, promise);
    }
    return ownershipCache.get(key);
}
