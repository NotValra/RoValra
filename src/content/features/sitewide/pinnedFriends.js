import { getUserCardContext } from '../../core/profile/userCardElements.js';
import { getUserIdFromUrl } from '../../core/idExtractor.js';
import { observeElement } from '../../core/observer.js';
import { settings } from '../../core/settings/getSettings.js';
import { t } from '../../core/locale/i18n.js';
import { getFriendsList } from '../../core/utils/trackers/friendslist.js';
import { getBatchThumbnails } from '../../core/thumbnail/thumbnails.js';
import { batchFetchPresence, createFriendTile } from '../../core/ui/profile/userCard.js';
import { PINNED_FRIENDS_STORAGE_KEY as STORAGE_KEY, loadPinnedFriends, savePinnedFriends } from '../../core/profile/pinnedFriends.js';

const SETTING_NAME = 'pinnedFriendsEnabled';

const CARD_SELECTOR = '.friends-carousel-tile';
const ADDED_CARD_CLASS = 'rovalra-added-pinned-friend';
const ROW_SELECTOR = '#HomeContainer .friends-carousel-list-container:not([data-rovalra-fc-hidden]), #HomeContainer .rovalra-friends-carousel-scroll';
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
let pinnedFriends = new Set();
let observersRegistered = false;
let storageListenerRegistered = false;
let refreshScheduled = false;
let refreshing = false;
let refreshRequested = false;

function getCarouselCards(row) {
    const nativeUserIds = new Set();
    const addedCards = [];
    row.querySelectorAll(CARD_SELECTOR).forEach((card) => {
        if (card.classList.contains(ADDED_CARD_CLASS)) {
            addedCards.push(card);
            return;
        }
        const { userId } = getUserCardContext(card);
        if (userId) nativeUserIds.add(String(userId));
    });
    return { nativeUserIds, addedCards };
}

async function renderMissingPinnedFriends() {
    if (!enabled || isExcludedCarouselPresent()) return;

    const rows = [...document.querySelectorAll(ROW_SELECTOR)];
    const missingUserIds = new Set();
    for (const row of rows) {
        const { nativeUserIds, addedCards } = getCarouselCards(row);
        const presentUserIds = new Set(nativeUserIds);
        for (const card of addedCards) {
            const userId = String(getUserCardContext(card).userId);
            if (!pinnedFriends.has(userId) || nativeUserIds.has(userId)) card.remove();
            else presentUserIds.add(userId);
        }
        for (const userId of pinnedFriends) {
            if (!presentUserIds.has(userId)) missingUserIds.add(userId);
        }
    }
    if (!missingUserIds.size) return;

    const friends = await getFriendsList();
    const missingFriends = friends.filter((friend) => missingUserIds.has(String(friend.id)));
    if (!missingFriends.length) return;

    const userIds = missingFriends.map((friend) => Number(friend.id));
    const [thumbnails, presenceMap] = await Promise.all([getBatchThumbnails(userIds, 'AvatarHeadshot', '150x150'), batchFetchPresence(userIds)]);
    if (!enabled || isExcludedCarouselPresent()) return;
    const thumbnailMap = new Map(thumbnails.map((thumb) => [String(thumb.targetId), thumb]));

    for (const row of rows) {
        if (!row.isConnected || !row.matches(ROW_SELECTOR)) continue;
        const { nativeUserIds, addedCards } = getCarouselCards(row);
        const presentUserIds = new Set([...nativeUserIds, ...addedCards.map((card) => String(getUserCardContext(card).userId))]);
        for (const friend of missingFriends) {
            const userId = String(friend.id);
            if (!pinnedFriends.has(userId) || presentUserIds.has(userId)) continue;
            const tile = createFriendTile(friend, thumbnailMap.get(userId), {
                displayName: friend.combinedName || friend.displayName || friend.username,
                username: friend.username ? `@${friend.username}` : '',
                isHidden: false,
                isVerified: friend.isVerified || false,
                isSubscribed: friend.hasRobloxSubscription === true,
                presence: presenceMap.get(Number(friend.id)) || null,
            });
            tile.classList.add(ADDED_CARD_CLASS, PINNED_CLASS);
            row.appendChild(tile);
            presentUserIds.add(userId);
        }
        row.parentElement?.rovalraRefreshArrows?.();
    }
}

