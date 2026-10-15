import { observeElement, observeAttributes } from '../../core/observer.js';
import { settings } from '../../core/settings/getSettings.js';
import { callRobloxApi } from '../../core/api.js';
import { showConfirmationPrompt } from '../../core/ui/confirmationPrompt.js';
import { t } from '../../core/locale/i18n.js';
import {
    addTradeActionButton,
    getTradePartnerId,
    getTradePartnerName,
} from '../../core/trade/ui/tradeActionButton.js';

const MAX_PAGES = 20;

let blockedIds = null;
let blockedIdsRequest = null;
let refreshQueued = false;
const changesDuringRequest = new Map();
let buttonRequest = null;
let partnerLinkRequest = null;
const blockButtons = new Map();
const partnerLinkObservers = new Map();

async function fetchBlockedIds() {
    const ids = new Set();
    let cursor = '';

    for (let page = 0; page < MAX_PAGES; page++) {
        const params = new URLSearchParams({ count: '50' });
        if (cursor) params.set('cursor', cursor);

        const response = await callRobloxApi({
            subdomain: 'apis',
            endpoint: `/user-blocking-api/v1/users/get-blocked-users?${params}`,
            noCache: true,
        });
        if (!response.ok) {
            throw new Error(`Blocked users request failed: ${response.status}`);
        }

        const json = await response.json();
        (json?.data?.blockedUserIds || []).forEach((id) => ids.add(String(id)));
        cursor = json?.data?.cursor || '';
        if (!cursor) break;
    }

    return ids;
}

function loadBlockedIds() {
    if (blockedIdsRequest) return blockedIdsRequest;

    changesDuringRequest.clear();
    const request = fetchBlockedIds()
        .then((ids) => {
            changesDuringRequest.forEach((blocked, userId) => {
                if (blocked) ids.add(userId);
                else ids.delete(userId);
            });
            blockedIds = ids;
            return ids;
        })
        .finally(() => {
            blockedIdsRequest = null;
            changesDuringRequest.clear();
            if (refreshQueued) {
                refreshQueued = false;
                refreshBlockedIds();
            }
        });
    blockedIdsRequest = request;
    return request;
}

function getBlockedIds() {
    return blockedIds ? Promise.resolve(blockedIds) : loadBlockedIds();
}

function refreshBlockedIds() {
    if (blockedIdsRequest) {
        refreshQueued = true;
        return;
    }
    loadBlockedIds().then(syncAllButtons, (error) =>
        console.warn('[RoValra] Failed to refresh blocked users', error),
    );
}

function rememberBlockChange(userId, blocked) {
    if (blockedIds) {
        if (blocked) blockedIds.add(userId);
        else blockedIds.delete(userId);
    }
    if (blockedIdsRequest) changesDuringRequest.set(userId, blocked);
}

async function setUserBlocked(userId, blocked) {
    const action = blocked ? 'block-user' : 'unblock-user';
    try {
        const response = await callRobloxApi({
            subdomain: 'apis',
            endpoint: `/user-blocking-api/v1/users/${userId}/${action}`,
            method: 'POST',
            noCache: true,
        });
        if (!response.ok) return false;

        rememberBlockChange(userId, blocked);
        return true;
    } catch (error) {
        console.warn('[RoValra] Block request failed', error);
        return false;
    }
}

function syncAllButtons() {
    blockButtons.forEach((controller) => controller.sync());
}

