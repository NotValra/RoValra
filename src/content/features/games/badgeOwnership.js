import { getBadgeAwardedDate } from '../../core/apis/badges.js';
import { getPlaceIdFromUrl } from '../../core/idExtractor.js';
import { observeChildren, observeElement } from '../../core/observer.js';
import { settings } from '../../core/settings/getSettings.js';
import {
    get as getCache,
    set as setCache,
} from '../../core/storage/cacheHandler.js';
import { getAuthenticatedUserId } from '../../core/user.js';

const LIST_SELECTOR = ':scope > .stack-list';
const ROW_SELECTOR = `${LIST_SELECTOR} > .stack-row.badge-row`;
const NOT_OWNED_CLASS = 'rovalra-badge-not-owned';
const CACHE_SECTION = 'badge_ownership';
const CACHE_AREA = 'local';
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
    container.querySelectorAll(LIST_SELECTOR).forEach((list) => {
        if (observedLists.has(list)) return;
        observedLists.add(list);
        observeChildren(list, () => scheduleBadgeOwnershipUpdate(container));
    });
}

function getCacheKey(userId, badgeId) {
    return `${userId}:${badgeId}`;
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

async function saveBadgeOwnership(userId, results) {
    if (results.size === 0) return;

    const cached =
        (await getCache(CACHE_SECTION, String(userId), CACHE_AREA)) || {};
    const now = Date.now();
    const expiresAt = now + OWNERSHIP_CACHE_MS;

    Object.keys(cached).forEach((badgeId) => {
        if (!(cached[badgeId]?.expiresAt > now)) delete cached[badgeId];
    });
    results.forEach((owned, badgeId) => {
        cached[badgeId] = { owned, expiresAt };
    });

    await setCache(CACHE_SECTION, String(userId), cached, CACHE_AREA);
}

function applyOwnership(container, userId) {
    getBadgeRows(container).forEach((row) => {
        const badgeId = getBadgeId(row);
        const ownsBadge = badgeId
            ? ownershipCache.get(getCacheKey(userId, badgeId))
            : undefined;

        row.classList.toggle(NOT_OWNED_CLASS, ownsBadge === false);
    });
}

async function updateBadgeOwnership(container) {
    if (!getPlaceIdFromUrl()) return;

    const userId = await getAuthenticatedUserId();
    if (!userId) return;

    const badgeIds = [
        ...new Set(getBadgeRows(container).map(getBadgeId).filter(Boolean)),
    ];
    if (badgeIds.length === 0) return;

    await loadCachedBadgeOwnership(userId, badgeIds);
    applyOwnership(container, userId);

    const missingIds = badgeIds.filter(
        (badgeId) => !ownershipCache.has(getCacheKey(userId, badgeId)),
    );
    if (missingIds.length === 0) return;

    const results = new Map();
    await Promise.all(
        missingIds.map(async (badgeId) => {
            const result = await getBadgeAwardedDate(userId, badgeId);
            if (!result) return;

            ownershipCache.set(getCacheKey(userId, badgeId), result.owned);
            results.set(badgeId, result.owned);
            applyOwnership(container, userId);
        }),
    );

    await saveBadgeOwnership(userId, results);
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
