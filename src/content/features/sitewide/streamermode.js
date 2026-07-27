import { observeElement } from '../../core/observer.js';
import { ts } from '../../core/locale/i18n.js';
import { settings } from '../../core/settings/getSettings.js';

const NAVBAR_BALANCE_UPDATED_EVENT = 'rovalra:navbar-balance-updated';
const NAVBAR_FIAT_ESTIMATE_UPDATED_EVENT =
    'rovalra:navbar-fiat-estimate-updated';

export function init() {
    let isHideRobuxEnabled = false;
    let isShowRobuxOnHoverEnabled = false;
    let isSettingsPageInfoEnabled = false;

    function updateAllRobuxMasks() {
        document
            .querySelectorAll('#nav-robux-amount, #nav-robux-balance')
            .forEach(updateRobuxMask);
    }

    function measureRobuxWidth(element, text = null) {
        const measure = document.createElement('span');
        const computedStyle = getComputedStyle(element);

        Object.assign(measure.style, {
            position: 'absolute',
            visibility: 'hidden',
            whiteSpace: 'nowrap',
            font: computedStyle.font,
            letterSpacing: computedStyle.letterSpacing,
        });
        measure.textContent = text ?? element.textContent;
        document.body.appendChild(measure);
        const width = Math.ceil(measure.getBoundingClientRect().width);
        measure.remove();

        return width;
    }

    function measureFullRobuxWidth(element) {
        const measure = element.cloneNode(true);
        const computedStyle = getComputedStyle(element);

        measure.dataset.rovalraObserverIgnore = 'true';
        delete measure.dataset.rovalraHideRobux;
        delete measure.dataset.rovalraRevealRobuxOnHover;
        delete measure.dataset.rovalraHiddenRobuxLabel;
        measure.style.removeProperty('--rovalra-hidden-robux-width');
        measure.style.removeProperty('--rovalra-visible-robux-width');
        Object.assign(measure.style, {
            position: 'absolute',
            visibility: 'hidden',
            display: 'inline-block',
            width: 'auto',
            minWidth: '0',
            maxWidth: 'none',
            whiteSpace: 'nowrap',
            font: computedStyle.font,
            letterSpacing: computedStyle.letterSpacing,
        });
        document.body.appendChild(measure);
        const width = Math.ceil(measure.getBoundingClientRect().width);
        measure.remove();

        return width;
    }

    function setRobuxMaskWidths(element, hiddenRobuxText) {
        const hiddenWidth = measureRobuxWidth(element, hiddenRobuxText);
        const fullWidth = measureFullRobuxWidth(element);

        element.style.setProperty(
            '--rovalra-hidden-robux-width',
            `${hiddenWidth}px`,
        );
        element.style.setProperty(
            '--rovalra-visible-robux-width',
            `${Math.max(hiddenWidth, fullWidth)}px`,
        );
    }

    function updateRobuxMask(element) {
        if (!isHideRobuxEnabled) {
            delete element.dataset.rovalraHideRobux;
            delete element.dataset.rovalraRevealRobuxOnHover;
            delete element.dataset.rovalraHiddenRobuxLabel;
            element.style.removeProperty('--rovalra-hidden-robux-width');
            element.style.removeProperty('--rovalra-visible-robux-width');
            return;
        }

        const hiddenRobuxText = ts('streamerMode.hiddenRobux', {
            defaultValue: 'Hidden',
        });

        setRobuxMaskWidths(element, hiddenRobuxText);

        element.dataset.rovalraHideRobux = 'true';
        element.dataset.rovalraRevealRobuxOnHover = String(
            isShowRobuxOnHoverEnabled,
        );
        element.dataset.rovalraHiddenRobuxLabel = hiddenRobuxText;
    }

    function applyStreamerModeToSettingsField(element) {
        if (!isSettingsPageInfoEnabled) return;
        if (!window.location.href.includes('/my/account')) return;

        const valueSpan = element.querySelector('.settings-text-span-visible');
        if (
            valueSpan &&
            valueSpan.textContent !== 'RoValra Streamer Mode Enabled'
        ) {
            valueSpan.textContent = 'RoValra Streamer Mode Enabled';
        }
    }

    function isSensitiveAccountSettingsField(container) {
        if (container.id === 'account-field-phone') return true;

        if (container.id) return false;

        const phoneField = document.getElementById('account-field-phone');
        let sibling = phoneField?.nextElementSibling;

        while (sibling) {
            if (sibling.classList.contains('settings-text-field-container')) {
                return sibling === container;
            }

            sibling = sibling.nextElementSibling;
        }

        return false;
    }

    function updateSettingsPage() {
        if (!isSettingsPageInfoEnabled) return;
        if (!window.location.href.includes('/my/account')) return;

        document
            .querySelectorAll('.settings-text-field-container')
            .forEach((container) => {
                if (isSensitiveAccountSettingsField(container)) {
                    applyStreamerModeToSettingsField(container);
                }
            });
    }

    async function updateStreamerMode() {
        const [streamermode, settingsPageInfo, hideRobux, showRobuxOnHover] =
            await Promise.all([
                settings.streamermode,
                settings.settingsPageInfo,
                settings.hideRobux,
                settings.showRobuxOnHover,
            ]);

        try {
            if (streamermode) {
                sessionStorage.setItem('rovalra_streamermode', 'true');
                sessionStorage.setItem(
                    'rovalra_settingsPageInfo',
                    settingsPageInfo !== false ? 'true' : 'false',
                );
                sessionStorage.setItem(
                    'rovalra_hideRobux',
                    hideRobux === true ? 'true' : 'false',
                );
            } else {
                sessionStorage.removeItem('rovalra_streamermode');
            }
        } catch (e) {}

        isHideRobuxEnabled = streamermode && hideRobux === true;
        isShowRobuxOnHoverEnabled =
            isHideRobuxEnabled && showRobuxOnHover === true;
        isSettingsPageInfoEnabled =
            streamermode && settingsPageInfo !== false;

        updateAllRobuxMasks();

        updateSettingsPage();

        document.dispatchEvent(
            new CustomEvent('rovalra-streamer-mode', {
                detail: {
                    enabled: streamermode,
                    settingsPageInfo: settingsPageInfo !== false,
                    hideRobux: hideRobux === true,
                },
            }),
        );
    }

    updateStreamerMode();

    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (
            namespace === 'local' &&
            (changes.streamermode ||
                changes.settingsPageInfo ||
                changes.hideRobux ||
                changes.showRobuxOnHover)
        ) {
            updateStreamerMode();
        }
    });

    document.addEventListener('rovalra:custom-font-updated', () => {
        if (isHideRobuxEnabled) updateAllRobuxMasks();
    });

    document.addEventListener(NAVBAR_BALANCE_UPDATED_EVENT, () => {
        if (isHideRobuxEnabled) updateAllRobuxMasks();
    });

    document.addEventListener(NAVBAR_FIAT_ESTIMATE_UPDATED_EVENT, () => {
        if (isHideRobuxEnabled) updateAllRobuxMasks();
    });

    if (document.fonts) {
        document.fonts.ready
            .then(() => {
                if (isHideRobuxEnabled) updateAllRobuxMasks();
            })
            .catch(() => {});
        document.fonts.addEventListener('loadingdone', () => {
            if (isHideRobuxEnabled) updateAllRobuxMasks();
        });
    }

    observeElement(
        '#nav-robux-amount, #nav-robux-balance',
        (element) => {
            updateRobuxMask(element);
        },
        { multiple: true },
    );

    observeElement(
        '.settings-text-field-container',
        (element) => {
            if (isSensitiveAccountSettingsField(element)) {
                applyStreamerModeToSettingsField(element);
            }
        },
        { multiple: true },
    );
}
