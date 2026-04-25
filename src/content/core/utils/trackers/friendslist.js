// This script fetches a users friends list and stores information about it,
// like last online, mutual friends, estimated age range (idk if that will be used), trusted friends, last location, friends since and some other lesser important stuff.
import { callRobloxApiJson } from '../../api';
import { getAuthenticatedUserId } from '../../user';
import { ts } from '../../locale/i18n.js';
import {
    getMultiProfileInsights,
    getUserProfileData,
    INSIGHT_CASES,
    RANKING_STRATEGIES,
} from '../../apis/users.js';

const FRIENDS_DATA_KEY = 'rovalra_friends_data';
const FRIENDS_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes for heavy data
const ONLINE_STATUS_CACHE_DURATION = 1 * 60 * 1000; // 1 minute for online status

export function getFriendRequestOriginText(originId) {
    const fromText = ts('friendsSince.originFrom');
    switch (originId) {
        // Thanks to RoSeal
        case 1: // PLAYER_SEARCH
            return `${fromText} ${ts('friendsSince.originSearch')}`;
        case 2: // IN_GAME
            return `${fromText} ${ts('friendsSince.originInGame')}`;
        case 3: // PROFILE
            return `${fromText} ${ts('friendsSince.originProfile')}`;
        case 4: // QQ_CONTACT_IMPORTER
            return `${fromText} ${ts('friendsSince.originQQContacts')}`;
        case 5: // WECHAT_CONTACT_IMPORTER
            return `${fromText} ${ts('friendsSince.originWeChatContacts')}`;
        case 6: // QR_CODE
            return `${fromText} ${ts('friendsSince.originQrCode')}`;
        case 7: // PROFILE_SHARE
            return `${fromText} ${ts('friendsSince.originProfileShare')}`;
        case 8: // PHONE_CONTACT_IMPORTER
            return `${fromText} ${ts('friendsSince.originPhoneContacts')}`;
        case 9: // Friend Token.
            return `${fromText} ${ts('friendsSince.originFriendLink')}`;
        case 10: // FRIEND_RECOMMENDATIONS
            return `${fromText} ${ts('friendsSince.originPeopleYouMayKnow')}`;
        default:
            return `${fromText} ${ts('friendsSince.originUnknown')}`;
    }
}

function convertVerifiedAgeLabel(label) {
    switch (label) {
        case 'Label.AgeGroupUnder9':
            return '<9';
        case 'Label.AgeGroup9To12':
            return '9-12';
        case 'Label.AgeGroup13To15':
            return '13-15';
        case 'Label.AgeGroup16To17':
            return '16-17';
        case 'Label.AgeGroup18To20':
            return '18-20';
        case 'Label.AgeGroupOver21':
            return '21+';
        default:
            return null;
    }
}

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
            useBackground: true,
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
            useBackground: true,
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
            useBackground: true,
        });
    } catch (error) {
        return null;
    }
}

async function fetchAllTrustedFriends(userId) {
    const trustedIds = new Set();
    let cursor = null;
    try {
        do {
            let endpoint = `/v1/users/${userId}/friends/find?findFriendsType=FindTrustedFriends`;
            if (cursor) endpoint += `&cursor=${encodeURIComponent(cursor)}`;
            const response = await callRobloxApiJson({
                subdomain: 'friends',
                endpoint,
                useBackground: true,
            });
            if (!response || !response.PageItems) break;
            response.PageItems.forEach((item) => trustedIds.add(item.id));
            cursor = response.NextCursor;
        } while (cursor);
    } catch (error) {
        console.error('RoValra: Failed to fetch all trusted friends', error);
    }
    return trustedIds;
}

async function fetchFriendsOnlineStatus(userId) {
    try {
        const response = await callRobloxApiJson({
            subdomain: 'friends',
            endpoint: `/v1/users/${userId}/friends/online`,
            useBackground: true,
        });
        return response?.data || [];
    } catch (error) {
        console.error('RoValra: Failed to fetch online status', error);
        return [];
    }
}

async function fetchDeletedAccountData(userId) {
    try {
        return await callRobloxApiJson({
            subdomain: 'users',
            endpoint: `/v1/users/${userId}`,
            useBackground: true,
        });
    } catch (error) {
        console.error('RoValra: Failed to fetch deleted account data', error);
        return null;
    }
}

