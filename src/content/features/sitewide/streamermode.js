import { observeElement } from '../../core/observer.js';

export function init() {
    let isHideRobuxEnabled = false;
    let isSettingsPageInfoEnabled = false;

    function updateRobuxText(element) {
        if (isHideRobuxEnabled && element.textContent !== 'Hidden') {
            element.textContent = 'Hidden';
        }
    }

    function updateSettingsPage() {
        if (!isSettingsPageInfoEnabled) return;
        if (!window.location.href.includes('/my/account')) return;

        const phoneField = document.getElementById('account-field-phone');
        if (phoneField) {
            const phoneValueSpan = phoneField.querySelector(
                '.settings-text-span-visible',
            );
            if (
                phoneValueSpan &&
                phoneValueSpan.textContent !== 'RoValra Streamer Mode Enabled'
            ) {
                phoneValueSpan.textContent = 'RoValra Streamer Mode Enabled';
            }

            const emailField = phoneField.nextElementSibling;
            if (
                emailField &&
                emailField.classList.contains('settings-text-field-container')
            ) {
                const emailValueSpan = emailField.querySelector(
                    '.settings-text-span-visible',
                );
                if (
                    emailValueSpan &&
                    emailValueSpan.textContent !==
                        'RoValra Streamer Mode Enabled'
                ) {
                    emailValueSpan.textContent =
                        'RoValra Streamer Mode Enabled';
                }
            }
        }
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
    observeElement('#account-field-phone', () => {
        updateSettingsPage();
    });
}
