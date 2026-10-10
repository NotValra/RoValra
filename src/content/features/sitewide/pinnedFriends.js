import { getUserCardContext } from '../../core/profile/userCardElements.js';
import { getUserIdFromUrl } from '../../core/idExtractor.js';
import { observeElement } from '../../core/observer.js';
import { settings } from '../../core/settings/getSettings.js';
import { t } from '../../core/locale/i18n.js';

const SETTING_NAME = 'pinnedFriendsEnabled';
const STORAGE_KEY = 'rovalra_pinned_friends';

const CARD_SELECTOR = '.friends-carousel-tile';
// RoSeal replaces the carousel with its own, leaving nothing of ours to order.
const EXCLUDED_CONTAINER_SELECTOR = '.roseal-friends-carousel-container';

// The newer of Roblox's two friend menus is drawn in a portal.
const MENU_SELECTOR = '.friend-tile-dropdown, .friend-tile-dropdown--iarc';
const PROFILE_LINK_SELECTOR = 'a[href*="/users/"][href*="/profile"]';

const ITEM_CLASS = 'rovalra-pin-friend-item';
const BUTTON_CLASS = 'rovalra-pin-friend-button';
const PINNED_CLASS = 'rovalra-pinned-friend';
const PENDING_FLAG = 'rovalraPinnedFriendPending';

let enabled = false;
let pinned = new Set();
let observersRegistered = false;
let storageListenerRegistered = false;

function loadPinned() {
    return new Promise((resolve) => {
        chrome.storage.local.get({ [STORAGE_KEY]: [] }, (data) => {
            const stored = data?.[STORAGE_KEY];
            resolve(new Set(Array.isArray(stored) ? stored.map(String) : []));
        });
    });
}

function savePinned() {
    return new Promise((resolve) => {
        chrome.storage.local.set({ [STORAGE_KEY]: [...pinned] }, resolve);
    });
}

function isExcludedCarouselPresent() {
    return Boolean(document.querySelector(EXCLUDED_CONTAINER_SELECTOR));
}

// Order only moves a flex item and Roblox wraps the tile, so the nearest one up
// is marked. A wrapper holding several tiles would drag them all, so it is not.
function getOrderTarget(card) {
    let node = card;

    for (let depth = 0; node?.parentElement && depth < 4; depth += 1) {
        const { display } = getComputedStyle(node.parentElement);

        if (display.includes('flex') || display.includes('grid')) {
            return node.querySelectorAll(CARD_SELECTOR).length > 1
                ? null
                : node;
        }

        node = node.parentElement;
    }

    return null;
}

// Moving the tile would fight whatever else sorts the row, so order is used.
function applyCard(card) {
    if (!enabled) return;

    const { userId } = getUserCardContext(card);
    const isPinned = Boolean(userId) && pinned.has(String(userId));
    const target = getOrderTarget(card) || card;

    if (target !== card) card.classList.remove(PINNED_CLASS);
    target.classList.toggle(PINNED_CLASS, isPinned);
}

function applyCards() {
    document.querySelectorAll(CARD_SELECTOR).forEach(applyCard);
}

async function togglePin(userId) {
    if (pinned.has(userId)) pinned.delete(userId);
    else pinned.add(userId);

    await savePinned();
    applyCards();
}

function menuLabel(userId) {
    return t(pinned.has(userId) ? 'pinnedFriends.unpin' : 'pinnedFriends.pin');
}

// Read on the click, as one menu can be reused for whoever was opened last.
function onItemClick(menu) {
    return (event) => {
        event.preventDefault();
        event.stopPropagation();

        const userId = getMenuUserId(menu);
        if (userId) togglePin(userId);
    };
}

function buildListItem(menu, list, label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `friend-tile-dropdown-button ${BUTTON_CLASS}`;

    const icon = document.createElement('span');
    icon.className = 'icon-favorite';
    button.append(icon, ` ${label}`);

    button.addEventListener('click', onItemClick(menu));

    const item = document.createElement('li');
    item.className = ITEM_CLASS;
    item.appendChild(button);
    list.appendChild(item);
}

