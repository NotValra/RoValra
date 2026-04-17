import { showReviewPopup } from './review/review.js';
import { callRobloxApi } from './api.js';
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
import { getRegionData, REGIONS } from './regions.js';
import { getStateCodeFromRegion } from './regions.js';

export { getStateCodeFromRegion };

const PREFERRED_REGION_STORAGE_KEY = 'robloxPreferredRegion';
const MAX_SERVER_PAGES = Infinity;

let userRequestedStop = false;
let isCurrentlyFetchingData = false;
let serverLocations = {};

const joinedServerIds = new Set();

async function isServerActive(placeId, gameId) {
    try {
        const response = await callRobloxApi({
            subdomain: 'gamejoin',
            endpoint: '/v1/join-game-instance',
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

        await ClosestServer.dataPromise;

        updateLoadingOverlayText('Detecting your location...');
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
            ? ClosestServer.getRegionName(preferredRegionCode)
            : 'closest region';
        const shortTargetName = targetRegionName.split(',')[0];

        if (preferredRegionCode && REGIONS[preferredRegionCode]?.inactive) {
            showLoadingOverlayResult(
                DOMPurify.sanitize(
                    `${shortTargetName} is no longer used as a server location by Roblox.`,
                ),
                { text: 'Close', onClick: () => hideLoadingOverlay(true) },
            );
            isCurrentlyFetchingData = false;
            return;
        }

        let runManualScan = true;
        let manualScanReason = `Region API unavailable. Scanning for ${shortTargetName}...`;

        if (!userRequestedStop) {
            updateLoadingOverlayText(
                DOMPurify.sanitize(`Searching in ${shortTargetName}...`),
            );
            const rovalraResult = await ClosestServer.findServerViaRovalraApi(
                placeId,
                universeId,
                preferredRegionCode,
                failedRegionNames,
                joinedServerIds,
                () => userRequestedStop,
            );

            if (rovalraResult.status === 'JOINED') {
                joined = true;
                runManualScan = false;
            } else if (rovalraResult.status === 'FOUND_FALLBACK') {
                bestServerFoundSoFar = rovalraResult.servers[0];
                bestServerRegionCode = rovalraResult.regionCode;
                runManualScan = false;
            } else if (rovalraResult.status === 'NO_SERVERS') {
                runManualScan = true;
                manualScanReason = `No servers found in ${shortTargetName} via API. Scanning locally...`;
            }
        }

        if (runManualScan && !joined && !userRequestedStop) {
            let effectiveMaxPages = MAX_SERVER_PAGES;
            if (
                preferredRegionCode &&
                REGIONS[preferredRegionCode]?.loadbalancing
            ) {
                effectiveMaxPages = 1;
                manualScanReason = `${shortTargetName} is used for load balancing and is likely only active under heavy load. Scanning...`;
            }

            updateLoadingOverlayText(DOMPurify.sanitize(manualScanReason));

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
                            let bestName = bestServerRegionCode;
                            try {
                                bestName =
                                    ClosestServer.getRegionName(
                                        bestServerRegionCode,
                                    );
                            } catch (e) {}

                            if (bestServerTier === 0) {
                                updateLoadingOverlayText(
                                    DOMPurify.sanitize(
                                        `Found ${bestName}! Joining...`,
                                    ),
                                );
                            } else {
                                updateLoadingOverlayText(
                                    DOMPurify.sanitize(
                                        `Found: ${bestName}. Continuing search for ${shortTargetName}...`,
                                    ),
                                );
                            }
                        }

                        if (bestServerTier === 0) {
                            updateLoadingOverlayText(
                                DOMPurify.sanitize(
                                    `Found ${bestName}! Verifying...`,
                                ),
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
                                'Verifying server status...',
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

            if (preferredRegionCode && !userRequestedStop) {
                updateLoadingOverlayText(
                    DOMPurify.sanitize(
                        `Searching for closest region to ${shortTargetName}...`,
                    ),
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
                if (!runManualScan) {
                    showLoadingOverlayResult(
                        DOMPurify.sanitize(
                            `No servers found in ${shortTargetName}.`,
                        ),
                        {
                            text: 'Close',
                            onClick: () => hideLoadingOverlay(true),
                        },
                    );
                } else {
                    hideLoadingOverlay(true);
                    launchGame(placeId);
                    callRobloxApi({
                        subdomain: 'games',
                        endpoint: `/v1/games/${placeId}/servers/Public?limit=100`,
                    }).catch(() => {
                        /*fire and forget*/
                    });
                    showReviewPopup('region_filters');
                }
            } else if (bestServerFoundSoFar) {
                if (!preferredRegionCode) {
                    updateLoadingOverlayText('Verifying server status...');
                    if (
                        await isServerActive(placeId, bestServerFoundSoFar.id)
                    ) {
                        hideLoadingOverlay(true);
                        joinedServerIds.add(bestServerFoundSoFar.id);
                        launchGame(placeId, bestServerFoundSoFar.id);
                        callRobloxApi({
                            subdomain: 'games',
                            endpoint: `/v1/games/${placeId}/servers/Public?limit=100`,
                        }).catch(() => {});
                        showReviewPopup('region_filters');
                    } else {
                        showLoadingOverlayResult(
                            'No suitable active servers found.',
                            {
                                text: 'Close',
                                onClick: () => hideLoadingOverlay(true),
                            },
                        );
                    }
                } else {
                    let foundRegionName = bestServerRegionCode;
                    try {
                        foundRegionName =
                            ClosestServer.getRegionName(bestServerRegionCode);
                    } catch (e) {}

                    let message = `No ${shortTargetName} servers running.`;
                    if (REGIONS[preferredRegionCode]?.loadbalancing) {
                        message = `${shortTargetName} is used for load balancing and is likely only active under heavy load.`;
                    }

                    updateLoadingOverlayText('Verifying server status...');
                    if (
                        await isServerActive(placeId, bestServerFoundSoFar.id)
                    ) {
                        showLoadingOverlayResult(DOMPurify.sanitize(message), {
                            text: DOMPurify.sanitize(`Join ${foundRegionName}`),
                            onClick: async () => {
                                hideLoadingOverlay(true);
                                joinedServerIds.add(bestServerFoundSoFar.id);
                                launchGame(placeId, bestServerFoundSoFar.id);
                                callRobloxApi({
                                    subdomain: 'games',
                                    endpoint: `/v1/games/${placeId}/servers/Public?limit=100`,
                                }).catch(() => {});
                                showReviewPopup('region_filters');
                            },
                        });
                    } else {
                        showLoadingOverlayResult(
                            'No suitable active servers found.',
                            {
                                text: 'Close',
                                onClick: () => hideLoadingOverlay(true),
                            },
                        );
                    }
                }
            } else {
                showLoadingOverlayResult('No suitable servers found.', {
                    text: 'Close',
                    onClick: () => hideLoadingOverlay(true),
                });
            }
        }
    } catch (error) {
        showLoadingOverlayResult(
            error.message || 'Could not find any servers.',
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
