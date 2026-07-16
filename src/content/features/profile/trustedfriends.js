import { observeElement } from '../../core/observer.js';
import { callRobloxApiJson } from '../../core/api.js';
import { getUserIdFromUrl } from '../../core/idExtractor.js';
import { addTooltip } from '../../core/ui/tooltip.js';
import { showConfirmationPrompt } from '../../core/ui/confirmationPrompt.js';
import { showSystemAlert } from '../../core/ui/roblox/alert.js';
import { t } from '../../core/locale/i18n.js';
import {
    registerProfileContextMenuAction,
    createContextMenuButton,
} from '../../core/ui/profile/contextMenu.js';

const profileStatusCache = new Map();
const TEST_ALWAYS_ERROR = false;

async function getProfileStatus(userId) {
    if (profileStatusCache.has(userId)) {
        return profileStatusCache.get(userId);
    }

    const profileApiPayload = {
        includeComponentOrdering: true,
        profileId: userId,
        components: [
            {
                component: 'Actions',
                supportedActions: [
                    'AddTrustedConnection',
                    'AddIncomingTrustedConnection',
                    'RemoveTrustedConnection',
                    'PendingTrustedConnection',
                ],
            },
        ],
        profileType: 'User',
    };

    const statusPromise = (async () => {
        try {
            const profileResponse = await callRobloxApiJson({
                subdomain: 'apis',
                endpoint: '/profile-platform-api/v1/profiles/get',
                method: 'POST',
                body: profileApiPayload,
            });

            const actions =
                profileResponse?.components?.Actions?.contextual || [];

            if (actions.includes('PendingTrustedConnection')) return 'Pending';
            if (actions.includes('AddIncomingTrustedConnection'))
                return 'Accept';
            if (actions.includes('RemoveTrustedConnection')) return 'Remove';
            if (actions.includes('AddTrustedConnection')) return 'Add';

            return null;
        } catch (err) {
            console.error(
                'RoValra: Failed to fetch trusted friend status.',
                err,
            );
            profileStatusCache.delete(userId);
            throw err;
        }
    })();

    profileStatusCache.set(userId, statusPromise);
    return statusPromise;
}

async function createPendingButton() {
    const { button } = createContextMenuButton(
        await t('trustedFriends.pendingConnection'),
        true,
    );
    button.classList.add('rovalra-trusted-friend-btn');
    button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
    });
    addTooltip(button, await t('trustedFriends.pendingRequest'), {
        position: 'top',
    });
    return button;
}

async function createAddButton(userId) {
    const { button, titleSpan } = createContextMenuButton(
        await t('trustedFriends.addConnection'),
    );
    button.classList.add('rovalra-trusted-friend-btn');
    button.addEventListener('click', async () => {
        showConfirmationPrompt({
            title: await t('trustedFriends.addConnection'),
            message: await t('trustedFriends.addConfirmation'),
            confirmText: await t('trustedFriends.sendRequest'),
            onConfirm: async () => {
                titleSpan.textContent = await t('trustedFriends.sending');
                button.disabled = true;

                const action = async () => {
                    if (TEST_ALWAYS_ERROR) throw new Error('Simulated Error');
                    await callRobloxApiJson({
                        subdomain: 'friends',
                        endpoint: `/v1/users/${userId}/send-trusted-friend-request`,
                        method: 'POST',
                        body: [],
                    });
                };

                action()
                    .then(async () => {
                        showSystemAlert(
                            await t('trustedFriends.requestSent'),
                            'success',
                        );
                        await refreshButtonState(button, userId);
                    })
                    .catch(async (err) => {
                        console.error(
                            'RoValra: Failed to send trusted friend request.',
                            err,
                        );
                        showSystemAlert(
                            await t('trustedFriends.requestFailed'),
                            'warning',
                        );
                        titleSpan.textContent = await t(
                            'trustedFriends.errorSending',
                        );
                        setTimeout(async () => {
                            titleSpan.textContent = await t(
                                'trustedFriends.addConnection',
                            );
                            button.disabled = false;
                        }, 2000);
                    });
            },
        });
    });
    return button;
}

