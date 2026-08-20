import { getAuthenticatedUserId } from '../../user.js';
import { getCachedFriendsList } from './friendslist.js';
import { callRobloxApiJson } from '../../api';
import { settings } from '../../settings/getSettings.js';

const SNAPSHOT_KEY = 'rovalra_unfriend_detector_snapshot';
const PENDING_UNFRIENDS_KEY = 'rovalra_pending_unfriends';
const MAX_PENDING_UNFRIENDS_PER_USER = 200;

let onUnfriendsDetected = null;

export function setUnfriendDetectedListener(listener) {
    onUnfriendsDetected = listener;
}

async function fetchFriendsPageFresh(userId, cursor = null) {
    try {
        let endpoint = `/v1/users/${userId}/friends/find?limit=50`;
        if (cursor) endpoint += `&cursor=${encodeURIComponent(cursor)}`;
        endpoint += `&_rovalraUnfriendCheck=${Date.now()}`;
        return await callRobloxApiJson({
            subdomain: 'friends',
            endpoint,
            useBackground: true,
        });
    } catch (error) {
        return null;
    }
}

async function fetchAllFriendIds(userId) {
    let allFriends = [];
    let cursor = null;
    do {
        const page = await fetchFriendsPageFresh(userId, cursor);
        if (!page || !page.PageItems) {
            return null;
        }
        allFriends = allFriends.concat(page.PageItems);
        cursor = page.NextCursor;
    } while (cursor);
    return allFriends;
}

async function buildLiteFriendRecords(userId) {
    const [rawFriends, cachedFriendsList] = await Promise.all([
        fetchAllFriendIds(userId),
        getCachedFriendsList(),
    ]);

    if (rawFriends === null) return null;

    const cachedById = new Map(cachedFriendsList.map((f) => [f.id, f]));

    return rawFriends.map((friend) => {
        const cached = cachedById.get(friend.id);
        const username = cached?.username || friend.name || null;
        const displayName = cached?.displayName || friend.displayName || null;

        return {
            id: friend.id,
            username,
            displayName,
            combinedName:
                cached?.combinedName ||
                (displayName && username
                    ? `${displayName} (@${username})`
                    : displayName || username || null),
        };
    });
}

async function getSnapshot(userId) {
    const result = await new Promise((resolve) =>
        chrome.storage.local.get([SNAPSHOT_KEY], resolve),
    );
    const allSnapshots = result[SNAPSHOT_KEY] || {};
    return allSnapshots[userId] || null;
}

async function setSnapshot(userId, friendRecords) {
    const snapshot = {};
    friendRecords.forEach((friend) => {
        snapshot[friend.id] = friend;
    });

    const result = await new Promise((resolve) =>
        chrome.storage.local.get([SNAPSHOT_KEY], resolve),
    );
    const allSnapshots = result[SNAPSHOT_KEY] || {};
    allSnapshots[userId] = snapshot;

    await new Promise((resolve) =>
        chrome.storage.local.set({ [SNAPSHOT_KEY]: allSnapshots }, resolve),
    );
}

async function queueUnfriendedUsers(userId, removedFriends) {
    if (!removedFriends.length) return;

    const result = await new Promise((resolve) =>
        chrome.storage.local.get([PENDING_UNFRIENDS_KEY], resolve),
    );
    const allPending = result[PENDING_UNFRIENDS_KEY] || {};
    const existingPending = allPending[userId] || [];
    const existingIds = new Set(existingPending.map((f) => f.id));

    const newEntries = removedFriends
        .filter((friend) => !existingIds.has(friend.id))
        .map((friend) => ({
            ...friend,
            detectedAt: Date.now(),
        }));

    if (!newEntries.length) return;

    allPending[userId] = [...existingPending, ...newEntries].slice(
        -MAX_PENDING_UNFRIENDS_PER_USER,
    );

    await new Promise((resolve) =>
        chrome.storage.local.set(
            { [PENDING_UNFRIENDS_KEY]: allPending },
            resolve,
        ),
    );
}

async function reconcilePendingWithCurrentFriends(
    userId,
    currentFriendRecords,
) {
    const currentIds = new Set(currentFriendRecords.map((f) => f.id));

    const result = await new Promise((resolve) =>
        chrome.storage.local.get([PENDING_UNFRIENDS_KEY], resolve),
    );
    const allPending = result[PENDING_UNFRIENDS_KEY] || {};
    const existingPending = allPending[userId] || [];

    if (!existingPending.length) return;

    const stillUnfriended = existingPending.filter(
        (friend) => !currentIds.has(friend.id),
    );

    if (stillUnfriended.length === existingPending.length) return;

    allPending[userId] = stillUnfriended;
    await new Promise((resolve) =>
        chrome.storage.local.set(
            { [PENDING_UNFRIENDS_KEY]: allPending },
            resolve,
        ),
    );
}

async function diffAgainstSnapshot(userId, currentFriendRecords) {
    const snapshot = await getSnapshot(userId);

    if (!snapshot) {
        await setSnapshot(userId, currentFriendRecords);
        return;
    }

    const currentIds = new Set(currentFriendRecords.map((f) => f.id));
    const removedFriends = Object.values(snapshot).filter(
        (friend) => !currentIds.has(friend.id),
    );

    if (removedFriends.length > 0) {
        await queueUnfriendedUsers(userId, removedFriends);

        if (typeof onUnfriendsDetected === 'function') {
            try {
                onUnfriendsDetected(removedFriends);
            } catch (error) {
                console.error(
                    'RoValra: Unfriend Detector listener threw an error',
                    error,
                );
            }
        }
    }

    await reconcilePendingWithCurrentFriends(userId, currentFriendRecords);
    await setSnapshot(userId, currentFriendRecords);
}

async function checkForUnfriendEvents() {
    if (!(await settings.unfriendDetectorEnabled)) return;

    const userId = await getAuthenticatedUserId();
    if (!userId) return;

    const liteFriends = await buildLiteFriendRecords(userId);
    if (liteFriends === null) {
        console.error(
            'RoValra: Unfriend Detector could not fetch a complete friends list, skipping this check.',
        );
        return;
    }
    if (!liteFriends.length) return;

    await diffAgainstSnapshot(userId, liteFriends);
}

export function initUnfriendDetectorTracking() {
    checkForUnfriendEvents();
}