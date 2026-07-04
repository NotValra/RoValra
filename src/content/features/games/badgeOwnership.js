import { callRobloxApi } from '../../core/api.js';
import { getPlaceIdFromUrl } from '../../core/idExtractor.js';
import { observeChildren, observeElement } from '../../core/observer.js';
import { settings } from '../../core/settings/getSettings.js';
import {
    get as getCache,
    set as setCache,
} from '../../core/storage/cacheHandler.js';
import { getAuthenticatedUserId } from '../../core/user.js';

const ROW_SELECTOR =
    ':scope > .stack-list:not(.rovalra-hidden-badges-list) > .stack-row.badge-row';
const NOT_OWNED_CLASS = 'rovalra-badge-not-owned';
const CACHE_SECTION = 'badge_ownership';
const COOLDOWN_SECTION = 'badge_ownership_cooldown';
const COOLDOWN_KEY = 'awarded_dates';
const CACHE_AREA = 'local';
const OWNERSHIP_BATCH_SIZE = 100;
const MAX_RETRIES = 3;
const UPDATE_DELAY_MS = 500;
const OWNERSHIP_CACHE_MS = 5 * 60 * 1000;
const COOLDOWN_MIN_MS = 30 * 1000;
const COOLDOWN_MAX_MS = 60 * 1000;

let initialized = false;
const ownershipCache = new Map();
const observedLists = new WeakSet();
const updateTimers = new WeakMap();

function getBadgeId(row) {
    const href = row.querySelector('a[href*="/badges/"]')?.href;
    return href?.match(/\/badges\/(\d+)/)?.[1] || null;
}

function getBadgeRows(container) {
    return [...container.querySelectorAll(ROW_SELECTOR)];
}

function observeBadgeLists(container) {
    container
        .querySelectorAll(
            ':scope > .stack-list:not(.rovalra-hidden-badges-list)',
        )
        .forEach((list) => {
            if (observedLists.has(list)) return;
            observedLists.add(list);
            observeChildren(list, () =>
                scheduleBadgeOwnershipUpdate(container),
            );
        });
}

function getCacheKey(userId, badgeId) {
    return `${userId}:${badgeId}`;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampCooldown(ms) {
    return Math.min(Math.max(ms, 1000), COOLDOWN_MAX_MS);
}

function getRateLimitDelay(response) {
    const retryAfterSeconds = Number(response.headers.get('retry-after'));
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
        return clampCooldown(retryAfterSeconds * 1000 + 1000);
    }

    const resetValue = Number(response.headers.get('x-ratelimit-reset'));
    if (Number.isFinite(resetValue) && resetValue > 0) {
        return clampCooldown(
            (resetValue > 1e9
                ? Math.max(0, resetValue * 1000 - Date.now())
                : resetValue * 1000) + 1000
        );
    }

    return 3000;
}

function getFallbackCooldownDelay() {
    return (
        COOLDOWN_MIN_MS +
        Math.floor(Math.random() * (COOLDOWN_MAX_MS - COOLDOWN_MIN_MS))
    );
}

async function getSharedCooldownDelay() {
    const cooldownUntil = Number(
        await getCache(COOLDOWN_SECTION, COOLDOWN_KEY, CACHE_AREA),
    );
    if (!Number.isFinite(cooldownUntil)) return 0;
    return Math.max(0, cooldownUntil - Date.now());
}

async function setSharedCooldown() {
    await setCache(
        COOLDOWN_SECTION,
        COOLDOWN_KEY,
        Date.now() + getFallbackCooldownDelay(),
        CACHE_AREA,
    );
}

async function fetchAwardedDates(userId, badgeIds) {
    if ((await getSharedCooldownDelay()) > 0) return null;

    const params = new URLSearchParams();
    badgeIds.forEach((badgeId) => params.append('badgeIds', badgeId));
    let shouldCooldown = false;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        let response;
        try {
            response = await callRobloxApi({
                subdomain: 'badges',
                endpoint: `/v1/users/${userId}/badges/awarded-dates?${params.toString()}`,
            });
        } catch {
            shouldCooldown = true;
            if (attempt < MAX_RETRIES - 1) {
                await sleep(1000);
                continue;
            }
            break;
        }

        if (response.status === 429) {
            shouldCooldown = true;
            if (attempt < MAX_RETRIES - 1) {
                await sleep(getRateLimitDelay(response));
                continue;
            }
            break;
        }

        if (response.status >= 500) {
            shouldCooldown = true;
            if (attempt < MAX_RETRIES - 1) {
                await sleep(1000);
                continue;
            }
            break;
        }

        if (!response.ok) return null;
        return response.json().catch(() => null);
    }

    if (shouldCooldown) {
        await setSharedCooldown();
    }

    return null;
}

