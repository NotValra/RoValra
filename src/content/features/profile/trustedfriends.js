import { observeElement } from '../../core/observer.js';
import { callRobloxApiJson } from '../../core/api.js';
import { getUserIdFromUrl } from '../../core/idExtractor.js';
import { addTooltip } from '../../core/ui/tooltip.js';
import { showConfirmationPrompt } from '../../core/ui/confirmationPrompt.js';
import { showSystemAlert } from '../../core/ui/roblox/alert.js';
import { log, logLevel } from '../../core/logging.js';

const profileStatusCache = new Map();
const TEST_ALWAYS_ERROR = false;

async function getProfileStatus(userId) {
    if (profileStatusCache.has(userId)) {
        return profileStatusCache.get(userId);
    }

    const profileApiPayload = {
        "includeComponentOrdering": true,
        "profileId": userId,
        "components": [
            {
                "component": "Actions",
                "supportedActions": [
                    "AddTrustedConnection",
                    "AddIncomingTrustedConnection",
                    "RemoveTrustedConnection",
                    "PendingTrustedConnection"
                ]
            }
        ],
        "profileType": "User"
    };

    const statusPromise = (async () => {
        try {
            const profileResponse = await callRobloxApiJson({
                subdomain: 'apis',
                endpoint: '/profile-platform-api/v1/profiles/get',
                method: 'POST',
                body: profileApiPayload
            });

            const actions = profileResponse?.components?.Actions?.contextual || [];

            if (actions.includes('PendingTrustedConnection')) return 'Pending';
            if (actions.includes('AddIncomingTrustedConnection')) return 'Accept';
            if (actions.includes('RemoveTrustedConnection')) return 'Remove';
            if (actions.includes('AddTrustedConnection')) return 'Add';

            return null;
        } catch (err) {
            log(logLevel.ERROR, 'RoValra: Failed to fetch trusted friend status.', err);
            profileStatusCache.delete(userId); 
            throw err;
        }
    })();

    profileStatusCache.set(userId, statusPromise);
    return statusPromise;
}

function createBaseButton(text, isPending = false) {
    const button = document.createElement('button');
    button.type = 'button';
    button.role = 'menuitem';
    button.className = `relative clip group/interactable focus-visible:outline-focus foundation-web-menu-item flex items-center content-default text-truncate-split focus-visible:hover:outline-none stroke-none bg-none text-align-x-left width-full text-body-medium padding-x-medium padding-y-small gap-x-medium radius-medium rovalra-trusted-friend-btn ${isPending ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`;
    
    if (isPending) {
        button.setAttribute('aria-disabled', 'true');
    }

    const presentationDiv = document.createElement('div');
    presentationDiv.setAttribute('role', 'presentation');
    presentationDiv.className = 'absolute inset-[0] transition-colors group-hover/interactable:bg-[var(--color-state-hover)] group-active/interactable:bg-[var(--color-state-press)]';

    const textDiv = document.createElement('div');
    textDiv.className = 'grow-1 text-truncate-split flex flex-col gap-y-xsmall';
    
    const titleSpan = document.createElement('span');
    titleSpan.className = 'foundation-web-menu-item-title text-no-wrap text-truncate-split content-emphasis';
    titleSpan.textContent = text;

    textDiv.appendChild(titleSpan);
    button.append(presentationDiv, textDiv);

    return { button, titleSpan };
}

function createPendingButton() {
    const { button } = createBaseButton('Pending Trusted Connection', true);
    button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
    });
    addTooltip(button, 'Trusted Connection Request Pending', { position: 'top' });
    return button;
}

function createAddButton(userId) {
    const { button, titleSpan } = createBaseButton('Add Trusted Connection');
    button.addEventListener('click', () => {
        showConfirmationPrompt({
            title: 'Add Trusted Connection',
            message: 'Are you sure you want to send a trusted connection request?',
            confirmText: 'Send Request',
            onConfirm: () => {
                titleSpan.textContent = 'Sending...';
                button.disabled = true;

                const action = async () => {
                    if (TEST_ALWAYS_ERROR) throw new Error('Simulated Error');
                    await callRobloxApiJson({
                        subdomain: 'friends',
                        endpoint: `/v1/users/${userId}/send-trusted-friend-request`,
                        method: 'POST',
                        body: []
                    });
                };

                action().then(async () => {
                    showSystemAlert('Trusted connection request sent!', 'success');
                    await refreshButtonState(button, userId);
                }).catch(err => {
                    log(logLevel.ERROR, 'RoValra: Failed to send trusted friend request.', err);
                    showSystemAlert('Failed to send trusted connection request.', 'warning');
                    titleSpan.textContent = 'Error Sending';
                    setTimeout(() => {
                        titleSpan.textContent = 'Add Trusted Connection';
                        button.disabled = false;
                    }, 2000);
                });
            }
        });
    });
    return button;
}

