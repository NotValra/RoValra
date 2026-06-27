import { observeChildren, observeElement } from '../../core/observer.js';
import { callRobloxApi } from '../../core/api.js';
import { settings } from '../../core/settings/getSettings.js';

const BUTTON_ID = 'rovalra-dismiss-all-notifications';
const STATUS_ID = 'rovalra-dismiss-all-notifications-status';
const HEADER_SELECTOR = '.notification-stream-header';
const LIST_SELECTOR = '.notification-stream-list';
const DISMISS_BUTTON_SELECTOR =
    'button.notif-row-left-button.btn-secondary-xs.btn-min-width';
const DISMISS_DELAY_MS = 120;
const RATE_LIMIT_SAFETY_REQUESTS = 1;

let dismissing = false;
let stateUpdateQueued = false;
let initialized = false;
let rateLimitRequestsLeft = null;
let rateLimitResetAt = 0;
let rateLimitBlockedUntil = 0;
let cooldownInterval = null;
let statusState = {
    type: 'ready',
    message: 'Ready to dismiss notifications.',
};

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getNotificationList() {
    return document.querySelector(LIST_SELECTOR);
}

function getSecondsUntil(timestamp) {
    return Math.max(0, Math.ceil((timestamp - Date.now()) / 1000));
}

function getResetAtFromHeaders(headers) {
    const resetHeader =
        headers.get('x-ratelimit-reset') || headers.get('retry-after');
    const resetValue = Number(resetHeader);

    if (!Number.isFinite(resetValue)) return 0;

    if (resetValue > 1e9) {
        return resetValue * 1000 + 1000;
    }

    return Date.now() + resetValue * 1000 + 1000;
}

function isRateLimitPaused() {
    const now = Date.now();

    return (
        rateLimitBlockedUntil > now ||
        (rateLimitRequestsLeft !== null &&
            rateLimitRequestsLeft <= 0 &&
            rateLimitResetAt > now)
    );
}

function getRateLimitResetAt() {
    return Math.max(rateLimitResetAt, rateLimitBlockedUntil);
}

function getRateLimitDetail() {
    const resetAt = getRateLimitResetAt();
    const details = [];

    if (rateLimitRequestsLeft !== null) {
        details.push(`Requests left: ${Math.max(0, rateLimitRequestsLeft)}`);
    } else {
        details.push('Requests left: waiting for Roblox');
    }

    if (resetAt > Date.now()) {
        details.push(`Reset: ${getSecondsUntil(resetAt)}s`);
    }

    return details.join(' | ');
}

function applyRateLimitHeaders(response) {
    const remainingHeader = response.headers.get('x-ratelimit-remaining');
    const remaining = Number(remainingHeader);
    const resetAt = getResetAtFromHeaders(response.headers);

    if (Number.isFinite(remaining)) {
        rateLimitRequestsLeft = Math.max(
            0,
            remaining + RATE_LIMIT_SAFETY_REQUESTS,
        );
    }

    if (resetAt) {
        rateLimitResetAt = resetAt;
    }

    if (response.status === 429) {
        rateLimitRequestsLeft = 0;
        rateLimitBlockedUntil = resetAt || Date.now() + 3000;
        startCooldownTimer();
    }
}

function isDismissButton(button) {
    if (!(button instanceof HTMLButtonElement)) return false;
    if (button.disabled) return false;
    if (button.closest('.ng-hide')) return false;

    return button.textContent.trim().replace(/\s+/g, ' ') === 'Dismiss';
}

function getDismissButtons() {
    const list = getNotificationList();
    if (!list) return [];

    return [...list.querySelectorAll(DISMISS_BUTTON_SELECTOR)].filter(
        isDismissButton,
    );
}

function parseNotificationData(card) {
    const dataElement = card?.querySelector('[notification-data]');
    const rawData = dataElement?.getAttribute('notification-data');

    if (!rawData) return null;

    try {
        return JSON.parse(rawData);
    } catch (error) {
        console.warn('RoValra: Failed to parse notification data', error);
        return null;
    }
}

function getCurrentNotificationState(notificationData) {
    const states = notificationData?.content?.states;
    if (!states) return null;

    const currentState = notificationData?.content?.currentState;
    if (currentState && states[currentState]) return states[currentState];

    return Object.values(states)[0] || null;
}

