import {
    observeElement,
    observeChildren,
} from '../../../core/observer.js';
import {
    getUserIdFromFriendUrl,
    getUserIdFromUrl,
} from '../../../core/idExtractor.js';
import { settings } from '../../../core/settings/getSettings.js';
import { batchFetchPresence } from '../../../core/ui/profile/userCard.js';

const PRESENCE_BATCH_SIZE = 50;
const PRESENCE_CACHE_TIME = 15000;
const SETTING_NAME = 'sortFriendsByStatus';

let containerObserver = null;
let childrenObserver = null;
let sortTimer = null;
let initialized = false;

let cachedUserId = null;
let cachedFriendIdsKey = '';
let cachedPresenceMap = new Map();
let cacheTime = 0;

function isOnFriendsPage() {
    return (
        window.location.hash.includes('#!/friends') ||
        window.location.pathname.includes('/friends')
    );
}

function getFriendId(card) {
    if (card.id && /^\d+$/.test(card.id)) {
        return Number(card.id);
    }

    const profileLink = card.querySelector(
        '.avatar-card-link, .avatar-card-caption a.avatar-name, a[href*="/users/"]',
    );

    const userId = getUserIdFromUrl(profileLink?.href || '');
    const numericUserId = Number(userId);

    return Number.isSafeInteger(numericUserId) && numericUserId > 0
        ? numericUserId
        : null;
}

function getFriendCards(container) {
    return Array.from(container.children).filter(
        (element) =>
            element instanceof HTMLElement &&
            element.matches('.avatar-card'),
    );
}

function getFriendIdsKey(friendIds) {
    return [...friendIds]
        .sort((firstId, secondId) => firstId - secondId)
        .join(',');
}

async function fetchPresenceMap(friendIds) {
    const presenceMap = new Map();

    for (
        let index = 0;
        index < friendIds.length;
        index += PRESENCE_BATCH_SIZE
    ) {
        const batch = friendIds.slice(
            index,
            index + PRESENCE_BATCH_SIZE,
        );

        const batchMap = await batchFetchPresence(batch);

        for (const [userId, presence] of batchMap) {
            presenceMap.set(Number(userId), presence);
        }
    }

    return presenceMap;
}

async function getPresenceMap(userId, friendIds) {
    const friendIdsKey = getFriendIdsKey(friendIds);

    if (
        cachedUserId === userId &&
        cachedFriendIdsKey === friendIdsKey &&
        Date.now() - cacheTime < PRESENCE_CACHE_TIME
    ) {
        return cachedPresenceMap;
    }

    const presenceMap = await fetchPresenceMap(friendIds);

    cachedUserId = userId;
    cachedFriendIdsKey = friendIdsKey;
    cachedPresenceMap = presenceMap;
    cacheTime = Date.now();

    return presenceMap;
}

function getStatusRank(friendId, presenceMap) {
    const presence = presenceMap.get(friendId);
    const presenceType = Number(
        presence?.userPresenceType ?? 0,
    );

    if (presenceType === 2) {
        return 0;
    }

    if (presenceType > 0) {
        return 1;
    }

    return 2;
}

async function sortFriends(container) {
    if (
        !isOnFriendsPage() ||
        !(await settings.sortFriendsByStatus)
    ) {
        return;
    }

    const userId = Number(
        await getUserIdFromFriendUrl(),
    );

    if (
        !Number.isSafeInteger(userId) ||
        userId <= 0
    ) {
        return;
    }

    const cards = getFriendCards(container);

    if (cards.length < 2) {
        return;
    }

    const indexedCards = cards.map(
        (card, index) => ({
            card,
            index,
            userId: getFriendId(card),
        }),
    );

    const friendIds = [
        ...new Set(
            indexedCards
                .map((entry) => entry.userId)
                .filter(Boolean),
        ),
    ];

    if (!friendIds.length) {
        return;
    }

    const presenceMap = await getPresenceMap(
        userId,
        friendIds,
    );

    const sortedCards = [...indexedCards]
        .sort((firstEntry, secondEntry) => {
            const firstRank = getStatusRank(
                firstEntry.userId,
                presenceMap,
            );
            const secondRank = getStatusRank(
                secondEntry.userId,
                presenceMap,
            );

            return (
                firstRank - secondRank ||
                firstEntry.index - secondEntry.index
            );
        })
        .map((entry) => entry.card);

    const changed = sortedCards.some(
        (card, index) => card !== cards[index],
    );

    if (!changed) {
        return;
    }

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
    containerObserver?.disconnect();
    containerObserver = null;

    childrenObserver?.disconnect();
    childrenObserver = null;

    clearTimeout(sortTimer);
    sortTimer = null;
}

async function run() {
    cleanup();

    if (
        !isOnFriendsPage() ||
        !(await settings.sortFriendsByStatus)
    ) {
        return;
    }

    containerObserver = observeElement(
        '.avatar-cards',
        (container) => {
            scheduleSort(container);

            childrenObserver?.disconnect();
            childrenObserver = observeChildren(
                container,
                () => scheduleSort(container),
            );
        },
        {
            multiple: false,
            onRemove: () => {
                childrenObserver?.disconnect();
                childrenObserver = null;
            },
        },
    );
}

function rerun() {
    run().catch((error) => {
        console.warn(
            'RoValra: Failed to initialize friend status sorting',
            error,
        );
    });
}

export function init() {
    if (initialized) {
        rerun();
        return;
    }

    initialized = true;

    window.addEventListener('hashchange', rerun);
    window.addEventListener('popstate', rerun);

    document.addEventListener(
        'rovalra:settingSaved',
        (event) => {
            if (event.detail?.name === SETTING_NAME) {
                cachedFriendIdsKey = '';
                cacheTime = 0;
                rerun();
            }
        },
    );

    chrome.storage.onChanged.addListener(
        (changes, area) => {
            if (
                area === 'local' &&
                changes[SETTING_NAME]
            ) {
                cachedFriendIdsKey = '';
                cacheTime = 0;
                rerun();
            }
        },
    );

    rerun();
}
