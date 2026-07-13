import {
    showReviewPopup,
    showRegionDonationPopup,
} from '../../core/review/review.js';
import { observeIntersection } from '../../core/observer.js';
import { callRobloxApi } from '../../core/api.js';
import {
    launchGame,
    launchPrivateGame,
    launchMultiplayerGame,
} from '../../core/utils/launcher.js';
import {
    getRegionData,
    getFullRegionName,
    REGIONS,
} from '../../core/regions.js';
import { createDropdownContent } from '../../core/ui/selects.js';
import { createButton } from '../../core/ui/buttons.js';
import { addTooltip as attachTooltip } from '../../core/ui/tooltip.js';
import {
    performJoinAction,
    getSavedPreferredRegion,
} from '../../core/preferredregion.js';
import { fetchThumbnails } from '../../core/thumbnail/thumbnails.js';
import DOMPurify from 'dompurify';
import { t, ts } from '../../core/locale/i18n.js';
import { safeHtml } from '../../core/packages/dompurify.js';

const GLOBAL_CONTAINER_ID = 'rovalra-private-servers-global-container';
const GAME_CARD_LINK_SELECTOR = 'a.game-card-link[href*="/games/"]';
const HOVER_CARD_EXIT_DELAY = 100;
const PRIVATE_SERVER_EXIT_DELAY = 200;

const State = {
    currentUserId: null,
    activePlaceId: null,
    activeGameCardLink: null,
    hoveredGameCardLink: null,

    privateServerStatus: new Map(),
    privateServerList: new Map(),
    privateServerDetails: new Map(),
    thumbnails: new Map(),

    privateServersContainer: null,
    dropdownPanel: null,

    hideOverlayTimer: null,
    isLoadingPrivateServers: false,
    currentNextPageCursor: null,

    cleanupTimers: new WeakMap(),
    settings: null,
};

const intersectionObservers = new Map();
let paidPriceScanTimer = null;
let paidPriceListenersAttached = false;
const Icons = {
    globe: () =>
        createSvgPath(
            'M19.3 16.9c.4-.7.7-1.5.7-2.4 0-2.5-2-4.5-4.5-4.5S11 12 11 14.5s2 4.5 4.5 4.5c.9 0 1.7-.3 2.4-.7l3.2 3.2 1.4-1.4zm-3.8.1c-1.4 0-2.5-1.1-2.5-2.5s1.1-2.5 2.5-2.5 2.5 1.1 2.5 2.5-1.1 2.5-2.5 2.5M12 20v2C6.48 22 2 17.52 2 12S6.48 2 12 2c4.84 0 8.87 3.44 9.8 8h-2.07c-.64-2.46-2.4-4.47-4.73-5.41V5c0 1.1-.9 2-2 2h-2v2c0 .55-.45 1-1 1H8v2h2v3H9l-4.79-4.79C4.08 10.79 4 11.38 4 12c0 4.41 3.59 8 8 8',
        ),
    privateServer: () =>
        createSvgPath(
            'M20 13H4c-.55 0-1 .45-1 1v6c0 .55.45 1 1 1h16c.55 0 1-.45 1-1v-6c0-.55-.45-1-1-1M7 19c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2M20 3H4c-.55 0-1 .45-1 1v6c0 .55.45 1 1 1h16c.55 0 1-.45 1-1V4c0-.55-.45-1-1-1M7 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2',
        ),
    copy: () =>
        createSvgPath(
            'M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2m0 16H8V7h11z',
            20,
        ),
    generate: () =>
        createSvgPath(
            'M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8',
            20,
            'scale(-1, 1)',
            'center',
        ),
    configure: () =>
        createSvgPath(
            'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6',
        ),
};

function createSvgPath(d, size = 22, transform = '', transformOrigin = '') {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'white');
    if (transform) {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('transform', transform);
        if (transformOrigin)
            g.setAttribute('transform-origin', transformOrigin);
        const path = document.createElementNS(
            'http://www.w3.org/2000/svg',
            'path',
        );
        path.setAttribute('d', d);
        g.appendChild(path);
        svg.appendChild(g);
    } else {
        svg.innerHTML = `<path d="${d}"></path>`;
    }
    return svg;
}

function getCurrentUserId() {
    const userDataTag = document.querySelector('meta[name="user-data"]');
    return userDataTag?.dataset?.userid
        ? parseInt(userDataTag.dataset.userid, 10)
        : null;
}

function getGameIdsFromLink(href) {
    try {
        const urlObj = new URL(href, window.location.origin);
        const params = urlObj.searchParams;

        let placeId = params.get('PlaceId');
        if (!placeId) {
            const match = urlObj.pathname.match(
                /^(?:\/[a-z]{2}(?:-[a-z]{2})?)?\/games\/(\d+)/,
            );
            if (match) placeId = match[1];
        }
        return { placeId, universeId: params.get('universeId') };
    } catch (e) {
        return { placeId: null, universeId: null };
    }
}