async function loadCachedBadgeOwnership(userId, badgeIds) {
    const cached =
        (await getCache(CACHE_SECTION, String(userId), CACHE_AREA)) || {};
    const now = Date.now();

    badgeIds.forEach((badgeId) => {
        const cacheKey = getCacheKey(userId, badgeId);
        if (ownershipCache.has(cacheKey)) return;

        const entry = cached[badgeId];
        if (!entry || entry.expiresAt <= now) return;

        ownershipCache.set(cacheKey, entry.owned === true);
    });
}

async function cacheBadgeOwnershipBatch(userId, badgeIds, ownedIds) {
    const cached =
        (await getCache(CACHE_SECTION, String(userId), CACHE_AREA)) || {};
    const expiresAt = Date.now() + OWNERSHIP_CACHE_MS;

    badgeIds.forEach((badgeId) => {
        const cacheKey = getCacheKey(userId, badgeId);
        const owned = ownedIds.has(badgeId);
        ownershipCache.set(cacheKey, owned);
        cached[badgeId] = { owned, expiresAt };
    });

    await setCache(CACHE_SECTION, String(userId), cached, CACHE_AREA);
}

async function fetchOwnedBadgeIds(userId, badgeIds) {
    const uniqueBadgeIds = [...new Set(badgeIds.map(String))];

    await loadCachedBadgeOwnership(userId, uniqueBadgeIds);

    const missingIds = uniqueBadgeIds.filter(
        (badgeId) => !ownershipCache.has(getCacheKey(userId, badgeId)),
    );

    for (let i = 0; i < missingIds.length; i += OWNERSHIP_BATCH_SIZE) {
        const batch = missingIds.slice(i, i + OWNERSHIP_BATCH_SIZE);
        const data = await fetchAwardedDates(userId, batch);
        if (!data) continue;

        const ownedIds = new Set(
            (data?.data || []).map((badge) => String(badge.badgeId)),
        );

        await cacheBadgeOwnershipBatch(userId, batch, ownedIds);
    }
}

async function updateBadgeOwnership(container) {
    if (!getPlaceIdFromUrl()) return;

    const userId = await getAuthenticatedUserId();
    if (!userId) return;

    const rows = getBadgeRows(container);
    const badgeIds = rows.map(getBadgeId).filter(Boolean);
    if (badgeIds.length === 0) return;

    await fetchOwnedBadgeIds(userId, badgeIds);

    getBadgeRows(container).forEach((row) => {
        const badgeId = getBadgeId(row);
        const ownsBadge = badgeId
            ? ownershipCache.get(getCacheKey(userId, badgeId))
            : undefined;

        row.classList.toggle(NOT_OWNED_CLASS, ownsBadge === false);
    });
}

function scheduleBadgeOwnershipUpdate(container) {
    clearTimeout(updateTimers.get(container));
    updateTimers.set(
        container,
        setTimeout(() => {
            updateTimers.delete(container);
            updateBadgeOwnership(container).catch((error) => {
                console.warn('RoValra: Failed to check badge ownership', error);
            });
        }, UPDATE_DELAY_MS),
    );
}

function setupBadgeOwnership(container) {
    if (container.dataset.rovalraBadgeOwnershipAdded) return;
    container.dataset.rovalraBadgeOwnershipAdded = 'true';

    observeBadgeLists(container);
    scheduleBadgeOwnershipUpdate(container);
    observeChildren(container, () => {
        observeBadgeLists(container);
        scheduleBadgeOwnershipUpdate(container);
    });
}

export async function init() {
    if (initialized) return;
    if ((await settings.badgeOwnershipEnabled) === false) return;
    initialized = true;

    observeElement('.game-badges-list', setupBadgeOwnership, {
        multiple: true,
    });
}

export default init;
