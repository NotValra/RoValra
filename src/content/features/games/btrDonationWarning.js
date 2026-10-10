import { showConfirmationPrompt } from '../../core/ui/confirmationPrompt.js';
import { ts } from '../../core/locale/i18n.js';

const STORE_SECTION_PATH = '/games/store-section/';
const WARNING_MARKER = 'data-rovalra-btr-warning-shown';
let observerStarted = false;

function isStoreSectionPage() {
    const pathname = window.location.pathname.toLowerCase();
    const normalizedPath = pathname.replace(/^\/[a-z]{2}(?:-[a-z]{2})?\//, '/');
    return normalizedPath.startsWith(STORE_SECTION_PATH);
}

function showBtrWarning() {
    const html = document.documentElement;
    if (!isStoreSectionPage() || html?.getAttribute('btr-loaded') !== 'true') {
        return;
    }

    if (html.getAttribute(WARNING_MARKER) === window.location.href) return;
    html.setAttribute(WARNING_MARKER, window.location.href);

    showConfirmationPrompt({
        title: ts('btrDonationWarning.title'),
        message: ts('btrDonationWarning.message'),
        confirmText: ts('btrDonationWarning.continue'),
        cancelText: ts('common.close'),
        confirmType: 'primary-destructive',
        closeBtnCallsCancel: false,
        preventBackdropClose: true,
        closeDelay: 3000,
    });
}

export function init() {
    showBtrWarning();

    const html = document.documentElement;
    if (!html) return;

    if (observerStarted) return;
    observerStarted = true;

    const observer = new MutationObserver((mutations) => {
        if (
            mutations.some(
                (mutation) => mutation.attributeName === 'btr-loaded',
            )
        ) {
            showBtrWarning();
        }
    });
    observer.observe(html, {
        attributes: true,
        attributeFilter: ['btr-loaded'],
    });
}
