import { observeElement } from '../../core/observer.js';
import { settings } from '../../core/settings/getSettings.js';

const SETTING_NAME = 'HideAddFriendsButton';
const HIDDEN_CLASS = 'rovalra-hide-add-friends-button';
const ADD_FRIENDS_ICON_SELECTOR = '.add-friends-icon-container';
const FRIEND_ITEM_SELECTOR = '.friends-carousel-tile';
const HOME_FRIENDS_CONTAINER_SELECTOR = [
    '#HomeContainer .friend-carousel-container',
    '#HomeContainer .react-friends-carousel-container',
    '#HomeContainer .friends-carousel-container',
].join(', ');
const USER_PROFILE_LINK_SELECTOR =
    'a.avatar-card-link[href*="/users/"], a[href*="/users/"][href*="/profile"]';

let observerRegistered = false;
let storageListenerRegistered = false;
let enabled = false;

function isHomePage() {
    const path = window.location.pathname
        .toLowerCase()
        .replace(/^\/[a-z]{2}(?:-[a-z]{2})?\//, '/');
    return path.startsWith('/home');
}

function isFirstCarouselItem(item) {
    const parent = item?.parentElement;
    if (!parent) return false;

    const items = [...parent.children].filter((element) =>
        element.classList?.contains('friends-carousel-tile'),
    );
    return items[0] === item;
}

function isAddFriendsButtonItem(item) {
    if (!(item instanceof HTMLElement)) return false;
    if (!isHomePage()) return false;
    if (!item.closest(HOME_FRIENDS_CONTAINER_SELECTOR)) return false;
    if (!isFirstCarouselItem(item)) return false;
    if (!item.querySelector(ADD_FRIENDS_ICON_SELECTOR)) return false;
    if (item.querySelector(USER_PROFILE_LINK_SELECTOR)) return false;

    return true;
}

function hideAddFriendsButtonFromIcon(iconContainer) {
    if (!enabled) return;

    const item = iconContainer.closest(FRIEND_ITEM_SELECTOR);
    if (isAddFriendsButtonItem(item)) {
        item.classList.add(HIDDEN_CLASS);
    }
}

function applyExistingAddFriendsButtons() {
    if (!enabled || !isHomePage()) return;

    document
        .querySelectorAll(
            `#HomeContainer ${FRIEND_ITEM_SELECTOR} ${ADD_FRIENDS_ICON_SELECTOR}`,
        )
        .forEach(hideAddFriendsButtonFromIcon);
}

function removeHiddenButtonClasses() {
    document
        .querySelectorAll(`.${HIDDEN_CLASS}`)
        .forEach((item) => item.classList.remove(HIDDEN_CLASS));
}

function registerObserver() {
    if (observerRegistered) return;

    observerRegistered = true;
    observeElement(
        `#HomeContainer ${FRIEND_ITEM_SELECTOR} ${ADD_FRIENDS_ICON_SELECTOR}`,
        hideAddFriendsButtonFromIcon,
        { multiple: true },
    );
}

function registerStorageListener() {
    if (storageListenerRegistered) return;

    storageListenerRegistered = true;
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace !== 'local' || !changes[SETTING_NAME]) return;

        enabled = changes[SETTING_NAME].newValue === true;
        if (enabled) {
            registerObserver();
            applyExistingAddFriendsButtons();
        } else {
            removeHiddenButtonClasses();
        }
    });
}

export async function init() {
    registerStorageListener();

    enabled = (await settings.HideAddFriendsButton) === true;
    if (!enabled) {
        removeHiddenButtonClasses();
        return;
    }

    registerObserver();
    applyExistingAddFriendsButtons();
}
