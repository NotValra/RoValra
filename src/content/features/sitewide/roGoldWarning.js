import { createOverlay } from '../../core/ui/overlay.js';
import { createButton } from '../../core/ui/buttons.js';
import { ts } from '../../core/locale/i18n.js';
import { observeElement } from '../../core/observer.js';

const ROGOLD_SELECTOR = '#rgu-shell-settling-style';
const DISMISSED_KEY = 'roGoldWarningDismissed';
const OBSERVE_TIMEOUT_MS = 20000;
const CLOSE_DELAY_SECONDS = 3;
const OVERLAY_ID = 'rovalra-rogold-warning';
const FONT_SIZE = '13px';
let warningShown = false;

function setDisabled(button, disabled) {
    button.disabled = disabled;
    button.setAttribute('aria-disabled', String(disabled));
}

function forceFontSize(root) {
    [root, ...root.querySelectorAll('*')].forEach((el) => {
        el.style.setProperty('font-size', FONT_SIZE, 'important');
    });
}

function showRoGoldWarning() {
    if (warningShown || !document.body) return;
    warningShown = true;

    const bodyContent = document.createElement('div');
    bodyContent.className = 'text-body';
    bodyContent.style.lineHeight = '1.5';

    const paragraphs = [
        ts('roGoldWarning.detected'),
        ts('roGoldWarning.notOurFault'),
        ts('roGoldWarning.choice'),
    ];
    paragraphs.forEach((text, index) => {
        const p = document.createElement('p');
        p.textContent = text;
        p.style.margin = index === paragraphs.length - 1 ? '0' : '0 0 10px';
        bodyContent.appendChild(p);
    });

    const closeText = ts('common.close');
    const closeBtn = createButton(closeText, 'primary', {
        onClick: () => close(),
    });

    const { close, overlay } = createOverlay({
        title: ts('roGoldWarning.title'),
        bodyContent,
        actions: [closeBtn],
        maxWidth: '450px',
        showLogo: true,
        preventBackdropClose: true,
        showCloseButton: false,
        onClose: () => {
            chrome.storage.local.set({ [DISMISSED_KEY]: true });
        },
    });

    overlay.id = OVERLAY_ID;
    setDisabled(closeBtn, true);

    let remainingSeconds = CLOSE_DELAY_SECONDS;
    const updateCountdown = () => {
        if (remainingSeconds > 0) {
            closeBtn.textContent = `${closeText} (${remainingSeconds})`;
            remainingSeconds -= 1;
            return;
        }
        closeBtn.textContent = closeText;
        setDisabled(closeBtn, false);
        clearInterval(countdownId);
    };
    updateCountdown();
    forceFontSize(overlay);
    const countdownId = setInterval(updateCountdown, 1000);
}

export async function init() {
    const { [DISMISSED_KEY]: dismissed } =
        await chrome.storage.local.get(DISMISSED_KEY);
    if (dismissed) return;

    const request = observeElement(ROGOLD_SELECTOR, () => {
        if (document.body) {
            showRoGoldWarning();
        } else {
            document.addEventListener('DOMContentLoaded', showRoGoldWarning, {
                once: true,
            });
        }
    });
    setTimeout(() => request.disconnect(), OBSERVE_TIMEOUT_MS);
}
