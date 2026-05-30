import { observeElement } from '../../core/observer.js';

export function init() {
    let isHideRobuxEnabled = false;
    let isSettingsPageInfoEnabled = false;

    function updateRobuxText(element) {
        if (isHideRobuxEnabled && element.textContent !== 'Hidden') {
            element.textContent = 'Hidden';
        }
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

    function updateStreamerMode() {
        chrome.storage.local.get(
            ['streamermode', 'settingsPageInfo', 'hideRobux'],
            (data) => {
                try {
                    if (data.streamermode) {
                        sessionStorage.setItem('rovalra_streamermode', 'true');
                        sessionStorage.setItem(
                            'rovalra_settingsPageInfo',
                            data.settingsPageInfo !== false ? 'true' : 'false',
                        );
                        sessionStorage.setItem(
                            'rovalra_hideRobux',
                            data.hideRobux === true ? 'true' : 'false',
                        );
                    } else {
                        sessionStorage.removeItem('rovalra_streamermode');
                    }
                } catch (e) {}

                isHideRobuxEnabled =
                    data.streamermode && data.hideRobux === true;
                isSettingsPageInfoEnabled =
                    data.streamermode && data.settingsPageInfo !== false;

                const robuxElements = document.querySelectorAll(
                    '#nav-robux-amount, #nav-robux-balance',
                );
                robuxElements.forEach(updateRobuxText);

                updateSettingsPage();

                document.dispatchEvent(
                    new CustomEvent('rovalra-streamer-mode', {
                        detail: {
                            enabled: data.streamermode,
                            settingsPageInfo: data.settingsPageInfo !== false,
                            hideRobux: data.hideRobux === true,
                        },
                    }),
                );
            },
        );
    }

    updateStreamerMode();

    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (
            namespace === 'local' &&
            (changes.streamermode ||
                changes.settingsPageInfo ||
                changes.hideRobux)
        ) {
            updateStreamerMode();
        }
    });

    observeElement(
        '#nav-robux-amount, #nav-robux-balance',
        (element) => {
            updateRobuxText(element);
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