async function createAcceptButton(userId) {
    const { button, titleSpan } = createContextMenuButton(
        await t('trustedFriends.acceptConnection'),
    );
    button.classList.add('rovalra-trusted-friend-btn');
    button.addEventListener('click', async () => {
        showConfirmationPrompt({
            title: await t('trustedFriends.acceptConnection'),
            message: await t('trustedFriends.acceptConfirmation'),
            confirmText: await t('trustedFriends.accept'),
            onConfirm: async () => {
                titleSpan.textContent = await t('trustedFriends.accepting');
                button.disabled = true;

                const action = async () => {
                    if (TEST_ALWAYS_ERROR) throw new Error('Simulated Error');
                    await callRobloxApiJson({
                        subdomain: 'friends',
                        endpoint: `/v1/users/${userId}/accept-trusted-friend-request`,
                        method: 'POST',
                        body: [],
                    });
                };

                action()
                    .then(async () => {
                        showSystemAlert(
                            await t('trustedFriends.requestAccepted'),
                            'success',
                        );
                        await refreshButtonState(button, userId);
                    })
                    .catch(async (err) => {
                        console.error(
                            'RoValra: Failed to accept trusted friend request.',
                            err,
                        );
                        showSystemAlert(
                            await t('trustedFriends.acceptFailed'),
                            'warning',
                        );
                        titleSpan.textContent = await t(
                            'trustedFriends.errorAccepting',
                        );
                        setTimeout(async () => {
                            titleSpan.textContent = await t(
                                'trustedFriends.acceptConnection',
                            );
                            button.disabled = false;
                        }, 2000);
                    });
            },
        });
    });
    return button;
}

async function createRemoveButton(userId) {
    const { button, titleSpan } = createContextMenuButton(
        await t('trustedFriends.removeConnection'),
    );
    button.classList.add('rovalra-trusted-friend-btn');
    button.addEventListener('click', async () => {
        showConfirmationPrompt({
            title: await t('trustedFriends.removeConnection'),
            message: await t('trustedFriends.removeConfirmation'),
            confirmText: await t('trustedFriends.remove'),
            confirmType: 'primary-destructive',
            onConfirm: async () => {
                titleSpan.textContent = await t('trustedFriends.removing');
                button.disabled = true;

                const action = async () => {
                    if (TEST_ALWAYS_ERROR) throw new Error('Simulated Error');
                    await callRobloxApiJson({
                        subdomain: 'friends',
                        endpoint: `/v1/users/${userId}/remove-trusted-friend`,
                        method: 'POST',
                        body: [],
                    });
                };

                action()
                    .then(async () => {
                        showSystemAlert(
                            await t('trustedFriends.connectionRemoved'),
                            'success',
                        );
                        await refreshButtonState(button, userId);
                    })
                    .catch(async (err) => {
                        console.error(
                            'RoValra: Failed to remove trusted friend.',
                            err,
                        );
                        showSystemAlert(
                            await t('trustedFriends.removeFailed'),
                            'warning',
                        );
                        titleSpan.textContent = await t(
                            'trustedFriends.errorRemoving',
                        );
                        setTimeout(async () => {
                            titleSpan.textContent = await t(
                                'trustedFriends.removeConnection',
                            );
                            button.disabled = false;
                        }, 2000);
                    });
            },
        });
    });
    return button;
}

async function createButtonForStatus(status, userId) {
    switch (status) {
        case 'Pending':
            return await createPendingButton();
        case 'Add':
            return await createAddButton(userId);
        case 'Accept':
            return await createAcceptButton(userId);
        case 'Remove':
            return await createRemoveButton(userId);
        default:
            return null;
    }
}

async function refreshButtonState(currentButton, userId) {
    profileStatusCache.delete(userId);
    const newStatus = await getProfileStatus(userId);
    const newButton = await createButtonForStatus(newStatus, userId);
    if (newButton) {
        currentButton.replaceWith(newButton);
    } else {
        currentButton.remove();
    }
}

async function addTrustedFriendButton(menu) {
    if (menu.dataset.rovalraTrustedFriendBtnAdded) {
        return;
    }
    menu.dataset.rovalraTrustedFriendBtnAdded = 'true';

    const userId = getUserIdFromUrl();
    if (!userId) {
        return;
    }

    try {
        const status = await getProfileStatus(userId);

        const buttonToAdd = await createButtonForStatus(status, userId);

        if (buttonToAdd) {
            const menuItems = menu.querySelectorAll('button[role="menuitem"]');
            if (menuItems.length >= 2) {
                menuItems[2].insertAdjacentElement('beforebegin', buttonToAdd);
            } else {
                menu.appendChild(buttonToAdd);
            }
        }
    } catch (err) {}
}
//test
export function init() {
    chrome.storage.local.get(
        { trustedConnectionsEnabledv2: true },
        async (settings) => {
            if (!settings.trustedConnectionsEnabledv2) return;

            registerProfileContextMenuAction(addTrustedFriendButton, () => {
                const userId = getUserIdFromUrl();
                if (userId) {
                    getProfileStatus(userId);
                }
            });
        },
    );
}
