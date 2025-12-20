// Not really smart to use this script since it is mainly used in the rap thing

import { createThumbnailElement } from '../../thumbnail/thumbnails.js';
import { addTooltip } from '../tooltip.js';
import DOMPurify from 'dompurify';
let isCssInjected = false;


function injectItemCss() {
    if (isCssInjected) return;
    isCssInjected = true;

    const styleId = 'rovalra-item-card-style';
    if (document.getElementById(styleId)) return;

    const css = `
        :root {
            --rovalra-item-bg: transparent;
            --rovalra-item-thumb-bg: rgba(208,217,251,.12);
            --rovalra-item-text-primary: #FFFFFF;
            --rovalra-item-text-secondary: #b8b8b8;
            --rovalra-item-serial-bg: rgba(25, 25, 25, 0.85);
        }
        body:not(.dark-theme) {
            --rovalra-item-thumb-bg: #E3E5E7;
            --rovalra-item-text-primary: #191B1D;
            --rovalra-item-text-secondary: #606264;
            --rovalra-item-serial-bg: rgb(188, 190, 200);
        }
        .rovalra-item-card { text-align:left; }
        .rovalra-item-card-link { text-decoration: none; color: inherit; }
        .rovalra-item-thumb-container { position: relative; background-color:var(--rovalra-item-thumb-bg); border-radius:8px; aspect-ratio: 1 / 1; margin-bottom: 8px; }
        .rovalra-item-thumb { width:100%; height:100%; object-fit:contain; border-radius: 8px; }
        .rovalra-item-name { font-size:14px; font-weight:500; color:var(--rovalra-item-text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .rovalra-item-rap { font-size:12px; font-weight:600; color:var(--rovalra-item-text-secondary); display:flex; align-items:center; }
        .rovalra-item-rap .icon-robux-16x16 { margin-right: 4px; flex-shrink:0; }
        .rovalra-on-hold-icon-container { position: absolute; top: 4px; left: 4px; z-index: 4; width: 28px; height: 28px; cursor: default; }
        .rovalra-serial-container { position: absolute; bottom: 21px; left: 2px; z-index: 3; }
        .rovalra-item-thumb-container .icon-label { position: absolute; bottom: -1px; left: -1px; z-index: 2; }
        .rovalra-on-hold-icon-container svg { fill: white; width: 100%; height: 100%; filter: drop-shadow(0px 0px 2px rgba(0, 0, 0, 0.8)); }
        .rovalra-serial-container { background-color: var(--rovalra-item-serial-bg); color: var(--rovalra-item-text-primary); border-radius: 11px; display: flex; align-items: center; height: 22px; padding: 0 2px; cursor: default; transition: all 0.25s ease-in-out; }
        .rovalra-serial-star { display: flex; align-items: center; justify-content: center; width: 20px; height: 20px; flex-shrink: 0; }
        .rovalra-serial-star .icon-shop-limited { transform: scale(0.8); }
        .rovalra-serial-number { max-width: 0; opacity: 0; overflow: hidden; white-space: nowrap; font-size: 12px; font-weight: 600; transition: max-width 0.25s ease-in-out, opacity 0.2s ease-in-out 0.05s, margin-left 0.25s ease-in-out; margin-left: 0; }
        .rovalra-serial-container.hover-reveal:hover .rovalra-serial-number { max-width: 100px; opacity: 1; margin-left: 4px; padding-right: 4px; }
        .rovalra-serial-container.always-visible .rovalra-serial-number { max-width: 100px; opacity: 1; margin-left: 4px; padding-right: 4px; }
    `;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = css;
    document.head.appendChild(style);
}


export function createItemCard(item, thumbnailCache, config = {}) {
    injectItemCss();
    const { showOnHold = true, showSerial = true, hideSerial = false } = config;

    const card = document.createElement('div');
    card.className = 'rovalra-item-card';

    const thumbData = thumbnailCache.get(item.assetId);
    const itemUrl = `https://www.roblox.com/catalog/${item.assetId}/`;
    const rap = item.recentAveragePrice ? item.recentAveragePrice.toLocaleString() : 'N/A';

    const thumbContainer = document.createElement('div');
    thumbContainer.className = 'rovalra-item-thumb-container';
    const thumbnailElement = createThumbnailElement(thumbData, item.name, 'rovalra-item-thumb');

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

    if (showSerial && item.serialNumber !== null) {
        const serialVisibilityClass = hideSerial ? 'hover-reveal' : 'always-visible';
        const serialIconElement = document.createElement('div');
        serialIconElement.className = `rovalra-serial-container ${serialVisibilityClass}`;
        serialIconElement.innerHTML = DOMPurify.sanitize(`
            <div class="rovalra-serial-star">
                <span class="icon-shop-limited"></span>
            </div>
            <span class="rovalra-serial-number">#${item.serialNumber.toLocaleString()}</span>
        `);
        thumbContainer.appendChild(serialIconElement);
    }

    thumbContainer.appendChild(thumbnailElement);

    const limitedIconElement = document.createElement('span');
    limitedIconElement.className = item.serialNumber !== null ? 'icon-label icon-limited-unique-label' : 'icon-label icon-limited-label';
    thumbContainer.appendChild(limitedIconElement);

    card.innerHTML = DOMPurify.sanitize(`
        <a href="${itemUrl}" target="_blank" rel="noopener noreferrer" class="rovalra-item-card-link">
            <!-- Thumbnail container will be injected here -->
            <div class="rovalra-item-name" title="${item.name}">${item.name}</div>
            <div class="rovalra-item-rap">
                <span class="icon-robux-16x16"></span>
                <span>${rap}</span>
            </div>
        </a>
    `);
    card.querySelector('a').prepend(thumbContainer);
    return card;
}