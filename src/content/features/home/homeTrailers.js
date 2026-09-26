import { observeElement, observeIntersection } from '../../core/observer.js';
import { settings } from '../../core/settings/getSettings.js';
import { getPlaceDetails, getUniverseMedia } from '../../core/apis/games.js';
import {
    getPlaceIdFromUrl,
    getUniverseIdFromUrl,
} from '../../core/idExtractor.js';
import {
    getHlsVideoAsset,
    streamRobloxVideo,
} from '../../core/utils/videoStreamer.js';
import { Icon, ChangeIcon } from '../../core/ui/buildericon.ts';
import { addTooltip } from '../../core/ui/tooltip.js';
import { ts } from '../../core/locale/i18n.js';

// Plays experience trailers inside the wide tiles on the Home page, only while the tile is on screen.

const TILE_SELECTOR = '[data-testid="wide-game-tile"]';
const GAME_LINK_SELECTOR = 'a.game-card-link[href*="/games/"]';
const THUMBNAIL_SELECTORS = [
    '.game-card-thumb-container',
    '.thumbnail-2d-container',
];
const VIDEO_ASSET_TYPES = new Set(['GamePreviewVideo', 'Video']);
const VISIBLE_RATIO = 0.6;
const MAX_CONCURRENT_LOADS = 2;
const LOAD_SLOT_TIMEOUT_MS = 10000;
// Tiles have to stay on screen this long before loading, so scrolling past them doesn't load anything.
const VISIBLE_DELAY_MS = 500;

const HOST_CLASS = 'rovalra-home-trailer-host';
const RELATIVE_HOST_CLASS = 'rovalra-home-trailer-host-relative';
const PLAYING_CLASS = 'rovalra-home-trailer-playing';

const tileStates = new Map();
const loadQueue = [];
let activeLoads = 0;
let initialized = false;

function getThumbnailHost(tile) {
    for (const selector of THUMBNAIL_SELECTORS) {
        const host = tile.querySelector(selector);
        if (host) return host;
    }
    return tile.querySelector('img')?.parentElement || null;
}

async function getUniverseId(tile) {
    const link = tile.querySelector(GAME_LINK_SELECTOR);
    if (!link) return null;

    const universeId = getUniverseIdFromUrl(link.href);
    if (universeId) return universeId;

    const placeId = getPlaceIdFromUrl(link.href);
    if (!placeId) return null;

    const details = await getPlaceDetails(placeId);
    return details?.universeId ? String(details.universeId) : null;
}

async function getTrailerVideoId(tile) {
    const universeId = await getUniverseId(tile);
    if (!universeId) return null;

    const media = await getUniverseMedia(universeId);
    const trailer = media.find(
        (item) =>
            item.approved &&
            item.videoId &&
            VIDEO_ASSET_TYPES.has(item.assetType),
    );
    return trailer?.videoId || null;
}

function playVideo(state) {
    if (state.status !== 'ready' || document.visibilityState === 'hidden') {
        return;
    }
    state.video.play().catch(() => {});
}

function pauseVideo(state) {
    if (state.video && !state.video.paused) state.video.pause();
}

function muteOtherTrailers(currentState) {
    for (const state of tileStates.values()) {
        if (state !== currentState && state.video) state.video.muted = true;
    }
}

function getMuteLabel(video) {
    return video.muted ? ts('homeTrailers.unmute') : ts('homeTrailers.mute');
}

function createMuteButton(state) {
    const { video } = state;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'rovalra-home-trailer-mute';

    const icon = Icon({ icon: 'volume_off', material: true, size: '18px' });
    button.appendChild(icon);

    const update = () => {
        ChangeIcon(icon, { icon: video.muted ? 'volume_off' : 'volume_up' });
        button.setAttribute('aria-label', getMuteLabel(video));
    };

    // The tile is a link, so stop the click from opening the experience.
    button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (video.muted) muteOtherTrailers(state);
        video.muted = !video.muted;
    });
    video.addEventListener('volumechange', update);
    addTooltip(button, () => getMuteLabel(video), { position: 'top' });

    update();
    return button;
}

function mountVideo(state) {
    const video = document.createElement('video');
    video.className = 'rovalra-home-trailer-video';
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.setAttribute('aria-hidden', 'true');

    video.addEventListener('playing', () =>
        state.host?.classList.add(PLAYING_CLASS),
    );

    state.video = video;
    state.muteButton = createMuteButton(state);
    state.host.classList.add(HOST_CLASS);
    if (getComputedStyle(state.host).position === 'static') {
        state.host.classList.add(RELATIVE_HOST_CLASS);
    }
    state.host.append(video, state.muteButton);
}

