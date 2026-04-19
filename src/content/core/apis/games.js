import { callRobloxApiJson } from '../api.js';
import * as CacheHandler from '../storage/cacheHandler.js';
import { PLAYABILITY_STATUS_STRING_TO_CODE } from '../games/playabilityStatus.js';

const CACHE_SECTION = 'experience_sdui_props';
const CLOUD_CACHE_SECTION = 'cloud_universe_details';

export const REASON_PROHIBITED_TYPES = Object.keys(
    PLAYABILITY_STATUS_STRING_TO_CODE,
);

export async function getExperienceSduiProps(universeId) {
    const cacheKey = String(universeId);

    const cached = await CacheHandler.get(CACHE_SECTION, cacheKey, 'session');
    if (cached) {
        return cached;
    }

    const data = await callRobloxApiJson({
        subdomain: 'apis',
        endpoint: `/experience-details-api/v1/get-experience-details?universeId=${universeId}`,
        method: 'GET',
    });

    const props = data?.sdui?.feed?.props;
    if (!props) return null;

    await CacheHandler.set(CACHE_SECTION, cacheKey, props, 'session');
    return props;
}

export async function getExperienceDetails(universeId) {
    const props = await getExperienceSduiProps(universeId);
    return props?.experienceDetails;
}

export async function getFeedItems(universeId) {
    const props = await getExperienceSduiProps(universeId);
    return props?.feedItems;
}

export async function getVisibilityVariables(universeId) {
    const props = await getExperienceSduiProps(universeId);
    return props?.visibilityVariables;
}

export async function getGameDetails(universeId) {
    const details = await getExperienceDetails(universeId);
    return details?.gameDetails;
}

export async function getVotingDetails(universeId) {
    const details = await getExperienceDetails(universeId);
    if (!details) return null;
    return {
        userVote: details.userVote,
        totalUpVotes: details.totalUpVotes,
        totalDownVotes: details.totalDownVotes,
    };
}

export async function getAgeRecommendations(universeId) {
    const details = await getExperienceDetails(universeId);
    return details?.ageRecommendations;
}

export async function getSocialDetails(universeId) {
    const details = await getExperienceDetails(universeId);
    if (!details) return null;
    return {
        followingStatus: details.followingStatus,
        socialLinks: details.socialLinks,
        connectionsPlayed: details.connectionsPlayed,
    };
}

export async function getBadges(universeId) {
    const details = await getExperienceDetails(universeId);
    return details?.badges;
}

export async function getGamePasses(universeId) {
    const details = await getExperienceDetails(universeId);
    return details?.gamePassProducts;
}

export async function getMediaGallery(universeId) {
    const details = await getExperienceDetails(universeId);
    return details?.mediaGallery;
}

export async function getRelatedGames(universeId) {
    const details = await getExperienceDetails(universeId);
    return details?.relatedGames;
}

export async function getExperienceStatus(universeId) {
    const details = await getExperienceDetails(universeId);
    if (!details) return null;
    return {
        isFavorited: details.isFavorited,
        favoriteCount: details.favoriteCount,
        isVoiceSupported: details.isVoiceSupported,
        isCameraSupported: details.isCameraSupported,
        textFilterProfanity: details.textFilterProfanity,
    };
}

export async function getCloudUniverseDetails(universeId) {
    const cacheKey = String(universeId);

    const cached = await CacheHandler.get(
        CLOUD_CACHE_SECTION,
        cacheKey,
        'session',
    );
    if (cached) {
        return cached;
    }

    const data = await callRobloxApiJson({
        subdomain: 'apis',
        endpoint: `/cloud/v2/universes/${universeId}`,
        method: 'GET',
        useBackground: true,
        useApiKey: true,
    });

    if (!data) return null;

    await CacheHandler.set(CLOUD_CACHE_SECTION, cacheKey, data, 'session');
    return data;
}

export async function getCloudSocialLinks(universeId) {
    const data = await getCloudUniverseDetails(universeId);
    if (!data) return null;
    return {
        twitter: data.twitterSocialLink,
        youtube: data.youtubeSocialLink,
        discord: data.discordSocialLink,
    };
}

export async function getCloudPlatformSupport(universeId) {
    const data = await getCloudUniverseDetails(universeId);
    if (!data) return null;
    return {
        desktop: data.desktopEnabled,
        mobile: data.mobileEnabled,
        tablet: data.tabletEnabled,
        console: data.consoleEnabled,
        vr: data.vrEnabled,
    };
}

export async function getCloudRootPlaceId(universeId) {
    const data = await getCloudUniverseDetails(universeId);
    if (!data?.rootPlace) return null;
    return data.rootPlace.split('/').pop();
}

export async function getPlaceDetails(placeId) {
    const cacheKey = String(placeId);

    const cached = await CacheHandler.get('place_details', cacheKey, 'session');
    if (cached) {
        return cached;
    }

    try {
        const data = await callRobloxApiJson({
            subdomain: 'games',
            endpoint: `/v1/games/multiget-place-details?placeIds=${placeId}`,
            method: 'GET',
        });

        const placeData = data?.[0];
        if (!placeData) return null;

        await CacheHandler.set('place_details', cacheKey, placeData, 'session');
        return placeData;
    } catch (error) {
        console.error(
            `RoValra: Failed to fetch place details for placeId ${placeId}`,
            error,
        );
        return null;
    }
}

export default {
    getExperienceSduiProps,
    getVisibilityVariables,
    getVotingDetails,
    getExperienceDetails,
    getFeedItems,
    getGameDetails,
    getSocialDetails,
    getBadges,
    getMediaGallery,
    getGamePasses,
    getAgeRecommendations,
    getRelatedGames,
    getExperienceStatus,
    getCloudUniverseDetails,
    getCloudSocialLinks,
    getCloudPlatformSupport,
    getCloudRootPlaceId,
    getPlaceDetails,
    REASON_PROHIBITED_TYPES,
};
