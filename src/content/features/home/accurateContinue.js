import { callRobloxApiJson } from '../../core/api.js';
import { createGameCard } from '../../core/ui/games/gameCard.js';

const ACCURATE_CONTINUE_SETTING = 'AccurateContinueEnabled';
const AUTO_REFRESH_SETTING = 'accurateContinueAutoRefreshEnabled';
const ACCURATE_CONTINUE_SESSION_KEY = 'rovalra_accurateContinue';
const RECENTLY_VISITED_SORT_ID = 'RecentlyVisited';
const RECENTLY_VISITED_ENDPOINT =
    '/search-landing-page-api/v1?sessionId=RoValra';
const REFRESH_THROTTLE_MS = 4000;
const POST_LAUNCH_REFRESH_DELAYS = [2500, 7000, 15000];
const DOM_SYNC_DELAYS = [0, 400, 1200, 3000];
const MAX_NEW_CARDS_PER_REFRESH = 2;
const CONTINUE_CAROUSEL_SELECTOR = [
    '.game-sort-carousel-wrapper',
    '[data-testid="game-carousel"]',
    '.game-carousel',
].join(',');
const GAME_CARD_LINK_SELECTOR = 'a.game-card-link[href]';

let initialized = false;
let accurateContinueEnabled = false;
let autoRefreshEnabled = true;
let recentlyVisitedGames = [];
let recentlyVisitedTopic = 'Continue';
let refreshPromise = null;
let lastRefreshAt = 0;
let launchRefreshGeneration = 0;
let domSyncGeneration = 0;
let continueCarousel = null;