function unmountVideo(state) {
    if (state.video) {
        state.video.pause();
        // Clearing the source closes the MediaSource, which stops the streamer from fetching more segments.
        state.video.removeAttribute('src');
        state.video.load();
        state.video.remove();
    }
    state.muteButton?.remove();
    state.host?.classList.remove(
        HOST_CLASS,
        RELATIVE_HOST_CLASS,
        PLAYING_CLASS,
    );
    state.video = null;
    state.muteButton = null;
}

function waitForLoadSlotRelease(video, streamPromise) {
    return Promise.race([
        new Promise((resolve) =>
            video.addEventListener('canplay', resolve, { once: true }),
        ),
        streamPromise.catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, LOAD_SLOT_TIMEOUT_MS)),
    ]);
}

async function loadTrailer(state) {
    const videoId = await getTrailerVideoId(state.tile);
    if (!videoId || !state.tile.isConnected) {
        state.status = 'none';
        return;
    }

    const asset = await getHlsVideoAsset(videoId);
    if (!state.tile.isConnected) return;

    state.host = getThumbnailHost(state.tile);
    if (!state.host) {
        state.status = 'none';
        return;
    }

    mountVideo(state);

    const targetHeight = Math.round(
        state.host.clientHeight * (window.devicePixelRatio || 1),
    );
    const streamPromise = streamRobloxVideo(asset, state.video, () => {}, {
        targetHeight,
        keepChunks: false,
    });
    streamPromise.catch(() => {
        state.status = 'none';
        unmountVideo(state);
    });

    state.status = 'ready';
    if (state.visible) playVideo(state);

    await waitForLoadSlotRelease(state.video, streamPromise);
}

function processLoadQueue() {
    while (activeLoads < MAX_CONCURRENT_LOADS && loadQueue.length > 0) {
        const state = loadQueue.shift();

        // Skip tiles that were scrolled past before their turn came up.
        if (!state.visible || !tileStates.has(state.tile)) {
            if (state.status === 'queued') state.status = 'idle';
            continue;
        }

        state.status = 'loading';
        activeLoads++;
        loadTrailer(state)
            .catch((error) => {
                state.status = 'none';
                console.warn('RoValra: Failed to load Home trailer', error);
            })
            .finally(() => {
                activeLoads--;
                processLoadQueue();
            });
    }
}

function queueLoad(state) {
    state.status = 'queued';
    loadQueue.push(state);
    processLoadQueue();
}

function handleIntersection(state, entry) {
    state.visible =
        entry.isIntersecting && entry.intersectionRatio >= VISIBLE_RATIO;

    if (!state.visible) {
        clearTimeout(state.visibleTimer);
        pauseVideo(state);
        return;
    }

    if (state.status !== 'idle') {
        playVideo(state);
        return;
    }

    clearTimeout(state.visibleTimer);
    state.visibleTimer = setTimeout(() => {
        if (state.visible && state.status === 'idle') queueLoad(state);
    }, VISIBLE_DELAY_MS);
}

function setupTile(tile) {
    if (tileStates.has(tile)) return;

    const state = {
        tile,
        host: null,
        video: null,
        muteButton: null,
        status: 'idle',
        visible: false,
        visibilityHandle: null,
        visibleTimer: null,
    };
    tileStates.set(tile, state);

    state.visibilityHandle = observeIntersection(
        tile,
        (entry) => handleIntersection(state, entry),
        { threshold: VISIBLE_RATIO },
    );
}

function destroyTile(tile) {
    const state = tileStates.get(tile);
    if (!state) return;

    state.visibilityHandle?.unobserve();
    clearTimeout(state.visibleTimer);
    unmountVideo(state);
    tileStates.delete(tile);
}

function handleDocumentVisibility() {
    for (const state of tileStates.values()) {
        if (document.visibilityState === 'hidden') pauseVideo(state);
        else if (state.visible) playVideo(state);
    }
}

export async function init() {
    if (initialized) return;
    initialized = true;

    if (!(await settings.homeTrailersEnabled)) return;

    observeElement(TILE_SELECTOR, setupTile, {
        multiple: true,
        onRemove: destroyTile,
    });
    document.addEventListener('visibilitychange', handleDocumentVisibility);
}
