

import { showReviewPopup } from './review/review.js';
import { callRobloxApi } from './api.js';
import { launchGame } from './utils/launcher.js';
import { getUserLocation } from './utils/location.js'; 
import { getFullRegionName } from './regions.js';
import DOMPurify from 'dompurify';
import { showLoadingOverlay, hideLoadingOverlay, updateLoadingOverlayText, showLoadingOverlayResult } from './ui/startModal/gamelaunchmodal.js';

const PREFERRED_REGION_STORAGE_KEY = 'robloxPreferredRegion';
const MAX_SERVER_PAGES = Infinity; 

const stateMap = {
    'Alabama':'AL','Alaska':'AK','Arizona':'AZ','Arkansas':'AR','California':'CA','Colorado':'CO','Connecticut':'CT','Delaware':'DE','Florida':'FL','Georgia':'GA','Hawaii':'HI','Idaho':'ID','Illinois':'IL','Indiana':'IN','Iowa':'IA','Kansas':'KS','Kentucky':'KY','Louisiana':'LA','Maine':'ME','Maryland':'MD','Massachusetts':'MA','Michigan':'MI','Minnesota':'MN','Mississippi':'MS','Missouri':'MO','Montana':'MT','Nebraska':'NE','Nevada':'NV','New Hampshire':'NH','New Jersey':'NJ','New Mexico':'NM','New York':'NY','North Carolina':'NC','North Dakota':'ND','Ohio':'OH','Oklahoma':'OK','Oregon':'OR','Pennsylvania':'PA','Rhode Island':'RI','South Carolina':'SC','South Dakota':'SD','Tennessee':'TN','Texas':'TX','Utah':'UT','Vermont':'VT','Virginia':'VA','Washington':'WA','West Virginia':'WV','Wisconsin':'WI','Wyoming':'WY'
};

let REGIONS = {};
let serverIpMap = {};
let userRequestedStop = false;
let isCurrentlyFetchingData = false;
let serverLocations = {};

const joinedServerIds = new Set(); 

const dataPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
        resolve(); 
    }, 15000);

    chrome.storage.local.get(['cachedRegions', 'rovalraDatacenters'], (result) => {
        clearTimeout(timeout);
        if (result.cachedRegions) REGIONS = result.cachedRegions;
        else REGIONS = {};

        if (result.rovalraDatacenters) {
            const newIpMap = {};
            if (Array.isArray(result.rovalraDatacenters)) {
                for (const entry of result.rovalraDatacenters) {
                    if (entry.location && entry.dataCenterIds) {
                        for (const id of entry.dataCenterIds) newIpMap[id] = entry.location;
                    }
                }
            }
            serverIpMap = newIpMap;
        } else {
            serverIpMap = {};
        }
        resolve();
    });
});

export function getStateCodeFromRegion(regionName) {
    return regionName ? (stateMap[regionName] || regionName.substring(0, 2).toUpperCase()) : '??';
}

function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function deg2rad(deg) {
    return deg * (Math.PI / 180);
}

function getRegionDistance(code1, code2) {
    const r1 = REGIONS[code1];
    const r2 = REGIONS[code2];
    if (!r1 || !r2) return Infinity;
    return getDistance(r1.latitude, r1.longitude, r2.latitude, r2.longitude);
}

async function findClosestServerViaApi(placeId, originRegionCode) {
    if (!REGIONS[originRegionCode]) return null;

    const allRegions = Object.keys(REGIONS).filter(r => r !== originRegionCode);
    const regionsWithDistance = allRegions.map(regionCode => ({
        regionCode,
        distance: getRegionDistance(originRegionCode, regionCode)
    }));
    
    regionsWithDistance.sort((a, b) => a.distance - b.distance);
    
    const regionsToCheck = regionsWithDistance.slice(0, 10);

    for (const { regionCode } of regionsToCheck) {
        if (userRequestedStop) return null;
        
        const regionData = REGIONS[regionCode];
        let url = `/v1/servers/region?place_id=${placeId}`;
        if (regionData.country) url += `&country=${encodeURIComponent(regionData.country)}`;
        if (regionData.city) url += `&city=${encodeURIComponent(regionData.city)}`;
        url += '&cursor=0';

        try {
            const response = await callRobloxApi({ isRovalraApi: true, endpoint: url });
            if (response.ok) {
                const data = await response.json();
                if (data.servers && data.servers.length > 0) {
                    const server = data.servers[0];
                    return {
                        server: { 
                            id: server.server_id, 
                            playing: server.playing, 
                            maxPlayers: server.max_players || server.maxPlayers 
                        },
                        regionCode: regionCode
                    };
                }
            }
        } catch (e) {
            console.warn("Fallback API search failed for region", regionCode, e);
        }
    }
    return null;
}

