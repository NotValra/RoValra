import { callRobloxApiJson } from '../api.js';

// Frames are the overlays drawn on the profile avatar banner. Unlike avatar
// borders they are not bundled into static/animated pairs, each entry is one
// standalone frame. Artwork is a ~3:1 .webp with a thin transparent margin.
//
// VALRA EDIT HERE: /frames/config.json should return an array of:
//   { value, label, category, link, animated, gamepassId, artistId, new }
// value is the ownership key, link is the .webp, gamepassId null means free.

// Bundled frames ship with the extension, so frames work before the endpoint
// exists. The neon set is one design recoloured, named neon-<colour>.
const LOCAL_FRAMES = [
    {
        value: 'christmas_lights',
        label: 'Christmas Lights',
        category: 'alicee',
        path: 'public/Assets/frames/christmas-lights.webp',
        animated: false,
        artistId: 48255812,
        local: true,
    },
    {
        value: 'rainy_day',
        label: 'Rainy Day',
        category: 'alicee',
        path: 'public/Assets/frames/rainy-day.webp',
        animated: true,
        artistId: 48255812,
        local: true,
    },
    {
        value: 'neon_cyan',
        label: 'Cyan Neon',
        category: 'alicee',
        path: 'public/Assets/frames/neon-cyan.webp',
        animated: false,
        artistId: 48255812,
        local: true,
    },
    {
        value: 'neon_blue',
        label: 'Blue Neon',
        category: 'alicee',
        path: 'public/Assets/frames/neon-blue.webp',
        animated: false,
        artistId: 48255812,
        local: true,
    },
    {
        value: 'neon_purple',
        label: 'Purple Neon',
        category: 'alicee',
        path: 'public/Assets/frames/neon-purple.webp',
        animated: false,
        artistId: 48255812,
        local: true,
    },
    {
        value: 'neon_pink',
        label: 'Pink Neon',
        category: 'alicee',
        path: 'public/Assets/frames/neon-pink.webp',
        animated: false,
        artistId: 48255812,
        local: true,
    },
    {
        value: 'neon_red',
        label: 'Red Neon',
        category: 'alicee',
        path: 'public/Assets/frames/neon-red.webp',
        animated: false,
        artistId: 48255812,
        local: true,
    },
    {
        value: 'neon_orange',
        label: 'Orange Neon',
        category: 'alicee',
        path: 'public/Assets/frames/neon-orange.webp',
        animated: false,
        artistId: 48255812,
        local: true,
    },
    {
        value: 'neon_gold',
        label: 'Gold Neon',
        category: 'alicee',
        path: 'public/Assets/frames/neon-gold.webp',
        animated: false,
        artistId: 48255812,
        local: true,
    },
    {
        value: 'neon_green',
        label: 'Green Neon',
        category: 'alicee',
        path: 'public/Assets/frames/neon-green.webp',
        animated: false,
        artistId: 48255812,
        local: true,
    },
    {
        value: 'neon_black',
        label: 'Black Neon',
        category: 'alicee',
        path: 'public/Assets/frames/neon-black.webp',
        animated: false,
        artistId: 48255812,
        local: true,
    },
];

let inMemoryCache = null;
let localFrameCache = null;
let fetchPromise = null;

function getExtensionUrl(path) {
    try {
        return chrome.runtime.getURL(path);
    } catch {
        return null;
    }
}

function normalizeFrame(frame) {
    if (!frame || typeof frame !== 'object') return null;
    if (!frame.value || !frame.link) return null;

    return {
        value: String(frame.value),
        label: String(frame.label || frame.value),
        category: frame.category ? String(frame.category) : 'Frames',
        link: String(frame.link),
        animated: frame.animated === true || frame.animated === 'true',
        gamepassId: frame.gamepassId ?? null,
        artistId: frame.artistId ?? null,
        new: frame.new === true || frame.new === 'true',
        local: frame.local === true,
    };
}

function normalizeFrames(data) {
    if (!Array.isArray(data)) return [];

    return data.map(normalizeFrame).filter(Boolean);
}

export function getLocalFrames() {
    if (localFrameCache) return localFrameCache;

    localFrameCache = LOCAL_FRAMES.map((frame) => {
        const link = getExtensionUrl(frame.path);
        if (!link) return null;

        return normalizeFrame({ ...frame, link });
    }).filter(Boolean);

    return localFrameCache;
}

export async function getFrames() {
    if (inMemoryCache) return inMemoryCache;

    if (!fetchPromise) {
        fetchPromise = (async () => {
            try {
                const data = await callRobloxApiJson({
                    subdomain: 'www',
                    endpoint: '/frames/config.json',
                    isRovalraApi: true,
                });

                inMemoryCache = [...getLocalFrames(), ...normalizeFrames(data)];
                return inMemoryCache;
            } catch {
                // Cache the bundled frames too, otherwise every frame that
                // gets rendered retries the missing config endpoint.
                inMemoryCache = getLocalFrames();
                return inMemoryCache;
            } finally {
                fetchPromise = null;
            }
        })();
    }

    return fetchPromise;
}

export function getCachedFrames() {
    return inMemoryCache || getLocalFrames();
}

export function findFrameByValue(frames, value) {
    if (!value || value === 'none') return null;

    return frames.find((frame) => frame.value === value) || null;
}

export function findFrameByLink(frames, link) {
    if (!link) return null;

    return frames.find((frame) => frame.link === link) || null;
}

export function groupFramesByCategory(frames) {
    const categories = new Map();

    for (const frame of frames) {
        if (!categories.has(frame.category)) {
            categories.set(frame.category, {
                label: frame.category,
                value: frame.category
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-|-$/g, ''),
                frames: [],
            });
        }
        categories.get(frame.category).frames.push(frame);
    }

    return [...categories.values()].map((category) => ({
        ...category,
        new: category.frames.some((frame) => frame.new),
    }));
}

getFrames();
