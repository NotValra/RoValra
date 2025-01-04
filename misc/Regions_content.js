function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

if (window.location.pathname.includes('/games/')) {
    const pathname = window.location.pathname;
    let placeId = null;

    if (pathname.includes('/games/')) {
        placeId = pathname.split('/')[2];
    }
    const defaultRegions = ["HK", "FR", "NL", "GB", "AU", "IN", "DE", "PL", "JP", "SG", "BR", "US", "EG"];
    let regionServerMap = {};
    let regionCounts = {};
    let allServers = [];
    let userRegion = null;
    let userIP = null;
    let serverLocations = {};
    let userLocation = null;
    let serverScores = {};

    // New variable to store server data
    let storedServerData = {};
    const SERVER_DATA_KEY = 'storedServerData';
    const INACTIVE_THRESHOLD = 48 * 60 * 60 * 1000;

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
        // Load server data from storage
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
                updatePopup()
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


            //Check for inactive servers after each fetch
            checkInactiveServers(placeId, servers.data.length);

            // Print all stored server data
            console.log("All Stored Server Data:", storedServerData);

            // Print specific place server data
            if (storedServerData[placeId]) {
                console.log(`Stored Server Data for placeId: ${placeId}:`, storedServerData[placeId]);
                for (const serverId in storedServerData[placeId]) {
                    const server = storedServerData[placeId][serverId];
                    const uptime = calculateUptime(server.t);
                }
            }


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
            const ip = ipData?.joinScript?.UdmuxEndpoints?.[0]?.Address;
            if (!ip) {
                return;
            }
            const geolocationData = await fetchGeolocation(ip);
            if (!geolocationData) {
                return;
            }

            const countryCode = mapStateToRegion(geolocationData);
            const countryCodeInteger = defaultRegions.indexOf(countryCode);
            if (regions.includes(countryCode)) {
                regionCounts[countryCode] = (regionCounts[countryCode] || 0) + 1;
                regionServerMap[countryCode] = server;
                serverLocations[server.id] = geolocationData;

                // Store or update server data
                if (!storedServerData[placeId]) {
                    storedServerData[placeId] = {};
                }
                 //Add server data if it is not already added
                 const { maxPlayers, playerTokens, players, playing, ...serverDataToStore } = server; // Destructure and exclude
                   const optimizedLocation = {
                    c: geolocationData.countryCode,
                    x: parseFloat(geolocationData.latitude.toFixed(1)),
                    y: parseFloat(geolocationData.longitude.toFixed(1)),
                 };
                if (!storedServerData[placeId][serverId]) {
                    newServerCount = newServerCount + 1;
                    storedServerData[placeId][serverId] = {
                       f: Math.round(server.fps),
                       i: server.id,
                       c: countryCodeInteger,
                       p: new Uint16Array([server.ping])[0],
                       // Store timestamp in milliseconds
                       t:  Date.now(),
                       l : optimizedLocation,
                    };
                     storeInBrowserStorage({[SERVER_DATA_KEY]: JSON.stringify(storedServerData)});
                } else {
                     //If the server is marked likely inactive remove the flag and update the time.
                    if (storedServerData[placeId][serverId].likelyInactive === true){
                       delete storedServerData[placeId][serverId].likelyInactive;
                         // Update timestamp in milliseconds
                         storedServerData[placeId][serverId].t = Date.now();
                        storeInBrowserStorage({[SERVER_DATA_KEY]: JSON.stringify(storedServerData)});
                     } else {
                           // Update timestamp in milliseconds
                         storedServerData[placeId][serverId].t = Date.now();
                          storeInBrowserStorage({[SERVER_DATA_KEY]: JSON.stringify(storedServerData)});
                   }
                }
                 if (storedServerData[placeId] && storedServerData[placeId][serverId] && storedServerData[placeId][serverId].likelyInactive) {
                     return newServerCount;
                 }

                if (userLocation) {
                    scoreServer(server, userLocation, geolocationData, server.fps, server.ping);
                }
                updatePopup();
            }
        } catch (error) {
            console.log(`Error fetching server info for server ${serverId}:`, error);
        }
         return newServerCount;
    }
    function checkInactiveServers(currentPlaceId, serverCount) {
    const now = Date.now();
    let fetchedServerIds = new Set(allServers.map(server => server.id)); // collect IDs of fetched servers

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
                         // If its now within the threshhold and was inactive remove the flag.
                            delete storedServerData[currentPlaceId][serverId].likelyInactive;
                            storeInBrowserStorage({[SERVER_DATA_KEY]: JSON.stringify(storedServerData)});
                           console.log(`Server ${serverId} in place ${currentPlaceId} is within the threshold now and has been unflagged.`);
                        }
                  }
                }
            }
       }
}
    

    function mapStateToRegion(data) {
        if (data && data.countryCode === "US") {
            return "US";
        }
        return data?.countryCode;
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
            buttonContainer.style.gap = "9px"; // Adjusted for gap between buttons
            buttonContainer.style.marginTop = "10px";
            buttonContainer.style.padding = "8px"; // Added some padding to the container
            buttonContainer.style.backgroundColor = "#393b3d";
            buttonContainer.style.borderRadius = "6px";
            buttonContainer.style.boxShadow = "0 4px 6px rgba(0, 0, 0, 0.1)";
            buttonContainer.style.marginBottom = "8px";
            // Added filter button
        const filterButton = document.createElement("div"); // Changed to div to contain the dropdown
            filterButton.style.position = "relative";
            filterButton.style.display = "inline-block";
            filterButton.style.marginBottom = '5px'; // Added some margin to the bottom
        const filterButtonBtn = document.createElement("button"); // Create an actual button inside the div
             filterButtonBtn.textContent = "Filter";
             // Apply the styles from your provided style string
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
    
            const newestServerOption = document.createElement('button');
            newestServerOption.textContent = 'Newest Server';
                newestServerOption.style.display = 'block';
                 newestServerOption.style.width = '100%';
                 newestServerOption.style.padding = '8px';
                 newestServerOption.style.border = 'none';
                 newestServerOption.style.marginTop = "5px";
                  newestServerOption.style.backgroundColor = '#24292e';
                 newestServerOption.style.color = 'white';
            newestServerOption.style.cursor = 'pointer';
            newestServerOption.style.textAlign = 'left';
                newestServerOption.style.fontSize = '15px';
             newestServerOption.style.fontWeight = '600';
                  newestServerOption.style.transition = "background-color 0.3s ease";
                  const newestTooltip = document.createElement('div');
                  const newestTooltipTitle = document.createElement('div');
                      newestTooltipTitle.textContent = 'Finds The Newest Server';
                          newestTooltipTitle.style.fontWeight = 'bold';
                      newestTooltip.appendChild(newestTooltipTitle)
                      const newestTooltipSubtitle = document.createElement('div');
                      newestTooltipSubtitle.textContent = 'Might be inaccurate since the data is gathered by you only.';
                  newestTooltipSubtitle.style.fontSize = '13px'
                     newestTooltip.appendChild(newestTooltipSubtitle)
                    newestTooltip.style.position = "absolute";
                    newestTooltip.style.left = '105%';
                    newestTooltip.style.top = '0';
                   newestTooltip.style.padding = '5px';
                     newestTooltip.style.backgroundColor = "#212323";
                     newestTooltip.style.border = "1px solid #444";
                     newestTooltip.style.borderRadius = "6px";
                    newestTooltip.style.display = 'none';
                  newestTooltip.style.width = "200%";
                  newestServerOption.appendChild(newestTooltip);
                 newestServerOption.addEventListener('mouseover', () => {
                    newestServerOption.style.backgroundColor = '#4c5053';
                      newestServerOption.style.borderRadius = "6px";
                     newestServerOption.style.borderColor = "#24292e";
                    newestTooltip.style.display = 'block';
                 });
                 newestServerOption.addEventListener('mouseout', () => {
                     newestServerOption.style.backgroundColor = '#24292e';
                     newestServerOption.style.borderRadius = "6px";
                       newestServerOption.style.borderColor = "#4c5053";
                      newestTooltip.style.display = 'none';
                });
             newestServerOption.addEventListener('click', () => {
                 joinNewestServer();
                   dropdownContent.style.display = 'none';
                dropdownArrow.textContent = '▶';
            });
            dropdownContent.appendChild(bestPingOption);
           dropdownContent.appendChild(newestServerOption);
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
      
        const regionButtons = [];
        for (const region of defaultRegions) {
            let serverCount = regionCounts[region] || 0;
           let storedServerCount = 0;
             let uniqueStoredServers = new Set();

              if (storedServerData && storedServerData[placeId]) {
                  for (const serverId in storedServerData[placeId]) {
                        const server = storedServerData[placeId][serverId]
                          if (defaultRegions[server.c] === region && !server.likelyInactive){
                               let isNewServer = false;
                                for (const foundServer of allServers){
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
               button.style.backgroundColor = "#24292e";
               button.style.border = "1px solid #444";
               button.style.borderRadius = "6px";
              button.style.cursor = "pointer";
               button.style.fontSize = "15px";
                button.style.fontWeight = "600";
               button.style.color = "white";
               button.style.flex = "1"; //Flex to allow button to take up more space
                 button.style.minWidth = "80px";
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
        }, 500);
    
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
    
         function scoreServer(server, userLocation, serverLocation, fps, ping) {
            let  locationData = serverLocation;
               if (storedServerData[placeId] && storedServerData[placeId][server.id]){
                    locationData = storedServerData[placeId][server.id].l;
                 }
             
              const distance = calculateDistance(
                  userLocation.latitude,
                  userLocation.longitude,
                  locationData?.x || locationData?.lat || 0,
                  locationData?.y || locationData?.lon || 0
              );
    
    
            const normalizedFPS = (fps - 0) / (60 - 0);
            const normalizedPing = (300 - ping) / (300 - 0);
    
            const clampedFPS = Math.max(0, Math.min(1, normalizedFPS));
            const clampedPing = Math.max(0, Math.min(1, normalizedPing));
    
            const distanceScore = Math.max(0, 1 - (distance / 3000));
    
    
            const fpsWeight = 0.5;
            const distanceWeight = 0.2;
            const pingWeight = 0.3;
    
    
            const score = (fpsWeight * clampedFPS) +
                (distanceWeight * distanceScore) +
                (pingWeight * clampedPing);
    
    
            serverScores[server.id] = score;
        }
 function joinNewestServer() {
        if (!storedServerData[placeId]) {
            console.log("No server data stored for this place.");
            return;
        }
    
            let newestServer = null;
            let secondNewestServer = null;
            let newestTimestamp = 0;
             let secondNewestTimestamp = 0;
    
        for (const serverId in storedServerData[placeId]) {
            const server = storedServerData[placeId][serverId];
             if (server.likelyInactive) {
                        continue;
                  }
             if (server.t > newestTimestamp) {
                   secondNewestTimestamp = newestTimestamp;
                    secondNewestServer = newestServer;
                   newestTimestamp = server.t;
                    newestServer = server;
                } else if (server.t > secondNewestTimestamp) {
                     secondNewestTimestamp = server.t;
                     secondNewestServer = server;
                }
        }
         if (newestServer) {
            const serverId = newestServer.i;
              if (storedServerData[placeId] && storedServerData[placeId][serverId] && storedServerData[placeId][serverId].likelyInactive) {
                        console.log(`Server ${serverId} in place ${placeId} is marked likely inactive and not joining.`);
                       return;
             }
            const url = `roblox://experiences/start?placeId=${placeId}&gameInstanceId=${serverId}`;
            window.open(url, '_blank');
             console.log("Joining newest server:", newestServer);
        } else if (secondNewestServer) {
              const serverId = secondNewestServer.id;
              if (storedServerData[placeId] && storedServerData[placeId][serverId] && storedServerData[placeId][serverId].likelyInactive) {
                        console.log(`Server ${serverId} in place ${placeId} is marked likely inactive and not joining.`);
                       return;
             }
            const url = `roblox://experiences/start?placeId=${placeId}&gameInstanceId=${serverId}`;
            window.open(url, '_blank');
            console.log("Joining second newest server:", secondNewestServer);
    
        } else {
             console.log("No eligible servers found to join");
            }
    }
  function joinSpecificRegionServer(region) {
    if (!storedServerData[placeId]) {
        console.log("No server data stored for this place.");
        return;
    }
    let serverToJoin = null;

   // Loop through the servers found in the current fetch
    for (const server of allServers){
           if (storedServerData[placeId] && storedServerData[placeId][server.id] && storedServerData[placeId][server.id].likelyInactive) {
                    continue;
              }
        if (serverLocations[server.id] && mapStateToRegion(serverLocations[server.id]) === region) {
              serverToJoin = server;
              break;
        }
    }
     //If no server from this fetch has been found use stored server data.
   if (serverToJoin == null){
         for (const serverId in storedServerData[placeId]) {
              const server = storedServerData[placeId][serverId];
                  if (storedServerData[placeId][serverId].likelyInactive) {
                    continue;
                  }
                if (server.l && mapStateToRegion(server.l) === region) {
                    serverToJoin = server;
                     break;
                 }
          }
   }
      if (serverToJoin) {
        const serverId = serverToJoin.i;
        const url = `roblox://experiences/start?placeId=${placeId}&gameInstanceId=${serverId}`;
        window.open(url, '_blank');
         console.log("Joining specific region server:", serverToJoin, " region:", region );
    }  else {
         console.log("No eligible servers found to join in region:", region);
        }
}
async function fetchGeolocation(ip) {
    try {
        const response = await fetch(`https://get.geojs.io/v1/ip/country/${ip}.json`);
        if (response.status === 200) {
            const data = await response.json();
            const locationData = await fetch(`https://get.geojs.io/v1/ip/geo/${ip}.json`);
            const location = await locationData.json();
            return {
                name: data.name || "Unknown",
                countryCode: data.country || "Unknown",
                countryCode3: data.country_3 || "Unknown",
                latitude: parseFloat(location.latitude),
                longitude: parseFloat(location.longitude),
                ip: data.ip || ip,
            };
        }
    } catch (error) {
        console.error(`Error fetching geolocation for IP ${ip}:`, error);
    }
    return null;
}

    function mapStateToRegion(data) {
        if (data && data.countryCode === "US") {
            return "US";
        }
        return data?.countryCode;
    }
    async function fetchUserLocation(retries = 2) {
        try {
            const response = await fetch("https://api.ipify.org?format=json");
            const data = await response.json();
            userIP = data.ip;
            const geolocationData = await fetchGeolocation(userIP);
            if (geolocationData) {
                userLocation = geolocationData;
                userRegion = mapStateToRegion(geolocationData);
            } else {
                if (retries > 0) {
                    console.log("retrying location fetch...")
                    await delay(1000)
                    await fetchUserLocation(retries - 1)
                }
            }
        } catch (error) {
            console.error("Error fetching user location:", error);
            if (retries > 0) {
                console.log("retrying location fetch...")
                await delay(1000)
                await fetchUserLocation(retries - 1)
            }
        }
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
                    }
                } else {
                     if (!fetchedServerIds.has(serverId)) {
                        if (now - server.t > INACTIVE_THRESHOLD) {
                             delete storedServerData[currentPlaceId][serverId]
                          } else {
                          }
                      }
                   }
              }
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
    
    function scoreServer(server, userLocation, serverLocation, fps, ping) {
        let  locationData = serverLocation;
           if (storedServerData[placeId] && storedServerData[placeId][server.id]){
                locationData = storedServerData[placeId][server.id].l;
             }
         
          const distance = calculateDistance(
              userLocation.latitude,
              userLocation.longitude,
              locationData?.x || locationData?.lat || 0,
              locationData?.y || locationData?.lon || 0
          );


        const normalizedFPS = (fps - 0) / (60 - 0);
        const normalizedPing = (300 - ping) / (300 - 0);

        const clampedFPS = Math.max(0, Math.min(1, normalizedFPS));
        const clampedPing = Math.max(0, Math.min(1, normalizedPing));

        const distanceScore = Math.max(0, 1 - (distance / 3000));


        const fpsWeight = 0.5;
        const distanceWeight = 0.2;
        const pingWeight = 0.3;


        const score = (fpsWeight * clampedFPS) +
            (distanceWeight * distanceScore) +
            (pingWeight * clampedPing);


        serverScores[server.id] = score;
    }

    function findBestServer() {
        let combinedServers = [];

         if (allServers.length > 0 && userLocation) {
            combinedServers = [...allServers]
             if(storedServerData && storedServerData[placeId]) {
                for (const serverId in storedServerData[placeId]) {
                 if (!storedServerData[placeId][serverId].likelyInactive && Date.now() - storedServerData[placeId][serverId].lastSeenTimestamp < INACTIVE_THRESHOLD ){
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
                 if (!storedServerData[placeId][serverId].likelyInactive && Date.now() - storedServerData[placeId][serverId].lastSeenTimestamp < INACTIVE_THRESHOLD ){
                  combinedServers.push(storedServerData[placeId][serverId])
                 }
               }
         } else {
           return null;
       }
           
        if(combinedServers.length === 0){
          return null
        }


       let bestServer = null;
       let bestScore = -Infinity;
        for (const server of combinedServers) {
           if (storedServerData[placeId] && storedServerData[placeId][server.id] && storedServerData[placeId][server.id].likelyInactive) {
                 continue;
              }
            const serverScore = serverScores[server.id]
            if (serverScore > bestScore) {
                bestScore = serverScore
                bestServer = server;
            }
        }
        return bestServer;
   }


    function joinBestServer(server) {
         if (!server) {
            console.log("No server found with a score.");
            if (allServers.length > 0) {
                const firstServer = allServers[0]
                const serverId = firstServer.id;
                  if (storedServerData[placeId] && storedServerData[placeId][serverId] && storedServerData[placeId][serverId].likelyInactive) {
                    console.log(`Server ${serverId} in place ${placeId} is marked likely inactive and not joining.`);
                   return
                  }
                if (serverId) {
                    const url = `roblox://experiences/start?placeId=${placeId}&gameInstanceId=${serverId}`;
                    window.open(url, '_blank');
                } else {
                    console.error("Server ID not found for region:");
                }
            }
            return;
        }
        const serverId = server.i;
          if (storedServerData[placeId] && storedServerData[placeId][serverId] && storedServerData[placeId][serverId].likelyInactive) {
                    console.log(`Server ${serverId} in place ${placeId} is marked likely inactive and not joining.`);
                   return
         }
        if (serverId) {
            const url = `roblox://experiences/start?placeId=${placeId}&gameInstanceId=${serverId}`;
            window.open(url, '_blank');
        } else {
            console.error("Server ID not found for region:");
        }
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