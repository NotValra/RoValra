import { observeElement } from '../../core/observer.js';
import { settings } from '../../core/settings/getSettings.js';
import { getAuthenticatedUserId } from '../../core/user.js';
import { callRobloxApiJson } from '../../core/api.js';
import { getBatchThumbnails } from '../../core/thumbnail/thumbnails.js';
import { getAssets } from '../../core/assets.js';
import { ts } from '../../core/locale/i18n.js';
import {
    createFriendTile,
    batchFetchPresence,
} from '../../core/ui/profile/userCard.js';
import { followUser, openWebChat } from '../../core/utils/launcher.js';

const SETTING_NAME = 'friendsCarouselRedesignEnabled';
const STYLE_ID = 'rovalra-friends-carousel-redesign-style';
const SCROLL_CLASS = 'rovalra-friends-carousel-scroll';
const WRAPPER_CLASS = 'rovalra-friends-carousel';
const ARROW_CLASS = 'rovalra-fc-arrow';
const HOVER_CARD_CLASS = 'rovalra-fc-hover-card';
const HIDDEN_ATTR = 'data-rovalra-fc-hidden';

const CAROUSEL_SELECTOR = '#HomeContainer .react-friends-carousel-container';
const ROSEAL_CAROUSEL_SELECTOR = '.roseal-friends-carousel-container';
const ORIGINAL_LIST_SELECTOR =
    '#HomeContainer .react-friends-carousel-container .friends-carousel-list-container';

