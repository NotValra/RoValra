import { callRobloxApi } from '../api.js';
import { getUserLocation } from '../utils/location.js';
import { launchGame } from '../utils/launcher.js';
import { showReviewPopup } from '../review/review.js';
import { hideLoadingOverlay } from '../ui/startModal/gamelaunchmodal.js';
import { REGIONS, serverIpMap } from '../regions.js';

export const FINDER_CONFIG = {
    logScores: true,
    maxServersPerRegion: 10,
    checkGameActivity: true,
    maxManualScanPages: 3,
};

export const dataPromise = Promise.resolve();

export function getRegionName(regionId) {
    if (regionId === 'AUTO') return 'Automatic';
    const region = REGIONS[regionId];
    if (region) {
        const parts = [];
        if (region.city) parts.push(region.city);
        if (region.region) parts.push(region.region);

        let country = region.country;
        if (country === 'US') country = 'USA';
        if (country) parts.push(country);

        return parts.join(', ');
    }
    return String(regionId);
}

export function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) *
            Math.cos(deg2rad(lat2)) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function deg2rad(deg) {
    return deg * (Math.PI / 180);
}

export function getRegionDistance(code1, code2) {
    const r1 = REGIONS[code1];
    const r2 = REGIONS[code2];
    if (!r1 || !r2) return Infinity;
    return getDistance(r1.latitude, r1.longitude, r2.latitude, r2.longitude);
}

export async function findClosestServerViaApi(
    placeId,
    originRegionId,
    userRequestedStop,
) {
    const origin = REGIONS[originRegionId];
    if (!origin) return null;

    const regionsWithDistance = Object.entries(REGIONS)
        .filter(([id, r]) => id !== originRegionId && id !== 'AUTO')
        .map(([id, region]) => ({
            id,
            region,
            distance: getDistance(
                origin.latitude,
                origin.longitude,
                region.latitude,
                region.longitude,
            ),
        }));

    regionsWithDistance.sort((a, b) => a.distance - b.distance);

    const regionsToCheck = regionsWithDistance.slice(0, 10);

    for (const { id, region } of regionsToCheck) {
        if (userRequestedStop) return null;

        let url = `/v1/servers/region?place_id=${placeId}`;
        if (region.country)
            url += `&country=${encodeURIComponent(region.country)}`;
        if (region.city) url += `&city=${encodeURIComponent(region.city)}`;
        url += '&cursor=0';

        try {
            const response = await callRobloxApi({
                isRovalraApi: true,
                endpoint: url,
            });
            if (response.ok) {
                const data = await response.json();
                if (data.servers && data.servers.length > 0) {
                    for (const server of data.servers) {
                        if (userRequestedStop) return null;

                        try {
                            const joinRes = await callRobloxApi({
                                subdomain: 'gamejoin',
                                endpoint: '/v1/join-game-instance',
                                method: 'POST',
                                body: {
                                    placeId: parseInt(placeId, 10),
                                    gameId: server.server_id,
                                    gameJoinAttemptId: crypto.randomUUID(),
                                },
                            });

                            if (joinRes.ok) {
                                const joinInfo = await joinRes.json();
                                if (joinInfo.joinScript) {
                                    return {
                                        server: {
                                            id: server.server_id,
                                            playing: server.playing,
                                            maxPlayers:
                                                server.max_players ||
                                                server.maxPlayers,
                                        },
                                        regionCode: id,
                                    };
                                }
                            }
                        } catch (e) {}
                    }
                }
            }
        } catch (e) {
            console.warn('Fallback API search failed for region', region.id, e);
        }
    }
    return null;
}

export async function fetchServerRegion(server, placeId) {
    try {
        const res = await callRobloxApi({
            subdomain: 'gamejoin',
            endpoint: '/v1/join-game-instance',
            method: 'POST',
            body: {
                placeId: parseInt(placeId, 10),
                gameId: server.id,
                gameJoinAttemptId: crypto.randomUUID(),
            },
        });

        if (!res.ok) return null;
        const info = await res.json();
        if (!info.joinScript) return null;

        const dataCenterId = info.joinScript.DataCenterId;
        if (dataCenterId && serverIpMap[dataCenterId]) {
            return serverIpMap[dataCenterId];
        }
    } catch (error) {}
    return null;
}

