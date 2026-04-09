import { createInteractiveTimestamp } from '../../core/ui/time/time.js';
import { observeElement, observeIntersection } from '../../core/observer.js';
import { callRobloxApi } from '../../core/api.js';
import { getAuthenticatedUserId } from '../../core/user.js';
import { getAssets } from '../../core/assets.js';
import {
    getCachedRolimonsItem,
    queueRolimonsFetch,
} from '../../core/trade/itemHandler.js';
import {
    createRapDiffPill,
    createValueDiffPill,
} from '../../core/trade/ui/tradePills.js';
import { addTooltip } from '../../core/ui/tooltip.js';
import * as CacheHandler from '../../core/storage/cacheHandler.js';

let tradeData = [];
let observer = null;
let initialized = false;
let featureSettings = { tradePreviewEnabled: true };
const tradeDetailsCache = new Map();

async function fetchAndRenderTradePreview(tradeId, row) {
    if (row.querySelector('.rovalra-trade-summary')) return;

    const myUserId = await getAuthenticatedUserId();
    if (!myUserId) return;

    let storedTrade = await CacheHandler.get('trade_history', tradeId, 'local');

    let myOffer = null;
    let partnerOffer = null;

    if (Array.isArray(storedTrade)) {
        myOffer = { robux: storedTrade[0], items: storedTrade[1] };
        partnerOffer = { robux: storedTrade[2], items: storedTrade[3] };
    } else {
        let data = tradeDetailsCache.get(tradeId);
        if (!data) {
            try {
                const response = await callRobloxApi({
                    subdomain: 'trades',
                    endpoint: `/v2/trades/${tradeId}`,
                    method: 'GET',
                });
                if (response.ok) {
                    data = await response.json();
                    tradeDetailsCache.set(tradeId, data);
                }
            } catch (e) {
                return;
            }
        }

        if (!data) return;

        let rawMyOffer, rawPartnerOffer;

        if (data.participantAOffer?.user?.id === myUserId) {
            rawMyOffer = data.participantAOffer;
            rawPartnerOffer = data.participantBOffer;
        } else if (data.participantBOffer?.user?.id === myUserId) {
            rawMyOffer = data.participantBOffer;
            rawPartnerOffer = data.participantAOffer;
        } else {
            return;
        }

        const simplifyOffer = (offer) => ({
            robux: offer.robux || 0,
            items: (offer.items || []).map((item) => item.itemTarget.targetId),
        });

        myOffer = simplifyOffer(rawMyOffer);
        partnerOffer = simplifyOffer(rawPartnerOffer);

        await CacheHandler.set(
            'trade_history',
            tradeId,
            [
                myOffer.robux,
                myOffer.items,
                partnerOffer.robux,
                partnerOffer.items,
            ],
            'local',
        );
    }

    if (!row.isConnected) return;

    const assetIds = [...myOffer.items, ...partnerOffer.items];
    if (assetIds.length > 0) {
        await queueRolimonsFetch(assetIds);
    }

    if (!row.isConnected) return;

    const calculateStats = (offer) => {
        let rap = 0;
        let value = 0;

        offer.items.forEach((assetId) => {
            const roliData = getCachedRolimonsItem(assetId);

            let itemRap = 0;
            if (roliData && roliData.rap) {
                itemRap = roliData.rap;
            }

            let itemValue = itemRap;
            if (
                roliData &&
                roliData.default_price !== undefined &&
                roliData.default_price !== null
            ) {
                itemValue = roliData.default_price;
            }

            rap += itemRap;
            value += itemValue;
        });
        return { rap, value };
    };

    const myStats = calculateStats(myOffer);
    const partnerStats = calculateStats(partnerOffer);

    myStats.rap += myOffer.robux || 0;
    myStats.value += myOffer.robux || 0;
    partnerStats.rap += Math.floor((partnerOffer.robux || 0) * 0.7);
    partnerStats.value += Math.floor((partnerOffer.robux || 0) * 0.7);

    const summaryDiv = document.createElement('div');
    summaryDiv.className = 'rovalra-trade-summary';
    Object.assign(summaryDiv.style, {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: '5px',
        position: 'absolute',
        right: '9px',
        top: '65%',
        transform: 'translateY(-50%)',
    });

    const pillStyles = {
        fontWeight: '600',
        padding: '1px 6px',
        fontSize: '11px',
        height: '22px',
        lineHeight: '20px',
    };
    const iconStyles = {
        marginRight: '3px',
        zoom: '0.75',
    };

    const rapDiff = partnerStats.rap - myStats.rap;
    const rapColor = rapDiff === 0 ? '' : '#fff';

    const rapPill = createRapDiffPill(rapDiff, myStats.rap, pillStyles, {
        ...iconStyles,
        filter: rapColor,
    });
    rapPill.classList.add('rovalra-trade-preview-pill');
    summaryDiv.appendChild(rapPill);

    const valDiff = partnerStats.value - myStats.value;
    const valPill = createValueDiffPill(
        valDiff,
        myStats.value,
        pillStyles,
        iconStyles,
    );
    valPill.classList.add('rovalra-trade-preview-pill');
    summaryDiv.appendChild(valPill);

    const detailsDiv = row.querySelector('.trade-row-details');
    if (detailsDiv) {
        detailsDiv.style.position = 'relative';
        const contentContainer = detailsDiv.firstElementChild;
        if (contentContainer) {
            contentContainer.style.paddingRight = '150px';
        }
        detailsDiv.appendChild(summaryDiv);
    }
}

