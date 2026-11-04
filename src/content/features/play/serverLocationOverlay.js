import { settings } from '../../core/settings/getSettings.js';
import { ts } from '../../core/locale/i18n.js';
import { loadDatacenterMap, serverIpMap } from '../../core/regions.js';
import { createFloatingPanel } from '../../core/ui/floatingPanel.js';
import { getAuthenticatedUserId } from '../../core/user.js';
import { fetchServerRegion } from '../../core/apis/serverApi.js';
import { subscribeToPresenceUpdates } from '../../core/utils/trackers/servers.js';
import { getAssets } from '../../core/assets.js';

const SETTING_NAME = 'serverLocationOverlayEnabled';
const STATE_KEY = 'rovalraServerLocationOverlayState';
const SUPPORTED_HOST = 'play.roblox.com';
const LOOKUP_ATTEMPTS = 2;
const LOOKUP_RETRY_MS = 1000;
const IN_GAME_PRESENCE = 2;
const TOAST_DISPLAY_MS = 7000;
const TOAST_EXIT_MS = 250;

let initialized = false;
let mounted = false;
let lastGameId = null;
let currentServer = null;
let serverUpdater = null;
let unsubscribePresence = null;
let activeToast = null;

function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

function getCountryName(code) {
    try {
        return (
            new Intl.DisplayNames([navigator.language], { type: 'region' }).of(
                code.toUpperCase(),
            ) || code
        );
    } catch {
        return code;
    }
}

function formatLocation(loc) {
    if (!loc?.country) return null;

    const parts = [loc.city, loc.region, getCountryName(loc.country)].filter(
        (part) => part && part !== 'Unknown',
    );
    return [...new Set(parts)].join(', ') || null;
}

async function resolveLocation(data) {
    if (data.country) {
        return formatLocation({
            city: data.city,
            region: data.regionName,
            country: data.country,
        });
    }

    const dataCenterId = data.joinScript?.DataCenterId;
    if (!dataCenterId) return null;

    try {
        await loadDatacenterMap();
    } catch {
        return null;
    }
    return formatLocation(serverIpMap[dataCenterId]);
}

function createRow(labelKey) {
    const row = createElement('div', 'rovalra-server-location-row');
    const label = createElement('span', 'rovalra-server-location-label');
    const value = createElement('span', 'rovalra-server-location-value');
    row.append(label, value);
    return { row, label, value, labelKey };
}

function getServerValues(server) {
    return {
        location:
            server.location ?? ts('serverLocationOverlay.unknownLocation'),
        version: server.version ?? ts('serverLocationOverlay.unknown'),
        channel: server.channel || ts('serverLocationOverlay.production'),
    };
}

function build(context) {
    const empty = createElement('div', 'rovalra-server-location-empty');
    const rows = {
        location: createRow('serverLocationOverlay.location'),
        version: createRow('serverLocationOverlay.version'),
        channel: createRow('serverLocationOverlay.channel'),
    };

    serverUpdater = () => {
        empty.hidden = Boolean(currentServer);
        const values = currentServer ? getServerValues(currentServer) : null;

        Object.entries(rows).forEach(([key, { row, value }]) => {
            row.hidden = !values;
            value.textContent = values?.[key] ?? '';
            value.title = value.textContent;
        });
    };

    context.track(() => {
        empty.textContent = ts('serverLocationOverlay.waiting');
        Object.values(rows).forEach(({ label, labelKey }) => {
            label.textContent = ts(labelKey);
        });
        serverUpdater();
    });

    context.body.append(empty, ...Object.values(rows).map(({ row }) => row));
}

const panel = createFloatingPanel({
    id: 'server-location-overlay',
    stateKey: STATE_KEY,
    titleKey: 'serverLocationOverlay.title',
    labelKeys: {
        collapse: 'serverLocationOverlay.collapse',
        hide: 'serverLocationOverlay.hide',
    },
    keybind: 'F3',
    customButtons: true,
    showLogo: true,
    build,
});

function dismissToast(toast) {
    if (!toast?.isConnected || toast.dataset.leaving === 'true') return;

    toast.dataset.leaving = 'true';
    setTimeout(() => toast.remove(), TOAST_EXIT_MS);
    if (activeToast === toast) activeToast = null;
}

