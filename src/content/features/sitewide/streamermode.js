import { observeElement } from '../../core/observer.js';

export function init() {
    let isHideRobuxEnabled = false;

    function updateRobuxText(element) {
        if (isHideRobuxEnabled && element.textContent !== 'Hidden') {
            element.textContent = 'Hidden';
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

            const robuxElement = document.getElementById('nav-robux-amount');
            if (robuxElement) {
                updateRobuxText(robuxElement);
            }

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
}
