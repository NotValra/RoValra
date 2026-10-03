import { observeElement } from '../../core/observer.js';
import { getAuthenticatedUserId } from '../../core/user.js';
import { getPlaceIdFromUrl } from '../../core/idExtractor.js';
import { getQueuedThumbnail } from '../../core/thumbnail/thumbnails.js';
import { addTooltip } from '../../core/ui/tooltip.js';
import { ts } from '../../core/locale/i18n.js';
import { settings } from '../../core/settings/getSettings.js';

const STORAGE_KEY = 'rovalra_trade_recent_items';
const MAX_ITEMS = 12;
const SIDES = ['offer', 'request'];
const SELECT_CONFIRM_DELAY = 400;
const SEARCH_TIMEOUT = 4000;

let initialized = false;

async function loadHistory() {
    const userId = await getAuthenticatedUserId();
    if (!userId) return { userId: null, history: { offer: [], request: [] } };

    const result = await chrome.storage.local.get(STORAGE_KEY);
    const saved = result[STORAGE_KEY]?.[userId] || {};
    return {
        userId,
        history: { offer: saved.offer || [], request: saved.request || [] },
    };
}

async function saveHistory(userId, history) {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const all = result[STORAGE_KEY] || {};
    all[userId] = history;
    await chrome.storage.local.set({ [STORAGE_KEY]: all });
}

function getPanelSide(panel) {
    const panels = [...document.querySelectorAll('.trade-inventory-panel')];
    return SIDES[panels.indexOf(panel)] || null;
}

function readCard(card) {
    const link = card.querySelector(
        'a[href*="/catalog/"], a[href*="/bundles/"]',
    );
    const id =
        card.querySelector('[data-rovalra-asset-id]')?.dataset.rovalraAssetId ||
        (link ? getPlaceIdFromUrl(link.href) : null);
    const name = card.querySelector('.item-card-name')?.textContent.trim();
    if (!id || !name) return null;

    return {
        id: String(id),
        name,
        itemType: link?.href.includes('/bundles/') ? 'Bundle' : 'Asset',
    };
}

let historyQueue = Promise.resolve();

function updateHistory(update) {
    historyQueue = historyQueue
        .then(async () => {
            const { userId, history } = await loadHistory();
            if (!userId) return;

            update(history);
            await saveHistory(userId, history);
            renderAll(history);
        })
        .catch(() => {});
    return historyQueue;
}

function rememberItem(side, item) {
    return updateHistory((history) => {
        history[side] = [
            { ...item, usedAt: Date.now() },
            ...history[side].filter((entry) => entry.id !== item.id),
        ].slice(0, MAX_ITEMS);
    });
}

function forgetSide(side) {
    return updateHistory((history) => {
        history[side] = [];
    });
}

function onInventoryClick(event) {
    const card = event.target.closest?.('.trade-inventory-card');
    if (!card || card.classList.contains('is-unavailable')) return;

    const side = getPanelSide(card.closest('.trade-inventory-panel'));
    const item = readCard(card);
    if (!side || !item) return;

    setTimeout(() => {
        if (card.classList.contains('is-unavailable')) {
            rememberItem(side, item);
        }
    }, SELECT_CONFIRM_DELAY);
}

function findCard(panel, id) {
    return [
        ...panel.querySelectorAll('.trade-inventory-card:not(.is-unavailable)'),
    ].find((card) => readCard(card)?.id === id);
}

function waitFor(check, timeout) {
    return new Promise((resolve) => {
        const start = Date.now();
        const poll = () => {
            const result = check();
            if (result || Date.now() - start >= timeout) {
                resolve(result || null);
                return;
            }
            setTimeout(poll, 100);
        };
        poll();
    });
}

function setInputValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
    ).set;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

async function openSearch(panel) {
    const existing = panel.querySelector('.inventory-search input');
    if (existing) return existing;

    panel.querySelector('.inventory-search button')?.click();
    return waitFor(() => panel.querySelector('.inventory-search input'), 1000);
}

async function selectItem(panel, item, chip) {
    if (chip.classList.contains('loading')) return;
    chip.classList.add('loading');
    chip.classList.remove('missing');

    let card = findCard(panel, item.id);
    let searchInput = null;

    if (!card) {
        searchInput = await openSearch(panel);
        if (searchInput) {
            setInputValue(searchInput, item.name);
            card = await waitFor(
                () => findCard(panel, item.id),
                SEARCH_TIMEOUT,
            );
        }
    }

    if (card) {
        card.querySelector('.item-card-thumb-container')?.click();
    } else {
        chip.classList.add('missing');
    }

    if (searchInput && card) {
        setTimeout(() => setInputValue(searchInput, ''), SELECT_CONFIRM_DELAY);
    }

    chip.classList.remove('loading');
}

function createChip(panel, item) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'rovalra-trade-recent-chip';

    const thumb = document.createElement('img');
    thumb.alt = '';
    chip.appendChild(thumb);

    const name = document.createElement('span');
    name.className = 'text-caption-medium';
    name.textContent = item.name;
    chip.appendChild(name);

    getQueuedThumbnail(
        item.id,
        item.itemType === 'Bundle' ? 'BundleThumbnail' : 'Asset',
        '150x150',
    ).then((data) => {
        if (data?.imageUrl) thumb.src = data.imageUrl;
    });

    addTooltip(chip, item.name, { position: 'top' });
    chip.addEventListener('click', () => selectItem(panel, item, chip));
    return chip;
}

function renderBar(panel, items) {
    const side = getPanelSide(panel);
    if (!side) return;

    let bar = panel.querySelector('.rovalra-trade-recent');
    if (!items.length) {
        bar?.remove();
        return;
    }

    if (!bar) {
        bar = document.createElement('div');
        bar.className = 'rovalra-trade-recent';

        const header = document.createElement('div');
        header.className = 'rovalra-trade-recent-header';

        const title = document.createElement('span');
        title.className = 'text-label-medium';
        title.textContent = ts(`tradeRecentItems.${side}`);
        header.appendChild(title);

        const clear = document.createElement('button');
        clear.type = 'button';
        clear.className = 'rovalra-trade-recent-clear text-caption-medium';
        clear.textContent = ts('tradeRecentItems.clear');
        clear.addEventListener('click', () => forgetSide(side));
        header.appendChild(clear);

        const list = document.createElement('div');
        list.className = 'rovalra-trade-recent-list';

        bar.append(header, list);

        const filterRow = panel.querySelector('.inventory-filter-row');
        if (filterRow) {
            panel.insertBefore(bar, filterRow.nextSibling);
        } else {
            panel.appendChild(bar);
        }
    }

    const list = bar.querySelector('.rovalra-trade-recent-list');
    list.replaceChildren(...items.map((item) => createChip(panel, item)));
}

function renderAll(history) {
    document.querySelectorAll('.trade-inventory-panel').forEach((panel) => {
        const side = getPanelSide(panel);
        if (side) renderBar(panel, history[side]);
    });
}

export async function init() {
    if (initialized || !(await settings.tradeRecentItemsEnabled)) return;
    initialized = true;

    document.addEventListener('click', onInventoryClick, true);

    observeElement(
        '.trade-inventory-panel',
        async () => {
            const { history } = await loadHistory();
            renderAll(history);
        },
        { multiple: true },
    );
}
