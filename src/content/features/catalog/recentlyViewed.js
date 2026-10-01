import { observeElement } from '../../core/observer.js';
import { getPlaceIdFromUrl } from '../../core/idExtractor.js';
import { getCatalogItemDetails } from '../../core/apis/catalog.js';
import { getAuthenticatedUserId } from '../../core/user.js';
import { createItemCard } from '../../core/ui/items/items.js';
import { createButton } from '../../core/ui/buttons.js';
import { Icon } from '../../core/ui/buildericon.js';
import { safeHtml } from '../../core/packages/dompurify.js';
import { addTooltip } from '../../core/ui/tooltip.js';
import { ts } from '../../core/locale/i18n.js';
import { settings } from '../../core/settings/getSettings.js';

const STORAGE_KEY = 'rovalra_recently_viewed';
const MAX_ITEMS = 24;
const ITEM_PAGE_REGEX =
    /^(?:\/[a-z]{2}(?:-[a-z]{2})?)?\/(catalog|bundles)\/\d+/i;
const ROSEAL_VIEW_SELECTOR = '#roseal-main-view';
const LANDING_PAGE_REGEX = /^(?:\/[a-z]{2}(?:-[a-z]{2})?)?\/catalog\/?$/i;

async function loadHistory() {
    const userId = await getAuthenticatedUserId();
    if (!userId) return { userId: null, items: [] };

    const result = await chrome.storage.local.get(STORAGE_KEY);
    return { userId, items: result[STORAGE_KEY]?.[userId] || [] };
}

async function saveHistory(userId, items) {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const all = result[STORAGE_KEY] || {};
    all[userId] = items;
    await chrome.storage.local.set({ [STORAGE_KEY]: all });
}

function getPrice(details) {
    if (!details || details.priceStatus === 'Off Sale') return null;
    return details.lowestPrice ?? details.price ?? null;
}

async function recordView() {
    const id = getPlaceIdFromUrl();
    if (!id) return;

    const itemType = window.location.pathname.includes('/bundles/')
        ? 'Bundle'
        : 'Asset';
    const details = await getCatalogItemDetails(id, itemType);
    if (!details) return;

    const { userId, items } = await loadHistory();
    if (!userId) return;

    const entry = {
        id: String(id),
        itemType,
        price: getPrice(details),
        viewedAt: Date.now(),
    };

    const next = [
        entry,
        ...items.filter(
            (item) => !(item.id === entry.id && item.itemType === itemType),
        ),
    ].slice(0, MAX_ITEMS);

    await saveHistory(userId, next);
}

function getPriceChange(entry, details) {
    const now = getPrice(details);
    if (entry.price === null && now !== null)
        return { type: 'backOnSale', text: ts('recentlyViewed.backOnSale') };
    if (entry.price !== null && now === null)
        return { type: 'offSale', text: ts('recentlyViewed.offSale') };
    if (entry.price === null || now === entry.price) return null;

    const diff = Math.abs(now - entry.price).toLocaleString();
    return now < entry.price
        ? {
              type: 'cheaper',
              text: ts('recentlyViewed.cheaper', { value: diff }),
          }
        : {
              type: 'pricier',
              text: ts('recentlyViewed.pricier', { value: diff }),
          };
}

function applyPriceChange(wrapper) {
    const price = wrapper?.querySelector(
        '.rovalra-item-card-link .rovalra-item-rap',
    );
    const type = wrapper?.dataset.priceChange;
    if (!price || !type || price.dataset.rovalraPriceChange === type) return;

    price.dataset.rovalraPriceChange = type;
    price.classList.remove('cheaper', 'pricier', 'offSale', 'backOnSale');
    price.classList.add('rovalra-recently-viewed-price', type);
    price.querySelector('.rovalra-recently-viewed-arrow')?.remove();
    if (type === 'cheaper' || type === 'pricier') {
        const arrow = document.createElement('span');
        arrow.className = 'rovalra-recently-viewed-arrow';
        arrow.textContent = type === 'cheaper' ? '↓' : '↑';
        price.prepend(arrow);
    }

    if (!price.dataset.rovalraPriceTooltip) {
        price.dataset.rovalraPriceTooltip = 'true';
        addTooltip(price, () => wrapper.dataset.priceChangeText || '', {
            position: 'top',
            shouldShow: () => Boolean(wrapper.dataset.priceChange),
        });
    }
}

