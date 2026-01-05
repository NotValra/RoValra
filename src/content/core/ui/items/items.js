import { createThumbnailElement } from '../../thumbnail/thumbnails.js';
import { addTooltip } from '../tooltip.js';
import { createSerialIcon } from './serials.js';

export function createItemCard(item, thumbnailCache, config = {}) {
    const { showOnHold = true, showSerial = true, hideSerial = false } = config;

    const card = document.createElement('div');
    card.className = 'rovalra-item-card';

    const thumbData = thumbnailCache.get(item.assetId);
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

    let showLimitedIcon = true;
    let isUnique = false;

    if (Array.isArray(item.itemRestrictions)) {
        const hasLimited = item.itemRestrictions.includes('Limited');
        const hasLimitedUnique =
            item.itemRestrictions.includes('LimitedUnique');
        const hasCollectible = item.itemRestrictions.includes('Collectible');
        showLimitedIcon = hasLimited || hasLimitedUnique || hasCollectible;
        isUnique = hasLimitedUnique || hasCollectible;
    } else {
        isUnique = item.serialNumber != null;
    }

    if (showLimitedIcon) {
        const limitedIconElement = document.createElement('span');
        limitedIconElement.className = isUnique
            ? 'icon-label icon-limited-unique-label'
            : 'icon-label icon-limited-label';
        thumbContainer.appendChild(limitedIconElement);
    }

    card.innerHTML = `
        <a href="${itemUrl}" target="_blank" rel="noopener noreferrer" class="rovalra-item-card-link">
            <div class="rovalra-item-name"></div>
            <div class="rovalra-item-rap">
                ${priceHtml}
            </div>
        </a>
    `; // Verified

    const nameDiv = card.querySelector('.rovalra-item-name');
    nameDiv.title = item.name;
    nameDiv.textContent = item.name;

    card.querySelector('a').prepend(thumbContainer);
    return card;
}
