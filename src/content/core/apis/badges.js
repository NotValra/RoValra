import { callRobloxApi } from '../api.js';

const MAX_CONCURRENT = 4;
const MAX_RETRIES = 3;
const DEFAULT_RATE_LIMIT_DELAY_MS = 3000;

const awardedDateCache = new Map();
const pendingRequests = new Map();
const queue = [];
let activeRequests = 0;
let cooldownUntil = 0;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isValidDate(value) {
    return Boolean(value) && !Number.isNaN(new Date(value).getTime());
}

function getRateLimitDelay(response) {
    const retryAfterSeconds = Number(response.headers.get('retry-after'));
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
        return retryAfterSeconds * 1000 + 500;
    }
    return DEFAULT_RATE_LIMIT_DELAY_MS;
}

async function runQueued(task) {
    if (activeRequests >= MAX_CONCURRENT) {
        await new Promise((resolve) => queue.push(resolve));
    }
    activeRequests++;
    try {
        return await task();
    } finally {
        activeRequests--;
        queue.shift()?.();
    }
}

async function requestAwardedDate(userId, badgeId) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const wait = cooldownUntil - Date.now();
        if (wait > 0) await sleep(wait);

        let response;
        try {
            response = await callRobloxApi({
                subdomain: 'badges',
                endpoint: `/v1/users/${userId}/badges/${badgeId}/awarded-date`,
            });
        } catch {
            await sleep(1000);
            continue;
        }

        if (response.status === 429) {
            cooldownUntil = Math.max(
                cooldownUntil,
                Date.now() + getRateLimitDelay(response),
            );
            continue;
        }

        if (response.status >= 500) {
            await sleep(1000);
            continue;
        }

        if (!response.ok) return null;

        const data = await response.json().catch(() => null);
        const awardedDate = data?.awardedDate || data?.date;
        return {
            owned: isValidDate(awardedDate),
            awardedDate: isValidDate(awardedDate) ? awardedDate : null,
        };
    }

    return null;
}

export function getBadgeAwardedDate(userId, badgeId) {
    const key = `${userId}:${badgeId}`;
    if (awardedDateCache.has(key)) {
        return Promise.resolve(awardedDateCache.get(key));
    }
    if (pendingRequests.has(key)) return pendingRequests.get(key);

    const promise = runQueued(() => requestAwardedDate(userId, badgeId))
        .then((result) => {
            if (result) awardedDateCache.set(key, result);
            return result;
        })
        .finally(() => pendingRequests.delete(key));

    pendingRequests.set(key, promise);
    return promise;
}