export async function updateFriendsList(userId) {
    let allFriends = [];
    let friendsCursor = null;

    const storageResult = await new Promise((resolve) =>
        chrome.storage.local.get([FRIENDS_DATA_KEY], resolve),
    );
    const allUsersFriendsData = storageResult[FRIENDS_DATA_KEY] || {};
    const existingMap = new Map(
        (allUsersFriendsData[userId]?.friendsList || []).map((f) => [f.id, f]),
    );

    try {
        const [conversations, ageData, onlineData, allTrustedFriendsSet] =
            await Promise.all([
                fetchAllConversations(),
                fetchUserAgeGroup(),
                fetchFriendsOnlineStatus(userId),
                fetchAllTrustedFriends(userId),
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
            const [profileData, insightsData, playedTogetherData] =
                await Promise.all([
                    getUserProfileData(batchIds),
                    getMultiProfileInsights(
                        batchIds,
                        RANKING_STRATEGIES.TC_INFO_BOOST,
                    ),
                    getMultiProfileInsights(
                        batchIds,
                        RANKING_STRATEGIES.PROFILE_INFO_BOOST,
                    ),
                ]);

            const insightMap = new Map();
            if (insightsData?.userInsights) {
                insightsData.userInsights.forEach((insight) => {
                    insightMap.set(insight.targetUser, insight.profileInsights);
                });
            }

            const playedTogetherMap = new Map();
            if (playedTogetherData?.userInsights) {
                playedTogetherData.userInsights.forEach((insight) => {
                    playedTogetherMap.set(
                        insight.targetUser,
                        insight.profileInsights,
                    );
                });
            }

            if (profileData?.profileDetails) {
                const deletedUserIds = profileData.profileDetails
                    .filter((profile) => profile.isDeleted)
                    .map((profile) => profile.userId);

                const deletedAccountsMap = new Map();
                for (const userId of deletedUserIds) {
                    const accountData = await fetchDeletedAccountData(userId);
                    if (accountData) {
                        deletedAccountsMap.set(userId, accountData);
                    }
                }

                const enrichedFriends = profileData.profileDetails.map(
                    (profile) => {
                        const friendId = profile.userId;
                        const isTrusted = allTrustedFriendsSet.has(friendId);
                        const chatStatus = chatAnalysisMap.get(friendId);
                        const userInsights = insightMap.get(friendId) || [];
                        const playedTogetherInsights =
                            playedTogetherMap.get(friendId) || [];
                        const presence = onlineMap.get(friendId);
                        const existingFriend = existingMap.get(friendId);

                        let mutualFriends = [];
                        let accountCreated = null;
                        let friendsSince = null;
                        let verifiedAgeRange = null;
                        let friendRequestOrigin = null;

                        userInsights.forEach((item) => {
                            if (
                                item.insightCase ===
                                    INSIGHT_CASES.MUTUAL_FRIENDS &&
                                item.mutualFriendInsight
                            ) {
                                mutualFriends = Object.keys(
                                    item.mutualFriendInsight.mutualFriends,
                                );
                            }
                            if (
                                item.insightCase ===
                                    INSIGHT_CASES.FRIENDSHIP_AGE &&
                                item.friendshipAgeInsight
                            ) {
                                friendsSince =
                                    item.friendshipAgeInsight
                                        .friendsSinceDateTime.seconds * 1000;
                            }
                            if (
                                item.insightCase ===
                                    INSIGHT_CASES.ACCOUNT_CREATION_DATE &&
                                item.accountCreationDateInsight
                            ) {
                                accountCreated =
                                    item.accountCreationDateInsight
                                        .accountCreatedDateTime.seconds * 1000;
                            }
                            if (
                                item.insightCase ===
                                    INSIGHT_CASES.AGE_VERIFIED &&
                                item.userAgeVerifiedInsight
                            ) {
                                verifiedAgeRange = convertVerifiedAgeLabel(
                                    item.userAgeVerifiedInsight
                                        .verifiedAgeBandLabel,
                                );
                            }
                            if (
                                item.insightCase ===
                                    INSIGHT_CASES.FRIEND_REQUEST_ORIGIN &&
                                item.friendRequestOriginInsight
                            ) {
                                friendRequestOrigin =
                                    item.friendRequestOriginInsight
                                        .friendRequestOriginSource;
                            }
                        });

                        let havePlayedTogether =
                            existingFriend?.havePlayedTogether || false;
                        let mostFrequentUniverseId =
                            existingFriend?.mostFrequentUniverseId || null;

                        playedTogetherInsights.forEach((item) => {
                            if (
                                item.insightCase ===
                                    INSIGHT_CASES.PLAYED_TOGETHER &&
                                item.playedTogetherInsight
                            ) {
                                const newUniverseId =
                                    item.playedTogetherInsight
                                        .mostFrequentUniverseId;
                                const newHavePlayedTogether =
                                    item.playedTogetherInsight
                                        .havePlayedTogether;

                                if (
                                    mostFrequentUniverseId === null ||
                                    (newUniverseId !== null &&
                                        newUniverseId !==
                                            mostFrequentUniverseId)
                                ) {
                                    mostFrequentUniverseId = newUniverseId;
                                    havePlayedTogether = newHavePlayedTogether;
                                }
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

                        let username = profile.names.username;
                        let displayName = profile.names.displayName;
                        let combinedName = profile.names.combinedName;

                        if (
                            profile.isDeleted &&
                            deletedAccountsMap.has(friendId)
                        ) {
                            const accountData =
                                deletedAccountsMap.get(friendId);
                            username = accountData.name;
                            displayName = accountData.displayName;
                            combinedName = `${displayName} (@${username})`;
                        }

                        return {
                            id: friendId,
                            username: username,
                            displayName: displayName,
                            combinedName: combinedName,
                            isVerified: profile.isVerified,
                            isDeleted: profile.isDeleted,
                            isTrusted: isTrusted,
                            estimatedAgeRange: finalAgeRange,
                            verifiedAgeRange: verifiedAgeRange,
                            mutualFriends: mutualFriends,
                            accountCreated: accountCreated,
                            friendsSince: friendsSince,
                            friendRequestOrigin: friendRequestOrigin,
                            havePlayedTogether: havePlayedTogether,
                            mostFrequentUniverseId: mostFrequentUniverseId,
                            lastOnline:
                                presence?.lastOnline ||
                                existingFriend?.lastOnline ||
                                null,
                            lastLocation:
                                presence?.lastLocation ||
                                existingFriend?.lastLocation ||
                                null,
                        };
                    },
                );
                fullFriendsList = fullFriendsList.concat(enrichedFriends);
            }
        }

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

            if (presence) {
                return {
                    ...friend,
                    lastOnline: presence.lastOnline || friend.lastOnline,
                    lastLocation: presence.lastLocation || friend.lastLocation,
                };
            }
            return friend;
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

export async function getCachedFriendsList() {
    const userId = await getAuthenticatedUserId();
    if (!userId) return [];

    const result = await new Promise((resolve) =>
        chrome.storage.local.get([FRIENDS_DATA_KEY], resolve),
    );

    const allUsersFriendsData = result[FRIENDS_DATA_KEY] || {};
    const currentUserData = allUsersFriendsData[userId];

    return currentUserData?.friendsList || [];
}

let onlineStatusInterval = null;

export function initFriendsListTracking() {
    getFriendsList();

    if (!onlineStatusInterval) {
        onlineStatusInterval = setInterval(async () => {
            const userId = await getAuthenticatedUserId();
            if (!userId) return;

            const result = await new Promise((resolve) =>
                chrome.storage.local.get([FRIENDS_DATA_KEY], resolve),
            );

            const allUsersFriendsData = result[FRIENDS_DATA_KEY] || {};
            const currentUserData = allUsersFriendsData[userId];

            if (currentUserData?.friendsList) {
                const now = Date.now();
                const needsOnlineRefresh =
                    now - (currentUserData.lastOnlineChecked || 0) >
                    ONLINE_STATUS_CACHE_DURATION;

                if (needsOnlineRefresh) {
                    await updateOnlineStatusOnly(
                        userId,
                        currentUserData.friendsList,
                    );
                }
            }
        }, ONLINE_STATUS_CACHE_DURATION);
    }
}
