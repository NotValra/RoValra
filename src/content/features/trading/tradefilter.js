import { createStyledInput } from '../../core/ui/catalog/input.js';
import { observeElement } from '../../core/observer.js';
import { callRobloxApi } from '../../core/api.js';
import { getAuthenticatedUserId } from '../../core/user.js';
import {
    getCachedRolimonsItem,
    queueRolimonsFetch,
} from '../../core/trade/itemHandler.js';

let historyLoaded = false;
let tradeHistory = {};
const HISTORY_KEY = 'rovalra_trade_history';
let myUserId = null;
let currentQuery = '';
let debounceTimeout = null;

async function loadHistory() {
    if (historyLoaded) return;
    try {
        const result = await chrome.storage.local.get(HISTORY_KEY);
        tradeHistory = result[HISTORY_KEY] || {};
        historyLoaded = true;
    } catch (e) {
        console.warn('[RoValra] Failed to load trade history in filter', e);
    }
}

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[HISTORY_KEY]) {
        tradeHistory = changes[HISTORY_KEY].newValue || {};
        historyLoaded = true;
        if (currentQuery) {
            filterTrades(currentQuery);
        }
    }
});

document.addEventListener('rovalra-rolimons-data-update', () => {
    if (currentQuery) {
        filterTrades(currentQuery);
    }
});

export async function init() {
    const settings = await chrome.storage.local.get({
        tradeFilterEnabled: true,
    });
    if (!settings.tradeFilterEnabled) return;

    const path = window.location.pathname;
    if (!path.startsWith('/trades')) return;

    myUserId = await getAuthenticatedUserId();
    await loadHistory();

    observeElement('.trade-row-list', (list) => {
        if (list.querySelector('.rovalra-trade-filter-wrapper')) return;

        const scrollContainer = list.querySelector(
            '#trade-row-scroll-container',
        );
        if (!scrollContainer) return;

        const wrapper = document.createElement('div');
        wrapper.className = 'rovalra-trade-filter-wrapper';
        wrapper.style.padding = '10px 12px';
        wrapper.style.marginBottom = '5px';

        const { container, input } = createStyledInput({
            id: 'rovalra-trade-filter-input',
            label: 'Filter Trades',
        });

        container.style.width = '100%';

        input.addEventListener('input', (e) => {
            currentQuery = e.target.value.trim().toLowerCase();

            if (debounceTimeout) clearTimeout(debounceTimeout);
            debounceTimeout = setTimeout(() => {
                filterTrades(currentQuery);
            }, 300);
        });

        wrapper.appendChild(container);

        const noResults = document.createElement('div');
        noResults.id = 'rovalra-trade-filter-no-results';
        noResults.innerText = 'No results found';
        noResults.className = 'text-secondary';
        noResults.style.display = 'none';
        noResults.style.textAlign = 'center';
        noResults.style.marginTop = '8px';
        wrapper.appendChild(noResults);

        list.insertBefore(wrapper, scrollContainer);
    });
}

async function getTradeDetails(tradeId) {
    if (tradeHistory[myUserId] && tradeHistory[myUserId][tradeId]) {
        const trade = tradeHistory[myUserId][tradeId];
        const allItems = [...trade.myOffer.items, ...trade.partnerOffer.items];
        return { items: allItems };
    }

    try {
        const response = await callRobloxApi({
            subdomain: 'trades',
            endpoint: `/v2/trades/${tradeId}`,
            method: 'GET',
        });

        if (!response.ok) return null;

        const data = await response.json();

        const simplifyOffer = (offer) => ({
            robux: offer.robux || 0,
            items: (offer.items || []).map((item) => item.itemTarget.targetId),
        });

        let myOffer, partnerOffer;

        if (data.participantAOffer?.user?.id === myUserId) {
            myOffer = simplifyOffer(data.participantAOffer);
            partnerOffer = simplifyOffer(data.participantBOffer);
        } else if (data.participantBOffer?.user?.id === myUserId) {
            myOffer = simplifyOffer(data.participantBOffer);
            partnerOffer = simplifyOffer(data.participantAOffer);
        } else {
            return null;
        }

        if (!tradeHistory[myUserId]) tradeHistory[myUserId] = {};
        tradeHistory[myUserId][tradeId] = { myOffer, partnerOffer };

        chrome.storage.local.set({ [HISTORY_KEY]: tradeHistory });

        const allItems = [...myOffer.items, ...partnerOffer.items];
        return { items: allItems };
    } catch (e) {
        console.error('RoValra: Failed to fetch trade details for filter', e);
        return null;
    }
}

async function filterTrades(query) {
    const rows = document.querySelectorAll('.trade-row');
    const noResultsMsg = document.getElementById(
        'rovalra-trade-filter-no-results',
    );
    if (!rows.length) return;

    if (!query) {
        rows.forEach((row) => (row.style.display = ''));
        if (noResultsMsg) noResultsMsg.style.display = 'none';
        return;
    }

    const processRow = async (row) => {
        const tradeId = row.dataset.tradeId;
        if (!tradeId) return;

        const details = await getTradeDetails(tradeId);

        if (!details) {
            return;
        }

        let isMatch = false;
        const idsToFetch = [];
        const isProjectedSearch = query === 'projected';
        const isRareSearch = query === 'rares' || query === 'rare';

        for (const assetId of details.items) {
            const rolimons = getCachedRolimonsItem(assetId);
            if (!rolimons) {
                idsToFetch.push(assetId);
                continue;
            }

            if (isProjectedSearch) {
                if (rolimons.is_projected) {
                    isMatch = true;
                    break;
                }
            } else if (isRareSearch) {
                if (rolimons.is_rare) {
                    isMatch = true;
                    break;
                }
            } else {
                const name = rolimons.name || '';
                const acronym = rolimons.acronym || '';

                if (
                    name.toLowerCase().includes(query) ||
                    acronym.toLowerCase().includes(query)
                ) {
                    isMatch = true;
                    break;
                }
            }
        }

        if (idsToFetch.length > 0) {
            queueRolimonsFetch(idsToFetch);
        }

        if (isMatch) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    };

    await Promise.all(Array.from(rows).map(processRow));

    if (noResultsMsg) {
        const hasVisible = Array.from(rows).some(
            (row) => row.style.display !== 'none',
        );
        noResultsMsg.style.display = hasVisible ? 'none' : 'block';
    }
}
