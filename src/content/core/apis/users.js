import { callRobloxApiJson } from '../api.js';

export const RANKING_STRATEGIES = {
    TC_INFO_BOOST: 'tc_info_boost',
    PROFILE_INFO_BOOST: 'profile_info_boost',
    NO_INFO_BOOST: '',
};

export const INSIGHT_CASES = {
    MUTUAL_FRIENDS: 1,
    FRIEND_REQUEST_ORIGIN: 2,
    OFFLINE_FREQUENTS: 3,
    FRIENDSHIP_AGE: 4,
    AGE_VERIFIED: 5,
    ACCOUNT_CREATION_DATE: 6,
    ACCOUNT_LOCATION: 7,
    PLAYED_TOGETHER: 8,
};

export async function getMultiProfileInsights(
    userIds,
    rankingStrategy = RANKING_STRATEGIES.TC_INFO_BOOST,
) {
    try {
        return await callRobloxApiJson({
            subdomain: 'apis',
            endpoint: '/profile-insights-api/v1/multiProfileInsights',
            method: 'POST',
            useBackground: true,
            body: {
                userIds: userIds.map((id) => id.toString()),
                rankingStrategy,
            },
        });
    } catch (error) {
        return null;
    }
}

export async function getUserInsights(
    userId,
    rankingStrategy = RANKING_STRATEGIES.TC_INFO_BOOST,
) {
    const data = await getMultiProfileInsights([userId], rankingStrategy);
    return data?.userInsights?.[0]?.profileInsights || [];
}

export async function getMutualFriends(userId) {
    const insights = await getUserInsights(
        userId,
        RANKING_STRATEGIES.TC_INFO_BOOST,
    );
    const item = insights.find(
        (i) => i.insightCase === INSIGHT_CASES.MUTUAL_FRIENDS,
    );
    return item?.mutualFriendInsight?.mutualFriends || {};
}

export async function getFriendshipAge(userId) {
    const insights = await getUserInsights(
        userId,
        RANKING_STRATEGIES.TC_INFO_BOOST,
    );
    const item = insights.find(
        (i) => i.insightCase === INSIGHT_CASES.FRIENDSHIP_AGE,
    );
    const seconds = item?.friendshipAgeInsight?.friendsSinceDateTime?.seconds;
    return seconds ? seconds * 1000 : null;
}
export async function getOfflineFrequents(userId) {
    const insights = await getUserInsights(
        userId,
        RANKING_STRATEGIES.NO_INFO_BOOST,
    );
    const item = insights.find(
        (i) => i.insightCase === INSIGHT_CASES.OFFLINE_FREQUENTS,
    );
    if (!item?.offlineFrequentsInsight) return null;
    return {
        havePlayedTogether: item.playedTogetherInsight.havePlayedTogether,
    };
}

export async function getFriendRequestOrigin(userId) {
    const insights = await getUserInsights(
        userId,
        RANKING_STRATEGIES.TC_INFO_BOOST,
    );
    const item = insights.find(
        (i) => i.insightCase === INSIGHT_CASES.FRIEND_REQUEST_ORIGIN,
    );
    return item?.friendRequestOriginInsight?.friendRequestOriginSource || null;
}

export async function getAccountCreationDate(userId) {
    const insights = await getUserInsights(
        userId,
        RANKING_STRATEGIES.TC_INFO_BOOST,
    );
    const item = insights.find(
        (i) => i.insightCase === INSIGHT_CASES.ACCOUNT_CREATION_DATE,
    );
    const seconds =
        item?.accountCreationDateInsight?.accountCreatedDateTime?.seconds;
    return seconds ? seconds * 1000 : null;
}

export async function getVerifiedAgeLabel(userId) {
    const insights = await getUserInsights(
        userId,
        RANKING_STRATEGIES.TC_INFO_BOOST,
    );
    const item = insights.find(
        (i) => i.insightCase === INSIGHT_CASES.AGE_VERIFIED,
    );
    return item?.userAgeVerifiedInsight?.verifiedAgeBandLabel || null;
}

export async function getAccountLocation(userId) {
    const insights = await getUserInsights(
        userId,
        RANKING_STRATEGIES.TC_INFO_BOOST,
    );
    const item = insights.find(
        (i) => i.insightCase === INSIGHT_CASES.ACCOUNT_LOCATION,
    );
    return item?.accountLocationInsight || null;
}

export async function getPlayedTogetherInsight(userId) {
    const insights = await getUserInsights(
        userId,
        RANKING_STRATEGIES.PROFILE_INFO_BOOST,
    );
    const item = insights.find(
        (i) => i.insightCase === INSIGHT_CASES.PLAYED_TOGETHER,
    );
    if (!item?.playedTogetherInsight) return null;
    return {
        havePlayedTogether: item.playedTogetherInsight.havePlayedTogether,
        mostFrequentUniverseId:
            item.playedTogetherInsight.mostFrequentUniverseId,
    };
}

