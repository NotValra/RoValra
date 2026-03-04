import { callRobloxApiJson } from "../../api";
import { getAuthenticatedUserId } from "../../user";


const FRIENDS_DATA_KEY = 'rovalra_friends_data';
const FRIENDS_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const USER_PROFILE_API_ENDPOINT = '/user-profile-api/v1/user/profiles/get-profiles';

async function fetchFriendsPage(userId, cursor = null) {
    try {
        let endpoint = `/v1/users/${userId}/friends/find?limit=50`;
        if (cursor) {
            endpoint += `&cursor=${encodeURIComponent(cursor)}`;
        }

        return await callRobloxApiJson({
            subdomain: 'friends',
            endpoint: endpoint,
        });
    } catch (error) {
        console.error('RoValra: Failed to fetch friends list page', error);
        return null;
    }
}

async function fetchUserProfileData(userIds) {
    try {
        return await callRobloxApiJson({
            subdomain: 'apis',
            endpoint: USER_PROFILE_API_ENDPOINT,
            method: 'POST',
            body: {
                userIds: userIds,
                fields: ["isVerified", "isDeleted", "names.combinedName", "names.displayName", "names.username"]
            }
        });
    } catch (error) {
        console.error('RoValra: Failed to fetch user profile data', error);
        return null;
    }
}

async function fetchTrustedFriendsStatus(userId, friendIds) {
    if (!friendIds || friendIds.length === 0) {
        return new Set();
    }
    try {
        const friendIdsString = friendIds.join('%2C');
        const data = await callRobloxApiJson({
            subdomain: 'friends',
            endpoint: `/v1/user/${userId}/multiget-are-trusted-friends?userIds=${friendIdsString}`,
        });
        return new Set(data?.trustedFriendsId || []);
    } catch (error) {
        console.error('RoValra: Failed to fetch trusted friends status', error);
        return new Set();
    }
}


export async function updateFriendsList(userId) {
    let allFriends = [];
    let cursor = null;

    try {
        do {
            const page = await fetchFriendsPage(userId, cursor);
            if (!page || !page.PageItems) break;

            allFriends = allFriends.concat(page.PageItems);
            cursor = page.NextCursor;
        } while (cursor);

        const batchSize = 50;
        let fullFriendsList = [];
        for (let i = 0; i < allFriends.length; i += batchSize) {
            const batchIds = allFriends.slice(i, i + batchSize).map(friend => friend.id);
            
            const [profileData, trustedFriendsSet] = await Promise.all([
                fetchUserProfileData(batchIds),
                fetchTrustedFriendsStatus(userId, batchIds)
            ]);

            if (profileData?.profileDetails) {
                const enrichedFriends = profileData.profileDetails.map(profile => {
                    return {
                        id: profile.userId,
                        username: profile.names.username,
                        displayName: profile.names.displayName,
                        combinedName: profile.names.combinedName,
                        isVerified: profile.isVerified,
                        isDeleted: profile.isDeleted,
                        isTrusted: trustedFriendsSet.has(profile.userId)
                    };
                });
                fullFriendsList = fullFriendsList.concat(enrichedFriends);
            }
        }

        const storageResult = await new Promise(resolve => chrome.storage.local.get([FRIENDS_DATA_KEY], resolve));
        const allUsersFriendsData = storageResult[FRIENDS_DATA_KEY] || {};

        allUsersFriendsData[userId] = {
            friendsList: fullFriendsList,
            lastChecked: Date.now()
        };

        await new Promise(resolve => chrome.storage.local.set({ [FRIENDS_DATA_KEY]: allUsersFriendsData }, resolve));
        console.log('RoValra: Friends list and timestamp updated in local storage for user', userId);
        return fullFriendsList;

    } catch (error) {
        console.error('RoValra: Failed to update friends list', error);
        return [];
    }
}

export async function getFriendsList() {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
        return [];
    }

    const result = await new Promise(resolve => chrome.storage.local.get([FRIENDS_DATA_KEY], resolve));
    const allUsersFriendsData = result[FRIENDS_DATA_KEY] || {};
    const currentUserData = allUsersFriendsData[userId];

    const friendsList = currentUserData?.friendsList;
    const lastChecked = currentUserData?.lastChecked;
    const now = Date.now();

    if (!friendsList || !lastChecked || (now - lastChecked > FRIENDS_CACHE_DURATION)) {
        return await updateFriendsList(userId);
    }
    return friendsList || [];
}


export function initFriendsListTracking() {

    getFriendsList();
}