function schedulePinnedFriendsRefresh() {
    if (!enabled) return;
    refreshRequested = true;
    if (refreshScheduled || refreshing) return;
    refreshScheduled = true;
    setTimeout(async () => {
        refreshScheduled = false;
        refreshing = true;
        try {
            while (refreshRequested && enabled) {
                refreshRequested = false;
                await renderMissingPinnedFriends();
            }
        } catch {
        } finally {
            refreshing = false;
            if (refreshRequested && enabled) schedulePinnedFriendsRefresh();
        }
    }, 0);
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
            return node.querySelectorAll(CARD_SELECTOR).length > 1 ? null : node;
        }

        node = node.parentElement;
    }

    return null;
}

// Moving the tile would fight whatever else sorts the row, so order is used.
function applyPinnedFriend(card) {
    if (!enabled) return;

    const { userId } = getUserCardContext(card);
    const isPinned = Boolean(userId) && pinnedFriends.has(String(userId));
    const target = getOrderTarget(card) || card;

    if (target !== card) card.classList.remove(PINNED_CLASS);
    target.classList.toggle(PINNED_CLASS, isPinned);
}

function refreshExistingCards() {
    document.querySelectorAll(CARD_SELECTOR).forEach(applyPinnedFriend);
}

async function togglePin(userId) {
    if (pinnedFriends.has(userId)) pinnedFriends.delete(userId);
    else pinnedFriends.add(userId);

    await savePinnedFriends(pinnedFriends);
    refreshExistingCards();
    schedulePinnedFriendsRefresh();
}

function getPinLabel(userId) {
    return t(pinnedFriends.has(userId) ? 'pinnedFriends.unpin' : 'pinnedFriends.pin');
}

// Read on the click, as one menu can be reused for whoever was opened last.
function createPinClickHandler(menu) {
    return async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const button = event.currentTarget;
        const userId = getMenuUserId(menu);
        if (!userId || button.dataset.rovalraPinPending) return;

        button.dataset.rovalraPinPending = 'true';
        try {
            await togglePin(userId);
            const label = await getPinLabel(userId);
            if (getMenuUserId(menu) !== userId) return;

            const icon = button.querySelector('.icon-favorite');
            if (icon) button.replaceChildren(icon, ` ${label}`);
            else button.textContent = label;
        } catch {
            pinnedFriends = await loadPinnedFriends();
            refreshExistingCards();
        } finally {
            delete button.dataset.rovalraPinPending;
        }
    };
}

function createDropdownItem(menu, list, label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `friend-tile-dropdown-button ${BUTTON_CLASS}`;

    const icon = document.createElement('span');
    icon.className = 'icon-favorite';
    button.append(icon, ` ${label}`);

    button.addEventListener('click', createPinClickHandler(menu));

    const item = document.createElement('li');
    item.className = ITEM_CLASS;
    item.appendChild(button);
    list.appendChild(item);
}

// Copied off an entry already there so it inherits that menu's own styling.
function createModernMenuItem(menu, profileLink, label) {
    const source = profileLink.previousElementSibling || profileLink;
    const button = source.cloneNode(false);

    ['id', 'href', 'target', 'rel', 'aria-controls', 'aria-expanded'].forEach((attribute) => button.removeAttribute(attribute));

    if (button instanceof HTMLButtonElement) {
        button.type = 'button';
    } else {
        button.setAttribute('role', 'button');
        button.tabIndex = 0;
    }

    button.classList.add(ITEM_CLASS, BUTTON_CLASS);
    button.textContent = label;

    button.addEventListener('pointerdown', (event) => event.stopPropagation());
    button.addEventListener('click', createPinClickHandler(menu));

    profileLink.insertAdjacentElement('afterend', button);
}

