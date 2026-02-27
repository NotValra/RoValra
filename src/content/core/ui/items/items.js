import { createThumbnailElement, fetchThumbnails } from '../../thumbnail/thumbnails.js';
import { addTooltip } from '../tooltip.js';
import { createSerialIcon } from './serials.js';
import { callRobloxApi } from '../../api.js';

let batchQueue = [];
let batchTimeout = null;
const BATCH_DELAY = 50; 


async function processBatch() {
    const currentBatch = [...batchQueue];
    batchQueue = [];
    batchTimeout = null;

    try {
        const ids = currentBatch.map(item => item.id);
        const [detailsRes, looksRes, thumbMap] = await Promise.all([
            callRobloxApi({
                subdomain: 'catalog',
                endpoint: `/v1/catalog/items/details`,
                method: 'POST',
                body: { items: ids.map(id => ({ itemType: 'Asset', id })) }
            }),
            callRobloxApi({
                subdomain: 'apis',
                endpoint: '/look-api/v1/looks/purchase-details',
                method: 'POST',
                body: { assets: ids.map(id => ({ id })) }
            }),
            fetchThumbnails(ids.map(id => ({ id })), 'Asset', '150x150')
        ]);

        if (!detailsRes.ok) throw new Error('Failed to fetch batch details');
        if (!looksRes.ok) console.warn('RoValra: Looks API request failed, prices may be incomplete.');

        const detailsData = await detailsRes.json();
        const looksData = looksRes.ok ? await looksRes.json() : null;

        const catalogDetailsMap = new Map(detailsData.data?.map(item => [item.id, item]));
        const looksDetailsMap = new Map();
        looksData?.look?.items?.forEach(item => {
            looksDetailsMap.set(item.id, item);
            item.assetsInBundle?.forEach(bundleAsset => {
                if (!looksDetailsMap.has(bundleAsset.id)) {
                    looksDetailsMap.set(bundleAsset.id, item);
                }
            });
        });
        
        currentBatch.forEach(request => {
            const catalogItemData = catalogDetailsMap.get(request.id);
            const looksItemData = looksDetailsMap.get(request.id);
            const itemData = looksItemData || catalogItemData;
            
            if (catalogItemData) {
                const isLimited = itemData.itemRestrictions?.includes('Limited') || 
                                 itemData.itemRestrictions?.includes('LimitedUnique') ||
                                 itemData.itemRestrictions?.includes('Collectible');

                const rawPrice = itemData.priceInRobux ?? itemData.lowestPrice ?? itemData.price;

                const item = {
                    assetId: request.id,
                    name: catalogItemData.name,
                    recentAveragePrice: rawPrice || 0,
                    itemRestrictions: itemData.itemRestrictions || [],
                    itemType: catalogItemData.itemType,
                    isOnHold: false,
                    bundleId: null
                };

                if (looksItemData?.itemType === 'Bundle' && looksItemData.id !== request.id) {
                    item.bundleId = looksItemData.id;
                }

                if (itemData.isOffSale || itemData.noPriceStatus === 'OffSale' || !itemData.isPurchasable) {
                    if (isLimited && rawPrice != null) {
                        item.price = rawPrice;
                    } else {
                        item.priceText = 'Off Sale';
                    }
                } else {
                    item.price = rawPrice;
                    if (rawPrice === 0) {
                        item.priceText = 'Free';
                    }
                }

                const realCard = createItemCard(item, thumbMap, request.config);
                request.placeholder.replaceWith(realCard);
            } else {
                request.placeholder.innerHTML = '<div style="padding: 10px; color: var(--text-error);">Not Found</div>';
            }
        });

    } catch (e) {
        console.warn('RoValra: Batch request failed', e);
        currentBatch.forEach(request => {
            request.placeholder.innerHTML = '<div style="padding: 10px; color: var(--text-error);">Failed to load</div>';
        });
    }
}
export function createItemCard(itemOrId, thumbnailCacheOrConfig, config = {}) {
    if (typeof itemOrId === 'number' || typeof itemOrId === 'string') {
        const itemId = parseInt(itemOrId);
        const actualConfig = (thumbnailCacheOrConfig && !thumbnailCacheOrConfig.get) ? thumbnailCacheOrConfig : config;

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
            <div class="rovalra-item-thumb-container shimmer" style="width: 100%; height: 150px; border-radius: 8px; margin-bottom: 4px;"></div>
            <div class="rovalra-item-name shimmer" style="height: 14px; width: 90%; margin-bottom: 4px; border-radius: 4px;"></div>
            <div class="rovalra-item-rap shimmer" style="height: 14px; width: 60%; border-radius: 4px;"></div>
        `;

        batchQueue.push({
            id: itemId,
            placeholder: card,
            config: actualConfig
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

    if (item.price !== undefined && item.price !== null) {
        card.dataset.rovalraPrice = item.price;
        if (item.bundleId) {
            card.dataset.rovalraBundleId = item.bundleId;
        }
    }

    const thumbData = thumbnailCache?.get ? thumbnailCache.get(item.assetId) : null;
    const itemType = item.itemType || 'Asset';
    const itemUrl =
        itemType === 'Bundle'
            ? `https://www.roblox.com/bundles/${item.assetId}/unnamed`
            : `https://www.roblox.com/catalog/${item.assetId}/unnamed`;

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

    if (showOnHold && item.isOnHold) {
        const onHoldIconElement = document.createElement('div');
        onHoldIconElement.className = 'rovalra-on-hold-icon-container';
        onHoldIconElement.innerHTML = `
            <svg focusable="false" aria-hidden="true" viewBox="0 0 24 24">
              <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2m4.2 14.2L11 13V7h1.5v5.2l4.5 2.7z"></path>
            </svg>
        `;
        addTooltip(onHoldIconElement, 'On Hold', { position: 'top' });
        thumbContainer.appendChild(onHoldIconElement);
    }

    if (showSerial) {
        const serialIcon = createSerialIcon(item, hideSerial);
        if (serialIcon) {
            thumbContainer.appendChild(serialIcon);
        }
    }

    thumbContainer.appendChild(thumbnailElement);

    let showLimitedIcon = false;
    let isUnique = false;

    if (Array.isArray(item.itemRestrictions)) {
        const hasLimited = item.itemRestrictions.includes('Limited');
        const hasLimitedUnique = item.itemRestrictions.includes('LimitedUnique');
        const hasCollectible = item.itemRestrictions.includes('Collectible');
        showLimitedIcon = hasLimited || hasLimitedUnique || hasCollectible;
        isUnique = hasLimitedUnique || hasCollectible;
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