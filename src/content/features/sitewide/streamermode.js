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
            const phoneValueSpan = phoneField.querySelector('.settings-text-span-visible');
            if (phoneValueSpan && phoneValueSpan.textContent !== 'RoValra Streamer Mode Enabled') {
                phoneValueSpan.textContent = 'RoValra Streamer Mode Enabled';
            }

            const emailField = phoneField.nextElementSibling;
            if (emailField && emailField.classList.contains('settings-text-field-container')) {
                const emailValueSpan = emailField.querySelector('.settings-text-span-visible');
                if (emailValueSpan && emailValueSpan.textContent !== 'RoValra Streamer Mode Enabled') {
                    emailValueSpan.textContent = 'RoValra Streamer Mode Enabled';
                }
            }
        }
    }

    function updateStreamerMode() {
        chrome.storage.local.get(['streamermode', 'settingsPageInfo', 'hideRobux'], (data) => {
            try {
                if (data.streamermode) {
                    sessionStorage.setItem('rovalra_streamermode', 'true');
                    sessionStorage.setItem('rovalra_settingsPageInfo', data.settingsPageInfo !== false ? 'true' : 'false');
                    sessionStorage.setItem('rovalra_hideRobux', data.hideRobux === true ? 'true' : 'false');
                } else {
                    sessionStorage.removeItem('rovalra_streamermode');
                }
            } catch (e) {}

            isHideRobuxEnabled = data.streamermode && data.hideRobux === true;
            isSettingsPageInfoEnabled = data.streamermode && (data.settingsPageInfo !== false);

            const robuxElement = document.getElementById('nav-robux-amount');
            if (robuxElement) {
                updateRobuxText(robuxElement);
            }

            updateSettingsPage();

            document.dispatchEvent(new CustomEvent('rovalra-streamer-mode', { 
                detail: { 
                    enabled: data.streamermode,
                    settingsPageInfo: data.settingsPageInfo !== false,
                    hideRobux: data.hideRobux === true
                } 
            }));
        });
    }

    updateStreamerMode();

    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && (changes.streamermode || changes.settingsPageInfo || changes.hideRobux)) {
            updateStreamerMode();
        }
    });

    observeElement('#nav-robux-amount', (element) => {
        updateRobuxText(element);
        
        const observer = new MutationObserver(() => updateRobuxText(element));
        observer.observe(element, { childList: true, characterData: true, subtree: true });
    });

    observeElement('#account-field-phone', (element) => {
        updateSettingsPage();
        
        const observer = new MutationObserver(() => updateSettingsPage());
        observer.observe(element, { childList: true, characterData: true, subtree: true });

        const emailField = element.nextElementSibling;
        if (emailField && emailField.classList.contains('settings-text-field-container')) {
            const emailObserver = new MutationObserver(() => updateSettingsPage());
            emailObserver.observe(emailField, { childList: true, characterData: true, subtree: true });
        }
    });
}
