import { observeElement, observeChildren } from '../observer.js';
import { getPlaceIdFromUrl } from '../idExtractor.js';
import { callRobloxApiJson } from '../api.js';
import { getItemDetails } from './itemPrice.js';

export const getUniverseId = () => {
    const meta = document.getElementById('game-detail-meta-data');
    return meta ? meta.getAttribute('data-universe-id') : null;
};

const getCartItems = () => {
    const cartModal = document.querySelector('.shopping-cart-modal');
    if (!cartModal) return [];

    const cartItems = [];
    const itemContainers = cartModal.querySelectorAll('.cart-item-container');

    itemContainers.forEach((container) => {
        const link = container.querySelector(
            '.item-details-container a.item-name',
        );

        if (link) {
            const href = link.getAttribute('href');
            const match = href.match(
                /\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(catalog|bundles)\/(\d+)/i,
            );
            if (match) {
                const type =
                    match[1].toLowerCase() === 'bundles' ? 'Bundle' : 'Asset';
                cartItems.push({
                    id: match[2],
                    name: link.textContent.trim(),
                    type: type,
                });
            }
        }
    });

    return cartItems;
};

const getBatchPurchaseItems = (modal) => {
    const thumbnails = modal.querySelectorAll(
        '.modal-multi-item-image-container img',
    );
    const items = [];

    thumbnails.forEach((img) => {
        const alt = img.getAttribute('alt');
        if (alt) {
            items.push({
                name: alt.trim(),
            });
        }
    });

    return items;
};

const validateCartMatch = (modalItems, cartItems) => {
    if (modalItems.length !== cartItems.length) return false;

    const modalNames = new Set(modalItems.map((item) => item.name));
    const cartNames = new Set(cartItems.map((item) => item.name));

    for (const name of modalNames) {
        if (!cartNames.has(name)) return false;
    }

    return true;
};

let lastClickedPurchaseData = null;