async function fetchServerDetails(server, placeId) {
    if (serverLocations[server.id]) return;

    try {
        const res = await callRobloxApi({
            subdomain: 'gamejoin',
            endpoint: '/v1/join-game-instance',
            method: 'POST',
            body: { placeId: parseInt(placeId, 10), gameId: server.id, gameJoinAttemptId: crypto.randomUUID() }
        });

        if (!res.ok) return;
        const info = await res.json();
        if (userRequestedStop || !info.joinScript) return;

        const dataCenterId = info.joinScript.DataCenterId;
        if (dataCenterId && serverIpMap?.[dataCenterId]) {
            const loc = serverIpMap[dataCenterId];
            const countryCode = loc.country;
            const state = loc.region;
            const city = loc.city;
            let regionCode = countryCode;

            if (countryCode === 'US' && state && city) {
                const stateCode = getStateCodeFromRegion(state);
                const cityCode = city.replace(/\s+/g, '').toUpperCase();
                regionCode = `US-${stateCode}-${cityCode}`;
            } else if (countryCode === 'US' && state) {
                regionCode = `US-${getStateCodeFromRegion(state)}`;
            } else if (city) {
                regionCode = `${countryCode}-${city.replace(/\s+/g, '').toUpperCase()}`;
            }
            serverLocations[server.id] = { c: regionCode };
        }
    } catch (error) {  }
}

async function findServerViaRovalraApi(placeId, universeId, preferredRegionCode, failedRegionNames) {
    try {
        let apiSucceededAtLeastOnce = false;

        const stateNameToUpperCodeMap = {};
        Object.entries(stateMap).forEach(([full, code]) => {
            stateNameToUpperCodeMap[full.toUpperCase()] = code;
        });

        if (universeId) {
            try {
                const gameDetailsResponse = await callRobloxApi({ subdomain: 'games', endpoint: `/v1/games?universeIds=${universeId}` });
                if (gameDetailsResponse.ok) {
                    const gameDetailsData = await gameDetailsResponse.json();
                    if (!gameDetailsData.data || gameDetailsData.data.length === 0 || gameDetailsData.data[0].playing === 0) {
                        return { joined: false };
                    }
                }
            } catch (e) { }
        }
        

        let availableRovalraRegions = [];
        try {
            const regionCountsResponse = await callRobloxApi({ isRovalraApi: true, endpoint: `/v1/servers/counts?place_id=${placeId}` });
            if (regionCountsResponse.ok) {
                const regionCountsData = await regionCountsResponse.json();

                availableRovalraRegions = Object.keys(regionCountsData.counts?.regions || {});
            }
        } catch (e) { console.warn("Region counts API failed", e); }
        
        let targetableRegions = [];
        
        if (preferredRegionCode) {
            targetableRegions = [preferredRegionCode];
        } else {
            if (availableRovalraRegions.length === 0) return { joined: false };
            
            const locationData = await getUserLocation(placeId);
            if (!locationData) { return { joined: false }; }
            const { userLat, userLon } = locationData;
            
            const availableRegionsWithDistance = [];
            
            for (const rovalraRegionCode of availableRovalraRegions) {
                let representativeRegionKey = null;

                if (rovalraRegionCode.startsWith('US-')) {
                    const stateNameUpper = rovalraRegionCode.split('-')[1]; 
                    
                    const stateCode = stateNameToUpperCodeMap[stateNameUpper]; 
                    
                    if (stateCode) {
                        representativeRegionKey = Object.keys(REGIONS).find(key => key.startsWith(`US-${stateCode}`));
                    }
                } else {
                    representativeRegionKey = Object.keys(REGIONS).find(key => key.startsWith(rovalraRegionCode));
                }

                if (representativeRegionKey && REGIONS[representativeRegionKey]) {
                    const regionInfo = REGIONS[representativeRegionKey];
                    availableRegionsWithDistance.push({ 
                        regionCode: representativeRegionKey, 
                        distance: getDistance(userLat, userLon, regionInfo.latitude, regionInfo.longitude) 
                    });
                }
            }
            
            availableRegionsWithDistance.sort((a, b) => a.distance - b.distance);
            targetableRegions = availableRegionsWithDistance.map(r => r.regionCode);
        }
        
        if (targetableRegions.length === 0) return { joined: false };

        for (const targetRegion of targetableRegions) {
            const regionData = REGIONS[targetRegion];
            if (!regionData) continue;

            let url = `/v1/servers/region?place_id=${placeId}`;
            if (regionData.country) url += `&country=${encodeURIComponent(regionData.country)}`;
            if (regionData.city) url += `&city=${encodeURIComponent(regionData.city)}`;
            url += '&cursor=0';

            const serversInRegionResponse = await callRobloxApi({
                isRovalraApi: true,
                endpoint: url
            });
            
            if (!serversInRegionResponse.ok) { 
                failedRegionNames.add(getFullRegionName(targetRegion)); 
                continue; 
            }
            
            apiSucceededAtLeastOnce = true;
            const serversInRegionData = await serversInRegionResponse.json();
            
            if (serversInRegionData.servers) {
                for (const server of serversInRegionData.servers) {
                    if (joinedServerIds.has(server.server_id)) continue; 
                    try {
                        const res = await callRobloxApi({
                            subdomain: 'gamejoin',
                            endpoint: '/v1/join-game-instance',
                            method: 'POST',
                            body: { placeId: parseInt(placeId, 10), gameId: server.server_id, gameJoinAttemptId: crypto.randomUUID() }
                        });
                        if (res.ok) {
                            const info = await res.json();
                            if (info.joinScript) {
                                joinedServerIds.add(server.server_id); 
                                hideLoadingOverlay(true);
                                launchGame(placeId, server.server_id);
                                showReviewPopup('region_filters');
                                return { status: 'JOINED' };
                            }
                        }
                    } catch (e) {}
                }
            }
            failedRegionNames.add(getFullRegionName(targetRegion));
        }

        if (apiSucceededAtLeastOnce) {
            return { status: 'NO_SERVERS' };
        }

        return { status: 'API_ERROR' };
    } catch (error) {
        console.error("Rovalra Search Error", error);
        return { status: 'API_ERROR' };
    }
}

