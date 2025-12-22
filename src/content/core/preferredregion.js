

import { callRobloxApi } from './api.js';
import { launchGame, launchMultiplayerGame } from './utils/launcher.js';
import { getUserLocation } from './utils/location.js'; 
import { getRegionData, getFullRegionName } from './regions.js';
import DOMPurify from 'dompurify';
import { showLoadingOverlay, hideLoadingOverlay, updateLoadingOverlayText, showLoadingOverlayResult } from './ui/startModal/gamelaunchmodal.js';

const PREFERRED_REGION_STORAGE_KEY = 'robloxPreferredRegion';
const MAX_SERVER_PAGES = Infinity; 

const stateMap = {
    'Alabama':'AL','Alaska':'AK','Arizona':'AZ','Arkansas':'AR','California':'CA','Colorado':'CO','Connecticut':'CT','Delaware':'DE','Florida':'FL','Georgia':'GA','Hawaii':'HI','Idaho':'ID','Illinois':'IL','Indiana':'IN','Iowa':'IA','Kansas':'KS','Kentucky':'KY','Louisiana':'LA','Maine':'ME','Maryland':'MD','Massachusetts':'MA','Michigan':'MI','Minnesota':'MN','Mississippi':'MS','Missouri':'MO','Montana':'MT','Nebraska':'NE','Nevada':'NV','New Hampshire':'NH','New Jersey':'NJ','New Mexico':'NM','New York':'NY','North Carolina':'NC','North Dakota':'ND','Ohio':'OH','Oklahoma':'OK','Oregon':'OR','Pennsylvania':'PA','Rhode Island':'RI','South Carolina':'SC','South Dakota':'SD','Tennessee':'TN','Texas':'TX','Utah':'UT','Vermont':'VT','Virginia':'VA','Washington':'WA','West Virginia':'WV','Wisconsin':'WI','Wyoming':'WY'
};
const invertedStateMap = Object.fromEntries(Object.entries(stateMap).map(([key, value]) => [value, key.toUpperCase()]));

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

const getCsrfToken = (() => {
    let token = null;
    return async () => {
        if (token) return token;
        const metaTag = document.querySelector('meta[name="csrf-token"]');
        if (metaTag) {
            token = metaTag.getAttribute('data-token');
            if(token) return token;
        }
        try {
            const response = await callRobloxApi({ subdomain: 'auth', endpoint: '/v1/logout', method: 'POST' });
            token = response.headers.get('x-csrf-token');
            return token;
        } catch (error) { throw error; }
    };
})();

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
        let citySpecificWarning = false;
        
        if (preferredRegionCode) {

            let rovalraRegionCode;
            if (preferredRegionCode.startsWith('US-')) {
                const parts = preferredRegionCode.split('-');
                const fullStateName = invertedStateMap[parts[1]] || parts[1]; 
                rovalraRegionCode = `US-${fullStateName}`;
            } else {
                rovalraRegionCode = preferredRegionCode.split('-')[0];
                if (preferredRegionCode.split('-').length > 1) citySpecificWarning = true;
            }
            
            if (rovalraRegionCode) {
                targetableRegions = [rovalraRegionCode];
                if (citySpecificWarning) updateLoadingOverlayText(DOMPurify.sanitize(`Searching in ${getFullRegionName(preferredRegionCode).split(',')[0]}...`));
            }
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
                        regionCode: rovalraRegionCode, 
                        distance: getDistance(userLat, userLon, regionInfo.latitude, regionInfo.longitude) 
                    });
                }
            }
            
            availableRegionsWithDistance.sort((a, b) => a.distance - b.distance);
            targetableRegions = availableRegionsWithDistance.map(r => r.regionCode);
        }
        
        if (targetableRegions.length === 0) return { joined: false };

        for (const targetRegion of targetableRegions) {
            const serversInRegionResponse = await callRobloxApi({
                isRovalraApi: true,
                endpoint: `/v1/servers/region?place_id=${placeId}&region=${encodeURIComponent(targetRegion)}&cursor=0`
            });
            
            if (!serversInRegionResponse.ok) { 
                failedRegionNames.add(getFullRegionName(targetRegion)); 
                continue; 
            }
            
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
                                launchGame(placeId, server.server_id);
                                return { joined: true };
                            }
                        }
                    } catch (e) {}
                }
            }
            failedRegionNames.add(getFullRegionName(targetRegion));
        }
        return { joined: false };
    } catch (error) {
        console.error("Rovalra Search Error", error);
        return { joined: false };
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
    });

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

        await Promise.all([dataPromise, getCsrfToken()]);


        updateLoadingOverlayText('Detecting your location...');
        const locationData = await getUserLocation(placeId);
        
        let allRegionsByDistance = [];
        if (locationData) {
            const { userLat, userLon } = locationData;
            const regionsWithDistance = Object.keys(REGIONS).map(regionCode => ({ 
                regionCode, 
                distance: getDistance(userLat, userLon, REGIONS[regionCode].latitude, REGIONS[regionCode].longitude) 
            }));
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


        if (!userRequestedStop) {
            updateLoadingOverlayText(DOMPurify.sanitize(`Searching in ${shortTargetName}...`));
            const rovalraResult = await findServerViaRovalraApi(placeId, universeId, preferredRegionCode, failedRegionNames);
            joined = rovalraResult.joined;
        }

        if (!joined && !userRequestedStop) {
 
            updateLoadingOverlayText(DOMPurify.sanitize(`Region API unavailable. Scanning for ${shortTargetName}...`));
            
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
                            joinedServerIds.add(bestServerFoundSoFar.id);
                            launchGame(placeId, bestServerFoundSoFar.id);
                            joined = true;
                            break;
                        }

                        if (!preferredRegionCode && bestServerTier <= 2 && pageCount > 5) {
                            joinedServerIds.add(bestServerFoundSoFar.id);
                            launchGame(placeId, bestServerFoundSoFar.id);
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

            if (totalUniqueServersSeen === 0 && !bestServerFoundSoFar) {
                showLoadingOverlayResult(
                    "No servers found in this game.", 
                    { 
                        text: 'Start Server', 
                        onClick: () => {
                            hideLoadingOverlay(true);
                            launchGame(placeId);
                        } 
                    }
                );
            }
            else if (bestServerFoundSoFar) {
                let foundRegionName = bestServerRegionCode;
                try { foundRegionName = getFullRegionName(bestServerRegionCode); } catch(e) {}
                
                showLoadingOverlayResult(
                    DOMPurify.sanitize(`Could not find server in ${shortTargetName}.`),
                    { 
                        text: DOMPurify.sanitize(`Join ${foundRegionName}`), 
                        onClick: () => {
                            hideLoadingOverlay(true);
                            joinedServerIds.add(bestServerFoundSoFar.id);
                            launchGame(placeId, bestServerFoundSoFar.id);
                        } 
                    }
                );
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