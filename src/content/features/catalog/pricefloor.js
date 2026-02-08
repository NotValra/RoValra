import { observeElement } from '../../core/observer.js';
import { getPlaceIdFromUrl } from '../../core/idExtractor.js';
import { callRobloxApiJson } from '../../core/api.js';
import { getAssets } from '../../core/assets.js';
import { addTooltip } from '../../core/ui/tooltip.js';

export function init() {
    chrome.storage.local.get('priceFloorEnabled', (data) => {
        if (data.priceFloorEnabled === false) return;

        observeElement('.item-price-value.icon-text-wrapper.clearfix.icon-robux-price-container', async (element) => {
            if (element.dataset.rovalraPriceFloor) return;
            element.dataset.rovalraPriceFloor = 'true';

            const assetId = getPlaceIdFromUrl();
            if (!assetId) return;

            try {
                const details = await callRobloxApiJson({
                    subdomain: 'catalog',
                    endpoint: `/v1/catalog/items/${assetId}/details?itemType=Asset`
                });

                if (!details || !details.assetType) return;

                const assetType = details.assetType;
                const isPbr = details.isPBR || false;
                const isBodysuit = details.taxonomy?.some(t => t.taxonomyName === 'Bodysuit') || false;
                
                const collectibleItemType = (details.itemRestrictions && details.itemRestrictions.includes('Collectible')) ? 1 : 2;

                const priceFloorData = await callRobloxApiJson({
                    subdomain: 'itemconfiguration',
                    endpoint: `/v1/items/price-floor?collectibleItemType=${collectibleItemType}&creationType=1&isPbr=${isPbr}&isBodysuit=${isBodysuit}&assetType=${assetType}`
                });

                if (priceFloorData && typeof priceFloorData.priceFloor === 'number') {
                    const assets = getAssets();
                    const floor = priceFloorData.priceFloor;
                    
                    const currentPrice = details.lowestPrice;

                    const icon = document.createElement('div');
                    icon.className = 'rovalra-price-floor-icon';
                    Object.assign(icon.style, {
                        width: '16px',
                        height: '16px',
                        marginLeft: '5px',
                        verticalAlign: 'text-bottom',
                        cursor: 'help',
                        display: 'inline-block',
                        backgroundColor: 'var(--rovalra-main-text-color)',
                        webkitMask: `url("${assets.priceFloorIcon}") no-repeat center / contain`,
                        mask: `url("${assets.priceFloorIcon}") no-repeat center / contain`
                    });
                    
                    let tooltipContent = `Price Floor: <span class="icon-robux-16x16"></span>${floor.toLocaleString()}`;
                    
                    if (typeof currentPrice === 'number' && !isNaN(currentPrice)) {
                        const diff = currentPrice - floor;
                        const status = diff > 0 ? 'above' : (diff < 0 ? 'below' : 'at');
                        tooltipContent += `<br>This item is ${status} the price floor${diff !== 0 ? ` by <span class="icon-robux-16x16"></span>${Math.abs(diff).toLocaleString()}` : ''}.`;
                    }

                    tooltipContent += `<br><br><span class="text-secondary" style="font-size: 12px;">The price floor is a dynamically updating minimum price an item can be sold for.</span>`;

                    addTooltip(icon, tooltipContent, { position: 'top' });
                    element.appendChild(icon);
                }
            } catch (e) {
            }
        });
    });
}
