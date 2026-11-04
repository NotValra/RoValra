import { callRobloxApiJson } from '../api.js';
import { get as getCache, set as setCache } from '../storage/cacheHandler.js';

const CACHE_SECTION = 'roblox_admin_status';
const CACHE_TTL_MS = 5 * 60 * 1000;
const FAILURE_BACKOFF_MS = 30 * 1000;
const BATCH_SIZE = 50;
const BATCH_DELAY_MS = 50;
const MAX_PENDING_REQUESTS = 1000;
const pendingRequests = new Map();
const failedRequests = new Map();
const batchQueue = new Map();
let batchTimer = null;

function recordFailure(userId) {
    failedRequests.delete(userId);
    failedRequests.set(userId, Date.now() + FAILURE_BACKOFF_MS);
    if (failedRequests.size > MAX_PENDING_REQUESTS) {
        failedRequests.delete(failedRequests.keys().next().value);
    }
}

function settle(userId, resolve, result) {
    pendingRequests.delete(userId);
    resolve(result);
}

async function fetchBatch(batch) {
    let profiles;
    try {
        const response = await callRobloxApiJson({
            subdomain: 'apis',
            endpoint: '/profile-platform-api/v1/profiles/batch/get',
            method: 'POST',
            body: {
                profileType: 'User',
                profileIds: batch.map(([userId]) => userId),
                components: [{ component: 'UserProfileHeader' }],
            },
        });
        profiles = response?.profiles;
    } catch {
        profiles = null;
    }

    for (const [userId, resolve] of batch) {
        const isAdmin =
            profiles?.[userId]?.components?.UserProfileHeader?.isRobloxAdmin;
        if (typeof isAdmin !== 'boolean') {
            recordFailure(userId);
            settle(userId, resolve, null);
            continue;
        }
        await setCache(CACHE_SECTION, userId, isAdmin, 'session');
        settle(userId, resolve, isAdmin);
    }
}

function flushQueue() {
    batchTimer = null;
    const entries = [...batchQueue];
    batchQueue.clear();
    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
        fetchBatch(entries.slice(i, i + BATCH_SIZE));
    }
}

async function resolveAdminStatus(userId, resolve) {
    try {
        const cached = await getCache(
            CACHE_SECTION,
            userId,
            'session',
            CACHE_TTL_MS,
        );
        if (typeof cached === 'boolean') {
            settle(userId, resolve, cached);
            return;
        }
    } catch {}

    batchQueue.set(userId, resolve);
    if (batchQueue.size >= BATCH_SIZE) {
        clearTimeout(batchTimer);
        flushQueue();
    } else if (!batchTimer) {
        batchTimer = setTimeout(flushQueue, BATCH_DELAY_MS);
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
        resolveAdminStatus(key, resolve);
    });
    pendingRequests.set(key, promise);
    return promise;
}
