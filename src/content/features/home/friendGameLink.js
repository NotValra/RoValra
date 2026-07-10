import { getUserIdFromUrl } from '../../core/idExtractor.js';
import { observeElement } from '../../core/observer.js';
import { settings } from '../../core/settings/getSettings.js';
import { fetchPresenceBatched } from '../../core/ui/profile/userCard.js';

const PROFILE_LINK_SELECTOR =
    '.friend-tile-dropdown a[href*="/users/"][href*="/profile"]';
const LINK_CLASS = 'rovalra-home-friend-game-link';

let observerRegistered = false;
const pendingProfileLinks = new WeakSet();

function getExperienceUrl(placeId) {
    return `https://www.roblox.com/games/${placeId}/-`;
}

function wrapWithGameLink(element, href, className) {
    if (!element || element.closest(`a.${LINK_CLASS}`)) return;

    const link = document.createElement('a');
    link.className = `${LINK_CLASS} ${className}`;
    link.href = href;
    link.title = element.textContent?.trim() || '';

    element.replaceWith(link);
    link.appendChild(element);
}

function linkGameTargets(card, placeId) {
    const href = getExperienceUrl(placeId);
    const gameName = card.querySelector('.friend-tile-game-name');
    const thumbnail = card.querySelector('.thumbnail-2d-container');
    const thumbnailTarget = thumbnail?.parentElement || thumbnail;

    wrapWithGameLink(
        thumbnailTarget,
        href,
        'rovalra-home-friend-game-thumbnail-link',
    );
    wrapWithGameLink(gameName, href, 'rovalra-home-friend-game-name-link');
}

async function linkFriendGame(profileLink) {
    if (pendingProfileLinks.has(profileLink)) return;

    const card = profileLink.closest('.in-game-friend-card--iarc');
    const userId = Number(getUserIdFromUrl(profileLink.href));
    if (!card || !userId || card.querySelector(`a.${LINK_CLASS}`)) return;

    pendingProfileLinks.add(profileLink);

    try {
        const presence = await fetchPresenceBatched(userId);
        if (presence?.userPresenceType !== 2) return;

        const placeId = presence.rootPlaceId || presence.placeId;
        if (placeId) linkGameTargets(card, placeId);
    } finally {
        pendingProfileLinks.delete(profileLink);
    }
}

export async function init() {
    if (!(await settings.homeFriendGameLinkEnabled) || observerRegistered) {
        return;
    }

    observerRegistered = true;
    observeElement(PROFILE_LINK_SELECTOR, linkFriendGame, { multiple: true });
}
