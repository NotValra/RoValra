import { getUserIdFromUrl } from '../../../core/idExtractor.js';
import { observeElement } from '../../../core/observer.js';
import { callRobloxApiJson } from '../../../core/api.js';
import { settings } from '../../../core/settings/getSettings.js';
import { fetchPresenceBatched } from '../../../core/ui/profile/userCard.js';
import {
    createPersistentSubplaceCard,
    createSubplaceDetailsCard,
} from '../../../core/ui/profile/subplaceCard.js';

const CARD_SELECTOR = '.currently-playing-card';
const GAME_LINK_SELECTOR = 'a[href*="/games/"]';
const LIST_CLASS = 'rovalra-profile-subplace-list';
const LEGACY_CHIP_CLASS = 'rovalra-profile-subplace-legacy-chip';
const LEGACY_ROW_CLASS = 'rovalra-profile-subplace-legacy-row';
const LEGACY_HOST_CLASS = 'rovalra-profile-subplace-legacy-host';
const LEGACY_PENDING_CLASS = 'rovalra-profile-subplace-pending-placement';
const LEGACY_READY_CLASS = 'rovalra-profile-subplace-ready';
const LEGACY_ROW_PENDING_CLASS = 'rovalra-profile-subplace-row-pending';
const LEGACY_ROW_READY_CLASS = 'rovalra-profile-subplace-row-ready';

let observerRegistered = false;
let profileFallbackObserverRegistered = false;
let profilePresencePromise = null;
let profilePresenceUserId = 0;

const PROFILE_SCAN_DELAYS = [100, 400, 1000, 1800, 3000, 5000];
const HOME_CONTEXT_TTL = 7000;
const HOME_PRESENCE_CACHE_TTL = 1200;
const HOME_SCAN_DELAYS = [0, 100, 250, 500];
const HOME_POPOVER_SELECTORS = [
    '.profile-card',
    '.profile-card-container',
    '.profile-hover-card',
    '.popover',
    '.popover-content',
    '[role="dialog"]',
    '[role="tooltip"]',
    '[data-testid*="popover" i]',
    '[class*="popover" i]',
    '[class*="profile-card" i]',
    '[class*="profilecard" i]',
    '[class*="hover-card" i]',
    '[class*="hovercard" i]',
].join(',');

let homePopoverObserverRegistered = false;
let homeMutationObserver = null;
let homeScanTimers = [];
let homeScanFrame = 0;
let homeHoverContext = null;
let lastHomeContextUpdate = 0;
let profileScanTimers = [];
const homeMutationPopoverCandidates = new Set();

const usernameToIdCache = new Map();
const presenceByUserIdCache = new Map();
const homeBuildPromises = new WeakMap();
const homeBuildRetryState = new WeakMap();
const HOME_BUILD_RETRY_DELAYS = [140, 320, 700, 1200];

