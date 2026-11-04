import { callRobloxApiJson } from '../api.js';
import { fetchThumbnails } from '../thumbnail/thumbnails.js';

const CATALOG_BATCH_SIZE = 100;

const catalogCache = new Map();
const gamePassCache = new Map();
const developerProductCache = new Map();

const ITEM_TYPES = {
    asset: 'Asset',
    bundle: 'Bundle',
    gamepass: 'GamePass',
    developerproduct: 'DeveloperProduct',
    privateserver: 'PrivateServer',
};

export function normalizeItemType(type) {
    return (
        ITEM_TYPES[
            String(type || '')
                .replace(/[\s_-]/g, '')
                .toLowerCase()
        ] || null
    );
}

async function loadCatalogItems(items) {
    const missing = items.filter(
        ({ type, id }) => !catalogCache.has(`${type}:${id}`),
    );
    for (let index = 0; index < missing.length; index += CATALOG_BATCH_SIZE) {
        const batch = missing.slice(index, index + CATALOG_BATCH_SIZE);
        const request = callRobloxApiJson({
            subdomain: 'catalog',
            endpoint: '/v1/catalog/items/details',
            method: 'POST',
            body: {
                items: batch.map(({ type, id }) => ({
                    itemType: type,
                    id: Number(id),
                })),
            },
        })
            .then(
                (response) =>
                    new Map(
                        (response?.data || []).map((item) => [
                            `${item.itemType}:${item.id}`,
                            item,
                        ]),
                    ),
            )
            .catch((error) => {
                console.warn(
                    'RoValra: Failed to fetch purchased catalog items',
                    error,
                );
                return new Map();
            });
        batch.forEach(({ type, id }) => {
            const key = `${type}:${id}`;
            catalogCache.set(
                key,
                request.then((details) => details.get(key) || null),
            );
        });
    }
    return Promise.all(
        items.map(({ type, id }) => catalogCache.get(`${type}:${id}`)),
    );
}

function loadGamePass(id) {
    if (!gamePassCache.has(id)) {
        gamePassCache.set(
            id,
            callRobloxApiJson({
                subdomain: 'apis',
                endpoint: `/game-passes/v1/game-passes/${id}/product-info`,
            }).catch(() => null),
        );
    }
    return gamePassCache.get(id);
}

async function loadDeveloperProducts(universeId) {
    if (!developerProductCache.has(universeId)) {
        developerProductCache.set(
            universeId,
            (async () => {
                let products = [];
                let cursor = null;
                do {
                    const data = await callRobloxApiJson({
                        subdomain: 'apis',
                        endpoint:
                            `/developer-products/v2/universes/${universeId}/developerproducts?limit=400` +
                            (cursor
                                ? `&cursor=${encodeURIComponent(cursor)}`
                                : ''),
                    }).catch(() => null);
                    products = products.concat(data?.developerProducts || []);
                    cursor = data?.nextPageCursor || null;
                } while (cursor);
                return products;
            })(),
        );
    }
    return developerProductCache.get(universeId);
}

const matchesDeveloperProduct = (product, id) =>
    [
        product.ProductId,
        product.DeveloperProductId,
        product.developerProductId,
        product.productId,
        product.id,
    ].some((value) => value !== undefined && String(value) === id);

export async function getPurchasedItems(purchases) {
    const resolved = purchases.map((purchase) => ({
        type: normalizeItemType(purchase.itemType),
        id: purchase.itemId ? String(purchase.itemId) : null,
        universeId: purchase.universeId ? String(purchase.universeId) : null,
        name: purchase.itemName || null,
        url: null,
        thumbnailType: null,
        thumbnailId: null,
    }));

    const catalogItems = resolved.filter(
        (item) => item.id && (item.type === 'Asset' || item.type === 'Bundle'),
    );
    const [catalogDetails] = await Promise.all([
        loadCatalogItems(catalogItems),
        ...resolved.map(async (item) => {
            if (!item.id) return;
            if (item.type === 'GamePass') {
                const info = await loadGamePass(item.id);
                item.name = info?.Name || item.name;
                item.url = `https://www.roblox.com/game-pass/${encodeURIComponent(item.id)}`;
                item.thumbnailType = 'GamePass';
                item.thumbnailId = item.id;
            } else if (item.type === 'DeveloperProduct' && item.universeId) {
                const products = await loadDeveloperProducts(item.universeId);
                const product = products.find((entry) =>
                    matchesDeveloperProduct(entry, item.id),
                );
                if (!product) return;
                item.name = product.Name || item.name;
                item.url = `https://www.roblox.com/developer-product/${encodeURIComponent(item.universeId)}/product/${encodeURIComponent(product.ProductId ?? item.id)}`;
                if (Number(product.IconImageAssetId) > 0) {
                    item.thumbnailType = 'Asset';
                    item.thumbnailId = String(product.IconImageAssetId);
                }
            }
        }),
    ]);

    catalogItems.forEach((item, index) => {
        item.name = catalogDetails[index]?.name || item.name;
        item.url =
            item.type === 'Bundle'
                ? `https://www.roblox.com/bundles/${encodeURIComponent(item.id)}`
                : `https://www.roblox.com/catalog/${encodeURIComponent(item.id)}`;
        item.thumbnailType =
            item.type === 'Bundle' ? 'BundleThumbnail' : 'Asset';
        item.thumbnailId = item.id;
    });

    for (const item of resolved) {
        if (!item.thumbnailType && item.universeId) {
            item.thumbnailType = 'GameIcon';
            item.thumbnailId = item.universeId;
        }
    }

    const thumbnailTypes = [
        ...new Set(resolved.map((item) => item.thumbnailType).filter(Boolean)),
    ];
    const thumbnails = new Map(
        await Promise.all(
            thumbnailTypes.map(async (type) => [
                type,
                await fetchThumbnails(
                    [
                        ...new Set(
                            resolved
                                .filter((item) => item.thumbnailType === type)
                                .map((item) => item.thumbnailId),
                        ),
                    ].map((id) => ({ id })),
                    type,
                    '150x150',
                ),
            ]),
        ),
    );

    return resolved.map((item) => ({
        name: item.name,
        url: item.url,
        thumbnail: item.thumbnailType
            ? thumbnails
                  .get(item.thumbnailType)
                  ?.get(Number(item.thumbnailId)) || null
            : null,
    }));
}