export async function performJoinAction(placeId, universeId, preferredRegionCode = null, onCancel = null) {
    if (isCurrentlyFetchingData) return;

    userRequestedStop = false;
    isCurrentlyFetchingData = true;
    serverLocations = {};
    
    showLoadingOverlay(() => {
        userRequestedStop = true;
        hideLoadingOverlay(true);
        if (onCancel) onCancel();
    }, null, true);

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

        await Promise.all([dataPromise]);


        updateLoadingOverlayText('Detecting your location...');
        const locationData = await getUserLocation(placeId);
        
        let allRegionsByDistance = [];
        if (locationData) {
            const { userLat, userLon } = locationData;
            const regionsWithDistance = Object.keys(REGIONS).map(regionCode => {
                const region = REGIONS[regionCode];
                const distance = getDistance(userLat, userLon, region.latitude, region.longitude);
                return { regionCode, distance };
            });
            regionsWithDistance.sort((a, b) => a.distance - b.distance);
            allRegionsByDistance = regionsWithDistance.map(r => r.regionCode);
        } else {
            allRegionsByDistance = Object.keys(REGIONS);
        }

        if (preferredRegionCode) {
            const filtered = allRegionsByDistance.filter(r => r !== preferredRegionCode);
            sortedRegionCodes = [preferredRegionCode, ...filtered];
        } else {
            sortedRegionCodes = allRegionsByDistance;
        }

        const targetRegionName = preferredRegionCode ? getFullRegionName(preferredRegionCode) : "closest region";
        const shortTargetName = targetRegionName.split(',')[0];

        let runManualScan = true;
        let manualScanReason = `Region API unavailable. Scanning for ${shortTargetName}...`;

        if (!userRequestedStop) {
            updateLoadingOverlayText(DOMPurify.sanitize(`Searching in ${shortTargetName}...`));
            const rovalraResult = await findServerViaRovalraApi(placeId, universeId, preferredRegionCode, failedRegionNames);

            if (rovalraResult.status === 'JOINED') {
                joined = true;
                runManualScan = false;
            } else if (rovalraResult.status === 'NO_SERVERS') {
                runManualScan = true;
                manualScanReason = `No servers found in ${shortTargetName} via API. Scanning locally...`;
            }
        }

        if (runManualScan && !joined && !userRequestedStop) {
 
            updateLoadingOverlayText(DOMPurify.sanitize(manualScanReason));
            
            let nextCursor = null;
            let pageCount = 0;


            while (pageCount < MAX_SERVER_PAGES && !userRequestedStop && !joined) {
                pageCount++;
                try {
                    const response = await callRobloxApi({
                        subdomain: 'games',
                        endpoint: `/v1/games/${placeId}/servers/Public?excludeFullGames=true&limit=100${nextCursor ? `&cursor=${encodeURIComponent(nextCursor)}` : ''}`
                    });
                    
                    if (!response.ok) { 
                        await new Promise(r => setTimeout(r, 1000)); 
                        continue; 
                    }
                    
                    const pageData = await response.json();
                    const serversOnPage = pageData.data || [];

                    if (serversOnPage.length === 0 && !pageData.nextPageCursor) break;

                    if (serversOnPage.length > 0) {
                        
                        await Promise.all(serversOnPage.map(s => fetchServerDetails(s, placeId)));
                        
                        let improvedThisRound = false;

                        for (const server of serversOnPage) {
                            const regionCode = serverLocations[server.id]?.c;
                            
                            if (regionCode && server.playing < server.maxPlayers) {
                                totalUniqueServersSeen++;

                                let thisServerTier = sortedRegionCodes.indexOf(regionCode);
                                if (thisServerTier === -1) thisServerTier = 9999;

                                const isPreviouslyJoined = joinedServerIds.has(server.id);

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
                            try { bestName = getFullRegionName(bestServerRegionCode); } catch(e) {}
                            
                            if (bestServerTier === 0) {
                                updateLoadingOverlayText(DOMPurify.sanitize(`Found ${bestName}! Joining...`));
                            } else {
                                updateLoadingOverlayText(DOMPurify.sanitize(`Found: ${bestName}. Continuing search for ${shortTargetName}...`));
                            }
                        }

                        if (bestServerTier === 0) {
                            hideLoadingOverlay(true);
                            joinedServerIds.add(bestServerFoundSoFar.id);
                            launchGame(placeId, bestServerFoundSoFar.id);
                            showReviewPopup('region_filters');
                            joined = true;
                            break;
                        }

                        if (!preferredRegionCode && bestServerTier <= 2 && pageCount > 5) {
                            hideLoadingOverlay(true);
                            joinedServerIds.add(bestServerFoundSoFar.id);
                            launchGame(placeId, bestServerFoundSoFar.id);
                            showReviewPopup('region_filters');
                            joined = true;
                            break;
                        }
                    }
                    
                    if (!pageData.nextPageCursor) break;
                    nextCursor = pageData.nextPageCursor;

                } catch (e) { 
                    console.error("Error scanning page:", e);
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
                updateLoadingOverlayText(DOMPurify.sanitize(`Searching for closest region to ${shortTargetName}...`));
                const apiFallback = await findClosestServerViaApi(placeId, preferredRegionCode);
                
                if (apiFallback) {
                    let useApi = false;
                    if (!bestServerFoundSoFar) {
                        useApi = true;
                    } else {
                        const localDist = getRegionDistance(preferredRegionCode, bestServerRegionCode);
                        const apiDist = getRegionDistance(preferredRegionCode, apiFallback.regionCode);
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
                    showLoadingOverlayResult(DOMPurify.sanitize(`No servers found in ${shortTargetName}.`), { text: 'Close', onClick: () => hideLoadingOverlay(true) });
                } else {
                    hideLoadingOverlay(true);
                    launchGame(placeId);
                    showReviewPopup('region_filters');
                }
            }
            else if (bestServerFoundSoFar) {
                if (!preferredRegionCode) {
                    hideLoadingOverlay(true);
                    joinedServerIds.add(bestServerFoundSoFar.id);
                    launchGame(placeId, bestServerFoundSoFar.id);
                    showReviewPopup('region_filters');
                } else {
                    let foundRegionName = bestServerRegionCode;
                    try { foundRegionName = getFullRegionName(bestServerRegionCode); } catch(e) {}
                    
                    showLoadingOverlayResult(
                        DOMPurify.sanitize(`No ${shortTargetName} servers running.`),
                        { 
                            text: DOMPurify.sanitize(`Join ${foundRegionName}`), 
                            onClick: () => {
                                hideLoadingOverlay(true);
                                joinedServerIds.add(bestServerFoundSoFar.id);
                                launchGame(placeId, bestServerFoundSoFar.id);
                                showReviewPopup('region_filters');
                            } 
                        }
                    );
                }
            }

            else {
                showLoadingOverlayResult("No suitable servers found.", { text: 'Close', onClick: () => hideLoadingOverlay(true) });
            }
        }
    } catch (error) {
        showLoadingOverlayResult(error.message || 'Could not find any servers.');
    } finally {
        isCurrentlyFetchingData = false;
    }
}

export async function getSavedPreferredRegion() {
    const result = await chrome.storage.local.get(PREFERRED_REGION_STORAGE_KEY);
    return result[PREFERRED_REGION_STORAGE_KEY] || 'AUTO';
}