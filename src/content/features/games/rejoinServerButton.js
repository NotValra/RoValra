import { observeElement, observeResize } from '../../core/observer.js';
import { getPlaceIdFromUrl } from '../../core/idExtractor.js';
import { settings } from '../../core/settings/getSettings.js';
import { launchGame } from '../../core/utils/launcher.js';
import { addTooltip } from '../../core/ui/tooltip.js';
import { showSystemAlert } from '../../core/ui/roblox/alert.js';
import { ts } from '../../core/locale/i18n.js';
import { checkServerIsActive } from './serverlist/recentservers.js';

const CONTAINER_SELECTOR = '#game-details-play-button-container';
const PLAY_BUTTON_SELECTOR = 'button[data-testid="play-button"]';
const BUTTON_ID = 'rovalra-rejoin-server-button';
const ICON_PATH =
    'M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18m-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8z';

let listening = false;

async function getLastServer(placeId) {
    const { rovalra_server_history: history = {} } =
        await chrome.storage.local.get({ rovalra_server_history: {} });
    return history[placeId]?.[0]?.presence || null;
}

function createIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '26');
    svg.setAttribute('height', '26');
    svg.setAttribute('viewBox', '0 0 24 24');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', ICON_PATH);
    svg.append(path);
    return svg;
}

async function rejoin(button, placeId) {
    if (button.disabled) return;
    button.disabled = true;
    try {
        const server = await getLastServer(placeId);
        if (
            !server?.gameId ||
            !(await checkServerIsActive(placeId, server.gameId))
        ) {
            showSystemAlert(ts('rejoinServer.closed'), 'warning');
            return;
        }
        launchGame(server.rootPlaceId || placeId, server.gameId);
    } finally {
        button.disabled = false;
    }
}

async function processContainer(container) {
    const placeId = getPlaceIdFromUrl();
    if (!placeId || !container.querySelector(PLAY_BUTTON_SELECTOR)) return;

    const server = await getLastServer(placeId);
    const existing = document.getElementById(BUTTON_ID);
    if (!server?.gameId) {
        existing?.remove();
        return;
    }
    if (existing) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.id = BUTTON_ID;
    button.className = 'btn-primary-md rovalra-rejoin-server-button';
    button.setAttribute('aria-label', ts('rejoinServer.tooltip'));
    button.append(createIcon());
    button.addEventListener('click', (event) => {
        event.stopPropagation();
        rejoin(button, placeId);
    });

    container.append(button);
    const playButton = container.querySelector(PLAY_BUTTON_SELECTOR);
    const syncSize = () => {
        const { height } = playButton.getBoundingClientRect();
        if (height > 0)
            button.style.width = button.style.height = `${height}px`;
    };
    syncSize();
    observeResize(playButton, syncSize);
    addTooltip(button, ts('rejoinServer.tooltip'), { position: 'top' });
}

export async function init() {
    if (
        !(await settings.recentServersEnabled) ||
        (await settings.rejoinServerButtonEnabled) === false
    ) {
        return;
    }

    observeElement(CONTAINER_SELECTOR, processContainer);

    if (listening) return;
    listening = true;
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace !== 'local' || !changes.rovalra_server_history) return;
        const container = document.querySelector(CONTAINER_SELECTOR);
        if (container) processContainer(container);
    });
}
