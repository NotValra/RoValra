import { callRobloxApiJson } from '../../core/api.js';
import { t } from '../../core/locale/i18n.js';
import { settings } from '../../core/settings/getSettings.js';
import {
    FRIEND_UPDATES_KEY,
    FRIEND_UPDATE_INTERVAL,
    normalizeUpdate,
    normalizeUpdates,
    normalizeUserId,
} from './friendRelationshipNotifier/contract.js';

const RETRY_DELAY = 500;
const userLabels = new Map();
const state = {
    enabled: false,
    userId: null,
    pollTimer: null,
    retryTimer: null,
    version: 0,
};

let initialized = false;
let renderVersion = 0;
let notificationRoot = null;

function sendMessage(message) {
    return new Promise((resolve) => {
        try {
            chrome.runtime.sendMessage(message, (response) => {
                resolve(
                    chrome.runtime.lastError
                        ? { status: 'failed' }
                        : (response ?? { status: 'failed' }),
                );
            });
        } catch {
            resolve({ status: 'failed' });
        }
    });
}

function isActive(userId, version) {
    return (
        state.enabled && state.userId === userId && state.version === version
    );
}

function clearNotifications() {
    renderVersion += 1;
    notificationRoot?.remove();
    notificationRoot = null;
}

function getNotificationRoot() {
    if (notificationRoot?.isConnected) return notificationRoot;

    notificationRoot = document.createElement('section');
    notificationRoot.className = 'rovalra-friend-relationship-notifications';
    notificationRoot.setAttribute('aria-live', 'polite');
    document.body.append(notificationRoot);
    return notificationRoot;
}

function showNotifications(userId, notifications, dismissLabel, profileLabel) {
    const root = getNotificationRoot();
    root.replaceChildren();

    for (const notification of notifications) {
        const card = document.createElement('article');
        card.className = `rovalra-friend-relationship-notification rovalra-friend-relationship-notification-${notification.change}`;

        const message = document.createElement('p');
        message.className = 'rovalra-friend-relationship-notification-message';
        message.textContent = notification.message;

        const actions = document.createElement('div');
        actions.className = 'rovalra-friend-relationship-notification-actions';

        const dismissButton = document.createElement('button');
        dismissButton.type = 'button';
        dismissButton.textContent = dismissLabel;
        dismissButton.addEventListener('click', () =>
            dismissNotification(userId, notification.id),
        );

        const profileLink = document.createElement('a');
        profileLink.href = `https://www.roblox.com/users/${notification.userId}/profile`;
        profileLink.target = '_blank';
        profileLink.rel = 'noopener noreferrer';
        profileLink.textContent = profileLabel;

        actions.append(dismissButton, profileLink);
        card.append(message, actions);
        root.append(card);
    }
}

function getUserLabel(userId) {
    if (userLabels.has(userId)) return userLabels.get(userId);

    const label = callRobloxApiJson({
        subdomain: 'users',
        endpoint: `/v1/users/${userId}`,
        method: 'GET',
        credentials: 'include',
        useBackground: true,
        noCache: true,
    })
        .then((user) => {
            const displayName = String(user?.displayName || '').trim();
            const username = String(user?.name || '').trim();
            return displayName && username
                ? `${displayName} (@${username})`
                : t('friendRelationshipNotifier.userFallback', { id: userId });
        })
        .catch(async (error) => {
            console.warn('RoValra: Failed to resolve changed friend', error);
            return t('friendRelationshipNotifier.userFallback', { id: userId });
        });
    userLabels.set(userId, label);
    return label;
}

async function renderNotifications(userId, updates, version) {
    const currentRender = ++renderVersion;
    const notifications = (Array.isArray(updates) ? updates : [])
        .map(normalizeUpdate)
        .filter(Boolean);

    if (notifications.length === 0) {
        if (isActive(userId, version)) clearNotifications();
        return;
    }

    const [dismissLabel, profileLabel, messages] = await Promise.all([
        t('friendRelationshipNotifier.dismiss'),
        t('friendRelationshipNotifier.viewProfile'),
        Promise.all(
            notifications.map(async (notification) => ({
                ...notification,
                message: await t(
                    notification.change === 'added'
                        ? 'friendRelationshipNotifier.friendAdded'
                        : 'friendRelationshipNotifier.friendRemoved',
                    { user: await getUserLabel(notification.userId) },
                ),
            })),
        ),
    ]);

    // Ignore delayed work from an older page session or render.
    if (currentRender !== renderVersion || !isActive(userId, version)) return;
    showNotifications(userId, messages, dismissLabel, profileLabel);
}

async function getStoredUpdates(userId) {
    const storage = await chrome.storage.local.get(FRIEND_UPDATES_KEY);
    return normalizeUpdates(storage[FRIEND_UPDATES_KEY])[userId] ?? [];
}

function scheduleRetry(version) {
    if (state.retryTimer) return;

    state.retryTimer = setTimeout(() => {
        state.retryTimer = null;
        pollSafely(version);
    }, RETRY_DELAY);
}

async function poll(version = state.version) {
    const response = await sendMessage({
        action: 'pollFriendRelationshipNotifier',
    });
    const userId = normalizeUserId(response?.userId);

    if (!userId || !state.enabled || state.version !== version) {
        if (response?.status === 'signedOut' && state.version === version) {
            state.userId = null;
            clearNotifications();
        }
        if (response?.status === 'busy' && state.enabled) {
            scheduleRetry(version);
        }
        return;
    }

    if (state.userId !== userId) {
        state.userId = userId;
        clearNotifications();
    }

    const updates = Array.isArray(response.pending)
        ? response.pending
        : await getStoredUpdates(userId);
    if (isActive(userId, version)) {
        await renderNotifications(userId, updates, version);
    }
}

function pollSafely(version) {
    poll(version).catch((error) =>
        console.warn('RoValra: Friend relationship polling failed', error),
    );
}

async function dismissNotification(userId, notificationId) {
    const version = state.version;
    if (!isActive(userId, version)) return;

    const response = await sendMessage({
        action: 'dismissFriendRelationshipNotifierNotification',
        userId,
        notificationId,
    });
    if (response.status === 'ok' && isActive(userId, version)) {
        await renderNotifications(userId, response.pending, version);
    }
}

function setEnabled(enabled) {
    state.version += 1;
    const version = state.version;
    state.enabled = enabled;
    clearInterval(state.pollTimer);
    clearTimeout(state.retryTimer);
    state.pollTimer = null;
    state.retryTimer = null;

    if (!enabled) {
        state.userId = null;
        clearNotifications();
        return;
    }

    pollSafely(version);
    state.pollTimer = setInterval(
        () => pollSafely(version),
        FRIEND_UPDATE_INTERVAL,
    );
}

export async function init() {
    if (initialized) return;
    initialized = true;

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local') return;

        if (changes[FRIEND_UPDATES_KEY] && state.enabled && state.userId) {
            const updates = normalizeUpdates(
                changes[FRIEND_UPDATES_KEY].newValue,
            )[state.userId];
            renderNotifications(state.userId, updates, state.version).catch(
                (error) =>
                    console.warn(
                        'RoValra: Failed to refresh friend notifications',
                        error,
                    ),
            );
        }

        if (changes.friendRelationshipNotifierEnabled) {
            setEnabled(
                changes.friendRelationshipNotifierEnabled.newValue === true,
            );
        }
    });

    setEnabled((await settings.friendRelationshipNotifierEnabled) === true);
}
