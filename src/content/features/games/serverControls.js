import { observeElement } from '../../core/observer.js';
import { callRobloxApi, callRobloxApiJson } from '../../core/api.js';
import { settings } from '../../core/settings/getSettings.js';
import { ts } from '../../core/locale/i18n.js';
import { showConfirmationPrompt } from '../../core/ui/confirmationPrompt.js';
import { showSystemAlert } from '../../core/ui/roblox/alert.js';

const ITEM_CLASS = 'rovalra-server-control';

let observer = null;
let listening = false;
let state = { universeId: null };

const ACTIONS = {
    restart: {
        endpoint: '/matchmaking-api/v1/game-instances/launch-update',
        body: () => ({
            universeId: Number(state.universeId),
            closeOldVersionsOnly: true,
        }),
        confirmType: 'primary',
    },
    shutdown: {
        endpoint: '/matchmaking-api/v1/game-instances/launch-update',
        body: () => ({
            universeId: Number(state.universeId),
            closeOldVersionsOnly: false,
        }),
        confirmType: 'alert',
    },
};

async function canManage(universeId) {
    const data = await callRobloxApiJson({
        subdomain: 'develop',
        endpoint: `/v1/universes/multiget/permissions?ids=${universeId}`,
        noCache: true,
    });
    return data?.data?.[0]?.canManage === true;
}

async function runAction(key) {
    const action = ACTIONS[key];
    try {
        const response = await callRobloxApi({
            subdomain: 'apis',
            endpoint: action.endpoint,
            method: 'POST',
            body: action.body(),
            noCache: true,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        showSystemAlert(ts(`serverControls.${key}Done`), 'success');
    } catch (error) {
        console.error(`RoValra: Failed to ${key} servers`, error);
        showSystemAlert(ts('serverControls.failed'), 'warning');
    }
}

function onClick(event) {
    const key = event.target.closest?.(`.${ITEM_CLASS} button`)?.dataset
        .rovalraServerAction;
    if (!key || !state.universeId) return;

    showConfirmationPrompt({
        title: ts(`serverControls.${key}Title`),
        message: ts(`serverControls.${key}Message`),
        confirmText: ts(`serverControls.${key}`),
        confirmType: ACTIONS[key].confirmType,
        onConfirm: () => runAction(key),
    });
}

async function addMenuItems(menu) {
    const universeId = document.querySelector('#game-detail-meta-data')?.dataset
        .universeId;
    if (
        !/^\d+$/.test(universeId || '') ||
        menu.querySelector(`.${ITEM_CLASS}`)
    ) {
        return;
    }

    try {
        if (!(await canManage(universeId))) return;
        if (menu.querySelector(`.${ITEM_CLASS}`)) return;

        state = { universeId };
        const items = Object.keys(ACTIONS).map((key) => {
            const item = document.createElement('li');
            item.className = ITEM_CLASS;
            const button = document.createElement('button');
            button.type = 'button';
            button.setAttribute('role', 'button');
            button.dataset.rovalraServerAction = key;
            button.textContent = ts(`serverControls.${key}`);
            item.append(button);
            return item;
        });

        const anchor = menu.querySelector('#rbx-configure-game');
        if (anchor) anchor.after(...items);
        else menu.append(...items);

        if (!listening) {
            listening = true;
            document.addEventListener('click', onClick);
        }
    } catch (error) {
        console.error('RoValra: Failed to add server controls', error);
    }
}

export async function init() {
    observer?.disconnect();
    observer = null;
    state = { universeId: null };

    if (
        !window.location.pathname.startsWith('/games/') ||
        !(await settings.serverControlsEnabled)
    ) {
        return;
    }

    observer = observeElement(
        '#game-context-menu ul.dropdown-menu',
        addMenuItems,
    );
}