// Copied off an entry already there so it inherits that menu's own styling.
function buildClonedItem(menu, profileLink, label) {
    const source = profileLink.previousElementSibling || profileLink;
    const button = source.cloneNode(false);

    ['id', 'href', 'target', 'rel', 'aria-controls', 'aria-expanded'].forEach(
        (attribute) => button.removeAttribute(attribute),
    );

    if (button instanceof HTMLButtonElement) {
        button.type = 'button';
    } else {
        button.setAttribute('role', 'button');
        button.tabIndex = 0;
    }

    button.classList.add(ITEM_CLASS, BUTTON_CLASS);
    button.textContent = label;

    button.addEventListener('pointerdown', (event) => event.stopPropagation());
    button.addEventListener('click', onItemClick(menu));

    profileLink.insertAdjacentElement('afterend', button);
}

// The older menu holds buttons, not links, so the tile is read instead.
function getMenuUserId(menu) {
    const link = menu.querySelector(PROFILE_LINK_SELECTOR);
    const linked = link ? getUserIdFromUrl(link.href) : null;
    if (linked) return linked;

    const card =
        menu.closest(CARD_SELECTOR) ||
        document.querySelector(`${CARD_SELECTOR}:hover`);
    const userId = card ? getUserCardContext(card).userId : null;

    return userId ? String(userId) : null;
}

async function attachMenu(candidate) {
    if (!enabled || isExcludedCarouselPresent()) return;

    const menu = candidate.matches(MENU_SELECTOR)
        ? candidate
        : candidate.closest(MENU_SELECTOR);
    if (!menu || menu.dataset[PENDING_FLAG]) return;
    if (menu.querySelector(`.${ITEM_CLASS}`)) return;

    const userId = getMenuUserId(menu);
    if (!userId) return;

    menu.dataset[PENDING_FLAG] = 'true';

    try {
        const label = await menuLabel(userId);
        if (menu.querySelector(`.${ITEM_CLASS}`)) return;

        const profileLink = menu.querySelector(PROFILE_LINK_SELECTOR);
        const list = profileLink
            ? profileLink.closest('ul')
            : menu.querySelector('ul');

        if (list) buildListItem(menu, list, label);
        else if (profileLink) buildClonedItem(menu, profileLink, label);
    } finally {
        delete menu.dataset[PENDING_FLAG];
    }
}

function removeUi() {
    document
        .querySelectorAll(`.${ITEM_CLASS}`)
        .forEach((item) => item.remove());
    document
        .querySelectorAll(`.${PINNED_CLASS}`)
        .forEach((card) => card.classList.remove(PINNED_CLASS));
}

function registerObservers() {
    if (observersRegistered) return;
    observersRegistered = true;

    observeElement(CARD_SELECTOR, applyCard, { multiple: true });
    observeElement(MENU_SELECTOR, attachMenu, { multiple: true });
    observeElement(EXCLUDED_CONTAINER_SELECTOR, removeUi, { multiple: true });
}

function registerStorageListener() {
    if (storageListenerRegistered) return;
    storageListenerRegistered = true;

    chrome.storage.onChanged.addListener(async (changes, namespace) => {
        if (namespace !== 'local') return;

        if (changes[STORAGE_KEY]) {
            const stored = changes[STORAGE_KEY].newValue;
            pinned = new Set(Array.isArray(stored) ? stored.map(String) : []);
            if (enabled) applyCards();
        }

        if (!changes[SETTING_NAME]) return;

        enabled = changes[SETTING_NAME].newValue === true;

        if (!enabled) {
            removeUi();
            return;
        }

        pinned = await loadPinned();
        registerObservers();
        applyCards();
    });
}

export async function init() {
    registerStorageListener();

    enabled = (await settings[SETTING_NAME]) === true;
    if (!enabled) return;

    pinned = await loadPinned();
    registerObservers();
}