function normalizeText(text) {
    return String(text || '')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeId(value) {
    const id = Number(value);
    return Number.isFinite(id) && id > 0 ? String(id) : '';
}

async function isHomeSubplaceEnabled() {
    return (await settings.currentlyPlayingSubplaceHomeEnabled) !== false;
}

async function isProfileSubplaceEnabled() {
    return (await settings.currentlyPlayingSubplaceProfileEnabled) !== false;
}

function getProfileUserIdFromUrl() {
    const direct = Number(getUserIdFromUrl());
    if (Number.isFinite(direct) && direct > 0) return direct;

    try {
        const url = new URL(window.location.href, window.location.origin);
        const match = url.pathname.match(
            /^(?:\/[a-z]{2}(?:-[a-z]{2})?)?\/users\/(\d+)(?:\/profile)?\/?$/i,
        );
        const id = Number(match?.[1]);
        if (Number.isFinite(id) && id > 0) return id;
    } catch {
        // Keep profile detection best-effort; failing here should only disable
        // the profile-only scanners, not the home hover-card feature.
    }

    return 0;
}

function extractUserId(value) {
    if (!value) return 0;

    const match = String(value).match(/(?:^|\/|users\/)(\d+)(?:\/profile)?/i);
    const id = Number(match?.[1] || value);
    return Number.isFinite(id) && id > 0 ? id : 0;
}

function extractUserIdFromAttributes(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return 0;

    const attributeNames = [
        'data-user-id',
        'data-userid',
        'data-rbx-user-id',
        'data-profile-user-id',
        'data-profileid',
        'data-profile-id',
        'data-target-id',
        'data-target-user-id',
        'data-user',
        'data-id',
        'user-id',
        'userid',
        'profileuserid',
        'profile-user-id',
        'target-id',
    ];

    for (const name of attributeNames) {
        const id = extractUserId(element.getAttribute(name));
        if (id) return id;
    }

    return 0;
}

function extractUserIdFromLinks(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return 0;

    if (element.matches?.('a[href*="/users/"]')) {
        const id = extractUserId(element.getAttribute('href'));
        if (id) return id;
    }

    const link = element.querySelector?.('a[href*="/users/"]');
    return extractUserId(link?.getAttribute('href'));
}

function findUserIdInElement(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return 0;
    return extractUserIdFromAttributes(element) || extractUserIdFromLinks(element);
}

function findUserIdNearElement(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return 0;

    let current = element;
    let depth = 0;
    while (current && current !== document.body && depth < 7) {
        const id = findUserIdInElement(current);
        if (id) return id;

        for (const sibling of [current.previousElementSibling, current.nextElementSibling]) {
            const siblingId = findUserIdInElement(sibling);
            if (siblingId) return siblingId;
        }

        current = current.parentElement;
        depth += 1;
    }

    return 0;
}

function getCleanUsernameCandidate(value) {
    const text = normalizeText(value)
        .replace(/^@+/, '')
        .replace(/\s+is\s+playing.*$/i, '')
        .trim();
    const match = text.match(/^[A-Za-z0-9_]{3,20}$/);
    return match ? match[0] : '';
}

function extractUsernameFromText(value) {
    const text = normalizeText(value);
    if (!text) return '';

    const playingMatch = text.match(/^([A-Za-z0-9_]{3,20})\s+is\s+play/i);
    if (playingMatch) return getCleanUsernameCandidate(playingMatch[1]);

    return getCleanUsernameCandidate(text);
}

function extractUsernameFromElement(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return '';

    const aria = getCleanUsernameCandidate(
        element.getAttribute?.('aria-label') || element.getAttribute?.('title'),
    );
    if (aria) return aria;

    if (element.matches?.('a[href*="/users/"]')) {
        const username = extractUsernameFromText(element.textContent);
        if (username) return username;
    }

    const userLink = Array.from(element.querySelectorAll?.('a[href*="/users/"]') || [])
        .map((link) => extractUsernameFromText(link.textContent))
        .find(Boolean);
    if (userLink) return userLink;

    const shortText = normalizeText(element.textContent || '');
    if (shortText.length <= 80) return extractUsernameFromText(shortText);

    return '';
}

function findUsernameNearElement(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return '';

    let current = element;
    let depth = 0;
    while (current && current !== document.body && depth < 7) {
        const username = extractUsernameFromElement(current);
        if (username) return username;

        for (const sibling of [current.previousElementSibling, current.nextElementSibling]) {
            const siblingUsername = extractUsernameFromElement(sibling);
            if (siblingUsername) return siblingUsername;
        }

        current = current.parentElement;
        depth += 1;
    }

    return '';
}

function extractPresenceFromAttributes(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return null;

    const placeId = normalizeId(element.dataset?.rovalraPresencePlaceId);
    if (!placeId) return null;

    return {
        userPresenceType: 2,
        placeId: Number(placeId),
        rootPlaceId: Number(normalizeId(element.dataset?.rovalraPresenceRootPlaceId)) || null,
        universeId: Number(normalizeId(element.dataset?.rovalraPresenceUniverseId)) || null,
        userId: Number(normalizeId(element.dataset?.rovalraPresenceUserId)) || null,
        gameId: element.dataset?.rovalraPresenceGameId || null,
        lastLocation: normalizeText(element.getAttribute('title') || element.textContent || ''),
    };
}

function findPresenceNearElement(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return null;

    let current = element;
    let depth = 0;
    while (current && current !== document.body && depth < 7) {
        const direct = extractPresenceFromAttributes(current);
        if (direct) return direct;

        const child = current.querySelector?.('[data-rovalra-presence-place-id]');
        const childPresence = extractPresenceFromAttributes(child);
        if (childPresence) return childPresence;

        current = current.parentElement;
        depth += 1;
    }

    return null;
}

function rememberPresence(userId, presence) {
    const id = Number(userId || presence?.userId);
    if (!id || !presence) return presence;

    presenceByUserIdCache.set(id, {
        presence,
        timestamp: Date.now(),
    });

    return presence;
}

async function fetchPresenceForUserId(userId, options = {}) {
    const id = Number(userId);
    if (!Number.isFinite(id) || id <= 0) return null;

    const cached = presenceByUserIdCache.get(id);
    if (
        !options.forceFresh &&
        cached &&
        Date.now() - cached.timestamp < HOME_PRESENCE_CACHE_TTL
    ) {
        return cached.presence;
    }

    const presence = await fetchPresenceBatched(id);
    return rememberPresence(id, presence);
}

async function resolveUserIdFromUsername(username) {
    const cleanUsername = getCleanUsernameCandidate(username);
    if (!cleanUsername) return 0;

    const key = cleanUsername.toLowerCase();
    if (usernameToIdCache.has(key)) return usernameToIdCache.get(key);

    const promise = callRobloxApiJson({
        subdomain: 'users',
        endpoint: '/v1/usernames/users',
        method: 'POST',
        body: {
            usernames: [cleanUsername],
            excludeBannedUsers: false,
        },
    })
        .then((response) => Number(response?.data?.[0]?.id) || 0)
        .catch(() => 0);

    usernameToIdCache.set(key, promise);
    return promise;
}

function getHomeContextKey(context) {
    if (!context) return '';

    const userId = normalizeId(context.userId || context.presence?.userId);
    if (userId) return `user:${userId}`;

    if (context.username) return `username:${String(context.username).toLowerCase()}`;

    const placeId = normalizeId(context.presence?.placeId);
    if (placeId) return `place:${placeId}`;

    return '';
}

function mergeHomeHoverContext(nextContext, now) {
    if (!homeHoverContext || now - homeHoverContext.timestamp > HOME_CONTEXT_TTL) {
        return nextContext;
    }

    const previous = homeHoverContext;
    const previousKey = getHomeContextKey(previous);
    const nextKey = getHomeContextKey(nextContext);

    if (previousKey && nextKey && previousKey !== nextKey) return nextContext;

    return {
        userId: nextContext.userId || previous.userId || 0,
        username: nextContext.username || previous.username || '',
        presence: nextContext.presence || previous.presence || null,
        target: nextContext.target || previous.target || null,
        timestamp: now,
    };
}

function getFreshHomeContext() {
    if (!homeHoverContext || Date.now() - homeHoverContext.timestamp > HOME_CONTEXT_TTL) {
        return null;
    }

    return homeHoverContext;
}

function isIgnoredHomeHoverArea(element) {
    // Only ignore our own injected UI here. The old perf fix also ignored broad
    // Roblox containers such as .game-carousel/.game-grid, but friends/home
    // avatar tiles can live inside those same wrappers. That prevented the
    // hover context from starting until the mouse entered the already-open
    // Roblox popup, so the SUBPLACE section appeared late.
    return Boolean(
        element?.closest?.(
            [
                '.rovalra-home-subplace-card',
                '.rovalra-current-subplace-card',
                '.rovalra-subplace-hover-card',
                '.rovalra-profile-subplace-list',
                '.rovalra-subplace-details-card',
            ].join(','),
        ),
    );
}

function elementCanStartHomeHover(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;
    if (isIgnoredHomeHoverArea(element)) return false;

    if (findPresenceNearElement(element)) return true;
    if (findUserIdNearElement(element)) return true;
    if (findUsernameNearElement(element)) return true;

    const href = element.getAttribute?.('href') || '';
    return /\/users\/\d+/i.test(href);
}

function elementMayOpenHomePopover(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;
    if (isIgnoredHomeHoverArea(element)) return false;

    if (elementCanStartHomeHover(element)) return true;

    return Boolean(
        element.closest?.(
            [
                'a[href*="/users/"]',
                '[data-testid*="friend" i]',
                '[data-testid*="avatar" i]',
                '[class*="friend" i]',
                '[class*="avatar" i]',
                '[class*="profile" i]',
                '[class*="user" i]',
            ].join(','),
        ),
    );
}


function warmHomePresenceDetails(presence) {
    if (!presence || presence.userPresenceType !== 2 || !presence.placeId) return;

    createSubplaceDetailsCard(presence).catch(() => {});
}

function prefetchHomeContextSubplace(context) {
    if (!context) return;

    if (context.presence) {
        warmHomePresenceDetails(context.presence);
        return;
    }

    if (context.userId) {
        fetchPresenceForUserId(context.userId, { forceFresh: false })
            .then(warmHomePresenceDetails)
            .catch(() => {});
        return;
    }

    if (context.username) {
        resolveUserIdFromUsername(context.username)
            .then((userId) => fetchPresenceForUserId(userId, { forceFresh: false }))
            .then(warmHomePresenceDetails)
            .catch(() => {});
    }
}

function updateHomeHoverContext(event) {
    const target = event?.target;
    if (!elementMayOpenHomePopover(target)) return;

    const now = Date.now();
    if (now - lastHomeContextUpdate < 45) {
        scheduleHomePopoverScan();
        return;
    }
    lastHomeContextUpdate = now;

    const userId = findUserIdNearElement(target);
    const username = findUsernameNearElement(target);
    const presence = findPresenceNearElement(target);

    if (!userId && !username && !presence) {
        homeHoverContext = mergeHomeHoverContext(
            {
                userId: 0,
                username: '',
                presence: null,
                target,
                timestamp: now,
            },
            now,
        );
        prefetchHomeContextSubplace(homeHoverContext);
        scheduleHomePopoverScan();
        return;
    }

    const nextContext = mergeHomeHoverContext(
        {
            userId,
            username,
            presence,
            target,
            timestamp: now,
        },
        now,
    );

    homeHoverContext = nextContext;

    if (presence && (userId || presence.userId)) {
        rememberPresence(userId || presence.userId, presence);
    }

    prefetchHomeContextSubplace(nextContext);
    scheduleHomePopoverScan();
}

function getActionLabels(element) {
    const labels = new Set();
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return labels;

    const candidates = element.querySelectorAll('button, a, [role="button"]');
    candidates.forEach((candidate) => {
        const text = normalizeText(candidate.textContent).toLowerCase();
        if (!text || text.length > 80) return;

        if (text === 'join' || text.startsWith('join ')) labels.add('join');
        if (text === 'chat' || text.startsWith('chat ')) labels.add('chat');
        if (text === 'view profile' || text.startsWith('view profile ')) {
            labels.add('view profile');
        }
    });

    const ownText = normalizeText(element.textContent).toLowerCase();
    if (/\bjoin\b/i.test(ownText)) labels.add('join');
    if (/\bchat\b/i.test(ownText)) labels.add('chat');
    if (/\bview profile\b/i.test(ownText)) labels.add('view profile');

    return labels;
}

function isVisibleHomePopover(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;

    const rect = element.getBoundingClientRect?.();
    if (!rect || rect.width < 190 || rect.height < 145) return false;
    if (rect.width > 560 || rect.height > 760) return false;

    const style = getComputedStyle(element);
    return !(
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        Number(style.opacity || 1) === 0
    );
}

function isDefinitelyNotHomeUserPopover(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return true;

    if (
        element.closest?.(
            [
                '[data-rovalra-serverid]',
                '.rbx-game-server-item',
                '.rbx-game-server-item-container',
                '.server-list-section',
                '.server-list-container',
                '.game-server-item',
                '.rovalra-server-full-info',
                '.rovalra-server-extra-details',
                '.user-profile-header',
                '[class*="profile-header" i]',
            ].join(','),
        )
    ) {
        return true;
    }

    const text = normalizeText(element.textContent);
    if (!text || text.length > 1100) return true;

    return /\bMaturity:\b|\bserver performance\b|\bpeople max\b|\bversion\s+\d+|\bid:\s*[a-f0-9-]{8,}|\bshare\b/i.test(text);
}

function isHomeUserPopover(element) {
    if (!isVisibleHomePopover(element)) return false;
    if (isDefinitelyNotHomeUserPopover(element)) return false;
    if (element.closest?.('.rovalra-home-subplace-card')) return false;

    const text = normalizeText(element.textContent);
    const labels = getActionLabels(element);
    const context = getFreshHomeContext();
    const popupUsername = extractUsernameFromText(text);
    const hasIdentity = Boolean(
        context ||
            popupUsername ||
            findUserIdInElement(element) ||
            findUsernameNearElement(element) ||
            findPresenceNearElement(element),
    );

    if (!hasIdentity) return false;
    if (labels.has('join') && labels.has('view profile')) return true;
    if (/\bis playing\b/i.test(text) && labels.has('join')) return true;

    return false;
}

function findHomePopoverRoot(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return null;

    let best = null;
    let current = element;
    let depth = 0;

    while (current && current !== document.body && depth < 9) {
        if (isHomeUserPopover(current)) best = current;
        current = current.parentElement;
        depth += 1;
    }

    return best;
}

function findActionElement(root, label) {
    const wanted = label.toLowerCase();
    const candidates = root.querySelectorAll('button, a, [role="button"]');

    return Array.from(candidates).find((candidate) => {
        const text = normalizeText(candidate.textContent).toLowerCase();
        return text === wanted || text.startsWith(`${wanted} `);
    });
}

function getActionBlock(action) {
    if (!action) return null;

    let block = action;
    let depth = 0;

    while (block.parentElement && block.parentElement !== document.body && depth < 3) {
        const parent = block.parentElement;
        const parentText = normalizeText(parent.textContent);
        const buttons = parent.querySelectorAll('button, a, [role="button"]');

        if (buttons.length > 1) break;
        if (parentText.length > 90 && !/^\s*(join|chat|view profile)/i.test(parentText)) break;
        if (parent.children.length > 4) break;

        block = parent;
        depth += 1;
    }

    return block;
}

function getPopoverGameName(root) {
    const text = normalizeText(root?.textContent || '');
    const match = text.match(/\bis playing\s+(.+?)(?:\s+Join\b|\s+Chat\b|\s+View Profile\b|\s+SUBPLACE\b|$)/i);
    return normalizeText(match?.[1] || '');
}

function presenceMatchesPopover(root, presence) {
    if (!presence?.placeId) return false;

    const popupGameName = getPopoverGameName(root).toLowerCase();
    const lastLocation = normalizeText(presence.lastLocation).toLowerCase();
    if (!popupGameName || !lastLocation) return true;

    return popupGameName.includes(lastLocation) || lastLocation.includes(popupGameName);
}

function getHomePresenceKey(presence) {
    if (!presence) return '';

    return [
        normalizeId(presence.userId),
        normalizeId(presence.placeId),
        normalizeId(presence.rootPlaceId),
        normalizeId(presence.universeId),
        presence.gameId || '',
    ].join(':');
}

async function resolveHomePopoverPresence(root) {
    const context = getFreshHomeContext();
    const directPresence = findPresenceNearElement(root) || context?.presence || null;
    const userIds = Array.from(
        new Set(
            [findUserIdInElement(root), directPresence?.userId, context?.userId]
                .map((id) => Number(id))
                .filter((id) => Number.isFinite(id) && id > 0),
        ),
    );

    for (const userId of userIds) {
        const cachedPresence = await fetchPresenceForUserId(userId, { forceFresh: false });
        if (
            cachedPresence?.userPresenceType === 2 &&
            cachedPresence.placeId &&
            presenceMatchesPopover(root, cachedPresence)
        ) {
            return cachedPresence;
        }

        const presence = await fetchPresenceForUserId(userId, { forceFresh: true });
        if (
            presence?.userPresenceType === 2 &&
            presence.placeId &&
            presenceMatchesPopover(root, presence)
        ) {
            return presence;
        }
    }

    const username = extractUsernameFromText(root.textContent) || context?.username || '';
    const userId = await resolveUserIdFromUsername(username);
    if (userId) {
        const cachedPresence = await fetchPresenceForUserId(userId, { forceFresh: false });
        if (
            cachedPresence?.userPresenceType === 2 &&
            cachedPresence.placeId &&
            presenceMatchesPopover(root, cachedPresence)
        ) {
            return cachedPresence;
        }

        const presence = await fetchPresenceForUserId(userId, { forceFresh: true });
        if (
            presence?.userPresenceType === 2 &&
            presence.placeId &&
            presenceMatchesPopover(root, presence)
        ) {
            return presence;
        }
    }

    if (
        directPresence?.userPresenceType === 2 &&
        directPresence.placeId &&
        presenceMatchesPopover(root, directPresence)
    ) {
        return directPresence;
    }

    return null;
}

function insertHomeSubplaceCard(root, card) {
    root.classList.add('rovalra-home-subplace-host');
    card.classList.add('rovalra-home-subplace-card');
    card.removeAttribute('style');

    const viewProfile = findActionElement(root, 'View Profile');
    const viewProfileBlock = getActionBlock(viewProfile);
    if (viewProfileBlock?.parentElement && root.contains(viewProfileBlock.parentElement)) {
        viewProfileBlock.after(card);
        return;
    }

    const chat = findActionElement(root, 'Chat');
    const chatBlock = getActionBlock(chat);
    if (chatBlock?.parentElement && root.contains(chatBlock.parentElement)) {
        chatBlock.after(card);
        return;
    }

    const join = findActionElement(root, 'Join');
    const joinBlock = getActionBlock(join);
    if (joinBlock?.parentElement && root.contains(joinBlock.parentElement)) {
        joinBlock.after(card);
        return;
    }

    root.appendChild(card);
}


function clearHomeBuildRetry(root) {
    const state = homeBuildRetryState.get(root);
    if (state?.timer) clearTimeout(state.timer);
    homeBuildRetryState.delete(root);
}

function scheduleHomeBuildRetry(root) {
    if (!root || !document.body.contains(root)) return;
    if (!getFreshHomeContext()) return;

    const state = homeBuildRetryState.get(root) || { count: 0, timer: null };
    if (state.count >= HOME_BUILD_RETRY_DELAYS.length) return;

    if (state.timer) clearTimeout(state.timer);
    const delay = HOME_BUILD_RETRY_DELAYS[state.count];
    state.count += 1;
    state.timer = setTimeout(() => {
        state.timer = null;
        if (!document.body.contains(root) || !getFreshHomeContext()) {
            clearHomeBuildRetry(root);
            return;
        }

        processHomePopoverCandidate(root);
    }, delay);

    homeBuildRetryState.set(root, state);
}

async function addHomeSubplaceCard(root) {
    if (!(await isHomeSubplaceEnabled())) return;
    if (!root || !document.body.contains(root)) return;
    if (!isHomeUserPopover(root)) return;

    let promise = homeBuildPromises.get(root);
    if (!promise) {
        promise = resolveHomePopoverPresence(root);
        homeBuildPromises.set(root, promise);
    }

    const presence = await promise;
    homeBuildPromises.delete(root);

    if (!document.body.contains(root) || !isHomeUserPopover(root)) return;

    const existing = root.querySelector(':scope > .rovalra-home-subplace-card');
    if (presence?.userPresenceType !== 2 || !presence.placeId) {
        existing?.remove();
        scheduleHomeBuildRetry(root);
        return;
    }

    const key = getHomePresenceKey(presence);
    if (existing?.dataset.rovalraPresenceKey === key) return;

    const card = await createSubplaceDetailsCard(presence);
    if (!card || !document.body.contains(root) || !isHomeUserPopover(root)) {
        existing?.remove();
        scheduleHomeBuildRetry(root);
        return;
    }

    clearHomeBuildRetry(root);
    existing?.remove();
    card.dataset.rovalraPresenceKey = key;
    insertHomeSubplaceCard(root, card);
}

function processHomePopoverCandidate(candidate) {
    const root = findHomePopoverRoot(candidate);
    if (!root) return;
    addHomeSubplaceCard(root).catch(() => {});
}

function cleanupHomeSubplaceCards() {
    document.querySelectorAll('.rovalra-home-subplace-card').forEach((card) => {
        const host = card.closest('.rovalra-home-subplace-host');

        // Roblox briefly changes hover-card size/visibility while it refreshes the
        // popup. Removing our section during that short refresh caused the
        // SUBPLACE block to close and rebuild when hovering the same user again.
        // If the host is still connected, keep the card attached and let
        // addHomeSubplaceCard replace it only when the actual presence key changes.
        if (!host || !document.body.contains(host)) {
            card.remove();
            if (host) {
                clearHomeBuildRetry(host);
                host.classList.remove('rovalra-home-subplace-host');
            }
        }
    });
}

function addHomeActionButtonCandidates(candidates) {
    document.querySelectorAll('button, a, [role="button"]').forEach((action) => {
        if (action.closest?.('.rovalra-home-subplace-card')) return;

        const text = normalizeText(action.textContent).toLowerCase();
        if (text !== 'join' && text !== 'chat' && text !== 'view profile') return;

        const root = findHomePopoverRoot(action);
        if (root) candidates.add(root);
    });
}

function addHomeMutationCandidates(candidates) {
    homeMutationPopoverCandidates.forEach((node) => {
        if (!node || !document.body.contains(node)) {
            homeMutationPopoverCandidates.delete(node);
            return;
        }

        candidates.add(node);

        node.querySelectorAll?.(
            [
                HOME_POPOVER_SELECTORS,
                'button',
                'a',
                '[role="button"]',
            ].join(','),
        ).forEach((element) => candidates.add(element));
    });

    homeMutationPopoverCandidates.clear();
}

async function scanHomePopovers() {
    if (!(await isHomeSubplaceEnabled())) {
        homeMutationPopoverCandidates.clear();
        cleanupHomeSubplaceCards();
        return;
    }

    cleanupHomeSubplaceCards();

    const context = getFreshHomeContext();
    if (!context) return;

    const candidates = new Set();
    const targetRoot = findHomePopoverRoot(context.target);
    if (targetRoot) candidates.add(targetRoot);

    addHomeMutationCandidates(candidates);

    document.querySelectorAll(HOME_POPOVER_SELECTORS).forEach((element) => {
        if (!element.closest?.('.rovalra-home-subplace-card')) {
            candidates.add(element);
        }
    });

    addHomeActionButtonCandidates(candidates);

    candidates.forEach(processHomePopoverCandidate);
}

function scanHomePopoversSoon() {
    if (homeScanFrame) cancelAnimationFrame(homeScanFrame);

    homeScanFrame = requestAnimationFrame(() => {
        homeScanFrame = 0;
        scanHomePopovers().catch(() => {});
    });
}

function scheduleHomePopoverScan() {
    homeScanTimers.forEach((timer) => clearTimeout(timer));
    scanHomePopoversSoon();
    homeScanTimers = HOME_SCAN_DELAYS
        .filter((delay) => delay > 0)
        .map((delay) =>
            setTimeout(() => {
                scanHomePopovers().catch(() => {});
            }, delay),
        );
}

function nodeCouldContainHomePopover(node) {
    if (!getFreshHomeContext()) return false;
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    if (node.closest?.('.rovalra-home-subplace-card')) return false;

    if (node.matches?.(HOME_POPOVER_SELECTORS)) return true;
    if (node.querySelector?.(HOME_POPOVER_SELECTORS)) return true;

    const text = normalizeText(node.textContent || '');
    if (!text || text.length > 1200) return false;

    return /\bis playing\b|\bView Profile\b|\bJoin\b/i.test(text);
}

function registerHomePopoverObserver() {
    if (homeMutationObserver || !document.body) return;

    homeMutationObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes || []) {
                if (!nodeCouldContainHomePopover(node)) continue;
                homeMutationPopoverCandidates.add(node);
                scheduleHomePopoverScan();
                return;
            }
        }
    });

    homeMutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
    });
}

