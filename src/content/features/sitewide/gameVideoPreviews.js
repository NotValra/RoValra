import { callRobloxApiJson } from '../../core/api.js';
import {
    getPlaceIdFromUrl,
    getUniverseIdFromUrl,
} from '../../core/idExtractor.js';
import {
    observeAttributes,
    observeChildren,
    observeElement,
    observeIntersection,
} from '../../core/observer.js';
import { settings } from '../../core/settings/getSettings.js';
import { streamRobloxVideo } from '../../core/utils/videoStreamer.js';

const SETTING = 'gameVideoPreviewsEnabled';
const LINKS =
    'a.game-card-link[href*="/games/"], a.sdui-game-tile-wrapper[href*="/games/"]';
const THUMBNAILS =
    '.featured-game-icon-container, .game-card-thumb-container, .sdui-tile-image-container';
const EXCLUDED =
    '.experience-events-tile, [data-testid="event-experience-link"]';
const NATIVE_PLAYER =
    'video:not(.rovalra-game-video-preview), iframe, .wide-game-tile-video-player, [data-testid="video-preview-wrapper"]';
const HOVER_DELAY = 350;
const CACHE_TTL = 5 * 60 * 1000;
const mediaCache = new Map();
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const hoverAvailable = window.matchMedia('(any-hover: hover)');
let enabled = false;
let initialized = false;
let settingsVersion = 0;
let active = null;
let discovery;
let nativePlayers;

function getCandidate(target) {
    if (!(target instanceof Element)) return null;
    const thumbnail = target.closest(THUMBNAILS);
    const anchor = thumbnail?.closest(LINKS);
    if (!anchor || anchor.closest(EXCLUDED) || anchor.querySelector(EXCLUDED))
        return null;
    if (
        !anchor.closest('[data-testid="wide-game-tile"]') &&
        !anchor.matches('.sdui-game-tile-wrapper')
    )
        return null;
    if (anchor.querySelector(NATIVE_PLAYER)) return null;

    // SDUI uses the same classes for square icons and landscape thumbnails.
    const { width, height } = thumbnail.getBoundingClientRect();
    if (!height || width / height < 1.6 || width / height > 1.9) return null;
    const placeId = getPlaceIdFromUrl(anchor.href);
    if (!placeId) return null;
    return { anchor, thumbnail, placeId, href: anchor.href };
}

function isCurrent(state) {
    return (
        active === state &&
        !state.controller.signal.aborted &&
        state.anchor.isConnected &&
        state.thumbnail.isConnected &&
        state.anchor.href === state.href &&
        state.anchor.contains(state.thumbnail) &&
        !state.anchor.querySelector(NATIVE_PLAYER)
    );
}

function stopPreview() {
    const state = active;
    if (!state) return;
    active = null;
    clearTimeout(state.timer);
    clearTimeout(state.timeout);
    state.observers.forEach((observer) => observer.disconnect());
    state.visibility?.unobserve();
    state.controller.abort();
    if (state.video) {
        state.video.pause();
        state.video.removeAttribute('src');
        state.video.load();
        state.video.remove();
    }
    state.thumbnail.classList.remove('rovalra-video-preview-positioned');
}

function remember(key, value, ttl = CACHE_TTL) {
    if (mediaCache.size >= 100)
        mediaCache.delete(mediaCache.keys().next().value);
    mediaCache.set(key, { value, expires: Date.now() + ttl });
}

async function getVideo(state) {
    const cached = mediaCache.get(state.placeId);
    if (cached?.expires > Date.now()) return cached.value;

    const options = { signal: state.controller.signal, noCache: true };
    let universeId = getUniverseIdFromUrl(state.href);
    if (!universeId) {
        const place = await callRobloxApiJson({
            ...options,
            subdomain: 'apis',
            endpoint: `/universes/v1/places/${state.placeId}/universe`,
        });
        universeId = String(place?.universeId || '');
    }
    if (!/^\d+$/.test(universeId)) return null;
    state.controller.signal.throwIfAborted();

    const media = await callRobloxApiJson({
        ...options,
        subdomain: 'games',
        endpoint: `/v2/games/${universeId}/media`,
    });
    state.controller.signal.throwIfAborted();
    const video = media?.data?.find(
        (item) =>
            item.approved === true &&
            (item.assetTypeId === 86 ||
                ['GamePreviewVideo', 'Video'].includes(item.assetType)) &&
            /^\d+$/.test(String(item.videoId || '')),
    );
    const videoId = video ? String(video.videoId) : null;
    remember(state.placeId, videoId);
    return videoId;
}

