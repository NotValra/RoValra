import { observeElement } from '../observer.js';
import { callRobloxApiJson } from '../api.js';
import { cleanPrice } from '../utils/priceCleaner.js';
import {
    convertCurrencyAmount,
    DEVEX_USD_RATE,
    formatDisplayCurrency,
    getRobuxFiatSettings,
    ROBUX_FIAT_ESTIMATE_DEFAULT_COLOR,
    ROBUX_FIAT_ESTIMATE_DEFAULT_GRADIENT,
    ROBUX_FIAT_ESTIMATE_STYLE_MODE_GRADIENT,
    ROBUX_FIAT_RATE_MODE_DEVEX,
} from '../transactions/fiat.js';

const ROBUX_ICON_SVG = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><path d='M15.0762 7.29574C15.6479 6.96571 16.3521 6.96571 16.9238 7.29574L23.0762 10.8479C23.6479 11.1779 24 11.7878 24 12.4479V19.5521C24 20.2122 23.6479 20.8221 23.0762 21.1521L16.9238 24.7043C16.3521 25.0343 15.6479 25.0343 15.0762 24.7043L8.92376 21.1521C8.35214 20.8221 8 20.2122 8 19.5521V12.4479C8 11.7878 8.35214 11.1779 8.92376 10.8479L15.0762 7.29574ZM11.9998 13V19C11.9998 19.5523 12.4475 20 12.9998 20H18.9998C19.5521 20 19.9998 19.5523 19.9998 19V13C19.9998 12.4477 19.5521 12 18.9998 12H12.9998C12.4475 12 11.9998 12.4477 11.9998 13Z'/><path d='M13.8556 2.56068C15.1825 1.81311 16.8175 1.81311 18.1444 2.56068L26.8556 7.46819C28.1825 8.21577 29 9.59734 29 11.0925V20.9075C29 22.4027 28.1825 23.7842 26.8556 24.5318L18.1444 29.4393C16.8175 30.1869 15.1825 30.1869 13.8556 29.4393L5.14444 24.5318C3.81746 23.7842 3 22.4027 3 20.9075V11.0925C3 9.59734 3.81746 8.21577 5.14444 7.46819L13.8556 2.56068ZM17.1628 4.30319C16.4452 3.89894 15.5548 3.89894 14.8372 4.30319L6.12611 9.2107C5.41362 9.61209 5 10.336 5 11.0925V20.9075C5 21.664 5.41362 22.3879 6.12611 22.7893L14.8372 27.6968C15.5548 28.1011 16.4452 28.1011 17.1628 27.6968L25.8739 22.7893C26.5864 22.3879 27 21.664 27 20.9075V11.0925C27 10.336 26.5864 9.61209 25.8739 9.2107L17.1628 4.30319Z'/></svg>`;

const ROBUX_ICON_MASK_URI = `data:image/svg+xml,${encodeURIComponent(ROBUX_ICON_SVG)}`;

const DEFAULT_SIZE = '16px';
const DEFAULT_COLOR = 'currentColor';
const VALUE_TEXT_SELECTOR =
    '.text-robux, .text-robux-tile, .text-robux-lg, .robux-line-value, #rovalra-stat-robux, #nav-robux-amount, .rovalra-stat-value';
const USD_TARGET_ICON_SELECTOR =
    '.icon-robux-16x16, .icon-robux-28x28, .icon-robux-gray-16x16, .icon-robux-tile, .rovalra-robux-icon';
const USD_TARGET_VALUE_SELECTOR =
    `${VALUE_TEXT_SELECTOR}, .item-card-price, .store-card-price, .subscription-card-price, .icon-robux-container, .amount.icon-robux-container, .amount-cell, #navbar-robux .nav-robux-icon, #rbx-game-passes .store-card-price, #roseal-game-passes .store-card-price, .gear-passes-container .store-card-price, .game-dev-store .store-card-price`;
const IGNORE_USD_SELECTOR =
    '.rovalra-usd-estimate, .tooltip, .modal-dialog, #rovalra-stat-transactions, #rovalra-premium-breakdown-container';

