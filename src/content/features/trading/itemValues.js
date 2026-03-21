import { observeElement } from '../../core/observer.js';
import { addTooltip } from '../../core/ui/tooltip.js';
import { createPill } from '../../core/ui/general/pill.js';
import { getAssets } from '../../core/assets.js';
import { getPlaceIdFromUrl } from '../../core/idExtractor.js';
import {
    getCachedItemValue,
    getCachedRolimonsItem,
    queueRolimonsFetch,
} from '../../core/trade/itemHandler.js';

let cardObserverRequest = null;
let summaryObserverRequest = null;
let dividerObserverRequest = null;
let updateSummaryTimeout = null;
const pendingCards = new Map();

export function init() {
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
        pendingCards.clear();
        if (updateSummaryTimeout) clearTimeout(updateSummaryTimeout);
        return;
    }

    if (cardObserverRequest) return;

    document.addEventListener('rovalra-rolimons-data-update', onRolimonsUpdate);
    initTradeSummary();

    dividerObserverRequest = observeElement(
        '.trade-request-window-offers .rbx-divider',
        (divider) => {
            divider.style.setProperty('margin', '24px 0px', 'important');
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
                    const link = card.querySelector('a[href*="/catalog/"]');
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
            queueUpdateTradeSummary();
        },
        { multiple: true },
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

function updateItemCard(card, assetId) {
    const data = getCachedRolimonsItem(assetId);
    if (!data) return;

    const assets = getAssets();
    const value = data.default_price || data.rap || 0;

    const priceDiv = card.querySelector('.item-card-price');
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
        valDiv.className = 'text-overflow item-card-price rovalra-value-label';
        valDiv.style.marginTop = '-4px';
        valDiv.style.display = 'flex';
        valDiv.style.alignItems = 'center';

        valDiv.innerHTML = `
            <img src="${assets.rolimonsIcon}" style="width: 16px; height: 16px; margin-right: 5px; margin-left: 1px">
            <span class="text-robux" style="color: var(--rovalra-main-text-color);">${value.toLocaleString()}</span>
        `; // verified

        const rolimonsLink = document.createElement('a');
        rolimonsLink.href = `https://www.rolimons.com/item/${assetId}`;
        rolimonsLink.target = '_blank';
        rolimonsLink.style.display = 'flex';
        rolimonsLink.style.alignItems = 'center';
        rolimonsLink.style.marginLeft = '4px';
        rolimonsLink.innerHTML = `<div style="width: 18px; height: 18px; background-color: var(--rovalra-main-text-color); -webkit-mask: url('${assets.launchIcon}')"></div>`; // verified
        addTooltip(rolimonsLink, 'Open item on Rolimons', {
            position: 'top',
        });

        valDiv.appendChild(rolimonsLink);
        priceDiv.parentNode.insertBefore(valDiv, priceDiv.nextSibling);
    }

    if (data.is_projected && !card.querySelector('.rovalra-projected-icon')) {
        const thumbContainer =
            card.querySelector('.item-card-thumb-container') || card;
        if (thumbContainer) {
            const projIcon = document.createElement('img');
            projIcon.src = assets.projectedWarning;
            projIcon.className = 'rovalra-projected-icon';
            Object.assign(projIcon.style, {
                position: 'absolute',
                bottom: card.classList.contains('trade-request-item')
                    ? '20px'
                    : '4px',
                left: card.classList.contains('trade-request-item')
                    ? '4px'
                    : '100px',
                width: '20px',
                height: '20px',
                zIndex: '10',
            });
            addTooltip(projIcon, 'Projected Item', { position: 'top' });
            if (!card.classList.contains('trade-request-item'))
                thumbContainer.style.position = 'relative';
            thumbContainer.appendChild(projIcon);
        }
    }

    if (data.is_rare && !card.querySelector('.rovalra-rare-icon')) {
        const thumbContainer =
            card.querySelector('.item-card-thumb-container') || card;
        if (thumbContainer) {
            const rareIcon = document.createElement('img');
            rareIcon.src = assets.rareIcon;
            rareIcon.className = 'rovalra-rare-icon';
            Object.assign(rareIcon.style, {
                position: 'absolute',
                bottom: card.classList.contains('trade-request-item')
                    ? '20px'
                    : '4px',
                left: card.classList.contains('trade-request-item')
                    ? data.is_projected
                        ? '26px'
                        : '4px'
                    : data.is_projected
                      ? '75px'
                      : '100px',
                width: '20px',
                height: '20px',
                zIndex: '10',
            });
            addTooltip(rareIcon, 'Rare Item', { position: 'top' });
            if (!card.classList.contains('trade-request-item'))
                thumbContainer.style.position = 'relative';
            thumbContainer.appendChild(rareIcon);
        }
    }

    if (!card.querySelector('.rovalra-info-icon')) {
        const thumbContainer =
            card.querySelector('.item-card-thumb-container') || card;
        if (thumbContainer) {
            const infoIcon = document.createElement('div');
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

            const tooltipParts = [];
            if (data.trend) {
                const trendValue = getTrendValue(data.trend);
                const trendString = getTrendString(trendValue);
                tooltipParts.push(`Trend: ${trendString}`);
            }
            if (data.demand) {
                tooltipParts.push(`Demand: ${data.demand}`);
            }
            if (data.acronym) {
                tooltipParts.push(`Acronym: ${data.acronym}`);
            }

            if (tooltipParts.length > 0) {
                addTooltip(infoIcon, tooltipParts.join('<br>'), {
                    position: 'top',
                });
                thumbContainer.appendChild(infoIcon);
            }
        }
    }
}