async function registerHomeSubplacePopovers() {
    if (!(await isHomeSubplaceEnabled())) {
        cleanupHomeSubplaceCards();
        return;
    }
    if (homePopoverObserverRegistered) return;
    homePopoverObserverRegistered = true;

    document.addEventListener('pointerover', updateHomeHoverContext, true);
    document.addEventListener('mouseover', updateHomeHoverContext, true);
    document.addEventListener('focusin', updateHomeHoverContext, true);
    registerHomePopoverObserver();
}

function getExperienceUrl(presence) {
    const placeId = presence?.placeId || presence?.rootPlaceId;
    return placeId ? `https://www.roblox.com/games/${placeId}/-` : '';
}

function getProfilePresence() {
    const userId = getProfileUserIdFromUrl();
    if (!userId) {
        profilePresencePromise = null;
        profilePresenceUserId = 0;
        return Promise.resolve(null);
    }

    if (profilePresencePromise && profilePresenceUserId === userId) {
        return profilePresencePromise;
    }

    profilePresenceUserId = userId;
    profilePresencePromise = fetchPresenceBatched(userId);
    return profilePresencePromise;
}

function getTargetRoot(target) {
    if (!target) return null;

    const currentPlayingRoot = target.closest?.(
        [
            '.currently-playing-card',
            '.rovalra-currently-playing-link',
            '[data-testid*="currently-playing" i]',
            '[class*="currently-playing" i]',
        ].join(','),
    );

    if (currentPlayingRoot) return currentPlayingRoot;

    const gameLink = target.closest?.('a[href*="/games/"]');
    if (gameLink) {
        let candidate = gameLink;
        let depth = 0;

        while (candidate && candidate !== document.body && depth < 5) {
            const text = normalizeText(candidate.textContent);
            const hasGameLink = Boolean(candidate.querySelector?.('a[href*="/games/"]'));
            const hasGameVisual = Boolean(
                candidate.querySelector?.(
                    'img, .thumbnail-2d-container, .game-card-thumb-container',
                ),
            );
            const looksLikePlayingCard =
                /\bMaturity:/i.test(text) ||
                String(candidate.className || '')
                    .toLowerCase()
                    .includes('currently-playing');

            if (looksLikePlayingCard || (hasGameLink && hasGameVisual)) {
                return candidate;
            }

            candidate = candidate.parentElement;
            depth += 1;
        }

        return gameLink;
    }

    return target.closest?.('button, [role="button"]') || target;
}