let robuxPricingPromise = null;

function scheduleUsdRefresh(delay = 0) {
    window.setTimeout(() => {
        refreshVisibleUsdEstimates();
    }, delay);
}

function removeAllEstimates() {
    document
        .querySelectorAll('.rovalra-usd-estimate')
        .forEach((el) => el.remove());
    document
        .querySelectorAll('[data-rovalra-usd-amount]')
        .forEach((el) => {
            delete el.dataset.rovalraUsdAmount;
        });
}

function isTransactionsPage() {
    return window.location.pathname.startsWith('/transactions');
}

function isGroupRevenuePage() {
    return (
        window.location.pathname.startsWith('/communities/configure') &&
        window.location.hash.includes('/revenue')
    );
}

function isTransactionsSummaryElement(element) {
    return (
        element instanceof HTMLElement &&
        element.closest('#transactions-web-app .summary table.summary') !== null
    );
}

function isGroupRevenueSummaryElement(element) {
    return (
        element instanceof HTMLElement &&
        element.closest('#configure-group-web-app revenue-summary table.section-content') !== null
    );
}

async function getRobuxPricingData() {
    if (robuxPricingPromise) return robuxPricingPromise;

    robuxPricingPromise = (async () => {
        const productsData = await callRobloxApiJson({
            subdomain: 'premiumfeatures',
            endpoint: '/v1/products?skipPremiumUserCheck=true',
        });

        const rawProducts = Array.isArray(productsData?.products)
            ? productsData.products
            : [];

        const products = rawProducts
            .map((product) => {
                const robuxAmount = Number(product?.robuxAmount);
                const priceAmount = Number(
                    product?.price?.amount ??
                        product?.priceAmount ??
                        product?.amount,
                );

                return {
                    robuxAmount,
                    price: {
                        amount: priceAmount,
                        currency:
                            product?.price?.currency || {
                                currencyCode: 'USD',
                            },
                    },
                    premiumFeatureTypeName:
                        product?.premiumFeatureTypeName || '',
                    subscriptionTypeName: product?.subscriptionTypeName || '',
                };
            })
            .filter(
                (product) =>
                    Number.isFinite(product.robuxAmount) &&
                    product.robuxAmount > 0 &&
                    Number.isFinite(product.price.amount) &&
                    product.price.amount > 0,
            );

        if (!products.some((product) => product.robuxAmount === 80)) {
            products.push({
                robuxAmount: 80,
                price: {
                    amount: 0.99,
                    currency:
                        products[0]?.price?.currency || {
                            currencyCode: 'USD',
                        },
                },
            });
        }

        products.sort((a, b) => a.robuxAmount - b.robuxAmount);

        return {
            currencyCode: products[0]?.price?.currency?.currencyCode || 'USD',
            products,
        };
    })().catch((error) => {
        robuxPricingPromise = null;
        throw error;
    });

    return robuxPricingPromise;
}

function estimateUsdValue(robuxAmount, pricingData) {
    const products = pricingData?.products || [];
    if (!products.length || !Number.isFinite(robuxAmount) || robuxAmount <= 0) {
        return null;
    }

    const exact = products.find((product) => product.robuxAmount === robuxAmount);
    if (exact) return exact.price.amount;

    const lower = [...products]
        .reverse()
        .find((product) => product.robuxAmount < robuxAmount);
    const upper = products.find((product) => product.robuxAmount > robuxAmount);

    if (lower && upper) {
        const range = upper.robuxAmount - lower.robuxAmount;
        if (range > 0) {
            const progress = (robuxAmount - lower.robuxAmount) / range;
            return lower.price.amount + (upper.price.amount - lower.price.amount) * progress;
        }
    }

    const fallback = lower || upper || products[0];
    const perRobux = fallback.price.amount / fallback.robuxAmount;
    return robuxAmount * perRobux;
}