export async function getUserProfileData(userIds) {
    try {
        return await callRobloxApiJson({
            subdomain: 'apis',
            endpoint: '/user-profile-api/v1/user/profiles/get-profiles',
            method: 'POST',
            useBackground: true,
            body: {
                userIds: userIds.map((id) => id.toString()),
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

export async function getProfilePlatformData(options) {
    const {
        profileId,
        profileType = PROFILE_TYPES.USER,
        components = [],
        includeComponentOrdering = true,
    } = options;

    try {
        return await callRobloxApiJson({
            subdomain: 'apis',
            endpoint: '/profile-platform-api/v1/profiles/get',
            method: 'POST',
            useBackground: true,
            body: {
                profileId: profileId.toString(),
                profileType,
                components,
                includeComponentOrdering,
            },
        });
    } catch (error) {
        console.error('RoValra: Failed to fetch platform profile data', error);
        return null;
    }
}

export const PROFILE_TYPES = {
    USER: 'User',
    COMMUNITY: 'Community',
    CONTACT: 'Contact',
};

export const PROFILE_COMPONENTS = {
    USER_PROFILE_HEADER: 'UserProfileHeader',
    SOCIAL_LINKS: 'SocialLinks',
    ABOUT: 'About',
    CURRENTLY_WEARING: 'CurrentlyWearing',
    ACTIONS: 'Actions',
    PROFILE_BACKGROUND: 'ProfileBackground',
    VIEW_FULL_PROFILE: 'ViewFullProfile',
    STORE: 'Store',
    EXPERIENCES: 'Experiences',
    PROFILE_COMPLETION: 'ProfileCompletion',
    CURRENTLY_PLAYING: 'CurrentlyPlaying',
    FRIENDS: 'Friends',
    COLLECTIONS: 'Collections',
    COMMUNITIES: 'Communities',
    FAVORITE_EXPERIENCES: 'FavoriteExperiences',
    ROBLOX_BADGES: 'RobloxBadges',
    PLAYER_BADGES: 'PlayerBadges',
    QUICK_LINKS: 'QuickLinks',
    INVENTORY: 'Inventory',
    CONTACT_PROFILE_HEADER: 'ContactProfileHeader',
    CONTACT_DESCRIPTION: 'ContactDescription',
    COMMUNITY_PROFILE_HEADER: 'CommunityProfileHeader',
    COMMUNITY_TABS: 'CommunityTabs',
    EXPERIENCE_SERVERS: 'ExperienceServers',
    ANNOUNCEMENTS: 'Announcements',
    FORUMS_DISCOVERY: 'ForumsDiscovery',
    EVENTS: 'Events',
    MEMBERS: 'Members',
    SHOUT: 'Shout',
    VIDEOS: 'Videos',
    COVER_PHOTO: 'CoverPhoto',
    COMMUNITY_LOCKED: 'CommunityLocked',
};

export const PROFILE_ACTIONS = {
    VIEW_ABOUT: 'ViewAbout',
    FOLLOW: 'Follow',
    VIEW_FULL_PROFILE: 'ViewFullProfile',
    CHAT: 'Chat',
    ACCEPT_OFF_NETWORK_FRIEND_REQUEST: 'AcceptOffNetworkFriendRequest',
    ADD_FRIEND_FROM_CONTACTS: 'AddFriendFromContacts',
    EDIT_ALIAS: 'EditAlias',
    UNFRIEND: 'Unfriend',
    JOIN_COMMUNITY: 'JoinCommunity',
    VIEW_PLATFORM_PROFILE: 'ViewPlatformProfile',
    IGNORE_FRIEND_REQUEST: 'IgnoreFriendRequest',
    PENDING_TRUSTED_CONNECTION: 'PendingTrustedConnection',
    ADD_FRIEND: 'AddFriend',
    EDIT_AVATAR: 'EditAvatar',
    CANNOT_ADD_FRIEND: 'CannotAddFriend',
    ACCEPT_FRIEND_REQUEST: 'AcceptFriendRequest',
    MAKE_PRIMARY_COMMUNITY: 'MakePrimaryCommunity',
    ADD_FRIEND_FROM_CONTACTS_SENT: 'AddFriendFromContactsSent',
    COPY_LINK: 'CopyLink',
    EDIT_LOOK: 'EditLook',
    EDIT_PROFILE: 'EditProfile',
    BLOCK: 'Block',
    VIEW_COMMUNITY: 'ViewCommunity',
    REMOVE_TRUSTED_CONNECTION: 'RemoveTrustedConnection',
    JOIN_EXPERIENCE: 'JoinExperience',
    PENDING_INCOMING_TRUSTED_CONNECTION: 'PendingIncomingTrustedConnection',
    UNFOLLOW: 'Unfollow',
    REPORT: 'Report',
    UNBLOCK: 'Unblock',
    LEAVE_COMMUNITY: 'LeaveCommunity',
    ADD_TRUSTED_CONNECTION: 'AddTrustedConnection',
    ADD_TRUSTED_CONNECTION_VIA_LINK: 'AddTrustedConnectionViaLink',
    SHARE_PROFILE: 'ShareProfile',
    REMOVE_PRIMARY_COMMUNITY: 'RemovePrimaryCommunity',
    PENDING_FRIEND_REQUEST: 'PendingFriendRequest',
    QR_CODE: 'QrCode',
    CANCEL_JOIN_COMMUNITY_REQUEST: 'CancelJoinCommunityRequest',
    ADD_INCOMING_TRUSTED_CONNECTION: 'AddIncomingTrustedConnection',
    CONFIGURE_COMMUNITY: 'ConfigureCommunity',
    CLAIM_COMMUNITY_OWNERSHIP: 'ClaimCommunityOwnership',
    CHANGE_COMMUNITY_OWNER: 'ChangeCommunityOwner',
    VIEW_INVENTORY: 'ViewInventory',
    VIEW_FAVORITES: 'ViewFavorites',
    TRADE_ITEMS: 'TradeItems',
    IMPERSONATE_USER: 'ImpersonateUser',
};

export default {
    getMultiProfileInsights,
    getUserInsights,
    getMutualFriends,
    getFriendshipAge,
    getFriendRequestOrigin,
    getAccountCreationDate,
    getVerifiedAgeLabel,
    getAccountLocation,
    getPlayedTogetherInsight,
    getUserProfileData,
    getProfilePlatformData,
    getOfflineFrequents,
    INSIGHT_CASES,
    RANKING_STRATEGIES,
    PROFILE_TYPES,
    PROFILE_COMPONENTS,
    PROFILE_ACTIONS,
};
