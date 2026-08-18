import { callRobloxApiJson } from '../api.js';

// Frames are the overlays drawn on the profile avatar banner. Unlike avatar
// borders they are not bundled into static/animated pairs, each entry is one
// standalone frame. Artwork is a ~3:1 .webp with a thin transparent margin.
//

let inMemoryCache = null;
let fetchPromise = null;

function normalizeFrame(frame) {
    if (!frame || typeof frame !== 'object') return null;
    if (!frame.value || !frame.link) return null;

    return {
        value: String(frame.value),
        label: String(frame.label || frame.value),
        category: frame.category ? String(frame.category) : 'Frames',
        link: String(frame.link),
        animated: frame.animated === true || frame.animated === 'true',
        artistId: frame.artistId ?? null,
        assetId: frame.assetId ?? null,
        price: frame.price ?? null,
        isFree: frame.isFree === true || frame.isFree === 'true',
        new:
            frame.isNew === true ||
            frame.isNew === 'true' ||
            frame.new === true ||
            frame.new === 'true',
    };
}

function normalizeFrames(data) {
    if (!Array.isArray(data)) return [];

    return data.map(normalizeFrame).filter(Boolean);
}

export async function getFrames() {
    if (inMemoryCache) return inMemoryCache;

    if (!fetchPromise) {
        fetchPromise = (async () => {
            try {
                const data = await callRobloxApiJson({
                    subdomain: 'www',
                    endpoint: '/berts/config.json',
                    isRovalraApi: true,
                });

                inMemoryCache = normalizeFrames(data);
                return inMemoryCache;
            } catch {
                inMemoryCache = [];
                return inMemoryCache;
            } finally {
                fetchPromise = null;
            }
        })();
    }

    return fetchPromise;
}

export function getCachedFrames() {
    return inMemoryCache || [];
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
