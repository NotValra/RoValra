import { callRobloxApiJson } from '../api.js';

const catalogItemDetailsCache = new Map();

export const CATALOG_ITEM_TYPES = {
    ASSET: 'asset',
    BUNDLE: 'bundle',
};

export const CATALOG_ITEM_STATUSES = {
    NEW: 'New',
    SALE: 'Sale',
    XBOX_EXCLUSIVE: 'XboxExclusive',
    AMAZON_EXCLUSIVE: 'AmazonExclusive',
    GOOGLE_PLAY_EXCLUSIVE: 'GooglePlayExclusive',
    IOS_EXCLUSIVE: 'IosExclusive',
    SALE_TIMER: 'SaleTimer',
    IS_FAE: 'IsFae',
};

export const CATALOG_ITEM_STATUS_VALUES = Object.values(CATALOG_ITEM_STATUSES);

const CATALOG_ITEM_STATUS_ALIASES = {
    IsFAE: CATALOG_ITEM_STATUSES.IS_FAE,
};

export function normalizeCatalogItemStatus(status) {
    return CATALOG_ITEM_STATUS_ALIASES[status] || status || null;
}

export function normalizeCatalogItemStatuses(statuses) {
    if (!Array.isArray(statuses)) return [];
    return statuses.map(normalizeCatalogItemStatus);
}

function getCacheKey(itemId, itemType) {
    return `${itemId}|${itemType}`;
}

/**
 * @param {string|number} itemId - Asset or bundle id.
 * @param {string} [itemType] - Catalog item type.
 * @param {Object} [options]
 * @param {boolean} [options.noCache=false] - Skip the in-memory cache.
 * @returns {Promise<Object|null>} Full response body from Roblox.
 */
export async function getCatalogItemDetails(
    itemId,
    itemType = CATALOG_ITEM_TYPES.ASSET,
    options = {},
) {
    if (!itemId) throw new Error('itemId is required');
    if (!itemType) throw new Error('itemType is required');

    const { noCache = false } = options;
    const normalizedItemType = itemType.toString();
    const cacheKey = getCacheKey(itemId, normalizedItemType);

    if (!noCache && catalogItemDetailsCache.has(cacheKey)) {
        return catalogItemDetailsCache.get(cacheKey);
    }

    const requestPromise = callRobloxApiJson({
        subdomain: 'catalog',
        endpoint: `/v1/catalog/items/${itemId}/details?itemType=${encodeURIComponent(normalizedItemType)}`,
        method: 'GET',
        noCache,
    }).catch((error) => {
        catalogItemDetailsCache.delete(cacheKey);
        console.warn('RoValra: Failed to fetch catalog item details', error);
        return null;
    });

    if (!noCache) {
        catalogItemDetailsCache.set(cacheKey, requestPromise);
    }

    return requestPromise;
}

export async function getCatalogItemDetailField(
    itemId,
    itemType,
    field,
    options = {},
) {
    const details = await getCatalogItemDetails(itemId, itemType, options);
    if (options.returnBody) return details;
    return details?.[field] ?? null;
}

export async function getCatalogItemCreatedUtc(itemId, itemType, options) {
    return getCatalogItemDetailField(
        itemId,
        itemType,
        'itemCreatedUtc',
        options,
    );
}

export async function getCatalogItemIsPBR(itemId, itemType, options) {
    return getCatalogItemDetailField(itemId, itemType, 'isPBR', options);
}

export async function getCatalogItemTaxonomy(itemId, itemType, options) {
    return getCatalogItemDetailField(itemId, itemType, 'taxonomy', options);
}

export async function getCatalogItemIsHighDefinition(
    itemId,
    itemType,
    options,
) {
    return getCatalogItemDetailField(
        itemId,
        itemType,
        'isHighDefinition',
        options,
    );
}

export async function getCatalogItemExpectedSellerId(
    itemId,
    itemType,
    options,
) {
    return getCatalogItemDetailField(
        itemId,
        itemType,
        'expectedSellerId',
        options,
    );
}

export async function getCatalogItemOwned(itemId, itemType, options) {
    return getCatalogItemDetailField(itemId, itemType, 'owned', options);
}

export async function getCatalogItemIsPurchasable(itemId, itemType, options) {
    return getCatalogItemDetailField(
        itemId,
        itemType,
        'isPurchasable',
        options,
    );
}

export async function getCatalogItemId(itemId, itemType, options) {
    return getCatalogItemDetailField(itemId, itemType, 'id', options);
}

export async function getCatalogItemType(itemId, itemType, options) {
    return getCatalogItemDetailField(itemId, itemType, 'itemType', options);
}

export async function getCatalogItemAssetType(itemId, itemType, options) {
    return getCatalogItemDetailField(itemId, itemType, 'assetType', options);
}

export async function getCatalogItemName(itemId, itemType, options) {
    return getCatalogItemDetailField(itemId, itemType, 'name', options);
}

export async function getCatalogItemDescription(itemId, itemType, options) {
    return getCatalogItemDetailField(itemId, itemType, 'description', options);
}

export async function getCatalogItemProductId(itemId, itemType, options) {
    return getCatalogItemDetailField(itemId, itemType, 'productId', options);
}