export async function findServerViaRovalraApi(
    placeId,
    universeId,
    preferredRegionId,
    failedRegionNames,
    joinedServerIds,
    userRequestedStopCheck,
) {
    try {
        if (FINDER_CONFIG.checkGameActivity && universeId) {
            const isActive = await checkGameActivity(universeId);
            if (!isActive) return { joined: false };
        }

        const rankedRegions = await getRankedRegions(
            placeId,
            preferredRegionId,
        );
        if (rankedRegions.length === 0) return { joined: false };

        let apiSucceededAtLeastOnce = false;

        for (const { region } of rankedRegions) {
            if (userRequestedStopCheck && userRequestedStopCheck())
                return { status: 'STOPPED' };

            const servers = await fetchServersForRegion(placeId, region);
            if (servers && servers.length > 0) {
                apiSucceededAtLeastOnce = true;

                const unjoinedServers = servers.filter(
                    (s) => !joinedServerIds.has(s.server_id || s.id),
                );

                if (unjoinedServers.length > 0) {
                    if (!preferredRegionId || region.id === preferredRegionId) {
                        if (
                            await attemptJoinServers(
                                placeId,
                                unjoinedServers,
                                joinedServerIds,
                                userRequestedStopCheck,
                            )
                        ) {
                            return { status: 'JOINED' };
                        }
                    } else {
                        return {
                            status: 'FOUND_FALLBACK',
                            servers: unjoinedServers,
                            regionCode: region.id,
                        };
                    }
                } else {
                    failedRegionNames.add(getRegionName(region.id));
                }
            } else {
                failedRegionNames.add(getRegionName(region.id));
            }
        }

        const bestPossibleRegion = rankedRegions[0].region;

        const manualCandidate = await findBestManualServer(
            placeId,
            rankedRegions,
            Infinity,
            joinedServerIds,
            userRequestedStopCheck,
        );

        if (manualCandidate) {
            return {
                status: 'FOUND_FALLBACK',
                servers: [manualCandidate.server],
                regionCode: manualCandidate.region.id,
            };
        }

        if (apiSucceededAtLeastOnce) {
            return { status: 'NO_SERVERS' };
        }

        return { status: 'API_ERROR' };
    } catch (error) {
        console.error('Rovalra Search Error', error);
        return { status: 'API_ERROR' };
    }
}

async function checkGameActivity(universeId) {
    try {
        const response = await callRobloxApi({
            subdomain: 'games',
            endpoint: `/v1/games?universeIds=${universeId}`,
        });
        if (response.ok) {
            const data = await response.json();
            if (
                !data.data ||
                data.data.length === 0 ||
                data.data[0].playing === 0
            ) {
                return false;
            }
        }
    } catch (e) {}
    return true;
}

async function getRankedRegions(placeId, preferredRegionId) {
    let ranked = [];
    const locationData = await getUserLocation(placeId);

    const userLat = locationData?.userLat;
    const userLon = locationData?.userLon;

    ranked = Object.entries(REGIONS).map(([id, region]) => {
        let distance = Infinity;
        if (userLat != null && userLon != null && region.latitude != null) {
            distance = getDistance(
                userLat,
                userLon,
                region.latitude,
                region.longitude,
            );
        }
        let score = Math.floor(distance / 10) + 1;

        if (preferredRegionId && id === preferredRegionId) {
            score = 0;
            distance = 0;
        }
        return { region: { ...region, id }, score, distance };
    });

    ranked.sort((a, b) => a.score - b.score);

    if (preferredRegionId) {
        const idx = ranked.findIndex((r) => r.region.id === preferredRegionId);
        if (idx > 0) {
            const [item] = ranked.splice(idx, 1);
            ranked.unshift(item);
        }
    }

    if (FINDER_CONFIG.logScores) {
        console.log(`[RoValra] Region Scores for Place ${placeId}:`);
        ranked.forEach((r) => {
            console.log(
                ` - ${getRegionName(r.region.id)}: Score ${r.score} (${Math.round(r.distance)} km)`,
            );
        });
    }

    return ranked;
}