const FRIEND_ID_CAP = 500;
const PAGE_LIMIT = 50;
const RENDER_CHUNK = 40;

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
        }

        .${SCROLL_CLASS}::-webkit-scrollbar {
            display: none;
        }

        .${SCROLL_CLASS} .friends-carousel-tile {
            flex: 0 0 auto;
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

        .${HOVER_CARD_CLASS} {
            position: fixed;
            z-index: 10000;
            width: 260px;
            display: block !important;
        }

        .${HOVER_CARD_CLASS} .in-game-friend-card--iarc {
            background: var(--color-over-media-300, rgba(0, 0, 0, 0.75));
        }

        .${HOVER_CARD_CLASS} .rovalra-fc-hc-thumb {
            width: 40px;
            height: 40px;
            border-radius: 6px;
            object-fit: cover;
            flex-shrink: 0;
            background: rgba(255, 255, 255, 0.1);
        }

        .${HOVER_CARD_CLASS} a {
            text-decoration: none;
            color: inherit;
        }
    `;
    document.head.appendChild(style);
}

const L = (key, options) => ts(`friendsCarouselRedesign.${key}`, options);

const FOUNDATION_BTN_BASE =
    'foundation-web-button relative clip group/interactable focus-visible:outline-focus disabled:outline-none cursor-pointer relative flex items-center justify-center stroke-none padding-y-none select-none radius-medium text-label-medium height-1000 padding-x-medium grow';
const FOUNDATION_BTN_OVERLAY =
    'absolute inset-[0] transition-colors group-hover/interactable:bg-[var(--color-state-hover)] group-active/interactable:bg-[var(--color-state-press)] group-disabled/interactable:bg-none';

/* --------------------------- Hover card --------------------------- */

let activeHoverCard = null;
let hoverShowTimer = null;
let hoverHideTimer = null;

function removeHoverCard() {
    clearTimeout(hoverShowTimer);
    clearTimeout(hoverHideTimer);
    activeHoverCard?.remove();
    activeHoverCard = null;
}

function positionHoverCard(card, anchorRect) {
    const margin = 8;
    const { offsetWidth: w, offsetHeight: h } = card;

    let left = anchorRect.left + anchorRect.width / 2 - w / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - w - margin));

    let top = anchorRect.bottom + margin;
    if (top + h > window.innerHeight - margin) {
        top = Math.max(margin, anchorRect.top - h - margin);
    }

    card.style.left = `${Math.round(left)}px`;
    card.style.top = `${Math.round(top)}px`;
}

function el(tag, className) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    return node;
}

function makeFoundationButton(label, emphasis) {
    const btn = el(
        'button',
        `${FOUNDATION_BTN_BASE} ${
            emphasis
                ? 'bg-action-emphasis content-action-emphasis'
                : 'bg-action-standard content-action-standard'
        }`,
    );
    btn.type = 'button';
    const span = el('span', 'flex items-center min-width-0 gap-small');
    span.textContent = label;
    btn.append(el('div', FOUNDATION_BTN_OVERLAY), span);
    return btn;
}

function buildHoverCard({ userId, displayName, presence, placeThumb }) {
    const name = displayName || L('friendFallback');

    const wrapper = el(
        'div',
        `${HOVER_CARD_CLASS} friend-tile-dropdown friend-tile-dropdown--iarc`,
    );
    const card = el(
        'div',
        'in-game-friend-card--iarc flex flex-col items-start justify-center padding-y-large padding-x-large gap-medium radius-medium stroke-standard stroke-default bg-over-media-300 width-full',
    );

    const type = presence?.userPresenceType ?? 0;
    const gameName = type === 2 ? presence?.lastLocation || '' : '';
    const rootPlaceId = presence?.rootPlaceId || presence?.placeId || null;
    const inGame = type === 2 && rootPlaceId;

    if (inGame) {
        const link = el(
            'a',
            'flex items-center gap-small width-full min-width-0',
        );
        link.href = `https://www.roblox.com/games/${rootPlaceId}`;

        const thumb = el('img', 'rovalra-fc-hc-thumb');
        thumb.alt = '';
        if (placeThumb) thumb.src = placeThumb;

        const info = el(
            'span',
            'friend-presence-info flex flex-col justify-center min-width-0 fill',
        );
        const line1 = el(
            'span',
            'friend-tile-is-playing text-body-medium content-default text-truncate-end text-no-wrap',
        );
        line1.textContent = L('isPlaying', { name });
        const line2 = el(
            'span',
            'friend-tile-game-name text-title-medium content-emphasis text-truncate-end text-no-wrap',
        );
        line2.textContent = gameName;
        info.append(line1, line2);
        link.append(thumb, info);
        card.appendChild(link);
    } else {
        const info = el(
            'span',
            'friend-presence-info flex flex-col justify-center min-width-0 fill width-full',
        );
        const line1 = el(
            'span',
            'friend-tile-game-name text-title-medium content-emphasis text-truncate-end text-no-wrap',
        );
        line1.textContent = name;
        const line2 = el(
            'span',
            'friend-tile-is-playing text-body-medium content-default text-truncate-end text-no-wrap',
        );
        line2.textContent =
            type === 1
                ? L('online')
                : type === 3
                  ? L('inStudio')
                  : L('offline');
        info.append(line1, line2);
        card.appendChild(info);
    }

    const actions = el(
        'div',
        'in-game-friend-card-actions flex flex-col self-stretch gap-small',
    );

    if (inGame) {
        const joinBtn = makeFoundationButton(L('join'), true);
        joinBtn.addEventListener('click', () => {
            followUser(userId);
            removeHoverCard();
        });
        actions.appendChild(joinBtn);
    }

    const chatBtn = makeFoundationButton(L('chat'), false);
    chatBtn.addEventListener('click', () => {
        openWebChat(userId);
        removeHoverCard();
    });
    actions.appendChild(chatBtn);

    const profileLink = el(
        'a',
        'foundation-web-link inline-flex items-center gap-xsmall content-emphasis no-underline motion-safe:transition-opacity hover:cursor-pointer hover:[opacity:0.8] radius-xsmall flex items-center justify-center self-stretch height-600 text-label-medium content-action-standard',
    );
    profileLink.href = `https://www.roblox.com/users/${userId}/profile`;
    profileLink.textContent = L('viewProfile');
    actions.appendChild(profileLink);

    card.appendChild(actions);
    wrapper.appendChild(card);

    wrapper.addEventListener('mouseenter', () => clearTimeout(hoverHideTimer));
    wrapper.addEventListener('mouseleave', () => {
        hoverHideTimer = setTimeout(removeHoverCard, 120);
    });

    return wrapper;
}