function addBlockButton(container) {
    if (blockButtons.has(container)) return;

    const state = { userId: null, syncId: 0, busy: false };

    const onClick = async () => {
        if (state.busy) return;

        const userId = getTradePartnerId(container);
        const username = getTradePartnerName(container);
        if (!userId) return;

        state.busy = true;
        let isBlocked;
        let prompt;
        try {
            isBlocked = (await getBlockedIds()).has(userId);
            const titleKey = isBlocked
                ? username
                    ? 'blockUser.unblockTitle'
                    : 'blockUser.unblockTitleGeneric'
                : username
                  ? 'blockUser.blockTitle'
                  : 'blockUser.blockTitleGeneric';
            prompt = {
                title: await t(titleKey, { username }),
                message: isBlocked
                    ? await t('blockUser.unblockMessage')
                    : await t('blockUser.blockMessage'),
                confirmText: isBlocked
                    ? await t('blockUser.unblock')
                    : await t('blockUser.block'),
                cancelText: await t('blockUser.cancel'),
            };
        } catch (error) {
            console.warn('[RoValra] Failed to load blocked users', error);
            return;
        } finally {
            state.busy = false;
        }

        if (getTradePartnerId(container) !== userId) return;

        showConfirmationPrompt({
            ...prompt,
            confirmType: isBlocked ? 'primary' : 'alert',
            onConfirm: async () => {
                state.busy = true;
                actionButton.button.disabled = true;
                const ok = await setUserBlocked(userId, !isBlocked);
                state.busy = false;
                actionButton.button.disabled = false;
                if (!ok) console.warn('[RoValra] Failed to update block state');
                syncAllButtons();
            },
        });
    };

    const actionButton = addTradeActionButton(container, {
        className: 'rovalra-block-button',
        onClick,
    });
    const { button } = actionButton;
    button.hidden = true;

    const sync = async () => {
        const syncId = ++state.syncId;

        const userId = getTradePartnerId(container);
        if (userId !== state.userId) {
            state.userId = null;
            button.hidden = true;
        }
        if (!userId) return;

        let isBlocked;
        try {
            isBlocked = (await getBlockedIds()).has(userId);
        } catch (error) {
            if (syncId !== state.syncId) return;
            state.userId = null;
            button.hidden = true;
            console.warn('[RoValra] Failed to load blocked users', error);
            return;
        }

        const label = await t(
            isBlocked ? 'blockUser.unblock' : 'blockUser.block',
        );
        if (syncId !== state.syncId) return;

        state.userId = userId;
        actionButton.setLabel(label);
        button.hidden = false;
    };

    blockButtons.set(container, {
        sync,
        remove() {
            state.syncId++;
            actionButton.remove();
        },
    });
    sync();
}

function removeBlockButton(container) {
    blockButtons.get(container)?.remove();
    blockButtons.delete(container);
}

function watchPartnerLink(link) {
    if (partnerLinkObservers.has(link)) return;
    partnerLinkObservers.set(
        link,
        observeAttributes(link, syncAllButtons, ['href']),
    );
    syncAllButtons();
}

function unwatchPartnerLink(link) {
    partnerLinkObservers.get(link)?.disconnect();
    partnerLinkObservers.delete(link);
    syncAllButtons();
}

function onVisibilityChange() {
    if (document.visibilityState === 'visible' && blockedIds) {
        refreshBlockedIds();
    }
}

function stop() {
    buttonRequest?.disconnect();
    partnerLinkRequest?.disconnect();
    buttonRequest = null;
    partnerLinkRequest = null;

    [...blockButtons.keys()].forEach(removeBlockButton);
    partnerLinkObservers.forEach((observer) => observer.disconnect());
    partnerLinkObservers.clear();
    document.removeEventListener('visibilitychange', onVisibilityChange);
}

export async function init() {
    if (!(await settings.blockUserEnabled)) return;

    const path = window.location.pathname;
    if (!path.startsWith('/trades')) {
        stop();
        return;
    }
    if (buttonRequest) return;

    document.addEventListener('visibilitychange', onVisibilityChange);
    partnerLinkRequest = observeElement(
        '.trades-list-detail .paired-name',
        watchPartnerLink,
        { multiple: true, onRemove: unwatchPartnerLink },
    );
    buttonRequest = observeElement(
        '.trades-list-detail .trade-buttons',
        addBlockButton,
        { multiple: true, onRemove: removeBlockButton },
    );
}
