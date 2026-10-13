import { observeElement } from '../../core/observer.js';
import { getPlaceIdFromUrl } from '../../core/idExtractor.js';
import { ts } from '../../core/locale/i18n.js';
import { settings } from '../../core/settings/getSettings.js';
import {
    getCatalogItemDetails,
    CATALOG_ITEM_TYPES,
} from '../../core/apis/catalog.js';

const OWNED_PRICE_ROW_CLASS = 'rovalra-owned-price-row';
const ROSEAL_PRICE_ROW_CLASS = 'roseal-price-info';
const NATIVE_PRICE_INFO_SELECTOR = '.price-container-text .price-info';
let isInitialized = false;
let isEnabled = true;

function getItemType() {
    return window.location.pathname.includes('/bundles/')
        ? CATALOG_ITEM_TYPES.BUNDLE
        : CATALOG_ITEM_TYPES.ASSET;
}

function createPriceElements(price) {
    const robuxIcon = document.createElement('span');
    robuxIcon.className = 'icon-robux-16x16';

    const priceText = document.createElement('span');
    priceText.textContent = price.toLocaleString();

    return [robuxIcon, priceText];
}

function getOriginalPrice(details, price) {
    const originalPrice = details?.discountInformation?.originalPrice;
    if (typeof originalPrice !== 'number' || !Number.isFinite(originalPrice))
        return null;
    return originalPrice > price ? originalPrice : null;
}

function isOffSaleItem(details) {
    return Boolean(
        details?.isOffSale === true ||
        details?.priceStatus === 'Off Sale' ||
        Number(details?.productSaleStatus) === 2,
    );
}

function createRow(price, originalPrice, isOffSale) {
    const row = document.createElement('div');
    row.className = `clearfix item-info-row-container ${OWNED_PRICE_ROW_CLASS}`;

    const label = document.createElement('div');
    label.className =
        'text-label text-overflow text-subheader row-label price-label';
    label.textContent = ts('ownedItemPrice.label');

    const content = document.createElement('div');
    content.className = 'price-info row-content';

    const priceValue = document.createElement('div');
    priceValue.className =
        'item-price-value icon-text-wrapper clearfix icon-robux-price-container';

    if (isOffSale) {
        const offSaleText = document.createElement('span');
        offSaleText.className = 'text-label';
        offSaleText.textContent = ts('ownedItemPrice.offSale');
        priceValue.appendChild(offSaleText);
    } else if (price === 0) {
        const freeText = document.createElement('span');
        freeText.className = 'text-robux-lg';
        freeText.textContent = ts('ownedItemPrice.free');
        priceValue.appendChild(freeText);
    } else {
        const [robuxIcon, priceText] = createPriceElements(price);
        priceText.className = 'text-robux-lg';
        priceValue.append(robuxIcon, priceText);
    }

    if (!isOffSale && originalPrice !== null) {
        const original = document.createElement('span');
        original.className = 'original-price';
        original.append(...createPriceElements(originalPrice));
        priceValue.appendChild(original);
    }

    content.appendChild(priceValue);
    row.append(label, content);

    return row;
}

function hasNativePriceInfo(priceRow) {
    return Boolean(priceRow.querySelector(NATIVE_PRICE_INFO_SELECTOR));
}

function removeRoSealPriceRows(parent) {
    parent
        .querySelectorAll(`.${ROSEAL_PRICE_ROW_CLASS}`)
        .forEach((rosealRow) => rosealRow.remove());
}

async function updateOwnedPriceRow(priceRow) {
    if (!priceRow?.parentNode) return;

    const itemId = getPlaceIdFromUrl();
    if (!itemId) return;

    const parent = priceRow.parentNode;
    const existingRow = parent.querySelector(`.${OWNED_PRICE_ROW_CLASS}`);

    if (!isEnabled) {
        existingRow?.remove();
        return;
    }

    const details = await getCatalogItemDetails(itemId, getItemType());
    if (!priceRow.isConnected || String(getPlaceIdFromUrl()) !== String(itemId))
        return;

    const price = details?.price;
    const hasPrice = typeof price === 'number' && Number.isFinite(price);

    const isOffSale = isOffSaleItem(details) || !hasPrice;

    if (!details?.owned || hasNativePriceInfo(priceRow)) {
        existingRow?.remove();
        return;
    }

    const originalPrice = isOffSale ? null : getOriginalPrice(details, price);
    const priceKey = isOffSale
        ? 'offsale'
        : `${price}|${originalPrice ?? ''}`;

    if (existingRow?.dataset.rovalraOwnedPrice === priceKey) {
        removeRoSealPriceRows(parent);
        return;
    }

    const row = createRow(price, originalPrice, isOffSale);
    row.dataset.rovalraOwnedPriceItemId = String(itemId);
    row.dataset.rovalraOwnedPrice = priceKey;

    const rosealRow = parent.querySelector(`.${ROSEAL_PRICE_ROW_CLASS}`);

    if (existingRow) {
        existingRow.replaceWith(row);
    } else if (rosealRow) {
        rosealRow.replaceWith(row);
    } else {
        parent.insertBefore(row, priceRow.nextSibling);
    }

    removeRoSealPriceRows(parent);
}

function updateCurrentItemPage() {
    const priceRow = document.querySelector('#item-details .price-row-container');
    if (priceRow) updateOwnedPriceRow(priceRow);
}

export async function init() {
    if (isInitialized) return;
    isInitialized = true;
    isEnabled = (await settings.ownedItemPriceEnabled) !== false;

    observeElement(
        '#item-details .price-row-container',
        (priceRow) => {
            updateOwnedPriceRow(priceRow);
        },
        { multiple: true },
    );

    observeElement(
        `#item-details .price-row-container ${NATIVE_PRICE_INFO_SELECTOR}`,
        (priceInfo) => {
            priceInfo
                .closest('#item-details')
                ?.querySelector(`.${OWNED_PRICE_ROW_CLASS}`)
                ?.remove();
        },
        { multiple: true },
    );

    observeElement(
        `#item-details .${ROSEAL_PRICE_ROW_CLASS}`,
        (rosealRow) => {
            if (
                isEnabled &&
                rosealRow.parentNode?.querySelector(`.${OWNED_PRICE_ROW_CLASS}`)
            ) {
                rosealRow.remove();
            }
        },
        { multiple: true },
    );

    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace !== 'local' || !changes.ownedItemPriceEnabled) return;

        isEnabled = changes.ownedItemPriceEnabled.newValue !== false;
        updateCurrentItemPage();
    });
}