function getEstimateFreeText(element) {
    if (!(element instanceof HTMLElement)) return '';

    const clone = element.cloneNode(true);
    if (!(clone instanceof HTMLElement)) return element.textContent || '';

    clone
        .querySelectorAll('.rovalra-usd-estimate')
        .forEach((estimateNode) => estimateNode.remove());

    return clone.textContent || '';
}

function getRobuxAmountFromElement(element) {
    return cleanPrice(getEstimateFreeText(element));
}

function getEstimateAnchor(element) {
    if (!(element instanceof HTMLElement)) return null;

    if (element.matches('.balance-label.icon-robux-container')) {
        const balanceText = Array.from(element.children).find(
            (child) =>
                child instanceof HTMLElement &&
                child.tagName === 'SPAN' &&
                getRobuxAmountFromElement(child) > 0,
        );
        if (balanceText instanceof HTMLElement) return balanceText;
    }

    if (element.matches('.text-label.icon-robux-container')) {
        const groupFundsValue = element.querySelector('.text-robux');
        if (groupFundsValue instanceof HTMLElement) return groupFundsValue;
    }

    if (
        element.matches(
            'td.icon-robux-container, td.amount.icon-robux-container, td.amount.amount-cell, td.icon-robux-container.amount-cell, .icon-robux-container',
        )
    ) {
        const numericChild = [...element.children]
            .reverse()
            .find((child) => {
                if (!(child instanceof HTMLElement)) return false;
                if (
                    child.matches(
                        '.rovalra-usd-estimate, .icon-robux-16x16, .icon-robux-28x28, .icon-robux-gray-16x16, .icon-robux-tile, .rovalra-robux-icon',
                    )
                ) {
                    return false;
                }

                return getRobuxAmountFromElement(child) > 0;
            });

        if (numericChild instanceof HTMLElement) return numericChild;
    }

    if (element.matches(VALUE_TEXT_SELECTOR)) {
        return element;
    }

    const nestedValue = element.querySelector(VALUE_TEXT_SELECTOR);
    if (nestedValue instanceof HTMLElement) return nestedValue;

    const childElements = Array.from(element.children).filter(
        (child) => child instanceof HTMLElement,
    );
    const textOnlyChildren = childElements.filter((child) => {
        if (!(child instanceof HTMLElement)) return false;
        if (child.matches('.rovalra-usd-estimate, .icon-robux-16x16, .icon-robux-28x28, .icon-robux-gray-16x16, .icon-robux-tile, .rovalra-robux-icon')) {
            return false;
        }
        return getRobuxAmountFromElement(child) > 0;
    });
    if (textOnlyChildren.length === 1) {
        return textOnlyChildren[0];
    }

    return element;
}

function isValidEstimateContainer(element) {
    if (!(element instanceof HTMLElement)) return false;
    if (element.closest(IGNORE_USD_SELECTOR)) return false;
    if (element.matches('.rovalra-usd-estimate')) return false;
    return true;
}

function buildEstimateStyle(fiatSettings) {
    return {
        styleMode:
            fiatSettings.robuxFiatEstimateStyleMode ===
            ROBUX_FIAT_ESTIMATE_STYLE_MODE_GRADIENT
                ? ROBUX_FIAT_ESTIMATE_STYLE_MODE_GRADIENT
                : 'solid',
        color:
            fiatSettings.robuxFiatEstimateColor ||
            ROBUX_FIAT_ESTIMATE_DEFAULT_COLOR,
        gradient: {
            ...ROBUX_FIAT_ESTIMATE_DEFAULT_GRADIENT,
            ...(fiatSettings.robuxFiatEstimateGradient || {}),
        },
        bold: fiatSettings.robuxFiatEstimateBold === true,
        italic: fiatSettings.robuxFiatEstimateItalic === true,
    };
}