const PAID_PRICE_BADGE_CLASS = 'rovalra-paid-access-price-badge';
const PAID_PRICE_BADGE_ICON_CLASS = 'rovalra-paid-access-price-badge-icon';
const PAID_PRICE_BADGE_VALUE_CLASS = 'rovalra-paid-access-price-badge-value';
const PAID_PRICE_PROCESSED_CLASS = 'rovalra-paid-price-processed';
const PAID_PRICE_BADGE_ICON_SVG = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <path d="M15.0762 7.29574C15.6479 6.96571 16.3521 6.96571 16.9238 7.29574L23.0762 10.8479C23.6479 11.1779 24 11.7878 24 12.4479V19.5521C24 20.2122 23.6479 20.8221 23.0762 21.1521L16.9238 24.7043C16.3521 25.0343 15.6479 25.0343 15.0762 24.7043L8.92376 21.1521C8.35214 20.8221 8 20.2122 8 19.5521V12.4479C8 11.7878 8.35214 11.1779 8.92376 10.8479L15.0762 7.29574ZM11.9998 13V19C11.9998 19.5523 12.4475 20 12.9998 20H18.9998C19.5521 20 19.9998 19.5523 19.9998 19V13C19.9998 12.4477 19.5521 12 18.9998 12H12.9998C12.4475 12 11.9998 12.4477 11.9998 13Z"/>
        <path d="M13.8556 2.56068C15.1825 1.81311 16.8175 1.81311 18.1444 2.56068L26.8556 7.46819C28.1825 8.21577 29 9.59734 29 11.0925V20.9075C29 22.4027 28.1825 23.7842 26.8556 24.5318L18.1444 29.4393C16.8175 30.1869 15.1825 30.1869 13.8556 29.4393L5.14444 24.5318C3.81746 23.7842 3 22.4027 3 20.9075V11.0925C3 9.59734 3.81746 8.21577 5.14444 7.46819L13.8556 2.56068ZM17.1628 4.30319C16.4452 3.89894 15.5548 3.89894 14.8372 4.30319L6.12611 9.2107C5.41362 9.61209 5 10.336 5 11.0925V20.9075C5 21.664 5.41362 22.3879 6.12611 22.7893L14.8372 27.6968C15.5548 28.1011 16.4452 28.1011 17.1628 27.6968L25.8739 22.7893C26.5864 22.3879 27 21.664 27 20.9075V11.0925C27 10.336 26.5864 9.61209 25.8739 9.2107L17.1628 4.30319Z"/>
    </svg>`;
const paidPriceCache = new Map();
const paidPriceQueue = new Map();
let paidPriceTimer = null;

const paidPlayabilityCache = new Map();
const paidPlayabilityQueue = new Map();
let paidPlayabilityTimer = null;
let paidPlayabilityInFlight = false;

function shouldHidePaidPriceForPlayability(statusData) {
    if (!statusData) return false;

    const status = String(statusData.playabilityStatus || '').toLowerCase();
    if (status === 'playable' || statusData.isPlayable === true) return true;

    return false;
}

function getPaidPriceKey(placeId) {
    return String(placeId || '');
}

function getPaidPlayabilityKey(universeId) {
    return String(universeId || '');
}

function queuePaidPlayabilityCheck(universeId, onResolved) {
    const key = getPaidPlayabilityKey(universeId);
    if (!key) {
        onResolved(false);
        return;
    }

    if (paidPlayabilityCache.has(key)) {
        onResolved(paidPlayabilityCache.get(key));
        return;
    }

    if (!paidPlayabilityQueue.has(key)) {
        paidPlayabilityQueue.set(key, []);
    }
    paidPlayabilityQueue.get(key).push(onResolved);

    if (!paidPlayabilityTimer) {
        paidPlayabilityTimer = setTimeout(flushPaidPlayabilityQueue, 900);
    }
}

function resolvePaidPlayabilityCallbacks(universeId, hideBadge) {
    const key = getPaidPlayabilityKey(universeId);
    paidPlayabilityCache.set(key, !!hideBadge);

    const callbacks = paidPlayabilityQueue.get(key) || [];
    paidPlayabilityQueue.delete(key);
    callbacks.forEach((callback) => {
        try {
            callback(!!hideBadge);
        } catch (e) {
            console.warn('RoValra: Failed to resolve paid access status', e);
        }
    });
}

async function flushPaidPlayabilityQueue() {
    if (paidPlayabilityInFlight) {
        if (!paidPlayabilityTimer) {
            paidPlayabilityTimer = setTimeout(flushPaidPlayabilityQueue, 1200);
        }
        return;
    }

    const universeIds = Array.from(paidPlayabilityQueue.keys()).filter(
        (id) => !paidPlayabilityCache.has(id),
    );

    paidPlayabilityTimer = null;
    if (!universeIds.length) return;

    const chunk = universeIds.slice(0, 3);
    paidPlayabilityInFlight = true;

    try {
        const playabilityEndpoint = `/v1/games/multiget-playability-status?${chunk
            .map((id) => `universeIds=${encodeURIComponent(id)}`)
            .join('&')}`;
        const playabilityRes = await callRobloxApi({
            subdomain: 'games',
            endpoint: playabilityEndpoint,
            method: 'GET',
        });

        if (!playabilityRes.ok) {
            throw new Error(`playability status ${playabilityRes.status}`);
        }

        const playabilityData = await playabilityRes.json();
        const returned = new Set();

        if (Array.isArray(playabilityData)) {
            for (const statusData of playabilityData) {
                const universeId = getPaidPlayabilityKey(
                    statusData?.universeId ?? statusData?.UniverseId,
                );
                if (!universeId) continue;

                returned.add(universeId);
                resolvePaidPlayabilityCallbacks(
                    universeId,
                    shouldHidePaidPriceForPlayability(statusData),
                );
            }
        }

        chunk.forEach((universeId) => {
            if (!returned.has(universeId)) {
                resolvePaidPlayabilityCallbacks(universeId, false);
            }
        });
    } catch (e) {
        console.warn('RoValra: Delaying paid access badge ownership check', e);
    } finally {
        paidPlayabilityInFlight = false;
        if (paidPlayabilityQueue.size) {
            paidPlayabilityTimer = setTimeout(flushPaidPlayabilityQueue, 1800);
        }
    }
}

function getPaidPriceStore() {
    if (
        !window.__rovalraPaidAccessPrices ||
        !window.__rovalraPaidAccessPrices.set
    ) {
        window.__rovalraPaidAccessPrices = new Map();
    }
    return window.__rovalraPaidAccessPrices;
}

function injectPaidPriceBadgeStyles() {
    if (document.getElementById('rovalra-paid-price-badge-styles')) return;

    const style = document.createElement('style');
    style.id = 'rovalra-paid-price-badge-styles';
    style.textContent = `
        .${PAID_PRICE_BADGE_CLASS} {
            position: absolute;
            bottom: 4px;
            right: 4px;
            z-index: 5;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
            flex: 0 0 auto;
            height: 19px;
            max-width: 62px;
            padding: 0 8px 0 6px;
            border-radius: 999px;
            background: #335fff;
            color: #fff;
            font-size: 11px;
            font-weight: 700;
            line-height: 1;
            white-space: nowrap;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18);
            pointer-events: none;
        }
        .${PAID_PRICE_BADGE_CLASS} .${PAID_PRICE_BADGE_ICON_CLASS} {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 11px;
            height: 11px;
            flex: 0 0 auto;
            color: currentColor;
        }
        .${PAID_PRICE_BADGE_CLASS} .${PAID_PRICE_BADGE_ICON_CLASS} svg {
            width: 100%;
            height: 100%;
            fill: currentColor;
            display: block;
        }
        .${PAID_PRICE_BADGE_CLASS} .${PAID_PRICE_BADGE_VALUE_CLASS} {
            display: inline-block;
            line-height: 1;
        }
    `;
    document.documentElement.appendChild(style);
}

function getPaidPriceCardRoot(gameLink) {
    return (
        gameLink.closest(
            '.game-card-container, .game-card, .list-item, .item-card, li, .game-tile',
        ) ||
        gameLink.parentElement ||
        gameLink
    );
}

function hasNativePaidPrice(gameLink, price) {
    const card = getPaidPriceCardRoot(gameLink);
    if (!card) return false;

    const text = (card.textContent || '').replace(/\s+/g, ' ').trim();
    if (/\b\d[\d,.]*\s*Robux\b/i.test(text)) return true;

    const escapedPrice = String(price || '').replace(
        /[.*+?^${}()|[\]\\]/g,
        '\\$&',
    );
    if (
        price &&
        new RegExp(`\\b${escapedPrice}\\b`).test(text) &&
        card.querySelector(
            '.icon-robux, [class*="robux" i], [aria-label*="Robux" i], [title*="Robux" i]',
        )
    ) {
        return true;
    }

    return false;
}

function isLargeSearchCard(gameLink) {
    const card = getPaidPriceCardRoot(gameLink);
    const rect = (card || gameLink).getBoundingClientRect?.();
    if (rect && rect.width > 430) return true;

    const text = (card?.textContent || '').replace(/\s+/g, ' ');
    return /\bBy\s+[^\n]+/.test(text) || text.length > 180;
}

function placePaidPriceBadge(gameLink, badge) {
    const thumbContainer = gameLink.querySelector(
        '.game-card-thumb-container, .featured-game-icon-container',
    );
    if (!thumbContainer) return;

    thumbContainer.style.position = 'relative';
    thumbContainer.appendChild(badge);
}

function addPaidPriceBadge(gameLink, price) {
    price = Number(price || 0);
    if (
        !price ||
        !gameLink ||
        gameLink.querySelector(`.${PAID_PRICE_BADGE_CLASS}`)
    ) {
        return;
    }
    if (hasNativePaidPrice(gameLink, price) || isLargeSearchCard(gameLink)) {
        return;
    }

    const thumbContainer = gameLink.querySelector(
        '.game-card-thumb-container, .featured-game-icon-container',
    );
    if (!thumbContainer) return;

    injectPaidPriceBadgeStyles();

    const badge = document.createElement('span');
    badge.className = PAID_PRICE_BADGE_CLASS;
    badge.title = `Paid access: ${price.toLocaleString()} Robux`;

    const icon = document.createElement('span');
    icon.className = PAID_PRICE_BADGE_ICON_CLASS;
    icon.innerHTML = PAID_PRICE_BADGE_ICON_SVG;

    const value = document.createElement('span');
    value.className = PAID_PRICE_BADGE_VALUE_CLASS;
    value.textContent = price.toLocaleString();

    badge.append(icon, value);

    placePaidPriceBadge(gameLink, badge);
}

function removePaidPriceBadge(gameLink) {
    if (!gameLink) return;

    gameLink
        .querySelectorAll?.(`.${PAID_PRICE_BADGE_CLASS}`)
        .forEach((badge) => badge.remove());
}

async function fetchPaidPriceChunk(placeIds) {
    const endpoint = `/v1/games/multiget-place-details?${placeIds
        .map((id) => `placeIds=${encodeURIComponent(id)}`)
        .join('&')}`;

    const placeRes = await callRobloxApi({
        subdomain: 'games',
        endpoint,
        method: 'GET',
    });
    const placeData = placeRes.ok ? await placeRes.json() : [];

    const prices = new Map();
    const placeToUniverse = new Map();
    const placePlayable = new Map();

    if (Array.isArray(placeData)) {
        for (const item of placeData) {
            const itemPlaceId = getPaidPriceKey(
                item?.placeId ?? item?.PlaceId ?? item?.id,
            );
            const universeId = getPaidPlayabilityKey(
                item?.universeId ?? item?.UniverseId,
            );
            const price = Number(
                item?.price ??
                    item?.Price ??
                    item?.accessPrice ??
                    item?.priceInRobux ??
                    0,
            );
            const hasDirectPlayableState =
                typeof item?.isPlayable === 'boolean' ||
                typeof item?.IsPlayable === 'boolean' ||
                item?.playabilityStatus != null ||
                item?.PlayabilityStatus != null;
            const directPlayable =
                item?.isPlayable === true ||
                item?.IsPlayable === true ||
                String(
                    item?.playabilityStatus ?? item?.PlayabilityStatus ?? '',
                ).toLowerCase() === 'playable';

            if (itemPlaceId) prices.set(itemPlaceId, price);
            if (itemPlaceId && hasDirectPlayableState) {
                placePlayable.set(itemPlaceId, directPlayable);
            }
            if (itemPlaceId && universeId && price > 0) {
                placeToUniverse.set(itemPlaceId, universeId);
            }
        }
    }

    return { prices, placeToUniverse, placePlayable };
}

function flushPaidPriceQueue() {
    const entries = Array.from(paidPriceQueue.entries());
    paidPriceQueue.clear();
    paidPriceTimer = null;

    const unresolved = entries.filter(
        ([placeId]) => !paidPriceCache.has(placeId),
    );
    const unresolvedLinks = new Map(unresolved);

    for (const [placeId, links] of entries) {
        if (!paidPriceCache.has(placeId)) continue;
        links.forEach((link) =>
            addPaidPriceBadge(link, paidPriceCache.get(placeId)),
        );
    }

    const placeIds = unresolved.map(([placeId]) => placeId).filter(Boolean);
    if (!placeIds.length) return;

    for (let i = 0; i < placeIds.length; i += 50) {
        const chunk = placeIds.slice(i, i + 50);
        fetchPaidPriceChunk(chunk)
            .then(({ prices, placeToUniverse, placePlayable }) => {
                for (const placeId of chunk) {
                    const key = getPaidPriceKey(placeId);
                    const price = prices.get(key) || 0;
                    const universeId = placeToUniverse.get(key);
                    const directPlayable = placePlayable.get(key);
                    const links = unresolvedLinks.get(placeId) || [];

                    if (!price) {
                        paidPriceCache.set(placeId, 0);
                        getPaidPriceStore().set(key, 0);
                        continue;
                    }

                    const showBadge = () => {
                        paidPriceCache.set(placeId, price);
                        getPaidPriceStore().set(key, price);
                        links.forEach((link) => addPaidPriceBadge(link, price));
                    };

                    if (directPlayable === true) {
                        paidPriceCache.set(placeId, 0);
                        getPaidPriceStore().set(key, 0);
                        links.forEach((link) => removePaidPriceBadge(link));
                        continue;
                    }

                    if (directPlayable === false || !universeId) {
                        showBadge();
                        continue;
                    }

                    let playabilityResolved = false;
                    const fallbackTimer = setTimeout(() => {
                        if (playabilityResolved) return;

                        showBadge();
                    }, 1400);

                    queuePaidPlayabilityCheck(universeId, (hideBadge) => {
                        playabilityResolved = true;
                        clearTimeout(fallbackTimer);

                        const finalPrice = hideBadge ? 0 : price;
                        paidPriceCache.set(placeId, finalPrice);
                        getPaidPriceStore().set(key, finalPrice);

                        if (hideBadge) {
                            links.forEach((link) => removePaidPriceBadge(link));
                            return;
                        }

                        links.forEach((link) => addPaidPriceBadge(link, price));
                    });
                }
            })
            .catch(() => {
                chunk.forEach((placeId) => {
                    const key = getPaidPriceKey(placeId);
                    paidPriceCache.set(placeId, 0);
                    getPaidPriceStore().set(key, 0);
                });
            });
    }
}

function processPaidPriceBadgeLogic(gameLink, placeId) {
    if (paidPriceCache.has(placeId)) {
        addPaidPriceBadge(gameLink, paidPriceCache.get(placeId));
        return;
    }

    if (!paidPriceQueue.has(placeId)) paidPriceQueue.set(placeId, []);
    paidPriceQueue.get(placeId).push(gameLink);

    if (!paidPriceTimer) {
        paidPriceTimer = setTimeout(flushPaidPriceQueue, 450);
    }
}

function setupPaidPriceBadge(gameLink) {
    if (!gameLink || gameLink.classList.contains(PAID_PRICE_PROCESSED_CLASS)) {
        return;
    }

    const { placeId } = getGameIdsFromLink(gameLink.href);
    if (!placeId) return;

    gameLink.classList.add(PAID_PRICE_PROCESSED_CLASS);

    const observer = observeIntersection(
        gameLink,
        (entry) => {
            if (entry.isIntersecting) {
                processPaidPriceBadgeLogic(gameLink, placeId);
                stopPaidPriceBadgeObserver(gameLink);
            }
        },
        { threshold: 0.1 },
    );

    intersectionObservers.set(gameLink, observer);
}

function stopPaidPriceBadgeObserver(gameLink) {
    const observer = intersectionObservers.get(gameLink);
    if (!observer) return;

    observer.unobserve();
    intersectionObservers.delete(gameLink);
    if (!gameLink.isConnected) {
        gameLink.classList.remove(PAID_PRICE_PROCESSED_CLASS);
    }
}

function isQuickPlayCardLink(element) {
    if (!element || !element.matches?.(GAME_CARD_LINK_SELECTOR)) return false;
    return !element.closest('[data-testid="event-experience-link"]');
}

function getQuickPlayCardFromTarget(target) {
    const gameLink = target?.closest?.(GAME_CARD_LINK_SELECTOR);
    return isQuickPlayCardLink(gameLink) ? gameLink : null;
}

function scanPaidPriceCards() {
    paidPriceScanTimer = null;
    if (!State.settings?.PaidAccessPriceBadgeEnabled) return;

    intersectionObservers.forEach((observer, gameLink) => {
        if (!gameLink.isConnected) stopPaidPriceBadgeObserver(gameLink);
    });

    document
        .querySelectorAll(
            `${GAME_CARD_LINK_SELECTOR}:not(.${PAID_PRICE_PROCESSED_CLASS})`,
        )
        .forEach((gameLink) => {
            if (isQuickPlayCardLink(gameLink)) {
                setupPaidPriceBadge(gameLink);
            }
        });
}

function schedulePaidPriceScan(delay = 250) {
    if (paidPriceScanTimer) return;

    paidPriceScanTimer = setTimeout(() => {
        if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(scanPaidPriceCards, { timeout: 1200 });
            return;
        }

        requestAnimationFrame(scanPaidPriceCards);
    }, delay);
}

function attachPaidPriceListeners() {
    if (paidPriceListenersAttached) return;
    paidPriceListenersAttached = true;

    window.addEventListener('scroll', () => schedulePaidPriceScan(500), {
        passive: true,
    });
    window.addEventListener('resize', () => schedulePaidPriceScan(500), {
        passive: true,
    });
    schedulePaidPriceScan(0);
}

function handleQuickPlayCardEnter(event) {
    const gameLink = getQuickPlayCardFromTarget(event.target);
    if (!gameLink || gameLink.contains(event.relatedTarget)) return;

    const settings = State.settings;
    if (!settings) return;

    if (
        State.activeGameCardLink &&
        State.activeGameCardLink !== gameLink &&
        State.dropdownPanel?.classList.contains('visible')
    ) {
        clearTimeout(State.hideOverlayTimer);
        hidePrivateServersOverlay();
    }

    if (
        State.activeGameCardLink === gameLink &&
        State.dropdownPanel?.classList.contains('visible')
    ) {
        clearTimeout(State.hideOverlayTimer);
    }

    if (settings.PaidAccessPriceBadgeEnabled) {
        setupPaidPriceBadge(gameLink);
    }

    setupHoverCard(gameLink, settings);
}

function handleQuickPlayCardLeave(event) {
    const gameLink = getQuickPlayCardFromTarget(event.target);
    if (!gameLink || gameLink.contains(event.relatedTarget)) return;

    if (
        State.activeGameCardLink === gameLink &&
        State.dropdownPanel?.classList.contains('visible')
    ) {
        if (event.type === 'focusout' && gameLink.matches(':hover')) return;

        clearTimeout(State.hideOverlayTimer);
        State.hideOverlayTimer = setTimeout(
            hidePrivateServersOverlay,
            PRIVATE_SERVER_EXIT_DELAY,
        );
        scheduleCardCleanup(gameLink, PRIVATE_SERVER_EXIT_DELAY);
        return;
    }

    if (
        gameLink.matches(':hover') ||
        gameLink.contains(document.activeElement)
    ) {
        return;
    }

    scheduleCardCleanup(gameLink, HOVER_CARD_EXIT_DELAY);
}

function attachQuickPlayDelegatedListeners() {
    if (attachQuickPlayDelegatedListeners._run) return;
    attachQuickPlayDelegatedListeners._run = true;

    document.addEventListener('pointerover', handleQuickPlayCardEnter);
    document.addEventListener('pointerout', handleQuickPlayCardLeave);
    document.addEventListener('focusin', handleQuickPlayCardEnter);
    document.addEventListener('focusout', handleQuickPlayCardLeave);
}

function showTemporaryTooltip(parent, text, duration = 1400) {
    const temp = document.createElement('div');
    temp.className = 'rovalra-ps-tooltip';
    Object.assign(temp.style, {
        position: 'absolute',
        zIndex: '10006',
        pointerEvents: 'none',
        opacity: '0',
        transition: 'opacity 0.12s ease',
    });
    temp.innerHTML = text;
    document.body.appendChild(temp);

    const rect = parent.getBoundingClientRect();
    temp.style.left = `${rect.left + window.scrollX + rect.width / 2}px`;
    temp.style.top = `${rect.top + window.scrollY - 8}px`;
    temp.style.transform = 'translate(-50%, -100%)';

    requestAnimationFrame(() => (temp.style.opacity = '1'));
    setTimeout(() => {
        temp.style.opacity = '0';
        setTimeout(() => temp.remove(), 150);
    }, duration);
}

async function getVipServerDetails(vipServerId) {
    if (State.privateServerDetails.has(vipServerId))
        return State.privateServerDetails.get(vipServerId);
    try {
        const res = await callRobloxApi({
            subdomain: 'games',
            endpoint: `/v1/vip-servers/${vipServerId}`,
        });
        const data = res.ok ? await res.json() : null;
        State.privateServerDetails.set(vipServerId, data);
        return data;
    } catch {
        State.privateServerDetails.set(vipServerId, null);
        return null;
    }
}

async function isVipServerActive(vipServerId) {
    if (State.privateServerStatus.has(vipServerId))
        return State.privateServerStatus.get(vipServerId);
    try {
        const res = await callRobloxApi({
            subdomain: 'games',
            endpoint: `/v1/vip-servers/${vipServerId}`,
        });
        if (!res.ok) {
            State.privateServerStatus.set(vipServerId, false);
            return false;
        }
        const data = await res.json();
        const isExpired = data.subscription?.expired === true;
        const isActive = data.active === true && !isExpired;
        State.privateServerStatus.set(vipServerId, isActive);
        return isActive;
    } catch {
        State.privateServerStatus.set(vipServerId, false);
        return false;
    }
}

async function getThumbnails(userIds) {
    const idsToFetch = userIds.filter((id) => !State.thumbnails.has(id));
    if (idsToFetch.length > 0) {
        const items = idsToFetch.map((id) => ({ id }));
        try {
            const result = await fetchThumbnails(
                items,
                'AvatarHeadshot',
                '150x150',
                true,
            );
            result.forEach((thumbData, userId) => {
                if (thumbData.state === 'Completed')
                    State.thumbnails.set(userId, thumbData.imageUrl);
            });
        } catch (e) {
            console.error('Quick Play: Thumb fetch failed', e);
        }
    }
    const finalMap = {};
    userIds.forEach((id) => {
        if (State.thumbnails.has(id)) finalMap[id] = State.thumbnails.get(id);
    });
    return finalMap;
}

function createGlobalPrivateServerContainer() {
    if (document.getElementById(GLOBAL_CONTAINER_ID)) return;

    const { element: dropdownPanel } = createDropdownContent(
        document.body,
        [],
        null,
        () => {},
        () => {},
    );
    dropdownPanel.id = GLOBAL_CONTAINER_ID;
    Object.assign(dropdownPanel.style, {
        width: '320px',
        minWidth: '0px',
        maxHeight: '400px',
    });
    dropdownPanel.setAttribute('data-state', 'closed');
    document.body.appendChild(dropdownPanel);

    State.dropdownPanel = dropdownPanel;
    State.privateServersContainer = dropdownPanel.querySelector(
        '.flex-dropdown-menu',
    );

    if (State.privateServersContainer) {
        State.privateServersContainer.className = 'rovalra-ps-list-container';
        State.privateServersContainer.addEventListener('scroll', (e) => {
            if (
                State.isLoadingPrivateServers ||
                !State.currentNextPageCursor ||
                !State.activePlaceId
            )
                return;
            const { scrollTop, scrollHeight, clientHeight } = e.target;
            if (scrollHeight - scrollTop - clientHeight < 50) {
                fetchAndDisplayPrivateServers(
                    State.activePlaceId,
                    true,
                    State.currentNextPageCursor,
                );
            }
        });
    }

    dropdownPanel.addEventListener('mouseenter', () => {
        clearTimeout(State.hideOverlayTimer);
        if (State.activeGameCardLink) {
            cancelCardCleanup(State.activeGameCardLink);
            State.activeGameCardLink.classList.add('quick-play-hover-active');
        }
    });

    dropdownPanel.addEventListener('mouseleave', () => {
        State.hideOverlayTimer = setTimeout(
            hidePrivateServersOverlay,
            PRIVATE_SERVER_EXIT_DELAY,
        );
        if (State.activeGameCardLink) {
            scheduleCardCleanup(
                State.activeGameCardLink,
                PRIVATE_SERVER_EXIT_DELAY,
            );
        }
    });
}

async function fetchAndDisplayPrivateServers(
    placeId,
    loadMore = false,
    nextPageCursor = null,
) {
    if (State.isLoadingPrivateServers) return;
    State.isLoadingPrivateServers = true;
    const isDark = document.body.classList.contains('dark-theme');

    try {
        if (!loadMore) {
            State.privateServersContainer.innerHTML = DOMPurify.sanitize(
                `<p style="color: var(--rovalra-secondary-text-color); text-align: center; padding: 10px 0;">${await t('quickPlay.loading')}</p>`,
            );

            if (State.privateServerList.has(placeId)) {
                const cached = State.privateServerList.get(placeId);
                const thumbs = await getThumbnails(
                    cached.servers.map((s) => s.owner.id),
                );
                await renderPrivateServers(
                    placeId,
                    cached.servers,
                    cached.nextPageCursor,
                    thumbs,
                    false,
                );
                State.isLoadingPrivateServers = false;
                return;
            }
        }

        let res;
        let retryDelay = 1000;

        while (true) {
            if (
                State.activePlaceId !== placeId ||
                !State.dropdownPanel.classList.contains('visible')
            ) {
                State.isLoadingPrivateServers = false;
                return;
            }

            res = await callRobloxApi({
                subdomain: 'games',
                endpoint: `/v1/games/${placeId}/private-servers?limit=100&sortOrder=Desc${nextPageCursor ? `&cursor=${nextPageCursor}` : ''}`,
            });

            if (res.status === 429) {
                if (!loadMore) {
                    State.privateServersContainer.innerHTML =
                        DOMPurify.sanitize(
                            `<p style="color: var(--rovalra-secondary-text-color); text-align: center; padding: 10px 0;">${await t('quickPlay.rateLimited')}</p>`,
                        );
                }

                await new Promise((resolve) => setTimeout(resolve, retryDelay));

                retryDelay = Math.min(retryDelay * 2, 8000);

                continue;
            }

            break;
        }

        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();

        let serversToDisplay = data.data;

        if (State.currentUserId) {
            const checks = await Promise.all(
                data.data.map(async (s) => {
                    if (s.owner.id === State.currentUserId) {
                        const active = await isVipServerActive(s.vipServerId);
                        return active ? s : null;
                    }
                    return s;
                }),
            );
            serversToDisplay = checks.filter((s) => s !== null);
        }

        const thumbs = await getThumbnails(
            serversToDisplay.map((s) => s.owner.id),
        );

        if (loadMore) {
            const cached = State.privateServerList.get(placeId) || {
                servers: [],
                nextPageCursor: null,
            };
            cached.servers.push(...serversToDisplay);
            cached.nextPageCursor = data.nextPageCursor;
            await renderPrivateServers(
                placeId,
                serversToDisplay,
                data.nextPageCursor,
                thumbs,
                true,
            );
        } else {
            State.privateServerList.set(placeId, {
                servers: serversToDisplay,
                nextPageCursor: data.nextPageCursor,
            });
            await renderPrivateServers(
                placeId,
                serversToDisplay,
                data.nextPageCursor,
                thumbs,
                false,
            );
        }
    } catch (e) {
        if (State.activePlaceId === placeId) {
            State.privateServersContainer.innerHTML = DOMPurify.sanitize(
                `<p style="text-align: center;">${await t('quickPlay.loadError')}</p>`,
            );
        }
    } finally {
        State.isLoadingPrivateServers = false;
    }
}

async function renderPrivateServers(
    placeId,
    servers,
    nextPageCursor,
    thumbnails,
    append,
) {
    const isDark = document.body.classList.contains('dark-theme');
    if (!append) State.privateServersContainer.innerHTML = '';
    State.currentNextPageCursor = nextPageCursor;

    if (!servers.length && !append) {
        const msg = document.createElement('p');
        msg.textContent = await t('quickPlay.noPrivateServers');
        Object.assign(msg.style, {
            color: 'var(--rovalra-secondary-text-color)',
            textAlign: 'center',
            padding: '10px 0',
        });
        State.privateServersContainer.appendChild(msg);
        return;
    }

    const fragment = document.createDocumentFragment();

    servers.forEach((server) => {
        const el = document.createElement('div');
        el.className = 'private-server-item';

        const thumbUrl = thumbnails[server.owner.id];
        el.innerHTML = safeHtml`
            <a href="https://www.roblox.com/users/${server.owner.id}/profile" target="_blank" class="private-server-owner-thumb-link">
                <img class="private-server-owner-thumb" src="${thumbUrl || ''}">
            </a>
            <div class="private-server-info">
                <span class="private-server-name" title="${server.name}">${server.name}</span>
                <span class="private-server-players">${server.players.length} / ${server.maxPlayers}</span>
            </div>
        `;

        const thumbLink = el.querySelector('.private-server-owner-thumb-link');
        if (thumbLink)
            thumbLink.addEventListener('click', (e) => e.stopPropagation());

        if (server.owner.id === State.currentUserId) {
            const actions = document.createElement('div');
            actions.className = 'private-server-owner-actions';

            const createActionBtn = (
                icon,
                tooltip,
                onClick,
                initDisabled = false,
            ) => {
                const btn = createButton('', 'secondary');
                btn.classList.add('private-server-action-btn');
                btn.append(icon());
                attachTooltip(btn, tooltip, { position: 'top' });
                btn.disabled = initDisabled;
                btn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onClick(btn);
                };
                return btn;
            };

            actions.append(
                createActionBtn(
                    Icons.configure,
                    ts('quickPlay.configure'),
                    () =>
                        window.open(
                            `https://www.roblox.com/private-server/configure/${server.vipServerId}`,
                            '_blank',
                        ),
                ),
                createActionBtn(
                    Icons.copy,
                    ts('quickPlay.copyLink'),
                    async (btn) => {
                        btn.disabled = true;
                        const details = await getVipServerDetails(
                            server.vipServerId,
                        );
                        if (details?.link) {
                            await navigator.clipboard.writeText(details.link);
                            showTemporaryTooltip(btn, ts('quickPlay.copied'));
                        } else showTemporaryTooltip(btn, ts('quickPlay.error'));
                        setTimeout(() => (btn.disabled = false), 1500);
                    },
                    true,
                ),
                createActionBtn(
                    Icons.generate,
                    ts('quickPlay.generateLink'),
                    async (btn) => {
                        const oldContent = btn.innerHTML;
                        btn.innerHTML = '...';
                        btn.disabled = true;
                        const res = await callRobloxApi({
                            subdomain: 'games',
                            endpoint: `/v1/vip-servers/${server.vipServerId}`,
                            method: 'PATCH',
                            body: { newJoinCode: true },
                        });
                        if (res.ok) {
                            State.privateServerDetails.delete(
                                server.vipServerId,
                            );
                        }
                        setTimeout(() => {
                            btn.innerHTML = oldContent;
                            btn.disabled = false;
                        }, 1500);
                    },
                ),
            );
            getVipServerDetails(server.vipServerId).then((d) => {
                const copyBtn = actions.querySelector('button:nth-child(2)');
                if (d?.link && copyBtn) copyBtn.disabled = false;
            });
            el.appendChild(actions);
        }

        const joinBtn = document.createElement('button');
        joinBtn.className = 'private-server-join-btn';
        joinBtn.innerHTML = DOMPurify.sanitize(
            `<span class="icon-common-play"></span>`,
        );
        joinBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            launchPrivateGame(placeId, server.accessCode, server.vipServerId);
            showReviewPopup('quickplay');
            hidePrivateServersOverlay();
        };
        el.appendChild(joinBtn);
        fragment.appendChild(el);
    });

    State.privateServersContainer.appendChild(fragment);
}

