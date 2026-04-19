import {
    observeElement,
    observeChildren,
    observeAttributes,
} from '../../core/observer.js';
import { createRadioButton } from '../../core/ui/general/radio.js';
import { addTooltip } from '../../core/ui/tooltip.js';
import { getAssets } from '../../core/assets.js';
import { getPlaceIdFromUrl } from '../../core/idExtractor.js';
import {
    getCachedItemValue,
    getCachedRolimonsItem,
    getCachedRisk,
    queueRolimonsFetch,
    queueRiskFetch,
} from '../../core/trade/itemHandler.js';
import { RISK_COLORS } from '../../core/trade/riskCalculator.js';
import {
    createRapDiffPill,
    createValueDiffPill,
} from '../../core/trade/ui/tradePills.js';
import * as CacheHandler from '../../core/storage/cacheHandler.js';
import { cleanPrice } from '../../core/utils/priceCleaner.js';

let cardObserverRequest = null;
let summaryObserverRequest = null;
let robuxObserverRequest = null;
let dividerObserverRequest = null;
let updateSummaryTimeout = null;
const pendingCards = new Map();
let featureSettings = {
    tradeValuesEnabled: true,
    tradeRiskEnabled: true,
    tradeShowItemValues: true,
    tradeShowProjectedIndicator: true,
    tradeShowRareIndicator: true,
    tradeShowItemInfo: true,
    tradeShowTotalValue: true,
    tradeShowTotalDemand: true,
    tradeShowDiffPills: true,
};
let includeRobuxInCalculation = true;

export function init() {
    chrome.storage.local.get(
        {
            tradeValuesEnabled: true,
            tradeRiskEnabled: true,
            tradeShowItemValues: true,
            tradeShowProjectedIndicator: true,
            tradeShowRareIndicator: true,
            tradeShowItemInfo: true,
            tradeShowTotalValue: true,
            tradeShowTotalDemand: true,
            tradeShowDiffPills: true,
        },
        (settings) => {
            featureSettings = settings;
            if (!featureSettings.tradeValuesEnabled) return;

            const path = window.location.pathname;
            const isTradePage =
                path.startsWith('/trades') ||
                path.startsWith('/trade') ||
                /\/users\/\d+\/trade/.test(path);

            if (!isTradePage) {
                if (cardObserverRequest) {
                    cardObserverRequest.active = false;
                    cardObserverRequest = null;
                }
                if (robuxObserverRequest) {
                    robuxObserverRequest.active = false;
                    robuxObserverRequest = null;
                }
                if (summaryObserverRequest) {
                    summaryObserverRequest.active = false;
                    summaryObserverRequest = null;
                }
                if (dividerObserverRequest) {
                    dividerObserverRequest.active = false;
                    dividerObserverRequest = null;
                }
                document.removeEventListener(
                    'rovalra-rolimons-data-update',
                    onRolimonsUpdate,
                );
                document.removeEventListener(
                    'rovalra-risk-data-update',
                    onRiskUpdate,
                );
                pendingCards.clear();
                if (updateSummaryTimeout) clearTimeout(updateSummaryTimeout);
                return;
            }

            if (cardObserverRequest) return;

            document.addEventListener(
                'rovalra-rolimons-data-update',
                onRolimonsUpdate,
            );
            document.addEventListener('rovalra-risk-data-update', onRiskUpdate);
            initTradeSummary();

            dividerObserverRequest = observeElement(
                '.trade-request-window-offers .rbx-divider',
                (divider) => {
                    divider.style.setProperty(
                        'margin',
                        '24px 0px',
                        'important',
                    );
                },
            );

            cardObserverRequest = observeElement(
                '.item-card-container, .trade-request-item',
                (card) => {
                    if (card.dataset.rovalraProcessed) return;

                    let assetId;
                    if (card.classList.contains('trade-request-item')) {
                        if (
                            card.classList.contains('blank-item') ||
                            !card.hasAttribute('data-collectibleiteminstanceid')
                        )
                            return;
                        const instanceId = card.getAttribute(
                            'data-collectibleiteminstanceid',
                        );
                        const cached = getCachedItemValue(instanceId);
                        if (cached && cached.assetId) {
                            assetId = cached.assetId;
                        } else {
                            const link = card.querySelector(
                                'a[href*="/catalog/"]',
                            );
                            if (link) assetId = getPlaceIdFromUrl(link.href);
                        }
                    } else {
                        const link = card.querySelector('a[href*="/catalog/"]');
                        if (!link) return;
                        assetId = getPlaceIdFromUrl(link.href);
                    }
                    if (!assetId) return;

                    card.dataset.rovalraProcessed = 'true';
                    card.dataset.rovalraAssetId = assetId;

                    const cached = getCachedRolimonsItem(assetId);
                    if (cached) {
                        updateItemCard(card, assetId);
                    } else {
                        if (!pendingCards.has(assetId)) {
                            pendingCards.set(assetId, new Set());
                        }
                        pendingCards.get(assetId).add(card);
                        queueRolimonsFetch(assetId);
                    }

                    const riskCached = getCachedRisk(assetId);
                    if (!riskCached && featureSettings.tradeRiskEnabled) {
                        queueRiskFetch(assetId);
                    } else {
                        updateItemCard(card, assetId);
                    }
                    queueUpdateTradeSummary();
                },
                { multiple: true, onRemove: () => queueUpdateTradeSummary() },
            );

            robuxObserverRequest = observeElement(
                '.robux-line',
                (line) => {
                    observeAttributes(line, () => {
                        if (robuxObserverRequest?.active)
                            queueUpdateTradeSummary();
                    }, ['class']);
                    queueUpdateTradeSummary();
                },
                { multiple: true },
            );
        },
    );
}