export async function getCatalogItemStatuses(itemId, itemType, options = {}) {
    const statuses = await getCatalogItemDetailField(
        itemId,
        itemType,
        'itemStatus',
        options,
    );
    if (options.returnBody) return statuses;
    return normalizeCatalogItemStatuses(statuses);
}

export async function catalogItemHasStatus(itemId, itemType, status, options) {
    const statuses = await getCatalogItemStatuses(itemId, itemType, options);
    return statuses.includes(normalizeCatalogItemStatus(status));
}

export async function getCatalogItemRestrictions(itemId, itemType, options) {
    return getCatalogItemDetailField(
        itemId,
        itemType,
        'itemRestrictions',
        options,
    );
}

export async function getCatalogItemCreatorHasVerifiedBadge(
    itemId,
    itemType,
    options,
) {
    return getCatalogItemDetailField(
        itemId,
        itemType,
        'creatorHasVerifiedBadge',
        options,
    );
}

export async function getCatalogItemCreatorType(itemId, itemType, options) {
    return getCatalogItemDetailField(itemId, itemType, 'creatorType', options);
}

export async function getCatalogItemCreatorTargetId(itemId, itemType, options) {
    return getCatalogItemDetailField(
        itemId,
        itemType,
        'creatorTargetId',
        options,
    );
}

export async function getCatalogItemCreatorName(itemId, itemType, options) {
    return getCatalogItemDetailField(itemId, itemType, 'creatorName', options);
}

export async function getCatalogItemPrice(itemId, itemType, options) {
    return getCatalogItemDetailField(itemId, itemType, 'price', options);
}

export async function getCatalogItemLowestPrice(itemId, itemType, options) {
    return getCatalogItemDetailField(itemId, itemType, 'lowestPrice', options);
}

export async function getCatalogItemLowestResalePrice(
    itemId,
    itemType,
    options,
) {
    return getCatalogItemDetailField(
        itemId,
        itemType,
        'lowestResalePrice',
        options,
    );
}

export async function getCatalogItemPriceStatus(itemId, itemType, options) {
    return getCatalogItemDetailField(itemId, itemType, 'priceStatus', options);
}

export async function getCatalogItemUnitsAvailableForConsumption(
    itemId,
    itemType,
    options,
) {
    return getCatalogItemDetailField(
        itemId,
        itemType,
        'unitsAvailableForConsumption',
        options,
    );
}

export async function getCatalogItemFavoriteCount(itemId, itemType, options) {
    return getCatalogItemDetailField(
        itemId,
        itemType,
        'favoriteCount',
        options,
    );
}

export async function getCatalogItemOffSaleDeadline(itemId, itemType, options) {
    return getCatalogItemDetailField(
        itemId,
        itemType,
        'offSaleDeadline',
        options,
    );
}

export async function getCatalogItemCollectibleItemId(
    itemId,
    itemType,
    options,
) {
    return getCatalogItemDetailField(
        itemId,
        itemType,
        'collectibleItemId',
        options,
    );
}

export async function getCatalogItemTotalQuantity(itemId, itemType, options) {
    return getCatalogItemDetailField(
        itemId,
        itemType,
        'totalQuantity',
        options,
    );
}

export async function getCatalogItemSaleLocationType(
    itemId,
    itemType,
    options,
) {
    return getCatalogItemDetailField(
        itemId,
        itemType,
        'saleLocationType',
        options,
    );
}

export async function getCatalogItemHasResellers(itemId, itemType, options) {
    return getCatalogItemDetailField(itemId, itemType, 'hasResellers', options);
}

export default {
    getCatalogItemDetails,
    getCatalogItemDetailField,
    getCatalogItemCreatedUtc,
    getCatalogItemIsPBR,
    getCatalogItemTaxonomy,
    getCatalogItemIsHighDefinition,
    getCatalogItemExpectedSellerId,
    getCatalogItemOwned,
    getCatalogItemIsPurchasable,
    getCatalogItemId,
    getCatalogItemType,
    getCatalogItemAssetType,
    getCatalogItemName,
    getCatalogItemDescription,
    getCatalogItemProductId,
    getCatalogItemStatuses,
    catalogItemHasStatus,
    getCatalogItemRestrictions,
    getCatalogItemCreatorHasVerifiedBadge,
    getCatalogItemCreatorType,
    getCatalogItemCreatorTargetId,
    getCatalogItemCreatorName,
    getCatalogItemPrice,
    getCatalogItemLowestPrice,
    getCatalogItemLowestResalePrice,
    getCatalogItemPriceStatus,
    getCatalogItemUnitsAvailableForConsumption,
    getCatalogItemFavoriteCount,
    getCatalogItemOffSaleDeadline,
    getCatalogItemCollectibleItemId,
    getCatalogItemTotalQuantity,
    getCatalogItemSaleLocationType,
    getCatalogItemHasResellers,
    normalizeCatalogItemStatus,
    normalizeCatalogItemStatuses,
    CATALOG_ITEM_TYPES,
    CATALOG_ITEM_STATUSES,
    CATALOG_ITEM_STATUS_VALUES,
};
