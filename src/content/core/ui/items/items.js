import {
    createThumbnailElement,
    fetchThumbnails,
} from '../../thumbnail/thumbnails.js';
import { addTooltip } from '../tooltip.js';
import { createSerialIcon } from './serials.js';
import { callRobloxApi } from '../../api.js';
import { getAssets } from '../../assets.js';
import { t, ts } from '../../locale/i18n.js';

let batchQueue = [];
let batchTimeout = null;
const BATCH_DELAY = 50;
const DEVELOP_ASSET_BATCH_SIZE = 50;

async function fetchDevelopAssetDetails(assetIds) {
    const assetMap = new Map();

    await Promise.all(
        Array.from(
            { length: Math.ceil(assetIds.length / DEVELOP_ASSET_BATCH_SIZE) },
            (_, index) => {
                const batch = assetIds.slice(
                    index * DEVELOP_ASSET_BATCH_SIZE,
                    (index + 1) * DEVELOP_ASSET_BATCH_SIZE,
                );

                return callRobloxApi({
                    subdomain: 'develop',
                    endpoint: `/v1/assets?assetIds=${batch.join(',')}`,
                    method: 'GET',
                })
                    .then(async (developRes) => {
                        if (!developRes.ok) return;

                        const developData = await developRes.json();
                        developData.data?.forEach((assetInfo) => {
                            assetMap.set(assetInfo.id, assetInfo);
                        });
                    })
                    .catch((e) => {
                        console.warn(
                            'RoValra: Develop fallback batch failed',
                            e,
                        );
                    });
            },
        ),
    );

    return assetMap;
}

function getCollectibleLowestResalePrice(data) {
    const resalePrice =
        data?.collectiblesItemDetails?.collectibleLowestResalePrice ??
        data?.lowestResalePrice;

    return typeof resalePrice === 'number' && resalePrice > 0
        ? resalePrice
        : null;
}

function getItemRawPrice(...sources) {
    for (const source of sources) {
        const price =
            source?.lowestPrice ??
            source?.priceInRobux ??
            source?.price;

        if (typeof price === 'number') return price;
    }

    return null;
}

