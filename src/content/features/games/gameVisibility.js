import { observeElement } from '../../core/observer.js';
import { callRobloxApi, callRobloxApiJson } from '../../core/api.js';
import { settings } from '../../core/settings/getSettings.js';
import { ts } from '../../core/locale/i18n.js';
import { showConfirmationPrompt } from '../../core/ui/confirmationPrompt.js';
import { showSystemAlert } from '../../core/ui/roblox/alert.js';

const ITEM_CLASS = 'rovalra-toggle-visibility';

let observer = null;
let listening = false;
let state = { universeId: null, publicNow: false };

async function canManage(universeId) {
    const data = await callRobloxApiJson({
        subdomain: 'develop',
        endpoint: `/v1/universes/multiget/permissions?ids=${universeId}`,
        noCache: true,
    });
    return data?.data?.[0]?.canManage === true;
}

async function isPublic(universeId) {
    const data = await callRobloxApiJson({
        subdomain: 'develop',
        endpoint: `/v1/universes/${universeId}`,
        noCache: true,
    });
    return data?.privacyType === 'Public';
}

function updateButtons() {
    document.querySelectorAll(`.${ITEM_CLASS} button`).forEach((button) => {
        button.textContent = ts(
            state.publicNow
                ? 'gameVisibility.makePrivate'
                : 'gameVisibility.makePublic',
        );
    });
}

async function toggleVisibility() {
    const makePublic = !state.publicNow;
    const response = await callRobloxApi({
        subdomain: 'develop',
        endpoint: `/v1/universes/${state.universeId}/${makePublic ? 'activate' : 'deactivate'}`,
        method: 'POST',
        noCache: true,
    });

    if (!response.ok) {
        showSystemAlert(ts('gameVisibility.failed'), 'warning');
        return;
    }

    state.publicNow = makePublic;
    updateButtons();
    showSystemAlert(
        ts(
            makePublic
                ? 'gameVisibility.nowPublic'
                : 'gameVisibility.nowPrivate',
        ),
    );
}

function onClick(event) {
    if (!state.universeId || !event.target.closest?.(`.${ITEM_CLASS} button`)) {
        return;
    }
    const makePublic = !state.publicNow;
    const key = makePublic ? 'makePublic' : 'makePrivate';
    showConfirmationPrompt({
        title: ts(`gameVisibility.${key}Title`),
        message: ts(`gameVisibility.${key}Message`),
        confirmText: ts(`gameVisibility.${key}`),
        confirmType: makePublic ? 'primary' : 'alert',
        onConfirm: toggleVisibility,
    });
}

async function addMenuItem(menu) {
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
        const publicNow = await isPublic(universeId);
        if (menu.querySelector(`.${ITEM_CLASS}`)) return;

        state = { universeId, publicNow };
        const item = document.createElement('li');
        item.className = ITEM_CLASS;
        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('role', 'button');
        item.append(button);

        const anchor = menu.querySelector('#rbx-configure-game');
        if (anchor) anchor.after(item);
        else menu.append(item);
        updateButtons();

        if (!listening) {
            listening = true;
            document.addEventListener('click', onClick);
        }
    } catch (error) {
        console.error('RoValra: Failed to add visibility toggle', error);
    }
}

export async function init() {
    observer?.disconnect();
    observer = null;
    state = { universeId: null, publicNow: false };

    if (
        !window.location.pathname.startsWith('/games/') ||
        !(await settings.gameVisibilityToggleEnabled)
    ) {
        return;
    }

    observer = observeElement(
        '#game-context-menu ul.dropdown-menu',
        addMenuItem,
    );
}
