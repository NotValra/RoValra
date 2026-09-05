import {
    getPlacesDetails,
    getUniversesDetails,
    getUniversesVotes,
} from '../../core/apis/games.js';
import { observeElement, observeIntersection } from '../../core/observer.js';
import { settings } from '../../core/settings/getSettings.js';

// Based on the supplied Roblox Enhanced Discovery inline-stat pipeline.

// Config
const BATCH_SIZE = 50;
const PLACE_BATCH_SIZE = 25;
const BATCH_STAGGER_MS = 1200;
const RATE_LIMIT_COOLDOWN_MS = 8000;

const PLAYING_TTL_MS = 10 * 60 * 1000;
const VOTES_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_CLEANUP_INTERVAL = 10 * 60 * 1000;
const REFRESH_ROOT_MARGIN_PX = 700;

const TILE_SELECTOR = '[data-testid="wide-game-tile"]';
const GAME_LINK_SELECTOR = `${TILE_SELECTOR} a.game-card-link[href*="/games/"]`;
const BASE_METADATA_SELECTOR = '.wide-game-tile-metadata .base-metadata';
const RATING_BLOCK_SELECTOR = '[data-testid="game-tile-stats-rating"]';
const PLAYERS_BLOCK_SELECTOR = '[data-testid="game-tile-stats-player-count"]';
const ONLINE_FRIENDS_BLOCK_SELECTOR =
    '[data-testid="game-tile-stats-online-friends-facepile"]';
const SPONSORED_FOOTER_SELECTOR =
    '[data-testid="wide-game-tile-sponsored-footer"]';
const EXCLUDED_TILE_SELECTOR = [
    '.experience-events-tile',
    '[data-testid="event-experience-link"]',
].join(', ');
const EXCLUDED_FOOTER_SELECTOR = [
    '[data-testid="game-tile-stats-text-footer"]',
    '[data-testid="wide-game-tile-description-footer"]',
].join(', ');
const MOUNTED_ATTRIBUTE = 'data-rovalra-wide-game-tile-stats';
const MOUNTED_CLASS = 'rovalra-wide-game-tile-stats';
const MAX_REASONABLE_PLACE_ID = 1e12;
const MAX_REASONABLE_UNIVERSE_ID = 1e13;
const MOUNTED_STATS_SELECTOR = `${TILE_SELECTOR} [${MOUNTED_ATTRIBUTE}]`;

// Utilities
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const takeFromSet = (set, amount) => {
    const values = [];
    for (const value of set) {
        values.push(value);
        if (values.length >= amount) break;
    }
    values.forEach((value) => set.delete(value));
    return values;
};

function abbr(number) {
    if (number == null) return '—';
    if (number < 1e3) return String(number);
    if (number < 1e6) {
        return `${(number / 1e3)
            .toFixed(number < 1e4 ? 1 : 0)
            .replace(/\.0$/, '')}K`;
    }
    if (number < 1e9) {
        return `${(number / 1e6)
            .toFixed(number < 1e7 ? 1 : 0)
            .replace(/\.0$/, '')}M`;
    }
    return `${(number / 1e9)
        .toFixed(number < 1e10 ? 1 : 0)
        .replace(/\.0$/, '')}B`;
}

const scheduleIdle = (() => {
    let pending = false;
    const requestIdle =
        window.requestIdleCallback || ((callback) => setTimeout(callback, 300));

    return (callback) => {
        if (pending) return;
        pending = true;
        requestIdle(
            () => {
                pending = false;
                callback();
            },
            { timeout: 1500 },
        );
    };
})();

// Cache
const statsCache = new Map();

function getCached(universeId) {
    return statsCache.get(universeId) || null;
}

function setCachedPlaying(universeId, playing) {
    const entry = getCached(universeId) || {};
    entry.playing = playing;
    entry.playingTs = Date.now();
    statsCache.set(universeId, entry);
}

function setCachedVotes(universeId, upVotes, downVotes) {
    const entry = getCached(universeId) || {};
    entry.upVotes = upVotes;
    entry.downVotes = downVotes;
    entry.votesTs = Date.now();
    statsCache.set(universeId, entry);
}

function isPlayingFresh(entry) {
    return entry?.playingTs && Date.now() - entry.playingTs < PLAYING_TTL_MS;
}

function isVotesFresh(entry) {
    return entry?.votesTs && Date.now() - entry.votesTs < VOTES_TTL_MS;
}

function getFreshStats(universeId) {
    const entry = getCached(universeId);
    if (!isPlayingFresh(entry) || !isVotesFresh(entry)) return null;
    if (!Number.isFinite(entry.playing)) return null;
    if (!Number.isFinite(entry.upVotes) || !Number.isFinite(entry.downVotes)) {
        return null;
    }
    return entry;
}