function attachHoverCard(tile, data) {
    tile.addEventListener('mouseenter', () => {
        clearTimeout(hoverHideTimer);
        clearTimeout(hoverShowTimer);
        hoverShowTimer = setTimeout(() => {
            removeHoverCard();
            const card = buildHoverCard(data);
            card.style.visibility = 'hidden';
            document.body.appendChild(card);
            positionHoverCard(card, tile.getBoundingClientRect());
            card.style.visibility = '';
            activeHoverCard = card;
        }, 180);
    });

    tile.addEventListener('mouseleave', () => {
        clearTimeout(hoverShowTimer);
        hoverHideTimer = setTimeout(removeHoverCard, 120);
    });
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

async function loadAllFriendIds(userId) {
    const ids = [];
    let cursor = '';

    do {
        const endpoint =
            `/v1/users/${userId}/friends/find?userSort=1&limit=${PAGE_LIMIT}` +
            (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
        const res = await callRobloxApiJson({
            subdomain: 'friends',
            endpoint,
        }).catch(() => null);

        for (const item of res?.PageItems || []) {
            if (item?.id > 0) ids.push(item.id);
        }

        cursor = res?.NextCursor || '';
    } while (cursor && ids.length < FRIEND_ID_CAP);

    return ids;
}

async function loadOnlineFriendIds(userId) {
    const res = await callRobloxApiJson({
        subdomain: 'friends',
        endpoint: `/v1/users/${userId}/friends/online`,
    }).catch(() => null);

    return (res?.data || [])
        .slice()
        .sort((a, b) => (b.sortScore || 0) - (a.sortScore || 0))
        .map((entry) => entry.id)
        .filter((id) => id > 0);
}

async function loadOrderedFriendIds(userId) {
    const [onlineIds, allIds] = await Promise.all([
        loadOnlineFriendIds(userId),
        loadAllFriendIds(userId),
    ]);

    const seen = new Set();
    const ordered = [];
    for (const id of [...onlineIds, ...allIds]) {
        if (seen.has(id)) continue;
        seen.add(id);
        ordered.push(id);
    }

    return ordered.slice(0, FRIEND_ID_CAP);
}

async function fetchChunkData(ids) {
    const [profilesRes, thumbs, presenceMap] = await Promise.all([
        callRobloxApiJson({
            subdomain: 'apis',
            endpoint: '/user-profile-api/v1/user/profiles/get-profiles',
            method: 'POST',
            body: {
                userIds: ids,
                fields: [
                    'names.combinedName',
                    'isVerified',
                    'names.username',
                    'hasRobloxSubscription',
                ],
            },
        }).catch(() => null),
        getBatchThumbnails(ids, 'AvatarHeadshot', '150x150').catch(() => []),
        batchFetchPresence(ids).catch(() => new Map()),
    ]);

    const presence = presenceMap || new Map();

    const placeIdByUser = new Map();
    for (const [uid, p] of presence) {
        if (p?.userPresenceType === 2) {
            const placeId = p.rootPlaceId || p.placeId;
            if (placeId) placeIdByUser.set(uid, placeId);
        }
    }

    const placeThumbs = new Map();
    if (placeIdByUser.size) {
        const placeIds = [...new Set(placeIdByUser.values())];
        const placeThumbList = await getBatchThumbnails(
            placeIds,
            'PlaceIcon',
            '150x150',
        ).catch(() => []);
        const byPlace = new Map(
            (placeThumbList || []).map((t) => [t.targetId, t.imageUrl]),
        );
        for (const [uid, placeId] of placeIdByUser) {
            const url = byPlace.get(placeId) || byPlace.get(Number(placeId));
            if (url) placeThumbs.set(uid, url);
        }
    }

    return {
        profiles: new Map(
            (profilesRes?.profileDetails || []).map((p) => [p.userId, p]),
        ),
        thumbs: new Map((thumbs || []).map((t) => [t.targetId, t])),
        presence,
        placeThumbs,
    };
}

async function populateCarousel(scrollEl, refresh, token, originalList) {
    const userId = await getAuthenticatedUserId();
    if (!userId || token !== populateToken) return;

    cloneAddFriendsTile(originalList, scrollEl);

    const ids = await loadOrderedFriendIds(userId);
    if (token !== populateToken || !scrollEl.isConnected) return;

    for (let i = 0; i < ids.length; i += RENDER_CHUNK) {
        const chunk = ids.slice(i, i + RENDER_CHUNK);
        const { profiles, thumbs, presence, placeThumbs } =
            await fetchChunkData(chunk);
        if (token !== populateToken || !scrollEl.isConnected) return;

        for (const id of chunk) {
            const profile = profiles.get(id);
            if (!profile) continue;

            const displayName = profile.names?.combinedName || '';
            const tile = createFriendTile(
                { id },
                thumbs.get(id) || { state: 'Error' },
                {
                    displayName,
                    username: profile.names?.username
                        ? `@${profile.names.username}`
                        : '',
                    isHidden: false,
                    isVerified: profile.isVerified || false,
                    isSubscribed: profile.hasRobloxSubscription || false,
                },
            );
            attachHoverCard(tile, {
                userId: id,
                displayName,
                presence: presence.get(id) || null,
                placeThumb: placeThumbs.get(id) || null,
            });
            scrollEl.appendChild(tile);
        }

        refresh?.();
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
    removeHoverCard();

    document
        .querySelectorAll(`.${WRAPPER_CLASS}`)
        .forEach((node) => node.remove());
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
