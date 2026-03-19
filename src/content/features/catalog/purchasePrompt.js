import { observeElement } from '../../core/observer.js';
import { safeHtml } from '../../core/packages/dompurify.js';
import { ts } from '../../core/locale/i18n.js';

let lastBuyClickTime = 0;

function setupClickListener() {
    document.addEventListener(
        'click',
        (e) => {
            const target = e.target;
            const buyBtn = target.closest('.shopping-cart-buy-button');

            if (buyBtn) {
                lastBuyClickTime = Date.now();
            }
        },
        { capture: true },
    );
}

function processDialog(dialog) {
    if (Date.now() - lastBuyClickTime > 2000) return;

    if (dialog.querySelector('.rovalra-robux-after')) return;

    const heading = dialog.querySelector('#rbx-unified-purchase-heading');
    if (!heading) return;

    const balanceEl = heading.querySelector('.text-robux');
    if (!balanceEl) return;

    const balanceText = balanceEl.textContent.replace(/,/g, '').trim();
    const balance = parseInt(balanceText, 10);

    if (isNaN(balance)) return;

    const allRobuxTexts = Array.from(dialog.querySelectorAll('.text-robux'));
    const priceEl = allRobuxTexts.find((el) => !heading.contains(el));

    if (!priceEl) return;

    const priceText = priceEl.textContent.replace(/,/g, '').trim();
    const price = parseInt(priceText, 10);

    if (isNaN(price)) return;

    const after = balance - price;

    const container = document.createElement('div');
    container.className = 'rovalra-robux-after';
    container.style.width = '100%';

    container.innerHTML = safeHtml`
        <span class="text-body-medium" style="color: var(--rovalra-secondary-text-color);">${ts('purchasePrompt.balanceAfter')} <span class="icon-robux-16x16" style="vertical-align: middle; position: relative; top: -1px;"></span> <span class="text-robux" style="${after < 0 ? 'color: #d32f2f;' : ''}">${after.toLocaleString()}</span></span>
    `;

    const infoContainer = priceEl.closest('.min-w-0.flex.flex-col.gap-small');
    if (infoContainer) {
        infoContainer.appendChild(container);
    }
}

export function init() {
    chrome.storage.local.get({ EnableRobuxAfterPurchase: true }, (settings) => {
        if (!settings.EnableRobuxAfterPurchase) return;

        setupClickListener();
        observeElement('.unified-purchase-dialog-content', (el) => {
            processDialog(el);
        });
    });
}