function elementIsModernPlayingCard(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;

    const text = normalizeText(element.textContent);
    const className = String(element.className || '').toLowerCase();
    const testId = String(element.getAttribute?.('data-testid') || '').toLowerCase();
    const hasGameVisual = Boolean(
        element.querySelector?.(
            'img, .thumbnail-2d-container, .game-card-thumb-container',
        ),
    );

    if (!hasGameVisual) return false;
    if (!(/\bMaturity:/i.test(text) || className.includes('currently-playing') || testId.includes('currently-playing'))) return false;
    if (/\b(Edit avatar|Edit profile|Profile Views|Friends|Followers|Following|About|Creations)\b/i.test(text)) return false;

    return true;
}

function findModernPlayingCardRoot(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return null;

    let current = element;
    let depth = 0;
    while (current && current !== document.body && depth < 6) {
        if (elementIsModernPlayingCard(current)) return current;
        current = current.parentElement;
        depth += 1;
    }

    const candidates = element.querySelectorAll?.(
        [
            CARD_SELECTOR,
            '[data-testid*="currently-playing" i]',
            '[class*="currently-playing" i]',
            'a[href*="/games/"]',
            'div',
        ].join(','),
    );

    return Array.from(candidates || []).find(elementIsModernPlayingCard) || null;
}