export const getPurchasePromptItemInfo = async (modal) => {
    const modalWindow =
        modal.closest('.modal-window') ||
        modal.closest('.simplemodal-wrap') ||
        modal;

    if (!modalWindow) return null;

    let cartItems = getCartItems();
    const isOnGamePage = /^\/([a-z]{2}(-[a-z]{2})?\/)?games\//i.test(
        window.location.pathname,
    );

    let itemId = null;
    let isGamePass = false;
    let isBundle = false;
    let isMismatch = false;
    let itemName = null;
    let productId = null;
    let expectedPrice = null;
    let gamePassMap = null;

    if (
        lastClickedPurchaseData &&
        Date.now() - lastClickedPurchaseData.timestamp < 5000
    ) {
        productId = lastClickedPurchaseData.productId;
        expectedPrice = lastClickedPurchaseData.expectedPrice;
        itemId = lastClickedPurchaseData.itemId;
        itemName = lastClickedPurchaseData.itemName;
        isGamePass = lastClickedPurchaseData.assetType === 'Game Pass';
    }

    if (!expectedPrice && modalWindow.dataset.rovalraExpectedPrice) {
        expectedPrice = modalWindow.dataset.rovalraExpectedPrice;
    }

    const batchImages = modalWindow.querySelectorAll(
        '.modal-multi-item-image-container img',
    );
    if (batchImages.length >= 2 || cartItems.length >= 2) {
        if (cartItems.length === 0) {
            cartItems = Array.from(batchImages).map((img) => ({
                id: null,
                name: img.getAttribute('alt')?.trim() || '',
                thumbnail: img.src,
            }));
        }

        for (let i = 0; i < cartItems.length; i++) {
            if (!cartItems[i].id && cartItems[i].name) {
                const storeItems = document.querySelectorAll(
                    '.item-card, .store-card, .catalog-item-card',
                );
                for (const card of storeItems) {
                    const nameEl = card.querySelector(
                        '.item-name, .card-name, .name',
                    );
                    const linkEl = card.querySelector(
                        'a[href*="/catalog/"], a[href*="/bundles/"]',
                    );

                    if (nameEl && linkEl) {
                        const cardName = nameEl.textContent.trim();
                        if (cardName === cartItems[i].name) {
                            const href = linkEl.getAttribute('href');
                            const match = href.match(
                                /\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(catalog|bundles)\/(\d+)/i,
                            );
                            if (match) {
                                cartItems[i].id = match[2];
                                cartItems[i].type =
                                    match[1].toLowerCase() === 'bundles'
                                        ? 'Bundle'
                                        : 'Asset';
                            }
                            break;
                        }
                    }
                }
            }
        }

        const batchItemsInModal = getBatchPurchaseItems(modalWindow);
        if (batchItemsInModal.length > 0 && cartItems.length > 0) {
            isMismatch = !validateCartMatch(batchItemsInModal, cartItems);
        }

        return {
            isMultiItem: true,
            items: cartItems,
            isMismatch,
            type: 'Cart',
        };
    }

    if (cartItems.length === 1) {
        const item = cartItems[0];
        return {
            isMultiItem: false,
            itemId: item.id,
            itemType: item.type || 'Asset',
            isGamePass: false,
            isBundle: item.type === 'Bundle',
            itemName: item.name,
        };
    }

    if (isOnGamePage && !productId) {
        const modalMessage = modalWindow.querySelector('.modal-message');
        const modalItemNameEl =
            modalMessage?.querySelector('.font-bold, strong');

        const imageContainer = modalWindow.querySelector(
            '.modal-image-container[data-item-id], .roblox-item-image[data-item-id]',
        );

        const isLegacy =
            !!modalWindow.querySelector('#confirm-btn') ||
            !!modalWindow.closest('.simplemodal-container');
        if (imageContainer && !itemId && (!isOnGamePage || !isLegacy)) {
            itemId = imageContainer.getAttribute('data-item-id');
        }

        if (!itemId) {
            const idElements = [
                modalWindow,
                ...modalWindow.querySelectorAll(
                    '[data-product-id], [data-item-id], [data-asset-id], [data-rovalra-item-id]',
                ),
            ];

            for (const el of idElements) {
                const id =
                    el.dataset.rovalraItemId ||
                    el.dataset.productId ||
                    el.dataset.itemId ||
                    el.dataset.assetId;

                if (id && !isNaN(id) && id !== '0') {
                    itemId = id;
                    break;
                }
            }
        }

        if (modalItemNameEl && !itemId) {
            itemName = modalItemNameEl.textContent.trim();

            if (!itemId) {
                const storeItems = document.querySelectorAll(
                    '#store-tab .list-item .store-card, .game-passes-list .list-item',
                );
                for (const itemCard of storeItems) {
                    const cardNameEl = itemCard.querySelector(
                        '.store-card-name, .item-card-name',
                    );
                    const cardLinkEl = itemCard.querySelector(
                        'a.store-card-link, a.item-card-link',
                    );

                    if (cardNameEl && cardLinkEl) {
                        const cardItemName = (
                            cardNameEl.getAttribute('title') ||
                            cardNameEl.textContent
                        ).trim();
                        if (itemName === cardItemName) {
                            const href = cardLinkEl.getAttribute('href');
                            const match = href.match(
                                /\/(?:[a-z]{2}(-[a-z]{2})?\/)?game-pass\/(\d+)/i,
                            );
                            if (match) {
                                itemId = match[1];
                                isGamePass = true;
                                break;
                            }
                        }
                    }
                }
            }
        }

        if (isOnGamePage && itemId && !isBundle) {
            isGamePass = true;
        }
    }

    if (!itemId) {
        if (cartItems.length === 1) {
            itemId = cartItems[0].id;
            itemName = cartItems[0].name;
        } else if (!isOnGamePage) {
            itemId = getPlaceIdFromUrl(window.location.href);
        }
    }

    if (!itemId) return null;

    if (!isGamePass) {
        isGamePass = /^\/([a-z]{2}(-[a-z]{2})?\/)?game-pass\//i.test(
            window.location.pathname,
        );
        isBundle = /^\/([a-z]{2}(-[a-z]{2})?\/)?bundles\//i.test(
            window.location.pathname,
        );
    }

    const itemType = isGamePass ? 'GamePass' : isBundle ? 'Bundle' : 'Asset';

    if (itemId && !expectedPrice) {
        try {
            const details = await getItemDetails(itemId, itemType);
            if (details && details.price) {
                expectedPrice = details.price;
            }
        } catch (error) {
            console.warn('RoValra: Failed to fetch item price details', error);
        }
    }

    return {
        isMultiItem: false,
        itemId,
        itemType,
        isGamePass,
        isBundle,
        itemName,
        productId,
        expectedPrice,
    };
};