function showPrivateServerOverlay(gameLink, placeId) {
    if (State.activeGameCardLink === gameLink) {
        hidePrivateServersOverlay();
        return;
    }
    if (State.activeGameCardLink)
        State.activeGameCardLink.classList.remove('quick-play-hover-active');

    State.activeGameCardLink = gameLink;
    State.activePlaceId = placeId;
    gameLink.classList.add('quick-play-hover-active');

    const dropdown = State.dropdownPanel;
    if (!dropdown) return;

    const rect = gameLink.getBoundingClientRect();
    const width = 320;
    dropdown.style.width = `${width}px`;

    let left = rect.left + window.scrollX + rect.width / 2 - width / 2;
    left = Math.max(
        10,
        Math.min(left, document.documentElement.clientWidth - width - 10),
    );
    const top = rect.bottom + window.scrollY + 8;

    dropdown.style.top = `${top}px`;
    dropdown.style.left = `${left}px`;
    dropdown.classList.add('visible');
    try {
        dropdown.setAttribute('data-state', 'open');
    } catch (e) {}

    fetchAndDisplayPrivateServers(placeId);
}

function hidePrivateServersOverlay() {
    if (State.dropdownPanel && State.dropdownPanel.matches(':hover')) return;

    if (
        !State.dropdownPanel ||
        !State.dropdownPanel.classList.contains('visible')
    )
        return;

    if (State.activeGameCardLink)
        State.activeGameCardLink.classList.remove('quick-play-hover-active');

    State.dropdownPanel.classList.remove('visible');
    try {
        State.dropdownPanel.setAttribute('data-state', 'closed');
    } catch (e) {}

    State.activeGameCardLink = null;
    State.activePlaceId = null;
    State.currentNextPageCursor = null;
    State.hideOverlayTimer = null;
}

