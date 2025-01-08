// DONT REMOVE ANYTHING TO DO WITH THE LOCAL ERRORS, YOU ARE GONNA BREAK EVERYTHING IF U DO. ITS WORKING PERFECTLY FINE IDK WHY ITS ERRORING
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
        "HK", "FR", "NL", "GB", "AU", "IN", "DE", "PL", "JP", "SG", "BR","EG",
        "US-AL", "US-AK", "US-AZ", "US-AR", "US-CA", "US-CO", "US-CT", "US-DE", "US-FL", "US-GA", 
        "US-HI", "US-ID", "US-IL", "US-IN", "US-IA", "US-KS", "US-KY", "US-LA", "US-ME", "US-MD", 
        "US-MA", "US-MI", "US-MN", "US-MS", "US-MO", "US-MT", "US-NE", "US-NV", "US-NH", "US-NJ", 
        "US-NM", "US-NY", "US-NC", "US-ND", "US-OH", "US-OK", "US-OR", "US-PA", "US-RI", "US-SC", 
        "US-SD", "US-TN", "US-TX", "US-UT", "US-VT", "US-VA", "US-WA", "US-WV", "US-WI", "US-WY"
      ];
      
    let serverPopup = null; 
    let serverButtonsContainer = null;
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
                storedServerData = {};
                chrome.storage.local.set({
                    [SERVER_DATA_KEY]: JSON.stringify(storedServerData)
                }, () => {
                    callback_function(result);
                });
            } else {
                callback_function(result);
            }
        });
    }

    function loadConfigurationFromLocalStorage() {
        if (localStorage.getItem('config')) {
            config = JSON.parse(localStorage.getItem('config'));

            if (config.format_version === '1.0') {
                config.format_version = '1.2';
                for (let line of config.headers) {
                    line.apply_on = 'req';
                    line.url_contains = '';
                }
                config.debug_mode = false;
                config.use_url_contains = false;
            }
            if (config.format_version === '1.1') {
                config.format_version = '1.2';
                for (let line of config.headers) line.url_contains = '';
                config.use_url_contains = false;
            }
        } else {
            // Ngl i dont know exactly what this is for... BUtttttttttttttttttttttttttt number 1 rule of coding if it works and u dont know why DONT TOUCH IT
            if (localStorage.getItem('targetPage') && localStorage.getItem('modifyTable')) {
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
    let regionSelectorShowServerListOverlay = true;

    async function updateRegionSelectorState() {
        const settings = await new Promise((resolve) => {
            chrome.storage.local.get({
                regionSelectorEnabled: false,
                showServerListOverlay: true, 
            }, (result) => {
                resolve(result);
            });
        });

        regionSelectorEnabled = settings.regionSelectorEnabled;
        regionSelectorShowServerListOverlay = settings.showServerListOverlay; 
        if (serverPopup) {
            serverPopup.style.display = regionSelectorEnabled ? '' : 'none';
        }
        if (serverButtonsContainer) {
            serverButtonsContainer.style.display = regionSelectorEnabled ? 'flex' : 'none';
        }

         
    }

     updateRegionSelectorState()
   
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
                        if(regionSelectorEnabled) {
                            getServerInfo(placeId, robloxCookie, defaultRegions);
                         }
                   } else {
                   }
               });
           });
    } else {
    }
    let rateLimited = false;