async function getFormattedRobuxEstimate(robuxAmount, pricingData) {
    const fiatSettings = await getRobuxFiatSettings();
    if (!fiatSettings.robuxFiatEstimatesEnabled) return null;

    const targetCurrency = fiatSettings.robuxFiatDisplayCurrency || 'USD';
    const style = buildEstimateStyle(fiatSettings);

    if (fiatSettings.robuxFiatRateMode === ROBUX_FIAT_RATE_MODE_DEVEX) {
        const usdAmount = robuxAmount * DEVEX_USD_RATE;
        const convertedAmount = await convertCurrencyAmount(
            usdAmount,
            'USD',
            targetCurrency,
        );
        if (!Number.isFinite(convertedAmount)) return null;

        return {
            text: formatDisplayCurrency(convertedAmount, targetCurrency),
            style,
        };
    }

    const estimatedBaseAmount = estimateUsdValue(robuxAmount, pricingData);
    if (!Number.isFinite(estimatedBaseAmount)) return null;

    const sourceCurrency = pricingData?.currencyCode || 'USD';
    const convertedAmount = await convertCurrencyAmount(
        estimatedBaseAmount,
        sourceCurrency,
        targetCurrency,
    );
    if (!Number.isFinite(convertedAmount)) return null;

    return {
        text: formatDisplayCurrency(convertedAmount, targetCurrency),
        style,
    };
}

function applyEstimateStyle(el, style) {
    if (!(el instanceof HTMLElement)) return;

    const useGradient =
        style?.styleMode === ROBUX_FIAT_ESTIMATE_STYLE_MODE_GRADIENT &&
        style.gradient?.enabled !== false &&
        style.gradient?.color1 &&
        style.gradient?.color2;

    if (useGradient) {
        const g = style.gradient;
        const fade = Number.isFinite(g.fade) ? g.fade : 100;
        const s1 = (100 - fade) / 2;
        const s2 = 100 - s1;
        const angle = Number.isFinite(g.angle) ? g.angle : 90;
        const bg = `linear-gradient(${angle}deg, ${g.color1} ${s1}%, ${g.color2} ${s2}%)`;

        if (el.style.backgroundImage !== bg) {
            el.style.backgroundImage = bg;
        }
        el.style.backgroundClip = 'text';
        el.style.webkitBackgroundClip = 'text';
        el.style.color = 'transparent';
        el.style.webkitTextFillColor = 'transparent';
    } else {
        if (el.style.backgroundImage) el.style.backgroundImage = '';
        if (el.style.backgroundClip) el.style.backgroundClip = '';
        if (el.style.webkitBackgroundClip) el.style.webkitBackgroundClip = '';
        if (el.style.webkitTextFillColor) el.style.webkitTextFillColor = '';
        const color = style?.color || ROBUX_FIAT_ESTIMATE_DEFAULT_COLOR;
        if (el.style.color !== color) el.style.color = color;
    }

    const fontWeight = style?.bold ? '700' : '';
    if (el.style.fontWeight !== fontWeight) el.style.fontWeight = fontWeight;
    const fontStyle = style?.italic ? 'italic' : '';
    if (el.style.fontStyle !== fontStyle) el.style.fontStyle = fontStyle;
}

function upsertEstimate(anchorElement, estimate, options = {}) {
    const anchor = getEstimateAnchor(anchorElement);
    if (!(anchor instanceof HTMLElement)) return null;
    const compact = options.compact === true;
    const appendInside = options.appendInside === true;

    const text = typeof estimate === 'string' ? estimate : estimate?.text;
    if (!text) return null;
    const style = typeof estimate === 'object' ? estimate?.style : null;

    let estimateEl = null;

    if (appendInside) {
        estimateEl = Array.from(anchor.children).find(
            (child) =>
                child instanceof HTMLElement &&
                child.classList.contains('rovalra-usd-estimate'),
        );
    } else {
        estimateEl =
            anchor.nextElementSibling instanceof HTMLElement &&
            anchor.nextElementSibling.classList.contains('rovalra-usd-estimate')
                ? anchor.nextElementSibling
                : null;
    }

    if (!estimateEl) {
        estimateEl = document.createElement('span');
        estimateEl.className = 'rovalra-usd-estimate';
        Object.assign(estimateEl.style, {
            marginLeft: compact ? '2px' : '4px',
            fontSize: compact ? '0.85em' : '0.9em',
            whiteSpace: 'nowrap',
            display: 'inline-block',
        });
        if (appendInside) {
            anchor.appendChild(estimateEl);
        } else {
            anchor.insertAdjacentElement('afterend', estimateEl);
        }
    }

    applyEstimateStyle(estimateEl, style);

    const nextText = ` \u2248 ${text}`;
    if (estimateEl.textContent !== nextText) {
        estimateEl.textContent = nextText;
    }

    return estimateEl;
}

