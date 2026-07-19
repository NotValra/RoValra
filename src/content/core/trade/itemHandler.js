import { callRobloxApi } from '../api';
import { calculateRisk, RISK_LEVELS } from './riskCalculator.js';

const itemValueCache = new Map();
const rolimonsCache = new Map();
const riskCache = new Map();
const rolimonsCacheTimestamp = new Map();
const ROLIMONS_CACHE_TTL_MS = 60 * 1000;
let rolimonsDatasetFetchedAt = 0;
let rolimonsFetchPromise = null;

const fetchQueue = new Set();
let fetchTimer = null;
let fetchResolvers = [];

const riskFetchQueue = new Set();
let riskFetchTimer = null;
let riskFetchResolvers = [];

document.addEventListener('rovalra-tradable-items-response', (e) => {
    const data = e.detail;
    if (data && Array.isArray(data.items)) {
        data.items.forEach((item) => {
            if (Array.isArray(item.instances)) {
                item.instances.forEach((inst) => {
                    if (inst.collectibleItemInstanceId) {
                        itemValueCache.set(inst.collectibleItemInstanceId, {
                            ...inst,
                            rap: inst.recentAveragePrice,
                            serial: inst.serialNumber,
                            stock: inst.assetStock,
                            assetId: item.itemTarget.targetId,
                        });
                    }
                });
            }
        });
    }
});

export function getCachedItemValue(instanceId) {
    return itemValueCache.get(instanceId);
}

export function getCachedRolimonsItem(assetId) {
    return rolimonsCache.get(String(assetId));
}

export function getCachedRisk(assetId) {
    return riskCache.get(String(assetId));
}

export async function fetchRolimonsItems(ids) {
    const now = Date.now();
    if (now - rolimonsDatasetFetchedAt <= ROLIMONS_CACHE_TTL_MS) return;
    if (rolimonsFetchPromise) return rolimonsFetchPromise;

    const requestedIds = [...new Set(ids || [])].map(String);
    rolimonsFetchPromise = (async () => {
        try {
            const response = await callRobloxApi({
                isRovalraApi: true,
                endpoint: '/v1/rolimons/limiteds',
                noCache: true,
            });
            if (!response.ok) return;

            const json = await response.json();
            if (!json.items || typeof json.items !== 'object') return;

            const fetchedAt = Date.now();
            const updatedRiskIds = [];

            rolimonsCache.clear();
            rolimonsCacheTimestamp.clear();
            Object.entries(json.items).forEach(([id, data]) => {
                rolimonsCache.set(id, data);
                rolimonsCacheTimestamp.set(id, fetchedAt);

                const cachedRisk = riskCache.get(id);
                if (cachedRisk && cachedRisk.priceData) {
                    const riskData = cachedRisk.robloxBestPrice
                        ? { ...data, best_price: cachedRisk.robloxBestPrice }
                        : data;
                    cachedRisk.risk = calculateRisk(
                        cachedRisk.priceData,
                        riskData,
                        cachedRisk.volumeData,
                    );
                    updatedRiskIds.push(id);
                }
            });

            requestedIds.forEach((id) => {
                if (!json.items[id]) {
                    rolimonsCache.set(id, null);
                    rolimonsCacheTimestamp.set(id, fetchedAt);
                }
            });
            rolimonsDatasetFetchedAt = fetchedAt;

            document.dispatchEvent(
                new CustomEvent('rovalra-rolimons-data-update', {
                    detail: Object.keys(json.items),
                }),
            );
            if (updatedRiskIds.length > 0) {
                document.dispatchEvent(
                    new CustomEvent('rovalra-risk-data-update', {
                        detail: updatedRiskIds,
                    }),
                );
            }
        } catch (e) {
            console.warn('[RoValra] Failed to fetch Rolimons data', e);
        } finally {
            rolimonsFetchPromise = null;
        }
    })();

    return rolimonsFetchPromise;
}

