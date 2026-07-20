import { createInteractiveTimestamp } from '../../core/ui/time/time.js';
import { observeElement, observeIntersection } from '../../core/observer.js';
import { getAuthenticatedUserId } from '../../core/user.js';
import { getAssets } from '../../core/assets.js';
import { getTradeAnalysis } from '../../core/trade/tradeDetailsHandler.js';
import {
    createRapDiffPill,
    createValueDiffPill,
} from '../../core/trade/ui/tradePills.js';
import { addTooltip } from '../../core/ui/tooltip.js';

let tradeData = [];
let observer = null;
let initialized = false;
let featureSettings = { tradePreviewEnabled: true };

async function fetchAndRenderTradePreview(tradeId, row) {
    if (row.querySelector('.rovalra-trade-summary')) return;

    const myUserId = await getAuthenticatedUserId();
    if (!myUserId) return;

    const analysis = await getTradeAnalysis(tradeId, { myUserId }).catch(
        () => null,
    );
    if (!analysis || !row.isConnected) return;

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

    const rapDiff = analysis.comparison.rapDiff;
    const rapColor = rapDiff === 0 ? '' : '#fff';

    const rapPill = createRapDiffPill(
        rapDiff,
        analysis.comparison.myRap,
        pillStyles,
        {
            ...iconStyles,
            filter: rapColor,
        },
    );
    rapPill.classList.add('rovalra-trade-preview-pill');
    summaryDiv.appendChild(rapPill);

    const valDiff = analysis.comparison.valueDiff;
    const valPill = createValueDiffPill(
        valDiff,
        analysis.comparison.myValue,
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
