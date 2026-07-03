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
const OWNERSHIP_BATCH_SIZE = 100;
const UPDATE_DELAY_MS = 500;
const OWNERSHIP_CACHE_MS = 5 * 60 * 1000;

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

function getRateLimitDelay(response) {
    const retryAfterSeconds = Number(response.headers.get('retry-after'));
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
        return retryAfterSeconds * 1000 + 1000;
    }

    const resetValue = Number(response.headers.get('x-ratelimit-reset'));
    if (Number.isFinite(resetValue) && resetValue > 0) {
        return (
            (resetValue > 1e9
                ? Math.max(0, resetValue * 1000 - Date.now())
                : resetValue * 1000) + 1000
        );
    }

    return 3000;
}

async function fetchAwardedDates(userId, badgeIds) {
    const params = new URLSearchParams();
    badgeIds.forEach((badgeId) => params.append('badgeIds', badgeId));

    for (let attempt = 0; attempt < 3; attempt++) {
        const response = await callRobloxApi({
            subdomain: 'badges',
            endpoint: `/v1/users/${userId}/badges/awarded-dates?${params.toString()}`,
        });

        if (response.status === 429 && attempt < 2) {
            await sleep(getRateLimitDelay(response));
            continue;
        }

        if (!response.ok) return null;
        return response.json();
    }

    return null;
}

async function fetchOwnedBadgeIds(userId, badgeIds) {
    const uniqueBadgeIds = [...new Set(badgeIds.map(String))];

    await Promise.all(
        uniqueBadgeIds.map(async (badgeId) => {
            const cacheKey = getCacheKey(userId, badgeId);
            if (ownershipCache.has(cacheKey)) return;

            const cached = await getCache(CACHE_SECTION, cacheKey, 'session');
            if (!cached || cached.expiresAt <= Date.now()) return;

            ownershipCache.set(cacheKey, cached.owned === true);
        }),
    );

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

        batch.forEach((badgeId) => {
            const cacheKey = getCacheKey(userId, badgeId);
            const owned = ownedIds.has(badgeId);
            ownershipCache.set(cacheKey, owned);
            void setCache(
                CACHE_SECTION,
                cacheKey,
                { owned, expiresAt: Date.now() + OWNERSHIP_CACHE_MS },
                'session',
            );
        });
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