function getTransactionsLabelAnchor(element) {
    if (!isTransactionsPage() || !(element instanceof HTMLElement)) return null;

    const row = element.closest('tr');
    if (!(row instanceof HTMLTableRowElement)) return null;

    const cells = Array.from(row.children).filter(
        (child) => child instanceof HTMLElement,
    );
    if (cells.length < 2) return null;

    const labelCell = cells.find(
        (cell) =>
            !cell.matches('.amount, .amount-cell, .icon-robux-container') &&
            !cell.querySelector('.icon-robux-16x16, .icon-robux-28x28, .icon-robux-gray-16x16, .icon-robux-tile'),
    );

    if (!(labelCell instanceof HTMLElement)) return null;

    return labelCell;
}

async function attachTransactionsCellEstimate(labelCell) {
    if (!isTransactionsPage()) return;
    if (!(labelCell instanceof HTMLElement)) return;

    const row = labelCell.closest('tr');
    if (!(row instanceof HTMLTableRowElement)) return;

    const labelHasRobuxValue =
        (labelCell.classList.contains('icon-robux-container') ||
            labelCell.querySelector(
                '.icon-robux-16x16, .icon-robux-28x28, .icon-robux-gray-16x16, .icon-robux-tile',
            )) &&
        getRobuxAmountFromElement(labelCell) > 0;

    const targetCell = labelHasRobuxValue
        ? labelCell
        : row.querySelector(
              'td.amount.icon-robux-container, td.amount.amount-cell, td.icon-robux-container.amount-cell, td.icon-robux-container',
          );
    if (!(targetCell instanceof HTMLElement)) return;

    const amount = getRobuxAmountFromElement(targetCell);
    if (!amount) return;

    try {
        const pricingData = await getRobuxPricingData();
        const formattedEstimate = await getFormattedRobuxEstimate(
            amount,
            pricingData,
        );
        if (!formattedEstimate) return;

        upsertEstimate(targetCell, formattedEstimate, {
            compact: true,
            appendInside: true,
        });
        labelCell.dataset.rovalraUsdAmount = String(amount);
    } catch (error) {
        /* ignore */
    }
}

function shouldIgnoreEstimateMutation(mutations) {
    return mutations.every((mutation) => {
        if (mutation.target instanceof HTMLElement) {
            return mutation.target.closest('.rovalra-usd-estimate') !== null;
        }

        if (
            mutation.target instanceof Text &&
            mutation.target.parentElement instanceof HTMLElement
        ) {
            return (
                mutation.target.parentElement.closest('.rovalra-usd-estimate') !==
                null
            );
        }

        return Array.from(mutation.addedNodes).every((node) => {
            if (node instanceof HTMLElement) {
                return node.closest('.rovalra-usd-estimate') !== null;
            }
            if (
                node instanceof Text &&
                node.parentElement instanceof HTMLElement
            ) {
                return node.parentElement.closest('.rovalra-usd-estimate') !== null;
            }
            return true;
        });
    });
}

function processTransactionsTable(summaryRoot) {
    if (!isTransactionsPage()) return;
    if (!(summaryRoot instanceof HTMLElement)) return;

    summaryRoot
        .querySelectorAll(
            'td.summary-transaction-label, td.summary-transaction-pending-text',
        )
        .forEach((labelCell) => {
            if (!(labelCell instanceof HTMLElement)) return;
            attachTransactionsCellEstimate(labelCell);
        });
}