function cleanupCache() {
    const now = Date.now();
    const maxAge = VOTES_TTL_MS * 2;

    for (const [universeId, entry] of statsCache) {
        const newest = Math.max(entry.playingTs || 0, entry.votesTs || 0);
        if (now - newest > maxAge) statsCache.delete(universeId);
    }

    for (const [universeId, retryAfter] of retryUniverseAfter) {
        if (retryAfter <= now) retryUniverseAfter.delete(universeId);
    }
    for (const [placeId, retryAfter] of retryPlaceAfter) {
        if (retryAfter <= now) retryPlaceAfter.delete(placeId);
    }
}

// State
const itemsByAnchor = new WeakMap();
const allItems = new Set();
const pendingUniverseIds = new Set();
const pendingPlaceIds = new Set();
const inFlightUniverseIds = new Set();
const inFlightPlaceIds = new Set();
const placeToUniverse = new Map();
const retryUniverseAfter = new Map();
const retryPlaceAfter = new Map();

let fetching = false;
let initialized = false;

function isNearViewport(element, margin = REFRESH_ROOT_MARGIN_PX) {
    if (!element?.isConnected) return false;
    const rect = element.getBoundingClientRect();
    return (
        rect.bottom >= -margin &&
        rect.top <= window.innerHeight + margin &&
        rect.right >= -margin &&
        rect.left <= window.innerWidth + margin
    );
}

function observeItem(item) {
    if (!item?.tile || item.observedTile === item.tile) return;

    item.visibilityHandle?.unobserve();
    item.observedTile = item.tile;
    item.refreshVisible = isNearViewport(item.tile);
    item.visibilityHandle = observeIntersection(
        item.tile,
        (entry) => {
            if (item.tile === entry.target) {
                item.refreshVisible = entry.isIntersecting;
            }
        },
        {
            rootMargin: `${REFRESH_ROOT_MARGIN_PX}px 0px`,
            threshold: 0,
        },
    );
}

function shouldRefreshItem(item) {
    return (
        item?.tile?.isConnected &&
        (item.refreshVisible === true || isNearViewport(item.tile))
    );
}

function removeItem(item) {
    item.visibilityHandle?.unobserve();
    allItems.delete(item);
    if (item.anchor) itemsByAnchor.delete(item.anchor);
}

function pruneDisconnectedItems() {
    for (const item of [...allItems]) {
        if (
            item?.tile?.isConnected &&
            item?.anchor?.isConnected &&
            isEligibleTile(item.tile, item.anchor)
        ) {
            continue;
        }
        removeItem(item);
    }
}

// DOM discovery
function getTileRoot(anchor) {
    return anchor?.closest(TILE_SELECTOR) || null;
}

function normalizeExperienceId(value, upperBound) {
    if (!/^\d+$/.test(String(value || ''))) return null;

    const number = Number(value);
    return Number.isSafeInteger(number) && number > 0 && number < upperBound
        ? String(number)
        : null;
}

function readExperienceAttribute(elements, attributeNames, upperBound) {
    for (const element of elements) {
        if (!element?.getAttribute) continue;

        for (const attributeName of attributeNames) {
            const id = normalizeExperienceId(
                element.getAttribute(attributeName),
                upperBound,
            );
            if (id) return id;
        }
    }

    return null;
}

function getExperienceIdsFromTile(tile, gameLink) {
    const elements = [tile, gameLink].filter(Boolean);
    let universeId = null;

    for (const element of elements) {
        universeId = normalizeExperienceId(
            element.id,
            MAX_REASONABLE_UNIVERSE_ID,
        );
        if (universeId) break;
    }

    universeId ||= readExperienceAttribute(
        elements,
        ['data-universe-id', 'data-universeid', 'data-game-universe-id'],
        MAX_REASONABLE_UNIVERSE_ID,
    );

    let placeId = readExperienceAttribute(
        elements,
        ['data-place-id', 'data-placeid'],
        MAX_REASONABLE_PLACE_ID,
    );

    const href = gameLink?.getAttribute?.('href') || gameLink?.href;
    if (href) {
        try {
            const url = new URL(href, window.location.origin);
            universeId ||=
                normalizeExperienceId(
                    url.searchParams.get('universeId'),
                    MAX_REASONABLE_UNIVERSE_ID,
                ) || null;
            placeId ||=
                normalizeExperienceId(
                    url.searchParams.get('PlaceId') ||
                        url.searchParams.get('placeId'),
                    MAX_REASONABLE_PLACE_ID,
                ) || null;

            if (!placeId) {
                const match = url.pathname.match(/\/games\/(\d+)(?=\/|$)/i);
                placeId = normalizeExperienceId(
                    match?.[1],
                    MAX_REASONABLE_PLACE_ID,
                );
            }
        } catch {
            return { universeId, placeId };
        }
    }

    return { universeId, placeId };
}