function handleRateLimitedState(limited) {
   rateLimited = limited;
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
                handleRateLimitedState(true)
                showRateLimitedMessage();
                updatePopup();
                return;
            }
            if (!response.ok) {
                const errorDetails = await response.text();
                return;
            }
    
            const servers = await response.json();
            if (!servers.data || servers.data.length === 0) {
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
    
    
            if (storedServerData[placeId]) {
    
                for (const serverId in storedServerData[placeId]) {
                    const server = storedServerData[placeId][serverId];
                    const uptime = calculateUptime(server.t);
                }
            } else {
            }
              storeInBrowserStorage({[SERVER_DATA_KEY]: JSON.stringify(storedServerData)});
    
            if (rateLimited) {
                showRateLimitedMessage();
            } else {
                 handleRateLimitedState(false)
                updatePopup();
            }
        } catch (error) {
        }
    }
   
    


    function showRateLimitedMessage() {
    }

    async function fetchUserLocation(retries = 2) {
        try {
            const robloxCookieResponse = await chrome.runtime.sendMessage({ action: "getRobloxCookie" });
    
            if (!robloxCookieResponse || !robloxCookieResponse.success) {
               
                if (retries > 0) {
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
                            }  else {
                                userLocation = {
                                    countryCode: data.countryCode,
                                    regionCode: regionData.regionCode,
                                   latitude: 0,
                                    longitude: 0,
                                 };
                            }
                         } else {
                              locationData = await fetchApproximateLocation(data.countryCode);
                                 if (locationData) {
                                    userLocation = {
                                        countryCode: data.countryCode,
                                        latitude: locationData.latitude,
                                        longitude: locationData.longitude,
                                     };
                               }  else {
                                  userLocation = {
                                        countryCode: data.countryCode,
                                       latitude: 0,
                                        longitude: 0,
                                     };

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

                            }  else {
                                 userLocation = {
                                    countryCode: data.countryCode,
                                   latitude: 0,
                                    longitude: 0,
                                 };
                            }
                     }
                    userRegion = mapStateToRegion(userLocation);
                  return true;
                } else {
                    if (retries > 0) {
                        await delay(1000);
                        return await fetchUserLocation(retries - 1);
                    } else {
                         return false;
                    }
                }
        
        } catch (error) {
            if (retries > 0) {
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
         serverIpMap = await fetch(chrome.runtime.getURL("data/ServerList.json"))
                    .then(response => response.json())
                    .catch(error => {
                        return {};
                    });
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
                return;
            }
    
            ip = ip.split('.').slice(0, 3).join('.') + '.0';
            let serverLocationData = serverIpMap[ip];
    
            if (!serverLocationData) {
                serverLocationData = { country: { code: "US" } };
            }
    
            const countryCode = serverLocationData?.country?.code;
            let stateCode = null;
            let regionCode = countryCode;
    
            if (countryCode === "US") {
                stateCode = serverLocationData.region?.code?.replace(/-\d+$/, '') || null;
                regionCode = `US-${stateCode}`;
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
            } else {
                storedServerData[placeId][serverId] = {
                    f: Math.round(server.fps),
                    i: server.id,
                    c: optimizedLocation.c,
                    p: new Uint16Array([server.ping])[0],
                    t: Date.now(),
                    l: optimizedLocation,
                };
            }
                if (regions.includes(regionCode)) {
                regionCounts[regionCode] = (regionCounts[regionCode] || 0) + 1;
                regionServerMap[regionCode] = server;
            }
    
            newServerCount++;
            return newServerCount;
        } catch (error) {
        }
        return newServerCount;
    }
    
    async function fetchApproximateLocation(countryCode, regionCode = null) {
        try {
            let apiUrl = `https://restcountries.com/v3.1/alpha/${countryCode}`;
            const response = await fetch(apiUrl);
    
            if (!response.ok) {
                return null;
            }
    
            const data = await response.json();
    
            if (countryCode === "US" && regionCode) {
                const stateCoordinates = getUSStateCoordinates(regionCode);
                if (stateCoordinates) {
                    return stateCoordinates;
                }
                return null;
            }
    
            if (data && data.length > 0 && data[0].latlng) {
                return {
                    latitude: data[0].latlng[0],
                    longitude: data[0].latlng[1],
                };
            }
    
            return null;
        } catch (error) {
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
                        delete storedServerData[currentPlaceId][serverId];
                        storeInBrowserStorage({[SERVER_DATA_KEY]: JSON.stringify(storedServerData)});
                     }
                } else {
                      if (!fetchedServerIds.has(serverId)) {
                          if (now - server.t > INACTIVE_THRESHOLD) {
                              if (!storedServerData[currentPlaceId][serverId].likelyInactive) {
                                  storedServerData[currentPlaceId][serverId].likelyInactive = true;
                                  storeInBrowserStorage({[SERVER_DATA_KEY]: JSON.stringify(storedServerData)});
                              }
                          } else if (storedServerData[currentPlaceId][serverId].likelyInactive) {
                                delete storedServerData[currentPlaceId][serverId].likelyInactive;
                                storeInBrowserStorage({[SERVER_DATA_KEY]: JSON.stringify(storedServerData)});
                            }
                      }
                    }
                }
           }
    }
    function updatePopup(retries = 5) {
        let serverPopup = document.querySelector(".tab-pane.game-instances.section-content.active");
        if (!serverPopup) {
             serverPopup = document.querySelector(".tab-pane.game-instances.active");
            if(!serverPopup) {
            if (retries > 0) {
                setTimeout(() => updatePopup(retries - 1), 1000);
            } else {
            }
            return;
        }
        }
    
        const existingButtonContainer = document.querySelector(".server-buttons-container");
        if (existingButtonContainer) {
            existingButtonContainer.remove();
        }
    
        const buttonContainer = document.createElement("div");
        buttonContainer.classList.add("server-buttons-container");
        buttonContainer.style.display = "flex";
        buttonContainer.style.flexWrap = "wrap";
        buttonContainer.style.gap = "5px";
        buttonContainer.style.marginTop = "0px";
        buttonContainer.style.padding = "0px";
        const isDarkMode = document.body.classList.contains('dark-mode');
        buttonContainer.style.backgroundColor = isDarkMode ? "#393b3d" : "#fff";
        buttonContainer.style.borderRadius = "6px";
    
        buttonContainer.style.marginBottom = "15px";
        const filterButton = document.createElement("div");
        filterButton.style.position = "relative";
        filterButton.style.display = "inline-block";
        filterButton.style.margin = '4px';
        const filterButtonBtn = document.createElement("button");
        filterButtonBtn.textContent = "Filter";
        filterButtonBtn.style.padding = "10px 15px";
        filterButtonBtn.style.backgroundColor = isDarkMode ? "#0366d6" : "#1a73e8";
        filterButtonBtn.style.border = `1px solid ${isDarkMode ? "#0366d6" : "#1a73e8"}`;
        filterButtonBtn.style.borderRadius = "6px";
        filterButtonBtn.style.cursor = "pointer";
        filterButtonBtn.style.fontSize = "15px";
        filterButtonBtn.style.fontWeight = "600";
        filterButtonBtn.style.color = "White";
        filterButtonBtn.style.flex = "1 1 0%";
        filterButtonBtn.style.minWidth = "80px";
        filterButtonBtn.style.margin = "0px";
        filterButtonBtn.style.textAlign = "center";
        filterButtonBtn.style.transition = "background-color 0.3s, transform 0.3s";
        filterButtonBtn.style.transform = "scale(1)";
        filterButtonBtn.style.height = "44px";
    
    
        const dropdownArrow = document.createElement("span");
        dropdownArrow.textContent = "▶";
        dropdownArrow.style.marginLeft = "5px";
        filterButtonBtn.appendChild(dropdownArrow);
        filterButtonBtn.addEventListener("mouseover", () => {
            filterButtonBtn.style.backgroundColor = isDarkMode ? "#0366d6" : "#1a73e8";
            filterButtonBtn.style.borderRadius = "6px";
            filterButtonBtn.style.borderColor = isDarkMode ? "#0366d6" : "#1a73e8";
            filterButtonBtn.style.transform = "scale(1.05)";
    
    
        });
        filterButtonBtn.addEventListener("mouseout", () => {
            filterButtonBtn.style.backgroundColor = isDarkMode ? "#0366d6" : "#1a73e8";
            filterButtonBtn.style.borderRadius = "6px";
            filterButtonBtn.style.borderColor = isDarkMode ? "#0366d6" : "#1a73e8";
            filterButtonBtn.style.transform = "scale(1)";
        });
        const dropdownContent = document.createElement('div');
        dropdownContent.style.display = 'none';
        dropdownContent.style.position = 'absolute';
        dropdownContent.style.top = 'calc(100% + 3px)';
        dropdownContent.style.left = '0';
        dropdownContent.style.backgroundColor = isDarkMode ? '#393b3d' : '#f0f0f0';
        dropdownContent.style.border = isDarkMode ? '1px solid #444' : '1px solid #ddd';
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
        bestPingOption.style.backgroundColor = isDarkMode ? '#24292e' : '#fff';
        bestPingOption.style.color = isDarkMode ? 'white' : 'rgb(57, 59, 61)';
        bestPingOption.style.cursor = 'pointer';
        bestPingOption.style.textAlign = 'left';
        bestPingOption.style.fontSize = '15px';
        bestPingOption.style.fontWeight = '600';
        bestPingOption.style.transition = "background-color 0.3s ease";
    
    
        const bestPingTooltip = document.createElement('div');
        const bestPingTooltipTitle = document.createElement('div');
        bestPingTooltipTitle.style.fontWeight = 'bold';
    
        if (rateLimited) {
            bestPingTooltipTitle.textContent = 'The API is being rate limited!';
        }
        bestPingTooltip.appendChild(bestPingTooltipTitle)
        const bestPingTooltipSubtitle = document.createElement('div');
        if (!rateLimited) {
            bestPingTooltipSubtitle.textContent = 'This will automatically find the server likely to have the least latency and lag.';
        } else {
            bestPingTooltipSubtitle.textContent = "Please wait a few seconds before trying again."
        }
    
        bestPingTooltipSubtitle.style.fontSize = '14px'
        bestPingTooltipSubtitle.style.fontWeight = 'bold'
        bestPingTooltip.appendChild(bestPingTooltipSubtitle)
        bestPingTooltip.style.position = "absolute";
        bestPingTooltip.style.left = '105%';
        bestPingTooltip.style.top = '0';
        bestPingTooltip.style.padding = '5px';
        bestPingTooltip.style.backgroundColor = isDarkMode ? "#212323" : "#fff";
        bestPingTooltip.style.border = isDarkMode ? "1px solid #444" : "1px solid #ddd";
        bestPingTooltip.style.borderRadius = "6px";
        bestPingTooltip.style.display = 'none';
        bestPingTooltip.style.width = "150%";
        bestPingTooltip.style.maxWidth = "250px";
        bestPingTooltip.style.maxHeight = "100px";
        bestPingOption.appendChild(bestPingTooltip)
    
    
        if (rateLimited) {
            bestPingOption.style.backgroundColor = "#555";
            bestPingOption.style.border = "1px solid #555";
            bestPingOption.style.cursor = "not-allowed";
            bestPingOption.disabled = true;
            bestPingOption.addEventListener('mouseover', () => {
                bestPingTooltip.style.display = 'block';
            });
            bestPingOption.addEventListener('mouseout', () => {
                bestPingTooltip.style.display = 'none';
            });
        } else {
            bestPingOption.disabled = false;
            bestPingOption.style.backgroundColor = isDarkMode ? '#24292e' : '#fff';
            bestPingOption.style.border = "none";
            bestPingOption.style.cursor = "pointer";
            bestPingOption.addEventListener('mouseover', () => {
                bestPingOption.style.backgroundColor = isDarkMode ? '#4c5053' : '#f0f0f0';
                bestPingOption.style.borderRadius = "6px";
                bestPingOption.style.borderColor = isDarkMode ? '#24292e' : '#f0f0f0';
                bestPingTooltip.style.display = 'block';
            });
            bestPingOption.addEventListener('mouseout', () => {
                bestPingOption.style.backgroundColor = isDarkMode ? '#24292e' : '#fff';
                bestPingOption.style.borderRadius = "6px";
                bestPingOption.style.borderColor = isDarkMode ? '#4c5053' : '#f0f0f0';
                bestPingTooltip.style.display = 'none';
            });
        }
    
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
            if (storedRegion) {
                uniqueRegions.add(storedRegion);
            }
        }
        for (const serverId in serverLocations) {
            const server = serverLocations[serverId];
            let currentRegion = mapStateToRegion(server);
            if (currentRegion) {
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
                    let storedRegion = mapStateToRegion(server);
                    if (storedRegion === region && !server.likelyInactive) {
                        let isNewServer = false;
                        for (const foundServer of allServers) {
                            if (foundServer.id === serverId) {
                                isNewServer = true;
                                break;
                            }
                        }
                        if (!isNewServer) {
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
                button.style.backgroundColor = isDarkMode ? '#24292e' : '#fff';
                button.style.border = isDarkMode ? '1px solid #444' : '1px solid #ddd';
                button.style.borderRadius = "6px";
                button.style.cursor = "pointer";
                button.style.fontSize = "15px";
                button.style.height = "44px";
                button.style.fontWeight = "600";
                button.style.color = isDarkMode ? "white" : "rgb(57, 59, 61)";
                button.style.flex = "1";
                button.style.minWidth = "100px";
                button.style.margin = "4px";
                button.style.textAlign = "center";
                button.style.transition = "background-color 0.3s ease, transform 0.3s ease";
                button.addEventListener('mouseover', () => {
                    button.style.backgroundColor = isDarkMode ? "#4c5053" : "#f0f0f0";
                    button.style.borderRadius = "6px";
                    button.style.borderColor = isDarkMode ? "#24292e" : "#f0f0f0";
                    button.style.transform = "scale(1.05)";
                });
                button.addEventListener('mouseout', () => {
                    button.style.backgroundColor = isDarkMode ? '#24292e' : '#fff';
                    button.style.borderRadius = "6px";
                    button.style.borderColor = isDarkMode ? "#4c5053" : "#f0f0f0";
                    button.style.transform = "scale(1)";
                });
                button.addEventListener("click", () => {
                    if (regionSelectorShowServerListOverlay) {
                        showServerListOverlay(region);
                    } else {
                        joinSpecificRegion(region);
                    }
                });
                buttonContainer.appendChild(button);
                regionButtons.push(button);
            }
        }
        serverPopup.insertBefore(buttonContainer, serverPopup.childNodes[0]);
    
    
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
                return;
            }
            if (ping < 0 || isNaN(ping)) {
                return;
            }
            const normalizedFPS = (fps - 0) / (60 - 0);
            const normalizedPing = (300 - ping) / (300 - 0);
            const clampedFPS = Math.max(0, Math.min(1, normalizedFPS));
            const clampedPing = Math.max(0, Math.min(1, normalizedPing));
        
            const distanceScore = Math.max(0, 1 - (distance / 3000));
        
        
            const fpsWeight = 0.4;
            const distanceWeight = 0.4;
            const pingWeight = 0.2;
        
            const score = (fpsWeight * clampedFPS) +
            (distanceWeight * distanceScore) +
            (pingWeight * clampedPing);
        
            serverScores[server.i || server.id] = score;
        }
        function findBestServer() {
            let combinedServers = [];
            let bestServer = null;
            let bestScore = -Infinity;
        
        
            if (allServers.length > 0 && userLocation) {
                combinedServers = [...allServers];
                if (storedServerData && storedServerData[placeId]) {
                    for (const serverId in storedServerData[placeId]) {
                        if (
                            !storedServerData[placeId][serverId].likelyInactive &&
                            Date.now() - storedServerData[placeId][serverId].t <
                            INACTIVE_THRESHOLD
                        ) {
                            let isNewServer = false;
                            for (const foundServer of allServers) {
                                if (foundServer.id === serverId) {
                                    isNewServer = true;
                                    break;
                                }
                            }
                            if (!isNewServer) {
                                combinedServers.push(storedServerData[placeId][serverId]);
                            }
                        }
                    }
                }
            } else if (storedServerData && storedServerData[placeId] && userLocation) {
                for (const serverId in storedServerData[placeId]) {
                    if (
                        !storedServerData[placeId][serverId].likelyInactive &&
                        Date.now() - storedServerData[placeId][serverId].t <
                        INACTIVE_THRESHOLD
                    ) {
                        combinedServers.push(storedServerData[placeId][serverId])
                    }
                }
            }
            if (combinedServers.length === 0) {
                return null;
            }
        
        
        
            for (const server of combinedServers) {
                if (allServers.some(newServer => newServer.id === (server.i || server.id))) {
                    if (storedServerData[placeId] && storedServerData[placeId][server.i || server.id] && storedServerData[placeId][server.i || server.id].likelyInactive) {
                        continue;
                    }
                    let serverToScore = server;
                    if (!server.f) {
                        const serverId = server.i || server.id;
                        if (storedServerData[placeId] && storedServerData[placeId][serverId]) {
                            serverToScore = storedServerData[placeId][serverId];
                        } else {
                            continue;
                        }
                    }
                    scoreServer(serverToScore, serverToScore.l, serverToScore.f, serverToScore.p);
                    const serverScore = serverScores[server.i || server.id];
                    if (serverScore > bestScore) {
                        bestScore = serverScore;
                        bestServer = server;
                    }
                }
            }
        
            if (bestServer !== null) {
                return bestServer;
            }
        
            for (const server of combinedServers) {
                if (storedServerData[placeId] && storedServerData[placeId][server.i || server.id] && storedServerData[placeId][server.i || server.id].likelyInactive) {
                    continue;
                }
                let serverToScore = server;
                if (!server.f) {
                    const serverId = server.i || server.id;
                    if (storedServerData[placeId] && storedServerData[placeId][serverId]) {
                        serverToScore = storedServerData[placeId][serverId];
                    } else {
                        continue;
                    }
                }
                scoreServer(serverToScore, serverToScore.l, serverToScore.f, serverToScore.p);
                const serverScore = serverScores[server.i || server.id];
                if (serverScore > bestScore) {
                    bestScore = serverScore;
                    bestServer = server;
                }
            }
        
            if (bestServer == null) {
                if (allServers.length > 0) {
                    for (const server of allServers) {
                        if (storedServerData[placeId] && storedServerData[placeId][server.id] && storedServerData[placeId][server.id].likelyInactive) {
                            continue;
                        }
                        bestServer = server;
                        break;
                    }
                }
                if (bestServer == null && storedServerData && storedServerData[placeId]) {
                    for (const serverId in storedServerData[placeId]) {
                        if (!storedServerData[placeId][serverId].likelyInactive && Date.now() - storedServerData[placeId][serverId].t < INACTIVE_THRESHOLD) {
                            bestServer = storedServerData[placeId][serverId];
                            break;
                        }
                    }
                }
            }
        
            return bestServer;
        }
        async function joinBestServer(server) {
            if (!userLocation) {
              const success = await fetchUserLocation();
              if (!success) {
                return;
              }
            }
            if (!server) {
              if (allServers.length > 0) {
                const firstServer = allServers[0];
                const serverId = firstServer?.id;
                if (
                  serverId &&
                  storedServerData[placeId] &&
                  storedServerData[placeId][serverId] &&
                  storedServerData[placeId][serverId].likelyInactive
                ) {
                  return;
                }
                if (serverId) {
                  if (storedServerData[placeId] && storedServerData[placeId][serverId]) {
                    const serverIp = Object.keys(serverIpMap).find(
                      (ip) =>
                        serverIpMap[ip]?.country?.code ===
                        storedServerData[placeId][serverId].l?.c
                    );
                    const url = `roblox://experiences/start?placeId=${placeId}&gameInstanceId=${serverId}`;
                    window.open(url, "_blank");
                    return;
                  }
                  const url = `roblox://experiences/start?placeId=${placeId}&gameInstanceId=${serverId}`;
                  window.open(url, "_blank");
                } else {
                }
              } else {
              }
              return;
            }
        
            const serverId = server.i || server.id;
        
            if (
              storedServerData[placeId] &&
              storedServerData[placeId][serverId] &&
              storedServerData[placeId][serverId].likelyInactive
            ) {
              return;
            }
              if (storedServerData[placeId] && storedServerData[placeId][serverId]){
                    const serverIp = Object.keys(serverIpMap).find(ip => serverIpMap[ip]?.country?.code === storedServerData[placeId][serverId].l?.c);
               }
        
            if (serverId) {
              const url = `roblox://experiences/start?placeId=${placeId}&gameInstanceId=${serverId}`;
              window.open(url, "_blank");
            } else {
            }
          }
    
        function joinNewestServer() {
            if (!storedServerData[placeId]) {
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
                        return;
                }
               if (storedServerData[placeId] && storedServerData[placeId][serverId]){
                    const serverIp = Object.keys(serverIpMap).find(ip => serverIpMap[ip]?.country?.code === storedServerData[placeId][serverId].l?.c);
                }
                const url = `roblox://experiences/start?placeId=${placeId}&gameInstanceId=${serverId}`;
                window.open(url, '_blank');
        
            }
                else {
            }
        }
        let serverListState = {
            visibleServerCount: 0,
            fetchedServerIds: new Set(),
            renderedServerIds: new Set(),
            servers: [],
            renderedServersData: new Map(),
            loading: false,
        };
        
        function showServerListOverlay(region) {
            serverListState.visibleServerCount = 0;
            serverListState.fetchedServerIds.clear();
            serverListState.renderedServerIds.clear();
            serverListState.renderedServersData.clear();
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
            modalOverlay.style.pointerEvents = 'all';
            const body = document.querySelector("body");
            body.style.overflow = "hidden";
        
            const overlay = document.createElement('div');
            overlay.style.position = 'fixed';
            overlay.style.top = '0';
            overlay.style.left = '0';
            overlay.style.width = '100%';
            overlay.style.height = '100%';
            overlay.style.zIndex = '999';
            overlay.style.pointerEvents = 'none';
            document.body.appendChild(overlay);
        
            const modalContent = document.createElement('div');
           const isDarkMode = document.body.classList.contains('dark-mode');
             modalContent.style.backgroundColor = isDarkMode ? '#393b3d' : '#fff';
            modalContent.style.padding = '20px';
            modalContent.style.borderRadius = '8px';
            modalContent.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
            modalContent.style.textAlign = 'center';
            modalContent.style.maxHeight = '800px';
            modalContent.style.overflowY = 'auto';
             modalContent.style.color = isDarkMode ? 'white' : 'rgb(57, 59, 61)';
            modalContent.style.width = '70%';
            modalContent.style.maxWidth = '800px';
        
            const headerContainer = document.createElement('div');
            headerContainer.style.position = 'relative';
            headerContainer.style.top = '0';
             headerContainer.style.backgroundColor = isDarkMode ? '#393b3d' : '#fff';
            headerContainer.style.zIndex = '1002';
            headerContainer.style.paddingBottom = "10px";
            headerContainer.style.width = "100%";
            headerContainer.style.height = "50px";
            headerContainer.style.display = 'flex';
            headerContainer.style.alignItems = 'center';
            headerContainer.style.justifyContent = 'space-between';
        
        
            const title = document.createElement('h1');
             const locationData = serverIpMap[region]?.city || region;
            title.textContent = `Servers in ${locationData}`;
            title.style.marginBottom = '0px';
            title.style.textAlign = "left";
            title.style.marginLeft = "0px";
            headerContainer.appendChild(title);
        
        
            const closeButton = document.createElement('button');
            closeButton.textContent = 'Close';
            closeButton.style.padding = '8px 12px';
             closeButton.style.backgroundColor = isDarkMode ? '#d11a2a' : '#d93025';
            closeButton.style.border = isDarkMode ? '1px solid #b50e1c' : '1px solid #d93025';
            closeButton.style.borderRadius = '6px';
            closeButton.style.cursor = 'pointer';
            closeButton.style.fontSize = '14px';
            closeButton.style.fontWeight = '600';
            closeButton.style.color = 'white';
            closeButton.style.marginLeft = "auto";
            closeButton.style.marginRight = "0px";
            closeButton.style.transition = "background-color 0.3s ease";
            closeButton.addEventListener('mouseover', () => {
                 closeButton.style.backgroundColor = isDarkMode ? "#9a0613" : "#b01f1e";
                closeButton.style.borderRadius = "6px";
                closeButton.style.borderColor = isDarkMode ? "#c82d3e" : "#b01f1e";
            });
            closeButton.addEventListener('mouseout', () => {
                 closeButton.style.backgroundColor = isDarkMode ? '#d11a2a' : '#d93025';
                closeButton.style.borderRadius = "6px";
                closeButton.style.borderColor = isDarkMode ? '#b50e1c' : '#d93025';
            });
        
            closeButton.addEventListener('click', () => {
                modalOverlay.remove();
                overlay.remove();
                body.style.overflow = "auto";
                body.style.pointerEvents = "all";
            });
            headerContainer.appendChild(closeButton);
        
            modalContent.appendChild(headerContainer)
        
        
            const serverList = document.createElement('div');
            serverList.style.display = 'flex';
            serverList.style.flexDirection = 'column';
            serverList.style.gap = '10px';
        
            let servers = [];
            const storedServers = storedServerData[placeId] || {};
            for (const serverId in storedServers) {
               const server = storedServers[serverId];
                let storedRegion = mapStateToRegion(server);
                if (storedRegion === region) {
                    if (!server.likelyInactive) {
                        servers.push(server);
                   } else {
                          delete storedServerData[placeId][serverId];
                          storeInBrowserStorage({[SERVER_DATA_KEY]: JSON.stringify(storedServerData)});
                    }
                } else if (server.likelyInactive) {
                        delete storedServerData[placeId][serverId];
                        storeInBrowserStorage({[SERVER_DATA_KEY]: JSON.stringify(storedServerData)});
                   }
               }
             for (const server of allServers) {
                 let currentRegion = mapStateToRegion(serverLocations[server.id]);
                  if (currentRegion === region) {
                      if (!storedServerData[placeId] || !storedServerData[placeId][server.id] || !storedServerData[placeId][server.id].likelyInactive) {
                          let found = false;
                         for (const storedServer of servers) {
                             if (storedServer.i === server.id) {
                                found = true;
                              }
                          }
                         if (!found) {
                             servers.push(server);
                           }
                      }
                }
            }
              servers.sort((a, b) => {
                   const aPing = a.p || Infinity;
                    const bPing = b.p || Infinity;
                  return aPing - bPing;
               });
              serverListState.servers = servers;
            const serversPerPage = 20;
            async function fetchServerData(serverId) {
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
                    return ipData;
                } catch (error) {
                    return null;
                }
            }
            async function renderServers() {
               const serversToRender = serverListState.servers.slice(serverListState.visibleServerCount, serverListState.visibleServerCount + serversPerPage);
                 const serverDataPromises = serversToRender.map(async (server) => {
                     const serverId = server.i || server.id;
                    if (serverListState.renderedServerIds.has(serverId)) {
                           return serverListState.renderedServersData.get(serverId);
                      }
                   const serverButton = document.createElement('button');
                    serverButton.style.padding = "10px 15px";
                    serverButton.style.backgroundColor = isDarkMode ? '#24292e' : '#fff';
                    serverButton.style.border = isDarkMode ? '1px solid #444' : '1px solid #ddd';
                    serverButton.style.borderRadius = "6px";
                    serverButton.style.cursor = "pointer";
                    serverButton.style.fontSize = "15px";
                     serverButton.style.fontWeight = "600";
                   serverButton.style.color = isDarkMode ? 'white' : 'rgb(57, 59, 61)';
                   serverButton.style.transition = "background-color 0.3s ease";
                   serverButton.style.display = 'flex';
                    serverButton.style.flexDirection = 'column';
                    serverButton.style.alignItems = 'center';
                    serverButton.style.width = "100%";
                     serverButton.style.textAlign = "left";
                     serverButton.addEventListener('mouseover', () => {
                        serverButton.style.backgroundColor = isDarkMode ? "#4c5053" : "#f0f0f0";
                       serverButton.style.borderRadius = "6px";
                       serverButton.style.borderColor = isDarkMode ? "#24292e" : "#f0f0f0";
                    });
                   serverButton.addEventListener('mouseout', () => {
                      serverButton.style.backgroundColor = isDarkMode ? '#24292e' : '#fff';
                        serverButton.style.borderRadius = "6px";
                        serverButton.style.borderColor = isDarkMode ? "#4c5053" : "#f0f0f0";
                  });
                    const serverInfo = document.createElement('div');
                    serverInfo.style.width = "100%";
                   serverInfo.style.display = 'flex';
                   serverInfo.style.flexDirection = 'column';
                  const serverData = await fetchServerData(serverId);
                    let ping = "N/A";
                     let isFull = false
                    let isInvalid = false;
                    let isShutDown = false;
                       let storedFPS = null;
                     let storedPing = null
                   if (storedServerData[placeId] && storedServerData[placeId][serverId]) {
                         storedFPS = storedServerData[placeId][serverId].f;
                       storedPing = storedServerData[placeId][serverId].p
                    }
                    if(serverData?.joinScript?.UdmuxEndpoints?.length > 0) {
                        const serverIp = serverData?.joinScript?.UdmuxEndpoints[0]?.Address
                        if (serverIp) {
                             const serverIP = serverIp.split('.').slice(0, 3).join('.') + '.0';
                            const clientAddress = serverData?.joinScript?.MachineAddress
                             const serverLocationData = serverIpMap[serverIP]
                           const userLat = userLocation?.latitude || 0;
                            const userLon = userLocation?.longitude || 0;
                           const serverLat = serverLocationData?.latitude || 0;
                            const serverLon = serverLocationData?.longitude || 0;
                             if (clientAddress) {
                                const distance = calculateDistance(
                                    userLat,
                                    userLon,
                                   serverLat,
                                   serverLon
                                );
                                const calculatedPing = Math.round((distance / 3000) * 100)
                                if (storedPing) {
                                    if (calculatedPing < storedPing) {
                                        ping = Math.round((calculatedPing * 0.8) + (storedPing * 0.2))
                                   }  else if (calculatedPing > storedPing * 2) {
                                        ping = Math.round((calculatedPing * 0.6) + (storedPing * 0.4))
                                    } else {
                                        ping = Math.round((calculatedPing * 0.7) + (storedPing * 0.3))
                                   }
                               } else {
                                  ping = calculatedPing
                               }
                            }  else {
                                ping = "N/A"
                           }
                      }
                  }   else if (serverData && serverData.status === 22){
                       isFull = true
                     } else if (serverData && serverData.status === 11){
                       isInvalid = true
                   } else if (serverData && serverData.status === 5){
                       isShutDown = true
                    }  else {
                       ping = "N/A"
                  }
                    const serverIdText = document.createElement('div')
                    serverIdText.textContent = `Server ID: ${serverId}`;
                    serverIdText.style.fontWeight = "bold";
                   serverInfo.appendChild(serverIdText);
                    const serverDetails = document.createElement('div');
                   serverDetails.style.display = "grid";
                   serverDetails.style.gridTemplateColumns = "80px 80px 100px";
                    serverDetails.style.gap = "5px";
                   serverDetails.style.width = "100%";
                    const pingText = document.createElement('span');
                    pingText.textContent = `Ping: ${ping}`;
                    pingText.style.width = 'fit-content';
                    serverDetails.appendChild(pingText);
                     if (storedFPS) {
                         const fpsText = document.createElement('span');
                         fpsText.textContent = `FPS: ${storedFPS}`;
                        fpsText.style.width = 'fit-content';
                       serverDetails.appendChild(fpsText);
                    }
                    if (serverIpMap[mapStateToRegion(server)]?.city) {
                         const locationName = document.createElement('span');
                         locationName.textContent = `${serverIpMap[mapStateToRegion(server)].city}`;
                         locationName.style.width = 'fit-content';
                        serverDetails.appendChild(locationName);
                     }
                   serverInfo.appendChild(serverDetails);
                    serverButton.appendChild(serverInfo)
                    serverButton.addEventListener('click', () => {
                      joinSpecificServer(serverId)
                       modalOverlay.remove();
                        overlay.remove();
                        body.style.overflow = "auto";
                        body.style.pointerEvents = "all";
                   });
                     if (isFull || isInvalid || isShutDown) return null;
                  serverListState.renderedServerIds.add(serverId);
                    serverListState.fetchedServerIds.add(serverId)
                    serverListState.renderedServersData.set(serverId, serverButton);
                     return serverButton;
                 });
               const serverButtons = await Promise.all(serverDataPromises);
               serverButtons.forEach(button => {
                   if(button)
                        serverList.appendChild(button);
                });
            }
            serverList.innerHTML = '';
            renderServers();
            if(serverListState.servers.length === 0) {
              const noServers = document.createElement('p');
              noServers.textContent = 'No active servers in this region.';
               noServers.style.textAlign = "center";
                noServers.style.fontWeight = "bold";
                noServers.style.color = isDarkMode ? 'white' : '#24292e';
                serverList.appendChild(noServers);
            }
            modalContent.appendChild(serverList)
            modalOverlay.appendChild(modalContent);
            document.body.appendChild(modalOverlay);
            modalContent.addEventListener('scroll', () => {
               if (serverListState.loading) return;
              const scrollTop = modalContent.scrollTop;
               const scrollHeight = modalContent.scrollHeight;
                const clientHeight = modalContent.clientHeight;
                if (scrollHeight - scrollTop - clientHeight < 300) { 
                    serverListState.loading = true;
                   serverListState.visibleServerCount += serversPerPage;
                     renderServers();
                    serverListState.loading = false;
               }
            });
            modalOverlay.addEventListener('click', (event) => {
                if (event.target === modalOverlay) {
                    modalOverlay.remove();
                   overlay.remove();
                   body.style.overflow = "auto";
                    body.style.pointerEvents = "all";
               }
            });
           const Body = document.querySelector("body");
          Body.style.pointerEvents = "none";
          serverListState.visibleServerCount = 0;
        }
        function getFullLocationName(region) {
            return serverIpMap[region]?.city || region;
        }
         async function joinSpecificRegion(region) {
            let bestServer = null;
             if (allServers.length > 0 && userLocation) {
                bestServer = findBestServer();
           
            }
            if (bestServer == null) {
               bestServer =  findBestServer();
               if (bestServer == null){
                 for (const serverId in storedServerData[placeId]) {
                     const server = storedServerData[placeId][serverId];
                     const storedRegion = mapStateToRegion(server);
                   if (storedRegion === region) {
                           bestServer = server
                        break;
                     }
                }
             }
             if(bestServer == null){
               if (allServers.length > 0) {
                  for (const server of allServers) {
                       const serverRegion = mapStateToRegion(serverLocations[server.id]);
                    if (serverRegion === region) {
                            bestServer = server;
                            break;
                        }
                    }
                 }
            }
          }
             if (userRegion === "US") {
                    showUSWarningModal(async () => {
                         if (bestServer == null) {
                              await fetchUserLocation();
                         }
                         joinBestServer(bestServer);
                    });
                } else {
                    if (bestServer == null) {
                         await fetchUserLocation();
                    }
                joinBestServer(bestServer);
            }
    }
        
    function joinSpecificServer(serverId) {
        if (storedServerData[placeId] && storedServerData[placeId][serverId] && storedServerData[placeId][serverId].likelyInactive) {
             return;
        }
        if (storedServerData[placeId] && storedServerData[placeId][serverId]){
           const serverIp = Object.keys(serverIpMap).find(ip => serverIpMap[ip]?.country?.code === storedServerData[placeId][serverId].l?.c);
       }
        const url = `roblox://experiences/start?placeId=${placeId}&gameInstanceId=${serverId}`;
        window.open(url, '_blank');
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