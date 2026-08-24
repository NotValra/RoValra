import {
    observeElement,
    observeChildren,
} from '../../../core/observer.js';
import { getUserIdFromFriendUrl } from '../../../core/idExtractor.js';
import { fetchFriendsOnlineStatus } from '../../../core/utils/trackers/friendslist.js';

let containerObserver = null;
let childrenObserver = null;
let sortTimer = null;

let cachedUserId = null;
let cachedOnlineUsers = [];
let cacheTime = 0;

function isOnFriendsPage() {
    const hash = window.location.hash;

    return (
        hash.includes('#!/friends') ||
        (window.location.pathname.includes('/friends') && !hash)
    );
}

function getFriendId(card) {
    if (card.id && /^\d+$/.test(card.id)) {
        return Number(card.id);
    }

    const link = card.querySelector(
        '.avatar-card-link, a[href*="/users/"]',
    );

    if (!link) return null;

    const match = link.href.match(/\/users\/(\d+)\//);

    return match ? Number(match[1]) : null;
}

async function getOnlineUsers(userId) {
    if (
        cachedUserId === userId &&
        Date.now() - cacheTime < 30000
    ) {
        return cachedOnlineUsers;
    }

    const users = await fetchFriendsOnlineStatus(userId);

    cachedUserId = userId;
    cachedOnlineUsers = users;
    cacheTime = Date.now();

    return users;
}

function getStatusRank(friendId, onlineMap) {
    const friend = onlineMap.get(friendId);

    if (!friend) {
        return 2;
    }

    const presence = friend.userPresence;

    if (
        presence?.placeId ||
        presence?.userPresenceType === 2
    ) {
        return 0;
    }

    return 1;
}

async function sortFriends(container) {
    if (!isOnFriendsPage()) return;

    const storage = await chrome.storage.local.get({
        sortFriendsByStatus: false,
    });

    if (!storage.sortFriendsByStatus) return;

    const userId = await getUserIdFromFriendUrl();

    if (!userId) return;

    const cards = Array.from(
        container.querySelectorAll(
            'li.list-item.avatar-card',
        ),
    );

    if (cards.length < 2) return;

    const onlineUsers = await getOnlineUsers(userId);

    const onlineMap = new Map(
        onlineUsers.map((friend) => [
            Number(friend.id),
            friend,
        ]),
    );

    const sortedCards = [...cards].sort(
        (firstCard, secondCard) => {
            const firstId = getFriendId(firstCard);
            const secondId = getFriendId(secondCard);

            const firstRank = getStatusRank(
                firstId,
                onlineMap,
            );

            const secondRank = getStatusRank(
                secondId,
                onlineMap,
            );

            return firstRank - secondRank;
        },
    );

    const changed = sortedCards.some(
        (card, index) => card !== cards[index],
    );

    if (!changed) return;

    for (const card of sortedCards) {
        container.appendChild(card);
    }
}

function scheduleSort(container) {
    clearTimeout(sortTimer);

    sortTimer = setTimeout(() => {
        sortFriends(container).catch((error) => {
            console.warn(
                'RoValra: Failed to sort friends by status',
                error,
            );
        });
    }, 100);
}

function cleanup() {
    if (containerObserver) {
        containerObserver.disconnect();
        containerObserver = null;
    }

    if (childrenObserver) {
        childrenObserver.disconnect();
        childrenObserver = null;
    }

    clearTimeout(sortTimer);
}

function run() {
    cleanup();

    if (!isOnFriendsPage()) return;

    containerObserver = observeElement(
        '.avatar-cards',
        (container) => {
            scheduleSort(container);

            childrenObserver?.disconnect();

            childrenObserver = observeChildren(
                container,
                () => {
                    scheduleSort(container);
                },
            );
        },
        {
            multiple: false,
        },
    );
}

export function init() {
    run();

    window.addEventListener('hashchange', run);
    window.addEventListener('popstate', run);

    chrome.storage.onChanged.addListener(
        (changes, area) => {
            if (
                area === 'local' &&
                changes.sortFriendsByStatus
            ) {
                run();
            }
        },
    );
}