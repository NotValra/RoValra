import { observeElement } from '../../core/observer.js';
import { settings } from '../../core/settings/getSettings.js';
import { getCachedFriendsList } from '../../core/utils/trackers/friendslist.js';
import {
    getBatchThumbnails,
    createThumbnailElement,
} from '../../core/thumbnail/thumbnails.js';

const SETTING_NAME = 'friendsSecondRowEnabled';
const ROW_CLASS = 'rovalra-friends-second-row';
const EXTRA_TILE_CLASS = 'rovalra-friends-extra-tile';
const TILE_CLASS = 'friends-carousel-tile';
const TILE_SELECTOR = `.${TILE_CLASS}`;
const LIST_CONTAINER_SELECTOR =
    '#HomeContainer .friends-carousel-list-container';
const CAROUSEL_CONTAINER_SELECTOR = '.friends-carousel-container';
const PROFILE_LINK_SELECTOR = 'a[href*="/users/"]';

let observerRegistered = false;
let storageListenerRegistered = false;
let enabled = false;

function isHomePage() {
    const path = window.location.pathname
        .toLowerCase()
        .replace(/^\/[a-z]{2}(?:-[a-z]{2})?\//, '/');
    return path.startsWith('/home');
}

function getProfileUserId(href) {
    const match = href?.match(/\/users\/(\d+)\//);
    return match ? match[1] : null;
}

function getRenderedFriendIds(listContainer) {
    const ids = new Set();
    listContainer
        .querySelectorAll(
            `${TILE_SELECTOR}:not(.${EXTRA_TILE_CLASS}) ${PROFILE_LINK_SELECTOR}`,
        )
        .forEach((link) => {
            const id = getProfileUserId(link.getAttribute('href') || '');
            if (id) ids.add(id);
        });
    return ids;
}

function createExtraFriendTile(friend, thumbnailData) {
    const profileUrl = `/users/${friend.id}/profile`;

    const tile = document.createElement('div');
    tile.className = `${TILE_CLASS} ${EXTRA_TILE_CLASS}`;

    const content = document.createElement('div');
    content.className = 'friend-tile-content';

    const avatar = document.createElement('div');
    avatar.className = 'avatar avatar-card-fullbody';

    const avatarLink = document.createElement('a');
    avatarLink.className = 'avatar-card-link';
    avatarLink.href = profileUrl;

    const thumbContainer = document.createElement('span');
    thumbContainer.className = 'thumbnail-2d-container avatar-card-image';
    thumbContainer.appendChild(
        createThumbnailElement(
            thumbnailData,
            friend.displayName || friend.username,
            'rovalra-friends-extra-tile-thumb',
            { width: '100%', height: '100%', borderRadius: '50%' },
        ),
    );

    avatarLink.appendChild(thumbContainer);
    avatar.appendChild(avatarLink);

    const labels = document.createElement('a');
    labels.className = 'friends-carousel-tile-labels';
    labels.href = profileUrl;

    const labelWrap = document.createElement('div');
    labelWrap.className = 'friends-carousel-tile-label';

    const nameWrap = document.createElement('div');
    nameWrap.className = 'friends-carousel-tile-name';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'friends-carousel-display-name';
    nameSpan.textContent = friend.displayName || friend.username;

    nameWrap.appendChild(nameSpan);
    labelWrap.appendChild(nameWrap);
    labels.appendChild(labelWrap);

    content.append(avatar, labels);
    tile.appendChild(content);

    return tile;
}

async function fillMissingFriends(listContainer) {
    if (listContainer.dataset.rovalraSecondRowFilled === 'true') return;
    listContainer.dataset.rovalraSecondRowFilled = 'true';

    const renderedIds = getRenderedFriendIds(listContainer);
    const friends = await getCachedFriendsList();
    const missingFriends = friends.filter(
        (friend) => !renderedIds.has(String(friend.id)),
    );

    if (!missingFriends.length) return;

    const thumbnails = await getBatchThumbnails(
        missingFriends.map((friend) => friend.id),
        'AvatarHeadshot',
        '150x150',
    );
    const thumbnailById = new Map(
        thumbnails.map((thumb) => [thumb.targetId, thumb]),
    );

    const fragment = document.createDocumentFragment();
    for (const friend of missingFriends) {
        fragment.appendChild(
            createExtraFriendTile(friend, thumbnailById.get(Number(friend.id))),
        );
    }
    listContainer.appendChild(fragment);
}

async function handleListContainer(listContainer) {
    if (!enabled || !isHomePage()) return;

    const carouselContainer = listContainer.closest(
        CAROUSEL_CONTAINER_SELECTOR,
    );
    carouselContainer?.classList.add(ROW_CLASS);

    fillMissingFriends(listContainer).catch((error) =>
        console.error('RoValra: Failed to fill friends second row.', error),
    );
}

function removeSecondRow() {
    document
        .querySelectorAll(`.${ROW_CLASS}`)
        .forEach((element) => element.classList.remove(ROW_CLASS));
    document
        .querySelectorAll(`.${EXTRA_TILE_CLASS}`)
        .forEach((element) => element.remove());
    document
        .querySelectorAll(LIST_CONTAINER_SELECTOR)
        .forEach((element) => delete element.dataset.rovalraSecondRowFilled);
}

function registerObserver() {
    if (observerRegistered) return;

    observerRegistered = true;
    observeElement(LIST_CONTAINER_SELECTOR, handleListContainer, {
        multiple: true,
    });
}

function registerStorageListener() {
    if (storageListenerRegistered) return;

    storageListenerRegistered = true;
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace !== 'local' || !changes[SETTING_NAME]) return;

        enabled = changes[SETTING_NAME].newValue === true;
        if (enabled) {
            registerObserver();
            document
                .querySelectorAll(LIST_CONTAINER_SELECTOR)
                .forEach(handleListContainer);
        } else {
            removeSecondRow();
        }
    });
}

export async function init() {
    registerStorageListener();

    enabled = (await settings.friendsSecondRowEnabled) === true;
    if (!enabled) {
        removeSecondRow();
        return;
    }

    registerObserver();
}