function isEligibleTile(tile, anchor) {
    if (!tile?.matches?.(TILE_SELECTOR) || !anchor?.matches?.('a')) {
        return false;
    }
    if (anchor.closest(TILE_SELECTOR) !== tile) return false;
    if (tile.matches(EXCLUDED_TILE_SELECTOR)) return false;
    if (tile.querySelector(EXCLUDED_TILE_SELECTOR)) return false;
    if (tile.querySelector(EXCLUDED_FOOTER_SELECTOR)) return false;
    return anchor.matches('a.game-card-link[href*="/games/"]');
}

function getBaseMeta(tile) {
    return tile.querySelector(BASE_METADATA_SELECTOR);
}

function hasCompleteNativeStats(tile) {
    const base = getBaseMeta(tile);
    if (!base || base.querySelector(`[${MOUNTED_ATTRIBUTE}]`)) return false;
    return Boolean(
        base.querySelector('.vote-percentage-label') &&
        base.querySelector('.playing-counts-label'),
    );
}

function hasNativeOnlineFriends(tile) {
    return Boolean(tile?.querySelector(ONLINE_FRIENDS_BLOCK_SELECTOR));
}

function removeMountedStats(tile) {
    tile?.querySelector(`[${MOUNTED_ATTRIBUTE}]`)?.remove();
}

function queuePlaceId(placeId) {
    if (placeToUniverse.has(placeId) || inFlightPlaceIds.has(placeId)) return;
    if ((retryPlaceAfter.get(placeId) || 0) > Date.now()) return;
    pendingPlaceIds.add(placeId);
}

function addToPendingIfNeeded(universeId) {
    if (getFreshStats(universeId) || inFlightUniverseIds.has(universeId)) {
        return;
    }
    if ((retryUniverseAfter.get(universeId) || 0) > Date.now()) return;
    pendingUniverseIds.add(universeId);
}

function enrichIds(item) {
    const ids = getExperienceIdsFromTile(item.tile, item.anchor);

    if (ids.universeId) {
        item.universeId = ids.universeId;
        item.placeId = ids.placeId;
        addToPendingIfNeeded(item.universeId);
        return;
    }

    item.universeId = null;
    item.placeId = ids.placeId;
    if (!item.placeId) return;

    const mappedUniverseId = placeToUniverse.get(item.placeId);
    if (mappedUniverseId) {
        item.universeId = mappedUniverseId;
        addToPendingIfNeeded(mappedUniverseId);
    } else {
        queuePlaceId(item.placeId);
    }
}

function scanOnce() {
    if (document.visibilityState === 'hidden') return;

    pruneDisconnectedItems();
    const anchors = document.querySelectorAll(GAME_LINK_SELECTOR);
    const touchedItems = new Set();

    for (const anchor of anchors) {
        const tile = getTileRoot(anchor);
        if (!isEligibleTile(tile, anchor)) continue;

        let item = itemsByAnchor.get(anchor);
        if (hasNativeOnlineFriends(tile)) {
            removeMountedStats(tile);
            if (item) removeItem(item);
            continue;
        }
        if (hasCompleteNativeStats(tile)) {
            if (item) removeItem(item);
            continue;
        }

        if (!item) {
            item = {
                tile,
                anchor,
                universeId: null,
                placeId: null,
            };
            itemsByAnchor.set(anchor, item);
            allItems.add(item);
        } else {
            item.tile = tile;
        }

        observeItem(item);
        enrichIds(item);
        touchedItems.add(item);
    }

    applyToItems(touchedItems);

    if (pendingUniverseIds.size || pendingPlaceIds.size) {
        queueFetch();
    }
}

const debouncedScan = () => scheduleIdle(scanOnce);