async function fetchServersForRegion(placeId, region) {
    let url = `/v1/servers/region?place_id=${placeId}`;
    if (region.country) url += `&country=${encodeURIComponent(region.country)}`;
    if (region.city) url += `&city=${encodeURIComponent(region.city)}`;
    url += '&cursor=0';

    try {
        const response = await callRobloxApi({
            isRovalraApi: true,
            endpoint: url,
        });
        if (!response.ok) return null;
        const data = await response.json();
        return data.servers || [];
    } catch (e) {
        return null;
    }
}

async function findBestManualServer(
    placeId,
    rankedRegions,
    beatDistance,
    joinedServerIds,
    stopCheck,
) {
    let cursor = null;
    const regionDistanceMap = {};
    rankedRegions.forEach((r) => {
        regionDistanceMap[r.region.id] = r.distance;
    });

    for (let i = 0; i < FINDER_CONFIG.maxManualScanPages; i++) {
        if (stopCheck && stopCheck()) return null;

        const url = `/v1/games/${placeId}/servers/Public?excludeFullGames=true&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
        try {
            const response = await callRobloxApi({
                subdomain: 'games',
                endpoint: url,
            });
            if (!response.ok) break;

            const data = await response.json();
            const servers = data.data || [];
            if (servers.length === 0) break;

            const chunkSize = 5;
            for (let j = 0; j < servers.length; j += chunkSize) {
                if (stopCheck && stopCheck()) return null;
                const chunk = servers.slice(j, j + chunkSize);

                await Promise.all(
                    chunk.map(async (server) => {
                        if (joinedServerIds.has(server.id)) return;
                        const regionId = await fetchServerRegion(
                            server,
                            placeId,
                        );
                        if (
                            regionId &&
                            regionDistanceMap[regionId] !== undefined
                        ) {
                            server._tempDistance = regionDistanceMap[regionId];
                            server._tempRegionId = regionId;
                        }
                    }),
                );
            }

            const bestInPage = servers
                .filter((s) => s._tempDistance !== undefined)
                .sort((a, b) => a._tempDistance - b._tempDistance)[0];

            if (bestInPage && bestInPage._tempDistance < beatDistance) {
                return {
                    server: bestInPage,
                    region: REGIONS[bestInPage._tempRegionId],
                    distance: bestInPage._tempDistance,
                    source: 'MANUAL',
                };
            }

            cursor = data.nextPageCursor;
            if (!cursor) break;
        } catch (e) {
            break;
        }
    }
    return null;
}

async function attemptJoinServers(
    placeId,
    servers,
    joinedServerIds,
    stopCheck,
) {
    let attempts = 0;

    for (const server of servers) {
        if (attempts >= FINDER_CONFIG.maxServersPerRegion) break;
        const serverId = server.server_id || server.id;
        if (joinedServerIds.has(serverId)) continue;
        if (stopCheck && stopCheck()) return false;

        attempts++;
        try {
            const res = await callRobloxApi({
                subdomain: 'gamejoin',
                endpoint: '/v1/join-game-instance',
                method: 'POST',
                body: {
                    placeId: parseInt(placeId, 10),
                    gameId: serverId,
                    gameJoinAttemptId: crypto.randomUUID(),
                },
            });
            if (res.ok) {
                const info = await res.json();
                if (info.joinScript) {
                    joinedServerIds.add(serverId);
                    hideLoadingOverlay(true);
                    launchGame(placeId, serverId);
                    callRobloxApi({
                        subdomain: 'games',
                        endpoint: `/v1/games/${placeId}/servers/Public?limit=100`,
                    }).catch(() => {
                        /*fire and forget*/
                    });
                    showReviewPopup('region_filters');
                    return true;
                }
            }
        } catch (e) {}
    }
    return false;
}
