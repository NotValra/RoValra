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

let observerRegistered = false;
let profileFallbackObserverRegistered = false;
let profilePresencePromise = null;
let profilePresenceUserId = 0;

const NATIVE_POPOVER_SELECTORS = [
    '.profile-card',
    '.profile-card-container',
    '.profile-hover-card',
    '.popover',
    '.popover-content',
    '.tooltip',
    '[role="dialog"]',
    '[role="tooltip"]',
    '[data-testid*="popover" i]',
    '[class*="popover" i]',
    '[class*="profile-card" i]',
    '[class*="profilecard" i]',
    '[class*="hover-card" i]',
    '[class*="hovercard" i]',
].join(',');

const HOVER_CONTEXT_TTL = 8000;
const PRESENCE_CACHE_TTL = 1500;
const NATIVE_SCAN_DELAYS = [80, 260, 650];
const PROFILE_SCAN_DELAYS = [100, 400, 1000, 1800, 3000, 5000];

let nativeObserverRegistered = false;
let recentHoverContext = null;
let nativeScanTimers = [];
const usernameToIdCache = new Map();
const presenceByUserIdCache = new Map();
let profileScanTimers = [];
let lastHoverContextScan = 0;

function normalizeText(text) {
    return String(text || '')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeId(value) {
    const id = Number(value);
    return Number.isFinite(id) && id > 0 ? String(id) : '';
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
        'data-user-id-to',
        'data-userid-to',
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

    const candidates = [
        element,
        ...element.querySelectorAll(attributeNames.map((name) => `[${name}]`).join(',')),
    ];

    for (const candidate of candidates) {
        for (const name of attributeNames) {
            const id = extractUserId(candidate.getAttribute(name));
            if (id) return id;
        }
    }

    return 0;
}

function extractUserIdFromLinks(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return 0;

    const links = [];
    if (element.matches('a[href*="/users/"]')) links.push(element);
    links.push(...element.querySelectorAll('a[href*="/users/"]'));

    for (const link of links) {
        const id = extractUserId(link.getAttribute('href'));
        if (id) return id;
    }

    return 0;
}

function extractUserIdFromText(value) {
    const text = String(value || '');
    const match = text.match(/(?:users\/|userId[\s:=\"']+|userid[\s:=\"']+)(\d{3,})/i);
    return extractUserId(match?.[1]);
}

function extractUserIdFromScripts(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return 0;

    const html = element.outerHTML || '';
    if (html.length > 20000) return 0;

    return extractUserIdFromText(html);
}

function findUserIdInElement(element) {
    return (
        extractUserIdFromAttributes(element) ||
        extractUserIdFromLinks(element) ||
        extractUserIdFromScripts(element)
    );
}

function extractPresenceFromAttributes(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return null;

    const candidates = [
        element,
        ...element.querySelectorAll(
            [
                '[data-rovalra-presence-place-id]',
                '[data-rovalra-presence-root-place-id]',
                '[data-rovalra-presence-universe-id]',
                '[data-rovalra-presence-user-id]',
                '[data-rovalra-presence-game-id]',
            ].join(','),
        ),
    ];

    for (const candidate of candidates) {
        const placeId = normalizeId(candidate.dataset?.rovalraPresencePlaceId);
        if (!placeId) continue;

        return {
            userPresenceType: 2,
            placeId: Number(placeId),
            rootPlaceId:
                Number(normalizeId(candidate.dataset?.rovalraPresenceRootPlaceId)) ||
                null,
            universeId:
                Number(normalizeId(candidate.dataset?.rovalraPresenceUniverseId)) ||
                null,
            userId:
                Number(normalizeId(candidate.dataset?.rovalraPresenceUserId)) ||
                null,
            gameId: candidate.dataset?.rovalraPresenceGameId || null,
            lastLocation: normalizeText(
                candidate.getAttribute('title') || candidate.textContent || '',
            ),
        };
    }

    return null;
}

function findPresenceNearElement(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return null;

    const directPresence = extractPresenceFromAttributes(element);
    if (directPresence) return directPresence;

    let current = element;
    let depth = 0;

    while (current && current !== document.body && depth < 14) {
        const presence = extractPresenceFromAttributes(current);
        if (presence) return presence;

        for (const sibling of [
            current.previousElementSibling,
            current.nextElementSibling,
        ]) {
            const siblingPresence = extractPresenceFromAttributes(sibling);
            if (siblingPresence) return siblingPresence;
        }

        current = current.parentElement;
        depth += 1;
    }

    return null;
}

function findPresenceFromPoint(event) {
    if (!event || typeof document.elementsFromPoint !== 'function') return null;

    const elements = document.elementsFromPoint(event.clientX, event.clientY);
    for (const element of elements) {
        const presence = findPresenceNearElement(element);
        if (presence) return presence;
    }

    return null;
}

function findHoveredPresence() {
    try {
        const hovered = Array.from(document.querySelectorAll(':hover')).reverse();
        for (const element of hovered) {
            const presence = findPresenceNearElement(element);
            if (presence) return presence;
        }
    } catch {
        return null;
    }

    return null;
}

function findUserIdNearElement(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return 0;

    const directId = findUserIdInElement(element);
    if (directId) return directId;

    let current = element;
    let depth = 0;

    while (current && current !== document.body && depth < 14) {
        const id = findUserIdInElement(current);
        if (id) return id;

        for (const sibling of [
            current.previousElementSibling,
            current.nextElementSibling,
        ]) {
            const siblingId = findUserIdInElement(sibling);
            if (siblingId) return siblingId;
        }

        current = current.parentElement;
        depth += 1;
    }

    return 0;
}

function findUserIdFromPoint(event) {
    if (!event || typeof document.elementsFromPoint !== 'function') return 0;

    const elements = document.elementsFromPoint(event.clientX, event.clientY);
    for (const element of elements) {
        const id = findUserIdNearElement(element);
        if (id) return id;
    }

    return 0;
}

function findHoveredUserId() {
    try {
        const hovered = Array.from(document.querySelectorAll(':hover')).reverse();
        for (const element of hovered) {
            const id = findUserIdNearElement(element);
            if (id) return id;
        }
    } catch {
        return 0;
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

    const linkCandidates = [];
    if (element.matches('a[href*="/users/"]')) linkCandidates.push(element);
    linkCandidates.push(...element.querySelectorAll('a[href*="/users/"]'));

    for (const link of linkCandidates) {
        const username = extractUsernameFromText(link.textContent);
        if (username) return username;
    }

    const textSelectors = [
        '.user-card-name',
        '.friend-name',
        '.text-name',
        '[class*="username" i]',
        '[class*="display-name" i]',
        '[data-testid*="username" i]',
        '[data-testid*="display" i]',
    ].join(',');

    for (const candidate of element.querySelectorAll(textSelectors)) {
        const username = extractUsernameFromText(candidate.textContent);
        if (username) return username;
    }

    return extractUsernameFromText(element.textContent);
}

function findUsernameNearElement(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return '';

    const directUsername = extractUsernameFromElement(element);
    if (directUsername) return directUsername;

    let current = element;
    let depth = 0;

    while (current && current !== document.body && depth < 14) {
        const username = extractUsernameFromElement(current);
        if (username) return username;

        for (const sibling of [
            current.previousElementSibling,
            current.nextElementSibling,
        ]) {
            const siblingUsername = extractUsernameFromElement(sibling);
            if (siblingUsername) return siblingUsername;
        }

        current = current.parentElement;
        depth += 1;
    }

    return '';
}

function findUsernameFromPoint(event) {
    if (!event || typeof document.elementsFromPoint !== 'function') return '';

    const elements = document.elementsFromPoint(event.clientX, event.clientY);
    for (const element of elements) {
        const username = findUsernameNearElement(element);
        if (username) return username;
    }

    return '';
}

function findHoveredUsername() {
    try {
        const hovered = Array.from(document.querySelectorAll(':hover')).reverse();
        for (const element of hovered) {
            const username = findUsernameNearElement(element);
            if (username) return username;
        }
    } catch {
        return '';
    }

    return '';
}

function getRecentHoverUsername() {
    if (
        !recentHoverContext ||
        Date.now() - recentHoverContext.timestamp > HOVER_CONTEXT_TTL
    ) {
        return '';
    }

    return recentHoverContext.username || '';
}

function rememberPresence(userId, presence) {
    if (!userId || !presence) return presence;
    presenceByUserIdCache.set(Number(userId), {
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
        Date.now() - cached.timestamp < PRESENCE_CACHE_TTL
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
    if (usernameToIdCache.has(key)) {
        return usernameToIdCache.get(key);
    }

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

function getNativePopoverGameName(root) {
    const text = normalizeText(root?.textContent || '');
    if (!text) return '';

    const playingMatch = text.match(/\bis playing\s+(.+?)(?:\s+Join\b|\s+Chat\b|\s+View Profile\b|\s+SUBPLACE\b|$)/i);
    if (playingMatch) return normalizeText(playingMatch[1]);

    return '';
}

function presenceMatchesNativePopover(root, presence) {
    if (!presence?.placeId) return false;

    const popupGameName = getNativePopoverGameName(root).toLowerCase();
    const lastLocation = normalizeText(presence.lastLocation).toLowerCase();

    if (!popupGameName || !lastLocation) return true;

    return (
        popupGameName.includes(lastLocation) ||
        lastLocation.includes(popupGameName)
    );
}

function getPresenceCardKey(presence) {
    if (!presence) return '';

    return [
        normalizeId(presence.userId),
        normalizeId(presence.placeId),
        normalizeId(presence.rootPlaceId),
        normalizeId(presence.universeId),
        presence.gameId || '',
    ].join(':');
}

function getPopoverUsernameCandidates(root) {
    const usernames = new Set();

    for (const value of [
        extractUsernameFromText(root?.textContent || ''),
        findUsernameNearElement(root),
        getRecentHoverUsername(),
        findHoveredUsername(),
    ]) {
        const username = getCleanUsernameCandidate(value);
        if (username) usernames.add(username);
    }

    return Array.from(usernames);
}

async function resolveNativePopoverPresence(root) {
    const directPresence =
        findPresenceNearElement(root) || getRecentHoverPresence() || findHoveredPresence();

    const userIds = Array.from(
        new Set(
            [
                findUserIdInElement(root),
                directPresence?.userId,
                getRecentHoverUserId(),
                findHoveredUserId(),
            ]
                .map((id) => Number(id))
                .filter((id) => Number.isFinite(id) && id > 0),
        ),
    );

    for (const userId of userIds) {
        const presence = await fetchPresenceForUserId(userId, { forceFresh: true });
        if (
            presence?.userPresenceType === 2 &&
            presence.placeId &&
            presenceMatchesNativePopover(root, presence)
        ) {
            return presence;
        }
    }

    for (const username of getPopoverUsernameCandidates(root)) {
        const userId = await resolveUserIdFromUsername(username);
        const presence = await fetchPresenceForUserId(userId, { forceFresh: true });
        if (
            presence?.userPresenceType === 2 &&
            presence.placeId &&
            presenceMatchesNativePopover(root, presence)
        ) {
            return presence;
        }
    }

    if (
        directPresence?.userPresenceType === 2 &&
        directPresence.placeId &&
        presenceMatchesNativePopover(root, directPresence)
    ) {
        return directPresence;
    }

    return null;
}

function updateRecentHoverContext(event) {
    const target = event.target;
    if (!target || target.nodeType !== Node.ELEMENT_NODE) return;

    const now = Date.now();
    if (event.type === 'pointermove' && now - lastHoverContextScan < 120) {
        return;
    }
    lastHoverContextScan = now;

    const userId =
        findUserIdNearElement(target) ||
        findUserIdFromPoint(event) ||
        findHoveredUserId();
    const presence =
        findPresenceNearElement(target) ||
        findPresenceFromPoint(event) ||
        findHoveredPresence();
    const username =
        findUsernameNearElement(target) ||
        findUsernameFromPoint(event) ||
        findHoveredUsername();

    if (!userId && !presence && !username) return;

    const shouldRescan =
        !recentHoverContext ||
        recentHoverContext.userId !== userId ||
        recentHoverContext.username !== username ||
        recentHoverContext.presence?.placeId !== presence?.placeId ||
        now - recentHoverContext.timestamp > 250;

    recentHoverContext = {
        userId,
        username,
        presence,
        timestamp: now,
    };

    if (presence && userId) rememberPresence(userId, presence);
    if (shouldRescan) scheduleNativePopoverScan();
}

function getRecentHoverUserId() {
    if (
        !recentHoverContext ||
        Date.now() - recentHoverContext.timestamp > HOVER_CONTEXT_TTL
    ) {
        return 0;
    }

    return recentHoverContext.userId || 0;
}

function getRecentHoverPresence() {
    if (
        !recentHoverContext ||
        Date.now() - recentHoverContext.timestamp > HOVER_CONTEXT_TTL
    ) {
        return null;
    }

    return recentHoverContext.presence || null;
}

function getNativeActionLabels(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return new Set();

    const labels = new Set();
    const candidates = element.querySelectorAll(
        'button, a, [role="button"], [tabindex], div, span',
    );

    candidates.forEach((action) => {
        if (action === element) return;

        const text = normalizeText(action.textContent).toLowerCase();
        if (!text || text.length > 80) return;

        if (text === 'join' || text.startsWith('join ')) labels.add('join');
        if (text === 'chat' || text.startsWith('chat ')) labels.add('chat');
        if (text === 'view profile' || text.startsWith('view profile ')) {
            labels.add('view profile');
        }
    });

    const text = normalizeText(element.textContent).toLowerCase();
    if (/\bjoin\b/i.test(text)) labels.add('join');
    if (/\bchat\b/i.test(text)) labels.add('chat');
    if (/\bview profile\b/i.test(text)) labels.add('view profile');

    return labels;
}

function isDefinitelyServerCard(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;

    if (
        element.closest(
            [
                '[data-rovalra-serverid]',
                '.rbx-game-server-item',
                '.rbx-game-server-item-container',
                '.rbx-recent-servers-grid',
                '.server-list-section',
                '.server-list-container',
                '.game-server-item',
                '.rovalra-server-full-info',
                '.rovalra-server-extra-details',
                '.server-id-text',
            ].join(','),
        )
    ) {
        return true;
    }

    const text = normalizeText(element.textContent).toLowerCase();
    if (!text) return false;

    if (/\bserver performance\b/i.test(text)) return true;
    if (/\bpeople max\b/i.test(text)) return true;
    if (/\bversion\s+\d+/i.test(text)) return true;
    if (/\bid:\s*[a-f0-9-]{8,}/i.test(text)) return true;

    const labels = getNativeActionLabels(element);
    return Boolean(
        labels.has('join') &&
            /\bshare\b/i.test(text) &&
            !labels.has('view profile') &&
            !labels.has('chat') &&
            !/\bis playing\b/i.test(text)
    );
}

function hasNativeProfileHoverActions(labels, text) {
    return Boolean(
        labels.has('join') &&
            (labels.has('view profile') ||
                labels.has('chat') ||
                /\bis playing\b/i.test(text))
    );
}

function isVisiblePopoverCandidate(element) {
    const rect = element?.getBoundingClientRect?.();
    if (!rect || rect.width < 120 || rect.height < 90) return false;
    if (rect.width > 720 || rect.height > 760) return false;

    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (Number(style.opacity || 1) === 0) return false;

    return true;
}

function isNativePlayingPopover(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;
    if (element.closest('.rovalra-subplace-hover-card')) return false;
    if (element.closest('.rovalra-native-subplace-card')) return false;
    if (isDefinitelyServerCard(element)) return false;
    if (!isVisiblePopoverCandidate(element)) return false;

    const text = normalizeText(element.textContent);
    const labels = getNativeActionLabels(element);
    const hasActions =
        labels.has('join') || labels.has('chat') || labels.has('view profile');

    if (/\bis playing\b/i.test(text) && hasActions) return true;

    const hasRecentUser = Boolean(
        getRecentHoverUserId() ||
            getRecentHoverUsername() ||
            getRecentHoverPresence() ||
            findUserIdInElement(element) ||
            findPresenceNearElement(element) ||
            findUsernameNearElement(element) ||
            findHoveredUserId() ||
            findHoveredUsername() ||
            findHoveredPresence(),
    );
    const textIsSmallEnough = text.length > 0 && text.length < 900;

    return Boolean(
        hasRecentUser &&
            textIsSmallEnough &&
            hasNativeProfileHoverActions(labels, text),
    );
}

function findNativePlayingPopoverRoot(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return null;

    let current = element;
    let depth = 0;

    while (current && current !== document.body && depth < 10) {
        if (isNativePlayingPopover(current)) return current;

        current = current.parentElement;
        depth += 1;
    }

    return null;
}

function findSmallestNativePlayingRootFromAction(action) {
    let current = action;
    let depth = 0;

    while (current && current !== document.body && depth < 10) {
        if (isNativePlayingPopover(current)) return current;
        current = current.parentElement;
        depth += 1;
    }

    return null;
}

function findActionElement(root, label) {
    const wanted = label.toLowerCase();
    const candidates = root.querySelectorAll(
        'button, a, [role="button"], [tabindex], div, span',
    );

    return Array.from(candidates).find((candidate) => {
        if (candidate === root) return false;

        const text = normalizeText(candidate.textContent).toLowerCase();
        if (!text || text.length > 80) return false;

        return text === wanted || text.startsWith(`${wanted} `);
    });
}

function getActionBlock(action) {
    if (!action) return null;

    let block = action;
    let depth = 0;

    while (
        block.parentElement &&
        block.parentElement !== document.body &&
        depth < 3
    ) {
        const parent = block.parentElement;
        const childButtons = parent.querySelectorAll('button, a, [role="button"]');

        if (childButtons.length > 1) break;
        if (parent.children.length > 3) break;

        block = parent;
        depth += 1;
    }

    return block;
}

function patchNativeRootJoinAction() {
    return;
}

function insertNativeSubplaceCard(root, card) {
    root.classList.add('rovalra-native-subplace-host');
    card.classList.add('rovalra-native-subplace-card');
    card.removeAttribute('style');

    if (/\bis playing\b/i.test(normalizeText(root.textContent))) {
        card.classList.add('rovalra-native-subplace-card-modern');
    }

    const viewProfileAction = findActionElement(root, 'View Profile');
    const viewProfileBlock = getActionBlock(viewProfileAction);

    if (
        viewProfileBlock?.parentElement &&
        root.contains(viewProfileBlock.parentElement)
    ) {
        viewProfileBlock.after(card);
        return;
    }

    const chatAction = findActionElement(root, 'Chat');
    const chatBlock = getActionBlock(chatAction);

    if (chatBlock?.parentElement && root.contains(chatBlock.parentElement)) {
        chatBlock.after(card);
        return;
    }

    const joinAction = findActionElement(root, 'Join');
    const actionBlock = getActionBlock(joinAction);

    if (actionBlock?.parentElement && root.contains(actionBlock.parentElement)) {
        actionBlock.after(card);
        return;
    }

    root.appendChild(card);
}

async function addNativePopoverSubplaceCard(root) {
    if (!root || !document.body.contains(root)) return;
    if (root.dataset.rovalraNativeSubplaceLoading === 'true') return;

    const existingCard = root.querySelector('.rovalra-native-subplace-card');
    if (!isNativePlayingPopover(root)) {
        existingCard?.remove();
        return;
    }

    root.dataset.rovalraNativeSubplaceLoading = 'true';

    try {
        const presence = await resolveNativePopoverPresence(root);
        const existing = root.querySelector('.rovalra-native-subplace-card');

        if (presence?.userPresenceType !== 2 || !presence.placeId) {
            existing?.remove();
            return;
        }

        if (!document.body.contains(root)) return;

        const key = getPresenceCardKey(presence);
        if (existing?.dataset.rovalraPresenceKey === key) return;

        const card = await createSubplaceDetailsCard(presence);

        if (!card || !document.body.contains(root)) {
            existing?.remove();
            return;
        }

        existing?.remove();
        card.dataset.rovalraPresenceKey = key;
        insertNativeSubplaceCard(root, card);
    } finally {
        delete root.dataset.rovalraNativeSubplaceLoading;
    }
}

function processNativePopoverCandidate(candidate) {
    const root = findNativePlayingPopoverRoot(candidate);
    if (!root) return;

    addNativePopoverSubplaceCard(root).catch(() => {});
}

function scanNativePlayingPopovers() {
    const candidates = new Set();

    document.querySelectorAll(NATIVE_POPOVER_SELECTORS).forEach((element) => {
        candidates.add(element);
    });

    document
        .querySelectorAll('button, a, [role="button"], [tabindex], div, span')
        .forEach((element) => {
            const text = normalizeText(element.textContent).toLowerCase();
            if (text === 'join' || text === 'view profile' || text === 'chat') {
                const root = findSmallestNativePlayingRootFromAction(element);
                if (root) candidates.add(root);
            }
        });

    for (const child of document.body?.children || []) {
        if (isNativePlayingPopover(child)) {
            candidates.add(child);
        }
    }

    candidates.forEach(processNativePopoverCandidate);
}

function scheduleNativePopoverScan() {
    nativeScanTimers.forEach((timer) => clearTimeout(timer));
    nativeScanTimers = NATIVE_SCAN_DELAYS.map((delay) =>
        setTimeout(scanNativePlayingPopovers, delay),
    );
}

function registerNativePopoverSubplaces() {
    if (nativeObserverRegistered) return;

    nativeObserverRegistered = true;

    document.addEventListener('pointerover', updateRecentHoverContext, true);
    document.addEventListener('pointermove', updateRecentHoverContext, true);
    document.addEventListener('focusin', updateRecentHoverContext, true);

    observeElement(NATIVE_POPOVER_SELECTORS, processNativePopoverCandidate, {
        multiple: true,
    });

    scanNativePlayingPopovers();
}

function getExperienceUrl(presence) {
    const placeId = presence?.placeId || presence?.rootPlaceId;
    return placeId ? `https://www.roblox.com/games/${placeId}/-` : '';
}

function getProfilePresence() {
    const userId = Number(getUserIdFromUrl());
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
                '.rovalra-native-subplace-card',
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


async function resolveProfileStyle(target) {
    if (isLikelyModernProfileCard(target)) {
        return 'modern';
    }

    const selectedStyle =
        (await settings.currentlyPlayingSubplaceProfileStyle) || 'auto';

    if (selectedStyle === 'compact' || selectedStyle === 'modern') {
        return selectedStyle;
    }

    return 'compact';
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
    };
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

    chip.style.borderRadius = style.borderRadius;
    chip.style.paddingTop = style.paddingTop;
    chip.style.paddingRight = style.paddingRight;
    chip.style.paddingBottom = style.paddingBottom;
    chip.style.paddingLeft = style.paddingLeft;
    chip.style.fontSize = style.fontSize;
    chip.style.fontWeight = style.fontWeight;
    chip.style.lineHeight = style.lineHeight;
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

function scheduleLegacyChipReveal(chip, anchor) {
    if (!chip || !anchor) return;

    const previousFrame = Number(chip.dataset.rovalraPlacementFrame || 0);
    if (previousFrame) cancelAnimationFrame(previousFrame);

    if (shouldKeepLegacyChipVisible(chip, anchor)) {
        delete chip.dataset.rovalraPlacementFrame;
        syncLegacyChipWithAnchor(chip, anchor);
        return;
    }

    chip.classList.remove(LEGACY_READY_CLASS);
    chip.classList.add(LEGACY_PENDING_CLASS);

    let lastAnchorRect = null;
    let stableFrames = 0;

    const reveal = () => {
        delete chip.dataset.rovalraPlacementFrame;
        syncLegacyChipWithAnchor(chip, anchor);
        chip.classList.remove(LEGACY_PENDING_CLASS);
        chip.classList.add(LEGACY_READY_CLASS);
    };

    const tick = () => {
        if (!chip.isConnected || !document.body.contains(anchor)) {
            delete chip.dataset.rovalraPlacementFrame;
            chip.classList.remove(LEGACY_READY_CLASS);
            return;
        }

        syncLegacyChipWithAnchor(chip, anchor);

        const anchorRect = getPlacementRect(anchor);
        const currentRect = anchorRect
            ? `${anchorRect.top}:${anchorRect.left}:${anchorRect.width}:${anchorRect.height}`
            : '';

        if (currentRect && currentRect === lastAnchorRect) {
            stableFrames += 1;
        } else {
            stableFrames = 0;
            lastAnchorRect = currentRect;
        }

        if (stableFrames >= 8 && isLegacyChipPlacedUnderAnchor(chip, anchor)) {
            reveal();
            return;
        }

        chip.dataset.rovalraPlacementFrame = String(requestAnimationFrame(tick));
    };

    chip.dataset.rovalraPlacementFrame = String(requestAnimationFrame(tick));
}

function insertChipAfterAnchor(container, anchor, chip) {
    if (!container || !chip) return false;

    container.classList.add(LEGACY_HOST_CLASS);

    const row = getLegacyRowForInfo({ container, anchor });
    const alreadyStable = shouldKeepLegacyChipVisible(chip, anchor);

    if (!alreadyStable) {
        chip.classList.remove(LEGACY_READY_CLASS);
        chip.classList.add(LEGACY_PENDING_CLASS);
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
    scheduleLegacyChipReveal(chip, anchor);
    return true;
}


async function insertLegacyProfileSubplaceButton(target, presence) {
    const info = findLegacyChipInsertContainer(target);
    if (!info?.container || !info.anchor) return false;

    let existingInContainer = cleanupDuplicateLegacyChips(info);

    if (existingInContainer) {
        if (!isLegacyChipAfterAnchor(existingInContainer, info.anchor)) {
            insertChipAfterAnchor(info.container, info.anchor, existingInContainer);
        } else {
            syncLegacyChipWithAnchor(existingInContainer, info.anchor);
            scheduleLegacyChipReveal(existingInContainer, info.anchor);
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
    insertChipAfterAnchor(info.container, info.anchor, chip);
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
            scheduleLegacyChipReveal(existing, info.anchor);
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

function scheduleProfileScans() {
    profileScanTimers.forEach((timer) => clearTimeout(timer));
    profileScanTimers = PROFILE_SCAN_DELAYS.map((delay) =>
        setTimeout(() => {
            scanProfilePlayingTargets().catch(() => {});
        }, delay),
    );
}

function registerProfileFallbackSubplaces() {
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
        return;
    }

    registerNativePopoverSubplaces();
    registerProfileFallbackSubplaces();

    if (observerRegistered) {
        scheduleProfileScans();
        return;
    }

    observerRegistered = true;
    observeElement(CARD_SELECTOR, addProfileSubplaceCard, {
        multiple: true,
    });

    scheduleProfileScans();
}
