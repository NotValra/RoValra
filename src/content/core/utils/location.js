// Gets the lat and lon of a user through the gamejoin api and stores them to prevent having to get it every time its needed.
import { callRobloxApi } from '../api.js';

const LOCATION_STORAGE_KEY = 'robloxUserLocationCache';
const CACHE_DURATION_MS = 1000 * 60 * 60 * 24; 

export async function getUserLocation(placeId, forceRefresh = false) {
    if (!forceRefresh) {
        try {
            const storedData = await new Promise((resolve) => {
                if (typeof chrome === 'undefined' || !chrome.storage) {
                    console.error("Location Util: 'chrome.storage' is undefined. This script might be running in the wrong context (Main World vs Content Script).");
                    resolve(null);
                } else {
                    chrome.storage.local.get(LOCATION_STORAGE_KEY, (result) => {
                        resolve(result[LOCATION_STORAGE_KEY]);
                    });
                }
            });

            if (storedData && storedData.timestamp && (Date.now() - storedData.timestamp < CACHE_DURATION_MS)) {
                console.log("Location Util: Loaded location from cache", storedData);
                return { userLat: storedData.userLat, userLon: storedData.userLon };
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

        if (!serverListRes.ok) {
            console.error('Location Util: Server list API failed', serverListRes.status);
            return null;
        }
        
        const serverData = await serverListRes.json();
        const servers = serverData.data || [];

        if (servers.length === 0) {
            console.warn('Location Util: No public servers found to probe.');
            return null;
        }

        console.log(`Location Util: Probing ${Math.min(servers.length, 3)} servers...`);

        for (const server of servers.slice(0, 3)) {
            const coords = await probeServerForLocation(placeId, server.id);
            
            if (coords) {
                console.log("Location Util: Coordinates found!", coords);
                
                const cacheObject = { ...coords, timestamp: Date.now() };
                
                await new Promise((resolve) => {
                    if (typeof chrome !== 'undefined' && chrome.storage) {
                        chrome.storage.local.set({ [LOCATION_STORAGE_KEY]: cacheObject }, () => {
                            if (chrome.runtime.lastError) {
                                console.error("Location Util: Storage Save Failed", chrome.runtime.lastError);
                            } else {
                                console.log("Location Util: Successfully saved to chrome.storage.local");
                            }
                            resolve();
                        });
                    } else {
                        console.warn("Location Util: Cannot save. chrome.storage not available.");
                        resolve();
                    }
                });

                return coords;
            }
        }

    } catch (error) {
        console.error('Location Util: Critical Error', error);
    }

    console.warn("Location Util: Could not determine location.");
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

        if (!res.ok) {
            console.log(`Location Util: Probe failed for server ${serverId} (Status: ${res.status})`);
            return null;
        }

        const info = await res.json();

        if (info.joinScript && info.joinScript.SessionId) {
       

            try {
                let sessionIdStr = info.joinScript.SessionId;
                if (sessionIdStr.startsWith('http')) {
                    return null;
                }

                const sessionId = JSON.parse(sessionIdStr);
                
                if (sessionId.Latitude && sessionId.Longitude) {
                    return { 
                        userLat: sessionId.Latitude, 
                        userLon: sessionId.Longitude 
                    };
                } else {
                    console.log("Location Util: SessionId JSON did not contain Latitude/Longitude");
                }
            } catch (e) {
                console.log("Location Util: Failed to parse SessionId JSON", e);
            }
        } else {
            console.log("Location Util: No SessionId in JoinScript");
        }
    } catch (e) {
        console.error(`Location Util: Error probing server ${serverId}`, e);
    }
    return null;
}