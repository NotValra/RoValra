import { observeElement } from '../../core/observer.js';
import { addTooltip } from '../../core/ui/tooltip.js';
import { getAssets } from '../../core/assets.js';
import { callRobloxApi } from '../../core/api.js';
import { getPlaceIdFromUrl } from '../../core/idExtractor.js';
import { ts } from '../../core/locale/i18n.js';
import { getItemDetails } from '../../core/catalog/itemPrice.js';
import { createInteractiveTimestamp } from '../../core/ui/time/time.js';

const itemPrices = new Map();
const itemIsOffSale = new Map();
const itemOffSaleDeadlines = new Map();
const pendingCards = new Map();
let listenersAttached = false;

function addPriceIconToCard(card, assetId) {
    const price = itemPrices.get(assetId);
    const isOffSale = itemIsOffSale.get(assetId);
    const deadline = itemOffSaleDeadlines.get(assetId);

    if (isOffSale && price !== undefined && price > 1) {
        if (card.matches('.price-container-text')) {
            addTextPrice(card, price, deadline);
            return;
        }

        let container;
        const priceLabelSelector =
            '.text-overflow.item-card-price, .rovalra-item-rap';
        container = card.querySelector(priceLabelSelector);

        if (!container) {
            const caption = card.querySelector('.item-card-caption');
            if (caption) {
                const newContainer = document.createElement('div');
                newContainer.className =
                    'text-overflow item-card-price font-header-2 text-subheader margin-top-none';

                const offSaleSpan = document.createElement('span');
                offSaleSpan.className = 'text text-label text-robux-tile';
                offSaleSpan.textContent = ts('previousPrice.offSale');
                newContainer.appendChild(offSaleSpan);

                caption.appendChild(newContainer);
                container = newContainer;
            }
        }

        if (
            container &&
            !container.querySelector('.rovalra-offsale-price-icon')
        ) {
            addIcon(container, price, deadline);
        }
    }
}