function findModernInsertParent(target) {
    const targetRoot = getTargetRoot(target);
    if (!targetRoot) return null;

    const modernPlayingCard = findModernPlayingCardRoot(targetRoot);
    if (modernPlayingCard) return modernPlayingCard.parentElement || modernPlayingCard;

    return null;
}


function isLikelyModernProfileCard(target) {
    const targetRoot = getTargetRoot(target);
    return Boolean(findModernPlayingCardRoot(targetRoot));
}

function isInsideIgnoredProfileArea(element) {
    return Boolean(
        element.closest(
            [
                '.rovalra-current-subplace-card',
                '.rovalra-subplace-hover-card',
                '.rovalra-profile-subplace-list',
                '.game-carousel',
                '.game-grid',
                '.profile-games',
                '.profile-creations',
                '.creations',
                '[data-testid*="creations" i]',
            ].join(','),
        ),
    );
}

function elementLooksLikeProfileHeader(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;
    if (isInsideIgnoredProfileArea(element)) return false;

    let current = element;
    let depth = 0;
    while (current && current !== document.body && depth < 8) {
        const className = String(current.className || '').toLowerCase();
        const id = String(current.id || '').toLowerCase();

        if (
            className.includes('profile-header') ||
            className.includes('profile-stat') ||
            className.includes('profile-about') ||
            id.includes('profile-header')
        ) {
            return true;
        }

        current = current.parentElement;
        depth += 1;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.top + window.scrollY < 460;
}

function hrefContainsPlaceId(element, placeIds) {
    const href = element.getAttribute?.('href') || '';
    return placeIds.some((placeId) => placeId && href.includes(`/games/${placeId}`));
}

function textMatchesPresence(element, presence) {
    const text = normalizeText(element.textContent).toLowerCase();
    const lastLocation = normalizeText(presence?.lastLocation).toLowerCase();

    return Boolean(lastLocation && text && text.includes(lastLocation));
}

function matchesProfilePlayingTarget(element, presence) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;
    if (!presence || presence.userPresenceType !== 2 || !presence.placeId) {
        return false;
    }

    const targetRoot = getTargetRoot(element);
    if (!targetRoot || isInsideIgnoredProfileArea(targetRoot)) return false;

    if (targetRoot.matches(CARD_SELECTOR)) return true;

    const placeIds = [
        normalizeId(presence.placeId),
        normalizeId(presence.rootPlaceId),
    ];

    return (
        hrefContainsPlaceId(targetRoot, placeIds) ||
        textMatchesPresence(targetRoot, presence)
    );
}

function hasExistingProfileListNear(target) {
    const targetRoot = getTargetRoot(target);
    const parent = targetRoot?.parentElement;
    const modernParent = findModernInsertParent(target);

    return Boolean(
        targetRoot?.querySelector(`.${LIST_CLASS}`) ||
            parent?.querySelector(`:scope > .${LIST_CLASS}`) ||
            modernParent?.querySelector(`:scope > .${LIST_CLASS}`),
    );
}

function hasExistingModernProfileButtonNear(target) {
    const targetRoot = getTargetRoot(target);
    const parent = targetRoot?.parentElement;
    const modernParent = findModernInsertParent(target);

    return Boolean(
        targetRoot?.querySelector('.rovalra-current-subplace-card.rovalra-profile-subplace-modern') ||
            parent?.querySelector(':scope > .rovalra-current-subplace-card.rovalra-profile-subplace-modern') ||
            modernParent?.querySelector(':scope > .rovalra-current-subplace-card.rovalra-profile-subplace-modern'),
    );
}


function resolveProfileStyle(target) {
    return isLikelyModernProfileCard(target) ? 'modern' : 'compact';
}


function insertCompactProfileCard(target, card) {
    const targetRoot = getTargetRoot(target);
    if (!targetRoot || !targetRoot.parentElement) return false;
    if (hasExistingProfileListNear(targetRoot)) return true;

    card.classList.add('rovalra-profile-subplace-compact');
    card.removeAttribute('style');
    targetRoot.after(card);
    return true;
}


