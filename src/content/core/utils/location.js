import { callRobloxApi } from '../api.js';

const LOCATION_STORAGE_KEY = 'robloxUserLocationCache';
const CACHE_DURATION_MS = 1000 * 60 * 60 * 24; 


async function resolveGeoNames(lat, lon) {
    try {
        const gridLat = Math.floor(lat);
        const gridLon = Math.floor(lon);

        const response = await callRobloxApi({
            isRovalraApi: true,
            subdomain: 'www',
            endpoint: `/geolocation/${gridLat}.json`,
            method: 'GET'
        });
        if (!response.ok) throw new Error("Latitude file not found");

        const latData = await response.json();
        const locationInfo = latData[gridLon];

        return {
            country: locationInfo ? locationInfo.country : "Unknown",
            continent: locationInfo ? locationInfo.continent : "Unknown",
            countryCode: locationInfo ? locationInfo.code : "??",
        };
    } catch (e) {
        console.error("Location Util: Static API lookup failed", e);
        return { country: "Unknown", continent: "Unknown", countryCode: "??" };
    }
}

export async function getUserLocation(placeId, forceRefresh = false) {
    if (!forceRefresh) {
        try {
            const storedData = await new Promise((resolve) => {
                if (typeof chrome === 'undefined' || !chrome.storage) {
                    resolve(null);
                } else {
                    chrome.storage.local.get(LOCATION_STORAGE_KEY, (result) => {
                        resolve(result[LOCATION_STORAGE_KEY]);
                    });
                }
            });

            if (storedData && storedData.timestamp && (Date.now() - storedData.timestamp < CACHE_DURATION_MS)) {
                return storedData;
            }
        } catch (e) {
            console.error("Location Util: Error reading storage", e);
        }
    }

    console.log('Location Util: Fetching fresh user location via Roblox API...');
    
    try {
        const serverListRes = await callRobloxApi({
            subdomain: 'games',
            endpoint: `/v1/games/${placeId}/servers/Public?limit=10&excludeFullGames=true`
        });

        if (!serverListRes.ok) return null;
        
        const serverData = await serverListRes.json();
        const servers = serverData.data || [];

        for (const server of servers.slice(0, 3)) {
            const coords = await probeServerForLocation(placeId, server.id);
            
            if (coords) {
                const geoNames = await resolveGeoNames(coords.userLat, coords.userLon);
                
                const cacheObject = { 
                    ...coords, 
                    ...geoNames, 
                    timestamp: Date.now() 
                };
                
                await new Promise((resolve) => {
                    if (typeof chrome !== 'undefined' && chrome.storage) {
                        chrome.storage.local.set({ [LOCATION_STORAGE_KEY]: cacheObject }, resolve);
                    } else { resolve(); }
                });

                return cacheObject;
            }
        }
    } catch (error) {
        console.error('Location Util: Critical Error', error);
    }
    return null;
}

async function probeServerForLocation(placeId, serverId) {
    try {
        const res = await callRobloxApi({
            subdomain: 'gamejoin',
            endpoint: '/v1/join-game-instance',
            method: 'POST',
            body: { 
                placeId: parseInt(placeId, 10), 
                gameId: serverId, 
                gameJoinAttemptId: crypto.randomUUID() 
            }
        });

        if (!res.ok) return null;

        const info = await res.json();
        if (info.joinScript && info.joinScript.SessionId) {
            try {
                let sessionIdStr = info.joinScript.SessionId;
                if (sessionIdStr.startsWith('http')) return null;

                const sessionId = JSON.parse(sessionIdStr);
                if (sessionId.Latitude && sessionId.Longitude) {
                    return { 
                        userLat: sessionId.Latitude, 
                        userLon: sessionId.Longitude 
                    };
                }
            } catch (e) { }
        }
    } catch (e) { }
    return null;
}

export async function updateUserLocationIfChanged(freshCoords) {
    if (!freshCoords || typeof freshCoords.userLat !== 'number') return;

    try {
        const geoNames = await resolveGeoNames(freshCoords.userLat, freshCoords.userLon);
        const cacheObject = { ...freshCoords, ...geoNames, timestamp: Date.now() };

        if (typeof chrome !== 'undefined' && chrome.storage) {
            await chrome.storage.local.set({ [LOCATION_STORAGE_KEY]: cacheObject });
        }
    } catch (e) {
        console.error("Location Util: Error in update", e);
    }
}