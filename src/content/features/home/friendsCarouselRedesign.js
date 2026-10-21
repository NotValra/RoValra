import { observeElement } from '../../core/observer.js';
import { settings } from '../../core/settings/getSettings.js';
import { getAuthenticatedUserId } from '../../core/user.js';
import { callRobloxApiJson } from '../../core/api.js';
import {
    createThumbnailElement,
    getBatchThumbnails,
} from '../../core/thumbnail/thumbnails.js';
import { getAssets } from '../../core/assets.js';
import { ts } from '../../core/locale/i18n.js';
import { getFriendsList } from '../../core/utils/trackers/friendslist.js';
import {
    createFriendTile,
    updateUserCardPresence,
} from '../../core/ui/profile/userCard.js';
import { removeUserCardTooltip } from '../../core/ui/profile/userCardTooltip.js';

const SETTING_NAME = 'friendsCarouselRedesignEnabled';
const STYLE_ID = 'rovalra-friends-carousel-redesign-style';
const SCROLL_CLASS = 'rovalra-friends-carousel-scroll';
const WRAPPER_CLASS = 'rovalra-friends-carousel';
const ARROW_CLASS = 'rovalra-fc-arrow';
const HIDDEN_ATTR = 'data-rovalra-fc-hidden';

const CAROUSEL_SELECTOR = '#HomeContainer .react-friends-carousel-container';
const ROSEAL_CAROUSEL_SELECTOR = '.roseal-friends-carousel-container';
const ORIGINAL_LIST_SELECTOR =
    '#HomeContainer .react-friends-carousel-container .friends-carousel-list-container';

const FRIEND_ID_CAP = 500;
const RENDER_CHUNK = 40;
const PRESENCE_REFRESH_MS = 10_000;
const PRESENCE_BATCH_SIZE = 100;
const THUMBNAIL_BATCH_DELAY_MS = 50;

let enabled = false;
let observersRegistered = false;
let storageListenerRegistered = false;
let populateToken = 0;

