import { callRobloxApi } from '../../api.js';
import { settings } from '../../settings/getSettings.js';

const PLAYTIME_SETTING_KEY = 'playtimeEnabled';
const SESSION_STORAGE_KEY = 'rovalra_playtime_session';
const SESSION_LOCK_NAME = 'rovalra-playtime-session';
const LAST_SEEN_INTERVAL_MS = 30 * 1000;
const STALE_SESSION_MS = 2 * 60 * 1000;

let enabled = true;
let latestPresence = null;
let lastSeenInterval = null;
let initialized = false;

function isPlaying(presence) {
    return (
        presence &&
        (presence.userPresenceType === 2 || presence.userPresenceType === 4) &&
        presence.rootPlaceId
    );
}

function getPlayingPlaceId(presence) {
    if (!enabled || !isPlaying(presence)) return null;
    const placeId = Number(presence.rootPlaceId);
    return Number.isInteger(placeId) && placeId > 0 ? placeId : null;
}

function withSessionLock(callback) {
    if (navigator.locks?.request) {
        return navigator.locks.request(SESSION_LOCK_NAME, callback);
    }
    return callback();
}

async function getSession() {
    const result = await chrome.storage.local.get(SESSION_STORAGE_KEY);
    return result[SESSION_STORAGE_KEY] || null;
}

async function sendPlaytimeEvent(endpoint, body) {
    try {
        await callRobloxApi({
            isRovalraApi: true,
            endpoint,
            method: 'POST',
            body,
            useBackground: true,
        });
    } catch (error) {
        console.warn(`RoValra: Failed to send ${endpoint}`, error);
    }
}

async function endSession(session) {
    const now = Date.now();
    const endedAt =
        now - session.lastSeen > STALE_SESSION_MS ? session.lastSeen : now;
    const seconds = Math.max(
        1,
        Math.round((endedAt - session.startedAt) / 1000),
    );

    await chrome.storage.local.remove(SESSION_STORAGE_KEY);
    await sendPlaytimeEvent('/v1/playtime/leave', {
        placeId: session.placeId,
        seconds,
    });
}

async function startSession(placeId) {
    const now = Date.now();
    await chrome.storage.local.set({
        [SESSION_STORAGE_KEY]: { placeId, startedAt: now, lastSeen: now },
    });
    await sendPlaytimeEvent('/v1/playtime/join', { placeId });
}

function syncSession() {
    const placeId = getPlayingPlaceId(latestPresence);

    return withSessionLock(async () => {
        const session = await getSession();

        if (session && session.placeId === placeId) {
            if (Date.now() - session.lastSeen > STALE_SESSION_MS) {
                await endSession(session);
                await startSession(placeId);
            }
            return;
        }

        if (session) await endSession(session);
        if (placeId) await startSession(placeId);
    }).catch((error) =>
        console.warn('RoValra: Failed to update playtime session', error),
    );
}

function touchSession() {
    const placeId = getPlayingPlaceId(latestPresence);
    if (!placeId) return;

    withSessionLock(async () => {
        const session = await getSession();
        if (session?.placeId !== placeId) return;
        await chrome.storage.local.set({
            [SESSION_STORAGE_KEY]: { ...session, lastSeen: Date.now() },
        });
    }).catch(() => {});
}

function updatePresence(presence) {
    latestPresence = presence;

    if (getPlayingPlaceId(presence)) {
        if (!lastSeenInterval) {
            lastSeenInterval = setInterval(touchSession, LAST_SEEN_INTERVAL_MS);
        }
    } else if (lastSeenInterval) {
        clearInterval(lastSeenInterval);
        lastSeenInterval = null;
    }

    syncSession();
}

function registerPresenceListeners() {
    chrome.runtime.onMessage.addListener((request) => {
        if (request.action === 'presenceUpdate') {
            updatePresence(request.presence);
        }
    });

    chrome.runtime.sendMessage({ action: 'getLatestPresence' }, (response) => {
        if (!chrome.runtime.lastError && response?.presence) {
            updatePresence(response.presence);
        }
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local' || !changes[PLAYTIME_SETTING_KEY]) return;

        refreshEnabled().then(() => updatePresence(latestPresence));
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
