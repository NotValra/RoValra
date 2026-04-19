import { observeElement, observeAttributes } from '../../core/observer.js';
import { safeHtml } from '../../core/packages/dompurify.js';
import { ts } from '../../core/locale/i18n.js';
import { getUserCurrency } from '../../core/user/userCurrency.js';

async function processDialog(dialog) {
    const priceAttr = dialog.getAttribute('data-rovalra-expected-price');
    if (!priceAttr) return;

    const heading = dialog.querySelector('#rbx-unified-purchase-heading');
    if (!heading) return;

    let balance = null;
    const price = parseInt(priceAttr, 10);

    if (isNaN(price)) return;

    try {
        const currencyData = await getUserCurrency().catch(() => null);

        if (currencyData && typeof currencyData.robux === 'number') {
            balance = currencyData.robux;
        }
    } catch (e) {
        console.warn('RoValra: API fetch failed for purchase prompt', e);
    }

    if (balance === null) {
        const balanceEl = heading.querySelector('.text-robux');
        if (balanceEl) {
            const balanceText = balanceEl.textContent.replace(/,/g, '').trim();
            balance = parseInt(balanceText, 10);
        }
    }

    const allRobuxTexts = Array.from(dialog.querySelectorAll('.text-robux'));
    const priceEl = allRobuxTexts.find((el) => !heading.contains(el));

    if (!priceEl) return;

    if (balance === null || isNaN(balance)) return;

    const after = balance - price;

    let container = dialog.querySelector('.rovalra-robux-after');
    if (!container) {
        container = document.createElement('div');
        container.className = 'rovalra-robux-after';
        container.style.width = '100%';

        const infoContainer = priceEl.closest(
            '.min-w-0.flex.flex-col.gap-small',
        );
        if (infoContainer) {
            infoContainer.appendChild(container);
        }
    }

    container.innerHTML = safeHtml`
        <span class="text-body-medium" style="color: var(--rovalra-secondary-text-color);">${ts('purchasePrompt.balanceAfter')} <span class="icon-robux-16x16" style="vertical-align: middle; position: relative; top: -1px;"></span> <span class="text-robux" style="${after < 0 ? 'color: #d32f2f;' : ''}">${after.toLocaleString()}</span></span>
    `;
}

export function init() {
    chrome.storage.local.get({ EnableRobuxAfterPurchase: true }, (settings) => {
        if (!settings.EnableRobuxAfterPurchase) return;

        observeElement(
            '.unified-purchase-dialog-content',
            (el) => {
                processDialog(el);
                observeAttributes(el, () => processDialog(el), [
                    'data-rovalra-expected-price',
                ]);
            },
            { multiple: true },
        );
    });
}