function createAcceptButton(userId) {
    const { button, titleSpan } = createBaseButton('Accept Trusted Connection');
    button.addEventListener('click', () => {
        showConfirmationPrompt({
            title: 'Accept Trusted Connection',
            message: 'Are you sure you want to accept this trusted connection request?',
            confirmText: 'Accept',
            onConfirm: () => {
                titleSpan.textContent = 'Accepting...';
                button.disabled = true;

                const action = async () => {
                    if (TEST_ALWAYS_ERROR) throw new Error('Simulated Error');
                    await callRobloxApiJson({
                        subdomain: 'friends',
                        endpoint: `/v1/users/${userId}/accept-trusted-friend-request`,
                        method: 'POST',
                        body: []
                    });
                };

                action().then(async () => {
                    showSystemAlert('Trusted connection request accepted!', 'success');
                    await refreshButtonState(button, userId);
                }).catch(err => {
                    log(logLevel.ERROR, 'RoValra: Failed to accept trusted friend request.', err);
                    showSystemAlert('Failed to accept trusted connection request.', 'warning');
                    titleSpan.textContent = 'Error Accepting';
                    setTimeout(() => {
                        titleSpan.textContent = 'Accept Trusted Connection';
                        button.disabled = false;
                    }, 2000);
                });
            }
        });
    });
    return button;
}

function createRemoveButton(userId) {
    const { button, titleSpan } = createBaseButton('Remove Trusted Connection');
    button.addEventListener('click', () => {
        showConfirmationPrompt({
            title: 'Remove Trusted Connection',
            message: 'Are you sure you want to remove this trusted connection?',
            confirmText: 'Remove',
            confirmType: 'primary-destructive',
            onConfirm: () => {
                titleSpan.textContent = 'Removing...';
                button.disabled = true;

                const action = async () => {
                    if (TEST_ALWAYS_ERROR) throw new Error('Simulated Error');
                    await callRobloxApiJson({
                        subdomain: 'friends',
                        endpoint: `/v1/users/${userId}/remove-trusted-friend`,
                        method: 'POST',
                        body: []
                    });
                };

                action().then(async () => {
                    showSystemAlert('Trusted connection removed!', 'success');
                    await refreshButtonState(button, userId);
                }).catch(err => {
                    log(logLevel.ERROR, 'RoValra: Failed to remove trusted friend.', err);
                    showSystemAlert('Failed to remove trusted connection.', 'warning');
                    titleSpan.textContent = 'Error Removing';
                    setTimeout(() => {
                        titleSpan.textContent = 'Remove Trusted Connection';
                        button.disabled = false;
                    }, 2000);
                });
            }
        });
    });
    return button;
}

function createButtonForStatus(status, userId) {
    switch (status) {
        case 'Pending': return createPendingButton();
        case 'Add': return createAddButton(userId);
        case 'Accept': return createAcceptButton(userId);
        case 'Remove': return createRemoveButton(userId);
        default: return null;
    }
}

async function refreshButtonState(currentButton, userId) {
    profileStatusCache.delete(userId);
    const newStatus = await getProfileStatus(userId);
    const newButton = createButtonForStatus(newStatus, userId);
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

        const buttonToAdd = createButtonForStatus(status, userId);

        if (buttonToAdd) {
            const menuItems = menu.querySelectorAll('button[role="menuitem"]');
            if (menuItems.length >= 2) {
                menuItems[2].insertAdjacentElement('beforebegin', buttonToAdd);
            } else {
                menu.appendChild(buttonToAdd);
            }
        }
    } catch (err) {
    }
}

export function init() {
    chrome.storage.local.get({ trustedConnectionsEnabled: true }, (settings) => {
        if (!settings.trustedConnectionsEnabled) return;

        observeElement('#user-profile-header-contextual-menu-button', (button) => {
            const userId = getUserIdFromUrl();
            if (userId) {
                getProfileStatus(userId); 
            }

            if (button.dataset.rovalraTrustedListener) {
                return;
            }
            button.dataset.rovalraTrustedListener = 'true';

            button.addEventListener('click', () => {
                observeElement('div[data-radix-popper-content-wrapper] div[role="menu"]', (menu) => {
                    addTrustedFriendButton(menu);
                }, { once: true });
            });
        });
    });
}