function isHomePage() {
    const path = window.location.pathname
        .toLowerCase()
        .replace(/^\/[a-z]{2}(?:-[a-z]{2})?\//, '/');
    return path.startsWith('/home');
}

function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const assets = getAssets();
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        .${WRAPPER_CLASS} {
            position: relative;
            width: 100%;
        }

        .${SCROLL_CLASS} {
            display: flex;
            align-items: flex-start;
            gap: 6px;
            overflow-x: auto;
            overflow-y: hidden;
            scroll-behavior: smooth;
            scrollbar-width: none;
       
            padding: 90px 4px 14px;
            margin: -90px -4px -14px;
            pointer-events: none;
        }

        .${SCROLL_CLASS}::-webkit-scrollbar {
            display: none;
        }

        .${SCROLL_CLASS} .friends-carousel-tile {
            flex: 0 0 auto;
            pointer-events: auto;
        }

        .${ARROW_CLASS} {
            position: absolute;
            top: 45px;
            transform: translateY(-50%);
            width: 36px;
            height: 36px;
            border-radius: 50%;
            border: none;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            z-index: 5;
            opacity: 0;
            transition: opacity 0.15s ease;
            background: var(--rovalra-container-background-color, rgba(0, 0, 0, 0.6));
            color: var(--rovalra-main-text-color, #fff);
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
        }

        .${WRAPPER_CLASS}:hover .${ARROW_CLASS}:not([disabled]) {
            opacity: 1;
        }

        .${ARROW_CLASS}[disabled] {
            opacity: 0 !important;
            pointer-events: none;
        }

        .${ARROW_CLASS}.prev {
            left: -6px;
        }

        .${ARROW_CLASS}.next {
            right: -6px;
        }

        .${ARROW_CLASS} .rovalra-fc-arrow-icon {
            display: block;
            width: 20px;
            height: 20px;
            background-color: var(--rovalra-main-text-color, #f7f7f8);
            -webkit-mask-repeat: no-repeat;
            mask-repeat: no-repeat;
            -webkit-mask-position: center;
            mask-position: center;
            -webkit-mask-size: 20px 20px;
            mask-size: 20px 20px;
        }

        .${ARROW_CLASS}.prev .rovalra-fc-arrow-icon {
            -webkit-mask-image: url("${assets.chevronLeftIcon}");
            mask-image: url("${assets.chevronLeftIcon}");
        }

        .${ARROW_CLASS}.next .rovalra-fc-arrow-icon {
            -webkit-mask-image: url("${assets.chevronRightIcon}");
            mask-image: url("${assets.chevronRightIcon}");
        }
    `;
    document.head.appendChild(style);
}

const L = (key, options) => ts(`friendsCarouselRedesign.${key}`, options);

function el(tag, className) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    return node;
}

/* --------------------------- Carousel --------------------------- */

function updateArrows(scrollEl, prevBtn, nextBtn) {
    if (!scrollEl.isConnected) return;
    const maxScroll = scrollEl.scrollWidth - scrollEl.clientWidth;
    prevBtn.disabled = scrollEl.scrollLeft <= 4;
    nextBtn.disabled = scrollEl.scrollLeft >= maxScroll - 4;
}

function hideOriginalList(originalList) {
    originalList.setAttribute(HIDDEN_ATTR, '1');
    originalList.style.display = 'none';
}

function cloneAddFriendsTile(originalList, scrollEl) {
    if (scrollEl.querySelector('.add-friends-icon-container')) return;

    const original = [...originalList.children].find((tile) =>
        tile.querySelector('.add-friends-icon-container'),
    );
    if (!original) return;

    const clone = original.cloneNode(true);
    clone.removeAttribute('data-rovalra-user-card-observed');
    clone.removeAttribute('data-rovalra-user-card-refresh-observer');
    scrollEl.insertBefore(clone, scrollEl.firstChild);
}

function buildCarousel(listWrap) {
    let wrapper = listWrap.querySelector(`:scope > .${WRAPPER_CLASS}`);
    if (wrapper) {
        return {
            scrollEl: wrapper.querySelector(`.${SCROLL_CLASS}`),
            refresh: wrapper.rovalraRefreshArrows,
            created: false,
        };
    }

    wrapper = document.createElement('div');
    wrapper.className = WRAPPER_CLASS;

    const scrollEl = document.createElement('div');
    scrollEl.className = SCROLL_CLASS;

    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = `${ARROW_CLASS} prev`;
    prevBtn.setAttribute('aria-label', L('prevFriends'));
    prevBtn.appendChild(el('span', 'rovalra-fc-arrow-icon'));

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = `${ARROW_CLASS} next`;
    nextBtn.setAttribute('aria-label', L('nextFriends'));
    nextBtn.appendChild(el('span', 'rovalra-fc-arrow-icon'));

    const page = (direction) => {
        scrollEl.scrollBy({
            left: direction * Math.round(scrollEl.clientWidth * 0.8),
            behavior: 'smooth',
        });
    };
    prevBtn.addEventListener('click', () => page(-1));
    nextBtn.addEventListener('click', () => page(1));

    const refresh = () => updateArrows(scrollEl, prevBtn, nextBtn);
    wrapper.rovalraRefreshArrows = refresh;
    scrollEl.addEventListener('scroll', refresh, { passive: true });
    window.addEventListener('resize', refresh, { passive: true });

    wrapper.append(prevBtn, scrollEl, nextBtn);
    listWrap.appendChild(wrapper);
    refresh();

    return { scrollEl, refresh, created: true };
}

async function loadOnlineFriendPresence(userId) {
    const res = await callRobloxApiJson({
        subdomain: 'friends',
        endpoint: `/v1/users/${userId}/friends/online`,
    }).catch(() => null);

    return new Map(
        (res?.data || [])
            .filter((entry) => entry?.id > 0)
            .map((entry) => [
                entry.id,
                {
                    ...normalizeFriendPresence(entry.userPresence),
                    sortScore: entry.sortScore,
                },
            ])
            .filter(
                ([, presence]) =>
                    presence?.userPresenceType === 2 ||
                    presence?.userPresenceType === 3 ||
                    presence?.userPresenceType === 1,
            ),
    );
}

function normalizeFriendPresence(presence) {
    if (!presence) return null;

    const type =
        typeof presence.UserPresenceType === 'string'
            ? ({
                  Offline: 0,
                  Online: 1,
                  InGame: 2,
                  InStudio: 3,
              }[presence.UserPresenceType] ?? 0)
            : (presence.userPresenceType ?? presence.UserPresenceType ?? 0);

    return {
        ...presence,
        userPresenceType: type,
    };
}

async function loadFriends() {
    const userId = await getAuthenticatedUserId();
    if (!userId) return { friends: [], onlinePresence: new Map() };

    const [friends, onlinePresence] = await Promise.all([
        getFriendsList(),
        loadOnlineFriendPresence(userId),
    ]);
    const friendsById = new Map(
        friends
            .filter((friend) => friend?.id > 0)
            .map((friend) => [friend.id, friend]),
    );
    const presencePriority = {
        2: 0, // In game
        3: 1, // In studio
        1: 2, // Online
    };
    const orderedFriends = friends
        .filter((friend) => friendsById.has(friend.id))
        .sort((a, b) => {
            const priorityDifference =
                (presencePriority[onlinePresence.get(a.id)?.userPresenceType] ??
                    3) -
                (presencePriority[onlinePresence.get(b.id)?.userPresenceType] ??
                    3);
            if (priorityDifference !== 0) return priorityDifference;

            const aScore = onlinePresence.get(a.id)?.sortScore ?? a.sortScore;
            const bScore = onlinePresence.get(b.id)?.sortScore ?? b.sortScore;
            if (typeof aScore === 'number' && typeof bScore === 'number') {
                return bScore - aScore;
            }
            if (typeof aScore === 'number') return -1;
            if (typeof bScore === 'number') return 1;
            return 0;
        });

    return {
        friends: orderedFriends.slice(0, FRIEND_ID_CAP),
        onlinePresence,
    };
}

function createLazyThumbnailLoader() {
    const pending = new Set();
    let flushScheduled = false;

    const flush = async () => {
        flushScheduled = false;
        const tiles = [...pending];
        pending.clear();
        const ids = tiles.map((tile) => Number(tile.dataset.rovalraUserId));
        if (!ids.length) return;

        const thumbs = await getBatchThumbnails(
            ids,
            'AvatarHeadshot',
            '150x150',
        ).catch(() => []);
        const byId = new Map((thumbs || []).map((t) => [Number(t.targetId), t]));

        for (const tile of tiles) {
            if (!tile.isConnected) continue;
            const container = tile.querySelector('.avatar-card-image');
            if (!container) continue;
            const thumbData = byId.get(Number(tile.dataset.rovalraUserId)) || {
                state: 'Error',
            };
            container.replaceChildren(
                createThumbnailElement(
                    thumbData,
                    tile.rovalraTooltipData?.displayName || '',
                    '',
                    { width: '90px', height: '90px' },
                ),
            );
        }
    };

    const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            observer.unobserve(entry.target);
            pending.add(entry.target);
        }
        if (pending.size && !flushScheduled) {
            flushScheduled = true;
            setTimeout(flush, THUMBNAIL_BATCH_DELAY_MS);
        }
    });

    return observer;
}

async function refreshCarouselPresence(scrollEl, token) {
    if (scrollEl.rovalraPresenceRefreshing) return;
    const tiles = [...scrollEl.querySelectorAll('[data-rovalra-user-id]')];
    const userIds = tiles.map((tile) => Number(tile.dataset.rovalraUserId));
    if (!userIds.length) return;

    scrollEl.rovalraPresenceRefreshing = true;
    try {
        const batches = [];
        for (let i = 0; i < userIds.length; i += PRESENCE_BATCH_SIZE) {
            batches.push(userIds.slice(i, i + PRESENCE_BATCH_SIZE));
        }

        const results = await Promise.all(
            batches.map((ids) =>
                callRobloxApiJson({
                    subdomain: 'presence',
                    endpoint: '/v1/presence/users',
                    method: 'POST',
                    body: { userIds: ids },
                }).catch(() => null),
            ),
        );
        if (token !== populateToken || !scrollEl.isConnected) return;

        const presenceById = new Map();
        for (const result of results) {
            for (const presence of result?.userPresences || []) {
                presenceById.set(Number(presence.userId), presence);
            }
        }

        for (const tile of tiles) {
            const userId = Number(tile.dataset.rovalraUserId);

            if (!presenceById.has(userId)) continue;

            const presence = presenceById.get(userId);
            updateUserCardPresence(
                tile,
                presence.userPresenceType ?? 0,
                presence.userPresenceType === 2
                    ? presence.lastLocation || null
                    : null,
                presence,
            );
            if (presence.userPresenceType !== 2 || !presence.lastLocation) {
                const sublabel = tile.querySelector('.user-card-subname');
                if (sublabel) {
                    sublabel.textContent = tile.dataset.rovalraUsername || '';
                }
            }
        }

        const presencePriority = { 2: 0, 3: 1, 1: 2 };
        const orderedTiles = tiles
            .map((tile, index) => ({ tile, index }))
            .sort((a, b) => {
                const aType = a.tile.rovalraPresence?.userPresenceType ?? 0;
                const bType = b.tile.rovalraPresence?.userPresenceType ?? 0;
                return (
                    (presencePriority[aType] ?? 3) -
                        (presencePriority[bType] ?? 3) || a.index - b.index
                );
            });
        for (const { tile } of orderedTiles) {
            scrollEl.appendChild(tile);
        }
    } finally {
        scrollEl.rovalraPresenceRefreshing = false;
    }
}

async function populateCarousel(scrollEl, refresh, token, originalList) {
    cloneAddFriendsTile(originalList, scrollEl);

    const { friends, onlinePresence } = await loadFriends();
    if (token !== populateToken || !scrollEl.isConnected) return;

    const thumbnailObserver = createLazyThumbnailLoader();
    scrollEl.rovalraThumbnailObserver = thumbnailObserver;

    for (let i = 0; i < friends.length; i += RENDER_CHUNK) {
        const chunk = friends.slice(i, i + RENDER_CHUNK);
                for (const friend of chunk) {
            const id = friend.id;
            const displayName =
                (!friend.isDeleted && friend.combinedName) ||
                friend.displayName ||
                friend.username ||
                '';
            const tile = createFriendTile(
                friend,
                { state: 'Pending' },
                {
                    displayName,
                    username: friend.username ? `@${friend.username}` : '',
                    isHidden: false,
                    isVerified: friend.isVerified || false,
                    isSubscribed: friend.hasRobloxSubscription === true,
                    presence: onlinePresence.get(id) || null,
                    showTooltip: true,
                },
            );
            tile.dataset.rovalraUserId = String(id);
            tile.dataset.rovalraUsername = friend.username
                ? `@${friend.username}`
                : '';
            scrollEl.appendChild(tile);
            thumbnailObserver.observe(tile);
        }

        refresh?.();
    }

    if (token === populateToken && scrollEl.isConnected) {
        refreshCarouselPresence(scrollEl, token);
        scrollEl.rovalraPresenceInterval = setInterval(
            () => refreshCarouselPresence(scrollEl, token),
            PRESENCE_REFRESH_MS,
        );
    }
}

function applyToCarousel(carousel) {
    if (!enabled || !isHomePage()) return;
    if (document.querySelector(ROSEAL_CAROUSEL_SELECTOR)) return;

    const listWrap = carousel.querySelector('.friends-carousel-container');
    const originalList = listWrap?.querySelector(
        `.friends-carousel-list-container:not(.${SCROLL_CLASS})`,
    );
    if (!listWrap || !originalList) return;

    ensureStyle();
    hideOriginalList(originalList);

    const { scrollEl, refresh, created } = buildCarousel(listWrap);
    if (!scrollEl || !created) return;

    const token = ++populateToken;
    populateCarousel(scrollEl, refresh, token, originalList).catch((error) =>
        console.warn('RoValra: Friends carousel redesign failed', error),
    );
}

function teardown() {
    populateToken++;
    removeUserCardTooltip();

    document.querySelectorAll(`.${WRAPPER_CLASS}`).forEach((node) => {
        const scrollEl = node.querySelector(`.${SCROLL_CLASS}`);
        clearInterval(scrollEl?.rovalraPresenceInterval);
        scrollEl?.rovalraThumbnailObserver?.disconnect();
        node.remove();
    });
    document.querySelectorAll(`[${HIDDEN_ATTR}]`).forEach((node) => {
        node.style.removeProperty('display');
        node.removeAttribute(HIDDEN_ATTR);
    });
}

function registerObservers() {
    if (observersRegistered) return;
    observersRegistered = true;

    observeElement(
        ORIGINAL_LIST_SELECTOR,
        (list) => {
            if (list.classList.contains(SCROLL_CLASS)) return;
            const carousel = list.closest('.react-friends-carousel-container');
            if (carousel) applyToCarousel(carousel);
        },
        { multiple: true },
    );

    observeElement(CAROUSEL_SELECTOR, applyToCarousel, { multiple: true });
}

function registerStorageListener() {
    if (storageListenerRegistered) return;
    storageListenerRegistered = true;

    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace !== 'local' || !changes[SETTING_NAME]) return;

        enabled = changes[SETTING_NAME].newValue === true;
        if (enabled) {
            registerObservers();
            document
                .querySelectorAll(CAROUSEL_SELECTOR)
                .forEach(applyToCarousel);
        } else {
            teardown();
        }
    });
}

export async function init() {
    registerStorageListener();

    enabled = (await settings[SETTING_NAME]) === true;
    if (!enabled) return;

    registerObservers();
    document.querySelectorAll(CAROUSEL_SELECTOR).forEach(applyToCarousel);
}
