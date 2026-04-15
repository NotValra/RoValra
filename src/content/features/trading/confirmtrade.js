import { observeElement } from '../../core/observer.js';
import { addTooltip } from '../../core/ui/tooltip.js';
import { getAssets } from '../../core/assets.js';
import { getPlaceIdFromUrl } from '../../core/idExtractor.js';
import {
    getCachedItemValue,
    getCachedRolimonsItem,
    fetchRolimonsItems,
    queueRolimonsFetch,
} from '../../core/trade/itemHandler.js';
import { getBatchThumbnails } from '../../core/thumbnail/thumbnails.js';
import {
    createRapDiffPill,
    createValueDiffPill,
} from '../../core/trade/ui/tradePills.js';
import { cleanPrice } from '../../core/utils/priceCleaner.js';

let observerRequest = null;
let prefetchRequests = [];

export function init() {
    chrome.storage.local.get({ confirmTradeEnabled: true }, (settings) => {
        if (!settings.confirmTradeEnabled) return;

        const path = window.location.pathname;
        const isTradePage =
            path.startsWith('/trades') ||
            path.startsWith('/trade') ||
            /\/users\/\d+\/trade/.test(path);

        if (!isTradePage) {
            if (observerRequest) {
                observerRequest.active = false;
                observerRequest = null;
            }
            prefetchRequests.forEach((req) => (req.active = false));
            prefetchRequests = [];
            return;
        }

        if (observerRequest) return;

        startPrefetching();

        console.log('[RoValra] Initializing confirmtrade feature.');
        observerRequest = observeElement(
            '.modal-window .modal-body',
            (modalBody) => {
                console.log('[RoValra] Modal body observed.', modalBody);
                if (modalBody.querySelector('.rovalra-trade-preview')) {
                    console.log(
                        '[RoValra] Trade preview already exists. Skipping.',
                    );
                    return;
                }

                let tradeOffers = document.querySelectorAll(
                    '.trade-request-window-offer',
                );
                let isDetailView = false;

                if (tradeOffers.length < 2) {
                    tradeOffers = document.querySelectorAll(
                        '.trade-list-detail-offer',
                    );
                    if (tradeOffers.length >= 2) {
                        isDetailView = true;
                    }
                }

                console.log(
                    `[RoValra] Found ${tradeOffers.length} trade offers. DetailView: ${isDetailView}`,
                );

                if (tradeOffers.length < 2) {
                    return;
                }

                injectTradePreview(modalBody, tradeOffers, isDetailView);
            },
        );
    });
}

function startPrefetching() {
    prefetchRequests.forEach((req) => (req.active = false));
    prefetchRequests = [];

    const handleLink = (el) => {
        const id = getPlaceIdFromUrl(el.href);
        if (id) queueRolimonsFetch(id);
    };

    prefetchRequests.push(
        observeElement('.trade-request-window-offers a', handleLink, {
            multiple: true,
        }),
    );
    prefetchRequests.push(
        observeElement('.trade-list-detail-offer a', handleLink, {
            multiple: true,
        }),
    );
}