const attachItemDataToPurchasePrompt = (modal, force = false) => {
    if (
        !force &&
        (modal.getAttribute('data-rovalra-item-processed') === 'true' ||
            modal.dataset.rovalraProcessing === 'true')
    ) {
        return;
    }
    modal.dataset.rovalraProcessing = 'true';

    let attempts = 0;
    const maxAttempts = 20;

    const tryProcess = async () => {
        const itemInfo = await getPurchasePromptItemInfo(modal);

        if (!itemInfo || (!itemInfo.isMultiItem && !itemInfo.itemId)) {
            if (attempts < maxAttempts) {
                attempts++;
                setTimeout(tryProcess, 100);
                return;
            }
            delete modal.dataset.rovalraProcessing;
            return;
        }

        modal.setAttribute('data-rovalra-item-processed', 'true');
        delete modal.dataset.rovalraProcessing;

        lastClickedPurchaseData = null;

        if (itemInfo.isMultiItem) {
            modal.setAttribute('data-rovalra-purchase-type', 'cart');
            modal.setAttribute(
                'data-rovalra-item-count',
                itemInfo.items.length,
            );
            modal.setAttribute(
                'data-rovalra-cart-mismatch',
                itemInfo.isMismatch,
            );

            const itemIds = itemInfo.items.map((item) => item.id).join(',');
            modal.setAttribute('data-rovalra-cart-item-ids', itemIds);

            for (let index = 0; index < itemInfo.items.length; index++) {
                const item = itemInfo.items[index];
                modal.setAttribute(`data-rovalra-item-id-${index}`, item.id);
                if (item.type) {
                    modal.setAttribute(
                        `data-rovalra-item-type-${index}`,
                        item.type,
                    );
                }
                if (item.name) {
                    modal.setAttribute(
                        `data-rovalra-item-name-${index}`,
                        item.name,
                    );
                }

                if (item.id) {
                    try {
                        const details = await getItemDetails(
                            item.id,
                            item.type || 'Asset',
                        );
                        if (details && details.price) {
                            modal.setAttribute(
                                `data-rovalra-item-price-${index}`,
                                details.price,
                            );
                        }
                    } catch (error) {
                        console.warn(
                            `RoValra: Failed to fetch price for cart item ${item.id}`,
                            error,
                        );
                    }
                }
            }
        } else {
            modal.setAttribute('data-rovalra-purchase-type', 'single');

            if (itemInfo.itemId) {
                modal.setAttribute('data-rovalra-item-id', itemInfo.itemId);
                modal.setAttribute('data-rovalra-item-type', itemInfo.itemType);
                modal.setAttribute(
                    'data-rovalra-is-gamepass',
                    itemInfo.isGamePass,
                );
                modal.setAttribute('data-rovalra-is-bundle', itemInfo.isBundle);
            }

            if (itemInfo.itemName) {
                modal.setAttribute('data-rovalra-item-name', itemInfo.itemName);
            }
            if (itemInfo.productId) {
                modal.setAttribute(
                    'data-rovalra-product-id',
                    itemInfo.productId,
                );
            }
            if (itemInfo.expectedPrice) {
                modal.setAttribute(
                    'data-rovalra-expected-price',
                    itemInfo.expectedPrice,
                );
            }
        }

        const event = new CustomEvent('rovalraPurchasePromptReady', {
            detail: itemInfo,
            bubbles: true,
        });
        modal.dispatchEvent(event);
    };

    tryProcess();
};

