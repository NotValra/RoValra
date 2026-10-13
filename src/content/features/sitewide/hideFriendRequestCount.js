import { settings } from '../../core/settings/getSettings.js';

const SETTING_NAME = 'hideFriendRequestCountEnabled';
const ROOT_ATTRIBUTE = 'data-rovalra-hide-friend-request-count';

let initialized = false;

function applySetting(enabled) {
    if (enabled) {
        document.documentElement.setAttribute(
            ROOT_ATTRIBUTE,
            'true',
        );
    } else {
        document.documentElement.removeAttribute(
            ROOT_ATTRIBUTE,
        );
    }
}

export async function init() {
    if (initialized) return;
    initialized = true;

    applySetting((await settings[SETTING_NAME]) === true);

    document.addEventListener('rovalra:settingSaved', (event) => {
        if (event.detail?.name !== SETTING_NAME) return;

        applySetting(event.detail.value === true);
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local' || !changes[SETTING_NAME]) {
            return;
        }

        applySetting(changes[SETTING_NAME].newValue === true);
    });
}