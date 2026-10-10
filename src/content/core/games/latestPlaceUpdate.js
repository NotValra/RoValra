import { callRobloxApi } from '../api.js';

const CONCURRENCY = 4;
const MAX_ATTEMPTS = 4;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(endpoint) {
    let delay = 2000;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
        try {
            const res = await callRobloxApi({ subdomain: 'develop', endpoint });
            if (res.ok) return await res.json();
            if (res.status !== 429 && res.status < 500) return null;
        } catch {
            // network error, retry
        }
        await sleep(delay);
        delay *= 2;
    }
    return null;
}

async function fetchLatestForUniverse(universeId) {
    let latest = null;
    let cursor = '';
    do {
        const data = await getJson(
            `/v2/universes/${universeId}/places?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        );
        if (!data?.data) break;
        for (const place of data.data) {
            const time = new Date(place.updated).getTime();
            if (!Number.isFinite(time)) continue;
            if (!latest || time > latest.time) {
                latest = {
                    time,
                    updated: place.updated,
                    placeId: place.id,
                    placeName: place.name,
                };
            }
        }
        cursor = data.nextPageCursor || '';
    } while (cursor);
    return latest;
}

/**
 * Fills `cache` (Map universeId -> { time, updated, placeId, placeName } | null)
 * for every id not already in it.
 */
export async function fetchLatestPlaceUpdates(universeIds, cache) {
    const queue = universeIds.filter((id) => id && !cache.has(id));
    const worker = async () => {
        while (queue.length) {
            const id = queue.shift();
            cache.set(id, await fetchLatestForUniverse(id).catch(() => null));
        }
    };
    await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker),
    );
}
