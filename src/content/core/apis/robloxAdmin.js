import { callRobloxApiJson } from '../api.js';
import { get as getCache, set as setCache } from '../storage/cacheHandler.js';

const CACHE_SECTION = 'roblox_admin_badges';
const CACHE_TTL_MS = 5 * 60 * 1000;
const FAILURE_BACKOFF_MS = 30 * 1000;
const MAX_CONCURRENT_REQUESTS = 4;
const MAX_PENDING_REQUESTS = 1000;
const pendingRequests = new Map();
const failedRequests = new Map();
const requestQueue = [];
let activeRequests = 0;

function recordFailure(userId) {
    failedRequests.delete(userId);
    failedRequests.set(userId, Date.now() + FAILURE_BACKOFF_MS);
    if (failedRequests.size > MAX_PENDING_REQUESTS) {
        failedRequests.delete(failedRequests.keys().next().value);
    }
}

async function fetchAdminStatus(userId) {
    try {
        const cached = await getCache(
            CACHE_SECTION,
            userId,
            'session',
            CACHE_TTL_MS,
        );
        if (typeof cached === 'boolean') return cached;

        const badges = await callRobloxApiJson({
            subdomain: 'accountinformation',
            endpoint: `/v1/users/${userId}/roblox-badges`,
            method: 'GET',
            useBackground: true,
        });
        if (
            !Array.isArray(badges) ||
            !badges.every(
                (badge) =>
                    badge && Number.isSafeInteger(badge.id) && badge.id > 0,
            )
        ) {
            recordFailure(userId);
            return null;
        }

        const isAdmin = badges.some((badge) => badge.id === 1);
        await setCache(CACHE_SECTION, userId, isAdmin, 'session');
        return isAdmin;
    } catch {
        recordFailure(userId);
        return null;
    }
}

function processQueue() {
    while (activeRequests < MAX_CONCURRENT_REQUESTS && requestQueue.length) {
        const { userId, resolve } = requestQueue.shift();
        activeRequests++;
        fetchAdminStatus(userId).then((result) => {
            activeRequests--;
            pendingRequests.delete(userId);
            resolve(result);
            processQueue();
        });
    }
}

export function isRobloxAdmin(userId) {
    if (
        !['string', 'number'].includes(typeof userId) ||
        !/^\d+$/.test(String(userId)) ||
        !Number.isSafeInteger(Number(userId)) ||
        Number(userId) <= 0
    ) {
        return Promise.resolve(null);
    }

    const key = String(Number(userId));
    if ((failedRequests.get(key) || 0) > Date.now()) {
        return Promise.resolve(null);
    }
    failedRequests.delete(key);
    if (pendingRequests.has(key)) return pendingRequests.get(key);
    if (pendingRequests.size >= MAX_PENDING_REQUESTS) {
        return Promise.resolve(null);
    }

    const promise = new Promise((resolve) => {
        requestQueue.push({ userId: key, resolve });
    });
    pendingRequests.set(key, promise);
    processQueue();
    return promise;
}
