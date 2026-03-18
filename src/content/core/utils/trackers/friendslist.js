// This script fetches a users friends list and stores information about it,
// like last online, mutual friends, estimated age range (idk if that will be used), trusted friends, last location, friends since and some other lesser important stuff.
import { callRobloxApiJson } from '../../api';
import { getAuthenticatedUserId } from '../../user';

const FRIENDS_DATA_KEY = 'rovalra_friends_data';
const FRIENDS_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes for heavy data
const ONLINE_STATUS_CACHE_DURATION = 1 * 60 * 1000; // 1 minute for online status
const USER_PROFILE_API_ENDPOINT =
    '/user-profile-api/v1/user/profiles/get-profiles';

function refineAgeWithAccountAge(estimatedRange, accountCreatedTimestamp) {
    if (
        !accountCreatedTimestamp ||
        !estimatedRange ||
        estimatedRange === 'No Chat Data' ||
        estimatedRange === 'Unknown (No Chat History)'
    ) {
        return estimatedRange;
    }

    const accountAgeYears = Math.floor(
        (Date.now() - accountCreatedTimestamp) / (1000 * 60 * 60 * 24 * 365.25),
    );

    if (estimatedRange.includes(' or ')) {
        const parts = estimatedRange.split(' or ');
        const upperPart = parts.find((p) => p.endsWith('+'))?.replace('+', '');
        const lowerPart = parts
            .find((p) => p.startsWith('<'))
            ?.replace('<', '');

        const minOfUpper = upperPart ? parseInt(upperPart) : 0;
        const maxOfLower = lowerPart ? parseInt(lowerPart) - 1 : 0;

        if (accountAgeYears > maxOfLower) {
            return `${Math.max(minOfUpper, accountAgeYears)}+`;
        }
        return `${upperPart}+ or ${accountAgeYears}-${maxOfLower}`;
    }

    if (estimatedRange.startsWith('<')) {
        const maxAge = parseInt(estimatedRange.replace('<', '')) - 1;
        return accountAgeYears >= maxAge
            ? `${accountAgeYears}+`
            : `${accountAgeYears}-${maxAge}`;
    }

    if (estimatedRange.endsWith('+')) {
        const minAge = parseInt(estimatedRange.replace('+', ''));
        return `${Math.max(minAge, accountAgeYears)}+`;
    }

    if (estimatedRange.includes('-')) {
        const [minStr, maxStr] = estimatedRange.split('-');
        const minAge = parseInt(minStr);
        const maxAge = parseInt(maxStr);
        const newMin = Math.max(minAge, accountAgeYears);

        if (newMin >= maxAge) return `${newMin}+`;
        return `${newMin}-${maxAge}`;
    }

    return estimatedRange;
}

async function fetchUserAgeGroup() {
    try {
        return await callRobloxApiJson({
            subdomain: 'apis',
            endpoint: '/user-settings-api/v1/account-insights/age-group',
        });
    } catch (error) {
        console.error('RoValra: Failed to fetch self age group', error);
        return null;
    }
}

async function fetchChatConversationsPage(cursor = null) {
    try {
        let endpoint =
            '/platform-chat-api/v1/get-user-conversations?include_messages=true';
        if (cursor) endpoint += `&cursor=${encodeURIComponent(cursor)}`;
        return await callRobloxApiJson({
            subdomain: 'apis',
            endpoint: endpoint,
        });
    } catch (error) {
        return null;
    }
}

async function fetchAllConversations() {
    let allConversations = [];
    let cursor = null;
    do {
        const data = await fetchChatConversationsPage(cursor);
        if (!data || !data.conversations) break;
        allConversations = allConversations.concat(data.conversations);
        cursor = data.next_cursor;
    } while (cursor);
    return allConversations;
}

function estimateAgeRange(
    ownAgeKey,
    hasRestrictedMsg,
    hasTrustedComms,
    hasVisibleMessages,
) {
    if (hasRestrictedMsg) {
        switch (ownAgeKey) {
            case 'Label.AgeGroup16To17':
                return '21+ or <13';
            case 'Label.AgeGroup13To15':
                return '18+ or <9';
            case 'Label.AgeGroup18To20':
                return '<16';
            case 'Label.AgeGroupOver21':
                return '<18';
            default:
                return 'Restricted';
        }
    }

    if (hasVisibleMessages) {
        switch (ownAgeKey) {
            case 'Label.AgeGroupUnder9':
                return '<13';
            case 'Label.AgeGroup9To12':
                return '<16';
            case 'Label.AgeGroup13To15':
                return '9-17';
            case 'Label.AgeGroup16To17':
                return '13-20';
            case 'Label.AgeGroup18To20':
                return '16+';
            case 'Label.AgeGroupOver21':
                return '18+';
            default:
                return 'Compatible';
        }
    }

    if (hasTrustedComms) {
        switch (ownAgeKey) {
            case 'Label.AgeGroupUnder9':
                return '<13';
            case 'Label.AgeGroup9To12':
                return '<16';
            case 'Label.AgeGroup13To15':
                return '9-17';
            case 'Label.AgeGroup16To17':
                return '13-20';
            case 'Label.AgeGroup18To20':
                return '16+';
            case 'Label.AgeGroupOver21':
                return '18+';
            default:
                return 'Trusted';
        }
    }

    return 'Unknown (No Chat History)';
}