// Matches Roblox's catalog URL format instead of using unnamed. Done to prevent rate limits with some VPNs widely by Roblox Players
function slugifyItemName(name) {
    const slug = String(name ?? '')
        .replace(/['’]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return slug || 'unnamed';
}

function isBundleAssetProxy(looksItemData, assetId) {
    return looksItemData?.itemType === 'Bundle' && looksItemData.id !== assetId;
}

function isItemOffSale(data) {
    return (
        data?.isOffSale === true ||
        data?.noPriceStatus === 'OffSale' ||
        data?.priceStatus === 'Off Sale' ||
        data?.isPurchasable === false
    );
}

function isFAEItem(item) {
    return (
        item?.isFAE === true ||
        (Array.isArray(item?.itemStatus) &&
            item.itemStatus.some((status) =>
                ['IsFAE', 'IsFae'].includes(status),
            ))
    );
}

async function processBatch() {
    const currentBatch = [...batchQueue];
    batchQueue = [];
    batchTimeout = null;

    try {
        const ids = currentBatch.map((item) => item.id);
        const prefetchedThumbMap = new Map();
        currentBatch.forEach((request) => {
            const thumbnailData = request.config?.thumbnailData;
            if (thumbnailData?.imageUrl) {
                prefetchedThumbMap.set(request.id, {
                    state: 'Completed',
                    targetId: request.id,
                    thumbnailType: 'Asset',
                    ...thumbnailData,
                });
            }
        });
        const thumbnailRequests = currentBatch.filter(
            (request) => !prefetchedThumbMap.has(request.id),
        );
        const thumbnailGroups = new Map();
        thumbnailRequests.forEach((request) => {
            const itemType =
                request.config?.itemType === 'Bundle'
                    ? 'BundleThumbnail'
                    : 'Asset';
            if (!thumbnailGroups.has(itemType))
                thumbnailGroups.set(itemType, []);
            thumbnailGroups.get(itemType).push(request.id);
        });
        const [detailsRes, looksRes, thumbMap] = await Promise.all([
            callRobloxApi({
                subdomain: 'catalog',
                endpoint: `/v1/catalog/items/details`,
                method: 'POST',
                body: {
                    items: currentBatch.map((request) => ({
                        itemType: request.config?.itemType || 'Asset',
                        id: request.id,
                    })),
                },
            }),
            callRobloxApi({
                subdomain: 'apis',
                endpoint: '/look-api/v1/looks/purchase-details',
                method: 'POST',
                body: { assets: ids.map((id) => ({ id })) },
            }),
            Promise.all(
                Array.from(thumbnailGroups.entries()).map(
                    ([itemType, thumbnailIds]) =>
                        fetchThumbnails(
                            thumbnailIds.map((id) => ({ id })),
                            itemType,
                            '150x150',
                        ),
                ),
            ).then((maps) => {
                const merged = new Map();
                maps.forEach((map) =>
                    map.forEach((thumbnail, id) => merged.set(id, thumbnail)),
                );
                return merged;
            }),
        ]);

        prefetchedThumbMap.forEach((thumbData, id) => {
            thumbMap.set(id, thumbData);
        });

        if (!detailsRes.ok)
            console.warn(
                'RoValra: Catalog details request failed, using fallback item details.',
            );
        if (!looksRes.ok)
            console.warn(
                'RoValra: Looks API request failed, prices may be incomplete.',
            );

        const detailsData = detailsRes.ok ? await detailsRes.json() : null;
        const looksData = looksRes.ok ? await looksRes.json() : null;

        if (detailsData?.data) {
            window.dispatchEvent(
                new CustomEvent('rovalra-catalog-details', {
                    detail: { data: detailsData.data },
                }),
            );
        }

        const catalogDetailsMap = new Map(
            detailsData?.data?.map((item) => [item.id, item]),
        );
        const looksDetailsMap = new Map();
        looksData?.look?.items?.forEach((item) => {
            looksDetailsMap.set(item.id, item);
            item.assetsInBundle?.forEach((bundleAsset) => {
                if (!looksDetailsMap.has(bundleAsset.id)) {
                    looksDetailsMap.set(bundleAsset.id, item);
                }
            });
        });

        const developAssetMap = await fetchDevelopAssetDetails([
            ...new Set(
                currentBatch
                    .filter((request) => !catalogDetailsMap.has(request.id))
                    .map((request) => request.id),
            ),
        ]);

        await Promise.all(
            currentBatch.map(async (request) => {
                const catalogItemData = catalogDetailsMap.get(request.id);
                const looksItemData = looksDetailsMap.get(request.id);
                const itemData = looksItemData || catalogItemData;

                if (catalogItemData) {
                    // using the catalog api for limiteds CUZ ROBLOX ISNT CONSISTENT AT ALL
                    const isLooksBundleProxy = isBundleAssetProxy(
                        looksItemData,
                        request.id,
                    );
                    const restrictions = [
                        ...new Set([
                            ...(catalogItemData.itemRestrictions || []),
                            ...(isLooksBundleProxy
                                ? []
                                : looksItemData?.itemRestrictions || []),
                        ]),
                    ];

                    const isLimited =
                        restrictions.includes('Limited') ||
                        restrictions.includes('LimitedUnique') ||
                        restrictions.includes('Collectible');

                    const saleItemData = isLooksBundleProxy
                        ? catalogItemData
                        : itemData;
                    const isOffSale = isItemOffSale(saleItemData);
                    const priceSources = isLooksBundleProxy
                        ? [catalogItemData]
                        : [saleItemData, looksItemData];
                    let rawPrice = getItemRawPrice(...priceSources);

                    if (isLimited && (isOffSale || rawPrice == null)) {
                        const resalePrice =
                            getCollectibleLowestResalePrice(catalogItemData);
                        if (resalePrice != null) rawPrice = resalePrice;
                    }

                    const item = {
                        assetId: request.id,
                        name: catalogItemData.name,
                        isHiddenFromMarketplace:
                            catalogItemData.isHiddenFromMarketplace === true,
                        recentAveragePrice: rawPrice || 0,
                        itemRestrictions: restrictions,
                        isFAE: isFAEItem(catalogItemData),
                        license: catalogItemData.license?.licenseType
                            ? catalogItemData.license
                            : null,
                        itemType: catalogItemData.itemType,
                        isOnHold: false,
                        bundleId: null,
                    };

                    if (
                        looksItemData?.itemType === 'Bundle' &&
                        looksItemData.id !== request.id
                    ) {
                        item.bundleId = looksItemData.id;
                    }

                    if (isOffSale) {
                        if (isLimited && rawPrice != null) {
                            item.price = rawPrice;
                            item.recentAveragePrice = rawPrice;
                        } else {
                            item.priceText = 'Off Sale';
                        }
                    } else {
                        item.price = rawPrice;
                        if (rawPrice === 0) {
                            item.priceText = 'Free';
                        }
                    }

                    const realCard = createItemCard(
                        item,
                        thumbMap,
                        request.config,
                    );
                    request.placeholder.replaceWith(realCard);
                } else {
                    let item = null;
                    const assetInfo = developAssetMap.get(request.id);
                    if (assetInfo) {
                        item = {
                            assetId: request.id,
                            name: assetInfo.name,
                            assetType: {
                                id: assetInfo.typeId,
                                name: assetInfo.type,
                            },
                            recentAveragePrice: 0,
                            itemRestrictions: [],
                            itemType: 'Asset',
                            isOnHold: false,
                            bundleId: null,
                            priceText: 'Off Sale',
                        };
                    }

                    if (item) {
                        item.isHiddenFromMarketplace = true;
                        const realCard = createItemCard(
                            item,
                            thumbMap,
                            request.config,
                        );
                        request.placeholder.replaceWith(realCard);
                        if (item.assetType) {
                            window.dispatchEvent(
                                new CustomEvent('rovalra-catalog-details', {
                                    detail: {
                                        data: [
                                            {
                                                id: item.assetId,
                                                assetType: item.assetType,
                                            },
                                        ],
                                    },
                                }),
                            );
                        }
                    } else {
                        request.placeholder.innerHTML = `<div style="padding: 10px;">${ts('items.notFound')}</div>`;
                    }
                }
            }),
        );
    } catch (e) {
        console.warn('RoValra: Batch request failed', e);
        currentBatch.forEach((request) => {
            request.placeholder.innerHTML = `<div style="padding: 10px;">${ts('items.failedToLoad')}</div>`;
        });
    }
}
export function createItemCard(itemOrId, thumbnailCacheOrConfig, config = {}) {
    if (typeof itemOrId === 'number' || typeof itemOrId === 'string') {
        const itemId = parseInt(itemOrId);
        const actualConfig =
            thumbnailCacheOrConfig && !thumbnailCacheOrConfig.get
                ? thumbnailCacheOrConfig
                : config;

        const card = document.createElement('div');
        card.className = 'rovalra-item-card';
        card.style.minHeight = '100px';
        if (actualConfig.cardStyles) {
            Object.assign(card.style, actualConfig.cardStyles);
        } else {
            card.style.width = '100%';
            card.style.minWidth = '1%';
            card.style.maxWidth = '150px';
        }
        card.innerHTML = `
            <div class="rovalra-item-thumb-container shimmer" style="width: 100%; height: 150px; border-radius: 8px; margin-bottom: 4px; background-color: var(--color-common-shimmer);"></div>
            <div class="rovalra-item-name shimmer" style="height: 14px; width: 90%; margin-bottom: 4px; border-radius: 4px; background-color: var(--color-common-shimmer);"></div>
            <div class="rovalra-item-rap shimmer" style="height: 14px; width: 60%; border-radius: 4px; background-color: var(--color-common-shimmer);"></div>
        `;

        batchQueue.push({
            id: itemId,
            placeholder: card,
            config: actualConfig,
        });

        if (batchTimeout) clearTimeout(batchTimeout);
        batchTimeout = setTimeout(processBatch, BATCH_DELAY);

        return card;
    }

    const item = itemOrId;
    const thumbnailCache = thumbnailCacheOrConfig;
    const { showOnHold = true, showSerial = true, hideSerial = false } = config;

    const card = document.createElement('div');
    card.className = 'rovalra-item-card';
    if (config.cardStyles) {
        Object.assign(card.style, config.cardStyles);
    } else {
        card.style.width = '100%';
        card.style.minWidth = '1%';
        card.style.maxWidth = '150px';
    }

    if (item.itemType) {
        card.dataset.rovalraItemType = item.itemType;
    }

    if (item.bundleId) {
        card.dataset.rovalraBundleId = item.bundleId;
    }

    if (item.price !== undefined && item.price !== null) {
        card.dataset.rovalraPrice = item.price;
    }

    const thumbData = thumbnailCache?.get
        ? thumbnailCache.get(item.assetId)
        : null;
    const itemType = item.itemType || 'Asset';
    const itemSlug = slugifyItemName(item.name);
    const itemUrl =
        itemType === 'Bundle'
            ? `https://www.roblox.com/bundles/${item.assetId}/${itemSlug}`
            : `https://www.roblox.com/catalog/${item.assetId}/${itemSlug}`;

    let priceHtml;
    if (item.priceText) {
        priceHtml = `<span>${item.priceText}</span>`;
    } else {
        const rap =
            typeof item.recentAveragePrice === 'number'
                ? item.recentAveragePrice.toLocaleString()
                : 'N/A';
        priceHtml = `<span class="icon-robux-16x16"></span><span>${rap}</span>`;
    }

    const thumbContainer = document.createElement('div');
    thumbContainer.className = 'rovalra-item-thumb-container';
    thumbContainer.style.position = 'relative';
    thumbContainer.style.width = '100%';
    thumbContainer.style.height = '100%';
    thumbContainer.style.maxHeight = '150px';

    const thumbnailElement = createThumbnailElement(
        thumbData,
        item.name,
        'rovalra-item-thumb',
    );

    if (item.isHiddenFromMarketplace === true) {
        const hiddenIconElement = document.createElement('div');
        hiddenIconElement.className = 'rovalra-hidden-marketplace-icon';
        hiddenIconElement.setAttribute('aria-hidden', 'true');
        const hiddenIconSvg = getAssets().visibilityOff;
        if (hiddenIconSvg?.startsWith('data:image/svg+xml,')) {
            hiddenIconElement.innerHTML = decodeURIComponent(
                hiddenIconSvg.split(',')[1],
            );
            const svg = hiddenIconElement.querySelector('svg');
            if (svg) {
                svg.style.width = '100%';
                svg.style.height = '100%';
                svg.style.fill = 'currentColor';
            }
        }
        Object.assign(hiddenIconElement.style, {
            position: 'absolute',
            right: '7px',
            bottom: '7px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '25px',
            height: '25px',
            padding: '4px',
            boxSizing: 'border-box',
            borderRadius: '50%',
            backgroundColor: 'rgba(127, 127, 127, 0.55)',
            backdropFilter: 'blur(3px)',
            webkitBackdropFilter: 'blur(3px)',
            color: 'var(--rovalra-main-text-color)',
            zIndex: '2',
        });
        t('items.hiddenFromMarketplace')
            .catch(() => ts('items.hiddenFromMarketplace'))
            .then((tooltipText) => {
                if (hiddenIconElement.isConnected) {
                    addTooltip(hiddenIconElement, tooltipText, {
                        position: 'top',
                    });
                }
            });
        thumbContainer.appendChild(hiddenIconElement);
    }

    if (showOnHold && item.isOnHold) {
        const onHoldIconElement = document.createElement('div');
        onHoldIconElement.className = 'rovalra-on-hold-icon-container';
        onHoldIconElement.innerHTML = `
            <svg focusable="false" aria-hidden="true" viewBox="0 0 24 24">
              <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2m4.2 14.2L11 13V7h1.5v5.2l4.5 2.7z"></path>
            </svg>
        `;
        addTooltip(onHoldIconElement, ts('items.onHold'), { position: 'top' });
        thumbContainer.appendChild(onHoldIconElement);
    }

    if (showSerial) {
        const serialIcon = createSerialIcon(item, hideSerial);
        if (serialIcon) {
            thumbContainer.appendChild(serialIcon);
        }
    }

    thumbContainer.appendChild(thumbnailElement);

    if (isFAEItem(item)) {
        const faeIconElement = document.createElement('div');
        faeIconElement.className = 'rovalra-fae-icon';
        faeIconElement.setAttribute('aria-label', ts('items.faeItem'));
        faeIconElement.innerHTML =
            '<span role="presentation" class="grow-0 shrink-0 basis-auto icon icon-regular-lock-closed size-[var(--icon-size-medium)]"></span>';
        Object.assign(faeIconElement.style, {
            position: 'absolute',
            top: '8px',
            left: '8px',
            zIndex: '3',
            width: '32px',
            height: '32px',
            borderRadius: '9999px',
            backgroundColor: 'var(--color-content-emphasis)',
            color: 'var(--color-surface-100)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
        });
        thumbContainer.appendChild(faeIconElement);
    }

    if (item.license?.licenseType) {
        const licensedPill = document.createElement('div');
        licensedPill.className =
            'rovalra-licensed-pill foundation-web-badge flex items-center select-none gap-[var(--size-150)] radius-circle height-600 width-[fit-content] padding-x-small bg-shift-200 content-emphasis stroke-none';
        const licensedText = document.createElement('span');
        licensedText.className =
            'text-no-wrap text-truncate-split text-label-small padding-y-xsmall padding-x-xxsmall content-emphasis';
        licensedText.textContent = ts('items.licensed');
        licensedPill.appendChild(licensedText);
        Object.assign(licensedPill.style, {
            position: 'absolute',
            top: '8px',
            left: isFAEItem(item) ? '48px' : '8px',
            zIndex: '3',
        });
        if (item.license.licenseDisplayName) {
            addTooltip(licensedPill, item.license.licenseDisplayName, {
                position: 'top',
            });
        }
        thumbContainer.appendChild(licensedPill);
    }

    let showLimitedIcon = false;
    let isUnique = false;

    if (Array.isArray(item.itemRestrictions)) {
        const hasLimited = item.itemRestrictions.includes('Limited');
        const hasLimitedUnique =
            item.itemRestrictions.includes('LimitedUnique');
        const hasCollectible = item.itemRestrictions.includes('Collectible');
        showLimitedIcon = hasLimited || hasLimitedUnique || hasCollectible;

        isUnique = hasLimitedUnique || (hasCollectible && !hasLimited);
    } else {
        isUnique = item.serialNumber != null;
        if (isUnique || item.recentAveragePrice !== undefined) {
            showLimitedIcon = true;
        }
    }

    if (showLimitedIcon) {
        const limitedIconElement = document.createElement('span');
        limitedIconElement.className = isUnique
            ? 'icon-label icon-limited-unique-label'
            : 'icon-label icon-limited-label';

        thumbContainer.appendChild(limitedIconElement);
    }

    card.innerHTML = `
        <a href="${itemUrl}" class="rovalra-item-card-link">
            <div class="rovalra-item-name"></div>
            <div class="rovalra-item-rap">
                ${priceHtml}
            </div>
        </a>
    `; //Verified

    const nameDiv = card.querySelector('.rovalra-item-name');
    nameDiv.title = item.name;
    nameDiv.textContent = item.name;

    card.querySelector('a').prepend(thumbContainer);
    return card;
}
