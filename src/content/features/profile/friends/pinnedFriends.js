import { getProfilePlatformData, PROFILE_ACTIONS, PROFILE_COMPONENTS } from '../../../core/apis/users.js';
import { getUserIdFromUrl } from '../../../core/idExtractor.js';
import { t } from '../../../core/locale/i18n.js';
import { PINNED_FRIENDS_STORAGE_KEY, loadPinnedFriends, savePinnedFriends } from '../../../core/profile/pinnedFriends.js';
import { settings } from '../../../core/settings/getSettings.js';
import { getAuthenticatedUserId } from '../../../core/user.js';
import { createContextMenuButton, registerProfileContextMenuAction } from '../../../core/ui/profile/contextMenu.js';

const SETTING_NAME = 'pinnedFriendsEnabled';
const BUTTON_CLASS = 'rovalra-profile-pin-friend-button';
const pendingMenus = new WeakSet();
let enabled = false;
let initialized = false;

async function isFriend(userId) {
    const authenticatedUserId = await getAuthenticatedUserId();
    if (!authenticatedUserId || String(authenticatedUserId) === userId) {
        return false;
    }

    const profileResponse = await getProfilePlatformData({
        profileId: userId,
        components: [{ component: PROFILE_COMPONENTS.ACTIONS, supportedActions: [PROFILE_ACTIONS.UNFRIEND] }],
    });

    return profileResponse?.components?.Actions?.contextual?.includes(PROFILE_ACTIONS.UNFRIEND) === true;
}

async function refreshPinButtonLabel(button, titleSpan, userId) {
    const pinnedFriends = await loadPinnedFriends();
    titleSpan.textContent = pinnedFriends.has(userId)
        ? await t('pinnedFriends.unpinFromFriendsList', { defaultValue: 'Unpin from friends list' })
        : await t('pinnedFriends.pinToFriendsList', { defaultValue: 'Pin to friends list' });
    button.dataset.userId = userId;
}

async function createPinButton(userId) {
    const { button, titleSpan } = createContextMenuButton('');
    button.classList.add(BUTTON_CLASS);
    await refreshPinButtonLabel(button, titleSpan, userId);

    button.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!enabled || button.disabled || getUserIdFromUrl() !== userId) {
            return;
        }

        button.disabled = true;
        try {
            if (!(await isFriend(userId))) {
                button.remove();
                return;
            }
            if (!enabled || getUserIdFromUrl() !== userId) return;

            const pinnedFriends = await loadPinnedFriends();
            if (pinnedFriends.has(userId)) {
                pinnedFriends.delete(userId);
            } else {
                pinnedFriends.add(userId);
            }
            await savePinnedFriends(pinnedFriends);
            await refreshPinButtonLabel(button, titleSpan, userId);
        } catch {
        } finally {
            button.disabled = false;
        }
    });

    return button;
}

async function addPinFriendButton(menu) {
    const userId = getUserIdFromUrl();
    if (!enabled || !userId || pendingMenus.has(menu)) return;
    if (menu.querySelector(`.${BUTTON_CLASS}`)) return;

    pendingMenus.add(menu);
    try {
        if (!(await isFriend(userId))) return;

        const button = await createPinButton(userId);
        if (!enabled || !menu.isConnected || getUserIdFromUrl() !== userId) {
            return;
        }

        const container = menu.querySelector('[role="group"]') || menu;
        const menuItems = container.querySelectorAll('[role="menuitem"]');
        if (menuItems.length > 0) {
            menuItems[menuItems.length - 1].insertAdjacentElement('afterend', button);
        } else {
            container.appendChild(button);
        }
    } catch {
    } finally {
        pendingMenus.delete(menu);
    }
}

export async function init() {
    if (initialized) return;
    initialized = true;
    enabled = (await settings[SETTING_NAME]) === true;
    registerProfileContextMenuAction(addPinFriendButton);

    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace !== 'local') return;
        if (changes[SETTING_NAME]) {
            enabled = changes[SETTING_NAME].newValue === true;
            if (!enabled) {
                document.querySelectorAll(`.${BUTTON_CLASS}`).forEach((button) => {
                    button.remove();
                });
            }
        }
        if (enabled && changes[PINNED_FRIENDS_STORAGE_KEY]) {
            document.querySelectorAll(`.${BUTTON_CLASS}`).forEach((button) => {
                const titleSpan = button.querySelector('.foundation-web-menu-item-title');
                refreshPinButtonLabel(button, titleSpan, button.dataset.userId);
            });
        }
    });
}