async function processTradeRow(row) {
    const allRows = Array.from(document.querySelectorAll('.trade-row'));
    const index = allRows.indexOf(row);

    if (index === -1 || index >= tradeData.length) {
        return;
    }

    const trade = tradeData[index];
    const dateSpan = row.querySelector('.trade-sent-date');

    if (trade) {
        row.dataset.tradeId = trade.id;
        row.dataset.createdDate = trade.created;

        const userDiv = row.querySelector('.text-lead');
        if (
            userDiv &&
            trade.user?.id &&
            !userDiv.querySelector('.rovalra-rolimons-user-link') &&
            featureSettings.tradePreviewEnabled
        ) {
            const assets = getAssets();
            const rolimonsLink = document.createElement('a');
            rolimonsLink.href = `https://www.rolimons.com/player/${trade.user.id}`;
            rolimonsLink.target = '_blank';
            rolimonsLink.className = 'rovalra-rolimons-user-link';
            rolimonsLink.addEventListener('click', (e) => e.stopPropagation());
            Object.assign(rolimonsLink.style, {
                display: 'inline-flex',
                alignItems: 'center',
                marginLeft: '6px',
                verticalAlign: 'middle',
                textDecoration: 'none',
            });
            rolimonsLink.innerHTML = `<div style="width: 16px; height: 16px; background-color: var(--rovalra-main-text-color); -webkit-mask: url('${assets.launchIcon}') center/contain no-repeat; mask: url('${assets.launchIcon}') center/contain no-repeat;"></div>`;
            addTooltip(rolimonsLink, 'Open user on Rolimons', {
                position: 'top',
            });
            userDiv.appendChild(rolimonsLink);
        }

        if (featureSettings.tradePreviewEnabled) {
            let debounceTimer;
            const cached = await CacheHandler.get(
                'trade_history',
                trade.id,
                'local',
            );

            if (cached) {
                fetchAndRenderTradePreview(trade.id, row);
            } else {
                const observerHandle = observeIntersection(row, (entry) => {
                    if (entry.isIntersecting) {
                        debounceTimer = setTimeout(() => {
                            if (row.isConnected) {
                                fetchAndRenderTradePreview(trade.id, row);
                                observerHandle.unobserve();
                            }
                        }, 500);
                    } else {
                        clearTimeout(debounceTimer);
                    }
                });
            }
        }
    }

    if (trade && dateSpan && featureSettings.tradePreviewEnabled) {
        const interactiveTimestamp = createInteractiveTimestamp(trade.created);
        dateSpan.innerHTML = '';
        dateSpan.appendChild(interactiveTimestamp);
        row.dataset.rovalraTimeProcessed = 'true';
    }
}

function onTradesData(e) {
    const response = e.detail;
    const trades = response?.data;
    if (Array.isArray(trades)) {
        if (response.previousPageCursor) {
            const existingIds = new Set(tradeData.map((t) => t.id));
            const newTrades = trades.filter((t) => !existingIds.has(t.id));
            tradeData = [...tradeData, ...newTrades];
        } else {
            tradeData = trades;
            tradeDetailsCache.clear();
            document
                .querySelectorAll('.trade-row[data-rovalra-time-processed]')
                .forEach((row) => {
                    delete row.dataset.rovalraTimeProcessed;
                });
        }

        document
            .querySelectorAll('.trade-row:not([data-rovalra-time-processed])')
            .forEach(processTradeRow);
    }
}

export function init() {
    chrome.storage.local.get(
        { tradePreviewEnabled: true },
        async (settings) => {
            featureSettings = settings;

            const path = window.location.pathname;
            if (!path.startsWith('/trades')) {
                if (observer) {
                    observer.active = false;
                    observer = null;
                }
                if (initialized) {
                    document.removeEventListener(
                        'rovalra-trades-list-response',
                        onTradesData,
                    );
                    initialized = false;
                }
                tradeData = [];
                tradeDetailsCache.clear();
                return;
            }

            if (initialized) return;
            initialized = true;

            document.addEventListener(
                'rovalra-trades-list-response',
                onTradesData,
            );

            observer = observeElement(
                '.trade-row:not([data-rovalra-time-processed])',
                processTradeRow,
                { multiple: true },
            );
        },
    );
}