function cancelCardCleanup(gameLink) {
    const timerId = State.cleanupTimers.get(gameLink);
    if (!timerId) return;

    clearTimeout(timerId);
    State.cleanupTimers.delete(gameLink);
}

function performCardCleanup(gameLink) {
    cancelCardCleanup(gameLink);
    gameLink.classList.remove(
        'quick-play-hover-active',
        'quick-play-hover-hidden',
    );
    gameLink.querySelector('.hover-background')?.remove();
    gameLink.querySelector('.play-button-overlay')?.remove();
    gameLink.classList.remove('game-tile-styles');
    gameLink
        .querySelectorAll('.quick-play-original-stats')
        .forEach((el) => el.classList.remove('quick-play-original-stats'));

    if (State.hoveredGameCardLink === gameLink) {
        State.hoveredGameCardLink = null;
    }
}

function scheduleCardCleanup(gameLink, delay) {
    cancelCardCleanup(gameLink);

    const timerId = setTimeout(() => {
        State.cleanupTimers.delete(gameLink);
        if (
            gameLink.matches(':hover') &&
            !gameLink.classList.contains('quick-play-hover-hidden')
        ) {
            return;
        }

        if (
            State.activeGameCardLink === gameLink &&
            State.dropdownPanel?.matches(':hover')
        ) {
            return;
        }

        if (State.activeGameCardLink === gameLink) {
            hidePrivateServersOverlay();
        }

        performCardCleanup(gameLink);
    }, delay);

    State.cleanupTimers.set(gameLink, timerId);
}

