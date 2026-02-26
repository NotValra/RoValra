import { observeElement } from '../../core/observer.js';
import { addTooltip } from '../../core/ui/tooltip.js';
import { getAssets } from '../../core/assets.js';
import { callRobloxApi } from '../../core/api.js';

const itemPrices = new Map();
const itemIsOffSale = new Map();
const pendingCards = new Map();

function addPriceIconToCard(card, assetId) {
    const price = itemPrices.get(assetId);
    const isOffSale = itemIsOffSale.get(assetId);

    if (isOffSale && price !== undefined && price > 1) {
        const priceLabelSelector = '.text-overflow.item-card-price';
        let container = card.querySelector(priceLabelSelector);
        
        if (!container) {
            const caption = card.querySelector('.item-card-caption');
            if (caption) {
                const newContainer = document.createElement('div');
                newContainer.className = 'text-overflow item-card-price font-header-2 text-subheader margin-top-none';
                
                const offSaleSpan = document.createElement('span');
                offSaleSpan.className = 'text text-label text-robux-tile';
                offSaleSpan.textContent = 'Off Sale';
                newContainer.appendChild(offSaleSpan);

                caption.appendChild(newContainer);
                container = newContainer;
            }
        }

        if (container && !container.querySelector('.rovalra-offsale-price-icon')) {
            addIcon(container, price);
        }
    }
}

export function init() {
    chrome.storage.local.get('PreviousPriceEnabled', (result) => {
        if (result.PreviousPriceEnabled !== true) {
            return;
        }

        window.addEventListener('rovalra-catalog-details', async (e) => {
            const data = e.detail;
            if (!data || !data.data || !Array.isArray(data.data)) {
                return;
            }
    
            const updatedAssetIds = new Set();
    
            data.data.forEach(item => {
                if (item.id) {
                    itemPrices.set(item.id, item.price);
                    itemIsOffSale.set(item.id, item.isOffSale || item.priceStatus === 'Off Sale');
                    updatedAssetIds.add(item.id);
                }
            });
    
            const itemsToCheck = data.data.map(item => ({
                id: item.id
            }));
    
            if (itemsToCheck.length > 0) {
                try {
                    const purchaseRes = await callRobloxApi({
                        subdomain: 'apis',
                        endpoint: '/look-api/v1/looks/purchase-details',
                        method: 'POST',
                        body: { assets: itemsToCheck }
                    });
    
                    if (purchaseRes.ok) {
                        const purchaseData = await purchaseRes.json();
                        const bundleIds = new Set();
                        const assetToBundle = new Map();
    
                        if (purchaseData.look && purchaseData.look.items) {
                            purchaseData.look.items.forEach(item => {
                                if (item.itemType === 'Bundle') {
                                    bundleIds.add(item.id);
                                    if (item.assetsInBundle) {
                                        item.assetsInBundle.forEach(asset => {
                                            assetToBundle.set(asset.id, item.id);
                                        });
                                    }
                                }
                            });
                        }
    
                        if (bundleIds.size > 0) {
                            const bundleDetailsRes = await callRobloxApi({
                                subdomain: 'catalog',
                                endpoint: '/v1/catalog/items/details',
                                method: 'POST',
                                body: {
                                    items: Array.from(bundleIds).map(id => ({ itemType: 'Bundle', id }))
                                }
                            });
    
                            if (bundleDetailsRes.ok) {
                                const bundleDetails = await bundleDetailsRes.json();
                                if (bundleDetails.data) {
                                    bundleDetails.data.forEach(bundle => {
                                        const bundleIsOffSale = bundle.isOffSale || bundle.priceStatus === 'Off Sale';
                                        if (bundleIsOffSale && bundle.price !== undefined) {
                                            assetToBundle.forEach((bId, assetId) => {
                                                if (bId === bundle.id) {
                                                    itemIsOffSale.set(assetId, true);
                                                    itemPrices.set(assetId, bundle.price);
                                                    updatedAssetIds.add(assetId);
                                                }
                                            });
                                        }
                                    });
                                }
                            }
                        }
                    }
                } catch (err) {
                    // Fail silently
                }
            }
    
            updatedAssetIds.forEach(assetId => {
                if (pendingCards.has(assetId)) {
                    const cards = pendingCards.get(assetId);
                    cards.forEach(card => {
                        addPriceIconToCard(card, assetId);
                    });
                    pendingCards.delete(assetId);
                }
            });
        });
    
        observeElement('#collection-carousel-item .item-card', (card) => {
            handleItemCard(card);
        }, { multiple: true });
    
        observeElement('.roseal-currently-wearing .item-card', (card) => {
            handleItemCard(card);
        }, { multiple: true });
    });
}

function handleItemCard(card) {
    if (!card.isConnected) return;
    const link = card.querySelector('.item-card-link');
    if (!link) return;

    const href = link.getAttribute('href');
    const match = href.match(/\/catalog\/(\d+)\//);
    if (!match) return;
    const assetId = parseInt(match[1]);

    const priceLabelSelector = '.text-overflow.item-card-price';
    let priceLabelContainer = card.querySelector(priceLabelSelector);
    
    let shouldProcess = false;

    if (!priceLabelContainer) {
        shouldProcess = true;
    } else {
        const priceLabel = priceLabelContainer.querySelector('.text-robux-tile');
        if (!priceLabel || priceLabel.textContent.trim() === 'Off Sale') {
            shouldProcess = true;
        }
    }

    if (shouldProcess) {
        if (itemPrices.has(assetId)) {
            addPriceIconToCard(card, assetId);
        }

        if (!card.querySelector('.rovalra-offsale-price-icon')) {
            if (!pendingCards.has(assetId)) {
                pendingCards.set(assetId, []);
            }
            if (!pendingCards.get(assetId).includes(card)) {
                pendingCards.get(assetId).push(card);
            }
        }
    }
}

function addIcon(container, price) {
    if (container.querySelector('.rovalra-offsale-price-icon')) return;
    
    const assets = getAssets();
    const icon = document.createElement('div');
    icon.className = 'rovalra-offsale-price-icon';
    Object.assign(icon.style, {
        width: '16px',
        height: '16px',
        marginLeft: '4px',
        verticalAlign: 'text-bottom',
        cursor: 'help',
        display: 'inline-block',
        backgroundColor: 'var(--rovalra-secondary-text-color)',
        webkitMask: `url("${assets.priceFloorIcon}") no-repeat center / contain`,
        mask: `url("${assets.priceFloorIcon}") no-repeat center / contain`
    });

    addTooltip(icon, `Previous Price: <span class="icon-robux-16x16" style="vertical-align: middle; margin: 0 2px;"></span>${price.toLocaleString()}`);

    container.appendChild(icon);
}