function initTradeSummary() {
    summaryObserverRequest = observeElement(
        '.trade-list-detail-offer, .trade-request-window-offer',
        () => {
            queueUpdateTradeSummary();
        },
        { multiple: true },
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

    injectTotalValueLine(giveOffer, giveStats.value);
    injectTotalValueLine(receiveOffer, receiveStats.value);

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

    renderSummary(giveOffer, receiveOffer, giveStats, receiveStats);
}

function calculateStats(offerEl) {
    let rap = 0;
    let value = 0;
    let totalDemand = 0;
    let itemCount = 0;

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
                        const r = parseInt(
                            priceEl.innerText.replace(/,/g, ''),
                            10,
                        );
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
                    const r = parseInt(priceEl.innerText.replace(/,/g, ''), 10);
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

    return { rap, value, totalDemand, itemCount };
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
            gap: '15px',
        });

        target.appendChild(summaryDiv);
    }

    const assets = getAssets();
    summaryDiv.innerHTML = '';

    const createPillElement = (
        text,
        tooltip,
        bgColor,
        textColor,
        margin,
        iconHtml,
    ) => {
        const pill = createPill(text, tooltip);
        Object.assign(pill.style, {
            backgroundColor: bgColor,
            color: textColor,
            fontWeight: '700',
            margin: 0,
            border: 'none',
        });

        const span = pill.querySelector('span');
        if (span) {
            span.style.display = 'flex';
            span.style.alignItems = 'center';
            span.innerHTML = iconHtml + text;
        }
        return pill;
    };

    const rapDiff = receiveStats.rap - giveStats.rap;
    const rapText = (rapDiff > 0 ? '+' : '') + rapDiff.toLocaleString();
    const rapBg = rapDiff > 0 ? '#00b06f' : rapDiff < 0 ? '#d43f3a' : '';
    const rapColor = rapDiff === 0 ? '' : '#fff';

    summaryDiv.appendChild(
        createPillElement(
            rapText,
            'RAP Difference',
            rapBg,
            rapColor,
            '10px 0',
            `<span class="icon-robux-16x16" style="margin-right: 4px;"></span>`,
        ),
    );

    const valDiff = receiveStats.value - giveStats.value;
    const valText = (valDiff > 0 ? '+' : '') + valDiff.toLocaleString();
    const valBg = valDiff > 0 ? '#00b06f' : valDiff < 0 ? '#d43f3a' : '';
    const valColor = valDiff === 0 ? '' : '#fff';

    summaryDiv.appendChild(
        createPillElement(
            valText,
            'Value Difference',
            valBg,
            valColor,
            '0 0 10px 0',
            `<img src="${assets.rolimonsIcon}" style="width: 16px; height: 16px; margin-right: 4px;">`,
        ),
    );
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
