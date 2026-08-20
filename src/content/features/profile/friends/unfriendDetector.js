import { createOverlay } from '../../../core/ui/overlay.js';
import { createButton } from '../../../core/ui/buttons.js';
import {
    fetchThumbnails,
    createThumbnailElement,
} from '../../../core/thumbnail/thumbnails.js';
import { ts } from '../../../core/locale/i18n.js';
import { getAuthenticatedUserId } from '../../../core/user.js';
import { settings } from '../../../core/settings/getSettings.js';
import { setUnfriendDetectedListener } from '../../../core/utils/trackers/unfriendDetector.js';
import { callRobloxApiJson } from '../../../core/api';

const PENDING_UNFRIENDS_KEY = 'rovalra_pending_unfriends';

let isShowingOverlay = false;
let isHandlingQueue = false;
let listenerAttached = false;

async function resolveMissingNames(unfriendedUsers) {
    const missing = unfriendedUsers.filter(
        (u) => !u.displayName && !u.username,
    );
    if (!missing.length) return unfriendedUsers;

    const resolved = new Map();

    await Promise.all(
        missing.map(async (user) => {
            try {
                const accountData = await callRobloxApiJson({
                    subdomain: 'users',
                    endpoint: `/v1/users/${user.id}`,
                    useBackground: true,
                });
                if (accountData?.name || accountData?.displayName) {
                    resolved.set(Number(user.id), {
                        username: accountData.name || null,
                        displayName: accountData.displayName || null,
                    });
                }
            } catch (error) {
                console.error(
                    'RoValra: Failed to resolve missing unfriend detector name',
                    error,
                );
            }
        }),
    );

    if (!resolved.size) return unfriendedUsers;

    return unfriendedUsers.map((u) => {
        const found = resolved.get(Number(u.id));
        if (!found) return u;
        return {
            ...u,
            username: u.username || found.username,
            displayName: u.displayName || found.displayName,
        };
    });
}

async function handlePendingQueue() {
    if (isHandlingQueue) return;
    isHandlingQueue = true;

    try {
        if (!(await settings.unfriendDetectorEnabled)) return;

        const userId = await getAuthenticatedUserId();
        if (!userId) return;

        const pending = await consumePendingUnfriends(userId);
        if (pending.length) {
            await showUnfriendDetectedOverlay(pending);
        }
    } finally {
        isHandlingQueue = false;
    }
}

async function consumePendingUnfriends(userId) {
    const result = await new Promise((resolve) =>
        chrome.storage.local.get([PENDING_UNFRIENDS_KEY], resolve),
    );
    const allPending = result[PENDING_UNFRIENDS_KEY] || {};
    const pending = allPending[userId] || [];

    if (!pending.length) return [];

    delete allPending[userId];
    await new Promise((resolve) =>
        chrome.storage.local.set(
            { [PENDING_UNFRIENDS_KEY]: allPending },
            resolve,
        ),
    );

    return pending;
}

async function showUnfriendDetectedOverlay(unfriendedUsers) {
    if (isShowingOverlay || !unfriendedUsers.length) return;
    isShowingOverlay = true;

    unfriendedUsers = await resolveMissingNames(unfriendedUsers);

    const bodyContent = document.createElement('div');
    bodyContent.style.padding = '16px 0';

    const description = document.createElement('p');
    description.textContent =
        unfriendedUsers.length === 1
            ? ts('unfriendDetector.descriptionSingle')
            : ts('unfriendDetector.descriptionPlural', {
                  count: unfriendedUsers.length,
              });
    description.style.marginBottom = '16px';
    bodyContent.appendChild(description);

    const list = document.createElement('div');
    list.style.display = 'grid';
    list.style.gridTemplateColumns = '1fr 1fr';
    list.style.gap = '12px';
    list.style.maxHeight = '400px';
    list.style.overflowY = 'auto';

    let thumbnails = new Map();
    try {
        thumbnails = await fetchThumbnails(
            unfriendedUsers.map((u) => ({ id: u.id })),
            'AvatarHeadshot',
            '48x48',
            true,
        );
    } catch (error) {
        console.error('RoValra: Failed to fetch unfriend detector thumbnails', error);
    }

    for (const user of unfriendedUsers) {
        const displayName =
            user.displayName || user.username || `User ${user.id}`;

        const item = document.createElement('a');
        item.href = `/users/${user.id}/profile`;
        item.title = ts('unfriendDetector.viewProfile', { name: displayName });
        item.style.display = 'flex';
        item.style.alignItems = 'center';
        item.style.gap = '12px';
        item.style.padding = '12px';
        item.style.borderRadius = '8px';
        item.style.backgroundColor =
            'var(--rovalra-container-background-color)';
        item.style.textDecoration = 'none';
        item.style.color = 'inherit';
        item.style.cursor = 'pointer';
        item.style.transition = 'background-color 0.15s';

        item.addEventListener('mouseenter', () => {
            item.style.backgroundColor =
                'var(--rovalra-hover-background-color, rgba(255, 255, 255, 0.08))';
        });
        item.addEventListener('mouseleave', () => {
            item.style.backgroundColor =
                'var(--rovalra-container-background-color)';
        });

        const thumbnail = thumbnails.get(Number(user.id));
        if (thumbnail) {
            const thumbElement = createThumbnailElement(
                thumbnail,
                displayName,
                '',
                {
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    flexShrink: '0',
                },
            );
            item.appendChild(thumbElement);
        }

        const infoContainer = document.createElement('div');
        infoContainer.style.display = 'flex';
        infoContainer.style.flexDirection = 'column';
        infoContainer.style.gap = '4px';
        infoContainer.style.minWidth = '0';

        const nameText = document.createElement('span');
        nameText.style.fontWeight = '500';
        nameText.style.lineHeight = '1.2';
        nameText.textContent = displayName;
        infoContainer.appendChild(nameText);

        if (user.username) {
            const usernameText = document.createElement('span');
            usernameText.style.opacity = '0.6';
            usernameText.style.fontSize = '12px';
            usernameText.style.lineHeight = '1.2';
            usernameText.textContent = `@${user.username}`;
            infoContainer.appendChild(usernameText);
        }

        item.appendChild(infoContainer);
        list.appendChild(item);
    }

    bodyContent.appendChild(list);

    const dismissButton = createButton(
        ts('unfriendDetector.dismiss'),
        'primary',
    );

    const overlay = createOverlay({
        title:
            unfriendedUsers.length === 1
                ? ts('unfriendDetector.titleSingle')
                : ts('unfriendDetector.titlePlural'),
        bodyContent,
        actions: [dismissButton],
        showLogo: true,
        onClose: () => {
            isShowingOverlay = false;
        },
    });

    dismissButton.addEventListener('click', () => overlay.close());
}

export async function init() {
    if (!(await settings.unfriendDetectorEnabled)) return;
    setUnfriendDetectedListener((removedFriends) => {
        showUnfriendDetectedOverlay(removedFriends);
    });

    await handlePendingQueue();

    if (!listenerAttached && chrome.storage?.onChanged) {
        listenerAttached = true;
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== 'local') return;
            if (!changes[PENDING_UNFRIENDS_KEY]) return;
            handlePendingQueue();
        });
    }
}