function observeTransactionsSummary(summaryRoot) {
    if (!(summaryRoot instanceof HTMLElement)) return;

    processTransactionsTable(summaryRoot);

    if (summaryRoot.dataset.rovalraUsdObserverAttached === 'true') return;

    let scheduled = false;
    const observer = new MutationObserver((mutations) => {
        if (shouldIgnoreEstimateMutation(mutations)) return;
        if (scheduled) return;
        scheduled = true;

        queueMicrotask(() => {
            scheduled = false;
            processTransactionsTable(summaryRoot);
        });
    });

    observer.observe(summaryRoot, {
        childList: true,
        subtree: true,
        characterData: true,
    });

    summaryRoot.dataset.rovalraUsdObserverAttached = 'true';
}

function hasMatchingEstimate(amountCell, formattedEstimate) {
    if (!(amountCell instanceof HTMLElement)) return false;
    const anchor = getEstimateAnchor(amountCell);
    if (!(anchor instanceof HTMLElement)) return false;

    const currentEstimate =
        anchor.nextElementSibling instanceof HTMLElement &&
        anchor.nextElementSibling.classList.contains('rovalra-usd-estimate')
            ? anchor.nextElementSibling
            : anchor.querySelector(':scope > .rovalra-usd-estimate');

    return (
        currentEstimate instanceof HTMLElement &&
        currentEstimate.textContent === ` \u2248 ${formattedEstimate}`
    );
}

async function attachGroupRevenueEstimate(amountCell) {
    if (!isGroupRevenuePage()) return;
    if (!(amountCell instanceof HTMLElement)) return;

    const amount = getRobuxAmountFromElement(amountCell);
    if (!amount) return;

    try {
        const pricingData = await getRobuxPricingData();
        const formattedEstimate = await getFormattedRobuxEstimate(
            amount,
            pricingData,
        );
        if (hasMatchingEstimate(amountCell, formattedEstimate)) return;

        upsertEstimate(amountCell, formattedEstimate, { compact: true });
        amountCell.dataset.rovalraUsdAmount = String(amount);
    } catch (error) {
        /* ignore */
    }
}

function processGroupRevenue(summaryRoot) {
    if (!isGroupRevenuePage()) return;
    if (!(summaryRoot instanceof HTMLElement)) return;

    summaryRoot
        .querySelectorAll(
            'revenue-summary .text-label.icon-robux-container, revenue-summary table.section-content td.icon-robux-container',
        )
        .forEach((amountCell) => {
            if (!(amountCell instanceof HTMLElement)) return;
            attachGroupRevenueEstimate(amountCell);
        });
}

function observeGroupRevenue(root) {
    if (!(root instanceof HTMLElement)) return;

    processGroupRevenue(root);

    if (root.dataset.rovalraGroupRevenueObserverAttached === 'true') return;

    let scheduled = false;
    const observer = new MutationObserver((mutations) => {
        if (shouldIgnoreEstimateMutation(mutations)) return;
        if (scheduled) return;
        scheduled = true;

        queueMicrotask(() => {
            scheduled = false;
            processGroupRevenue(root);
        });
    });

    observer.observe(root, {
        childList: true,
        subtree: true,
        characterData: true,
    });

    root.dataset.rovalraGroupRevenueObserverAttached = 'true';
}

function findAmountElementForIcon(icon) {
    const parent = icon.parentElement;
    if (!parent) return null;

    const candidates = [
        icon.nextElementSibling,
        parent,
        parent.nextElementSibling,
        parent.closest('.icon-robux-container, .text.font-body'),
        parent.closest('#navbar-robux'),
        icon.closest(
            '.item-card-price, .store-card-price, .subscription-card-price, .amount.icon-robux-container, .amount-cell, .rovalra-stat-value',
        ),
    ].filter(Boolean);

    for (const candidate of candidates) {
        if (!(candidate instanceof HTMLElement)) continue;
        if (!isValidEstimateContainer(candidate)) continue;

        const anchor = getEstimateAnchor(candidate);
        if (!(anchor instanceof HTMLElement)) continue;

        const value = getRobuxAmountFromElement(anchor);
        const textLength = getEstimateFreeText(anchor).trim().length;
        if (value > 0 && textLength <= 48) {
            return { element: anchor, amount: value };
        }
    }

    return null;
}