// The older menu holds buttons, not links, so the tile is read instead.
function getMenuUserId(menu) {
    const link = menu.querySelector(PROFILE_LINK_SELECTOR);
    const linked = link ? getUserIdFromUrl(link.href) : null;
    if (linked) return linked;

    const card = menu.closest(CARD_SELECTOR) || document.querySelector(`${CARD_SELECTOR}:hover`);
    const userId = card ? getUserCardContext(card).userId : null;

    return userId ? String(userId) : null;
}

async function attachPinAction(candidate) {
    if (!enabled || isExcludedCarouselPresent()) return;

    const menu = candidate.matches(MENU_SELECTOR) ? candidate : candidate.closest(MENU_SELECTOR);
    if (!menu || menu.dataset[PENDING_FLAG]) return;
    if (menu.querySelector(`.${ITEM_CLASS}`)) return;

    const userId = getMenuUserId(menu);
    if (!userId) return;

    menu.dataset[PENDING_FLAG] = 'true';

    try {
        const label = await getPinLabel(userId);
        if (menu.querySelector(`.${ITEM_CLASS}`)) return;

        const profileLink = menu.querySelector(PROFILE_LINK_SELECTOR);
        const list = profileLink ? profileLink.closest('ul') : menu.querySelector('ul');

        if (list) createDropdownItem(menu, list, label);
        else if (profileLink) createModernMenuItem(menu, profileLink, label);
    } finally {
        delete menu.dataset[PENDING_FLAG];
    }
}

function removeFeatureUi() {
    document.querySelectorAll(`.${ADDED_CARD_CLASS}`).forEach((card) => card.remove());
    document.querySelectorAll(`.${ITEM_CLASS}`).forEach((item) => item.remove());
    document.querySelectorAll(`.${PINNED_CLASS}`).forEach((card) => card.classList.remove(PINNED_CLASS));
}

function registerObservers() {
    if (observersRegistered) return;
    observersRegistered = true;

    observeElement(
        CARD_SELECTOR,
        (card) => {
            applyPinnedFriend(card);
            schedulePinnedFriendsRefresh();
        },
        { multiple: true, onRemove: schedulePinnedFriendsRefresh },
    );
    observeElement(
        `${CARD_SELECTOR} a.avatar-card-link`,
        () => {
            refreshExistingCards();
            schedulePinnedFriendsRefresh();
        },
        { multiple: true },
    );
    observeElement(ROW_SELECTOR, schedulePinnedFriendsRefresh, { multiple: true });
    observeElement(MENU_SELECTOR, attachPinAction, { multiple: true });
    observeElement(EXCLUDED_CONTAINER_SELECTOR, removeFeatureUi, { multiple: true });
}

function registerStorageListener() {
    if (storageListenerRegistered) return;
    storageListenerRegistered = true;

    chrome.storage.onChanged.addListener(async (changes, namespace) => {
        if (namespace !== 'local') return;

        if (changes[STORAGE_KEY]) {
            const stored = changes[STORAGE_KEY].newValue;
            pinnedFriends = new Set(Array.isArray(stored) ? stored.map(String) : []);
            if (enabled) {
                refreshExistingCards();
                schedulePinnedFriendsRefresh();
            }
        }

        if (!changes[SETTING_NAME]) return;

        enabled = changes[SETTING_NAME].newValue === true;

        if (!enabled) {
            removeFeatureUi();
            return;
        }

        pinnedFriends = await loadPinnedFriends();
        registerObservers();
        refreshExistingCards();
        schedulePinnedFriendsRefresh();
    });
}

export async function init() {
    registerStorageListener();

    enabled = (await settings[SETTING_NAME]) === true;
    if (!enabled) return;

    pinnedFriends = await loadPinnedFriends();
    registerObservers();
}
