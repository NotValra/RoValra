import { callRobloxApiJson } from '../../api.js';
import { fetchThumbnails } from '../../thumbnail/thumbnails.js';
import {
    loadDatacenterMap,
    getRegionData,
    serverIpMap,
} from '../../regions.js';
import { fetchServerRegion } from '../../apis/serverApi.js';
import { ts } from '../../locale/i18n.js';

const JOIN_INFO_MAX_RETRIES = 5;
const JOIN_INFO_RETRY_DELAY_MS = 2000;
const NON_ROOT_PLACE_STATUS = 12;

export function getLaunchType(launch) {
    const params = launch.params;
    const request = launch.request;
    const isRequestGame =
        request === 'RequestGame' || request === 'RequestGameJob';

    return {
        request,
        isGenericJoin:
            isRequestGame && !params.has('gameId') && !params.has('accessCode'),
        isPrivateServer: request === 'RequestPrivateGame',
        isFollowingUser: request === 'RequestFollowUser',
        serverId: params.get('gameId'),
        accessCode: params.get('accessCode'),
        linkCode: params.get('linkCode'),
        userId: launch.userId,
    };
}

export async function fetchPlaceDetails(placeId) {
    const fallback = {
        name: ts('revertLogo.robloxExperience'),
        iconUrl: null,
    };
    if (!placeId) return fallback;

    const numericPlaceId = parseInt(placeId, 10);

    const [details, thumbnails] = await Promise.all([
        callRobloxApiJson({
            subdomain: 'games',
            endpoint: `/v1/games/multiget-place-details?placeIds=${numericPlaceId}`,
        }).catch(() => null),
        fetchThumbnails(
            [{ id: numericPlaceId }],
            'PlaceIcon',
            '150x150',
            false,
        ).catch(() => null),
    ]);

    if (!details) return fallback;

    const thumbnail = thumbnails?.get(numericPlaceId);
    return {
        name: details[0]?.name || ts('revertLogo.unknownExperience'),
        iconUrl: thumbnail?.state === 'Completed' ? thumbnail.imageUrl : null,
    };
}

async function requestJoinInfo(placeId, launchType) {
    const numericPlaceId = parseInt(placeId, 10);

    if (launchType.isGenericJoin) {
        return callRobloxApiJson({
            subdomain: 'gamejoin',
            endpoint: '/v2/join-game',
            method: 'POST',
            body: {
                gameJoinAttemptId: crypto.randomUUID(),
                placeId: numericPlaceId,
            },
        });
    }
    if (launchType.isPrivateServer) {
        return fetchServerRegion(placeId, null, {
            isPrivate: true,
            accessCode: launchType.accessCode,
            linkCode: launchType.linkCode,
        });
    }
    if (launchType.isFollowingUser) {
        return callRobloxApiJson({
            subdomain: 'gamejoin',
            endpoint: '/v2/play-with-user',
            method: 'POST',
            body: { userIdToFollow: parseInt(launchType.userId, 10) },
        });
    }
    if (launchType.serverId) {
        return fetchServerRegion(placeId, launchType.serverId);
    }
    return null;
}

export async function fetchJoinInfo({
    placeId,
    launchType,
    isActive = () => true,
}) {
    for (let attempt = 1; attempt <= JOIN_INFO_MAX_RETRIES; attempt++) {
        if (!isActive()) break;

        try {
            const data = await requestJoinInfo(placeId, launchType);

            if (data && data.status !== 0) {
                if (
                    data.status === NON_ROOT_PLACE_STATUS ||
                    data.message?.includes('non-root place')
                ) {
                    return {
                        joinResponse: null,
                        blockedMessage:
                            data.message ||
                            ts('revertLogo.nonRootPlaceRestrictions'),
                    };
                }
                if (data.joinScript) return { joinResponse: data };
            }
        } catch (e) {
            console.error('RoValra: Join info attempt failed', e);
        }

        if (attempt < JOIN_INFO_MAX_RETRIES) {
            await new Promise((r) => setTimeout(r, JOIN_INFO_RETRY_DELAY_MS));
        }
    }

    return { joinResponse: null };
}

async function ensureDatacenterData() {
    try {
        if (Object.keys(serverIpMap).length > 0) return;
        await loadDatacenterMap();
        await getRegionData();
    } catch (error) {
        console.warn('RoValra: Failed to load datacenter map', error);
    }
}

export async function resolveServerRegion(joinResponse) {
    let regionCode = joinResponse?.country || null;
    let regionName = joinResponse?.region || null;
    if (regionCode && regionName) return { regionCode, regionName };

    const dataCenterId = joinResponse?.joinScript?.DataCenterId;
    if (!dataCenterId) return { regionCode, regionName };

    await ensureDatacenterData();
    const location = serverIpMap[dataCenterId];
    if (location) {
        regionCode = location.country;
        regionName = location.region
            ? `${location.city}, ${location.region}`
            : location.city;
    }
    return { regionCode, regionName };
}

export async function fetchPrivateServerOwner(ownerId) {
    if (!ownerId) return null;
    try {
        const [users, thumbnails] = await Promise.all([
            callRobloxApiJson({
                subdomain: 'users',
                endpoint: '/v1/users',
                method: 'POST',
                body: { userIds: [ownerId] },
            }),
            fetchThumbnails(
                [{ id: ownerId }],
                'AvatarHeadshot',
                '48x48',
                false,
            ).catch(() => null),
        ]);
        const user = users?.data?.[0];
        if (!user) return null;
        return {
            id: user.id,
            displayName: user.displayName,
            thumbnailUrl: thumbnails?.get(ownerId)?.imageUrl || null,
        };
    } catch {
        return null;
    }
}