function onRolimonsUpdate(e) {
    const updatedIds = e.detail;
    if (!Array.isArray(updatedIds)) return;

    updatedIds.forEach((id) => {
        if (pendingCards.has(id)) {
            const cards = pendingCards.get(id);
            cards.forEach((card) => updateItemCard(card, id));
            pendingCards.delete(id);
        }
    });
    queueUpdateTradeSummary();
}

function onRiskUpdate(e) {
    const updatedIds = e.detail;
    if (!Array.isArray(updatedIds)) return;
    updatedIds.forEach((id) => {
        const cards = document.querySelectorAll(
            `.item-card-container[data-rovalra-asset-id="${id}"], .trade-request-item[data-rovalra-asset-id="${id}"]`,
        );
        cards.forEach((card) => updateItemCard(card, id));
    });
}
// turns english into numbers so we can add locale support
function getTrendValue(trendStr) {
    const map = {
        None: -1,
        Lowering: 0,
        Unstable: 1,
        Stable: 2,
        Raising: 3,
        Fluctuating: 4,
    };
    return map[trendStr] !== undefined ? map[trendStr] : -2;
}

function getTrendString(trendValue) {
    const stringMap = {
        '-1': 'None',
        0: 'Lowering',
        1: 'Unstable',
        2: 'Stable',
        3: 'Raising',
        4: 'Fluctuating',
    };
    return stringMap[trendValue] || 'Unknown';
}