async function injectTradePreview(
    modalBody,
    tradeOffers,
    isDetailView = false,
) {
    console.log('[RoValra] Inside injectTradePreview.');
    const assets = getAssets();
    const assetIds = new Set();

    tradeOffers.forEach((offer) => {
        const selector = isDetailView
            ? '.item-card-container'
            : '.trade-request-item[data-collectibleiteminstanceid]';
        const items = offer.querySelectorAll(selector);

        items.forEach((item) => {
            let assetId = item.getAttribute('data-collectibleitemid');
            if (!assetId) {
                if (isDetailView) {
                    const link = item.querySelector('a[href*="/catalog/"]');
                    if (link) assetId = getPlaceIdFromUrl(link.href);
                } else {
                    const instanceId = item.getAttribute(
                        'data-collectibleiteminstanceid',
                    );
                    const cached = getCachedItemValue(instanceId);
                    if (cached && cached.assetId) assetId = cached.assetId;
                }
            }
            if (assetId) assetIds.add(assetId);
        });
    });

    let rolimonsData = {};
    await fetchRolimonsItems([...assetIds]);

    const thumbnailData = await getBatchThumbnails(
        [...assetIds],
        'Asset',
        '150x150',
    );
    const thumbMap = new Map(
        thumbnailData.map((t) => [String(t.targetId), t.imageUrl]),
    );

    assetIds.forEach((id) => {
        const data = getCachedRolimonsItem(id);
        if (data) {
            rolimonsData[id] = data;
        }
    });

    if (!modalBody.isConnected) return;
    console.log('[RoValra] Injecting trade preview.');

    const previewData = {
        giving: { items: [], robux: 0, totalRap: 0, totalValue: 0 },
        receiving: { items: [], robux: 0, totalRap: 0, totalValue: 0 },
    };

    tradeOffers.forEach((offer, index) => {
        const isMyOffer = index === 0;
        const side = isMyOffer ? previewData.giving : previewData.receiving;

        const selector = isDetailView
            ? '.item-card-container'
            : '.trade-request-item[data-collectibleiteminstanceid]';
        const items = offer.querySelectorAll(selector);

        items.forEach((item) => {
            const instanceId = item.getAttribute(
                'data-collectibleiteminstanceid',
            );
            let assetId = item.getAttribute('data-collectibleitemid');
            const imgEl = item.querySelector('img');
            const nameEl = item.querySelector(
                isDetailView ? '.item-card-name' : '.item-name',
            );
            const cachedItem = getCachedItemValue(instanceId);
            let rap = cachedItem ? cachedItem.rap : 0;
            const serial = cachedItem ? cachedItem.serial : null;
            const stock = cachedItem ? cachedItem.stock : null;

            if (isDetailView && !assetId) {
                const link = item.querySelector('a[href*="/catalog/"]');
                if (link) assetId = getPlaceIdFromUrl(link.href);
            }

            if (!assetId && cachedItem && cachedItem.assetId) {
                assetId = cachedItem.assetId;
            }

            let thumbUrl = imgEl ? imgEl.src : '';
            if (assetId && thumbMap.has(String(assetId))) {
                const apiThumb = thumbMap.get(String(assetId));
                if (apiThumb) thumbUrl = apiThumb;
            }

            let value = rap;
            let isProjected = false;
            let isRare = false;
            if (assetId && rolimonsData[assetId]) {
                if (rap === 0 && rolimonsData[assetId].rap)
                    rap = rolimonsData[assetId].rap;
                const rItem = rolimonsData[assetId];
                if (
                    rItem.default_price !== undefined &&
                    rItem.default_price !== null
                ) {
                    value = rItem.default_price;
                }
                if (rItem.is_projected) isProjected = true;
                if (rItem.is_rare) isRare = true;
            }

            if (isDetailView && rap === 0) {
                const priceEl = item.querySelector(
                    '.item-card-price .text-robux',
                );
                if (priceEl) {
                    const r = cleanPrice(priceEl.innerText);
                    if (!isNaN(r)) rap = r;
                }
            }

            if (thumbUrl && nameEl) {
                side.items.push({
                    img: thumbUrl,
                    name: nameEl.innerText.trim(),
                    rap: rap,
                    value: value,
                    serial: serial,
                    stock: stock,
                    isInvalid: item.classList.contains('invalid-request-item'),
                    isProjected: isProjected,
                    isRare: isRare,
                });
            }
        });

        if (isDetailView) {
            const grayIcon = offer.querySelector('.icon-robux-gray-16x16');
            if (grayIcon) {
                const container = grayIcon.closest('.robux-line');
                if (container && !container.classList.contains('ng-hide')) {
                    const valEl = container.querySelector('.robux-line-value');
                    if (valEl) {
                        const val = cleanPrice(valEl.innerText);

                        if (!isNaN(val)) side.robux = Math.round(val / 0.7);
                    }
                }
            }
        } else {
            const robuxInput = offer.querySelector('input[name="robux"]');
            if (robuxInput) {
                const val = cleanPrice(robuxInput.value);
                if (!isNaN(val)) side.robux = val;
            }
        }

        const itemsRap = side.items.reduce((sum, i) => sum + (i.rap || 0), 0);
        side.totalRap = itemsRap;
        const itemsValue = side.items.reduce(
            (sum, i) => sum + (i.value || 0),
            0,
        );
        side.totalValue = itemsValue;
    });

    console.log('[RoValra] Scraped preview data:', previewData);

    const modalDialog = modalBody.closest('.modal-dialog');
    if (modalDialog) {
        modalDialog.style.width = '800px';
        modalDialog.style.maxWidth = '90vw';
    }

    const container = document.createElement('div');
    container.className = 'rovalra-trade-preview';
    container.style.marginTop = '15px';
    container.style.borderTop = '1px solid #dee2e6';
    container.style.paddingTop = '15px';

    const flex = document.createElement('div');
    flex.style.display = 'flex';
    flex.style.gap = '15px';
    container.appendChild(flex);

    const createSide = (title, data, color, isGiving) => {
        const div = document.createElement('div');
        div.style.flex = '1';
        div.style.textAlign = 'center';
        div.style.display = 'flex';
        div.style.flexDirection = 'column';

        const h = document.createElement('div');
        h.innerText = title;
        h.style.fontWeight = '600';
        h.style.marginBottom = '8px';
        h.style.color = 'var(--rovalra-main-text-color)';
        div.appendChild(h);

        const itemsDiv = document.createElement('div');
        itemsDiv.style.display = 'flex';
        itemsDiv.style.flexWrap = 'wrap';
        itemsDiv.style.justifyContent = 'center';
        itemsDiv.style.gap = '8px';

        data.items.forEach((item) => {
            const wrap = document.createElement('div');
            wrap.style.position = 'relative';
            const img = document.createElement('img');
            img.src = item.img;
            img.style.width = '64px';
            img.style.height = '64px';
            img.style.borderRadius = '8px';
            img.style.border = item.isInvalid ? '2px solid #d43f3a' : 'none';
            wrap.appendChild(img);

            if (item.isProjected) {
                const projIcon = document.createElement('img');
                projIcon.src = assets.projectedWarning;
                Object.assign(projIcon.style, {
                    position: 'absolute',
                    bottom: '2px',
                    left: '2px',
                    width: '16px',
                    height: '16px',
                    zIndex: '2',
                });
                addTooltip(projIcon, 'Projected', { position: 'top' });
                wrap.appendChild(projIcon);
            }

            if (item.isRare) {
                const rareIcon = document.createElement('img');
                rareIcon.src = assets.rareIcon;
                Object.assign(rareIcon.style, {
                    position: 'absolute',
                    bottom: '2px',
                    right: '2px',
                    width: '16px',
                    height: '16px',
                    zIndex: '2',
                });
                addTooltip(rareIcon, 'Rare Item', { position: 'top' });
                wrap.appendChild(rareIcon);
            }

            let tooltipHtml = `<b>${item.name}</b><br>RAP: ${item.rap ? item.rap.toLocaleString() : '?'}`;
            tooltipHtml += `<br>Value: ${item.value ? item.value.toLocaleString() : '?'}`;
            if (item.serial) {
                tooltipHtml += `<br>Serial: #${item.serial} / ${item.stock ? item.stock.toLocaleString() : '?'}`;
            }
            addTooltip(wrap, tooltipHtml, { position: 'top' });
            itemsDiv.appendChild(wrap);
        });
        div.appendChild(itemsDiv);

        if (data.robux > 0) {
            const rDiv = document.createElement('div');
            rDiv.style.marginTop = '8px';
            rDiv.style.fontWeight = '600';
            rDiv.style.color = color;
            rDiv.style.display = 'flex';
            rDiv.style.alignItems = 'center';
            rDiv.style.justifyContent = 'center';
            rDiv.style.gap = '4px';

            const icon = document.createElement('span');
            icon.className = 'icon-robux-16x16';
            rDiv.appendChild(icon);

            const afterTax = Math.floor(data.robux * 0.7);
            const displayAmount = isGiving ? data.robux : afterTax;
            const sign = isGiving ? '-' : '+';

            const text = document.createTextNode(
                ` ${sign}${displayAmount.toLocaleString()}`,
            );
            rDiv.appendChild(text);

            const tooltipLabel = isGiving ? 'After Tax' : 'Before Tax';
            const tooltipValue = isGiving ? afterTax : data.robux;

            addTooltip(
                rDiv,
                `${tooltipLabel}: ${tooltipValue.toLocaleString()}`,
                {
                    position: 'top',
                },
            );

            div.appendChild(rDiv);
        }

        const totalDiv = document.createElement('div');
        totalDiv.style.marginTop = 'auto';
        totalDiv.style.paddingTop = '10px';
        totalDiv.style.color = 'var(--rovalra-main-text-color)';

        const rapTotal = document.createElement('div');
        rapTotal.style.fontSize = '12px';
        rapTotal.style.fontWeight = '700';
        rapTotal.style.display = 'flex';
        rapTotal.style.alignItems = 'center';
        rapTotal.style.justifyContent = 'center';
        rapTotal.innerHTML = `<span class="icon-robux-16x16" style="margin-right: 4px;"></span> RAP: ${data.totalRap.toLocaleString()}`;
        totalDiv.appendChild(rapTotal);

        const valueTotal = document.createElement('div');
        valueTotal.style.fontSize = '12px';
        valueTotal.style.fontWeight = '700';
        valueTotal.style.marginTop = '4px';
        valueTotal.style.display = 'flex';
        valueTotal.style.alignItems = 'center';
        valueTotal.style.justifyContent = 'center';
        valueTotal.innerHTML = `<img src="${assets.rolimonsIcon}" style="width: 16px; height: 16px; margin-right: 4px;"> Value: ${data.totalValue.toLocaleString()}`;
        totalDiv.appendChild(valueTotal);

        div.appendChild(totalDiv);

        return div;
    };

    flex.appendChild(
        createSide('You Give', previewData.giving, '#d43f3a', true),
    );

    const middleDiv = document.createElement('div');
    middleDiv.style.display = 'flex';
    middleDiv.style.flexDirection = 'column';
    middleDiv.style.alignItems = 'center';
    middleDiv.style.justifyContent = 'center';
    middleDiv.style.flexShrink = '0';
    middleDiv.style.minWidth = '100px';

    const sepTop = document.createElement('div');
    sepTop.style.width = '1px';
    sepTop.style.flex = '1';
    sepTop.style.background = '#dee2e6';
    middleDiv.appendChild(sepTop);

    const diff = previewData.receiving.totalRap - previewData.giving.totalRap;
    const pill = createRapDiffPill(diff, previewData.giving.totalRap, {
        margin: '10px 0',
    });
    middleDiv.appendChild(pill);

    const valDiff =
        previewData.receiving.totalValue - previewData.giving.totalValue;
    const valPill = createValueDiffPill(
        valDiff,
        previewData.giving.totalValue,
        {
            margin: '0 0 10px 0',
        },
    );
    middleDiv.appendChild(valPill);

    const sepBottom = document.createElement('div');
    sepBottom.style.width = '1px';
    sepBottom.style.flex = '1';
    sepBottom.style.background = '#dee2e6';
    middleDiv.appendChild(sepBottom);

    flex.appendChild(middleDiv);

    flex.appendChild(
        createSide('You Get', previewData.receiving, '#00b06f', false),
    );

    modalBody.appendChild(container);
    console.log('[RoValra] Trade preview injected.');
}
