import { getUserIdFromUrl } from '../../../core/idExtractor.js';
import { observeElement } from '../../../core/observer.js';
import { settings } from '../../../core/settings/getSettings.js';
import { fetchPresenceBatched } from '../../../core/ui/profile/userCard.js';

const CARD_SELECTOR = '.currently-playing-card';
const LINK_CLASS = 'rovalra-currently-playing-link';

let observerRegistered = false;

function getExperienceUrl(placeId) {
    return `https://www.roblox.com/games/${placeId}/-`;
}

function makeCardLink(card, presence) {
    const placeId = presence?.rootPlaceId || presence?.placeId;
    if (!placeId) return;

    const href = getExperienceUrl(placeId);

    if (card.tagName === 'A') {
        card.href = href;
        card.dataset.rovalraPresencePlaceId = String(placeId);
        return;
    }

    const link = document.createElement('a');
    link.className = card.className;
    link.classList.add(LINK_CLASS);
    link.href = href;
    link.dataset.rovalraPresencePlaceId = String(placeId);

    while (card.firstChild) {
        link.appendChild(card.firstChild);
    }

    card.replaceWith(link);
}

async function linkCurrentlyPlayingCard(card) {
    if (
        card.classList.contains(LINK_CLASS) ||
        card.dataset.rovalraCurrentlyPlayingLinkLoading === 'true'
    ) {
        return;
    }

    card.dataset.rovalraCurrentlyPlayingLinkLoading = 'true';

    const userId = Number(getUserIdFromUrl());
    if (!userId) {
        delete card.dataset.rovalraCurrentlyPlayingLinkLoading;
        return;
    }

    const presence = await fetchPresenceBatched(userId);
    if (presence?.userPresenceType !== 2) {
        delete card.dataset.rovalraCurrentlyPlayingLinkLoading;
        return;
    }

    makeCardLink(card, presence);
}

export async function init() {
    if (!(await settings.currentlyPlayingLinkEnabled) || observerRegistered) {
        return;
    }

    observerRegistered = true;
    observeElement(CARD_SELECTOR, linkCurrentlyPlayingCard, {
        multiple: true,
    });
}