function setupHoverCard(gameLink, settings) {
    if (State.hoveredGameCardLink && State.hoveredGameCardLink !== gameLink) {
        State.hoveredGameCardLink.classList.remove('quick-play-hover-active');
        State.hoveredGameCardLink.classList.add('quick-play-hover-hidden');
        scheduleCardCleanup(State.hoveredGameCardLink, HOVER_CARD_EXIT_DELAY);
    }

    State.hoveredGameCardLink = gameLink;
    cancelCardCleanup(gameLink);
    gameLink.classList.remove('quick-play-hover-hidden');
    gameLink.classList.add('quick-play-hover-active');

    if (gameLink.querySelector('.play-button-overlay')) {
        return;
    }

    gameLink.classList.add('game-tile-styles');
    const isSpecialLayout = gameLink.closest(
        '.featured-game-container, .featured-grid-item-container',
    );

    if (!isSpecialLayout) {
        const hoverBg = document.createElement('div');
        hoverBg.className = 'hover-background';
        gameLink.appendChild(hoverBg);
    }

    const overlay = document.createElement('div');
    overlay.className = 'play-button-overlay';
    const wrapper = document.createElement('div');
    wrapper.className = 'play-buttons-wrapper';

    const { placeId, universeId } = getGameIdsFromLink(gameLink.href);

    const handlePreferredJoin = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        hidePrivateServersOverlay();
        if (!placeId) return;
        try {
            const savedRegion = await getSavedPreferredRegion();
            showRegionDonationPopup('quickplay_region');
            await performJoinAction(
                placeId,
                universeId,
                savedRegion === 'AUTO' ? null : savedRegion,
            );
        } catch (err) {}
    };

    const handleNormalJoin = (e) => {
        e.preventDefault();
        e.stopPropagation();
        hidePrivateServersOverlay();
        if (placeId) {
            launchGame(placeId);
            showReviewPopup('quickplay');
        }
    };

    const playBtn = document.createElement('button');
    playBtn.className = 'play-game-button';
    playBtn.innerHTML = DOMPurify.sanitize(
        `<span class="icon-common-play"></span>`,
    );

    if (
        settings.PreferredRegionEnabled &&
        settings.playbuttonpreferredregionenabled
    ) {
        playBtn.onclick = handlePreferredJoin;
        if (settings.robloxPreferredRegion === 'AUTO')
            attachTooltip(playBtn, ts('quickPlay.joinClosestServer'));
        else addRegionTooltip(playBtn);
    } else {
        playBtn.onclick = handleNormalJoin;
    }
    wrapper.appendChild(playBtn);

    if (
        settings.PreferredRegionEnabled &&
        !settings.playbuttonpreferredregionenabled
    ) {
        const regionBtn = document.createElement('button');
        regionBtn.className = 'server-browser-button';
        regionBtn.appendChild(Icons.globe());
        regionBtn.onclick = handlePreferredJoin;
        if (settings.robloxPreferredRegion === 'AUTO')
            attachTooltip(regionBtn, ts('quickPlay.joinClosestServer'));
        else addRegionTooltip(regionBtn);
        wrapper.appendChild(regionBtn);
    }

    if (settings.privateservers) {
        const psBtn = document.createElement('button');
        psBtn.className = 'private-servers-button';
        psBtn.append(Icons.privateServer());
        attachTooltip(psBtn, ts('quickPlay.privateServers'));
        psBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (placeId) showPrivateServerOverlay(gameLink, placeId);
        };
        wrapper.appendChild(psBtn);
    }

    overlay.appendChild(wrapper);
    gameLink.appendChild(overlay);

    if (!isSpecialLayout) {
        gameLink
            .querySelectorAll('.game-card-info, .game-card-friend-info')
            .forEach((el) => el.classList.add('quick-play-original-stats'));
    }
}

