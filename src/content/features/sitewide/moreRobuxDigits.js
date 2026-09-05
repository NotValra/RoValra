import {
    observeAttributes,
    observeChildren,
    observeElement,
} from '../../core/observer.js';
import { settings } from '../../core/settings/getSettings.js';

const NAVBAR_AMOUNT_SELECTOR = '#nav-robux-amount, #nav-robux-balance';
const NAVBAR_AMOUNT_DATA_KEYS = [
    'rovalraNavbarRobuxAmount',
    'rovalraUsdAmount',
];

let initialized = false;

function getPrimaryText(element) {
    return Array.from(element.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent || '')
        .join('')
        .trim();
}

function getCompactParts(text) {
    const match = text.match(/^([\d,.]+)\s*([A-Za-z]+\+)$/);
    return match ? { suffix: match[2], number: match[1] } : null;
}

function getRobuxAmount(element) {
    for (const key of NAVBAR_AMOUNT_DATA_KEYS) {
        const amount = Number(element.dataset[key]);
        if (Number.isFinite(amount) && amount > 0) return amount;
    }

    return null;
}

function formatCompactNumber(
    amount,
    maximumFractionDigits,
    minimumFractionDigits = 0,
    truncate = false,
) {
    const formatted = new Intl.NumberFormat('en-US', {
        notation: 'compact',
        maximumSignificantDigits: 20,
    }).format(amount);

    const match = formatted.match(/^([\d,.]+)\s*([A-Za-z]+)?$/);
    if (!match) return null;

    let number = Number(match[1].replace(/,/g, ''));
    if (truncate) {
        const factor = 10 ** maximumFractionDigits;
        number = Math.trunc(number * factor) / factor;
    }
    return {
        number: number.toLocaleString('en-US', {
            minimumFractionDigits,
            maximumFractionDigits,
        }),
        suffix: match[2] || '',
    };
}

async function renderMoreDigits(element, amount = getRobuxAmount(element)) {
    if (!(element instanceof HTMLElement)) return;

    if (!(await settings.moreRobuxDigitsEnabled)) {
        const originalText = element.dataset.rovalraMoreRobuxDigitsOriginal;
        if (originalText) {
            const textNode = Array.from(element.childNodes).find(
                (node) => node.nodeType === Node.TEXT_NODE,
            );
            if (textNode) textNode.textContent = originalText;
            delete element.dataset.rovalraMoreRobuxDigitsOriginal;
        }
        return;
    }

    if (!amount) return;

    const configuredDigits = await settings.moreRobuxDigits;
    let currentText = getPrimaryText(element);
    let compactParts = getCompactParts(currentText);

    const originalText = element.dataset.rovalraMoreRobuxDigitsOriginal;
    if (!compactParts && originalText) {
        const textNode = Array.from(element.childNodes).find(
            (node) => node.nodeType === Node.TEXT_NODE,
        );
        if (textNode) textNode.textContent = originalText;
        delete element.dataset.rovalraMoreRobuxDigitsOriginal;
        currentText = originalText;
        compactParts = getCompactParts(currentText);
    }

    if (!compactParts) return;

    if (configuredDigits === 'all') {
        const nextText = Number(amount).toLocaleString('en-US', {
            maximumFractionDigits: 0,
        });
        if (currentText === nextText) return;

        if (element.dataset.rovalraMoreRobuxDigitsOriginal === undefined) {
            element.dataset.rovalraMoreRobuxDigitsOriginal = currentText;
        }

        const textNode = Array.from(element.childNodes).find(
            (node) => node.nodeType === Node.TEXT_NODE,
        );
        if (textNode) {
            textNode.textContent = nextText;
        } else {
            element.insertBefore(
                document.createTextNode(nextText),
                element.firstChild,
            );
        }
        return;
    }

    const maximumFractionDigits = Number(configuredDigits) || 1;

    const formatted = formatCompactNumber(
        amount,
        maximumFractionDigits,
        configuredDigits === '2' ? 2 : 0,
        configuredDigits === '2',
    );
    if (!formatted) return;

    if (
        formatted.suffix.toLowerCase() !==
        compactParts.suffix.slice(0, -1).toLowerCase()
    ) {
        return;
    }

    const nextText = `${formatted.number}${compactParts.suffix}`;
    if (currentText === nextText) return;

    if (element.dataset.rovalraMoreRobuxDigitsOriginal === undefined) {
        element.dataset.rovalraMoreRobuxDigitsOriginal = currentText;
    }

    const textNode = Array.from(element.childNodes).find(
        (node) => node.nodeType === Node.TEXT_NODE,
    );
    if (textNode) {
        textNode.textContent = nextText;
    } else {
        element.insertBefore(
            document.createTextNode(nextText),
            element.firstChild,
        );
    }
}

function refreshNavbarAmount(element) {
    renderMoreDigits(element, getRobuxAmount(element));
}

function watchNavbarAmount(element) {
    const refresh = () => refreshNavbarAmount(element);
    refresh();
    observeChildren(element, refresh);
    observeAttributes(element, refresh, NAVBAR_AMOUNT_DATA_KEYS);
}

export function init() {
    if (initialized) return;
    initialized = true;

    observeElement(NAVBAR_AMOUNT_SELECTOR, watchNavbarAmount, {
        multiple: true,
    });
    document.addEventListener('rovalra:settingSaved', () => {
        document
            .querySelectorAll(NAVBAR_AMOUNT_SELECTOR)
            .forEach(refreshNavbarAmount);
    });
}