function getDismissAction(button) {
    const card = button.closest(
        'li[notification-card], li[id^="notification-stream-"]',
    );
    const notificationData = parseNotificationData(card);
    const notificationState = getCurrentNotificationState(notificationData);
    const notificationId =
        notificationData?.id || card?.id?.replace(/^notification-stream-/, '');
    const visualButtons = notificationState?.visualItems?.button || [];

    if (!notificationId || !visualButtons.length) return null;

    const dismissVisualButton = visualButtons.find((visualButton) => {
        const label = visualButton?.label?.text?.trim();
        const hasDismissAction = visualButton?.actions?.some(
            (action) => action.actionType === 'dismiss',
        );
        const hasNotificationApiAction = visualButton?.actions?.some(
            (action) => action.actionType === 'notificationAPI' && action.path,
        );

        return (
            hasNotificationApiAction &&
            (label === 'Dismiss' || hasDismissAction)
        );
    });

    const apiAction = dismissVisualButton?.actions?.find(
        (action) => action.actionType === 'notificationAPI' && action.path,
    );

    if (!apiAction?.path) return null;

    return {
        button,
        card,
        notificationId,
        actionPath: apiAction.path,
    };
}

function getDismissActions() {
    return getDismissButtons()
        .map(getDismissAction)
        .filter((action) => action?.notificationId && action?.actionPath);
}

function ensureStatusPanel() {
    const list = getNotificationList();
    if (!list?.parentElement) return null;

    let panel = document.getElementById(STATUS_ID);
    if (panel) return panel;

    panel = document.createElement('div');
    panel.id = STATUS_ID;
    panel.className = 'rovalra-dismiss-all-status';

    const title = document.createElement('div');
    title.className = 'rovalra-dismiss-all-status-title';
    title.textContent = 'Dismiss All';

    const message = document.createElement('div');
    message.className = 'rovalra-dismiss-all-status-message';

    const meta = document.createElement('div');
    meta.className = 'rovalra-dismiss-all-status-meta';

    panel.append(title, message, meta);
    list.parentElement.insertBefore(panel, list);

    return panel;
}

function renderStatusPanel() {
    const panel = ensureStatusPanel();
    if (!panel) return;

    panel.dataset.state = statusState.type;
    panel.querySelector('.rovalra-dismiss-all-status-message').textContent =
        statusState.message;
    panel.querySelector('.rovalra-dismiss-all-status-meta').textContent =
        getRateLimitDetail();
}

function setStatus(type, message) {
    statusState = { type, message };
    renderStatusPanel();
}

function updateReadyStatus(force = false) {
    if (dismissing || isRateLimitPaused()) return;
    if (!force && statusState.type !== 'ready') return;

    const count = getDismissActions().length;
    setStatus(
        'ready',
        count === 1
            ? 'Ready to dismiss 1 notification.'
            : `Ready to dismiss ${count} notifications.`,
    );
}

function startCooldownTimer() {
    if (cooldownInterval) return;

    cooldownInterval = setInterval(() => {
        if (!isRateLimitPaused()) {
            clearInterval(cooldownInterval);
            cooldownInterval = null;
            rateLimitBlockedUntil = 0;
            rateLimitRequestsLeft = null;
            updateReadyStatus(true);
            updateDismissAllButtons();
            return;
        }

        setStatus(
            'limited',
            `Rate limited by Roblox. Try again in ${getSecondsUntil(
                getRateLimitResetAt(),
            )}s.`,
        );
        updateDismissAllButtons();
    }, 1000);
}

function updateButtonState(button) {
    button.disabled =
        dismissing || isRateLimitPaused() || getDismissActions().length === 0;
    button.setAttribute('aria-disabled', String(button.disabled));
    button.setAttribute('aria-busy', String(dismissing));
}

function updateDismissAllButtons() {
    document
        .querySelectorAll(`#${BUTTON_ID}`)
        .forEach((button) => updateButtonState(button));
}

function scheduleButtonStateUpdate() {
    if (stateUpdateQueued) return;

    stateUpdateQueued = true;
    requestAnimationFrame(() => {
        stateUpdateQueued = false;
        ensureStatusPanel();
        updateReadyStatus();
        updateDismissAllButtons();
    });
}

async function dismissNotification(action) {
    if (rateLimitRequestsLeft !== null) {
        rateLimitRequestsLeft = Math.max(0, rateLimitRequestsLeft - 1);
    }

    const response = await callRobloxApi({
        subdomain: 'notifications',
        endpoint: `/v2/stream-notifications/action/${encodeURIComponent(
            action.notificationId,
        )}/${encodeURIComponent(action.actionPath)}`,
        method: 'POST',
        noCache: true,
    });

    applyRateLimitHeaders(response);

    if (response.status === 429) {
        return { rateLimited: true };
    }

    if (!response.ok) {
        return {
            error: `Roblox returned ${response.status} ${response.statusText}`,
        };
    }

    action.card?.remove();
    return { dismissed: true };
}

