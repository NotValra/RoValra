import { showReviewPopup } from './review/review.js';
import { callRobloxApi, resetGameJoinErrorCount } from './api.js';
import { launchGame } from './utils/launcher.js';
import { getUserLocation } from './utils/location.js';
import DOMPurify from 'dompurify';
import {
    showLoadingOverlay,
    hideLoadingOverlay,
    updateLoadingOverlayText,
    showLoadingOverlayResult,
} from './ui/startModal/gamelaunchmodal.js';
import * as ClosestServer from './regionFinder/ClosestServer.js';
import {
    getRegionData,
    REGIONS,
    getFullRegionName,
    getStateCodeFromRegion,
    loadDatacenterMap,
} from './regions.js';
import { ts } from './locale/i18n.js';

export { getStateCodeFromRegion };

const PREFERRED_REGION_STORAGE_KEY = 'robloxPreferredRegion';
const MAX_SERVER_PAGES = Infinity;

let userRequestedStop = false;
let isCurrentlyFetchingData = false;
let serverLocations = {};

const joinedServerIds = new Set();

document.addEventListener('rovalra-gamejoin-critical-error', (e) => {
    if (isCurrentlyFetchingData) {
        userRequestedStop = true;
        const detailMsg = e.detail?.errorMessage || ts('common.unknown');

        let displayMessage = ts('preferredRegion.criticalError', { detailMsg });

        if (detailMsg.includes('404') || detailMsg.includes('410')) {
            displayMessage = ts('preferredRegion.criticalErrorApiMoved', {
                detailMsg,
            });
        }

        showLoadingOverlayResult(displayMessage, {
            text: ts('common.close'),
            onClick: () => hideLoadingOverlay(true),
        });
    }
});

async function isServerActive(placeId, gameId) {
    if (!gameId) return false;
    try {
        const response = await callRobloxApi({
            subdomain: 'gamejoin',
            endpoint: '/v2/join-game-instance',
            method: 'POST',
            body: {
                placeId: parseInt(placeId, 10),
                gameId: gameId,
                isTeleport: false,
            },
        });
        if (!response.ok) return false;
        const data = await response.json();
        return data.status === 2;
    } catch (e) {
        return false;
    }
}

async function fetchServerDetailsWrapper(server, placeId) {
    if (serverLocations[server.id]) return;
    if (userRequestedStop) return;

    const regionCode = await ClosestServer.fetchServerRegion(server, placeId);
    await getRegionData();
    if (userRequestedStop) return;
    if (regionCode) {
        serverLocations[server.id] = { c: regionCode };
    }
}

