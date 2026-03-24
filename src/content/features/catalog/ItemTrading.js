import { observeElement } from '../../core/observer.js';
import { getPlaceIdFromUrl } from '../../core/idExtractor.js';
import {
    getCachedRolimonsItem,
    queueRolimonsFetch,
    getCachedRisk,
    queueRiskFetch,
} from '../../core/trade/itemHandler.js';
import { getAssets } from '../../core/assets.js';
import { addTooltip } from '../../core/ui/tooltip.js';
import { RISK_COLORS } from '../../core/trade/riskCalculator.js';

let featureSettings = { itemTradingEnabled: true, tradeRiskEnabled: true };

function createRow(label, contentHtml) {
    const row = document.createElement('div');
    row.className = 'clearfix item-info-row-container rovalra-trading-row';
    row.innerHTML = `
        <div class="font-header-1 text-subheader text-label text-overflow row-label">${label}</div>
        <div class="font-body text wait-for-i18n-format-render"><span>${contentHtml}</span></div>
    `; //Verified
    // Should never display text
    return row;
}

function updateInfo(parent, referenceElement, assetId) {
    parent
        .querySelectorAll('.rovalra-trading-row')
        .forEach((el) => el.remove());

    const data = getCachedRolimonsItem(assetId);
    if (!data) return;

    const assets = getAssets();
    const rows = [];

    const value = data.default_price || data.rap || 0;
    const valueHtml = `
        <span style="display: flex; align-items: center;">
            <img src="${assets.rolimonsIcon}" style="width: 16px; height: 16px; margin-right: 6px;">
            ${value.toLocaleString()}
            <a href="https://www.rolimons.com/item/${assetId}" target="_blank" style="display: flex; align-items: center; margin-left: 8px;" class="rovalra-rolimons-link">
                <div style="width: 16px; height: 16px; background-color: var(--rovalra-main-text-color); -webkit-mask: url('${
                    assets.launchIcon
                }') center/contain no-repeat; mask: url('${
                    assets.launchIcon
                }') center/contain no-repeat;"></div>
            </a>
        </span>
    `;
    const valueRow = createRow('Value', valueHtml);
    const rolimonsLink = valueRow.querySelector('.rovalra-rolimons-link');
    if (rolimonsLink) {
        addTooltip(rolimonsLink, 'Open item on Rolimons', { position: 'top' });
    }
    rows.push(valueRow);

    if (data.demand) {
        rows.push(createRow('Demand', data.demand));
    }

    if (data.trend) {
        rows.push(createRow('Trend', data.trend));
    }

    if (data.acronym) {
        rows.push(createRow('Acronym', data.acronym));
    }

    if (featureSettings.tradeRiskEnabled) {
        const riskCacheData = getCachedRisk(assetId);
        if (riskCacheData && riskCacheData.risk) {
            const riskData = riskCacheData.risk;
            const color =
                RISK_COLORS[riskData.level] || 'var(--rovalra-main-text-color)';
            const riskHtml = `<span style="color:${color};font-weight:bold;">${riskData.level}</span>`;
            const riskRow = createRow('Risk', riskHtml);

            const tooltipParts = [];
            if (riskData.reasons && riskData.reasons.length > 0) {
                tooltipParts.push(
                    `<span style="font-weight:600; text-decoration: underline;">Reasons:</span>`,
                );
                riskData.reasons.forEach((r) => {
                    if (typeof r === 'object') {
                        const rColor =
                            r.type === 'good'
                                ? '#00b06f'
                                : r.type === 'bad'
                                  ? '#ff4d4d'
                                  : '';
                        const style = rColor ? `style="color:${rColor}"` : '';
                        tooltipParts.push(`<span ${style}>• ${r.text}</span>`);
                    } else {
                        tooltipParts.push(`• ${r}`);
                    }
                });
            }
            if (tooltipParts.length > 0) {
                const contentDiv = riskRow.querySelector('.font-body.text');
                if (contentDiv) {
                    addTooltip(contentDiv, tooltipParts.join('<br>'), {
                        position: 'top',
                    });
                    contentDiv.style.cursor = 'help';
                }
            }
            rows.push(riskRow);
        }
    }

    let currentElement = referenceElement;
    rows.forEach((row) => {
        if (currentElement.nextSibling) {
            parent.insertBefore(row, currentElement.nextSibling);
        } else {
            parent.appendChild(row);
        }
        currentElement = row;
    });
}