function insertModernProfileCard(target, card) {
    const insertParent = findModernInsertParent(target);
    if (!insertParent) return false;
    if (insertParent.querySelector(':scope > .rovalra-current-subplace-card.rovalra-profile-subplace-modern')) return true;

    card.classList.add('rovalra-profile-subplace-modern');
    card.removeAttribute('style');
    insertParent.appendChild(card);
    return true;
}


function findElementByText(selector, pattern) {
    return Array.from(document.querySelectorAll(selector)).find((element) =>
        pattern.test(normalizeText(element.textContent)),
    );
}

function isProfileViewsText(element) {
    return /^(?:[\d,.]+[KMB]?\s+)?Profile Views$/i.test(
        normalizeText(element?.textContent),
    );
}

function getProfileViewsAnchor(element) {
    if (!element || !isProfileViewsText(element)) return null;

    let anchor = element;
    let current = element.parentElement;
    let depth = 0;

    while (current && current !== document.body && depth < 3) {
        const text = normalizeText(current.textContent);
        const childCount = current.children.length;

        if (isProfileViewsText(current) && childCount <= 4) {
            anchor = current;
            current = current.parentElement;
            depth += 1;
            continue;
        }

        break;
    }

    const rect = anchor.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    return anchor;
}

function getProfileHeaderInfoCandidates() {
    return Array.from(
        document.querySelectorAll(
            [
                '.user-profile-header-info',
                '[class*="profile-header-info" i]',
                '[class*="profile-header" i]',
            ].join(','),
        ),
    ).filter((element) => element && !isInsideIgnoredProfileArea(element));
}

function findProfileViewsInHeaderInfo(headerInfo) {
    if (!headerInfo) return null;

    const directPill = headerInfo.querySelector('.rovalra-profile-views-pill');
    const directAnchor = getProfileViewsAnchor(directPill);
    if (directAnchor) return directAnchor;

    return getProfileViewsAnchor(
        findElementByText(
            [
                ':scope .rovalra-profile-views-pill',
                ':scope span',
                ':scope div',
                ':scope button',
                ':scope a',
            ].join(','),
            /^(?:[\d,.]+[KMB]?\s+)?Profile Views$/i,
        ),
    );
}

function findLegacyChipInsertContainer() {
    for (const headerInfo of getProfileHeaderInfoCandidates()) {
        const profileViews = findProfileViewsInHeaderInfo(headerInfo);
        if (profileViews?.parentElement) {
            return {
                container: profileViews.parentElement,
                anchor: profileViews,
                headerInfo,
            };
        }
    }

    const directProfileViews = getProfileViewsAnchor(
        document.querySelector('.rovalra-profile-views-pill'),
    );

    if (!directProfileViews?.parentElement) return null;

    return {
        container: directProfileViews.parentElement,
        anchor: directProfileViews,
        headerInfo: null,
    };
}


function findProfileHeaderIdentityRoot(info) {
    if (!info?.container) return null;

    const candidates = [
        info.headerInfo,
        info.container.closest?.('[class*="profile-header" i]'),
        info.container.closest?.('.user-profile-header-info'),
        info.container.parentElement,
    ];

    return candidates.find(
        (candidate) => candidate && candidate.nodeType === Node.ELEMENT_NODE,
    ) || null;
}

function profileHeaderIdentityIsLoaded(info) {
    const root = findProfileHeaderIdentityRoot(info);
    if (!root) return false;

    const text = normalizeText(root.textContent || '');
    if (!text) return false;

    // Roblox profiles always expose the @username after the header has finished
    // hydrating. During the first loading layout only the stats/avatar are often
    // present, which made the subplace chip reveal in the wrong spot for a few
    // frames.
    if (/@[A-Za-z0-9_]{3,20}\b/.test(text)) return true;

    // Some localized/experimental layouts place the handle in attributes first.
    const labelled = Array.from(root.querySelectorAll?.('[aria-label], [title]') || [])
        .map((element) => `${element.getAttribute('aria-label') || ''} ${element.getAttribute('title') || ''}`)
        .join(' ');

    return /@[A-Za-z0-9_]{3,20}\b/.test(labelled);
}

function getProfileHeaderReadyKey(info) {
    const root = findProfileHeaderIdentityRoot(info);
    if (!root) return '';

    const rect = getPlacementRect(root);
    const text = normalizeText(root.textContent || '');
    const handle = text.match(/@[A-Za-z0-9_]{3,20}\b/)?.[0] || '';

    return rect ? `${rect.top}:${rect.left}:${rect.width}:${rect.height}:${handle}` : handle;
}

function getElementIndex(element) {
    if (!element?.parentElement) return -1;
    return Array.from(element.parentElement.children).indexOf(element);
}

function syncLegacyChipWithAnchor(chip, anchor) {
    if (!chip || !anchor || !document.body.contains(anchor)) return;

    const style = getComputedStyle(anchor);
    const rect = anchor.getBoundingClientRect();

    if (rect.height > 0) {
        chip.style.height = `${Math.round(rect.height)}px`;
        chip.style.minHeight = `${Math.round(rect.height)}px`;
    }

    chip.style.display = 'inline-flex';
    chip.style.alignItems = 'center';
    chip.style.gap = '6px';
    chip.style.width = 'fit-content';
    chip.style.maxWidth = 'min(220px, 42vw)';
    chip.style.margin = '0';
    chip.style.boxSizing = 'border-box';
    chip.style.verticalAlign = 'middle';
    chip.style.borderRadius = style.borderRadius;
    chip.style.paddingTop = style.paddingTop;
    chip.style.paddingRight = style.paddingRight;
    chip.style.paddingBottom = style.paddingBottom;
    chip.style.paddingLeft = style.paddingLeft;
    chip.style.fontSize = style.fontSize;
    chip.style.fontWeight = style.fontWeight;
    chip.style.lineHeight = style.lineHeight;

    if (style.backgroundColor) chip.style.backgroundColor = style.backgroundColor;
    if (style.color) chip.style.color = style.color;
    if (style.borderTopWidth && style.borderTopStyle && style.borderTopColor) {
        chip.style.border = `${style.borderTopWidth} ${style.borderTopStyle} ${style.borderTopColor}`;
    }
}

function getLegacyRows() {
    return Array.from(document.querySelectorAll(`.${LEGACY_ROW_CLASS}`));
}

function getLegacyRowForInfo(info) {
    if (!info?.container || !info.anchor) return null;

    let row = info.container.querySelector(`:scope > .${LEGACY_ROW_CLASS}`);
    if (!row) {
        row = document.createElement('div');
        row.className = LEGACY_ROW_CLASS;
    }

    return row;
}

