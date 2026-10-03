import { callRobloxApiJson } from '../../core/api.js';
import { getPlaceIdFromUrl } from '../../core/idExtractor.js';
import { ts } from '../../core/locale/i18n.js';
import { observeElement } from '../../core/observer.js';
import { createOverlay } from '../../core/ui/overlay.js';
import { createPill } from '../../core/ui/general/pill.js';
import { getAssets } from '../../core/assets.js';
import {
    createThumbnailElement,
    fetchThumbnails,
} from '../../core/thumbnail/thumbnails.js';
import { getCachedFriendsList } from '../../core/utils/trackers/friendslist.js';

const CONTAINER_SELECTOR = '.item-details-thumbnail-container';
const assets = getAssets();
const pillCache = new Map();
const MAX_PREVIEW_AVATARS = 3;
let initialized = false;

function getCatalogItemType() {
    return /\/bundles\//i.test(window.location.pathname) ? 'Bundle' : 'Asset';
}

async function fetchOwners(itemId, itemType) {
    const connections = [];
    let cursor = '';
    let totalCount = 0;

    do {
        const data = await callRobloxApiJson({
            subdomain: 'apis',
            endpoint: '/social-proof-api/v1/social-proof/entity/connections',
            method: 'POST',
            body: {
                entityType: itemType,
                entityId: itemId,
                connectionType: 'Friend',
                ...(cursor ? { cursor } : {}),
            },
        });

        connections.push(...(data.connections || []));
        totalCount = Number(data.totalCount) || totalCount;
        cursor = data.cursor || '';
    } while (cursor && connections.length < 1000);

    return {
        totalCount: totalCount || connections.length,
        connections,
    };
}

function createPillContent(owners, thumbnailMap, totalCount) {
    const content = document.createElement('span');
    content.className = 'rovalra-friend-ownership-content';

    const avatars = document.createElement('span');
    avatars.className = 'rovalra-friend-ownership-avatars';
    owners.slice(0, MAX_PREVIEW_AVATARS).forEach((owner) => {
        const thumb = thumbnailMap.get(Number(owner.id));
        if (thumb?.state !== 'Completed' || !thumb.imageUrl) return;
        const img = document.createElement('img');
        img.src = thumb.imageUrl;
        img.alt = '';
        avatars.appendChild(img);
    });

    const text = document.createElement('span');
    text.textContent = ts('friendOwnership.pillLabel', {
        count: totalCount.toLocaleString(),
    });

    content.append(avatars, text);
    return content;
}

async function showOwnersOverlay(owners, friendMap, thumbnailMap, totalCount) {
    const body = document.createElement('div');
    body.className = 'rovalra-friend-ownership-list';

    owners.forEach((owner) => {
        const friend = friendMap.get(Number(owner.id));
        const displayName =
            friend?.displayName ||
            friend?.username ||
            ts('friendOwnership.unknownUser', { id: owner.id });
        const username = friend?.username ? `@${friend.username}` : '';
        const row = document.createElement('div');
        row.className = 'rovalra-friend-ownership-row';

        const thumbData = thumbnailMap.get(Number(owner.id));
        const thumb = createThumbnailElement(
            thumbData,
            displayName,
            'avatar-card-image',
        );
        thumb.className = 'rovalra-friend-ownership-thumbnail';

        const names = document.createElement('div');
        names.className = 'rovalra-friend-ownership-names';
        const name = document.createElement('span');
        name.textContent = displayName;
        if (friend?.isVerified || friend?.hasVerifiedBadge) {
            const badge = document.createElement('img');
            badge.src = assets.verifiedBadge;
            badge.alt = ts('quickSearch.verifiedBadge');
            badge.title = ts('quickSearch.verified');
            Object.assign(badge.style, {
                width: '16px',
                height: '16px',
                display: 'inline-block',
                verticalAlign: 'middle',
                marginLeft: '5px',
                flexShrink: '0',
            });
            name.appendChild(badge);
        }
        const handle = document.createElement('span');
        handle.textContent = username;
        names.append(name, handle);

        const profileLink = document.createElement('a');
        profileLink.className = 'rovalra-friend-ownership-profile-link';
        profileLink.href = `https://www.roblox.com/users/${Number(owner.id)}/profile`;
        profileLink.append(thumb, names);

        row.appendChild(profileLink);
        body.appendChild(row);
    });

    createOverlay({
        title: ts('friendOwnership.overlayTitle', {
            count: totalCount.toLocaleString(),
        }),
        bodyContent: body,
        maxWidth: '420px',
        maxHeight: 'calc(100vh - 100px)',
        showLogo: true,
    });
}

async function addOwnershipPill(thumbnail) {
    if (thumbnail.dataset.rovalraFriendOwnershipInjected) return;

    const itemId = Number(getPlaceIdFromUrl());
    if (!itemId) return;

    const container = document.createElement('div');
    container.className = 'rovalra-friend-ownership-container';
    thumbnail.appendChild(container);

    const itemType = getCatalogItemType();
    const cacheKey = `${itemType}:${itemId}`;

    thumbnail.dataset.rovalraFriendOwnershipInjected = 'loading';

    try {
        let ownerData = pillCache.get(cacheKey);
        if (!ownerData) {
            ownerData = await fetchOwners(itemId, itemType);
            if (ownerData.totalCount === 0) {
                thumbnail.dataset.rovalraFriendOwnershipInjected = 'empty';
                container.remove();
                return;
            }

            const [cachedFriends, thumbnailMap] = await Promise.all([
                getCachedFriendsList(),
                fetchThumbnails(
                    ownerData.connections.map((owner) => ({ id: owner.id })),
                    'AvatarHeadshot',
                    '150x150',
                ),
            ]);

            ownerData.friendMap = new Map(
                cachedFriends.map((friend) => [Number(friend.id), friend]),
            );
            ownerData.thumbnailMap = thumbnailMap;
            pillCache.set(cacheKey, ownerData);
        }

        const pill = createPill(
            createPillContent(
                ownerData.connections,
                ownerData.thumbnailMap,
                ownerData.totalCount,
            ),
            ts('friendOwnership.pillTooltip'),
            { isButton: true, size: 'small' },
        );
        pill.classList.add('rovalra-friend-ownership-pill');
        pill.addEventListener('click', () =>
            showOwnersOverlay(
                ownerData.connections,
                ownerData.friendMap,
                ownerData.thumbnailMap,
                ownerData.totalCount,
            ),
        );

        container.appendChild(pill);

        thumbnail.dataset.rovalraFriendOwnershipInjected = String(itemId);
    } catch (error) {
        container.remove();
        delete thumbnail.dataset.rovalraFriendOwnershipInjected;
        console.warn('RoValra: Failed to load friend ownership', error);
    }
}

export function init() {
    if (initialized) return;
    initialized = true;
    chrome.storage.local.get({ friendOwnershipEnabled: true }, (settings) => {
        if (!settings.friendOwnershipEnabled) return;

        observeElement(CONTAINER_SELECTOR, addOwnershipPill, {
            multiple: true,
        });
        observeElement(
            '.item-connections-social-count.roseal-btn',
            (button) => {
                button.style.display = 'none';
            },
            { multiple: true },
        );
    });
}
