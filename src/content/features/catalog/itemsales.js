import { callRobloxApiJson } from '../../core/api.js';
import { observeElement } from '../../core/observer.js';
import { addTooltip } from '../../core/ui/tooltip.js';
import DOMPurify from 'dompurify';

let cachedItemsData = null;
let currentActiveItemId = null;

export function init() {
    chrome.storage.local.get({ itemSalesEnabled: false }, async (settings) => {
        if (!settings.itemSalesEnabled) return;

        const url = window.location.href;
        const regex = /https:\/\/www\.roblox\.com\/(?:[a-z]{2}\/)?(?:catalog|bundles)\/(\d+)/;
        const match = url.match(regex);
        
        if (!match) {
            currentActiveItemId = null;
            return;
        }
        
        const itemId = parseInt(match[1], 10);
        currentActiveItemId = itemId;

        if (!cachedItemsData) {
            try {
                cachedItemsData = await callRobloxApiJson({
                    isRovalraApi: true,
                    subdomain: 'www',
                    endpoint: '/static/json/items.json'
                });
            } catch (e) {
                console.error("RoValra: Failed to load items.json", e);
                return;
            }
        }

        if (!cachedItemsData || !cachedItemsData.item) return;

        const item = cachedItemsData.item.find(i => i.id === itemId || parseInt(i.id, 10) === itemId);
        if (!item) return;

        observeElement('.price-row-container', (foundElement) => {
            if (currentActiveItemId !== itemId) return;
            if (foundElement.dataset.rovalraItemSalesInjected === String(itemId)) return;

            foundElement.parentNode.querySelector('.rovalra-item-sales-container')?.remove();

            const container = document.createElement('div');
            container.className = 'rovalra-item-sales-container';

            const createRow = (label, value, showTooltip = false, isHtml = false) => {
                const row = document.createElement('div');
                row.className = 'clearfix item-info-row-container';

                const labelDiv = document.createElement('div');
                labelDiv.className = 'font-header-1 text-subheader text-label text-overflow row-label';
                labelDiv.textContent = label;

                const valueDiv = document.createElement('div');
                valueDiv.className = 'font-body text';

                if (isHtml) {
                    valueDiv.innerHTML = DOMPurify.sanitize(value);
                } else {
                    valueDiv.textContent = value;
                }

                if (showTooltip) {
                    const infoIcon = document.createElement('span');
                    infoIcon.className = 'icon-moreinfo';
                    infoIcon.style.marginLeft = "1px";
                    infoIcon.style.cursor = "pointer";
                    infoIcon.style.verticalAlign = "middle";
                    infoIcon.style.transform = "scale(0.8)";
                    addTooltip(infoIcon, "The sales and revenue stats are from a leak and are likely inaccurate.", { position: 'top' });
                    valueDiv.appendChild(infoIcon);
                }

                row.appendChild(labelDiv);
                row.appendChild(valueDiv);
                return row;
            };

            const salesRow = createRow('Sales', item.sales.toLocaleString(), true);
            container.appendChild(salesRow);

            const revenueRow = createRow('Revenue', `<span class="icon-robux-16x16" style="vertical-align: text-bottom; margin-right: 0px;"></span>${(item.revenue / 100).toFixed(2)}`, false, true);
            container.appendChild(revenueRow);

            foundElement.parentNode.insertBefore(container, foundElement.nextSibling);
            foundElement.dataset.rovalraItemSalesInjected = String(itemId);
        });
    });
}