// Fetch pipeline
async function loadPendingPlaces() {
    while (pendingPlaceIds.size) {
        const batch = takeFromSet(pendingPlaceIds, PLACE_BATCH_SIZE);
        batch.forEach((placeId) => inFlightPlaceIds.add(placeId));

        const details = await getPlacesDetails(batch);
        const returnedPlaceIds = new Set();

        for (const detail of details) {
            if (detail?.placeId == null || detail?.universeId == null) continue;
            const placeId = String(detail.placeId);
            const universeId = String(detail.universeId);
            returnedPlaceIds.add(placeId);
            placeToUniverse.set(placeId, universeId);
            retryPlaceAfter.delete(placeId);
        }

        for (const placeId of batch) {
            inFlightPlaceIds.delete(placeId);
            if (!returnedPlaceIds.has(placeId)) {
                retryPlaceAfter.set(
                    placeId,
                    Date.now() + RATE_LIMIT_COOLDOWN_MS,
                );
            }
        }

        pruneDisconnectedItems();
        for (const item of allItems) {
            if (!item.universeId && placeToUniverse.has(item.placeId)) {
                item.universeId = placeToUniverse.get(item.placeId);
                addToPendingIfNeeded(item.universeId);
            }
        }

        if (pendingPlaceIds.size) await sleep(BATCH_STAGGER_MS);
    }
}

function storeGameDetails(games) {
    for (const game of games) {
        const universeId = String(game.id);
        const playing = Number(game.playing);
        if (!Number.isFinite(playing)) continue;
        setCachedPlaying(universeId, playing);
    }
}

function storeVotes(votes) {
    for (const vote of votes) {
        const universeId = String(vote.universeId ?? vote.id);
        const upVotes = Number(vote.upVotes);
        const downVotes = Number(vote.downVotes);
        if (!Number.isFinite(upVotes) || !Number.isFinite(downVotes)) continue;
        setCachedVotes(universeId, upVotes, downVotes);
    }
}

async function loadPendingUniverses() {
    while (pendingUniverseIds.size) {
        const universeBatch = takeFromSet(pendingUniverseIds, BATCH_SIZE);
        const needPlaying = [];
        const needVotes = [];

        universeBatch.forEach((universeId) => {
            inFlightUniverseIds.add(universeId);
            const cached = getCached(universeId);
            if (!isPlayingFresh(cached)) needPlaying.push(universeId);
            if (!isVotesFresh(cached)) needVotes.push(universeId);
        });

        const requests = [];
        if (needPlaying.length) {
            requests.push(
                getUniversesDetails(needPlaying).then(storeGameDetails),
            );
        }
        if (needVotes.length) {
            requests.push(getUniversesVotes(needVotes).then(storeVotes));
        }
        if (requests.length) await Promise.allSettled(requests);

        for (const universeId of universeBatch) {
            inFlightUniverseIds.delete(universeId);
            if (getFreshStats(universeId)) {
                retryUniverseAfter.delete(universeId);
            } else {
                retryUniverseAfter.set(
                    universeId,
                    Date.now() + RATE_LIMIT_COOLDOWN_MS,
                );
            }
        }

        applyToTiles(universeBatch);
        if (pendingUniverseIds.size) await sleep(BATCH_STAGGER_MS);
    }
}

async function queueFetch() {
    if (fetching) return;
    fetching = true;

    try {
        await loadPendingPlaces();
        await loadPendingUniverses();
    } catch (error) {
        console.warn('RoValra: Wide tile player counts request failed', error);
    } finally {
        fetching = false;
        if (pendingPlaceIds.size || pendingUniverseIds.size) {
            queueMicrotask(queueFetch);
        }
    }
}

// Roblox-native DOM helpers
function createIcon(className) {
    const icon = document.createElement('span');
    icon.className = `info-label ${className}`;
    return icon;
}

function createLabel(className, text, title) {
    const label = document.createElement('span');
    label.className = `info-label ${className}`;
    label.textContent = text;
    if (title) label.title = title;
    return label;
}

function getRatingPercentage(upVotes, downVotes) {
    const totalVotes = upVotes + downVotes;
    return totalVotes > 0 ? Math.round((upVotes * 100) / totalVotes) : 0;
}

function createStats(stats) {
    const ratingPercentage = getRatingPercentage(
        stats.upVotes,
        stats.downVotes,
    );
    return [
        createIcon('icon-votes-gray'),
        createLabel('vote-percentage-label', `${ratingPercentage}%`),
        createIcon('icon-playing-counts-gray'),
        createLabel(
            'playing-counts-label',
            abbr(stats.playing),
            stats.playing.toLocaleString(),
        ),
    ];
}

function markStatsElement(element, renderKey) {
    element.classList.add(MOUNTED_CLASS);
    element.setAttribute(MOUNTED_ATTRIBUTE, renderKey);
}