function findAmountElementForValueNode(element) {
    if (!isValidEstimateContainer(element)) return null;

    const anchor = getEstimateAnchor(element);
    if (!(anchor instanceof HTMLElement)) return null;

    const value = getRobuxAmountFromElement(anchor);
    if (!value) return null;

    const textLength = getEstimateFreeText(anchor).trim().length;
    if (textLength > 48) return null;

    return { element: anchor, amount: value };
}

async function attachUsdEstimate(icon) {
    if (!(icon instanceof HTMLElement)) return;
    if (icon.closest(IGNORE_USD_SELECTOR)) return;
    if (isTransactionsSummaryElement(icon) || isGroupRevenueSummaryElement(icon)) {
        return;
    }

    const amountInfo = findAmountElementForIcon(icon);
    if (!amountInfo) return;

    const { element, amount } = amountInfo;

    try {
        const pricingData = await getRobuxPricingData();
        const formattedEstimate = await getFormattedRobuxEstimate(
            amount,
            pricingData,
        );
        if (!formattedEstimate) return;

        upsertEstimate(element, formattedEstimate);
        icon.dataset.rovalraUsdAmount = String(amount);
    } catch (error) {
        /* ignore */
    }
}

async function attachUsdEstimateToValueElement(element) {
    if (!(element instanceof HTMLElement)) return;
    if (
        isTransactionsSummaryElement(element) ||
        isGroupRevenueSummaryElement(element)
    ) {
        return;
    }

    const amountInfo = findAmountElementForValueNode(element);
    if (!amountInfo) return;

    const { element: amountElement, amount } = amountInfo;

    try {
        const pricingData = await getRobuxPricingData();
        const formattedEstimate = await getFormattedRobuxEstimate(
            amount,
            pricingData,
        );
        if (!formattedEstimate) return;

        upsertEstimate(amountElement, formattedEstimate);
        amountElement.dataset.rovalraUsdAmount = String(amount);
    } catch (error) {
        /* ignore */
    }
}

function refreshVisibleUsdEstimates() {
    document
        .querySelectorAll(USD_TARGET_ICON_SELECTOR)
        .forEach((element) => attachUsdEstimate(element));

    document
        .querySelectorAll(USD_TARGET_VALUE_SELECTOR)
        .forEach((element) => attachUsdEstimateToValueElement(element));

    document
        .querySelectorAll('#transactions-web-app .summary')
        .forEach((element) => processTransactionsTable(element));

    document
        .querySelectorAll('#configure-group-web-app')
        .forEach((element) => processGroupRevenue(element));
}

export function applyRobuxIcon(element, options = {}) {
    if (!(element instanceof HTMLElement)) {
        console.warn('RoValra: applyRobuxIcon requires an HTMLElement');
        return;
    }

    const {
        size = DEFAULT_SIZE,
        color = DEFAULT_COLOR,
        verticalAlign = 'middle',
    } = options;

    element.style.width = size;
    element.style.height = size;
    element.style.backgroundColor = color;
    element.style.verticalAlign = verticalAlign;
    element.style.maskImage = `url("${ROBUX_ICON_MASK_URI}")`;
    element.style.webkitMaskImage = `url("${ROBUX_ICON_MASK_URI}")`;
    element.style.maskSize = 'contain';
    element.style.webkitMaskSize = 'contain';
    element.style.maskRepeat = 'no-repeat';
    element.style.webkitMaskRepeat = 'no-repeat';
    element.style.maskPosition = 'center';
    element.style.webkitMaskPosition = 'center';
    element.style.maskMode = 'alpha';
    element.style.webkitMaskMode = 'alpha';
    element.style.display = 'inline-block';

    return element;
}