function cleanupDuplicateLegacyChips(info = findLegacyChipInsertContainer()) {
    const chips = Array.from(document.querySelectorAll(`.${LEGACY_CHIP_CLASS}`));
    const rows = getLegacyRows();

    if (!chips.length) {
        rows.forEach((row) => row.remove());
        return null;
    }

    let keeper = null;
    let keeperRow = null;

    if (info?.container && info.anchor) {
        keeperRow = getLegacyRowForInfo(info);
        keeper = keeperRow?.querySelector(`:scope > .${LEGACY_CHIP_CLASS}`);

        if (!keeper) {
            const chipsInContainer = chips.filter(
                (chip) =>
                    chip.parentElement === info.container ||
                    chip.closest(`.${LEGACY_ROW_CLASS}`)?.parentElement === info.container,
            );

            const anchorIndex = getElementIndex(info.anchor);
            keeper = chipsInContainer
                .slice()
                .sort((a, b) => {
                    const aItem = a.closest(`.${LEGACY_ROW_CLASS}`) || a;
                    const bItem = b.closest(`.${LEGACY_ROW_CLASS}`) || b;
                    return (
                        Math.abs(getElementIndex(aItem) - anchorIndex) -
                        Math.abs(getElementIndex(bItem) - anchorIndex)
                    );
                })[0];
        }
    }

    if (!keeper) {
        keeper = chips.find((chip) => chip.isConnected) || chips[0];
    }

    for (const chip of chips) {
        if (chip !== keeper) chip.remove();
    }

    rows.forEach((row) => {
        if (row !== keeperRow && !row.contains(keeper)) row.remove();
    });

    return keeper;
}

function cleanupProfileSubplaceCards() {
    cleanupDuplicateLegacyChips();

    document
        .querySelectorAll(
            '.rovalra-current-subplace-card.rovalra-profile-subplace-modern',
        )
        .forEach((button) => button.remove());
}

function getPlacementRect(element) {
    const rect = element?.getBoundingClientRect?.();
    if (!rect) return null;

    return {
        top: Math.round(rect.top),
        left: Math.round(rect.left),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        bottom: Math.round(rect.bottom),
    };
}

function getLegacyChipPlacementItem(chip) {
    return chip?.closest?.(`.${LEGACY_ROW_CLASS}`) || chip;
}

function isLegacyChipAfterAnchor(chip, anchor) {
    const item = getLegacyChipPlacementItem(chip);
    return Boolean(item && anchor && item.previousElementSibling === anchor);
}

function isLegacyChipPlacedUnderAnchor(chip, anchor) {
    const chipRect = getPlacementRect(chip);
    const anchorRect = getPlacementRect(anchor);

    if (!chipRect || !anchorRect) return false;
    if (chipRect.width <= 0 || chipRect.height <= 0) return false;
    if (anchorRect.width <= 0 || anchorRect.height <= 0) return false;

    return (
        chipRect.top >= anchorRect.bottom - 2 &&
        Math.abs(chipRect.left - anchorRect.left) <= 80
    );
}

function shouldKeepLegacyChipVisible(chip, anchor) {
    return Boolean(
        chip?.classList?.contains(LEGACY_READY_CLASS) &&
            isLegacyChipAfterAnchor(chip, anchor) &&
            isLegacyChipPlacedUnderAnchor(chip, anchor),
    );
}

function setLegacyChipPendingInlineState(chip, pending) {
    if (!chip) return;

    if (pending) {
        chip.style.visibility = 'hidden';
        chip.style.opacity = '0';
        chip.style.pointerEvents = 'none';
        return;
    }

    chip.style.removeProperty('visibility');
    chip.style.removeProperty('opacity');
    chip.style.removeProperty('pointer-events');
}

function setLegacyRowPendingState(chip, pending) {
    const row = chip?.closest?.(`.${LEGACY_ROW_CLASS}`);
    if (!row) return;

    row.classList.toggle(LEGACY_ROW_PENDING_CLASS, pending);
    row.classList.toggle(LEGACY_ROW_READY_CLASS, !pending);
    setLegacyChipPendingInlineState(chip, pending);

    if (pending) {
        row.style.height = '0px';
        row.style.minHeight = '0px';
        row.style.maxHeight = '0px';
        row.style.margin = '0px';
        row.style.padding = '0px';
        row.style.overflow = 'hidden';
        row.style.visibility = 'hidden';
        row.style.opacity = '0';
        row.style.pointerEvents = 'none';
        return;
    }

    row.style.removeProperty('height');
    row.style.removeProperty('min-height');
    row.style.removeProperty('max-height');
    row.style.removeProperty('margin');
    row.style.removeProperty('padding');
    row.style.removeProperty('overflow');
    row.style.removeProperty('visibility');
    row.style.removeProperty('opacity');
    row.style.removeProperty('pointer-events');
}

function scheduleLegacyChipReveal(chip, anchor, info = null) {
    if (!chip || !anchor) return;

    const placementInfo = info || findLegacyChipInsertContainer();

    const previousFrame = Number(chip.dataset.rovalraPlacementFrame || 0);
    if (previousFrame) cancelAnimationFrame(previousFrame);

    if (profileHeaderIdentityIsLoaded(placementInfo) && shouldKeepLegacyChipVisible(chip, anchor)) {
        delete chip.dataset.rovalraPlacementFrame;
        syncLegacyChipWithAnchor(chip, anchor);
        setLegacyRowPendingState(chip, false);
        return;
    }

    chip.classList.remove(LEGACY_READY_CLASS);
    chip.classList.add(LEGACY_PENDING_CLASS);
    setLegacyRowPendingState(chip, true);

    let lastAnchorRect = null;
    let lastHeaderKey = null;
    let stableFrames = 0;

    const reveal = () => {
        delete chip.dataset.rovalraPlacementFrame;
        syncLegacyChipWithAnchor(chip, anchor);
        chip.classList.remove(LEGACY_PENDING_CLASS);
        chip.classList.add(LEGACY_READY_CLASS);
        setLegacyRowPendingState(chip, false);
    };

    const tick = () => {
        if (!chip.isConnected || !document.body.contains(anchor)) {
            delete chip.dataset.rovalraPlacementFrame;
            chip.classList.remove(LEGACY_READY_CLASS);
            setLegacyRowPendingState(chip, true);
            return;
        }

        syncLegacyChipWithAnchor(chip, anchor);

        const anchorRect = getPlacementRect(anchor);
        const currentRect = anchorRect
            ? `${anchorRect.top}:${anchorRect.left}:${anchorRect.width}:${anchorRect.height}`
            : '';
        const headerKey = getProfileHeaderReadyKey(placementInfo);
        const identityReady = profileHeaderIdentityIsLoaded(placementInfo);

        if (identityReady && currentRect && currentRect === lastAnchorRect && headerKey === lastHeaderKey) {
            stableFrames += 1;
        } else {
            stableFrames = 0;
            lastAnchorRect = currentRect;
            lastHeaderKey = headerKey;
        }

        if (stableFrames >= 8 && isLegacyChipAfterAnchor(chip, anchor)) {
            reveal();
            return;
        }

        chip.dataset.rovalraPlacementFrame = String(requestAnimationFrame(tick));
    };

    chip.dataset.rovalraPlacementFrame = String(requestAnimationFrame(tick));
}