function showToast(server) {
    dismissToast(activeToast);

    const values = getServerValues(server);
    const toast = createElement('div', 'rovalra-win-toast');
    toast.setAttribute('role', 'status');

    const header = createElement('div', 'rovalra-win-toast-header');
    const appIcon = createElement('img', 'rovalra-win-toast-app-icon');
    appIcon.src = getAssets().rovalraIcon;
    appIcon.alt = '';
    const close = createElement('button', 'rovalra-win-toast-close');
    close.type = 'button';
    close.setAttribute('aria-label', ts('serverLocationOverlay.dismiss'));
    close.innerHTML =
        '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9m0-9l-9 9" /></svg>';
    close.addEventListener('click', (event) => {
        event.stopPropagation();
        dismissToast(toast);
    });
    header.append(
        appIcon,
        createElement(
            'span',
            'rovalra-win-toast-app-name',
            ts('serverLocationOverlay.appName'),
        ),
        close,
    );

    toast.append(
        header,
        createElement('div', 'rovalra-win-toast-title', values.location),
        createElement(
            'div',
            'rovalra-win-toast-body',
            ts('serverLocationOverlay.toastDetails', {
                version: values.version,
                channel: values.channel,
            }),
        ),
    );

    toast.addEventListener('click', () => {
        panel.setState({ hidden: false });
        dismissToast(toast);
    });

    let timer = setTimeout(() => dismissToast(toast), TOAST_DISPLAY_MS);
    toast.addEventListener('mouseenter', () => clearTimeout(timer));
    toast.addEventListener('mouseleave', () => {
        timer = setTimeout(() => dismissToast(toast), TOAST_DISPLAY_MS / 2);
    });

    document.body.append(toast);
    activeToast = toast;
}

// Gamejoin can fail right as the server starts, so retry once before giving up
async function lookupServer(placeId, gameId) {
    for (let attempt = 0; attempt < LOOKUP_ATTEMPTS; attempt++) {
        if (attempt > 0) {
            await new Promise((resolve) =>
                setTimeout(resolve, LOOKUP_RETRY_MS),
            );
        }

        const data = await fetchServerRegion(placeId, gameId);
        if (data?.joinScript) return data;
    }
    return null;
}

function clearServer() {
    lastGameId = null;
    if (!currentServer) return;

    currentServer = null;
    serverUpdater?.();
    dismissToast(activeToast);
}

async function onPresence(presence) {
    if (
        presence?.userPresenceType !== IN_GAME_PRESENCE ||
        !presence.gameId ||
        !presence.placeId
    ) {
        clearServer();
        return;
    }
    if (presence.gameId === lastGameId) return;
    const gameId = presence.gameId;
    lastGameId = gameId;

    const data = await lookupServer(presence.placeId, gameId);
    if (!data || !mounted || gameId !== lastGameId) return;

    const location = await resolveLocation(data);
    if (!mounted || gameId !== lastGameId) return;

    currentServer = {
        location,
        version: data.joinScript.PlaceVersion ?? null,
        channel: data.joinScript.ChannelName ?? null,
    };
    serverUpdater?.();
    showToast(currentServer);
}

async function mount() {
    if (mounted) return;
    mounted = true;

    await panel.mount({ hidden: true });

    const userId = await getAuthenticatedUserId();
    if (userId) {
        chrome.runtime.sendMessage({
            action: 'updateUserId',
            userId: String(userId),
        });
    }
    if (mounted) unsubscribePresence = subscribeToPresenceUpdates(onPresence);
}

function unmount() {
    if (!mounted) return;
    mounted = false;

    unsubscribePresence?.();
    unsubscribePresence = null;
    lastGameId = null;
    dismissToast(activeToast);
    panel.unmount();
    serverUpdater = null;
}

function applySetting(enabled) {
    if (enabled) mount();
    else unmount();
}

export async function init() {
    if (initialized || window.location.hostname !== SUPPORTED_HOST) return;
    initialized = true;

    applySetting((await settings[SETTING_NAME]) === true);

    document.addEventListener('rovalra:settingSaved', (event) => {
        if (event.detail?.name !== SETTING_NAME) return;

        applySetting(event.detail.value === true);
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local' || !changes[SETTING_NAME]) return;

        applySetting(changes[SETTING_NAME].newValue === true);
    });
}
