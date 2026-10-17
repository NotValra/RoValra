import { isRobloxAdmin } from '../../core/apis/robloxAdmin.js';
import { getAssets } from '../../core/assets.js';
import { t } from '../../core/locale/i18n.js';
import {
    observeAttributes,
    observeElement,
    observeIntersection,
} from '../../core/observer.js';
import {
    getUserCardContext,
    observeUserCardElements,
    onUserCardElement,
    USER_CARD_SELECTORS,
} from '../../core/profile/userCardElements.js';
import { settings } from '../../core/settings/getSettings.js';

const BADGE_CLASS = 'rovalra-admin-badge';
const NAME_ROW_CLASS = 'rovalra-admin-name-row';
const CARD_SELECTOR = USER_CARD_SELECTORS.join(', ');
const NAME_SELECTOR =
    '.friends-carousel-display-name, .avatar-name, .user-card-name > span, .rovalra-user-card-display-name, .text-name, .name';
const NATIVE_BADGE_SELECTOR =
    '.icon-filled-tilt, .icon-admin, [data-testid="roblox-admin-badge"]';
const states = new Map();
const badgeOwners = new WeakMap();
const nameObservers = new WeakMap();
const cardObservers = new WeakMap();
let initialized = false;
let enabled = false;
let observersStarted = false;
let unsubscribe = null;
let settingsVersion = 0;

function removeBadge(name) {
    const state = states.get(name);
    if (!state) return;
    states.delete(name);
    state.badge?.remove();
    if (state.wrapper?.isConnected) {
        state.wrapper.replaceWith(...state.wrapper.childNodes);
    }
}

function isVisible(element) {
    if (!element.isConnected || !element.getClientRects().length) return false;
    const rect = element.getBoundingClientRect();
    return (
        rect.bottom > 0 &&
        rect.right > 0 &&
        rect.top < window.innerHeight &&
        rect.left < window.innerWidth
    );
}

async function updateCard(element, context = getUserCardContext(element)) {
    const { userId, displayName } = context;
    const id = String(userId);
    const existing = states.get(displayName);
    if (existing && existing.userId !== id) removeBadge(displayName);
    if (!enabled || !userId || !displayName || !isVisible(element)) return;

    if (existing?.userId === id) {
        if (existing.pending || existing.badge?.isConnected) return;
    }
    removeBadge(displayName);

    if (displayName.parentElement?.querySelector(NATIVE_BADGE_SELECTOR)) return;

    const state = { userId: id, pending: true };
    states.set(displayName, state);
    const [isAdmin, label] = await Promise.all([
        isRobloxAdmin(id),
        t('robloxAdminBadges.badge'),
    ]);

    if (states.get(displayName) !== state) return;
    state.pending = false;
    const current = getUserCardContext(element);
    if (
        !enabled ||
        !element.isConnected ||
        !displayName.isConnected ||
        String(current.userId) !== id ||
        current.displayName !== displayName ||
        displayName.parentElement?.querySelector(NATIVE_BADGE_SELECTOR) ||
        isAdmin !== true
    ) {
        removeBadge(displayName);
        return;
    }

    const badge = document.createElement('span');
    badge.className = BADGE_CLASS;
    badge.style.maskImage = `url("${getAssets().robloxAdminBadge}")`;
    badge.setAttribute('role', 'img');
    badge.setAttribute('aria-label', label);
    badge.dataset.userId = id;
    state.badge = badge;
    badgeOwners.set(badge, { element, displayName });

    if (displayName.matches('.user-card-name > span')) {
        displayName.appendChild(badge);
    } else {
        const wrapper = document.createElement('span');
        wrapper.className = NAME_ROW_CLASS;
        state.wrapper = wrapper;
        displayName.replaceWith(wrapper);
        wrapper.append(displayName, badge);
    }
}

function startObservers() {
    if (observersStarted) return;
    observersStarted = true;
    observeElement(
        CARD_SELECTOR,
        (card) => {
            cardObservers.set(
                card,
                observeAttributes(
                    card,
                    () => updateCard(card),
                    ['href', 'data-rovalra-card-user-id'],
                    { subtree: true },
                ),
            );
        },
        {
            multiple: true,
            onRemove: (card) => {
                cardObservers.get(card)?.disconnect();
                cardObservers.delete(card);
            },
        },
    );
    observeElement(
        `:is(${CARD_SELECTOR}) :is(${NAME_SELECTOR})`,
        (name) => {
            const card = name.closest(CARD_SELECTOR);
            if (!card) return;
            nameObservers.set(
                name,
                observeIntersection(name, (entry) => {
                    if (entry.isIntersecting) updateCard(card);
                }),
            );
            updateCard(card);
        },
        {
            multiple: true,
            onRemove: (name) => {
                nameObservers.get(name)?.unobserve();
                nameObservers.delete(name);
                removeBadge(name);
            },
        },
    );
    observeElement(`.${BADGE_CLASS}`, () => {}, {
        multiple: true,
        onRemove: (badge) => {
            const owner = badgeOwners.get(badge);
            if (owner && states.get(owner.displayName)?.badge === badge) {
                updateCard(owner.element);
            }
        },
    });
}

async function updateSetting() {
    const version = ++settingsVersion;
    const nextEnabled = (await settings.robloxAdminBadgesEnabled) === true;
    if (version !== settingsVersion) return;
    enabled = nextEnabled;

    if (!enabled) {
        unsubscribe?.();
        unsubscribe = null;
        [...states.keys()].forEach(removeBadge);
        return;
    }

    if (unsubscribe) return;
    observeUserCardElements();
    startObservers();
    unsubscribe = onUserCardElement(updateCard);
}

export function init() {
    if (initialized) return;
    initialized = true;
    updateSetting();
    document.addEventListener('rovalra:settingSaved', (event) => {
        if (event.detail?.name === 'robloxAdminBadgesEnabled') updateSetting();
    });
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local' && changes.robloxAdminBadgesEnabled) {
            updateSetting();
        }
    });
}
