import { observeElement, observeAttributes } from '../../../core/observer.js';
import { getUserIdFromFriendUrl, getUserIdFromUrl } from '../../../core/idExtractor.js';
import { getAuthenticatedUserId } from '../../../core/user.js';
import { settings } from '../../../core/settings/getSettings.js';
import {
    loadFriendLabelStore,
    getFriendLabel,
    subscribeFriendLabels,
} from '../../home/friendLabelStore.js';
import {
    updateFriendLabelBadge,
    ensureFriendLabelEditButton,
} from '../../home/friendLabelUI.js';

const SETTING_NAME = 'friendLabelsEnabled';
const LINK_SELECTOR = '#friends-web-app .avatar-card-caption a.avatar-name[href]';
const BADGE_CLASS = 'rovalra-friend-label-friends-badge';
const observedLinks = new WeakMap();

let started = false;
let enabled = false;
let isOwnFriendsPage = false;

function isFriendsTab() {
    const hash = window.location.hash.toLowerCase();
    return !hash || hash === '#!/friends' || hash === '#friends';
}

function getCard(link) {
    return link.closest('li.list-item.avatar-card, .avatar-card');
}

function clearCard(card) {
    if (!card) return;
    card.querySelectorAll(`.${BADGE_CLASS}`).forEach((badge) => badge.remove());
    card.querySelectorAll(
        '.rovalra-friend-label-edit[data-rovalra-label-kind="friends"]',
    ).forEach((button) => button.remove());
}

function renderLink(link) {
    const card = getCard(link);
    if (!card) return;
    if (!isOwnFriendsPage || !enabled || !isFriendsTab()) {
        clearCard(card);
        return;
    }

    const userId = getUserIdFromUrl(link.href);
    if (!userId) {
        clearCard(card);
        return;
    }

    const name = link.textContent?.trim() || '';
    ensureFriendLabelEditButton(card, { userId, displayName: name }, 'friends');

    const label = getFriendLabel(userId);
    let badge = card.querySelector(`.${BADGE_CLASS}`);
    if (!label) {
        badge?.remove();
        return;
    }

    if (!badge) {
        badge = document.createElement('span');
        badge.className = `rovalra-friend-label ${BADGE_CLASS}`;
        link.insertAdjacentElement('afterend', badge);
    }
    updateFriendLabelBadge(badge, label);
}

function refresh() {
    document.querySelectorAll(LINK_SELECTOR).forEach(renderLink);
}

function observeLink(link) {
    if (observedLinks.has(link)) return;
    const observer = observeAttributes(link, () => renderLink(link), ['href']);
    observedLinks.set(link, observer);
    renderLink(link);
}

export async function init() {
    if (started) return;
    started = true;

    const [pageId, authId] = await Promise.all([
        getUserIdFromFriendUrl(),
        getAuthenticatedUserId(true),
    ]);
    isOwnFriendsPage = Boolean(pageId && authId && String(pageId) === String(authId));
    if (!isOwnFriendsPage) return;

    await loadFriendLabelStore();
    enabled = (await settings[SETTING_NAME]) === true;
    subscribeFriendLabels(refresh);

    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace !== 'local' || !changes[SETTING_NAME]) return;
        enabled = changes[SETTING_NAME].newValue === true;
        refresh();
    });
    window.addEventListener('hashchange', refresh);

    observeElement(LINK_SELECTOR, observeLink, {
        multiple: true,
        onRemove: (link) => {
            observedLinks.get(link)?.disconnect();
            observedLinks.delete(link);
        },
    });
    refresh();
}