function insertChipAfterAnchor(container, anchor, chip, info = null) {
    if (!container || !chip) return false;

    container.classList.add(LEGACY_HOST_CLASS);

    const placementInfo = info || { container, anchor, headerInfo: findProfileHeaderIdentityRoot({ container, anchor }) };
    const row = getLegacyRowForInfo(placementInfo);
    const alreadyStable = shouldKeepLegacyChipVisible(chip, anchor);

    if (!alreadyStable) {
        chip.classList.remove(LEGACY_READY_CLASS);
        chip.classList.add(LEGACY_PENDING_CLASS);
        row.classList.add(LEGACY_ROW_PENDING_CLASS);
        row.classList.remove(LEGACY_ROW_READY_CLASS);
    } else {
        row.classList.remove(LEGACY_ROW_PENDING_CLASS);
        row.classList.add(LEGACY_ROW_READY_CLASS);
    }

    if (anchor?.parentElement === container) {
        if (row.parentElement !== container || row.previousElementSibling !== anchor) {
            anchor.after(row);
        }
    } else if (row.parentElement !== container) {
        container.appendChild(row);
    }

    if (chip.parentElement !== row) row.appendChild(chip);

    syncLegacyChipWithAnchor(chip, anchor);
    scheduleLegacyChipReveal(chip, anchor, placementInfo);
    return true;
}


async function insertLegacyProfileSubplaceButton(target, presence) {
    const info = findLegacyChipInsertContainer(target);
    if (!info?.container || !info.anchor) return false;

    if (!profileHeaderIdentityIsLoaded(info)) {
        const existing = cleanupDuplicateLegacyChips(info);
        if (existing) {
            existing.classList.remove(LEGACY_READY_CLASS);
            existing.classList.add(LEGACY_PENDING_CLASS);
            setLegacyRowPendingState(existing, true);
        }
        return false;
    }

    let existingInContainer = cleanupDuplicateLegacyChips(info);

    if (existingInContainer) {
        if (!isLegacyChipAfterAnchor(existingInContainer, info.anchor)) {
            insertChipAfterAnchor(info.container, info.anchor, existingInContainer, info);
        } else {
            syncLegacyChipWithAnchor(existingInContainer, info.anchor);
            scheduleLegacyChipReveal(existingInContainer, info.anchor, info);
        }
        cleanupDuplicateLegacyChips(info);
        return true;
    }

    const chip = await createPersistentSubplaceCard(presence, {
        detailedHover: true,
    });

    if (!chip) return false;

    chip.classList.add(LEGACY_CHIP_CLASS, LEGACY_PENDING_CLASS);
    chip.removeAttribute('style');
    setLegacyChipPendingInlineState(chip, true);
    insertChipAfterAnchor(info.container, info.anchor, chip, info);
    cleanupDuplicateLegacyChips(info);
    return true;
}

function hasModernProfilePlayingCard() {
    return Array.from(
        document.querySelectorAll(
            [
                CARD_SELECTOR,
                '[data-testid*="currently-playing" i]',
                '[class*="currently-playing" i]',
            ].join(','),
        ),
    ).some((element) => isLikelyModernProfileCard(element));
}

async function addLegacyProfileSubplaceChipFallback(presence) {
    if (!presence || presence.userPresenceType !== 2 || !presence.placeId) return;

    const info = findLegacyChipInsertContainer(document.body);
    if (!info?.container || !info.anchor) return;

    const existing = cleanupDuplicateLegacyChips(info);
    if (existing) {
        if (!isLegacyChipAfterAnchor(existing, info.anchor)) {
            insertChipAfterAnchor(info.container, info.anchor, existing);
        } else {
            syncLegacyChipWithAnchor(existing, info.anchor);
            scheduleLegacyChipReveal(existing, info.anchor, info);
        }
        return;
    }

    if (info.container.dataset.rovalraLegacySubplaceChipLoading === 'true') return;

    info.container.dataset.rovalraLegacySubplaceChipLoading = 'true';

    try {
        await insertLegacyProfileSubplaceButton(document.body, presence);
    } finally {
        delete info.container.dataset.rovalraLegacySubplaceChipLoading;
    }
}


async function addProfileSubplaceCardForTarget(target, presence) {
    if (!(await isProfileSubplaceEnabled())) return;
    if (!presence || presence.userPresenceType !== 2 || !presence.placeId) return;
    await insertLegacyProfileSubplaceButton(target || document.body, presence);
}


async function addProfileSubplaceCard(target) {
    const presence = await getProfilePresence();
    if (presence?.userPresenceType !== 2 || !presence.placeId) return;

    await addProfileSubplaceCardForTarget(target, presence);
}

async function processProfileGameLinkCandidate(candidate) {
    const presence = await getProfilePresence();
    if (presence?.userPresenceType !== 2 || !presence.placeId) return;

    if (matchesProfilePlayingTarget(candidate, presence)) {
        await addProfileSubplaceCardForTarget(candidate, presence);
    }
}

async function scanProfilePlayingTargets() {
    if (!(await isProfileSubplaceEnabled())) {
        cleanupProfileSubplaceCards();
        return;
    }

    const presence = await getProfilePresence();
    if (presence?.userPresenceType !== 2 || !presence.placeId) {
        cleanupProfileSubplaceCards();
        return;
    }

    cleanupProfileSubplaceCards();

    const candidates = new Set();
    document.querySelectorAll(CARD_SELECTOR).forEach((element) => candidates.add(element));
    document.querySelectorAll(GAME_LINK_SELECTOR).forEach((element) => candidates.add(element));

    for (const candidate of candidates) {
        if (matchesProfilePlayingTarget(candidate, presence)) {
            await addProfileSubplaceCardForTarget(candidate, presence);
        }
    }

    await addLegacyProfileSubplaceChipFallback(presence);
    cleanupProfileSubplaceCards();
}

async function scheduleProfileScans() {
    profileScanTimers.forEach((timer) => clearTimeout(timer));
    if (!(await isProfileSubplaceEnabled())) {
        cleanupProfileSubplaceCards();
        return;
    }
    profileScanTimers = PROFILE_SCAN_DELAYS.map((delay) =>
        setTimeout(() => {
            scanProfilePlayingTargets().catch(() => {});
        }, delay),
    );
}

async function registerProfileFallbackSubplaces() {
    if (!(await isProfileSubplaceEnabled())) {
        cleanupProfileSubplaceCards();
        return;
    }
    if (profileFallbackObserverRegistered) return;
    profileFallbackObserverRegistered = true;

    observeElement(GAME_LINK_SELECTOR, processProfileGameLinkCandidate, {
        multiple: true,
    });

    observeElement(
        [
            '.rovalra-profile-views-pill',
            '[class*="profile-header" i]',
            '[id*="profile-header" i]',
        ].join(','),
        () => scheduleProfileScans(),
        { multiple: true },
    );

    scheduleProfileScans();
}

export async function init() {
    if (!(await settings.currentlyPlayingSubplaceEnabled)) {
        cleanupHomeSubplaceCards();
        cleanupProfileSubplaceCards();
        return;
    }

    const homeEnabled = await isHomeSubplaceEnabled();
    const profileEnabled = await isProfileSubplaceEnabled();

    if (homeEnabled) {
        await registerHomeSubplacePopovers();
    } else {
        cleanupHomeSubplaceCards();
    }

    if (!profileEnabled || !getProfileUserIdFromUrl()) {
        cleanupProfileSubplaceCards();
        return;
    }

    await registerProfileFallbackSubplaces();

    if (observerRegistered) {
        await scheduleProfileScans();
        return;
    }

    observerRegistered = true;
    observeElement(CARD_SELECTOR, addProfileSubplaceCard, {
        multiple: true,
    });

    await scheduleProfileScans();
}