async function fetchFriendsPage(userId, cursor = null) {
    try {
        let endpoint = `/v1/users/${userId}/friends/find?limit=50`;
        if (cursor) endpoint += `&cursor=${encodeURIComponent(cursor)}`;
        return await callRobloxApiJson({
            subdomain: 'friends',
            endpoint: endpoint,
        });
    } catch (error) {
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
                fields: [
                    'isVerified',
                    'isDeleted',
                    'names.combinedName',
                    'names.displayName',
                    'names.username',
                ],
            },
        });
    } catch (error) {
        return null;
    }
}

async function fetchTrustedFriendsStatus(userId, friendIds) {
    if (!friendIds || friendIds.length === 0) return new Set();
    try {
        const friendIdsString = friendIds.join('%2C');
        const data = await callRobloxApiJson({
            subdomain: 'friends',
            endpoint: `/v1/user/${userId}/multiget-are-trusted-friends?userIds=${friendIdsString}`,
        });
        return new Set(data?.trustedFriendsId || []);
    } catch (error) {
        return new Set();
    }
}

async function fetchProfileInsights(userIds) {
    try {
        return await callRobloxApiJson({
            subdomain: 'apis',
            endpoint: '/profile-insights-api/v1/multiProfileInsights',
            method: 'POST',
            body: {
                userIds: userIds.map((id) => id.toString()),
                rankingStrategy: 'tc_info_boost',
            },
        });
    } catch (error) {
        return null;
    }
}

async function fetchFriendsOnlineStatus(userId) {
    try {
        const response = await callRobloxApiJson({
            subdomain: 'friends',
            endpoint: `/v1/users/${userId}/friends/online`,
        });
        return response?.data || [];
    } catch (error) {
        console.error('RoValra: Failed to fetch online status', error);
        return [];
    }
}

export async function updateFriendsList(userId) {
    let allFriends = [];
    let friendsCursor = null;

    try {
        const [conversations, ageData, onlineData] = await Promise.all([
            fetchAllConversations(),
            fetchUserAgeGroup(),
            fetchFriendsOnlineStatus(userId),
        ]);

        const onlineMap = new Map();
        onlineData.forEach((item) => {
            onlineMap.set(item.id, {
                lastOnline: item.userPresence?.lastOnline,
                lastLocation: item.userPresence?.placeId,
            });
        });

        const ownAgeKey = ageData?.ageGroupTranslationKey;
        const chatAnalysisMap = new Map();

        if (conversations) {
            conversations.forEach((conv) => {
                const friendId = conv.participant_user_ids.find(
                    (id) => id != userId,
                );
                if (!friendId) return;

                const hasRestrictedMsg = conv.messages?.some(
                    (m) =>
                        m.content &&
                        m.content.includes(
                            "Other users can't see messages in this chat",
                        ),
                );
                const hasTrustedComms = conv.messages?.some(
                    (m) => m.moderation_type === 'trusted_comms',
                );
                const hasVisibleMessages = conv.messages?.some(
                    (m) =>
                        m.type === 'user' &&
                        m.content &&
                        !m.content.includes("Other users can't see"),
                );

                chatAnalysisMap.set(friendId, {
                    estimatedAge: estimateAgeRange(
                        ownAgeKey,
                        hasRestrictedMsg,
                        hasTrustedComms,
                        hasVisibleMessages,
                    ),
                });
            });
        }

        do {
            const page = await fetchFriendsPage(userId, friendsCursor);
            if (!page || !page.PageItems) break;
            allFriends = allFriends.concat(page.PageItems);
            friendsCursor = page.NextCursor;
        } while (friendsCursor);

        const batchSize = 50;
        let fullFriendsList = [];

        for (let i = 0; i < allFriends.length; i += batchSize) {
            const batchIds = allFriends
                .slice(i, i + batchSize)
                .map((f) => f.id);
            const [profileData, trustedFriendsSet, insightsData] =
                await Promise.all([
                    fetchUserProfileData(batchIds),
                    fetchTrustedFriendsStatus(userId, batchIds),
                    fetchProfileInsights(batchIds),
                ]);

            const insightMap = new Map();
            if (insightsData?.userInsights) {
                insightsData.userInsights.forEach((insight) => {
                    insightMap.set(insight.targetUser, insight.profileInsights);
                });
            }

            if (profileData?.profileDetails) {
                const enrichedFriends = profileData.profileDetails.map(
                    (profile) => {
                        const friendId = profile.userId;
                        const isTrusted = trustedFriendsSet.has(friendId);
                        const chatStatus = chatAnalysisMap.get(friendId);
                        const userInsights = insightMap.get(friendId) || [];
                        const presence = onlineMap.get(friendId);

                        let mutualFriends = [];
                        let accountCreated = null;
                        let friendsSince = null;

                        userInsights.forEach((item) => {
                            if (
                                item.insightCase === 1 &&
                                item.mutualFriendInsight
                            ) {
                                mutualFriends = Object.entries(
                                    item.mutualFriendInsight.mutualFriends,
                                ).map(([id, info]) => ({
                                    userId: id,
                                    username: info.username,
                                    displayName: info.displayName,
                                }));
                            }
                            if (
                                item.insightCase === 4 &&
                                item.friendshipAgeInsight
                            ) {
                                friendsSince =
                                    item.friendshipAgeInsight
                                        .friendsSinceDateTime.seconds * 1000;
                            }
                            if (
                                item.insightCase === 6 &&
                                item.accountCreationDateInsight
                            ) {
                                accountCreated =
                                    item.accountCreationDateInsight
                                        .accountCreatedDateTime.seconds * 1000;
                            }
                        });

                        let finalAgeRange = 'No Chat Data';
                        if (isTrusted) {
                            finalAgeRange = 'Trusted Friend';
                        } else if (chatStatus) {
                            finalAgeRange = refineAgeWithAccountAge(
                                chatStatus.estimatedAge,
                                accountCreated,
                            );
                        }

                        return {
                            id: friendId,
                            username: profile.names.username,
                            displayName: profile.names.displayName,
                            combinedName: profile.names.combinedName,
                            isVerified: profile.isVerified,
                            isDeleted: profile.isDeleted,
                            isTrusted: isTrusted,
                            estimatedAgeRange: finalAgeRange,
                            mutualFriends: mutualFriends,
                            accountCreated: accountCreated,
                            friendsSince: friendsSince,
                            lastOnline: presence?.lastOnline || null,
                            lastLocation: presence?.lastLocation || null,
                        };
                    },
                );
                fullFriendsList = fullFriendsList.concat(enrichedFriends);
            }
        }

        const storageResult = await new Promise((resolve) =>
            chrome.storage.local.get([FRIENDS_DATA_KEY], resolve),
        );
        const allUsersFriendsData = storageResult[FRIENDS_DATA_KEY] || {};
        allUsersFriendsData[userId] = {
            friendsList: fullFriendsList,
            lastChecked: Date.now(),
            lastOnlineChecked: Date.now(),
        };
        await new Promise((resolve) =>
            chrome.storage.local.set(
                { [FRIENDS_DATA_KEY]: allUsersFriendsData },
                resolve,
            ),
        );

        return fullFriendsList;
    } catch (error) {
        console.error('RoValra: Failed to update friends list', error);
        return [];
    }
}