export function init() {
    chrome.storage.local.get('PreviousPriceEnabled', (result) => {
        if (result.PreviousPriceEnabled !== true) {
            return;
        }

        if (listenersAttached) return;
        listenersAttached = true;

        observeElement(
            '#offsale-since-date',
            (el) => {
                el.style.display = 'none';
            },
            { multiple: true },
        );

        window.addEventListener('rovalra-catalog-details', async (e) => {
            const data = e.detail;
            if (!data || !data.data || !Array.isArray(data.data)) {
                return;
            }

            const updatedAssetIds = new Set();

            data.data.forEach((item) => {
                if (item.id) {
                    itemPrices.set(item.id, item.price);
                    itemIsOffSale.set(
                        item.id,
                        item.isOffSale || item.priceStatus === 'Off Sale',
                    );
                    if (item.offSaleDeadline) {
                        itemOffSaleDeadlines.set(item.id, item.offSaleDeadline);
                    }
                    updatedAssetIds.add(item.id);
                }
            });

            const assetsToCheck = [];
            const pageId = getPlaceIdFromUrl();

            data.data.forEach((item) => {
                const isOffSale = itemIsOffSale.get(item.id);
                const price = itemPrices.get(item.id);

                if (isOffSale && (price === null || price === undefined)) {
                    if (
                        item.itemType !== 'Bundle' &&
                        !(
                            window.location.pathname.includes('/bundles/') &&
                            item.id == pageId
                        )
                    ) {
                        assetsToCheck.push({ id: item.id });
                    }
                }
            });

            if (assetsToCheck.length > 0) {
                try {
                    const purchaseRes = await callRobloxApi({
                        subdomain: 'apis',
                        endpoint: '/look-api/v1/looks/purchase-details',
                        method: 'POST',
                        body: {
                            assets: assetsToCheck,
                        },
                    });

                    if (purchaseRes.ok) {
                        const purchaseData = await purchaseRes.json();
                        const bundleIds = new Set();
                        const assetToBundle = new Map();

                        if (purchaseData.look && purchaseData.look.items) {
                            purchaseData.look.items.forEach((item) => {
                                if (item.itemType === 'Bundle') {
                                    bundleIds.add(item.id);
                                    if (item.assetsInBundle) {
                                        item.assetsInBundle.forEach((asset) => {
                                            assetToBundle.set(
                                                asset.id,
                                                item.id,
                                            );
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
                                    items: Array.from(bundleIds).map((id) => ({
                                        itemType: 'Bundle',
                                        id,
                                    })),
                                },
                            });

                            if (bundleDetailsRes.ok) {
                                const bundleDetails =
                                    await bundleDetailsRes.json();
                                if (bundleDetails.data) {
                                    bundleDetails.data.forEach((bundle) => {
                                        const bundleIsOffSale =
                                            bundle.isOffSale ||
                                            bundle.priceStatus === 'Off Sale';
                                        if (
                                            bundleIsOffSale &&
                                            bundle.price !== undefined
                                        ) {
                                            assetToBundle.forEach(
                                                (bId, assetId) => {
                                                    if (bId === bundle.id) {
                                                        itemIsOffSale.set(
                                                            assetId,
                                                            true,
                                                        );
                                                        itemPrices.set(
                                                            assetId,
                                                            bundle.price,
                                                        );
                                                        updatedAssetIds.add(
                                                            assetId,
                                                        );
                                                    }
                                                },
                                            );

                                            if (itemPrices.has(bundle.id)) {
                                                itemIsOffSale.set(
                                                    bundle.id,
                                                    true,
                                                );
                                                itemPrices.set(
                                                    bundle.id,
                                                    bundle.price,
                                                );
                                                updatedAssetIds.add(bundle.id);
                                            }
                                        }
                                    });
                                }
                            }
                        }
                    }
                } catch {
                    // Fail silently
                }
            }

            updatedAssetIds.forEach((assetId) => {
                if (pendingCards.has(assetId)) {
                    const cards = pendingCards.get(assetId);
                    cards.forEach((card) => {
                        addPriceIconToCard(card, assetId);
                    });
                    pendingCards.delete(assetId);
                }
            });
        });

        observeElement(
            '#collection-carousel-item .item-card',
            (card) => {
                handleItemCard(card);
            },
            { multiple: true },
        );

        observeElement(
            '.roseal-currently-wearing .item-card',
            (card) => {
                handleItemCard(card);
            },
            { multiple: true },
        );

        observeElement(
            '.rovalra-item-card',
            (card) => {
                handleItemCard(card);
            },
            { multiple: true },
        );

        observeElement(
            '.price-container-text',
            (container) => {
                handleOffsalePriceContainer(container);
            },
            { multiple: true },
        );
    });
}

function handleItemCard(card) {
    if (!card.isConnected) return;

    const link =
        card.querySelector('.item-card-link') ||
        card.querySelector('.rovalra-item-card-link');
    if (!link) return;

    const href = link.getAttribute('href');
    const match = href.match(/\/catalog\/(\d+)\//);
    if (!match) return;
    const assetId = parseInt(match[1]);

    const priceLabelSelector =
        '.text-overflow.item-card-price, .rovalra-item-rap';
    let priceLabelContainer = card.querySelector(priceLabelSelector);

    let shouldProcess = false;

    if (!priceLabelContainer) {
        shouldProcess = true;
    } else {
        const textContent = priceLabelContainer.textContent
            .trim()
            .toLowerCase();
        const hasRobuxIcon =
            priceLabelContainer.querySelector('.icon-robux-tile');

        if (
            !hasRobuxIcon ||
            textContent.includes('off sale') ||
            textContent.includes('offsale')
        ) {
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

async function handleOffsalePriceContainer(container) {
    if (container.dataset.rovalraPreviousPrice) return;
    container.dataset.rovalraPreviousPrice = 'true';

    const assetId = getPlaceIdFromUrl();
    if (!assetId) return;

    const numericAssetId = parseInt(assetId);
    const isBundle = window.location.pathname.includes('/bundles/');
    const itemType = isBundle ? 'Bundle' : 'Asset';

    const currentPrice = itemPrices.get(numericAssetId);
    const hasValidPreviousPrice =
        currentPrice !== undefined && currentPrice > 1;
    const hasDeadline = itemOffSaleDeadlines.has(numericAssetId);

    if (!hasValidPreviousPrice || !hasDeadline) {
        try {
            const details = await getItemDetails(numericAssetId, itemType);
            if (details) {
                const previousPrice = details.price || details.lowestPrice;
                if (previousPrice !== undefined && previousPrice !== null)
                    itemPrices.set(numericAssetId, previousPrice);

                if (details.offSaleDeadline)
                    itemOffSaleDeadlines.set(
                        numericAssetId,
                        details.offSaleDeadline,
                    );

                itemIsOffSale.set(
                    numericAssetId,
                    details.isOffSale || details.priceStatus === 'Off Sale',
                );
            }
        } catch (e) {
            console.warn(
                'RoValra: Failed to fetch item details for previous price',
                e,
            );
        }
    }

    if (itemPrices.has(numericAssetId)) {
        addPriceIconToCard(container, numericAssetId);
    } else {
        if (!pendingCards.has(numericAssetId)) {
            pendingCards.set(numericAssetId, []);
        }
        const pendingForAsset = pendingCards.get(numericAssetId);
        if (!pendingForAsset.includes(container)) {
            pendingForAsset.push(container);
        }
    }
}

function addIcon(container, price, deadline) {
    if (container.querySelector('.rovalra-offsale-price-icon')) return;

    const assets = getAssets();
    const date = new Date(deadline);
    const hasDeadline =
        deadline && !isNaN(date.getTime()) && date.getFullYear() >= 2000;

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
        mask: `url("${assets.priceFloorIcon}") no-repeat center / contain`,
    });

    const robuxHtml = `<span class="icon-robux-16x16" style="vertical-align: middle; margin: 0 2px;"></span>${price.toLocaleString()}`;
    let tooltipText;

    if (hasDeadline) {
        const formattedDate = date.toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
        tooltipText = `${ts('previousPrice.lastOnSale')} ${formattedDate} ${ts(
            'previousPrice.for',
        )} ${robuxHtml}`;
    } else {
        tooltipText = `${ts('previousPrice.text')} ${robuxHtml}`;
    }

    addTooltip(icon, tooltipText);

    container.appendChild(icon);
}

function addTextPrice(container, price, deadline) {
    if (container.querySelector('.rovalra-previous-price-text')) return;

    const date = new Date(deadline);
    const hasDeadline =
        deadline && !isNaN(date.getTime()) && date.getFullYear() >= 2000;

    const div = document.createElement('div');
    div.className = 'rovalra-previous-price-text';
    div.style.marginTop = '5px';
    div.style.fontSize = '12px';
    div.style.color = 'var(--rovalra-secondary-text-color)';
    div.style.display = 'flex';
    div.style.alignItems = 'center';
    div.style.gap = '4px';
    div.style.flexWrap = 'wrap';

    if (hasDeadline) {
        div.appendChild(
            document.createTextNode(`${ts('previousPrice.lastOnSale')} `),
        );
        div.appendChild(createInteractiveTimestamp(deadline));
        div.appendChild(
            document.createTextNode(` ${ts('previousPrice.for')} `),
        );
    } else {
        div.appendChild(
            document.createTextNode(`${ts('previousPrice.text')} `),
        );
    }

    const robuxIcon = document.createElement('span');
    robuxIcon.className = 'icon-robux-16x16';
    div.appendChild(robuxIcon);

    const priceText = document.createElement('span');
    priceText.textContent = price.toLocaleString();
    div.appendChild(priceText);

    container.appendChild(div);
}