async function addRegionTooltip(button) {
    const saved = await new Promise((r) =>
        chrome.storage.local.get('robloxPreferredRegion', (res) => r(res)),
    );
    const regionCode = saved.robloxPreferredRegion;
    const text =
        regionCode && REGIONS[regionCode]
            ? await t('regionPlayButton.tooltipWithRegion', {
                  regionName: getFullRegionName(regionCode),
              })
            : ts('quickPlay.selectPreferredRegion');
    attachTooltip(button, text);
}

function initializeQuickPlay() {
    if (window.hasRunQuickPlayScript) {
        if (State.settings?.PaidAccessPriceBadgeEnabled) {
            schedulePaidPriceScan(0);
        }
        return;
    }
    window.hasRunQuickPlayScript = true;
    window.EMULATE_API_FAILURE = true;

    createGlobalPrivateServerContainer();

    chrome.storage.local.get(
        {
            PreferredRegionEnabled: true,
            privateservers: true,
            PaidAccessPriceBadgeEnabled: true,
            playbuttonpreferredregionenabled: true,
            robloxPreferredRegion: 'AUTO',
        },
        (settings) => {
            State.settings = settings;
            State.currentUserId = getCurrentUserId();
            attachQuickPlayDelegatedListeners();

            if (settings.PaidAccessPriceBadgeEnabled) {
                attachPaidPriceListeners();
            }
        },
    );

    window.addEventListener(
        'beforeunload',
        () => {
            State.dropdownPanel?.remove();
            document
                .getElementById('rovalra-global-quickplay-tooltip')
                ?.remove();
            window.hasRunQuickPlayScript = false;

            intersectionObservers.forEach((obs) => obs.unobserve());
            intersectionObservers.clear();
        },
        { once: true },
    );
}

export function init() {
    chrome.storage.local.get({ QuickPlayEnable: true }, (settings) => {
        if (settings.QuickPlayEnable) {
            if (document.readyState === 'loading')
                document.addEventListener(
                    'DOMContentLoaded',
                    initializeQuickPlay,
                );
            else initializeQuickPlay();
        }
    });
}
