import { getUserIdFromUrl } from '../../../core/idExtractor.js';
import { callRobloxApiJson } from '../../../core/api.js';
import { observeElement } from '../../../core/observer.js';
import { getAuthenticatedUserId } from '../../../core/user.js';
import { settings } from '../../../core/settings/getSettings.js';
import { ts } from '../../../core/locale/i18n.js';

const USERNAME_SELECTOR = '.user-profile-header-info .stylistic-alts-username';

const followsYouCache = new Map();
let activeProfileUserId = null;
let activeFollowsYou = false;
let observerStarted = false;

async function getFollowsYou(userId) {
    if (followsYouCache.has(userId)) {
        return followsYouCache.get(userId);
    }

    const followsYouPromise = callRobloxApiJson({
        subdomain: 'friends',
        endpoint: '/v1/user/following-exists',
        method: 'POST',
        body: { targetUserIds: [Number(userId)] },
    })
        .then((response) => {
            const following = response?.followings?.find(
                (entry) => String(entry.userId) === String(userId),
            );
            return following?.isFollowed === true;
        })
        .catch((err) => {
            console.warn('RoValra: Failed to fetch follow status.', err);
            followsYouCache.delete(userId);
            return false;
        });

    followsYouCache.set(userId, followsYouPromise);
    return followsYouPromise;
}

function renderFollowsYou(usernameElement) {
    const targetContainer = usernameElement?.parentElement;
    if (!targetContainer) return;

    let followsYouElement = targetContainer.querySelector(
        ':scope > .rovalra-follows-you',
    );

    if (!activeFollowsYou) {
        followsYouElement?.remove();
        return;
    }

    targetContainer.classList.add('rovalra-profile-username-row');

    if (!followsYouElement) {
        followsYouElement = document.createElement('span');
        followsYouElement.className = 'rovalra-follows-you';
        targetContainer.appendChild(followsYouElement);
    }

    followsYouElement.textContent = ts('followsYou.label');
}

function renderAll() {
    document.querySelectorAll(USERNAME_SELECTOR).forEach(renderFollowsYou);
}

async function initFollowsYou() {
    if ((await settings.followsYouEnabled) === false) return;

    if (!observerStarted) {
        observerStarted = true;
        observeElement(USERNAME_SELECTOR, renderFollowsYou);
    }

    const userId = getUserIdFromUrl();
    activeProfileUserId = userId ? String(userId) : null;
    activeFollowsYou = false;
    renderAll();
    if (!userId) return;

    const authenticatedUserId = await getAuthenticatedUserId();
    if (!authenticatedUserId) return;
    if (String(authenticatedUserId) === String(userId)) return;

    const followsYou = await getFollowsYou(String(userId));
    if (activeProfileUserId !== String(userId)) return;

    activeFollowsYou = followsYou;
    renderAll();
}

export function init() {
    initFollowsYou();
}
