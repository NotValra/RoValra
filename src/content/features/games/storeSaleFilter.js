import { observeElement } from '../../core/observer.js';
import { settings } from '../../core/settings/getSettings.js';
import { ts } from '../../core/locale/i18n.js';
import { fetchThumbnails } from '../../core/thumbnail/thumbnails.js';
import { createDropdown } from '../../core/ui/dropdown.js';
import { createPassCard, fetchAllGamePasses } from './privateGames.js';

export const STORE_SALE_FILTER_EVENT = 'rovalra-store-sale-filter-change';

const FILTER_CLASS = 'rovalra-store-sale-filter';
const CARD_CLASS = 'rovalra-offsale-pass';
const HIDDEN_ATTR = 'data-rovalra-sale-hidden';
const LIST_SELECTOR = '#rbx-game-passes #rbx-passes-container';

let observers = [];
let mode = null;
let offSalePasses = null;

export function getStoreSaleFilter() {
    return mode;
}

export function matchesSaleFilter(isForSale, filter = mode) {
    if (!filter || filter === 'all') return true;
    return filter === 'onSale' ? isForSale : !isForSale;
}

function getUniverseId() {
    const universeId = document.querySelector('#game-detail-meta-data')?.dataset
        .universeId;
    return /^\d+$/.test(universeId || '') ? universeId : null;
}

function loadOffSalePasses(universeId) {
    offSalePasses ??= fetchAllGamePasses(universeId).then((passes) =>
        passes.filter((pass) => !pass.isForSale && !pass.isOwned),
    );
    return offSalePasses;
}

function applyToNativeCard(card) {
    if (card.classList.contains(CARD_CLASS)) return;
    card.toggleAttribute(HIDDEN_ATTR, mode === 'offSale');
}

async function updatePasses(list) {
    list.querySelectorAll(':scope > li').forEach(applyToNativeCard);

    if (mode === 'onSale') {
        list.querySelectorAll(`.${CARD_CLASS}`).forEach((card) =>
            card.remove(),
        );
        return;
    }

    const universeId = getUniverseId();
    if (!universeId || list.querySelector(`.${CARD_CLASS}`)) return;

    const passes = await loadOffSalePasses(universeId);
    if (
        !list.isConnected ||
        mode === 'onSale' ||
        list.querySelector(`.${CARD_CLASS}`)
    ) {
        return;
    }

    const iconIds = passes
        .map((pass) => pass.displayIconImageAssetId)
        .filter(Boolean)
        .map((id) => ({ id }));
    const thumbnails = iconIds.length
        ? fetchThumbnails(iconIds, 'Asset', '150x150')
        : Promise.resolve(new Map());

    for (const pass of passes) {
        const card = createPassCard(pass, thumbnails);
        card.classList.add(CARD_CLASS);
        list.append(card);
    }
}

function setMode(value) {
    mode = value;
    const list = document.querySelector(LIST_SELECTOR);
    if (list) {
        updatePasses(list).catch((error) =>
            console.error('RoValra: Failed to load off-sale passes', error),
        );
    }
    document.dispatchEvent(
        new CustomEvent(STORE_SALE_FILTER_EVENT, { detail: mode }),
    );
}

function addFilter(header) {
    if (
        header.querySelector(`.${FILTER_CLASS}`) ||
        !header.parentElement?.querySelector('#rbx-passes-container')
    ) {
        return;
    }

    const dropdown = createDropdown({
        items: [
            { value: 'onSale', label: ts('storeSaleFilter.onSale') },
            { value: 'offSale', label: ts('storeSaleFilter.offSale') },
            { value: 'all', label: ts('storeSaleFilter.all') },
        ],
        initialValue: mode,
        onValueChange: setMode,
    });
    dropdown.element.classList.add(FILTER_CLASS);
    dropdown.element.title = ts('storeSaleFilter.label');
    header.append(dropdown.element);
}

export async function init() {
    observers.forEach((observer) => observer.disconnect());
    observers = [];
    offSalePasses = null;
    mode = null;

    if (
        !window.location.pathname.startsWith('/games/') ||
        !(await settings.storeSaleFilterEnabled)
    ) {
        return;
    }

    mode = 'onSale';
    observers.push(
        observeElement(
            '#rbx-game-passes .container-header > *',
            (child) => addFilter(child.parentElement),
            { multiple: true },
        ),
        observeElement(`${LIST_SELECTOR} > li`, applyToNativeCard, {
            multiple: true,
        }),
    );
}