async function playPreview(state) {
    try {
        if (!isCurrent(state)) {
            if (active === state) stopPreview();
            return;
        }
        const videoId = await getVideo(state);
        if (!isCurrent(state)) return;
        if (!videoId) return stopPreview();

        const formats = btoa(
            JSON.stringify([
                { format: 'hls', majorVersion: '1', fidelity: 'main' },
            ]),
        );
        const asset = await callRobloxApiJson({
            subdomain: 'assetdelivery',
            endpoint: `/v2/asset?Id=${videoId}&ContentRepresentationPriorityList=${encodeURIComponent(formats)}`,
            signal: state.controller.signal,
            noCache: true,
        });
        if (!isCurrent(state)) return;
        const location = asset?.locations?.[0]?.location;
        const url = new URL(location);
        if (
            url.protocol !== 'https:' ||
            !/(^|\.)rbxcdn\.com$/.test(url.hostname)
        ) {
            throw new Error('Unexpected video location');
        }

        const video = document.createElement('video');
        state.video = video;
        video.className = 'rovalra-game-video-preview';
        video.muted = true;
        video.defaultMuted = true;
        video.autoplay = true;
        video.loop = true;
        video.playsInline = true;
        video.tabIndex = -1;
        video.setAttribute('aria-hidden', 'true');
        video.addEventListener('playing', () => {
            if (!isCurrent(state)) return;
            clearTimeout(state.timeout);
            video.classList.add('rovalra-game-video-preview-ready');
        });
        video.addEventListener('error', () => {
            if (active === state) stopPreview();
        });
        if (getComputedStyle(state.thumbnail).position === 'static') {
            state.thumbnail.classList.add('rovalra-video-preview-positioned');
        }
        state.thumbnail.appendChild(video);
        const streaming = streamRobloxVideo([{ location }], video, () => {}, {
            signal: state.controller.signal,
            maxHeight: 360,
            collectChunks: false,
        });
        video.play().catch(() => {
            if (active === state) stopPreview();
        });
        await streaming;
    } catch (error) {
        if (!state.controller.signal.aborted && error.name !== 'AbortError')
            remember(state.placeId, null, 30 * 1000);
        if (active === state) stopPreview();
    }
}

function handlePointerOver(event) {
    if (
        !enabled ||
        reducedMotion.matches ||
        !hoverAvailable.matches ||
        event.pointerType === 'touch' ||
        document.hidden
    )
        return;
    const candidate = getCandidate(event.target);
    if (!candidate || active?.thumbnail === candidate.thumbnail) return;
    stopPreview();
    const state = {
        ...candidate,
        controller: new AbortController(),
        observers: [],
    };
    active = state;
    const validate = () => {
        if (
            active === state &&
            (!isCurrent(state) ||
                (state.video && !state.thumbnail.contains(state.video)))
        )
            stopPreview();
    };
    state.observers.push(
        observeAttributes(state.anchor, validate, ['href']),
        observeChildren(state.anchor, validate),
        observeChildren(state.thumbnail, validate),
    );
    state.visibility = observeIntersection(state.thumbnail, (entry) => {
        if (active === state && !entry.isIntersecting) stopPreview();
    });
    state.timer = setTimeout(() => playPreview(state), HOVER_DELAY);
    state.timeout = setTimeout(() => {
        if (active === state) stopPreview();
    }, 15000);
}

function handlePointerOut(event) {
    if (
        active &&
        (!(event.relatedTarget instanceof Node) ||
            !active.thumbnail.contains(event.relatedTarget))
    )
        stopPreview();
}

async function updateSetting() {
    const version = ++settingsVersion;
    const value = await settings[SETTING];
    if (version !== settingsVersion) return;
    enabled = value === true;
    stopPreview();
    discovery?.disconnect();
    nativePlayers?.disconnect();
    if (!enabled) return;
    discovery = observeElement(LINKS, () => {}, {
        multiple: true,
        onRemove: (anchor) => {
            if (active?.anchor === anchor) stopPreview();
        },
    });
    nativePlayers = observeElement(
        NATIVE_PLAYER,
        (player) => {
            if (active?.anchor.contains(player)) stopPreview();
        },
        { multiple: true },
    );
}

export function init() {
    if (initialized) return;
    initialized = true;
    updateSetting();
    document.addEventListener('pointerover', handlePointerOver);
    document.addEventListener('pointerout', handlePointerOut);
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) stopPreview();
    });
    window.addEventListener('blur', stopPreview);
    window.addEventListener('pagehide', stopPreview);
    reducedMotion.addEventListener('change', stopPreview);
    hoverAvailable.addEventListener('change', stopPreview);
    document.addEventListener('rovalra:settingSaved', (event) => {
        if (event.detail?.name === SETTING) updateSetting();
    });
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local' && changes[SETTING]) updateSetting();
    });
}
