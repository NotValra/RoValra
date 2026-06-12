import { getUserIdFromUrl } from '../../../core/idExtractor.js';
import { t } from '../../../core/locale/i18n.js';
import { observeElement } from '../../../core/observer.js';
import { settings } from '../../../core/settings/getSettings.js';
import { addTooltip } from '../../../core/ui/tooltip.js';
import { getFriendsList } from '../../../core/utils/trackers/friendslist.js';

const PRESENTATION_SELECTOR =
    '.profile-header-overlay div[role="presentation"]';
/* eslint-disable rovalra/check-css-vars -- These are Roblox class names, not RoValra CSS references. */
const REQUIRED_CLASSES = [
    'absolute',
    'inset-[0]',
    'transition-colors',
    'group-hover/interactable:bg-[var(--color-state-hover)]',
    'group-active/interactable:bg-[var(--color-state-press)]',
    'group-disabled/interactable:bg-none',
];
/* eslint-enable rovalra/check-css-vars */

let observerRegistered = false;
let friendDataPromise = null;

function isChatOverlay(overlay) {
    if (
        !REQUIRED_CLASSES.every((className) =>
            overlay.classList.contains(className),
        )
    ) {
        return false;
    }

    const control = overlay.parentElement;
    if (!control?.matches('button, a')) return false;

    const controlIdentity = [
        control.id,
        control.getAttribute('name'),
        control.getAttribute('href'),
        control.getAttribute('data-testid'),
        control.getAttribute('aria-label'),
        control.getAttribute('title'),
        control.textContent,
    ]
        .filter(Boolean)
        .join(' ')
        .trim();

    return /\bchat\b/i.test(controlIdentity);
}

async function getProfileFriendData() {
    if (friendDataPromise) return friendDataPromise;

    friendDataPromise = (async () => {
        const userId = Number(getUserIdFromUrl());
        if (!userId) return null;

        const friendsList = await getFriendsList();
        return friendsList.find((friend) => friend.id === userId) || null;
    })();

    return friendDataPromise;
}

async function attachChatTooltip(overlay) {
    if (
        overlay.dataset.rovalraChatEligibilityTooltip === 'true' ||
        !isChatOverlay(overlay)
    ) {
        return;
    }

    const friend = await getProfileFriendData();
    if (!friend || !overlay.isConnected) return;

    let tooltipText;
    if (friend.hasAgeChecked === false) {
        tooltipText = await t('chatEligibility.ageCheckRequired');
    } else if (friend.canChat === true) {
        tooltipText = await t('chatEligibility.canChat');
    } else if (friend.canChat === false) {
        tooltipText = await t('chatEligibility.cannotChat');
    } else {
        return;
    }

    addTooltip(overlay, tooltipText, { position: 'top' });
    overlay.dataset.rovalraChatEligibilityTooltip = 'true';
}

export async function init() {
    if (
        observerRegistered ||
        !getUserIdFromUrl() ||
        !(await settings.chatEligibilityTooltipEnabled)
    ) {
        return;
    }

    observerRegistered = true;
    observeElement(PRESENTATION_SELECTOR, attachChatTooltip, {
        multiple: true,
    });
}