export function init() {
    observeElement(
        '.modal-dialog .modal-content, .modal-content, .unified-purchase-dialog-content',
        (element) => {
            const modal =
                element.closest('.modal-content') ||
                element.closest('.unified-purchase-dialog-content');

            if (modal) {
                attachItemDataToPurchasePrompt(modal);
            }
        },
        {
            multiple: true,
        },
    );

    observeElement('#simplemodal-container', (container) => {
        observeChildren(container, () => {
            const modal = container.querySelector('.modal-content');
            if (modal) {
                if (
                    !modal.hasAttribute('data-rovalra-item-processed') &&
                    modal.dataset.rovalraProcessing !== 'true'
                ) {
                    attachItemDataToPurchasePrompt(modal);
                }
            }
        });
    });

    document.addEventListener(
        'click',
        (e) => {
            const buyButton = e.target.closest(
                '.PurchaseButton, .rbx-gear-passes-purchase, [data-product-id], .btn-buy-md, .btn-primary-md',
            );

            if (
                buyButton &&
                !buyButton.closest(
                    '.modal-dialog, .modal-content, .unified-purchase-dialog-content',
                ) &&
                (buyButton.dataset.productId || buyButton.dataset.itemId)
            ) {
                document
                    .querySelectorAll(
                        '.modal-content, .unified-purchase-dialog-content',
                    )
                    .forEach((m) => {
                        m.removeAttribute('data-rovalra-item-processed');
                        delete m.dataset.rovalraProcessing;
                        Array.from(m.attributes).forEach((attr) => {
                            if (attr.name.startsWith('data-rovalra-')) {
                                m.removeAttribute(attr.name);
                            }
                        });
                    });

                let itemId = buyButton.dataset.itemId;
                const isGamePass = buyButton.dataset.assetType === 'Game Pass';

                if (
                    isGamePass &&
                    (!itemId || itemId === buyButton.dataset.itemId)
                ) {
                    const nearbyLink = buyButton
                        .closest('.store-card, .item-card, .list-item')
                        ?.querySelector('a[href*="/game-pass/"]');
                    if (nearbyLink) {
                        const match = nearbyLink
                            .getAttribute('href')
                            .match(/\/game-pass\/(\d+)/i);
                        if (match) itemId = match[1];
                    }
                }

                lastClickedPurchaseData = {
                    productId: buyButton.dataset.productId,
                    itemId: itemId,
                    itemName: buyButton.dataset.itemName,
                    expectedPrice: buyButton.dataset.expectedPrice,
                    assetType: buyButton.dataset.assetType,
                    sellerId: buyButton.dataset.expectedSellerId,
                    sellerName: buyButton.dataset.sellerName,
                    currency: buyButton.dataset.expectedCurrency,
                    timestamp: Date.now(),
                };

                document.documentElement.setAttribute(
                    'data-rovalra-last-purchase-product-id',
                    buyButton.dataset.productId,
                );
                document.documentElement.setAttribute(
                    'data-rovalra-last-purchase-price',
                    buyButton.dataset.expectedPrice,
                );
                document.documentElement.setAttribute(
                    'data-rovalra-last-purchase-item-id',
                    buyButton.dataset.itemId,
                );
            }
        },
        true,
    );

    console.log(
        '%cRoValra Purchase Prompt Item Detector initialized',
        'color: #FF4500;',
    );
}
