import { settings } from '../../core/settings/getSettings.js';

const SETTING_NAME = 'friendsSecondRowEnabled';

let storageListenerRegistered = false;

function publishState(enabled) {
    document.dispatchEvent(
        new CustomEvent('rovalra-friends-second-row', {
            detail: { enabled },
        }),
    );
}

function registerStorageListener() {
    if (storageListenerRegistered) return;
    storageListenerRegistered = true;

    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace !== 'local' || !changes[SETTING_NAME]) return;

        publishState(changes[SETTING_NAME].newValue === true);
    });
}

export async function init() {
    registerStorageListener();

    const enabled = (await settings.friendsSecondRowEnabled) === true;
    publishState(enabled);
}