async function dismissAll(button) {
    if (dismissing) return;

    if (isRateLimitPaused()) {
        setStatus(
            'limited',
            `Rate limited by Roblox. Try again in ${getSecondsUntil(
                getRateLimitResetAt(),
            )}s.`,
        );
        return;
    }

    const dismissActions = getDismissActions();
    if (dismissActions.length === 0) {
        scheduleButtonStateUpdate();
        return;
    }

    dismissing = true;
    let dismissedCount = 0;
    let shouldShowDone = true;
    updateDismissAllButtons();
    setStatus(
        'working',
        `Dismissing 0/${dismissActions.length} notifications...`,
    );

    try {
        for (const action of dismissActions) {
            if (isRateLimitPaused()) {
                shouldShowDone = false;
                setStatus(
                    'limited',
                    `Rate limited by Roblox after ${dismissedCount}/${dismissActions.length} notifications. Try again in ${getSecondsUntil(
                        getRateLimitResetAt(),
                    )}s.`,
                );
                break;
            }

            if (
                !document.contains(action.button) ||
                !isDismissButton(action.button)
            ) {
                continue;
            }

            let result;
            try {
                result = await dismissNotification(action);
            } catch (error) {
                shouldShowDone = false;
                setStatus(
                    'error',
                    `Stopped after ${dismissedCount}/${dismissActions.length}. ${error.message}.`,
                );
                break;
            }

            if (result.rateLimited) {
                shouldShowDone = false;
                setStatus(
                    'limited',
                    `Rate limited by Roblox after ${dismissedCount}/${dismissActions.length} notifications. Try again in ${getSecondsUntil(
                        getRateLimitResetAt(),
                    )}s.`,
                );
                break;
            }

            if (result.error) {
                shouldShowDone = false;
                setStatus(
                    'error',
                    `Stopped after ${dismissedCount}/${dismissActions.length}. ${result.error}.`,
                );
                break;
            }

            dismissedCount += 1;
            setStatus(
                'working',
                `Dismissing ${dismissedCount}/${dismissActions.length} notifications...`,
            );
            await delay(DISMISS_DELAY_MS);
        }
    } finally {
        dismissing = false;

        if (
            shouldShowDone &&
            !isRateLimitPaused() &&
            statusState.type === 'working'
        ) {
            setStatus(
                'done',
                dismissedCount === 1
                    ? 'Dismissed 1 notification.'
                    : `Dismissed ${dismissedCount} notifications.`,
            );
        }

        scheduleButtonStateUpdate();
        updateButtonState(button);
    }
}

function createDismissAllButton() {
    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.className =
        'text-link font-caption-header rovalra-dismiss-all-notifications';
    button.textContent = 'Dismiss All';
    button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        dismissAll(button).catch((error) =>
            console.error('RoValra: Failed to dismiss notifications', error),
        );
    });

    return button;
}

function attachDismissAllButton(header) {
    const existingButton = header.querySelector(`#${BUTTON_ID}`);
    if (existingButton) {
        updateButtonState(existingButton);
        return;
    }

    const button = createDismissAllButton();
    const settingsLink = header.querySelector(
        'a[href*="/my/account#!/notifications"], a[ng-href*="/my/account#!/notifications"]',
    );

    if (settingsLink) {
        header.insertBefore(button, settingsLink);
    } else {
        header.appendChild(button);
    }

    scheduleButtonStateUpdate();
}

function observeNotificationList(list) {
    if (list.dataset.rovalraDismissAllNotificationsReady) {
        scheduleButtonStateUpdate();
        return;
    }

    list.dataset.rovalraDismissAllNotificationsReady = 'true';
    observeChildren(list, scheduleButtonStateUpdate);
    ensureStatusPanel();
    scheduleButtonStateUpdate();
}

async function initDismissAllNotifications() {
    if (initialized) return;
    if (!(await settings.dismissAllNotificationsEnabled)) return;

    initialized = true;
    observeElement(HEADER_SELECTOR, attachDismissAllButton);
    observeElement(LIST_SELECTOR, observeNotificationList);
}

export function init() {
    initDismissAllNotifications().catch((error) =>
        console.error(
            'RoValra: Dismiss all notifications initialization failed',
            error,
        ),
    );
}
