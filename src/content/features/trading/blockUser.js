import { observeElement } from '../../core/observer.js';
import { settings } from '../../core/settings/getSettings.js';
import { getUserIdFromUrl } from '../../core/idExtractor.js';
import { callRobloxApi } from '../../core/api.js';
import { showConfirmationPrompt } from '../../core/ui/confirmationPrompt.js';
import { t } from '../../core/locale/i18n.js';

const MAX_PAGES = 20;
let blockedIds = null;
let observerRequest = null;
let refreshListenerAttached = false;

async function getBlockedIds() {
    if (blockedIds) return blockedIds;

    const ids = new Set();
    let cursor = '';
    let pages = 0;
    do {
        const response = await callRobloxApi({
            subdomain: 'apis',
            endpoint: `/user-blocking-api/v1/users/get-blocked-users?cursor=${cursor}&count=50`,
        });
        if (!response.ok) return ids;

        const json = await response.json();
        (json?.data?.blockedUserIds || []).forEach((id) => ids.add(String(id)));
        cursor = json?.data?.cursor || '';
        pages += 1;
    } while (cursor && pages < MAX_PAGES);

    blockedIds = ids;
    return ids;
}

async function setUserBlocked(userId, blocked) {
    const action = blocked ? 'block-user' : 'unblock-user';
    const response = await callRobloxApi({
        subdomain: 'apis',
        endpoint: `/user-blocking-api/v1/users/${userId}/${action}`,
        method: 'POST',
    });
    if (!response.ok) return false;

    const ids = await getBlockedIds();
    if (blocked) ids.add(userId);
    else ids.delete(userId);
    return true;
}

function getTradePartnerId(container) {
    const link = container
        .closest('.trades-list-detail')
        ?.querySelector('.paired-name');
    return link ? getUserIdFromUrl(link.href) : null;
}

function getTradePartnerName(container) {
    const link = container
        .closest('.trades-list-detail')
        ?.querySelector('.paired-name');
    if (!link) return null;

    const parts = link.querySelectorAll('.element');
    const displayName = parts[0]?.textContent?.trim();
    const username = parts[1]?.textContent?.trim();
    if (!displayName) return null;
    return username ? `${displayName} (@${username})` : displayName;
}

async function addBlockButton(container) {
    if (container.querySelector('.rovalra-block-button')) return;

    const button = document.createElement('button');
    button.className = 'btn-control-md rovalra-block-button';
    Object.assign(button.style, {
        color: 'var(--color-action-alert-foreground)',
    });
    const refreshLabel = async () => {
        const userId = getTradePartnerId(container);
        if (!userId) return;
        const isBlocked = (await getBlockedIds()).has(userId);
        button.textContent = isBlocked
            ? await t('blockUser.unblock')
            : await t('blockUser.block');
    };

    button.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const userId = getTradePartnerId(container);
        if (!userId) return;

        const isBlocked = (await getBlockedIds()).has(userId);
        const username = getTradePartnerName(container);
        const titleKey = isBlocked
            ? username
                ? 'blockUser.unblockTitle'
                : 'blockUser.unblockTitleGeneric'
            : username
              ? 'blockUser.blockTitle'
              : 'blockUser.blockTitleGeneric';
        showConfirmationPrompt({
            title: await t(titleKey, { username }),
            message: isBlocked
                ? await t('blockUser.unblockMessage')
                : await t('blockUser.blockMessage'),
            confirmText: isBlocked
                ? await t('blockUser.unblock')
                : await t('blockUser.block'),
            cancelText: await t('blockUser.cancel'),
            onConfirm: async () => {
                button.disabled = true;
                const ok = await setUserBlocked(userId, !isBlocked);
                button.disabled = false;
                await refreshLabel();
                if (!ok) console.warn('[RoValra] Failed to update block state');
            },
        });
    });

    await refreshLabel();
    container.appendChild(button);
    if (!refreshListenerAttached) {
        refreshListenerAttached = true;
        document.addEventListener('click', (e) => {
            if (e.target.closest('.trade-row')) {
                setTimeout(refreshLabel, 100);
            }
        });
    }
}

export async function init() {
    if (!(await settings.blockUserEnabled)) return;

    const path = window.location.pathname;
    if (!path.startsWith('/trades')) {
        if (observerRequest) {
            observerRequest.active = false;
            observerRequest = null;
        }
        return;
    }
    if (observerRequest) return;

    observerRequest = observeElement('.trade-buttons', addBlockButton, {
        multiple: true,
    });
}
