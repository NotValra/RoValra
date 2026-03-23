import { createStyledInput } from '../../core/ui/catalog/input.js';
import { observeElement, observeChildren } from '../../core/observer.js';
import {
    getCachedRolimonsItem,
    queueRolimonsFetch,
} from '../../core/trade/itemHandler.js';
import { getPlaceIdFromUrl } from '../../core/idExtractor.js';

const PAGING_COOLDOWN = 100;
const activeSearches = new WeakMap();

export function init() {
    const path = window.location.pathname;
    const isTradePage =
        path.startsWith('/trades') ||
        path.startsWith('/trade') ||
        /\/users\/\d+\/trade/.test(path);

    if (!isTradePage) return;

    observeElement(
        '.inventory-type-dropdown',
        (dropdown) => {
            if (
                dropdown.previousElementSibling?.classList.contains(
                    'rovalra-trade-search-wrapper',
                )
            ) {
                return;
            }

            const headerRow = dropdown.closest('.row');
            if (!headerRow) return;

            injectSearchInput(dropdown);
        },
        { multiple: true },
    );
}

function injectSearchInput(dropdown) {
    const { container, input } = createStyledInput({
        id: `rovalra-trade-search-${Math.random().toString(36).substr(2, 9)}`,
        label: 'Search Inventory',
    });

    container.classList.add('rovalra-trade-search-wrapper');

    container.style.display = 'inline-block';
    container.style.width = '140px';
    container.style.marginRight = '8px';
    container.style.verticalAlign = 'middle';
    container.style.float = 'right';

    dropdown.parentElement.insertBefore(container, dropdown.nextSibling);

    const panel = dropdown.closest('.trade-inventory-panel');
    if (!panel) return;

    let debounceTimeout;
    let observerDisconnect = null;
    let currentSearchQuery = '';

    const handleSearch = () => {
        const query = input.value.trim().toLowerCase();
        currentSearchQuery = query;

        if (!query) {
            if (observerDisconnect) {
                observerDisconnect();
                observerDisconnect = null;
            }
            resetToFirstPage(dropdown);
            const items = panel.querySelectorAll('.item-card');
            items.forEach((item) => (item.style.display = ''));
            return;
        }

        if (!observerDisconnect) {
            const list = panel.querySelector('.item-cards');
            if (list) {
                const obs = observeChildren(list, () => {
                    processItems(panel, currentSearchQuery, true);
                });
                observerDisconnect = obs.disconnect;
            }
        }

        processItems(panel, query, true);
    };

    input.addEventListener('input', () => {
        if (debounceTimeout) clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(handleSearch, 300);
    });
}

function resetToFirstPage(dropdown) {
    const label = dropdown.querySelector('.rbx-selection-label');
    if (!label) return;

    const currentVal = label.textContent.trim();
    const links = dropdown.querySelectorAll('.dropdown-menu li a');

    for (const link of links) {
        const textEl = link.querySelector('span') || link;
        if (textEl.textContent.trim() === currentVal) {
            link.click();
            return;
        }
    }
}

async function processItems(panel, query, allowPaging) {
    const items = Array.from(panel.querySelectorAll('.item-card'));
    const list = panel.querySelector('.item-cards');

    if (!list || items.length === 0) return;

    if (!query) {
        items.forEach((item) => (item.style.display = ''));
        return;
    }

    let visibleCount = 0;
    const idsToFetch = [];

    for (const item of items) {
        let isMatch = false;

        let assetId = item.dataset.rovalraAssetId;
        if (!assetId) {
            const link = item.querySelector('a[href*="/catalog/"]');
            if (link) {
                assetId = getPlaceIdFromUrl(link.href);
            }
        }

        const nameEl = item.querySelector('.item-card-name');
        const name = nameEl ? nameEl.textContent.toLowerCase() : '';

        if (name.includes(query)) {
            isMatch = true;
        }

        if (!isMatch && assetId) {
            const rolimons = getCachedRolimonsItem(assetId);

            if (rolimons) {
                if (
                    rolimons.acronym &&
                    rolimons.acronym.toLowerCase().includes(query)
                ) {
                    isMatch = true;
                }
                if (query === 'rare' && rolimons.is_rare) isMatch = true;
                if (query === 'projected' && rolimons.is_projected)
                    isMatch = true;
            } else {
                idsToFetch.push(assetId);
            }
        }

        if (isMatch) {
            item.style.display = '';
            visibleCount++;
        } else {
            item.style.display = 'none';
        }
    }

    if (idsToFetch.length > 0) {
        queueRolimonsFetch(idsToFetch);
    }

    if (visibleCount === 0 && allowPaging) {
        const nextButton =
            panel.querySelector('.pager-next .btn-generic-right-sm') ||
            panel.querySelector('.btn-generic-right-sm[ng-click*="next"]');

        if (
            nextButton &&
            !nextButton.hasAttribute('disabled') &&
            !nextButton.classList.contains('disabled')
        ) {
            const lastPageTime = activeSearches.get(panel) || 0;
            const now = Date.now();
            const timeSinceLast = now - lastPageTime;

            if (timeSinceLast > PAGING_COOLDOWN) {
                activeSearches.set(panel, now);
                nextButton.click();
            } else {
                const remaining = PAGING_COOLDOWN - timeSinceLast;
                setTimeout(() => {
                    if (panel.isConnected)
                        processItems(panel, query, allowPaging);
                }, remaining + 50);
            }
        }
    }
}
