import { observeElement } from '../../core/observer.js';
import { addTooltip } from '../../core/ui/tooltip.js';
import { createPill } from '../../core/ui/general/pill.js';

const itemValueCache = new Map();

document.addEventListener('rovalra-tradable-items-response', (e) => {
    const data = e.detail;
    if (data && Array.isArray(data.items)) {
        data.items.forEach((item) => {
            if (Array.isArray(item.instances)) {
                item.instances.forEach((inst) => {
                    if (inst.collectibleItemInstanceId) {
                        itemValueCache.set(inst.collectibleItemInstanceId, {
                            rap: inst.recentAveragePrice,
                            serial: inst.serialNumber,
                            stock: inst.assetStock,
                        });
                    }
                });
            }
        });
    }
});

export function init() {
    const path = window.location.pathname;
    const isTradePage =
        path.startsWith('/trades') ||
        path.startsWith('/trade') ||
        /\/users\/\d+\/trade/.test(path);

    if (!isTradePage) return;

    console.log('[RoValra] Initializing confirmtrade feature.');
    observeElement('.modal-window .modal-body', (modalBody) => {
        console.log('[RoValra] Modal body observed.', modalBody);
        if (modalBody.querySelector('.rovalra-trade-preview')) {
            console.log('[RoValra] Trade preview already exists. Skipping.');
            return;
        }

        const tradeOffers = document.querySelectorAll(
            '.trade-request-window-offer',
        );
        console.log(`[RoValra] Found ${tradeOffers.length} trade offers.`);

        if (tradeOffers.length < 2) {
            console.log(
                '[RoValra] Not enough trade offers found. Skipping preview injection.',
            );
            return;
        }

        console.log('[RoValra] Injecting trade preview.');
        injectTradePreview(modalBody, tradeOffers);
    });
}

function injectTradePreview(modalBody, tradeOffers) {
    console.log('[RoValra] Inside injectTradePreview.');
    const previewData = {
        giving: { items: [], robux: 0, totalRap: 0 },
        receiving: { items: [], robux: 0, totalRap: 0 },
    };

    tradeOffers.forEach((offer, index) => {
        const isMyOffer = index === 0;
        const side = isMyOffer ? previewData.giving : previewData.receiving;

        const items = offer.querySelectorAll(
            '.trade-request-item[data-collectibleiteminstanceid]',
        );
        items.forEach((item) => {
            const instanceId = item.getAttribute(
                'data-collectibleiteminstanceid',
            );
            const imgEl = item.querySelector('img');
            const nameEl = item.querySelector('.item-name');
            const cachedItem = itemValueCache.get(instanceId);
            const rap = cachedItem ? cachedItem.rap : 0;
            const serial = cachedItem ? cachedItem.serial : null;
            const stock = cachedItem ? cachedItem.stock : null;

            if (imgEl && nameEl) {
                side.items.push({
                    img: imgEl.src,
                    name: nameEl.innerText.trim(),
                    rap: rap,
                    serial: serial,
                    stock: stock,
                    isInvalid: item.classList.contains('invalid-request-item'),
                });
            }
        });

        const robuxInput = offer.querySelector('input[name="robux"]');
        if (robuxInput) {
            const val = parseInt(robuxInput.value.replace(/,/g, ''), 10);
            if (!isNaN(val)) side.robux = val;
        }

        const itemsRap = side.items.reduce((sum, i) => sum + (i.rap || 0), 0);
        side.totalRap = itemsRap + side.robux;
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

    const createSide = (title, data, color) => {
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

            let tooltipHtml = `<b>${item.name}</b><br>RAP: ${item.rap ? item.rap.toLocaleString() : '?'}`;
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

            const text = document.createTextNode(
                ` +${data.robux.toLocaleString()}`,
            );
            rDiv.appendChild(text);

            div.appendChild(rDiv);
        }

        const totalDiv = document.createElement('div');
        totalDiv.style.marginTop = 'auto';
        totalDiv.style.paddingTop = '10px';
        totalDiv.style.fontSize = '12px';
        totalDiv.style.fontWeight = '700';
        totalDiv.style.color = 'var(--rovalra-main-text-color)';
        totalDiv.style.display = 'flex';
        totalDiv.style.alignItems = 'center';
        totalDiv.style.justifyContent = 'center';
        totalDiv.innerHTML = `<span class="icon-robux-16x16" style="margin-right: 4px;"></span> Total: ${data.totalRap.toLocaleString()}`;
        div.appendChild(totalDiv);

        return div;
    };

    flex.appendChild(createSide('You Give', previewData.giving, '#d43f3a'));

    const middleDiv = document.createElement('div');
    middleDiv.style.display = 'flex';
    middleDiv.style.flexDirection = 'column';
    middleDiv.style.alignItems = 'center';
    middleDiv.style.justifyContent = 'center';

    const sepTop = document.createElement('div');
    sepTop.style.width = '1px';
    sepTop.style.flex = '1';
    sepTop.style.background = '#dee2e6';
    middleDiv.appendChild(sepTop);

    const diff = previewData.receiving.totalRap - previewData.giving.totalRap;
    const diffText = (diff > 0 ? '+' : '') + diff.toLocaleString();
    const pill = createPill(diffText, 'RAP Difference');
    pill.style.backgroundColor = diff >= 0 ? '#00b06f' : '#d43f3a';
    pill.style.color = '#fff';
    pill.style.margin = '10px 0';
    pill.style.fontWeight = '700';
    const pillSpan = pill.querySelector('span');
    if (pillSpan) {
        pillSpan.style.display = 'flex';
        pillSpan.style.alignItems = 'center';
        pillSpan.innerHTML = `<span class="icon-robux-16x16" style="margin-right: 4px;"></span>${diffText}`;
    }
    middleDiv.appendChild(pill);

    const sepBottom = document.createElement('div');
    sepBottom.style.width = '1px';
    sepBottom.style.flex = '1';
    sepBottom.style.background = '#dee2e6';
    middleDiv.appendChild(sepBottom);

    flex.appendChild(middleDiv);

    flex.appendChild(createSide('You Get', previewData.receiving, '#00b06f'));

    modalBody.appendChild(container);
    console.log('[RoValra] Trade preview injected.');
}