export async function performJoinAction(
    placeId,
    universeId,
    preferredRegionCode = null,
    onCancel = null,
) {
    if (isCurrentlyFetchingData) return;
    userRequestedStop = false;
    isCurrentlyFetchingData = true;
    serverLocations = {};
    resetGameJoinErrorCount();

    showLoadingOverlay(
        () => {
            userRequestedStop = true;
            hideLoadingOverlay(true);
            if (onCancel) onCancel();
        },
        null,
        true,
    );

    try {
        let joined = false;
        const failedRegionNames = new Set();
        let sortedRegionCodes = [];

        let bestServerFoundSoFar = null;
        let bestServerRegionCode = null;
        let bestServerTier = Infinity;

        let bestRecycledServer = null;
        let bestRecycledRegionCode = null;
        let bestRecycledTier = Infinity;
        let totalUniqueServersSeen = 0;

        const settings = await chrome.storage.local.get({
            preferredRegionUseRobloxLatencyv1: true,
            preferredRegionLocalSearchEnabled: false,
        });
        const forceLocalSearch =
            settings.preferredRegionLocalSearchEnabled === true;
        const useRobloxLatencyForAutomatic =
            !forceLocalSearch &&
            !preferredRegionCode &&
            settings.preferredRegionUseRobloxLatencyv1;

        await ClosestServer.dataPromise;

        updateLoadingOverlayText(ts('preferredRegion.detectingLocation'));
        await getRegionData();
        const locationData = await getUserLocation(placeId);

        let allRegionsByDistance = [];
        if (locationData) {
            const { userLat, userLon } = locationData;
            const regionsWithDistance = Object.keys(REGIONS).map(
                (regionCode) => {
                    const region = REGIONS[regionCode];
                    const distance = ClosestServer.getDistance(
                        userLat,
                        userLon,
                        region.latitude,
                        region.longitude,
                    );
                    return { regionCode, distance };
                },
            );
            regionsWithDistance.sort((a, b) => a.distance - b.distance);
            allRegionsByDistance = regionsWithDistance.map((r) => r.regionCode);
        } else {
            allRegionsByDistance = Object.keys(REGIONS);
        }

        if (preferredRegionCode) {
            const filtered = allRegionsByDistance.filter(
                (r) => r !== preferredRegionCode,
            );
            sortedRegionCodes = [preferredRegionCode, ...filtered];
        } else {
            sortedRegionCodes = allRegionsByDistance;
        }

        const targetRegionName = preferredRegionCode
            ? getFullRegionName(preferredRegionCode)
            : ts('preferredRegion.closestRegion');
        const shortTargetName = targetRegionName.split(',')[0];

        if (preferredRegionCode && REGIONS[preferredRegionCode]?.inactive) {
            showLoadingOverlayResult(
                ts('preferredRegion.inactiveRegion', { region: shortTargetName }),
                { text: ts('common.close'), onClick: () => hideLoadingOverlay(true) },
            );
            isCurrentlyFetchingData = false;
            return;
        }

        let runManualScan = true;
        let manualScanReason = forceLocalSearch
            ? ts('preferredRegion.scanningLocally', { region: shortTargetName })
            : ts('preferredRegion.regionApiUnavailable', {
                  region: shortTargetName,
              });

        if (!userRequestedStop) {
            let rovalraResult = null;

            if (useRobloxLatencyForAutomatic) {
                updateLoadingOverlayText(
                    ts('preferredRegion.findingLowestLatency'),
                );
                const latencyCandidate =
                    await ClosestServer.findServerViaRobloxLatencyApi(
                        placeId,
                        joinedServerIds,
                        () => userRequestedStop,
                    );

                if (latencyCandidate) {
                    bestServerFoundSoFar = latencyCandidate;
                    runManualScan = false;
                }
            }

            if (
                runManualScan &&
                !useRobloxLatencyForAutomatic &&
                !forceLocalSearch
            ) {
                updateLoadingOverlayText(
                    ts('preferredRegion.searchingInRegion', {
                        region: shortTargetName,
                    }),
                );
                rovalraResult = await ClosestServer.findServerViaRovalraApi(
                    placeId,
                    universeId,
                    preferredRegionCode,
                    failedRegionNames,
                    joinedServerIds,
                    () => userRequestedStop,
                );
            }

            if (rovalraResult?.status === 'JOINED') {
                joined = true;
                runManualScan = false;
            } else if (rovalraResult?.status === 'FOUND_FALLBACK') {
                const candidate = rovalraResult.servers[0];
                const cId = candidate.server_id || candidate.id;
                if (cId && (await isServerActive(placeId, cId))) {
                    bestServerFoundSoFar = candidate;
                    bestServerFoundSoFar.id = cId;
                    bestServerRegionCode = rovalraResult.regionCode;
                    runManualScan = false;
                } else {
                    runManualScan = true;
                    manualScanReason = ts('preferredRegion.fallbackInactive', {
                        region: shortTargetName,
                    });
                }
            } else if (rovalraResult?.status === 'NO_SERVERS') {
                runManualScan = true;
                manualScanReason = ts('preferredRegion.noServersApi', {
                    region: shortTargetName,
                });
            }
        }

        if (runManualScan && !joined && !userRequestedStop) {
            await loadDatacenterMap();
            let effectiveMaxPages = MAX_SERVER_PAGES;
            if (
                preferredRegionCode &&
                REGIONS[preferredRegionCode]?.loadbalancing
            ) {
                effectiveMaxPages = 1;
                manualScanReason = ts('preferredRegion.loadBalancing', {
                    region: shortTargetName,
                });
            }

            updateLoadingOverlayText(manualScanReason);

            let nextCursor = null;
            let pageCount = 0;

            while (
                pageCount < effectiveMaxPages &&
                !userRequestedStop &&
                !joined
            ) {
                pageCount++;
                try {
                    const response = await callRobloxApi({
                        subdomain: 'games',
                        endpoint: `/v1/games/${placeId}/servers/Public?excludeFullGames=true&limit=100${nextCursor ? `&cursor=${encodeURIComponent(nextCursor)}` : ''}`,
                    });

                    if (!response.ok) {
                        await new Promise((r) => setTimeout(r, 1000));
                        continue;
                    }

                    const pageData = await response.json();
                    const serversOnPage = pageData.data || [];

                    if (serversOnPage.length === 0 && !pageData.nextPageCursor)
                        break;

                    if (serversOnPage.length > 0) {
                        await Promise.all(
                            serversOnPage.map((s) =>
                                fetchServerDetailsWrapper(s, placeId),
                            ),
                        );

                        let improvedThisRound = false;

                        for (const server of serversOnPage) {
                            const regionCode = serverLocations[server.id]?.c;

                            if (
                                regionCode &&
                                server.playing < server.maxPlayers
                            ) {
                                totalUniqueServersSeen++;

                                let thisServerTier =
                                    sortedRegionCodes.indexOf(regionCode);
                                if (thisServerTier === -1)
                                    thisServerTier = 9999;

                                const isPreviouslyJoined = joinedServerIds.has(
                                    server.id,
                                );

                                if (!isPreviouslyJoined) {
                                    if (thisServerTier < bestServerTier) {
                                        bestServerFoundSoFar = server;
                                        bestServerRegionCode = regionCode;
                                        bestServerTier = thisServerTier;
                                        improvedThisRound = true;
                                    }
                                } else {
                                    if (thisServerTier < bestRecycledTier) {
                                        bestRecycledServer = server;
                                        bestRecycledRegionCode = regionCode;
                                        bestRecycledTier = thisServerTier;
                                    }
                                }
                            }
                        }

                        if (improvedThisRound) {
                            const bestName =
                                getFullRegionName(bestServerRegionCode);

                            if (bestServerTier === 0) {
                                updateLoadingOverlayText(
                                    ts('preferredRegion.foundJoining', {
                                        region: bestName,
                                    }),
                                );
                            } else {
                                updateLoadingOverlayText(
                                    ts('preferredRegion.foundContinuing', {
                                        region: bestName,
                                        targetRegion: shortTargetName,
                                    }),
                                );
                            }
                        }

                        if (bestServerTier === 0) {
                            const bestName =
                                getFullRegionName(bestServerRegionCode);

                            updateLoadingOverlayText(
                                ts('preferredRegion.foundVerifying', {
                                    region: bestName,
                                }),
                            );
                            if (
                                await isServerActive(
                                    placeId,
                                    bestServerFoundSoFar.id,
                                )
                            ) {
                                hideLoadingOverlay(true);
                                joinedServerIds.add(bestServerFoundSoFar.id);
                                launchGame(placeId, bestServerFoundSoFar.id);
                                callRobloxApi({
                                    subdomain: 'games',
                                    endpoint: `/v1/games/${placeId}/servers/Public?limit=100`,
                                }).catch(() => {});
                                showReviewPopup('region_filters');
                                joined = true;
                                break;
                            } else {
                                joinedServerIds.add(bestServerFoundSoFar.id);
                                bestServerFoundSoFar = null;
                                bestServerTier = Infinity;
                            }
                        }

                        if (
                            !preferredRegionCode &&
                            bestServerTier <= 2 &&
                            pageCount > 5
                        ) {
                            updateLoadingOverlayText(
                                ts('preferredRegion.verifyingStatus'),
                            );
                            if (
                                await isServerActive(
                                    placeId,
                                    bestServerFoundSoFar.id,
                                )
                            ) {
                                hideLoadingOverlay(true);
                                joinedServerIds.add(bestServerFoundSoFar.id);
                                launchGame(placeId, bestServerFoundSoFar.id);
                                callRobloxApi({
                                    subdomain: 'games',
                                    endpoint: `/v1/games/${placeId}/servers/Public?limit=100`,
                                }).catch(() => {});
                                showReviewPopup('region_filters');
                                joined = true;
                                break;
                            } else {
                                joinedServerIds.add(bestServerFoundSoFar.id);
                                bestServerFoundSoFar = null;
                                bestServerTier = Infinity;
                            }
                        }
                    }

                    if (!pageData.nextPageCursor) break;
                    nextCursor = pageData.nextPageCursor;
                } catch (e) {
                    console.error('Error scanning page:', e);
                }
            }
        }

        if (!userRequestedStop && !joined) {
            if (!bestServerFoundSoFar && bestRecycledServer) {
                if (totalUniqueServersSeen < 40 || !bestServerFoundSoFar) {
                    bestServerFoundSoFar = bestRecycledServer;
                    bestServerRegionCode = bestRecycledRegionCode;
                }
            }

            if (
                preferredRegionCode &&
                !forceLocalSearch &&
                !userRequestedStop
            ) {
                updateLoadingOverlayText(
                    ts('preferredRegion.searchingClosest', {
                        region: shortTargetName,
                    }),
                );
                const apiFallback = await ClosestServer.findClosestServerViaApi(
                    placeId,
                    preferredRegionCode,
                    userRequestedStop,
                );

                if (apiFallback) {
                    let useApi = false;
                    if (!bestServerFoundSoFar) {
                        useApi = true;
                    } else {
                        const localDist = ClosestServer.getRegionDistance(
                            preferredRegionCode,
                            bestServerRegionCode,
                        );
                        const apiDist = ClosestServer.getRegionDistance(
                            preferredRegionCode,
                            apiFallback.regionCode,
                        );
                        if (apiDist < localDist) {
                            useApi = true;
                        }
                    }

                    if (useApi) {
                        bestServerFoundSoFar = apiFallback.server;
                        bestServerRegionCode = apiFallback.regionCode;
                    }
                }
            }

            if (totalUniqueServersSeen === 0 && !bestServerFoundSoFar) {
                hideLoadingOverlay(true);
                launchGame(placeId);
                callRobloxApi({
                    subdomain: 'games',
                    endpoint: `/v1/games/${placeId}/servers/Public?limit=100`,
                }).catch(() => {
                    /*fire and forget*/
                });
                showReviewPopup('region_filters');
            } else if (bestServerFoundSoFar) {
                const serverId =
                    bestServerFoundSoFar.id || bestServerFoundSoFar.server_id;
                if (!preferredRegionCode) {
                    updateLoadingOverlayText(ts('preferredRegion.verifyingStatus'));
                    if (serverId && (await isServerActive(placeId, serverId))) {
                        hideLoadingOverlay(true);
                        joinedServerIds.add(serverId);
                        launchGame(placeId, serverId);
                        callRobloxApi({
                            subdomain: 'games',
                            endpoint: `/v1/games/${placeId}/servers/Public?limit=100`,
                        }).catch(() => {});
                        showReviewPopup('region_filters');
                    } else {
                        hideLoadingOverlay(true);
                        launchGame(placeId);
                        callRobloxApi({
                            subdomain: 'games',
                            endpoint: `/v1/games/${placeId}/servers/Public?limit=100`,
                        }).catch(() => {});
                        showReviewPopup('region_filters');
                    }
                } else {
                    const foundRegionName =
                        getFullRegionName(bestServerRegionCode);
                    const isPreferredRegionMatch =
                        bestServerRegionCode === preferredRegionCode;

                    let message = ts('preferredRegion.noServersRunning', {
                        region: shortTargetName,
                    });
                    if (REGIONS[preferredRegionCode]?.loadbalancing) {
                        message = ts('preferredRegion.loadBalancing', {
                            region: shortTargetName,
                        });
                    }

                    updateLoadingOverlayText(ts('preferredRegion.verifyingStatus'));
                    if (serverId && (await isServerActive(placeId, serverId))) {
                        if (isPreferredRegionMatch) {
                            hideLoadingOverlay(true);
                            joinedServerIds.add(serverId);
                            launchGame(placeId, serverId);
                            callRobloxApi({
                                subdomain: 'games',
                                endpoint: `/v1/games/${placeId}/servers/Public?limit=100`,
                            }).catch(() => {});
                            showReviewPopup('region_filters');
                        } else {
                            showLoadingOverlayResult(message, {
                                text: ts('preferredRegion.joinRegion', {
                                    region: foundRegionName,
                                }),
                                onClick: async () => {
                                    hideLoadingOverlay(true);
                                    joinedServerIds.add(serverId);
                                    launchGame(placeId, serverId);
                                    callRobloxApi({
                                        subdomain: 'games',
                                        endpoint: `/v1/games/${placeId}/servers/Public?limit=100`,
                                    }).catch(() => {});
                                    showReviewPopup('region_filters');
                                },
                            });
                        }
                    } else {
                        hideLoadingOverlay(true);
                        launchGame(placeId);
                        callRobloxApi({
                            subdomain: 'games',
                            endpoint: `/v1/games/${placeId}/servers/Public?limit=100`,
                        }).catch(() => {});
                        showReviewPopup('region_filters');
                    }
                }
            } else {
                hideLoadingOverlay(true);
                launchGame(placeId);
                callRobloxApi({
                    subdomain: 'games',
                    endpoint: `/v1/games/${placeId}/servers/Public?limit=100`,
                }).catch(() => {});
                showReviewPopup('region_filters');
            }
        }
    } catch (error) {
        showLoadingOverlayResult(
            error.message || ts('preferredRegion.couldNotFindServers'),
        );
    } finally {
        isCurrentlyFetchingData = false;
    }
}

export async function getSavedPreferredRegion() {
    const data = await getRegionData();
    const result = await chrome.storage.local.get(PREFERRED_REGION_STORAGE_KEY);
    const region = result[PREFERRED_REGION_STORAGE_KEY];
    const regionMap = data.regions;

    if (region && region !== 'AUTO' && !regionMap[region]) {
        try {
            await chrome.storage.local.set({
                [PREFERRED_REGION_STORAGE_KEY]: 'AUTO',
            });
        } catch (e) {
            console.error(
                'RoValra: Failed to reset invalid preferred region.',
                e,
            );
        }
        return 'AUTO';
    }

    return region || 'AUTO';
}