function updateItemName(header, assetId) {
    header
        .querySelectorAll('.rovalra-name-icon-container')
        .forEach((el) => el.remove());

    const data = getCachedRolimonsItem(assetId);
    const assets = getAssets();

    const container = document.createElement('span');
    container.className = 'rovalra-name-icon-container';
    Object.assign(container.style, {
        display: 'inline-flex',
        alignItems: 'center',
        verticalAlign: 'middle',
        marginLeft: '10px',
        gap: '8px',
    });

    const rolimonsLink = document.createElement('a');
    rolimonsLink.href = `https://www.rolimons.com/item/${assetId}`;
    rolimonsLink.target = '_blank';
    rolimonsLink.style.display = 'flex';
    rolimonsLink.style.alignItems = 'center';

    const rolIcon = document.createElement('div');
    Object.assign(rolIcon.style, {
        width: '20px',
        height: '20px',
        backgroundColor: 'var(--rovalra-main-text-color)',
        webkitMask: `url('${assets.launchIcon}') center/contain no-repeat`,
        mask: `url('${assets.launchIcon}') center/contain no-repeat`,
    });

    rolimonsLink.appendChild(rolIcon);
    addTooltip(rolimonsLink, 'Open item on Rolimons', { position: 'top' });
    container.appendChild(rolimonsLink);

    if (data) {
        if (data.is_projected) {
            const projIcon = document.createElement('img');
            projIcon.src = assets.projectedWarning;
            Object.assign(projIcon.style, { width: '24px', height: '24px' });
            addTooltip(projIcon, 'Projected Item', { position: 'top' });
            container.appendChild(projIcon);
        }
        if (data.is_rare) {
            const rareIcon = document.createElement('img');
            rareIcon.src = assets.rareIcon;
            Object.assign(rareIcon.style, { width: '24px', height: '24px' });
            addTooltip(rareIcon, 'Rare Item', { position: 'top' });
            container.appendChild(rareIcon);
        }
    }

    header.appendChild(container);
}

export function init() {
    chrome.storage.local.get(
        { itemTradingEnabled: true, tradeRiskEnabled: true },
        (settings) => {
            featureSettings = settings;
            if (!settings.itemTradingEnabled) return;

            const assetId = getPlaceIdFromUrl();
            if (!assetId) return;

            const handleUpdate = () => {
                const priceRow = document.querySelector(
                    '#item-details .price-row-container',
                );
                if (priceRow && priceRow.parentNode) {
                    updateInfo(priceRow.parentNode, priceRow, assetId);
                }
                const nameHeader = document.querySelector(
                    '.item-details-name-row h1',
                );
                if (nameHeader) {
                    updateItemName(nameHeader, assetId);
                }
            };

            document.addEventListener('rovalra-rolimons-data-update', (e) => {
                if (
                    Array.isArray(e.detail) &&
                    e.detail.includes(String(assetId))
                ) {
                    handleUpdate();
                }
            });

            document.addEventListener('rovalra-risk-data-update', (e) => {
                if (
                    Array.isArray(e.detail) &&
                    e.detail.includes(String(assetId))
                ) {
                    handleUpdate();
                }
            });

            observeElement(
                '#item-details .price-row-container',
                (priceRow) => {
                    if (priceRow.dataset.rovalraTradingProcessed) return;
                    priceRow.dataset.rovalraTradingProcessed = 'true';

                    const parent = priceRow.parentNode;

                    const rolimonsData = getCachedRolimonsItem(assetId);
                    const riskData = getCachedRisk(assetId);

                    if (rolimonsData || riskData) {
                        updateInfo(parent, priceRow, assetId);
                    }

                    if (!rolimonsData) {
                        queueRolimonsFetch(assetId);
                    }
                    if (featureSettings.tradeRiskEnabled && !riskData) {
                        queueRiskFetch(assetId);
                    }
                },
                { multiple: true },
            );

            observeElement('.item-details-name-row h1', (header) => {
                updateItemName(header, assetId);
                const rolimonsData = getCachedRolimonsItem(assetId);
                if (!rolimonsData) {
                    queueRolimonsFetch(assetId);
                }
            });
        },
    );
}