function mountSponsoredStats(footer, stats, renderKey) {
    const currentStats = footer.querySelector(`:scope > .${MOUNTED_CLASS}`);
    const adLabel =
        footer.querySelector(':scope > .sponsored-ad-label') ||
        currentStats?.querySelector(
            ':scope > .rovalra-wide-game-tile-sponsored-label',
        );
    const separator =
        footer.querySelector(':scope > .bullet.secondary-content') ||
        currentStats?.querySelector(
            ':scope > .rovalra-wide-game-tile-sponsored-separator',
        );
    if (!adLabel || !separator) return false;

    const statsContainer = document.createElement('span');
    markStatsElement(statsContainer, renderKey);
    statsContainer.append(
        createLabel(
            'rovalra-wide-game-tile-sponsored-label',
            adLabel.textContent,
        ),
        createLabel(
            'rovalra-wide-game-tile-sponsored-separator',
            separator.textContent,
        ),
        ...createStats(stats),
    );
    footer.replaceChildren(statsContainer);
    return true;
}

function mountStandardStats(base, stats, renderKey) {
    const ratingBlock = base.querySelector(RATING_BLOCK_SELECTOR);
    const playersBlock = base.querySelector(PLAYERS_BLOCK_SELECTOR);
    const classBasedBlock =
        base
            .querySelector('.vote-percentage-label')
            ?.closest('.game-card-info') ||
        base.querySelector('.playing-counts-label')?.closest('.game-card-info');
    const statsBlock = ratingBlock || playersBlock || classBasedBlock;
    const renderedStats = createStats(stats);

    if (statsBlock) {
        markStatsElement(statsBlock, renderKey);
        statsBlock.replaceChildren(...renderedStats);
        return true;
    }

    const row = document.createElement('div');
    row.className = `game-card-info ${MOUNTED_CLASS}`;
    row.setAttribute(MOUNTED_ATTRIBUTE, renderKey);
    row.append(...renderedStats);

    const action = base.querySelector(
        ':scope > button, :scope > a.btn-growth-xs',
    );
    base.insertBefore(row, action || null);
    return true;
}

// Mounting
function mountInline(item, stats) {
    const { tile, anchor, universeId } = item || {};
    if (!tile?.isConnected || !isEligibleTile(tile, anchor)) return;

    const currentIds = getExperienceIdsFromTile(tile, anchor);
    const currentUniverseId =
        currentIds.universeId || placeToUniverse.get(currentIds.placeId);
    if (currentUniverseId !== universeId) return;
    if (hasCompleteNativeStats(tile) || hasNativeOnlineFriends(tile)) return;

    const base = getBaseMeta(tile);
    if (!base) return;

    const renderKey = [
        universeId,
        stats.playing,
        stats.upVotes,
        stats.downVotes,
    ].join(':');
    const mountedStats = base.querySelector(`[${MOUNTED_ATTRIBUTE}]`);
    if (mountedStats?.getAttribute(MOUNTED_ATTRIBUTE) === renderKey) {
        return;
    }

    const sponsoredFooter = base.querySelector(SPONSORED_FOOTER_SELECTOR);
    if (sponsoredFooter) {
        mountSponsoredStats(sponsoredFooter, stats, renderKey);
    } else {
        mountStandardStats(base, stats, renderKey);
    }
}

function applyToItems(items) {
    for (const item of items) {
        if (!item?.universeId || !item?.tile?.isConnected) continue;
        const stats = getFreshStats(item.universeId);
        if (stats) mountInline(item, stats);
    }
}

function applyToTiles(onlyUniverseIds) {
    const onlySet = new Set(onlyUniverseIds.map(String));
    for (const item of allItems) {
        if (!item?.tile?.isConnected || !onlySet.has(item.universeId)) {
            continue;
        }
        const stats = getFreshStats(item.universeId);
        if (stats) mountInline(item, stats);
    }
}

// Observers
function refreshStaleStats() {
    if (document.visibilityState === 'hidden') return;
    pruneDisconnectedItems();

    for (const item of allItems) {
        if (!shouldRefreshItem(item)) continue;
        if (item.universeId) addToPendingIfNeeded(item.universeId);
        else if (item.placeId) queuePlaceId(item.placeId);
    }

    if (pendingUniverseIds.size || pendingPlaceIds.size) queueFetch();
}

function startObservers() {
    observeElement(GAME_LINK_SELECTOR, debouncedScan, {
        multiple: true,
        onRemove: debouncedScan,
    });
    observeElement(MOUNTED_STATS_SELECTOR, () => {}, {
        multiple: true,
        onRemove: debouncedScan,
    });

    setInterval(cleanupCache, CACHE_CLEANUP_INTERVAL);
    setInterval(refreshStaleStats, PLAYING_TTL_MS);

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        debouncedScan();
    });
}

// Boot
export async function init() {
    if (initialized) return;
    initialized = true;

    if (!(await settings.wideGameTileStatsEnabled)) return;

    startObservers();
    debouncedScan();
}
