function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

if (window.location.pathname.includes('/games/')) {
    const pathname = window.location.pathname;
    let placeId = null;

    if (pathname.includes('/games/')) {
        placeId = pathname.split('/')[2];
    }
    const defaultRegions = [
        "HK", "FR", "NL", "GB", "AU", "IN", "DE", "PL", "JP", "SG", "BR", "US", "EG",
        "US-AL", "US-AK", "US-AZ", "US-AR", "US-CA", "US-CO", "US-CT", "US-DE", "US-FL", "US-GA", 
        "US-HI", "US-ID", "US-IL", "US-IN", "US-IA", "US-KS", "US-KY", "US-LA", "US-ME", "US-MD", 
        "US-MA", "US-MI", "US-MN", "US-MS", "US-MO", "US-MT", "US-NE", "US-NV", "US-NH", "US-NJ", 
        "US-NM", "US-NY", "US-NC", "US-ND", "US-OH", "US-OK", "US-OR", "US-PA", "US-RI", "US-SC", 
        "US-SD", "US-TN", "US-TX", "US-UT", "US-VT", "US-VA", "US-WA", "US-WV", "US-WI", "US-WY"
      ];
      
      
    let regionServerMap = {};
    let regionCounts = {};
    let allServers = [];
    let userRegion = null;
    let userIP = null;
    let serverLocations = {};
    let userLocation = null;
    let serverScores = {};

    let storedServerData = {};
    const SERVER_DATA_KEY = 'storedServerData';
    const INACTIVE_THRESHOLD = 3 * 60 * 60 * 1000;

    let config;
    let started = 'off';
    let debug_mode = false;
    const isChrome = navigator.userAgent.toLowerCase().indexOf('chrome') !== -1;

    function loadFromBrowserStorage(item, callback_function) {
        chrome.storage.local.get(item, (result) => {
            if (result[SERVER_DATA_KEY]) {
                console.log("Clearing ALL stored server data for testing purposes.");
                storedServerData = {};
                chrome.storage.local.set({
                    [SERVER_DATA_KEY]: JSON.stringify(storedServerData)
                }, () => {
                    console.log('Stored server data has been cleared');
                    callback_function(result);
                });
            } else {
                console.log("No stored server data found, skipping clear")
                callback_function(result);
            }
        });
    }

    function loadConfigurationFromLocalStorage() {
        if (localStorage.getItem('config')) {
            console.log('Load standard config');
            config = JSON.parse(localStorage.getItem('config'));

            if (config.format_version === '1.0') {
                config.format_version = '1.2';
                for (let line of config.headers) {
                    line.apply_on = 'req';
                    line.url_contains = '';
                }
                config.debug_mode = false;
                config.use_url_contains = false;
                console.log('save new config' + JSON.stringify(config));
            }
            if (config.format_version === '1.1') {
                config.format_version = '1.2';
                for (let line of config.headers) line.url_contains = '';
                config.use_url_contains = false;
                console.log('save new config' + JSON.stringify(config));
            }
        } else {
            if (localStorage.getItem('targetPage') && localStorage.getItem('modifyTable')) {
                console.log('Load old config');
                let headers = [];
                let modifyTable = JSON.parse(localStorage.getItem('modifyTable'));
                for (const to_modify of modifyTable) {
                    headers.push({
                        action: to_modify[0],
                        url_contains: '',
                        header_name: to_modify[1],
                        header_value: to_modify[2],
                        comment: '',
                        apply_on: 'req',
                        status: to_modify[3]
                    });
                }
                config = {
                    format_version: '1.1',
                    target_page: localStorage.getItem('targetPage'),
                    headers: headers,
                    debug_mode: false,
                    use_url_contains: false
                };
            } else {
                console.log('Load default config');
                let headers = [];
                headers.push({
                    url_contains: '',
                    action: 'add',
                    header_name: 'test-header-name',
                    header_value: 'test-header-value',
                    comment: 'test',
                    apply_on: 'req',
                    status: 'on'
                });
                config = {
                    format_version: '1.1',
                    target_page: 'https://httpbin.org/*',
                    headers: headers,
                    debug_mode: false,
                    use_url_contains: false
                };
            }
        }
        chrome.storage.local.set({
            config: JSON.stringify(config)
        });
        started = localStorage.getItem('started');
        if (started !== undefined) chrome.storage.local.set({
            started: started
        });
    }

    function loadFromBrowserStorage(item, callback_function) {
        chrome.storage.local.get(item, callback_function);
    }

    function storeInBrowserStorage(item, callback_function) {
        chrome.storage.local.set(item, callback_function);
    }

    if (placeId) {
        loadFromBrowserStorage([SERVER_DATA_KEY], (result) => {
            if (result[SERVER_DATA_KEY]) {
                storedServerData = JSON.parse(result[SERVER_DATA_KEY]);
            }
            fetchUserLocation();
            chrome.runtime.sendMessage({
                action: "getRobloxCookie"
            }, (response) => {
                if (response.success) {
                    const robloxCookie = response.cookie;
                    getServerInfo(placeId, robloxCookie, defaultRegions);
                } else {
                    console.error("Error retrieving .ROBLOSECURITY cookie:", response.message);
                }
            });
        });
    } else {
        console.log("No valid placeId found in the URL");
    }


      async function getServerInfo(placeId, robloxCookie, regions) {
        let url = `https://games.roblox.com/v1/games/${placeId}/servers/Public?excludeFullGames=true&limit=100`;
        try {
            let totalRequests = 0;
            let serverPromises = [];
            let newServerCount = 0;
            const BATCH_SIZE = 1;
            let rateLimited = false;
            const REQUEST_DELAY = 500;
            await delay(REQUEST_DELAY);
                const response = await fetch(url, {
                headers: {
                    "Referer": `https://www.roblox.com/games/${placeId}/`,
                    "Origin": "https://roblox.com",
                    "Cookie": `${robloxCookie}`,
                    "Cache-Control": "no-cache",
                },
            });
    
            if (response.status === 429) {
                rateLimited = true;
                showRateLimitedMessage();
                updatePopup();
                return;
            }
            if (!response.ok) {
                console.log(`Error fetching servers, status code: ${response.status}`);
                const errorDetails = await response.text();
                console.log("Error details:", errorDetails);
                return;
            }
    
            const servers = await response.json();
            if (!servers.data || servers.data.length === 0) {
                console.log("No servers found.");
                return;
            }
    
            for (const server of servers.data) {
                const promise = handleServer(server, placeId, robloxCookie, regions, newServerCount);
                serverPromises.push(promise);
                allServers.push(server);
            }
    
            while (serverPromises.length > 0) {
                const batch = serverPromises.splice(0, BATCH_SIZE);
                const results = await Promise.all(batch);
                if (results.length > 0) {
                    newServerCount = results.reduce((accumulator, currentValue) => accumulator + currentValue, 0);
                }
            }
    
            checkInactiveServers(placeId, servers.data.length);
    
            console.log("All Stored Server Data Keys:", Object.keys(storedServerData));
            console.log("All Stored Server Data:", JSON.stringify(storedServerData, null, 2));
    
            if (storedServerData[placeId]) {
                console.log(`Stored Server Data for placeId: ${placeId}:`, JSON.stringify(storedServerData[placeId], null, 2));
    
                for (const serverId in storedServerData[placeId]) {
                    const server = storedServerData[placeId][serverId];
                    const uptime = calculateUptime(server.t);
                    console.log(`Server ID: ${serverId}, Uptime: ${uptime}ms`);
                }
            } else {
                console.warn(`No data found for placeId: ${placeId}`);
            }
              storeInBrowserStorage({[SERVER_DATA_KEY]: JSON.stringify(storedServerData)});
    
            if (rateLimited) {
                showRateLimitedMessage();
            } else {
                updatePopup();
            }
        } catch (error) {
            console.log("Error fetching server data:", error);
        }
    }
    


    function showRateLimitedMessage() {
        const serverPopup = document.querySelector('.nav.nav-tabs');
        if (!serverPopup) return;
        const existingButtonContainer = document.querySelector('.server-buttons-container');
        if (existingButtonContainer) {
            existingButtonContainer.remove();
        }
        const messageContainer = document.createElement('div');
        messageContainer.classList.add('rate-limited-message');
        messageContainer.style.color = "red";
        messageContainer.style.fontSize = "16px";
        messageContainer.style.fontWeight = "bold";
        messageContainer.style.textAlign = "center";
        messageContainer.style.padding = "0px";
        messageContainer.style.gap = "0px";
        messageContainer.style.marginTop = "10px";
        messageContainer.style.backgroundColor = "#393b3d";
        messageContainer.style.borderRadius = "6px";
        messageContainer.style.boxShadow = "0 4px 6px rgba(0, 0, 0, 0.1)";
        messageContainer.textContent = "Region Selector is rate-limited. Wait before trying again";
        const refreshButton = document.createElement('button');
        refreshButton.textContent = "Refresh";
        refreshButton.style.padding = "20px 20px";
        refreshButton.style.marginLeft = "10px";
        refreshButton.style.backgroundColor = "#24292e";
        refreshButton.style.border = "1px solid #444";
        refreshButton.style.borderRadius = "6px";
        refreshButton.style.cursor = "pointer";
        refreshButton.style.padding = "10px";
        refreshButton.style.fontSize = "13.4px";
        refreshButton.style.fontWeight = "600";
        refreshButton.style.color = "white";
        refreshButton.style.transition = "all 0.3s ease";
        refreshButton.style.transition = "background-color 0.3s ease, transform 0.3s ease, border-color 0.3s ease";
        refreshButton.addEventListener("mouseenter", () => {
            refreshButton.style.backgroundColor = "#4c5053";
            refreshButton.style.borderColor = "#24292e";
            refreshButton.style.transform = "scale(1.05)";
        });
        refreshButton.addEventListener("mouseleave", () => {
            refreshButton.style.backgroundColor = "#24292e";
            refreshButton.style.borderColor = "#4c5053";
            refreshButton.style.transform = "scale(1)";
        });
        refreshButton.addEventListener("click", () => {
            location.reload();
        });
        messageContainer.appendChild(refreshButton);
        serverPopup.parentNode.insertBefore(messageContainer, serverPopup.nextSibling);
    }

    async function fetchUserLocation(retries = 2) {
        try {
            const robloxCookieResponse = await chrome.runtime.sendMessage({ action: "getRobloxCookie" });
    
            if (!robloxCookieResponse || !robloxCookieResponse.success) {
                console.error("Failed to get Roblox cookie:", robloxCookieResponse ? robloxCookieResponse.message : "No cookie response");
                if (retries > 0) {
                    console.log("retrying location fetch...");
                    await delay(1000);
                    return await fetchUserLocation(retries - 1);
                } else {
                    return false;
                }
            }
    
            const robloxCookie = robloxCookieResponse.cookie;
             await chrome.runtime.sendMessage({ action: "enableCountryCodeRule" });
             const response = await fetch("https://users.roblox.com/v1/users/authenticated/country-code", {
                 headers: {
                     "Cache-Control": "no-cache",
                 },
                 credentials: 'include'
              });
             await chrome.runtime.sendMessage({ action: "disableCountryCodeRule" });
    
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
    
            const data = await response.json();
              if (data && data.countryCode) {
                    console.log("Fetched country code:", data.countryCode);
                    let locationData = null;
                     if (data.countryCode === "US"){
                         const regionResponse = await fetch("https://users.roblox.com/v1/users/authenticated/region", {
                             headers: {
                                 "Cache-Control": "no-cache",
                             },
                             credentials: 'include'
                          });
                            if (!regionResponse.ok){
                                throw new Error(`HTTP error! Status: ${regionResponse.status}`);
                            }
                         const regionData = await regionResponse.json()
                         if (regionData && regionData.regionCode){
                            locationData = await fetchApproximateLocation(data.countryCode, regionData.regionCode);
                              if (locationData) {
                                userLocation = {
                                    countryCode: data.countryCode,
                                    regionCode: regionData.regionCode,
                                    latitude: locationData.latitude,
                                    longitude: locationData.longitude,
                                 };
                                  console.log("Fetched approximate location:", userLocation);
                            }  else {
                                userLocation = {
                                    countryCode: data.countryCode,
                                    regionCode: regionData.regionCode,
                                   latitude: 0,
                                    longitude: 0,
                                 };
                                console.warn("Approximate location not found, falling back to 0,0")
                            }
                         } else {
                              locationData = await fetchApproximateLocation(data.countryCode);
                                 if (locationData) {
                                    userLocation = {
                                        countryCode: data.countryCode,
                                        latitude: locationData.latitude,
                                        longitude: locationData.longitude,
                                     };
                                    console.log("Fetched approximate location:", userLocation);
                               }  else {
                                  userLocation = {
                                        countryCode: data.countryCode,
                                       latitude: 0,
                                        longitude: 0,
                                     };
                                   console.warn("Approximate location not found, falling back to 0,0")
                               }
                         }
                     } else {
                         locationData = await fetchApproximateLocation(data.countryCode);
                           if (locationData) {
                                userLocation = {
                                    countryCode: data.countryCode,
                                    latitude: locationData.latitude,
                                    longitude: locationData.longitude,
                                 };
                                console.log("Fetched approximate location:", userLocation);
                            }  else {
                                 userLocation = {
                                    countryCode: data.countryCode,
                                   latitude: 0,
                                    longitude: 0,
                                 };
                                console.warn("Approximate location not found, falling back to 0,0")
                            }
                     }
                    userRegion = mapStateToRegion(userLocation);
                  return true;
                } else {
                    if (retries > 0) {
                        console.log("retrying location fetch...");
                        await delay(1000);
                        return await fetchUserLocation(retries - 1);
                    } else {
                         console.error("Country code not found in response");
                         return false;
                    }
                }
        
        } catch (error) {
            console.error("Error fetching user location:", error);
            if (retries > 0) {
                console.log("retrying location fetch...");
                await delay(1000);
                return await fetchUserLocation(retries - 1);
            }
           else {
                return false;
            }
        }
    }
    
    

    // dont ask i just really wanted this shit to work, i know almost all of these arent even a server location IM NOT DUMB
    function getUSStateCoordinates(stateCode) {
        const usStateCoordinates = {
            AL: { latitude: 32.806671, longitude: -86.791130 },
            AK: { latitude: 61.370716, longitude: -152.404419 },
            AZ: { latitude: 33.729759, longitude: -111.431221 },
            AR: { latitude: 34.969704, longitude: -92.373123 },
            CA: { latitude: 36.116203, longitude: -119.681564 },
            CO: { latitude: 39.059811, longitude: -105.311104 },
            CT: { latitude: 41.597782, longitude: -72.755371 },
            DE: { latitude: 39.318523, longitude: -75.507141 },
            FL: { latitude: 27.766279, longitude: -81.686783 },
            GA: { latitude: 33.040619, longitude: -83.643074 },
            HI: { latitude: 21.094318, longitude: -157.498337 },
            ID: { latitude: 44.240459, longitude: -114.478828 },
            IL: { latitude: 40.349457, longitude: -88.986137 },
            IN: { latitude: 39.849426, longitude: -86.258278 },
            IA: { latitude: 42.011539, longitude: -93.210526 },
            KS: { latitude: 38.526600, longitude: -96.726486 },
            KY: { latitude: 37.668140, longitude: -84.670067 },
            LA: { latitude: 31.169546, longitude: -91.867805 },
            ME: { latitude: 44.693947, longitude: -69.381927 },
            MD: { latitude: 39.063946, longitude: -76.802101 },
            MA: { latitude: 42.230171, longitude: -71.530106 },
            MI: { latitude: 43.326618, longitude: -84.536095 },
            MN: { latitude: 45.694454, longitude: -93.900192 },
            MS: { latitude: 32.741646, longitude: -89.678696 },
            MO: { latitude: 38.456085, longitude: -92.288368 },
            MT: { latitude: 46.921925, longitude: -110.454353 },
            NE: { latitude: 41.125370, longitude: -98.268082 },
            NV: { latitude: 38.313515, longitude: -117.055374 },
            NH: { latitude: 43.452492, longitude: -71.563896 },
            NJ: { latitude: 40.298904, longitude: -74.521011 },
            NM: { latitude: 34.840515, longitude: -106.248482 },
            NY: { latitude: 42.165726, longitude: -74.948051 },
            NC: { latitude: 35.630066, longitude: -79.806419 },
            ND: { latitude: 47.528912, longitude: -99.784012 },
            OH: { latitude: 40.388783, longitude: -82.764915 },
            OK: { latitude: 35.565342, longitude: -96.928917 },
            OR: { latitude: 44.572021, longitude: -122.070938 },
            PA: { latitude: 40.590752, longitude: -77.209755 },
            RI: { latitude: 41.680893, longitude: -71.511780 },
            SC: { latitude: 33.856892, longitude: -80.945007 },
            SD: { latitude: 44.299782, longitude: -99.438828 },
            TN: { latitude: 35.747845, longitude: -86.692345 },
            TX: { latitude: 31.054487, longitude: -97.563461 },
            UT: { latitude: 40.150032, longitude: -111.862434 },
            VT: { latitude: 44.045876, longitude: -72.710686 },
            VA: { latitude: 37.769337, longitude: -78.169968 },
            WA: { latitude: 47.400902, longitude: -121.490494 },
            WV: { latitude: 38.491226, longitude: -80.954456 },
            WI: { latitude: 44.268543, longitude: -89.616508 },
            WY: { latitude: 42.755966, longitude: -107.302490 },
        };
    
        return usStateCoordinates[stateCode] || null;
    }
    
    
    let serverIpMap = null;

    (async () => {
         serverIpMap = await fetch(chrome.runtime.getURL("ServerList.json"))
                    .then(response => response.json())
                    .catch(error => {
                        console.error("Failed to load ServerList.json", error);
                        return {};
                    });
                 console.log("Server IP map loaded:", serverIpMap);
    })();

    async function handleServer(server, placeId, robloxCookie, regions, newServerCount) {
        const serverId = server.id;
        try {
            const serverInfo = await fetch(`https://gamejoin.roblox.com/v1/join-game-instance`, {
                method: 'POST',
                headers: {
                    "Accept": "*/*",
                    "Accept-Encoding": "gzip, deflate, br, zstd",
                    "Accept-Language": "en,en-US;q=0.9",
                    "Referer": `https://www.roblox.com/games/${placeId}/`,
                    "Origin": "https://roblox.com",
                },
                body: new URLSearchParams({
                    placeId: placeId,
                    isTeleport: false,
                    gameId: serverId,
                    gameJoinAttemptId: serverId,
                }),
                credentials: 'include',
            });
    
            const ipData = await serverInfo.json();
            let ip = ipData?.joinScript?.UdmuxEndpoints?.[0]?.Address;
            if (!ip) {
                console.warn(`IP not found for server ${serverId}`);
                return;
            }
    
            ip = ip.split('.').slice(0, 3).join('.') + '.0';
            let serverLocationData = serverIpMap[ip];
    
            if (!serverLocationData) {
                console.warn(`No location data for IP ${ip}, using fallback.`);
                serverLocationData = { country: { code: "US" } };
            }
    
            const countryCode = serverLocationData?.country?.code;
            let stateCode = null;
            let regionCode = countryCode;
    
            if (countryCode === "US") {
                stateCode = serverLocationData.region?.code?.replace(/-\d+$/, '') || null;
                regionCode = `US-${stateCode}`;
                console.log(`US server detected: State=${stateCode}, IP=${ip}, Server ID=${serverId}`);
            }
    
            if (!storedServerData[placeId]) {
                storedServerData[placeId] = {};
            }
    
             const optimizedLocation = {
                c: countryCode === "US" ? stateCode : regionCode,
                x: 0,
                y: 0,
            };
    
        
             if (serverLocationData) {
                    const lat = serverLocationData.latitude;
                    const lon = serverLocationData.longitude;
                    if (typeof lat === 'number' && typeof lon === 'number'){
                        optimizedLocation.x = lat;
                        optimizedLocation.y = lon;
                       }
                }
        
            if (countryCode === "US") {
                storedServerData[placeId][serverId] = {
                    f: Math.round(server.fps),
                    i: server.id,
                    c: regionCode,
                    p: new Uint16Array([server.ping])[0],
                    t: Date.now(),
                    l: optimizedLocation,
                };
                console.log(`Stored US server: ID=${serverId}, State=${optimizedLocation.c}, Location=`, optimizedLocation);
            } else {
                storedServerData[placeId][serverId] = {
                    f: Math.round(server.fps),
                    i: server.id,
                    c: optimizedLocation.c,
                    p: new Uint16Array([server.ping])[0],
                    t: Date.now(),
                    l: optimizedLocation,
                };
                console.log(`Stored non-US server: ID=${serverId}, Region=${optimizedLocation.c}, Location=`, optimizedLocation);
            }
                if (regions.includes(regionCode)) {
                regionCounts[regionCode] = (regionCounts[regionCode] || 0) + 1;
                regionServerMap[regionCode] = server;
            }
    
            newServerCount++;
            return newServerCount;
        } catch (error) {
            console.log(`Error fetching server info for server ${serverId}:`, error);
        }
        return newServerCount;
    }
    
    async function fetchApproximateLocation(countryCode, regionCode = null) {
        try {
            let apiUrl = `https://restcountries.com/v3.1/alpha/${countryCode}`;
            const response = await fetch(apiUrl);
    
            if (!response.ok) {
                console.error(`Error fetching country data for ${countryCode}: ${response.status}`);
                return null;
            }
    
            const data = await response.json();
    
            if (countryCode === "US" && regionCode) {
                const stateCoordinates = getUSStateCoordinates(regionCode);
                if (stateCoordinates) {
                    return stateCoordinates;
                }
                console.error(`Could not find location data for US state: ${regionCode}`);
                return null;
            }
    
            if (data && data.length > 0 && data[0].latlng) {
                return {
                    latitude: data[0].latlng[0],
                    longitude: data[0].latlng[1],
                };
            }
    
            console.error(`Could not find location data for country: ${countryCode}`);
            return null;
        } catch (error) {
            console.error(`Error fetching approximate location for ${countryCode}:`, error);
            return null;
        }
    }
    
    
    function mapStateToRegion(data) {
        if (data && data.countryCode === "US" && data.regionCode) {
            return data.regionCode.replace(/-\d+$/, '');
        }
         if (data && data.l?.c?.includes("US-")) {
            return data.l.c;
        }
        if (data && data.l?.c === "US" && data.isUS) {
            return `US-${data.l.c}`;
        }
         if (data && data.l?.c === "US") {
            return data.l.c;
        }
       
        return data?.countryCode || data?.c;
    }
    
    
    function checkInactiveServers(currentPlaceId, serverCount) {
        const now = Date.now();
        let fetchedServerIds = new Set(allServers.map(server => server.id)); 
    
        if (storedServerData[currentPlaceId]) {
            for (const serverId in storedServerData[currentPlaceId]) {
                const server = storedServerData[currentPlaceId][serverId];
                 if (serverCount < 100) {
                    if (!fetchedServerIds.has(serverId)) {
                        console.log(`Server ${serverId} in place ${currentPlaceId} is not found and the serverCount is ${serverCount}, removing server`);
                        delete storedServerData[currentPlaceId][serverId];
                        storeInBrowserStorage({[SERVER_DATA_KEY]: JSON.stringify(storedServerData)});
                     }
                } else {
                      if (!fetchedServerIds.has(serverId)) {
                          if (now - server.t > INACTIVE_THRESHOLD) {
                              if (!storedServerData[currentPlaceId][serverId].likelyInactive) {
                                  storedServerData[currentPlaceId][serverId].likelyInactive = true;
                                  storeInBrowserStorage({[SERVER_DATA_KEY]: JSON.stringify(storedServerData)});
                                  console.log(`Server ${serverId} in place ${currentPlaceId} seems inactive and marked as such.`);
                              }
                          } else if (storedServerData[currentPlaceId][serverId].likelyInactive) {
                                delete storedServerData[currentPlaceId][serverId].likelyInactive;
                                storeInBrowserStorage({[SERVER_DATA_KEY]: JSON.stringify(storedServerData)});
                               console.log(`Server ${serverId} in place ${currentPlaceId} is within the threshold now and has been unflagged.`);
                            }
                      }
                    }
                }
           }
    }
    function updatePopup(retries = 5) {
        const serverPopup = document.querySelector(".nav.nav-tabs");
        if (!serverPopup) {
            if (retries > 0) {
                console.log("Retrying to find .nav.nav-tabs...");
                setTimeout(() => updatePopup(retries - 1), 1000);
            } else {
                console.error(".nav.nav-tabs not found after multiple retries.");
            }
            return;
        }
    
        const existingButtonContainer = document.querySelector(".server-buttons-container");
        if (existingButtonContainer) {
            existingButtonContainer.remove();
        }
    
        const buttonContainer = document.createElement("div");
            buttonContainer.classList.add("server-buttons-container");
            buttonContainer.style.display = "flex";
            buttonContainer.style.flexWrap = "wrap";
            buttonContainer.style.gap = "9px"; 
            buttonContainer.style.marginTop = "10px";
            buttonContainer.style.padding = "8px"; 
            buttonContainer.style.backgroundColor = "#393b3d";
            buttonContainer.style.borderRadius = "6px";
            buttonContainer.style.boxShadow = "0 4px 6px rgba(0, 0, 0, 0.1)";
            buttonContainer.style.marginBottom = "8px";
        const filterButton = document.createElement("div");
            filterButton.style.position = "relative";
            filterButton.style.display = "inline-block";
            filterButton.style.marginBottom = '5px';
        const filterButtonBtn = document.createElement("button");
             filterButtonBtn.textContent = "Filter";
            filterButtonBtn.style.padding = "10px 15px";
             filterButtonBtn.style.backgroundColor = "#0366d6";
           filterButtonBtn.style.border = "1px solid #0366d6";
            filterButtonBtn.style.borderRadius = "6px";
            filterButtonBtn.style.cursor = "pointer";
            filterButtonBtn.style.fontSize = "15px";
           filterButtonBtn.style.fontWeight = "600";
           filterButtonBtn.style.color = "White";
           filterButtonBtn.style.flex = "1 1 0%";
            filterButtonBtn.style.minWidth = "80px";
            filterButtonBtn.style.margin = "0px";
           filterButtonBtn.style.marginTop = "5px";
           filterButtonBtn.style.textAlign = "center";
             filterButtonBtn.style.transition = "background-color 0.3s, transform 0.3s";
           filterButtonBtn.style.transform = "scale(1)";
           filterButtonBtn.style.height = "44px";
         
        const dropdownArrow = document.createElement("span");
           dropdownArrow.textContent = "▶";
           dropdownArrow.style.marginLeft = "5px";
          filterButtonBtn.appendChild(dropdownArrow);
       filterButtonBtn.addEventListener("mouseover", () => {
           filterButtonBtn.style.backgroundColor = "#0366d6";
            filterButtonBtn.style.borderRadius = "6px";
           filterButtonBtn.style.borderColor = "#0366d6";
           filterButtonBtn.style.transform = "scale(1.05)";
       });
       filterButtonBtn.addEventListener("mouseout", () => {
           filterButtonBtn.style.backgroundColor = "#0366d6";
           filterButtonBtn.style.borderRadius = "6px";
         filterButtonBtn.style.borderColor = "#0366d6";
           filterButtonBtn.style.transform = "scale(1)";
       });
       const dropdownContent = document.createElement('div');
            dropdownContent.style.display = 'none';
            dropdownContent.style.position = 'absolute';
            dropdownContent.style.top = 'calc(100% + 3px)';
            dropdownContent.style.left = '0';
           dropdownContent.style.backgroundColor = '#393b3d';
            dropdownContent.style.border = '1px solid #444';
            dropdownContent.style.borderRadius = '6px';
            dropdownContent.style.zIndex = '1001';
            dropdownContent.style.padding = '5px';
           dropdownContent.style.width = '160px';
           dropdownContent.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
    
       const bestPingOption = document.createElement('button');
          bestPingOption.textContent = 'Best Ping';
            bestPingOption.style.display = 'block';
             bestPingOption.style.width = '100%';
            bestPingOption.style.padding = '8px';
              bestPingOption.style.border = 'none';
               bestPingOption.style.backgroundColor = '#24292e';
                bestPingOption.style.color = 'white';
            bestPingOption.style.cursor = 'pointer';
                bestPingOption.style.textAlign = 'left';
             bestPingOption.style.fontSize = '15px';
              bestPingOption.style.fontWeight = '600';
                bestPingOption.style.transition = "background-color 0.3s ease";
                const bestPingTooltip = document.createElement('div');
                const bestPingTooltipTitle = document.createElement('div');
                bestPingTooltipTitle.textContent = 'Finds The Best Ping';
                bestPingTooltipTitle.style.fontWeight = 'bold';
                bestPingTooltip.appendChild(bestPingTooltipTitle)
                const bestPingTooltipSubtitle = document.createElement('div');
                bestPingTooltipSubtitle.textContent = 'This finds the least laggy server using different methods';
                bestPingTooltipSubtitle.style.fontSize = '13px'
           bestPingTooltip.appendChild(bestPingTooltipSubtitle)
                   bestPingTooltip.style.position = "absolute";
                   bestPingTooltip.style.left = '105%';
                   bestPingTooltip.style.top = '0';
                    bestPingTooltip.style.padding = '5px';
                    bestPingTooltip.style.backgroundColor = "#212323";
                     bestPingTooltip.style.border = "1px solid #444";
                   bestPingTooltip.style.borderRadius = "6px";
                    bestPingTooltip.style.display = 'none';
                   bestPingTooltip.style.width = "150%";
            bestPingOption.appendChild(bestPingTooltip)
          bestPingOption.addEventListener('mouseover', () => {
               bestPingOption.style.backgroundColor = '#4c5053';
                   bestPingOption.style.borderRadius = "6px";
                  bestPingOption.style.borderColor = "#24292e";
                bestPingTooltip.style.display = 'block';
          });
        bestPingOption.addEventListener('mouseout', () => {
            bestPingOption.style.backgroundColor = '#24292e';
             bestPingOption.style.borderRadius = "6px";
             bestPingOption.style.borderColor = "#4c5053";
            bestPingTooltip.style.display = 'none';
        });
        bestPingOption.addEventListener('click', async () => {
              let bestServerRegion = "N/A";
             let bestServer = null;
            if (allServers.length > 0 && userLocation) {
                 bestServer = findBestServer();
                 if (bestServer) {
                     for (const [region, server] of Object.entries(regionServerMap)) {
                         if (server.id === bestServer.id) {
                             bestServerRegion = region;
                         }
                     }
                 }
            }

            if (bestServer == null || bestServerRegion == "N/A") {
                if (allServers.length > 0) {
                    bestServer = findBestServer()
                    if (bestServer) {
                        for (const [region, server] of Object.entries(regionServerMap)) {
                            if (server.id === bestServer.id) {
                                bestServerRegion = region;
                            }
                        }
                    }
                }
                if (bestServer == null || bestServerRegion == "N/A") {
                    bestServerRegion = "N/A"
                }

            }
            if (userRegion === "US") {
                showUSWarningModal(async () => {
                    if (bestServerRegion === "N/A") {
                        await fetchUserLocation();
                    }
                    joinBestServer(bestServer);
                });
            } else {
                if (bestServerRegion === "N/A") {
                    await fetchUserLocation();
                }
                joinBestServer(bestServer);
            }
        dropdownContent.style.display = 'none';
         dropdownArrow.textContent = '▶';
       });

    
        dropdownContent.appendChild(bestPingOption);
      filterButton.appendChild(filterButtonBtn)
       filterButton.appendChild(dropdownContent);
     filterButtonBtn.addEventListener('click', (event) => {
         event.stopPropagation();
         dropdownContent.style.display = dropdownContent.style.display === 'none' ? 'block' : 'none';
          dropdownArrow.textContent = dropdownContent.style.display === 'none' ? '▶' : '▼';
    });

   document.addEventListener('click', () => {
         dropdownContent.style.display = 'none';
        dropdownArrow.textContent = '▶';
    });

    buttonContainer.appendChild(filterButton)
    const uniqueRegions = new Set();
    for (const serverId in storedServerData[placeId]) {
        const server = storedServerData[placeId][serverId];
        let storedRegion = mapStateToRegion(server);
           if (storedRegion){
               uniqueRegions.add(storedRegion);
           }
      }
       for (const serverId in serverLocations) {
           const server = serverLocations[serverId];
            let currentRegion = mapStateToRegion(server);
                 if (currentRegion){
                       uniqueRegions.add(currentRegion);
                  }
       }
    const regionButtons = [];
    for (const region of uniqueRegions) {
         let serverCount = regionCounts[region] || 0;
       let storedServerCount = 0;
          if (storedServerData && storedServerData[placeId]) {
              for (const serverId in storedServerData[placeId]) {
                    const server = storedServerData[placeId][serverId]
                     let storedRegion =  mapStateToRegion(server);
                           if (storedRegion === region && !server.likelyInactive){
                                let isNewServer = false;
                                    for (const foundServer of allServers){
                                           if (foundServer.id === serverId) {
                                               isNewServer = true;
                                               break;
                                            }
                                     }
                                 if (!isNewServer){
                                      storedServerCount++
                                   }
                              }
                }
             }
        const totalCount = serverCount + storedServerCount;
        if (totalCount > 0) {
            const button = document.createElement("button");
             button.textContent = `${region}: ${totalCount}`;
           button.style.padding = "10px 15px";
           button.style.backgroundColor = "#24292e";
           button.style.border = "1px solid #444";
           button.style.borderRadius = "6px";
          button.style.cursor = "pointer";
           button.style.fontSize = "15px";
           button.style.height = "44px";
            button.style.fontWeight = "600";
           button.style.color = "white";
           button.style.flex = "1";
             button.style.minWidth = "100px";
           button.style.margin = "4px";
          button.style.textAlign = "center";
           button.style.transition = "background-color 0.3s ease, transform 0.3s ease";
            button.addEventListener('mouseover', () => {
                button.style.backgroundColor = "#4c5053";
                 button.style.borderRadius = "6px";
                 button.style.borderColor = "#24292e";
                 button.style.transform = "scale(1.05)";
            });
             button.addEventListener('mouseout', () => {
               button.style.backgroundColor = "#24292e";
                button.style.borderRadius = "6px";
                button.style.borderColor = "#4c5053";
                 button.style.transform = "scale(1)";
             });
            button.addEventListener("click", () => {
                joinSpecificRegionServer(region);
            });
              buttonContainer.appendChild(button);
             regionButtons.push(button);
       }
   }
    serverPopup.parentNode.insertBefore(buttonContainer, serverPopup.nextSibling);


    const adjustButtonText = () => {
        let totalWidth = 0;
        regionButtons.forEach((button) => {
            totalWidth += button.offsetWidth + 10;
        });

        if (totalWidth > buttonContainer.offsetWidth) {
            regionButtons.forEach((button) => {
                const [region, count] = button.textContent.split(": ");
               button.textContent = `${region}: ${count.split(" ")[0]}`;
            });
        } else {
            regionButtons.forEach((button) => {
                 const [region, count] = button.textContent.split(": ");
                if (!count.includes("servers")) {
                     button.textContent = `${region}: ${count}`;
                }
            });
        }
    };


    const buttonCheckInterval = setInterval(() => {
        const checkButtonContainer = document.querySelector('.server-buttons-container');
        if (checkButtonContainer) {
            adjustButtonText();
            clearInterval(buttonCheckInterval);
        }
    }, 1000);

    window.addEventListener('resize', adjustButtonText);
 }
     
        function calculateDistance(lat1, lon1, lat2, lon2) {
            const earthRadius = 6371;
    
            const dLat = deg2rad(lat2 - lat1);
            const dLon = deg2rad(lon2 - lon1);
    
            const a =
                Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            const distance = earthRadius * c;
            return distance;
        }
    
        function deg2rad(deg) {
            return deg * (Math.PI / 180)
        }
    
        function scoreServer(server, serverLocation, fps, ping) {
         
            let locationData = serverLocation;
            if (storedServerData[placeId] && storedServerData[placeId][server.i || server.id]) {
                locationData = storedServerData[placeId][server.i || server.id].l;
            }
           
            const userLat = userLocation?.latitude || 0;
            const userLon = userLocation?.longitude || 0;
            const serverLat = locationData?.x || locationData?.lat || 0;
            const serverLon = locationData?.y || locationData?.lon || 0;
            const distance = calculateDistance(
                userLat,
                userLon,
                serverLat,
                serverLon
            );
        
    
            ping = typeof ping === 'number' && !isNaN(ping) ? ping : 0;
            fps = typeof fps === 'number' && !isNaN(fps) ? fps : 0;
        
            if (fps < 0 || isNaN(fps)) {
                console.warn("Invalid fps values:", { fps });
                return;
            }
            if (ping < 0 || isNaN(ping)) {
                console.warn("Invalid ping values:", { ping });
                return;
            }
            const normalizedFPS = (fps - 0) / (60 - 0);
            const normalizedPing = (300 - ping) / (300 - 0);
            const clampedFPS = Math.max(0, Math.min(1, normalizedFPS));
            const clampedPing = Math.max(0, Math.min(1, normalizedPing));
        
            const distanceScore = Math.max(0, 1 - (distance / 3000));
        
        
            const fpsWeight = 0.4;
            const distanceWeight = 0.3;
            const pingWeight = 0.3;
        
            const score = (fpsWeight * clampedFPS) +
            (distanceWeight * distanceScore) +
            (pingWeight * clampedPing);
        
            serverScores[server.i || server.id] = score;
        }
        function findBestServer() {
            let combinedServers = [];
              if (allServers.length > 0 && userLocation) {
                 combinedServers = [...allServers]
                   if(storedServerData && storedServerData[placeId]) {
                      for (const serverId in storedServerData[placeId]) {
                         if (!storedServerData[placeId][serverId].likelyInactive && Date.now() - storedServerData[placeId][serverId].t < INACTIVE_THRESHOLD ){
                                let isNewServer = false;
                                  for (const foundServer of allServers){
                                        if (foundServer.id === serverId){
                                            isNewServer = true
                                            break;
                                        }
                                  }
                                 if (!isNewServer){
                                      combinedServers.push(storedServerData[placeId][serverId])
                                 }
                            }
                       }
                   }
              } else if (storedServerData && storedServerData[placeId] && userLocation){
                     for (const serverId in storedServerData[placeId]) {
                       if (!storedServerData[placeId][serverId].likelyInactive && Date.now() - storedServerData[placeId][serverId].t < INACTIVE_THRESHOLD ){
                        combinedServers.push(storedServerData[placeId][serverId])
                       }
                      }
                } else {
                  return null;
              }
               console.log("Servers being scored in findBestServer:", combinedServers);
              if(combinedServers.length === 0){
                return null
              }
              let bestServer = null;
              let bestScore = -Infinity;
              for (const server of combinedServers) {
                   if (storedServerData[placeId] && storedServerData[placeId][server.i || server.id] && storedServerData[placeId][server.i || server.id].likelyInactive) {
                      continue;
                   }
                    let serverToScore = server;
                    if (!server.f) {
                        const serverId = server.i || server.id;
                        if(storedServerData[placeId] && storedServerData[placeId][serverId]){
                             serverToScore = storedServerData[placeId][serverId];
                        } else {
                            continue;
                        }
                     }
                
                    scoreServer(serverToScore, serverToScore.l, serverToScore.f, serverToScore.p);
                  const serverScore = serverScores[server.i || server.id]
                  if (serverScore > bestScore) {
                      bestScore = serverScore
                      bestServer = server;
                   }
              }
               console.log("Best Server found:", bestServer, " Score:", bestScore, " All scores:", serverScores);
              return bestServer;
          }
          async function joinBestServer(server) {
        if (!userLocation){
             const success = await fetchUserLocation()
               if (!success){
                    console.error("Location not found, cannot join server")
                    return;
              }
        }
           if (!server) {
                console.log("No server found with a score.");
              if (allServers.length > 0) {
                const firstServer = allServers[0];
                const serverId = firstServer?.id;
               if (serverId && storedServerData[placeId] && storedServerData[placeId][serverId] && storedServerData[placeId][serverId].likelyInactive) {
                    console.log(`Server ${serverId} in place ${placeId} is marked likely inactive and not joining.`);
                       return;
                    }
                if (serverId) {
                  if (storedServerData[placeId] && storedServerData[placeId][serverId]){
                        const serverIp = Object.keys(serverIpMap).find(ip => serverIpMap[ip]?.country?.code === storedServerData[placeId][serverId].l?.c);
                        console.log("Joining first server:", firstServer, " Server IP:", serverIp, " Server ID:", serverId);
                       const url = `roblox://experiences/start?placeId=${placeId}&gameInstanceId=${serverId}`;
                       window.open(url, '_blank');
                       return;
                   }
                      const url = `roblox://experiences/start?placeId=${placeId}&gameInstanceId=${serverId}`;
                        window.open(url, '_blank');
                        console.log("Joining first server:", firstServer, " Server ID:", serverId);
                    } else {
                     console.error("Server ID not found from first server in all servers:", firstServer);
                   }
              } else {
                console.error("No servers available to select for best server logic.");
              }
                return;
           }
        
           const serverId = server.i || server.id;
    
            if (storedServerData[placeId] && storedServerData[placeId][serverId] && storedServerData[placeId][serverId].likelyInactive) {
                console.log(`Server ${serverId} in place ${placeId} is marked likely inactive and not joining.`);
                return;
             }
            if (storedServerData[placeId] && storedServerData[placeId][serverId]){
                   const serverIp = Object.keys(serverIpMap).find(ip => serverIpMap[ip]?.country?.code === storedServerData[placeId][serverId].l?.c);
                   console.log("Joining best server:", server, " Server IP:", serverIp, " Server ID:", serverId);
            }
             if (serverId) {
                    const url = `roblox://experiences/start?placeId=${placeId}&gameInstanceId=${serverId}`;
                    window.open(url, '_blank');
              } else {
                    console.error("Server ID not found for region:", server);
            }
        }
    
        function joinNewestServer() {
            if (!storedServerData[placeId]) {
                console.log("No server data stored for this place.");
                return;
            }
        
            let newestServer = null;
            let secondNewestServer = null;
            let thirdNewestServer = null;
            let newestTimestamp = 0;
            let secondNewestTimestamp = 0;
             let thirdNewestTimestamp = 0;
        
        
            for (const serverId in storedServerData[placeId]) {
                const server = storedServerData[placeId][serverId];
                if (server.likelyInactive) {
                    continue;
                }
                if (server.t > newestTimestamp) {
                      thirdNewestTimestamp = secondNewestTimestamp;
                    thirdNewestServer = secondNewestServer;
                    secondNewestTimestamp = newestTimestamp;
                    secondNewestServer = newestServer;
                    newestTimestamp = server.t;
                    newestServer = server;
        
                } else if (server.t > secondNewestTimestamp) {
                       thirdNewestTimestamp = secondNewestTimestamp;
                    thirdNewestServer = secondNewestServer;
                    secondNewestTimestamp = server.t;
                    secondNewestServer = server;
                } else if (server.t > thirdNewestTimestamp) {
                    thirdNewestTimestamp = server.t;
                     thirdNewestServer = server;
                }
            }
        
   
            let serverToJoin = secondNewestServer || thirdNewestServer || newestServer;
        
             if (serverToJoin) {
                const serverId = serverToJoin.i || serverToJoin.id;
                if (storedServerData[placeId] && storedServerData[placeId][serverId] && storedServerData[placeId][serverId].likelyInactive) {
                       console.log(`Server ${serverId} in place ${placeId} is marked likely inactive and not joining.`);
                        return;
                }
               if (storedServerData[placeId] && storedServerData[placeId][serverId]){
                    const serverIp = Object.keys(serverIpMap).find(ip => serverIpMap[ip]?.country?.code === storedServerData[placeId][serverId].l?.c);
                   console.log("Joining the prioritized server:", serverToJoin, " Server IP:", serverIp);
                }
                const url = `roblox://experiences/start?placeId=${placeId}&gameInstanceId=${serverId}`;
                window.open(url, '_blank');
        
            }
                else {
                console.log("No eligible servers found to join");
            }
        }
        function joinSpecificRegionServer(region) {
            if (!storedServerData[placeId]) {
                console.log("No server data stored for this place.");
                return;
            }
            let serverToJoin = null;
        
 
            for (const server of allServers){
                   if (storedServerData[placeId] && storedServerData[placeId][server.id] && storedServerData[placeId][server.id].likelyInactive) {
                            continue;
                      }
                 let currentRegion = mapStateToRegion(serverLocations[server.id]);
                if (currentRegion === region) {
                      serverToJoin = server;
                      break;
                }
            }
           if (serverToJoin == null){
                 for (const serverId in storedServerData[placeId]) {
                      const server = storedServerData[placeId][serverId];
                          if (storedServerData[placeId][serverId].likelyInactive) {
                            continue;
                          }
                          let storedRegion = mapStateToRegion(server);
                        if (storedRegion === region) {
                            serverToJoin = server;
                             break;
                         }
                  }
           }
              if (serverToJoin) {
                const serverId = serverToJoin.i || serverToJoin.id;
                 if (storedServerData[placeId] && storedServerData[placeId][serverId]){
                   const serverIp = Object.keys(serverIpMap).find(ip => serverIpMap[ip]?.country?.code === storedServerData[placeId][serverId].l?.c);
                     console.log("Joining specific region server:", serverToJoin, " region:", region, "Server IP:", serverIp );
                }
                const url = `roblox://experiences/start?placeId=${placeId}&gameInstanceId=${serverId}`;
                window.open(url, '_blank');
            }  else {
                 console.log("No eligible servers found to join in region:", region);
                }
    }
    
 function calculateUptime(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) {
            return `${days} day${days > 1 ? 's' : ''}, ${hours % 24} hr${hours % 24 > 1 ? 's' : ''}`;
        } else if (hours > 0) {
            return `${hours} hr${hours > 1 ? 's' : ''}, ${minutes % 60} min`;
        } else if (minutes > 0) {
            return `${minutes} min, ${seconds % 60} sec`;
        }
        return `${seconds} sec`;
    }
    

     

   
    function showUSWarningModal(proceedCallback) {
        const modalOverlay = document.createElement('div');
        modalOverlay.style.position = 'fixed';
        modalOverlay.style.top = '0';
        modalOverlay.style.left = '0';
        modalOverlay.style.width = '100%';
        modalOverlay.style.height = '100%';
        modalOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        modalOverlay.style.display = 'flex';
        modalOverlay.style.justifyContent = 'center';
        modalOverlay.style.alignItems = 'center';
        modalOverlay.style.zIndex = '1000';

        const modalContent = document.createElement('div');
        modalContent.style.backgroundColor = '#393b3d';
        modalContent.style.padding = '20px';
        modalContent.style.borderRadius = '8px';
        modalContent.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
        modalContent.style.textAlign = 'center';
        modalContent.style.color = "white";

        const warningText = document.createElement('p');
        warningText.textContent = "This extension is unable to accurately locate servers in the USA. Proceed with caution.";
        warningText.style.marginBottom = '20px';
        warningText.style.fontSize = "17px";
        warningText.style.fontWeight = '600';


        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.gap = "10px";
        buttonContainer.style.justifyContent = 'center';

        const proceedButton = document.createElement('button');
        proceedButton.textContent = 'Proceed';
        proceedButton.style.padding = '10px 15px';
        proceedButton.style.backgroundColor = '#f05c6c';
        proceedButton.style.border = 'none';
        proceedButton.style.borderRadius = '6px';
        proceedButton.style.cursor = 'pointer';
        proceedButton.style.fontSize = '15px';
        proceedButton.style.fontWeight = '600';
        proceedButton.style.color = 'white';
        proceedButton.style.transition = "all 0.3s ease";
        proceedButton.addEventListener("mouseover", () => {
            proceedButton.style.backgroundColor = "#A03D48";
        });
        proceedButton.addEventListener("mouseout", () => {
            proceedButton.style.backgroundColor = "#f05c6c";
        });
        proceedButton.addEventListener('click', () => {
            modalOverlay.remove();
            proceedCallback();
        });

        const cancelButton = document.createElement('button');
        cancelButton.textContent = 'Cancel';
        cancelButton.style.padding = '10px 15px';
        cancelButton.style.backgroundColor = '#24292e';
        cancelButton.style.border = '1px solid #24292e';
        cancelButton.style.borderRadius = '6px';
        cancelButton.style.cursor = 'pointer';
        cancelButton.style.fontSize = '15px';
        cancelButton.style.fontWeight = '600';
        cancelButton.style.color = 'white';
        cancelButton.style.transition = "all 0.3s ease";
        cancelButton.addEventListener("mouseover", () => {
            cancelButton.style.backgroundColor = "#4c5053";
        });
        cancelButton.addEventListener("mouseout", () => {
            cancelButton.style.backgroundColor = "#24292e";
        });
        cancelButton.addEventListener('click', () => {
            modalOverlay.remove();
        });
        buttonContainer.appendChild(proceedButton);
        buttonContainer.appendChild(cancelButton)
        modalContent.appendChild(warningText);
        modalContent.appendChild(buttonContainer);
        modalOverlay.appendChild(modalContent);
        document.body.appendChild(modalOverlay);
    }
}