import { callRobloxApiJson } from '../../core/api.js';
import { getPlaceIdFromUrl } from '../../core/idExtractor.js';
import { ts } from '../../core/locale/i18n.js';
import { observeElement, observeIntersection } from '../../core/observer.js';
import { createOverlay } from '../../core/ui/overlay.js';
import { createPill } from '../../core/ui/general/pill.js';
import { getAssets } from '../../core/assets.js';
import {
    createThumbnailElement,
    fetchThumbnails,
} from '../../core/thumbnail/thumbnails.js';
import { getCachedFriendsList } from '../../core/utils/trackers/friendslist.js';
import {
    getOwnedCopies,
    SKIPPED_ERROR,
} from '../../core/catalog/ownedCopies.js';
import { createInteractiveTimestamp } from '../../core/ui/time/time.js';
import { createMenuButton } from '../../core/ui/menuButton.js';
import { createOwnedCopyRows } from '../../core/ui/items/ownedCopiesList.js';

const CONTAINER_SELECTOR = '.item-details-thumbnail-container';
const assets = getAssets();
const pillCache = new Map();
const MAX_PREVIEW_AVATARS = 3;
const VISIBLE_DELAY_MS = 250;
let initialized = false;
let showOwnedSince = true;
let ownedSinceTracker = null;

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

function renderOwnedSince(line, copies) {
    if (!copies.length) {
        line.remove();
        return;
    }

    const label = document.createElement('span');
    label.textContent = `${ts('ownedSince.ownedSince')} `;

    line.replaceChildren(label, createInteractiveTimestamp(copies[0].addTime));

    if (copies.length > 1) {
        const separator = document.createElement('span');
        separator.textContent = ' · ';

        const copiesLabel = ts('friendOwnership.copies', {
            count: copies.length,
        });
        const count = document.createElement('span');
        count.className = 'rovalra-friend-ownership-copies';
        count.textContent = copiesLabel;

        const menu = createMenuButton({
            anchor: count,
            className: 'rovalra-owned-since-popover',
            ariaLabel: copiesLabel,
            cacheContent: true,
            buildContent: (body) => {
                const title = document.createElement('div');
                title.className = 'rovalra-owned-since-title';
                title.textContent = copiesLabel;

                const content = document.createElement('div');
                content.className = 'rovalra-owned-since-content';
                content.append(...createOwnedCopyRows(copies));

                body.append(title, content);
            },
        });
        count.appendChild(menu.button);

        line.append(separator, count);
    }
    line.dataset.state = 'loaded';
}

function createOwnedSinceTracker(assetId) {
    ownedSinceTracker?.stop();

    const visible = new Set();
    const timers = new Map();
    const observed = new Map();

    const unobserve = (line) => {
        observed.get(line)?.unobserve();
        observed.delete(line);
        visible.delete(line);
        clearTimeout(timers.get(line));
        timers.delete(line);
    };

    const load = (line) => {
        line.dataset.state = 'loading';
        getOwnedCopies(line.dataset.userId, assetId, {
            shouldRun: () => line.isConnected && visible.has(line),
        })
            .then((copies) => {
                if (!line.isConnected) return;
                unobserve(line);
                renderOwnedSince(line, copies);
            })
            .catch((error) => {
                if (!line.isConnected) return;
                if (error?.message === SKIPPED_ERROR) {
                    delete line.dataset.state;
                    if (visible.has(line)) schedule(line);
                    return;
                }
                unobserve(line);
                if (error?.status === 403 || error?.status === 401) {
                    line.textContent = ts('friendOwnership.ownedSinceHidden');
                    line.dataset.state = 'hidden';
                } else {
                    line.remove();
                }
            });
    };

    const schedule = (line) => {
        if (timers.has(line) || line.dataset.state) return;
        timers.set(
            line,
            setTimeout(() => {
                timers.delete(line);
                if (visible.has(line) && line.isConnected) load(line);
            }, VISIBLE_DELAY_MS),
        );
    };

    const onIntersection = (entry) => {
        const line = entry.target;
        if (!line.isConnected) {
            unobserve(line);
            return;
        }
        if (entry.isIntersecting) {
            visible.add(line);
            schedule(line);
        } else {
            visible.delete(line);
            clearTimeout(timers.get(line));
            timers.delete(line);
        }
    };

    const tracker = {
        observe: (line) => {
            observed.set(line, observeIntersection(line, onIntersection));
        },
        stop: () => [...observed.keys()].forEach(unobserve),
    };

    ownedSinceTracker = tracker;
    return tracker;
}

async function showOwnersOverlay(
    owners,
    friendMap,
    thumbnailMap,
    totalCount,
    itemId,
    itemType,
) {
    const body = document.createElement('div');
    body.className = 'rovalra-friend-ownership-list';

    const lineTracker =
        showOwnedSince && itemType === 'Asset'
            ? createOwnedSinceTracker(itemId)
            : null;
    const ownedSinceLines = [];

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
        handle.className = 'rovalra-friend-ownership-handle';
        handle.textContent = username;
        names.append(name, handle);

        if (lineTracker) {
            const ownedSince = document.createElement('div');
            ownedSince.className = 'rovalra-friend-ownership-owned-since';
            ownedSince.dataset.userId = String(Number(owner.id));
            names.appendChild(ownedSince);
            ownedSinceLines.push(ownedSince);
        }

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

    ownedSinceLines.forEach((line) => lineTracker.observe(line));
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
                itemId,
                itemType,
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
    chrome.storage.local.get(
        { friendOwnershipEnabled: true, friendOwnershipOwnedSince: true },
        (settings) => {
            if (!settings.friendOwnershipEnabled) return;
            showOwnedSince = settings.friendOwnershipOwnedSince !== false;

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
        },
    );
}
