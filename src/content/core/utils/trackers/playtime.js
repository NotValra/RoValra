import { callRobloxApi } from '../../api.js';
import { settings } from '../../settings/getSettings.js';

const HEARTBEAT_INTERVAL_MS = 30 * 1000;
const PLAYTIME_SETTING_KEY = 'playtimeEnabled';

let enabled = true;
let latestPresence = null;
let heartbeatInterval = null;
let heartbeatPlaceId = null;
let initialized = false;

function isPlaying(presence) {
    return (
        presence &&
        (presence.userPresenceType === 2 || presence.userPresenceType === 4) &&
        presence.rootPlaceId
    );
}

async function sendHeartbeat(placeId) {
    if (!enabled || !placeId) return;

    try {
        await callRobloxApi({
            isRovalraApi: true,
            endpoint: '/v1/playtime/heartbeat',
            method: 'POST',
            body: { placeId: Number(placeId) },
        });
    } catch (error) {
        console.warn('RoValra: Failed to send playtime heartbeat', error);
    }
}

function stopHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
    heartbeatPlaceId = null;
}

function updateHeartbeat(presence) {
    latestPresence = presence;

    if (!enabled || !isPlaying(presence)) {
        stopHeartbeat();
        return;
    }

    const placeId = Number(presence.rootPlaceId);
    if (!Number.isInteger(placeId) || placeId <= 0) {
        stopHeartbeat();
        return;
    }

    if (heartbeatPlaceId === placeId && heartbeatInterval) return;

    stopHeartbeat();
    heartbeatPlaceId = placeId;
    sendHeartbeat(placeId);
    heartbeatInterval = setInterval(() => {
        if (
            isPlaying(latestPresence) &&
            Number(latestPresence.rootPlaceId) === placeId
        ) {
            sendHeartbeat(placeId);
        } else {
            stopHeartbeat();
        }
    }, HEARTBEAT_INTERVAL_MS);
}

function registerPresenceListeners() {
    chrome.runtime.onMessage.addListener((request) => {
        if (request.action === 'presenceUpdate') {
            updateHeartbeat(request.presence);
        }
    });

    chrome.runtime.sendMessage({ action: 'getLatestPresence' }, (response) => {
        if (!chrome.runtime.lastError && response?.presence) {
            updateHeartbeat(response.presence);
        }
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local' || !changes[PLAYTIME_SETTING_KEY]) return;

        refreshEnabled().then(() => {
            if (enabled) updateHeartbeat(latestPresence);
            else stopHeartbeat();
        });
    });
}

async function refreshEnabled() {
    enabled = (await settings.playtimeEnabled) !== false;
}

export async function init() {
    if (initialized) return;
    initialized = true;

    await refreshEnabled();
    registerPresenceListeners();
}