export function createRobuxIcon(options = {}) {
    const {
        size = DEFAULT_SIZE,
        color = DEFAULT_COLOR,
        verticalAlign = 'middle',
        className = '',
        id = '',
    } = options;

    const icon = document.createElement('span');

    if (id) icon.id = id;

    const classes = ['rovalra-robux-icon'];
    if (className) classes.push(className);
    icon.className = classes.join(' ');

    applyRobuxIcon(icon, { size, color, verticalAlign });

    icon.dataset.rovalraProcessed = 'true';

    return icon;
}

export function processRobuxIcons(container = document, defaultOptions = {}) {
    const elements = container.querySelectorAll('.rovalra-robux-icon');
    const processed = [];

    elements.forEach((element) => {
        const size =
            element.dataset.size || defaultOptions.size || DEFAULT_SIZE;
        const color =
            element.dataset.color || defaultOptions.color || DEFAULT_COLOR;
        const verticalAlign =
            element.dataset.verticalAlign ||
            defaultOptions.verticalAlign ||
            'middle';

        applyRobuxIcon(element, { size, color, verticalAlign });
        processed.push(element);
    });

    return processed;
}

export function init() {
    const refreshEvents = ['load', 'pageshow', 'hashchange', 'popstate'];
    refreshEvents.forEach((eventName) => {
        window.addEventListener(eventName, () => {
            scheduleUsdRefresh(0);
            scheduleUsdRefresh(300);
            scheduleUsdRefresh(1200);
        });
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local') return;

        const styleKeys = [
            'robuxFiatEstimateColor',
            'robuxFiatEstimateStyleMode',
            'robuxFiatEstimateGradient',
            'robuxFiatEstimateBold',
            'robuxFiatEstimateItalic',
        ];
        const rerenderKeys = [
            'robuxFiatEstimatesEnabled',
            'robuxFiatDisplayCurrency',
            'robuxFiatRateMode',
        ];

        const hasStyleChange = styleKeys.some((key) => key in changes);
        const hasRerenderChange = rerenderKeys.some((key) => key in changes);

        if (hasStyleChange && !hasRerenderChange) {
            getRobuxFiatSettings().then((fiatSettings) => {
                if (!fiatSettings.robuxFiatEstimatesEnabled) return;
                const style = buildEstimateStyle(fiatSettings);
                document
                    .querySelectorAll('.rovalra-usd-estimate')
                    .forEach((el) => applyEstimateStyle(el, style));
            });
            return;
        }

        if (!hasRerenderChange && !hasStyleChange) return;

        removeAllEstimates();
        scheduleUsdRefresh(0);
    });

    observeElement(
        '.rovalra-robux-icon',
        (element) => {
            if (!element.dataset.rovalraProcessed) {
                const size = element.dataset.size || DEFAULT_SIZE;
                const color = element.dataset.color || DEFAULT_COLOR;
                const verticalAlign = element.dataset.verticalAlign || 'middle';

                applyRobuxIcon(element, { size, color, verticalAlign });
                element.dataset.rovalraProcessed = 'true';
            }
        },
        { multiple: true },
    );

    observeElement(
        USD_TARGET_ICON_SELECTOR,
        (element) => {
            attachUsdEstimate(element);
        },
        { multiple: true },
    );

    observeElement(
        USD_TARGET_VALUE_SELECTOR,
        (element) => {
            attachUsdEstimateToValueElement(element);
        },
        { multiple: true },
    );

    observeElement('#transactions-web-app .summary', observeTransactionsSummary, {
        multiple: true,
    });

    observeElement('#configure-group-web-app', observeGroupRevenue, {
        multiple: true,
    });

    scheduleUsdRefresh(0);
    scheduleUsdRefresh(500);
    scheduleUsdRefresh(1500);

    return {
        apply: applyRobuxIcon,
        create: createRobuxIcon,
        process: () => processRobuxIcons(),
    };
}
