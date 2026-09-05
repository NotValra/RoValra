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

const CONTAINER_SELECTOR = '#item-report-button-frontend';
const assets = getAssets();
const pillCache = new Map();
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

function createAvatar(thumbnail, name, size = '16px') {
    const image = document.createElement('img');
    image.src = thumbnail?.imageUrl || '';
    image.alt = name;
    image.title = name;
    Object.assign(image.style, {
        width: size,
        height: size,
        borderRadius: '50%',
        objectFit: 'cover',
        flexShrink: '0',
    });
    return image;
}

function createPillContent(owners, friendMap, thumbnailMap, totalCount) {
    const content = document.createElement('span');
    content.className = 'rovalra-friend-ownership-pill-content';
    Object.assign(content.style, {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        lineHeight: '16px',
        whiteSpace: 'nowrap',
    });

    owners.slice(0, 2).forEach((owner) => {
        const friend = friendMap.get(Number(owner.id));
        const name =
            friend?.displayName ||
            friend?.username ||
            ts('friendOwnership.unknownUser', { id: owner.id });
        content.appendChild(
            createAvatar(thumbnailMap.get(Number(owner.id)), name),
        );
    });

    const text = document.createElement('span');
    text.textContent = ts('friendOwnership.pillLabel', {
        count: totalCount.toLocaleString(),
    });
    Object.assign(text.style, {
        display: 'inline-flex',
        alignItems: 'center',
        height: '16px',
        lineHeight: '16px',
    });
    content.appendChild(text);
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

async function addOwnershipPill(reportButton) {
    if (reportButton.dataset.rovalraFriendOwnershipInjected) return;

    const itemId = Number(getPlaceIdFromUrl());
    if (!itemId) return;

    const clearfix = reportButton.closest('.clearfix');
    const parent = reportButton.parentNode;
    if (!clearfix || !parent || !clearfix.contains(parent)) return;

    const container = document.createElement('div');
    container.className = 'rovalra-friend-ownership-container';
    parent.insertBefore(container, reportButton.nextSibling);

    const itemType = getCatalogItemType();
    const cacheKey = `${itemType}:${itemId}`;

    reportButton.dataset.rovalraFriendOwnershipInjected = 'loading';

    try {
        let ownerData = pillCache.get(cacheKey);
        if (!ownerData) {
            ownerData = await fetchOwners(itemId, itemType);
            if (ownerData.totalCount === 0) {
                reportButton.dataset.rovalraFriendOwnershipInjected = 'empty';
                container.remove();
                return;
            }

            const [cachedFriends, thumbnailMap] = await Promise.all([
                getCachedFriendsList(),
                fetchThumbnails(
                    ownerData.connections.map((owner) => ({ id: owner.id })),
                    'AvatarHeadshot',
                    '150x150',
                    true,
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
                ownerData.friendMap,
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

        Object.assign(container.style, {
            display: 'inline-flex',
            alignItems: 'center',
            width: 'fit-content',
            maxWidth: '100%',
            verticalAlign: 'middle',
            marginTop: '20px',
            marginLeft: '12px',
        });
        Object.assign(pill.style, {
            display: 'inline-flex',
            width: 'fit-content',
            minWidth: '0',
            flex: '0 0 auto',
            marginLeft: '0',
            marginRight: '0',
            alignItems: 'center',
        });
        const pillText = pill.querySelector('.text-no-wrap');
        if (pillText) {
            Object.assign(pillText.style, {
                display: 'inline-flex',
                alignItems: 'center',
                lineHeight: '16px',
            });
        }
        container.appendChild(pill);

        reportButton.dataset.rovalraFriendOwnershipInjected = String(itemId);
    } catch (error) {
        container.remove();
        delete reportButton.dataset.rovalraFriendOwnershipInjected;
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