export function updateItemCard(card, assetId, options = {}) {
    const data = getCachedRolimonsItem(assetId);
    if (!data) return;

    const assets = getAssets();
    const value = data.default_price || data.rap || 0;
    const textColor = options.fontColor || 'var(--rovalra-main-text-color)';

    if (featureSettings.tradeShowItemValues) {
        const priceDiv = card.querySelector(
            '.item-card-price, .rovalra-item-rap',
        );
        if (card.classList.contains('trade-request-item')) {
            const itemValueDiv = card.querySelector('.item-value');
            if (itemValueDiv) {
                itemValueDiv.style.display = 'flex';
                itemValueDiv.style.alignItems = 'center';
                itemValueDiv.style.justifyContent = 'center';
                itemValueDiv.style.gap = '6px';
                if (!itemValueDiv.querySelector('.rovalra-value-label')) {
                    const valDiv = document.createElement('div');
                    valDiv.className = 'rovalra-value-label';
                    valDiv.style.display = 'flex';
                    valDiv.style.alignItems = 'center';
                    valDiv.style.marginTop = '0px';
                    valDiv.innerHTML = `
                        <img src="${assets.rolimonsIcon}" style="width: 14px; height: 14px; margin-right: 4px;">
                        <span class="text-robux" style="font-weight: 600;">${value.toLocaleString()}</span>
                    `; //Verified
                    itemValueDiv.appendChild(valDiv);
                }
            } else if (!card.querySelector('.rovalra-value-label')) {
                const valDiv = document.createElement('div');
                valDiv.className = 'rovalra-value-label';
                Object.assign(valDiv.style, {
                    position: 'absolute',
                    bottom: '0',
                    left: '0',
                    width: '100%',
                    textAlign: 'center',
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    color: '#fff',
                    fontSize: '10px',
                    padding: '2px 0',
                    zIndex: '5',
                });
                valDiv.innerHTML = `
                    <img src="${assets.rolimonsIcon}" style="width: 10px; height: 10px; margin-right: 2px; vertical-align: middle;">
                    ${value.toLocaleString()}
                `; // Verified
                card.style.position = 'relative';
                card.appendChild(valDiv);
            }
        } else if (priceDiv && !card.querySelector('.rovalra-value-label')) {
            const valDiv = document.createElement('div');
            valDiv.className =
                'text-overflow item-card-price rovalra-value-label';
            valDiv.style.marginTop = '-1px';
            valDiv.style.display = 'flex';
            valDiv.style.alignItems = 'center';

            valDiv.innerHTML = `
                <img src="${assets.rolimonsIcon}" style="width: 16px; height: 16px; margin-right: 7px; margin-left: 1px">
                <span class="text-robux" style="color: ${textColor};${options.fontSize ? ` font-size: ${options.fontSize};` : ''}">${value.toLocaleString()}</span>
            `; // verified

            if (!priceDiv.closest('a') || options.forceLink) {
                let rolimonsLink;
                if (options.forceLink) {
                    rolimonsLink = document.createElement('span');
                    rolimonsLink.style.cursor = 'pointer';
                    rolimonsLink.addEventListener('click', (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        window.open(
                            `https://www.rolimons.com/item/${assetId}`,
                            '_blank',
                        );
                    });
                } else {
                    rolimonsLink = document.createElement('a');
                    rolimonsLink.href = `https://www.rolimons.com/item/${assetId}`;
                    rolimonsLink.target = '_blank';
                }
                rolimonsLink.style.display = 'flex';
                rolimonsLink.style.alignItems = 'center';
                rolimonsLink.style.marginLeft = '4px';
                rolimonsLink.innerHTML = `<div style="width: 18px; height: 18px; background-color: var(--rovalra-main-text-color); -webkit-mask: url('${assets.launchIcon}')"></div>`; // verified
                addTooltip(rolimonsLink, 'Open item on Rolimons', {
                    position: 'top',
                });

                valDiv.appendChild(rolimonsLink);
            }
            priceDiv.parentNode.insertBefore(valDiv, priceDiv.nextSibling);
        }
    }

    if (
        featureSettings.tradeShowProjectedIndicator &&
        data.is_projected &&
        !card.querySelector('.rovalra-projected-icon')
    ) {
        const thumbContainer =
            card.querySelector(
                '.item-card-thumb-container, .rovalra-item-thumb-container',
            ) || card;
        if (thumbContainer) {
            const projIcon = document.createElement('img');
            projIcon.src = assets.projectedWarning;
            projIcon.className = 'rovalra-projected-icon';
            const projIconStyle = {
                position: 'absolute',
                bottom: card.classList.contains('trade-request-item')
                    ? '20px'
                    : '4px',
                width: '20px',
                height: '20px',
                zIndex: '10',
            };
            if (card.classList.contains('trade-request-item')) {
                projIconStyle.left = '4px';
            } else {
                projIconStyle.right = '4px';
            }
            Object.assign(projIcon.style, projIconStyle);
            addTooltip(projIcon, 'Projected Item', { position: 'top' });
            if (!card.classList.contains('trade-request-item'))
                thumbContainer.style.position = 'relative';
            thumbContainer.appendChild(projIcon);
        }
    }

    if (
        featureSettings.tradeShowRareIndicator &&
        data.is_rare &&
        !card.querySelector('.rovalra-rare-icon')
    ) {
        const thumbContainer =
            card.querySelector(
                '.item-card-thumb-container, .rovalra-item-thumb-container',
            ) || card;
        if (thumbContainer) {
            const rareIcon = document.createElement('img');
            rareIcon.src = assets.rareIcon;
            rareIcon.className = 'rovalra-rare-icon';
            const rareIconStyle = {
                position: 'absolute',
                bottom: card.classList.contains('trade-request-item')
                    ? '20px'
                    : '4px',
                width: '20px',
                height: '20px',
                zIndex: '10',
            };
            if (card.classList.contains('trade-request-item')) {
                rareIconStyle.left = data.is_projected ? '26px' : '4px';
            } else {
                rareIconStyle.right = data.is_projected ? '26px' : '4px';
            }
            Object.assign(rareIcon.style, rareIconStyle);
            addTooltip(rareIcon, 'Rare Item', { position: 'top' });
            if (!card.classList.contains('trade-request-item'))
                thumbContainer.style.position = 'relative';
            thumbContainer.appendChild(rareIcon);
        }
    }

    if (featureSettings.tradeShowItemInfo) {
        const thumbContainer =
            card.querySelector(
                '.item-card-thumb-container, .rovalra-item-thumb-container',
            ) || card;

        if (thumbContainer) {
            let infoIcon = card.querySelector('.rovalra-info-icon');
            if (!infoIcon) {
                infoIcon = document.createElement('div');
                infoIcon.className = 'rovalra-info-icon';
                Object.assign(infoIcon.style, {
                    position: 'absolute',
                    top: '4px',
                    right: '4px',
                    width: '20px',
                    height: '20px',
                    zIndex: '10',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                });

                const innerIcon = document.createElement('div');
                Object.assign(innerIcon.style, {
                    width: '16px',
                    height: '16px',
                    backgroundColor: 'var(--rovalra-main-text-color)',
                    webkitMask: `url('${assets.priceFloorIcon}') center/contain no-repeat`,
                    mask: `url('${assets.priceFloorIcon}') center/contain no-repeat`,
                });
                infoIcon.appendChild(innerIcon);

                if (!card.classList.contains('trade-request-item')) {
                    thumbContainer.style.position = 'relative';
                }
                thumbContainer.appendChild(infoIcon);
            }

            const riskCacheData = getCachedRisk(assetId);
            const riskData = riskCacheData ? riskCacheData.risk : null;

            const tooltipParts = [];
            if (data.trend) {
                const trendValue = getTrendValue(data.trend);
                tooltipParts.push(`Trend: ${getTrendString(trendValue)}`);
            }
            if (data.demand) {
                tooltipParts.push(`Demand: ${data.demand}`);
            }
            if (data.acronym) {
                tooltipParts.push(`Acronym: ${data.acronym}`);
            }

            if (featureSettings.tradeRiskEnabled && riskData) {
                const color = RISK_COLORS[riskData.level] || '#fff';
                tooltipParts.push(
                    `Risk: <span style="color:${color};font-weight:bold;">${riskData.level}</span>`,
                );

                if (
                    riskData.metrics &&
                    riskData.metrics.baselineAvg !== undefined
                ) {
                    tooltipParts.push(
                        `Stable Price: ${riskData.metrics.baselineAvg.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
                    );
                }
                let bestPrice = data.best_price;
                if (
                    riskCacheData &&
                    riskCacheData.robloxBestPrice !== undefined &&
                    riskCacheData.robloxBestPrice !== null
                ) {
                    bestPrice = riskCacheData.robloxBestPrice;
                }

                if (bestPrice > 0) {
                    tooltipParts.push(
                        `Best Price: ${bestPrice.toLocaleString()}`,
                    );
                }
                if (riskData.reasons && riskData.reasons.length > 0) {
                    tooltipParts.push(
                        `<span style="font-weight:600; text-decoration: underline;">Reasons:</span>`,
                    );
                    riskData.reasons.forEach((r) => {
                        if (typeof r === 'object') {
                            const color =
                                r.type === 'good'
                                    ? '#00b06f'
                                    : r.type === 'bad'
                                      ? '#ff4d4d'
                                      : '';
                            const style = color ? `style="color:${color}"` : '';
                            tooltipParts.push(
                                `<span ${style}>• ${r.text}</span>`,
                            );
                        } else {
                            tooltipParts.push(`• ${r}`);
                        }
                    });
                }
            }

            if (tooltipParts.length > 0) {
                addTooltip(infoIcon, tooltipParts.join('<br>'), {
                    position: 'top',
                });
            }
        }
    }
}

function initTradeSummary() {
    summaryObserverRequest = observeElement(
        '.trade-request-window-offers, .trade-list-detail-offers',
        (container) => {
            observeChildren(container, () => {
                if (summaryObserverRequest?.active) queueUpdateTradeSummary();
            });
            observeAttributes(container, () => {
                if (summaryObserverRequest?.active) queueUpdateTradeSummary();
            }, ['class']);

            queueUpdateTradeSummary();
        },
    );
}

function queueUpdateTradeSummary() {
    if (updateSummaryTimeout) clearTimeout(updateSummaryTimeout);
    updateSummaryTimeout = setTimeout(updateTradeSummary, 200);
}

function updateTradeSummary() {
    let offers = document.querySelectorAll('.trade-list-detail-offer');
    if (offers.length < 2) {
        offers = document.querySelectorAll('.trade-request-window-offer');
    }
    if (offers.length < 2) return;

    const giveOffer = offers[0];
    const receiveOffer = offers[1];

    const giveStats = calculateStats(giveOffer);
    const receiveStats = calculateStats(receiveOffer);

    if (featureSettings.tradeShowTotalValue) {
        injectTotalValueLine(giveOffer, giveStats.value);
        injectTotalValueLine(receiveOffer, receiveStats.value);
    }

    if (featureSettings.tradeShowTotalDemand) {
        injectTotalDemandLine(
            giveOffer,
            giveStats.totalDemand,
            giveStats.itemCount,
        );
        injectTotalDemandLine(
            receiveOffer,
            receiveStats.totalDemand,
            receiveStats.itemCount,
        );
    }

    renderSummary(giveOffer, receiveOffer, giveStats, receiveStats);
}

function calculateStats(offerEl) {
    let rap = 0;
    let value = 0;
    let totalDemand = 0;
    let itemCount = 0;
    let robux = 0;

    offerEl
        .querySelectorAll('.item-card-container, .trade-request-item')
        .forEach((card) => {
            if (
                card.classList.contains('trade-request-item') &&
                (card.classList.contains('blank-item') ||
                    (!card.hasAttribute('data-collectibleitemid') &&
                        !card.hasAttribute('data-collectibleiteminstanceid')))
            )
                return;

            let itemRap = 0;
            let itemValue = 0;

            if (card.classList.contains('trade-request-item')) {
                const instanceId = card.getAttribute(
                    'data-collectibleiteminstanceid',
                );
                if (instanceId) {
                    const cached = getCachedItemValue(instanceId);
                    if (cached && cached.rap) itemRap = cached.rap;
                }
                if (itemRap === 0) {
                    const priceEl = card.querySelector(
                        '.item-value .text-robux',
                    );
                    if (priceEl) {
                        const r = cleanPrice(priceEl.innerText);
                        if (!isNaN(r)) itemRap = r;
                    }
                }
            } else {
                const priceEl = card
                    .closest('.item-card')
                    .querySelector(
                        '.item-card-price:not(.rovalra-value-label) .text-robux',
                    );
                if (priceEl) {
                    const r = cleanPrice(priceEl.innerText);
                    if (!isNaN(r)) itemRap = r;
                }
            }

            const assetId = card.dataset.rovalraAssetId;
            let itemDemand = -1;

            if (assetId) {
                const data = getCachedRolimonsItem(assetId);
                if (data) {
                    if (itemRap === 0 && data.rap) itemRap = data.rap;
                    itemValue =
                        data.default_price !== undefined &&
                        data.default_price !== null
                            ? data.default_price
                            : itemRap;
                    if (data.demand) {
                        itemDemand = getDemandValue(data.demand);
                    }
                } else {
                    itemValue = itemRap;
                }
            } else {
                itemValue = itemRap;
            }

            totalDemand += itemDemand;
            itemCount++;

            rap += itemRap;
            value += itemValue;
        });

    const tradeRow = offerEl.closest('.trade-row');
    if (tradeRow && tradeRow.dataset.tradeId) {
        CacheHandler.get(
            'trade_history',
            tradeRow.dataset.tradeId,
            'local',
        ).then((storedTrade) => {
            if (Array.isArray(storedTrade)) {
                const offerIndex = Array.from(
                    offerEl.parentNode.children,
                ).indexOf(offerEl);
                robux = offerIndex === 0 ? storedTrade[0] : storedTrade[2];
            }
        });
    }

    if (robux === 0) {
        const robuxLineVal = offerEl.querySelector('.robux-line-value');
        if (robuxLineVal) {
            const val = cleanPrice(robuxLineVal.innerText);
            if (!isNaN(val)) robux = val;
        }
    }

    return { rap, value, totalDemand, itemCount, robux };
}

function injectTotalValueLine(offer, totalValue) {
    const assets = getAssets();
    const rapLine = Array.from(offer.querySelectorAll('.robux-line')).find(
        (el) => el.querySelector('[ng-bind*="Label.TotalValue"]'),
    );

    if (!rapLine) return;

    let valueLine = offer.querySelector('.rovalra-total-value-line');

    if (!valueLine) {
        valueLine = rapLine.cloneNode(true);
        valueLine.className = 'robux-line rovalra-total-value-line';

        const label = valueLine.querySelector('.text-lead');
        if (label) {
            label.removeAttribute('ng-bind');
            label.innerText = 'Value:';
        }

        const amountContainer = valueLine.querySelector('.robux-line-amount');
        if (amountContainer) {
            amountContainer.innerHTML = '';

            const icon = document.createElement('img');
            icon.src = assets.rolimonsIcon;
            Object.assign(icon.style, {
                width: '16px',
                height: '16px',
                marginRight: '4px',
                verticalAlign: 'text-bottom',
            });

            const valueSpan = document.createElement('span');
            valueSpan.className = 'text-robux-lg robux-line-value';
            valueSpan.innerText = totalValue.toLocaleString();

            amountContainer.appendChild(icon);
            amountContainer.appendChild(valueSpan);
        }

        rapLine.parentNode.insertBefore(valueLine, rapLine.nextSibling);
    } else {
        const valSpan = valueLine.querySelector('.robux-line-value');
        if (valSpan) valSpan.innerText = totalValue.toLocaleString();
    }
}

function injectTotalDemandLine(offer, totalDemand, itemCount) {
    const assets = getAssets();
    const valueLine = offer.querySelector('.rovalra-total-value-line');

    if (!valueLine) return;

    let demandLine = offer.querySelector('.rovalra-total-demand-line');
    const average = itemCount > 0 ? totalDemand / itemCount : -1;
    const displayValue = average.toLocaleString(undefined, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
    });

    if (!demandLine) {
        demandLine = valueLine.cloneNode(true);
        demandLine.className = 'robux-line rovalra-total-demand-line';

        const label = demandLine.querySelector('.text-lead');
        if (label) {
            label.innerText = 'Demand:';
        }

        const amountContainer = demandLine.querySelector('.robux-line-amount');
        if (amountContainer) {
            amountContainer.innerHTML = '';

            const icon = document.createElement('img');
            icon.src = assets.rolimonsIcon;
            Object.assign(icon.style, {
                width: '16px',
                height: '16px',
                marginRight: '4px',
                verticalAlign: 'text-bottom',
            });

            const valueSpan = document.createElement('span');
            valueSpan.className = 'text-robux-lg robux-line-value';
            valueSpan.innerText = `${displayValue} / 5.0`;

            amountContainer.appendChild(icon);
            amountContainer.appendChild(valueSpan);
        }

        valueLine.parentNode.insertBefore(demandLine, valueLine.nextSibling);
    } else {
        const valSpan = demandLine.querySelector('.robux-line-value');
        if (valSpan) valSpan.innerText = `${displayValue} / 5.0`;
    }
}

function renderSummary(giveOffer, receiveOffer, giveStats, receiveStats) {
    const target = giveOffer;

    let summaryDiv = target.querySelector('.rovalra-trade-summary');
    if (!summaryDiv) {
        summaryDiv = document.createElement('div');
        summaryDiv.className = 'rovalra-trade-summary';
        Object.assign(summaryDiv.style, {
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            width: '100%',
            marginTop: '5px',
            marginBottom: '8px',
            gap: '6px',
        });

        target.appendChild(summaryDiv);
    }

    const assets = getAssets();
    summaryDiv.innerHTML = '';

    let myRap = giveStats.rap;
    let myValue = giveStats.value;
    let partnerRap = receiveStats.rap;
    let partnerValue = receiveStats.value;

    if (includeRobuxInCalculation) {
        myRap += giveStats.robux;
        myValue += giveStats.robux;
        partnerRap += receiveStats.robux;
        partnerValue += receiveStats.robux;
    }

    if (featureSettings.tradeShowDiffPills) {
        const pillsContainer = document.createElement('div');
        Object.assign(pillsContainer.style, {
            display: 'flex',
            gap: '6px',
            alignItems: 'center',
            justifyContent: 'center',
        });

        const rapDiff = partnerRap - myRap;
        const rapPill = createRapDiffPill(rapDiff, myRap, {
            margin: '10px 0',
        });

        pillsContainer.appendChild(rapPill);

        const valDiff = partnerValue - myValue;
        const valPill = createValueDiffPill(valDiff, myValue, {
            margin: '10px 0',
        });

        pillsContainer.appendChild(valPill);

        summaryDiv.appendChild(pillsContainer);
    }

    const totalRobux = giveStats.robux + receiveStats.robux;
    if (totalRobux > 0) {
        summaryDiv.style.flexDirection = 'column';
        summaryDiv.style.gap = '4px';

        const toggleContainer = document.createElement('div');
        Object.assign(toggleContainer.style, {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            marginTop: '2px',
            fontSize: '13px',
            color: 'var(--rovalra-main-text-color)',
        });

        const robuxToggle = createRadioButton({
            checked: includeRobuxInCalculation,
            onChange: (checked) => {
                includeRobuxInCalculation = checked;
                queueUpdateTradeSummary();
            },
        });

        const toggleLabel = document.createElement('span');
        toggleLabel.innerText = 'Include Robux';

        toggleContainer.appendChild(robuxToggle);
        toggleContainer.appendChild(toggleLabel);
        summaryDiv.appendChild(toggleContainer);
    } else {
        summaryDiv.style.flexDirection = 'row';
        summaryDiv.style.gap = '6px';
    }
}
// turns demand into numbers so we can add locale support.
function getDemandValue(demandStr) {
    const map = {
        None: 0,
        Terrible: 1,
        Low: 2,
        Normal: 3,
        High: 4,
        Amazing: 5,
    };
    return map[demandStr] !== undefined ? map[demandStr] : -1;
}