function isHomePage() {
    const path = window.location.pathname
        .toLowerCase()
        .replace(/^\/[a-z]{2}(?:-[a-z]{2})?\//, '/');
    return path.startsWith('/home');
}

function normalizeId(value) {
    const id = String(value ?? '').trim();
    return /^\d+$/.test(id) && id !== '0' ? id : '';
}

function getGameIds(game) {
    const ids = [
        game?.universeId,
        game?.universe_id,
        game?.id,
        game?.rootPlaceId,
        game?.root_place_id,
        game?.placeId,
        game?.place_id,
        game?.rootPlace?.id,
    ]
        .map(normalizeId)
        .filter(Boolean);

    return new Set(ids);
}

function getUniverseId(game) {
    return normalizeId(game?.universeId ?? game?.universe_id ?? game?.id);
}

function getRootPlaceId(game) {
    return normalizeId(
        game?.rootPlaceId ??
            game?.root_place_id ??
            game?.placeId ??
            game?.place_id ??
            game?.rootPlace?.id,
    );
}

function getGamesSignature(games) {
    return (Array.isArray(games) ? games : [])
        .map((game) => getUniverseId(game) || getRootPlaceId(game))
        .filter(Boolean)
        .join(',');
}

function getElementIds(element) {
    const ids = new Set();
    if (!(element instanceof Element)) return ids;

    const addId = (value) => {
        const id = normalizeId(value);
        if (id) ids.add(id);
    };

    const elements = [
        element,
        ...element.querySelectorAll(
            '[data-universe-id], [data-universeid], [data-game-id], [data-place-id], [data-root-place-id]',
        ),
    ];

    for (const current of elements) {
        addId(current.id);
        addId(current.dataset?.universeId);
        addId(current.dataset?.universeid);
        addId(current.dataset?.gameId);
        addId(current.dataset?.placeId);
        addId(current.dataset?.rootPlaceId);
        addId(current.dataset?.rovalraContinueUniverseId);
    }

    const links = element.matches('a[href]')
        ? [element]
        : [...element.querySelectorAll('a[href]')];

    for (const link of links) {
        try {
            const url = new URL(link.href, window.location.origin);
            for (const key of [
                'universeId',
                'universe-id',
                'gameId',
                'placeId',
                'rootPlaceId',
            ]) {
                addId(url.searchParams.get(key));
            }

            const gamePathMatch = url.pathname.match(/\/games\/(\d+)/i);
            if (gamePathMatch) addId(gamePathMatch[1]);
        } catch {}
    }

    return ids;
}

function getCarouselCardCollection(carousel) {
    if (!(carousel instanceof Element)) return { cards: [], parent: null };

    const links = [...carousel.querySelectorAll(GAME_CARD_LINK_SELECTOR)];
    const rootsByParent = new Map();

    for (const link of links) {
        let child = link;
        let parent = child.parentElement;

        while (parent && carousel.contains(parent)) {
            if (!rootsByParent.has(parent)) {
                rootsByParent.set(parent, new Set());
            }
            rootsByParent.get(parent).add(child);

            if (parent === carousel) break;
            child = parent;
            parent = parent.parentElement;
        }
    }

    let bestParent = null;
    let bestCards = [];
    for (const [parent, roots] of rootsByParent) {
        if (roots.size > bestCards.length) {
            bestParent = parent;
            bestCards = [...roots];
        }
    }

    return { cards: bestCards, parent: bestParent };
}

function normalizeText(value) {
    return String(value || '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function scoreCarousel(carousel, knownIds, topic) {
    const { cards } = getCarouselCardCollection(carousel);
    if (!cards.length) return { score: 0, cards };

    const header = carousel.querySelector(
        'a[data-testid="section-header-title-subtitle-container"], h1, h2, h3, .container-header, .game-sort-header-container',
    );
    const headerText = normalizeText(header?.textContent);
    const normalizedTopic = normalizeText(topic);
    let score = 0;

    if (normalizedTopic && headerText === normalizedTopic) score += 1000;
    if (headerText === 'continue') score += 1000;
    if (headerText.startsWith('continue ')) score += 500;

    for (const card of cards) {
        const ids = getElementIds(card);
        if ([...ids].some((id) => knownIds.has(id))) score += 10;
    }

    return { score, cards };
}

function findContinueCarousel(previousGames, nextGames, topic) {
    if (continueCarousel?.isConnected) return continueCarousel;

    const knownIds = new Set();
    for (const game of [...previousGames, ...nextGames]) {
        for (const id of getGameIds(game)) knownIds.add(id);
    }

    let bestCarousel = null;
    let bestScore = 0;
    for (const carousel of document.querySelectorAll(
        CONTINUE_CAROUSEL_SELECTOR,
    )) {
        const { score } = scoreCarousel(carousel, knownIds, topic);
        if (score > bestScore) {
            bestCarousel = carousel;
            bestScore = score;
        }
    }

    if (bestCarousel && bestScore > 0) {
        continueCarousel = bestCarousel;
        continueCarousel.dataset.rovalraContinueCarousel = 'true';
    }

    return continueCarousel;
}

function createContinueCardRoot(game, templateCard) {
    const universeId = getUniverseId(game);
    const rootPlaceId = getRootPlaceId(game);
    if (!universeId && !rootPlaceId) return null;

    const wrapperTag = templateCard?.tagName?.toLowerCase() || 'div';
    const wrapper = document.createElement(wrapperTag);
    wrapper.className = templateCard?.className || 'game-card-container';
    wrapper.classList.add('rovalra-live-continue-card');
    wrapper.dataset.rovalraContinueUniverseId = universeId || rootPlaceId;

    const card = createGameCard({
        gameId: universeId || undefined,
        placeId: rootPlaceId || undefined,
    });
    wrapper.appendChild(card);
    return wrapper;
}

function resetCarouselScroll(cardParent, carousel) {
    let current = cardParent;
    while (current && carousel.contains(current)) {
        if (current.scrollWidth > current.clientWidth + 1) {
            current.scrollLeft = 0;
            return;
        }
        current = current.parentElement;
    }
}

function syncContinueDom(nextGames, previousGames, topic) {
    if (!autoRefreshEnabled || !isHomePage() || !nextGames.length) {
        return false;
    }

    const carousel = findContinueCarousel(previousGames, nextGames, topic);
    if (!carousel) return false;

    let { cards, parent: cardParent } = getCarouselCardCollection(carousel);
    if (!cards.length || !cardParent) return false;

    const nativeIds = new Set();
    for (const card of cards) {
        if (card.classList.contains('rovalra-live-continue-card')) continue;
        for (const id of getElementIds(card)) nativeIds.add(id);
    }

    let removedDuplicate = false;
    for (const card of cards) {
        if (!card.classList.contains('rovalra-live-continue-card')) continue;
        if ([...getElementIds(card)].some((id) => nativeIds.has(id))) {
            card.remove();
            removedDuplicate = true;
        }
    }

    if (removedDuplicate) {
        ({ cards, parent: cardParent } = getCarouselCardCollection(carousel));
    }

    const previousIds = new Set();
    for (const game of previousGames) {
        for (const id of getGameIds(game)) previousIds.add(id);
    }
    const matchingCards = cards.filter((card) =>
        [...getElementIds(card)].some((id) => previousIds.has(id)),
    );

    if (previousIds.size && matchingCards.length === 0) {
        continueCarousel = null;
        return false;
    }

    const targetCount = Math.min(nextGames.length, Math.max(cards.length, 1));
    const targetGames = nextGames.slice(0, targetCount);
    const cardsById = new Map();
    for (const card of cards) {
        for (const id of getElementIds(card)) {
            if (!cardsById.has(id)) cardsById.set(id, card);
        }
    }
    const usedCards = new Set();
    const orderedCards = [];
    let createdCards = 0;

    for (const game of targetGames) {
        let card = [...getGameIds(game)]
            .map((id) => cardsById.get(id))
            .find((candidate) => candidate && !usedCards.has(candidate));
        if (!card && createdCards < MAX_NEW_CARDS_PER_REFRESH) {
            card = createContinueCardRoot(game, cards[0]);
            if (card) {
                cardParent.appendChild(card);
                cards.push(card);
                createdCards += 1;
            }
        }

        if (!card) continue;
        usedCards.add(card);
        orderedCards.push(card);
    }

    if (!orderedCards.length) return false;

    const display = getComputedStyle(cardParent).display;
    const supportsVisualOrder = [
        'flex',
        'inline-flex',
        'grid',
        'inline-grid',
    ].includes(display);

    if (supportsVisualOrder) {
        orderedCards.forEach((card, index) => {
            card.style.order = String(index);
        });
        cards
            .filter((card) => !usedCards.has(card))
            .forEach((card, index) => {
                card.style.order = String(targetGames.length + index);
            });
    } else {
        const fragment = document.createDocumentFragment();
        orderedCards.forEach((card) => fragment.appendChild(card));
        cardParent.insertBefore(fragment, cardParent.firstChild);
    }

    resetCarouselScroll(cardParent, carousel);
    return true;
}

function scheduleDomSync(nextGames, previousGames, topic) {
    const generation = ++domSyncGeneration;
    let synced = false;

    for (const delay of DOM_SYNC_DELAYS) {
        setTimeout(() => {
            if (synced || generation !== domSyncGeneration) return;
            synced = syncContinueDom(nextGames, previousGames, topic);
        }, delay);
    }
}

function publishAccurateContinue(games, enabled = accurateContinueEnabled) {
    try {
        sessionStorage.setItem(
            ACCURATE_CONTINUE_SESSION_KEY,
            enabled ? 'true' : 'false',
        );
    } catch {}

    document.dispatchEvent(
        new CustomEvent('rovalra-accurate-continue', {
            detail: {
                enabled,
                games: enabled && Array.isArray(games) ? games : [],
            },
        }),
    );
}

async function fetchRecentlyVisitedGames() {
    const data = await callRobloxApiJson({
        subdomain: 'apis',
        endpoint: RECENTLY_VISITED_ENDPOINT,
        credentials: 'include',
        noCache: true,
    });

    const recentlyVisitedSort = data?.sorts?.find(
        (sort) => sort.sortId === RECENTLY_VISITED_SORT_ID,
    );
    if (!Array.isArray(recentlyVisitedSort?.games)) return null;

    return {
        games: recentlyVisitedSort.games,
        topic: recentlyVisitedSort.topic || 'Continue',
    };
}

async function refreshAccurateContinue({ force = false } = {}) {
    if (!accurateContinueEnabled) return { changed: false, refreshed: false };
    if (refreshPromise) return refreshPromise;

    const now = Date.now();
    if (!force && now - lastRefreshAt < REFRESH_THROTTLE_MS) {
        return { changed: false, refreshed: false };
    }

    lastRefreshAt = now;
    refreshPromise = (async () => {
        try {
            const result = await fetchRecentlyVisitedGames();
            if (!result) return { changed: false, refreshed: false };

            const previousGames = recentlyVisitedGames;
            const previousSignature = getGamesSignature(previousGames);
            recentlyVisitedGames = result.games;
            recentlyVisitedTopic = result.topic;

            publishAccurateContinue(recentlyVisitedGames, true);
            if (autoRefreshEnabled && isHomePage()) {
                scheduleDomSync(
                    recentlyVisitedGames,
                    previousGames,
                    recentlyVisitedTopic,
                );
            }

            return {
                changed:
                    previousSignature !==
                    getGamesSignature(recentlyVisitedGames),
                refreshed: true,
            };
        } catch (error) {
            console.warn('RoValra: accurateContinue failed to refresh', error);
            return { changed: false, refreshed: false };
        } finally {
            refreshPromise = null;
        }
    })();

    return refreshPromise;
}

function schedulePostLaunchRefresh() {
    if (!accurateContinueEnabled || !autoRefreshEnabled || !isHomePage()) {
        return;
    }

    const generation = ++launchRefreshGeneration;
    const baselineSignature = getGamesSignature(recentlyVisitedGames);

    const runAttempt = (index) => {
        if (
            generation !== launchRefreshGeneration ||
            !accurateContinueEnabled ||
            !autoRefreshEnabled ||
            !isHomePage() ||
            getGamesSignature(recentlyVisitedGames) !== baselineSignature
        ) {
            return;
        }

        setTimeout(async () => {
            if (generation !== launchRefreshGeneration || !isHomePage()) {
                return;
            }

            const result = await refreshAccurateContinue({ force: true });
            if (
                result.changed ||
                index + 1 >= POST_LAUNCH_REFRESH_DELAYS.length
            ) {
                return;
            }
            runAttempt(index + 1);
        }, POST_LAUNCH_REFRESH_DELAYS[index]);
    };

    runAttempt(0);
}

function refreshWhenReturningToHome() {
    if (
        accurateContinueEnabled &&
        autoRefreshEnabled &&
        isHomePage() &&
        !document.hidden
    ) {
        refreshAccurateContinue();
    }
}

function initializeAutoRefreshListeners() {
    document.addEventListener(
        'rovalra-game-launch-success',
        schedulePostLaunchRefresh,
    );
    document.addEventListener('visibilitychange', refreshWhenReturningToHome);
    window.addEventListener('focus', refreshWhenReturningToHome);

    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace !== 'local') return;
        let relevantSettingChanged = false;

        if (changes[ACCURATE_CONTINUE_SETTING]) {
            relevantSettingChanged = true;
            accurateContinueEnabled =
                changes[ACCURATE_CONTINUE_SETTING].newValue === true;
            if (!accurateContinueEnabled) {
                launchRefreshGeneration += 1;
                publishAccurateContinue([], false);
            }
        }

        if (changes[AUTO_REFRESH_SETTING]) {
            relevantSettingChanged = true;
            autoRefreshEnabled =
                changes[AUTO_REFRESH_SETTING].newValue !== false;
            if (!autoRefreshEnabled) launchRefreshGeneration += 1;
        }

        if (relevantSettingChanged) refreshWhenReturningToHome();
    });
}

export async function init() {
    const storedSettings = await chrome.storage.local.get({
        [ACCURATE_CONTINUE_SETTING]: false,
        [AUTO_REFRESH_SETTING]: true,
    });

    accurateContinueEnabled =
        storedSettings[ACCURATE_CONTINUE_SETTING] === true;
    autoRefreshEnabled = storedSettings[AUTO_REFRESH_SETTING] !== false;

    if (!initialized) {
        initialized = true;
        initializeAutoRefreshListeners();
    }

    if (!accurateContinueEnabled) {
        publishAccurateContinue([], false);
        return;
    }

    await refreshAccurateContinue({ force: true });
}