async function updateOnlineStatusOnly(userId, currentFriendsList) {
    try {
        const onlineData = await fetchFriendsOnlineStatus(userId);
        const onlineMap = new Map();
        onlineData.forEach((item) => {
            onlineMap.set(item.id, {
                lastOnline: item.userPresence?.lastOnline,
                lastLocation: item.userPresence?.placeId,
            });
        });

        const updatedList = currentFriendsList.map((friend) => {
            const presence = onlineMap.get(friend.id);
            if (!presence) return friend;
            return {
                ...friend,
                lastOnline: presence.lastOnline,
                lastLocation: presence.lastLocation,
            };
        });

        const storageResult = await new Promise((resolve) =>
            chrome.storage.local.get([FRIENDS_DATA_KEY], resolve),
        );
        const allUsersFriendsData = storageResult[FRIENDS_DATA_KEY] || {};
        allUsersFriendsData[userId] = {
            ...allUsersFriendsData[userId],
            friendsList: updatedList,
            lastOnlineChecked: Date.now(),
        };

        await new Promise((resolve) =>
            chrome.storage.local.set(
                { [FRIENDS_DATA_KEY]: allUsersFriendsData },
                resolve,
            ),
        );

        return updatedList;
    } catch (error) {
        return currentFriendsList;
    }
}

export async function getFriendsList() {
    const userId = await getAuthenticatedUserId();
    if (!userId) return [];

    const result = await new Promise((resolve) =>
        chrome.storage.local.get([FRIENDS_DATA_KEY], resolve),
    );

    const allUsersFriendsData = result[FRIENDS_DATA_KEY] || {};
    const currentUserData = allUsersFriendsData[userId];

    if (!currentUserData?.friendsList) {
        return await updateFriendsList(userId);
    }

    const now = Date.now();
    const needsFullRefresh =
        now - currentUserData.lastChecked > FRIENDS_CACHE_DURATION;
    const needsOnlineRefresh =
        now - (currentUserData.lastOnlineChecked || 0) >
        ONLINE_STATUS_CACHE_DURATION;

    if (needsFullRefresh) {
        return await updateFriendsList(userId);
    } else if (needsOnlineRefresh) {
        return await updateOnlineStatusOnly(
            userId,
            currentUserData.friendsList,
        );
    }

    return currentUserData.friendsList;
}

export function initFriendsListTracking() {
    getFriendsList();
}
