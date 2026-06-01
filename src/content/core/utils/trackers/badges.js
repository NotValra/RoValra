import { getAuthenticatedUserId } from '../../user';

const BADGES_DATA_KEY = 'rovalra_badges_v1';

export async function getBadgeData() {
    const userId = await getAuthenticatedUserId();
    if (!userId) return null;

    const result = await chrome.storage.local.get([BADGES_DATA_KEY]);
    const allUsersBadges = result[BADGES_DATA_KEY] || {};
    const currentUserData = allUsersBadges[userId];

    return {
        totals: { totalBadges: 0 },
        badges: {},
        places: {},
        ...(currentUserData || {}),
        isScanning: !!currentUserData?.isScanning,
    };
}

export async function getCachedBadgeData() {
    const userId = await getAuthenticatedUserId();
    if (!userId) return null;

    const result = await chrome.storage.local.get([BADGES_DATA_KEY]);
    const allUsersBadges = result[BADGES_DATA_KEY] || {};
    return allUsersBadges[userId] || null;
}

export async function getGameBadges(placeId) {
    const data = await getBadgeData();
    if (!data) return { badges: [], totalBadges: 0, isScanning: false };

    const badgeIds = data.places?.[String(placeId)]?.badgeIds || [];
    const badges = badgeIds
        .map((badgeId) => data.badges?.[String(badgeId)])
        .filter(Boolean);

    return {
        badges,
        totalBadges: badges.length,
        isScanning: !!data.isScanning,
    };
}

export async function hasBadge(badgeId) {
    const data = await getBadgeData();
    return !!data?.badges?.[String(badgeId)];
}

export function initBadgesTracking() {
    getAuthenticatedUserId().then((userId) => {
        if (!userId) return;
        chrome.runtime.sendMessage({
            action: 'triggerBadgeScan',
            userId,
        });
    });
}