function createEntry(entry, onRemove) {
    const wrapper = document.createElement('div');
    wrapper.className = 'rovalra-recently-viewed-item';
    wrapper.dataset.itemId = entry.id;
    wrapper.dataset.itemType = entry.itemType;

    wrapper.appendChild(
        createItemCard(entry.id, {
            itemType: entry.itemType,
            cardStyles: { width: '150px' },
        }),
    );

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'rovalra-recently-viewed-remove';
    removeButton.setAttribute('aria-label', ts('recentlyViewed.remove'));
    removeButton.title = ts('recentlyViewed.remove');
    const icon = Icon({ icon: 'close', material: true, size: 'medium' });
    icon.setAttribute('aria-hidden', 'true');
    removeButton.append(icon);
    removeButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onRemove(entry);
    });
    wrapper.appendChild(removeButton);

    return wrapper;
}

let landingObserverRegistered = false;
let priceTrackingRegistered = false;
let rendering = false;
let priceEntries = new Map();

function entrySelector(entry) {
    return `.rovalra-recently-viewed-item[data-item-id="${entry.id}"][data-item-type="${entry.itemType}"]`;
}

function registerPriceTracking() {
    if (priceTrackingRegistered) return;
    priceTrackingRegistered = true;

    window.addEventListener('rovalra-catalog-details', (event) => {
        const list = document.querySelector('.rovalra-recently-viewed-list');
        if (!list) return;

        for (const details of event.detail?.data || []) {
            const entry = priceEntries.get(`${details.itemType}:${details.id}`);
            if (!entry) continue;

            const change = getPriceChange(entry, details);
            const wrapper = list.querySelector(entrySelector(entry));
            if (!change || !wrapper) continue;

            wrapper.dataset.priceChange = change.type;
            wrapper.dataset.priceChangeText = change.text;
            applyPriceChange(wrapper);
        }
    });
    observeElement(
        '.rovalra-recently-viewed-item .rovalra-item-card-link .rovalra-item-rap',
        (price) =>
            applyPriceChange(price.closest('.rovalra-recently-viewed-item')),
        { multiple: true },
    );
}

function getAnchor() {
    return (
        document.querySelector(ROSEAL_VIEW_SELECTOR) ||
        document.querySelector('.catalog-results')
    );
}

function placeRow() {
    const row = document.querySelector('.rovalra-recently-viewed');
    const anchor = getAnchor();
    if (row && anchor && row.nextElementSibling !== anchor) anchor.before(row);
}

function isRowNeeded() {
    return (
        Boolean(getAnchor()) &&
        LANDING_PAGE_REGEX.test(window.location.pathname) &&
        !document.querySelector('.rovalra-recently-viewed')
    );
}

async function renderRow() {
    if (rendering || !isRowNeeded()) return;
    rendering = true;

    try {
        const showPriceChanges = await settings.recentlyViewedPriceChanges;
        let { userId, items } = await loadHistory();
        if (!userId || items.length === 0 || !isRowNeeded()) return;

        const row = document.createElement('div');
        row.className = 'rovalra-recently-viewed';
        row.innerHTML = safeHtml`
            <div class="rovalra-recently-viewed-header">
                <h2 class="text-heading-small">${ts('recentlyViewed.title')}</h2>
            </div>
            <div class="rovalra-recently-viewed-list"></div>
        `;
        const header = row.querySelector('.rovalra-recently-viewed-header');
        const list = row.querySelector('.rovalra-recently-viewed-list');

        const remove = async (entry) => {
            items = items.filter(
                (item) =>
                    !(item.id === entry.id && item.itemType === entry.itemType),
            );
            await saveHistory(userId, items);
            list.querySelector(entrySelector(entry))?.remove();
            if (items.length === 0) row.remove();
        };

        header.appendChild(
            createButton(ts('recentlyViewed.clear'), 'secondary', {
                onClick: async () => {
                    items = [];
                    await saveHistory(userId, items);
                    row.remove();
                },
            }),
        );

        priceEntries = showPriceChanges
            ? new Map(
                  items.map((item) => [`${item.itemType}:${item.id}`, item]),
              )
            : new Map();
        if (showPriceChanges) registerPriceTracking();

        items.forEach((entry) => list.appendChild(createEntry(entry, remove)));
        getAnchor().before(row);
    } finally {
        rendering = false;
    }
}

export async function init() {
    if (!(await settings.recentlyViewedEnabled)) return;

    const path = window.location.pathname;

    if (ITEM_PAGE_REGEX.test(path)) {
        recordView();
        return;
    }

    if (LANDING_PAGE_REGEX.test(path) && !landingObserverRegistered) {
        landingObserverRegistered = true;
        const onAnchorChange = () => {
            placeRow();
            renderRow();
        };
        observeElement('.catalog-results', onAnchorChange);
        observeElement(ROSEAL_VIEW_SELECTOR, onAnchorChange, {
            onRemove: placeRow,
        });
    }
}
