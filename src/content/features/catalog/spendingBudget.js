import { observeElement, observeAttributes } from '../../core/observer.js';
import { callRobloxApiJson } from '../../core/api.js';
import { getAuthenticatedUserId } from '../../core/user.js';
import { safeHtml } from '../../core/packages/dompurify.js';
import { ts } from '../../core/locale/i18n.js';
import { settings } from '../../core/settings/getSettings.js';

const TIME_FRAMES = { week: 'Week', month: 'Month' };
const CACHE_TTL = 60 * 1000;
const WARN_AT = 0.8;
const COOLDOWN_SECONDS = 5;

let cachedSpend = null;

async function getSpentInPeriod(period) {
    if (
        cachedSpend &&
        cachedSpend.period === period &&
        Date.now() - cachedSpend.time < CACHE_TTL
    ) {
        return cachedSpend.value;
    }

    const userId = await getAuthenticatedUserId();
    if (!userId) return null;

    const response = await callRobloxApiJson({
        subdomain: 'economy',
        endpoint: `/v2/users/${userId}/transaction-totals?timeFrame=${TIME_FRAMES[period] || 'Month'}&transactionType=summary`,
        useBackground: true,
        noCache: true,
    }).catch(() => null);

    const purchases = Number(response?.purchasesTotal);
    if (!Number.isFinite(purchases)) return null;

    const value = Math.abs(purchases);
    cachedSpend = { period, value, time: Date.now() };
    return value;
}

function findBuyButton(dialog) {
    return (
        dialog.querySelector('[data-testid="purchase-confirm-button"]') ||
        dialog.querySelector(
            'button.bg-action-emphasis:not(.btn-save-robux):not(.rovalra-budget-unlock)',
        )
    );
}

function getState(spent, price, budget) {
    const after = spent + price;
    if (after > budget) return 'over';
    if (after >= budget * WARN_AT) return 'warn';
    return 'ok';
}

function renderMeter(container, { spent, price, budget, period, state }) {
    const spentPct = Math.min(100, (spent / budget) * 100);
    const pricePct = Math.max(
        0,
        Math.min(100, ((spent + price) / budget) * 100) - spentPct,
    );
    const remaining = budget - spent - price;

    container.dataset.state = state;
    container.innerHTML = safeHtml`
        <div class="rovalra-budget-header">
            <span class="text-body-medium">${ts(`spendingBudget.period.${period}`)}</span>
            <span class="text-body-medium rovalra-budget-numbers">
                <span class="icon-robux-16x16"></span>
                ${(spent + price).toLocaleString()} / ${budget.toLocaleString()}
            </span>
        </div>
        <div class="rovalra-budget-bar" role="meter" aria-valuemin="0" aria-valuemax="${budget}" aria-valuenow="${spent + price}">
            <div class="rovalra-budget-bar-spent"></div>
            <div class="rovalra-budget-bar-price"></div>
        </div>
        <span class="text-caption-medium rovalra-budget-hint">${
            remaining >= 0
                ? ts('spendingBudget.remainingAfter', {
                      value: remaining.toLocaleString(),
                  })
                : ts('spendingBudget.overBy', {
                      value: Math.abs(remaining).toLocaleString(),
                  })
        }</span>
    `;

    container.querySelector('.rovalra-budget-bar-spent').style.width =
        `${spentPct}%`;
    container.querySelector('.rovalra-budget-bar-price').style.width =
        `${pricePct}%`;
}

function applyCooldown(dialog, buyButton, delaySeconds) {
    if (dialog.querySelector('.rovalra-budget-unlock')) return;

    buyButton.classList.add('rovalra-budget-locked');

    const unlock = document.createElement('button');
    unlock.type = 'button';
    unlock.className = `${buyButton.className} rovalra-budget-unlock`;
    unlock.classList.remove('rovalra-budget-locked');
    unlock.disabled = true;
    buyButton.insertAdjacentElement('afterend', unlock);

    let remaining = delaySeconds;
    const tick = () => {
        if (remaining > 0) {
            unlock.textContent = ts('spendingBudget.waitToBuy', {
                seconds: remaining,
            });
            remaining--;
            return;
        }
        clearInterval(timer);
        unlock.disabled = false;
        unlock.textContent = ts('spendingBudget.buyAnyway');
    };
    tick();
    const timer = setInterval(tick, 1000);

    unlock.addEventListener('click', () => {
        buyButton.classList.remove('rovalra-budget-locked');
        unlock.remove();
    });
}

async function processDialog(dialog) {
    const price = parseInt(
        dialog.getAttribute('data-rovalra-expected-price'),
        10,
    );
    if (!Number.isFinite(price) || price <= 0) return;

    const budget = Number(await settings.spendingBudgetAmount);
    if (!Number.isFinite(budget) || budget <= 0) return;

    const period = (await settings.spendingBudgetPeriod) || 'month';
    const spent = await getSpentInPeriod(period);
    if (spent === null || !dialog.isConnected) return;

    const state = getState(spent, price, budget);

    let container = dialog.querySelector('.rovalra-spending-budget');
    if (!container) {
        container = document.createElement('div');
        container.className = 'rovalra-spending-budget';
        const heading = dialog.querySelector('#rbx-unified-purchase-heading');
        (heading?.parentElement || dialog).appendChild(container);
    }

    renderMeter(container, {
        spent,
        price,
        budget,
        period,
        state,
    });

    if (state === 'over') {
        const buyButton = findBuyButton(dialog);
        if (buyButton) {
            applyCooldown(dialog, buyButton, COOLDOWN_SECONDS);
        }
    }
}

export async function init() {
    if (!(await settings.spendingBudgetEnabled)) return;

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
}