export function queueRolimonsFetch(input) {
    const ids = Array.isArray(input) ? input : [input];
    const newIds = ids.filter((id) => {
        const strId = String(id);
        if (Date.now() - rolimonsDatasetFetchedAt > ROLIMONS_CACHE_TTL_MS) {
            return true;
        }
        return !rolimonsCache.has(strId);
    });

    if (newIds.length === 0) return Promise.resolve();

    newIds.forEach((id) => fetchQueue.add(id));

    return new Promise((resolve) => {
        fetchResolvers.push(resolve);

        if (fetchTimer) clearTimeout(fetchTimer);
        fetchTimer = setTimeout(async () => {
            const ids = Array.from(fetchQueue);
            fetchQueue.clear();
            const resolvers = fetchResolvers;
            fetchResolvers = [];

            if (ids.length > 0) {
                await fetchRolimonsItems(ids);
            }
            resolvers.forEach((r) => r());
        }, 100);
    });
}

export function queueRiskFetch(input) {
    const ids = Array.isArray(input) ? input : [input];
    const newIds = ids.filter((id) => !riskCache.has(String(id)));

    if (newIds.length === 0) return Promise.resolve();

    newIds.forEach((id) => riskFetchQueue.add(id));

    return new Promise((resolve) => {
        riskFetchResolvers.push(resolve);

        if (riskFetchTimer) clearTimeout(riskFetchTimer);
        riskFetchTimer = setTimeout(async () => {
            const ids = Array.from(riskFetchQueue);
            riskFetchQueue.clear();
            const resolvers = riskFetchResolvers;
            riskFetchResolvers = [];

            if (ids.length > 0) {
                await fetchRiskData(ids);
            }
            resolvers.forEach((r) => r());
        }, 200);
    });
}

async function fetchRiskData(ids) {
    const uniqueIds = [...new Set(ids)];
    const chunks = [];
    for (let i = 0; i < uniqueIds.length; i += 50) {
        chunks.push(uniqueIds.slice(i, i + 50));
    }

    const assetIdToCollectibleId = new Map();

    await Promise.all(
        chunks.map(async (chunk) => {
            try {
                const response = await callRobloxApi({
                    subdomain: 'catalog',
                    endpoint: '/v1/catalog/items/details',
                    method: 'POST',
                    body: {
                        items: chunk.map((id) => ({
                            itemType: 'Asset',
                            id: parseInt(id),
                        })),
                    },
                });
                if (response.ok) {
                    const json = await response.json();
                    if (json.data) {
                        json.data.forEach((item) => {
                            if (item.collectibleItemId) {
                                assetIdToCollectibleId.set(String(item.id), {
                                    collectibleItemId: item.collectibleItemId,
                                    lowestResalePrice: item.lowestResalePrice,
                                });
                            } else {
                                riskCache.set(String(item.id), {
                                    risk: {
                                        level: RISK_LEVELS.NO_RISK,
                                        score: 0,
                                        reasons: [],
                                        metrics: {},
                                    },
                                    priceData: [],
                                    volumeData: [],
                                });
                            }
                        });
                    }
                }
            } catch (e) {}
        }),
    );

    await Promise.all(
        Array.from(assetIdToCollectibleId.entries()).map(
            async ([assetId, data]) => {
                const { collectibleItemId, lowestResalePrice } = data;
                try {
                    const response = await callRobloxApi({
                        subdomain: 'apis',
                        endpoint: `/marketplace-sales/v1/item/${collectibleItemId}/resale-data`,
                    });
                    if (response.ok) {
                        const json = await response.json();
                        if (json && json.priceDataPoints) {
                            let rolimonsData = getCachedRolimonsItem(assetId);
                            if (lowestResalePrice) {
                                rolimonsData = {
                                    ...rolimonsData,
                                    best_price: lowestResalePrice,
                                };
                            }

                            const risk = calculateRisk(
                                json.priceDataPoints,
                                rolimonsData,
                                json.volumeDataPoints,
                            );
                            riskCache.set(assetId, {
                                risk,
                                priceData: json.priceDataPoints,
                                volumeData: json.volumeDataPoints,
                                robloxBestPrice: lowestResalePrice,
                            });
                            return;
                        }
                    }
                } catch (e) {}
                riskCache.set(assetId, {
                    risk: {
                        level: RISK_LEVELS.NO_RISK,
                        score: 0,
                        reasons: [],
                        metrics: {},
                    },
                    priceData: [],
                    volumeData: [],
                });
            },
        ),
    );

    document.dispatchEvent(
        new CustomEvent('rovalra-risk-data-update', {
            detail: uniqueIds,
        }),
    );
}
