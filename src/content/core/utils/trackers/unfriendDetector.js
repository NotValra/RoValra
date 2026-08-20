const PENDING_UNFRIENDS_KEY = 'rovalra_pending_unfriends';
const MAX_PENDING_UNFRIENDS_PER_USER = 200;

let onUnfriendsDetected = null;

export function setUnfriendDetectedListener(listener) {
    onUnfriendsDetected = listener;
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

export async function reportDetectedUnfriends(userId, removedFriends) {
    if (!removedFriends?.length) return;

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

export function initUnfriendDetectorTracking() {}
