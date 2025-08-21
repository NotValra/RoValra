// This script is stable, if u read it with your eyes closed.

function initializeExtensionFeatures() {
function isExcludedButton(button) {
        if (!button || typeof button.matches !== 'function') return false;
        if (button.classList.contains('rovalra-copy-join-link') || button.classList.contains('rovalra-vip-invite-link') || button.classList.contains('rovalra-vip-new-invite-link')) return true;
        if (button.getAttribute('data-bind') === 'game-context-menu' && button.classList.contains('rbx-menu-item')) return true;
        return false;
    }


    function preventRoProShareButton(serverElement) {
        if (serverElement && !serverElement.classList.contains('ropro-server-invite-added')) {
            serverElement.classList.add('ropro-server-invite-added');
        }
    }

    function removeFullServerStatus(serverElement) {
        if (!serverElement) return;

        const statusElements = serverElement.querySelectorAll('.text-info.rbx-game-status');
        statusElements.forEach(element => {
            const originalText = element.textContent;
            const cleanedText = originalText.replace(/^\s*(Region:|Ping:|Server is full).*$/gim, '').trim();

            if (element.textContent !== cleanedText) {
                element.textContent = cleanedText;
            }
        });
    }

    function continuouslyRemoveFullServerStatus() {
        const statusElements = document.querySelectorAll('.text-info.rbx-game-status');

        statusElements.forEach(element => {
            const originalText = element.textContent;
            const cleanedText = originalText.replace(/^\s*(Region:|Ping:|Server is full).*$/gim, '').trim();

            if (element.textContent !== cleanedText) {
                element.textContent = cleanedText;
            }
        });
    }

    function removeServerPerformanceElement(serverElement) {
        if (!serverElement) return;
        const performanceElement = serverElement.querySelector('.server-performance.text-info');
        if (performanceElement) {
            performanceElement.remove();
        }
    }

    var fullServerStatusInterval = setInterval(continuouslyRemoveFullServerStatus, 200);

    let serverIpMap = null;
    let serverLocations = {};
    let serverUptimes = {};
    let csrfToken = null;
    let uptimeBatch = new Set();
    let uptimeTimeout;


async function fetchServerUptime(placeId, serverIdsToFetch) {
    const validServerIds = serverIdsToFetch.filter(id => id && id !== 'null');
    if (validServerIds.length === 0) return;

    try {
        // You are allowed to use this API for personal projects only which is limited to open source projects on GitHub, they must be free and you must credit the RoValra repo.
        // You are not allowed to use the API for projects on the chrome web store or any other extension store. If you want to use the API for a website dm be on discord: Valra and we can figure something out.
        // If you want to use the API for something thats specifically said isnt allowed or you might be unsure if its allowed, please dm me on discord: Valra, Ill be happy to check out your stuff and maybe allow you to use it for your project.
        const response = await fetch('https://apis.rovalra.com/get_server_details', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ place_id: placeId, server_ids: validServerIds })
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const data = await response.json();

        if (data.status !== 'success' || !Array.isArray(data.servers)) {
            throw new Error(data.message || "API did not return a success status.");
        }

        const now = new Date();
        const returnedServerIds = new Set();
        const uptimeUpdates = new Map();

        data.servers.forEach(serverDetails => {
            const { server_id, first_seen } = serverDetails;
            if (!server_id) return;
            returnedServerIds.add(server_id);

            const firstSeenDate = new Date(first_seen.endsWith('Z') ? first_seen : first_seen + 'Z');
            const uptime = !isNaN(firstSeenDate.getTime()) ? Math.max(0, (now - firstSeenDate) / 1000) : 'error';
            serverUptimes[server_id] = uptime;
            uptimeUpdates.set(server_id, uptime);
        });

        validServerIds.forEach(serverId => {
            if (!returnedServerIds.has(serverId)) {
                serverUptimes[serverId] = 'not_found';
                uptimeUpdates.set(serverId, 'not_found');
            }
        });

        uptimeUpdates.forEach((uptime, serverId) => {
            const serverElement = document.querySelector(`.rbx-public-game-server-item[data-rovalra-serverid="${serverId}"]`);
            if (serverElement) {
                displayUptime(serverElement, uptime);
            }
        });

    } catch (error) {
        validServerIds.forEach(serverId => {
            if (serverUptimes[serverId] === 'fetching') {
                serverUptimes[serverId] = 'error';
                const serverElement = document.querySelector(`.rbx-public-game-server-item[data-rovalra-serverid="${serverId}"]`);
                if (serverElement) {
                    displayUptime(serverElement, 'error');
                }
            }
        });
    }
}


async function displayUptime(server, uptimeValue) {
    const settings = await new Promise(resolve => {
        chrome.storage.local.get(['serverUptimeServerLocationEnabled'], result => resolve(result));
    });

    if (settings.serverUptimeServerLocationEnabled === false || !server || server.hasAttribute('data-rovalra-uptime-rendered')) {
        return;
    }

    let uptimeElement = server.querySelector('.rovalra-uptime-info');
    if (!uptimeElement) {
        uptimeElement = document.createElement('div');
        uptimeElement.className = 'rovalra-uptime-info text-info';
        uptimeElement.style.cssText = `display: flex; align-items: center; gap: 6px; margin-top: 4px; font-size: 14px;`;
        const playerCountElement = server.querySelector('.text-info.rbx-game-status');
        if (playerCountElement?.parentNode) {
            playerCountElement.parentNode.insertBefore(uptimeElement, playerCountElement.nextSibling);
        } else {
            return;
        }
    }

    uptimeElement.style.color = document.body.classList.contains('light-theme') ? 'rgb(73, 77, 90)' : '#B8B8B8';

    let uptimeString;
    if (typeof uptimeValue === 'number' && uptimeValue >= 0) {
        if (uptimeValue < 3600) {
            uptimeString = 'New Server';
        } else {
            const days = Math.floor(uptimeValue / 86400);
            const hours = Math.floor((uptimeValue % 86400) / 3600);
            const minutes = Math.floor((uptimeValue % 3600) / 60);
            const parts = [];
            if (days > 0) parts.push(`${days}d`);
            if (hours > 0) parts.push(`${hours}h`);
            if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);
            uptimeString = parts.join(' ');
        }
    } else {
        uptimeString = 'N/A';
    }

    const uptimeSVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 6V12L16 14M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const newContent = `${uptimeSVG} <span style="line-height: 1;">${uptimeString.trim()}</span>`;

    if (uptimeElement.innerHTML !== newContent) {
        uptimeElement.innerHTML = newContent;
    }

    server.setAttribute('data-rovalra-uptime-rendered', 'true');
}


    function updateAllServerRegions() {
        serverLocations = {}; 
        
        const allServers = document.querySelectorAll('.rbx-public-game-server-item, .rbx-private-game-server-item, .rbx-friends-game-server-item');
        allServers.forEach(server => {
            const serverId = server.getAttribute('data-rovalra-serverid');
            if (serverId && serverId !== 'null') {
                server.querySelector('.rovalra-region-info')?.remove();
                server.querySelector('.rovalra-server-full-info')?.remove();
                

                fetchAndDisplayRegion(server, serverId);
            }
        });
    }

    async function loadServerIpMap() {
        if (window.rovalraDatacenterState) return; 
        window.rovalraDatacenterState = 'loading_fallback';

        const processAndStoreData = (serverListData) => {
            let dataElement = document.getElementById('rovalra-datacenter-data-storage');
            if (!dataElement) {
                dataElement = document.createElement('script');
                dataElement.id = 'rovalra-datacenter-data-storage';
                dataElement.type = 'application/json';
                (document.head || document.documentElement).appendChild(dataElement);
            }
            dataElement.textContent = JSON.stringify(serverListData);

            const map = {};
            if (Array.isArray(serverListData)) {
                serverListData.forEach(dc => {
                    if (dc.dataCenterIds && Array.isArray(dc.dataCenterIds) && dc.location) {
                        dc.dataCenterIds.forEach(id => {
                            map[id] = dc.location;
                        });
                    }
                });
            }
            serverIpMap = map; 
        };

        try {
            const fallbackUrl = chrome.runtime.getURL('data/ServerList.json');
            const fallbackResponse = await fetch(fallbackUrl);
            if (!fallbackResponse.ok) throw new Error(`Status: ${fallbackResponse.status}`);
            const localData = await fallbackResponse.json();
            processAndStoreData(localData);
            window.rovalraDatacenterState = 'fallback_loaded';
        } catch (e) {
            console.error("Could not load local fallback ServerList.json", e);
            serverIpMap = {}; 
        }

        window.rovalraDatacenterState = 'fetching_api';
        const API_TIMEOUT = 8000; 
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);
            // You are allowed to use this API for personal projects only which is limited to open source projects on GitHub, they must be free and you must credit the RoValra repo.
            // You are not allowed to use the API for projects on the chrome web store or any other extension store. If you want to use the API for a website dm be on discord: Valra and we can figure something out.
            // If you want to use the API for something thats specifically said isnt allowed or you might be unsure if its allowed, please dm me on discord: Valra, Ill be happy to check out your stuff and maybe allow you to use it for your project.
            const apiResponse = await fetch('https://apis.rovalra.com/datacenters', {
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!apiResponse.ok) throw new Error(`API returned status: ${apiResponse.status}`);
            
            const apiData = await apiResponse.json();
            processAndStoreData(apiData); 
            
            updateAllServerRegions();

        } catch (e) {

        } finally {
            window.rovalraDatacenterState = 'complete'; 
        }
    }
    
    async function getGlobalCsrfToken() {
        if (csrfToken) return csrfToken;
        try {
            const response = await fetch('https://auth.roblox.com/v2/logout', {
                method: 'POST',
                credentials: 'include'
            });
            const token = response.headers.get('x-csrf-token');
            if (token) {
                csrfToken = token;
                return token;
            }
        } catch (e) {  }

        try {
            const meta = document.querySelector("meta[name='csrf-token']");
            if (meta) {
                csrfToken = meta.getAttribute('data-token');
                return csrfToken;
            }
        } catch (e) {  }

        return null;
    }

    function getFullLocationName(location) {
        if (!location || typeof location !== 'object') {
            return "Unknown Region";
        }

        const { city, region, country } = location;
        const parts = [];

        if (city) {
            const cityAbbreviations = {
                "Los Angeles": "LA",
                "New York City": "NYC"
            };
            parts.push(cityAbbreviations[city] || city);
        }

        if (country === "US" && region && region !== city) {
            parts.push(region);
        }

        if (country) {
            const countryAbbreviations = {
                "US": "USA",
                "GB": "UK"
            };
            const countryNames = {
                "AU": "Australia",
                "DE": "Germany",
                "FR": "France",
                "IN": "India",
                "JP": "Japan",
                "NL": "Netherlands",
                "SG": "Singapore"
            };
            parts.push(countryAbbreviations[country] || countryNames[country] || country);
        }

        return [...new Set(parts)].join(', ') || "Unknown Region";
    }


async function fetchAndDisplayRegion(server, serverId) {
    const settings = await new Promise(resolve => {
        chrome.storage.local.get(['serverUptimeServerLocationEnabled'], result => resolve(result));
    });

    if (settings.serverUptimeServerLocationEnabled === false) {
        server.querySelector('.rovalra-region-info')?.remove();
        server.querySelector('.rovalra-server-full-info')?.remove();
        return;
    }

    if (serverLocations[serverId]) {
        const action = serverLocations[serverId] === 'full' ? displayServerFullStatus : displayRegion;
        action(server, serverLocations[serverId]);
        return;
    }

    const token = await getGlobalCsrfToken();
    const placeId = server.getAttribute('data-placeid') || window.location.href.match(/\/games\/(\d+)\//)?.[1];

    if (!token || !serverIpMap || !placeId) {
        serverLocations[serverId] = "Unknown Region";
        displayRegion(server, "Unknown Region");
        return;
    }

    try {
        const response = await fetch(`https://gamejoin.roblox.com/v1/join-game-instance`, {
            method: 'POST',
            headers: { "Accept": "application/json", "Content-Type": "application/json", "X-Csrf-Token": token },
            body: JSON.stringify({ placeId: parseInt(placeId, 10), gameId: serverId, gameJoinAttemptId: createUUID() }),
            credentials: 'include'
        });

        if (server.getAttribute('data-rovalra-serverid') !== serverId) return;

        let fullRegionName = "Unknown Region";

        if (response.ok) {
            const serverInfo = await response.json();
            if (server.getAttribute('data-rovalra-serverid') !== serverId) return;

            const joinButton = server.querySelector('.game-server-join-btn');

            if (serverInfo.status === 22) {
                if (joinButton) {
                    joinButton.textContent = serverInfo.queuePosition > 0 ? `Join Queue: ${serverInfo.queuePosition}` : 'Server Full';
                    joinButton.classList.replace('btn-primary-md', 'btn-secondary-md');
                }
                displayServerFullStatus(server);
                serverLocations[serverId] = 'full';
                return;
            } else if (joinButton && serverInfo.status === 2 && serverInfo.queuePosition === 0) {
                joinButton.textContent = 'Join';
                joinButton.classList.replace('btn-secondary-md', 'btn-primary-md');
            }

            if (serverInfo.status != 2 && serverInfo.status != 22 && !server.classList.contains('rbx-friends-game-server-item') && !server.classList.contains('rbx-private-game-server-item')) {
                if (joinButton) {
                    joinButton.textContent = 'Server is Unavailable';
                    joinButton.disabled = true;
                }
            }

            if (serverInfo.joinScript) {
                const joinScriptData = typeof serverInfo.joinScript === 'string' ? JSON.parse(serverInfo.joinScript) : serverInfo.joinScript;
                const dataCenterId = joinScriptData?.DataCenterId;
                if (dataCenterId && serverIpMap[dataCenterId]) {
                    fullRegionName = getFullLocationName(serverIpMap[dataCenterId]);
                }
            }
        }
        
        serverLocations[serverId] = fullRegionName;
        displayRegion(server, fullRegionName);

    } catch (error) {
        if (server.getAttribute('data-rovalra-serverid') === serverId) {
            serverLocations[serverId] = "Unknown Region";
            displayRegion(server, "Unknown Region");
        }
    }
}

    function displayServerFullStatus(server) {
        if (!server || server.querySelector('.rovalra-server-full-info')) return;

        server.querySelector('.rovalra-region-info')?.remove();
        
        const playerCountElement = server.querySelector('.text-info.rbx-game-status');
        if (!playerCountElement) return;

        const fullElement = document.createElement('div');
        fullElement.className = 'rovalra-server-full-info text-info';
        fullElement.style.cssText = `
            display: flex;
            align-items: center;
            gap: 6px;
            margin-top: 4px;
            font-size: 14px;
        `;
        fullElement.style.color = document.body.classList.contains('light-theme') ? 'rgb(73, 77, 90)' : '#B8B8B8';

        fullElement.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2.4578C14.053 2.16035 13.0452 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 10.2847 21.5681 8.67022 20.8071 7.25945M17 5.75H17.005M10.5001 21.8883L10.5002 19.6849C10.5002 19.5656 10.5429 19.4502 10.6205 19.3596L13.1063 16.4594C13.3106 16.2211 13.2473 15.8556 12.9748 15.6999L10.1185 14.0677C10.0409 14.0234 9.97663 13.9591 9.93234 13.8814L8.07046 10.6186C7.97356 10.4488 7.78657 10.3511 7.59183 10.3684L2.06418 10.8607M21 6C21 8.20914 19 10 17 12C15 10 13 8.20914 13 6C13 3.79086 14.7909 2 17 2C19.2091 2 21 3.79086 21 6ZM17.25 5.75C17.25 5.88807 17.1381 6 17 6C16.8619 6 16.75 5.88807 16.75 5.75C16.75 5.61193 16.8619 5.5 17 5.5C17.1381 5.5 17.25 5.61193 17.25 5.75Z"></path></svg>
            <span style="line-height: 1;">Server is Full</span>
        `;

        playerCountElement.parentNode.insertBefore(fullElement, playerCountElement.nextSibling);
    }

    function displayRegion(server, regionName) {
        if (!server) return;
        const displayText = (regionName && regionName !== "Unknown Region") ? regionName : "N/A";
        server.querySelector('.rovalra-server-full-info')?.remove();
        const playerCountElement = server.querySelector('.text-info.rbx-game-status');
        if (!playerCountElement) return;

        let regionElement = server.querySelector('.rovalra-region-info');
        if (!regionElement) {
            regionElement = document.createElement('div');
            regionElement.className = 'rovalra-region-info text-info';
            regionElement.style.cssText = `
                display: flex;
                align-items: center;
                gap: 6px;
                margin-top: 4px;
            `;
            
            const uptimeElement = server.querySelector('.rovalra-uptime-info');
            if (uptimeElement && uptimeElement.parentNode) {
                uptimeElement.parentNode.insertBefore(regionElement, uptimeElement.nextSibling);
            } else {
                playerCountElement.parentNode.insertBefore(regionElement, playerCountElement.nextSibling);
            }
        }

        regionElement.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2.4578C14.053 2.16035 13.0452 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 10.2847 21.5681 8.67022 20.8071 7.25945M17 5.75H17.005M10.5001 21.8883L10.5002 19.6849C10.5002 19.5656 10.5429 19.4502 10.6205 19.3596L13.1063 16.4594C13.3106 16.2211 13.2473 15.8556 12.9748 15.6999L10.1185 14.0677C10.0409 14.0234 9.97663 13.9591 9.93234 13.8814L8.07046 10.6186C7.97356 10.4488 7.78657 10.3511 7.59183 10.3684L2.06418 10.8607M21 6C21 8.20914 19 10 17 12C15 10 13 8.20914 13 6C13 3.79086 14.7909 2 17 2C19.2091 2 21 3.79086 21 6ZM17.25 5.75C17.25 5.88807 17.1381 6 17 6C16.8619 6 16.75 5.88807 16.75 5.75C16.75 5.61193 16.8619 5.5 17 5.5C17.1381 5.5 17.25 5.61193 17.25 5.75Z"></path></svg>
            <span style="font-size: 14px; line-height: 1;">${displayText}</span>
        `;
        regionElement.style.color = document.body.classList.contains('light-theme') ? 'rgb(73, 77, 90)' : '#B8B8B8';
    }
    var buttonsToMonitor = {};

    function checkAndRepositionButtons() {
        var buttonIds = Object.keys(buttonsToMonitor);
        if (buttonIds.length === 0) {
            return;
        }

        for (var i = 0; i < buttonIds.length; i++) {
            var buttonId = buttonIds[i];
            var buttonInfo = buttonsToMonitor[buttonId];

            if (!document.contains(buttonInfo.copyButton)) {
                delete buttonsToMonitor[buttonId];
                continue;
            }
            var shareButtons = [
                ...Array.from(buttonInfo.detailsElement.querySelectorAll('.share-button')),
                ...Array.from(buttonInfo.server.querySelectorAll('.share-button'))
            ];
            shareButtons.forEach(function(button) {

                if (!isExcludedButton(button)) { button.remove(); }
            });

            var joinButton = buttonInfo.detailsElement.querySelector('.game-server-join-btn');
            if (joinButton) {
                joinButton.style.width = '100%';
            }

            var createServerLink = buttonInfo.detailsElement.querySelector('.create-server-link');
            if (createServerLink) {
                createServerLink.style.width = '100%';

                buttonInfo.copyButton.style.width = '100%';
                createServerLink.insertAdjacentElement('afterend', buttonInfo.copyButton);
                delete buttonsToMonitor[buttonId];
            } else {
                buttonInfo.attempts++;
                if (buttonInfo.attempts >= 10) {
                    delete buttonsToMonitor[buttonId];
                }
            }
        }
    }
    setInterval(function() {
        const serverElements = document.querySelectorAll('.rbx-public-game-server-item, .rbx-private-game-server-item, .rbx-friends-game-server-item');

        serverElements.forEach(server => {
            if (server.hasAttribute('data-rovalra-uptime-rendered')) {
                return;
            }
            const serverId = server.getAttribute('data-rovalra-serverid');
             if (!serverId || serverId === 'null') {
                    return;
                }

            const uptimeStatus = serverUptimes[serverId];

            if (uptimeStatus !== undefined && uptimeStatus !== 'fetching') {
                displayUptime(server, uptimeStatus);
            }
        });
    }, 750);
    var serverIdInterval = setInterval(function () {
        chrome.storage.local.get(['showfullserveridEnabled', 'inviteEnabled', 'enableFriendservers'], function(result) {
            const showFullId = result.showfullserveridEnabled !== false;
            const inviteEnabled = result.inviteEnabled !== false;
            const enableFriendservers = result.enableFriendservers !== false;

            const serverElements = document.querySelectorAll('.rbx-public-game-server-item, .rbx-private-game-server-item, .rbx-friends-game-server-item');
            let placeId = null;

            serverElements.forEach(server => {
                preventRoProShareButton(server);
                removeFullServerStatus(server);
                removeServerPerformanceElement(server);

                const serverId = server.getAttribute('data-rovalra-serverid');
                if (!serverId || serverId === 'null') {
                    return;
                }

                const processedId = server.getAttribute('data-rovalra-processed-id');

                if (processedId !== serverId) {
                    server.querySelector('.rovalra-region-info')?.remove();
                    server.querySelector('.rovalra-uptime-info')?.remove();
                    server.querySelector('.rovalra-server-full-info')?.remove();
                    server.removeAttribute('data-rovalra-uptime-rendered');

                    delete serverLocations[serverId];
                    delete serverUptimes[serverId];

                    fetchAndDisplayRegion(server, serverId);
                    addCopyJoinLinkButton(server, serverId);
                    if (showFullId) {
                    let serverIDTextElement = server.querySelector('.server-id-text.text-info.xsmall');
                    if (!serverIDTextElement) {
                        serverIDTextElement = document.createElement('div');
                        serverIDTextElement.className = 'server-id-text text-info xsmall';
                        const detailsContainer = server.querySelector('.rbx-public-game-server-details, .rbx-friends-game-server-details');
                        if (detailsContainer) {
                            detailsContainer.appendChild(serverIDTextElement);
                            serverIDTextElement.style.fontSize = '9px';
                        }
                    }
                    serverIDTextElement.textContent = 'ID: ' + serverId;
                    serverIDTextElement.style.fontSize = '9px';
                    addCopyJoinLinkButton(server, serverId, serverIDTextElement);
                    }
                    if (!serverUptimes[serverId]) {
                         serverUptimes[serverId] = 'fetching';
                         uptimeBatch.add(serverId);
                         if (!placeId) {
                             placeId = server.getAttribute('data-placeid') || window.location.href.match(/\/games\/(\d+)\//)?.[1];
                         }
                    }

                    server.setAttribute('data-rovalra-processed-id', serverId);
                }

                if (showFullId) {
                    let serverIDTextElement = server.querySelector('.server-id-text.text-info.xsmall');
                    if (!serverIDTextElement) {
                        serverIDTextElement = document.createElement('div');
                        serverIDTextElement.className = 'server-id-text text-info xsmall';
                        const detailsContainer = server.querySelector('.rbx-public-game-server-details, .rbx-friends-game-server-details');
                        if (detailsContainer) {
                            detailsContainer.appendChild(serverIDTextElement);
                        }
                    }

                    const displayedServerId = serverIDTextElement.textContent.replace('ID: ', '');
                    if (displayedServerId !== serverId) {
                        serverIDTextElement.textContent = 'ID: ' + serverId;
                        serverIDTextElement.style.fontSize = '9px';
                        if (inviteEnabled) {
                             addCopyJoinLinkButton(server, serverId, serverIDTextElement);
                        }
                    }
                } else {
                     if (inviteEnabled) {
                        addCopyJoinLinkButton(server, serverId);
                     }
                }
            });

            if (uptimeBatch.size > 0 && placeId) {
                clearTimeout(uptimeTimeout);
                uptimeTimeout = setTimeout(() => {
                    const batchToFetch = Array.from(uptimeBatch);
                    uptimeBatch.clear();
                    fetchServerUptime(placeId, batchToFetch);
                }, 250);
            }
        });
    }, 300);

    function processServerElements(selector, showFullId, inviteEnabled, checkPrivate = false) {
        var serverElements = document.querySelectorAll(selector);
        let placeId = null;

        for (var i = 0; i < serverElements.length; i++) {
            var server = serverElements[i];

            preventRoProShareButton(server);
            removeFullServerStatus(server);
            removeServerPerformanceElement(server);

            if (selector === '.rbx-friends-game-server-item') {
                cleanupServerUI(server, true);
            } else {
                cleanupServerUI(server, false);
            }

            var serverId = server.getAttribute('data-rovalra-serverid');

            if (serverId) {
                fetchAndDisplayRegion(server, serverId);

                if (!server.hasAttribute('data-rovalra-uptime-status')) {
                    server.setAttribute('data-rovalra-uptime-status', 'processed');
                    copy
                    if (serverUptimes[serverId] && typeof serverUptimes[serverId] === 'number') {
                        displayUptime(server, serverUptimes[serverId]);
                    } else {
                        serverUptimes[serverId] = 'fetching';
                        uptimeBatch.add(serverId);
                        if (!placeId) {
                            placeId = server.getAttribute('data-placeid') || window.location.href.match(/\/games\/(\d+)\//)?.[1];
                        }
                    }
                }
            }

            var vipServerId = server.getAttribute('data-rovalra-vipserverid');
            if (vipServerId && selector === '.rbx-private-game-server-item') {
                addVipServerInviteButton(server, vipServerId);
            }

            if (serverId && serverId.length > 0) {
                if (showFullId) {
                    var serverIDTextElement = server.querySelector('.server-id-text.text-info.xsmall');

                    if (serverIDTextElement) {
                        var displayedText = serverIDTextElement.textContent;
                        var displayedServerId = displayedText.replace('ID: ', '');

                        if (displayedServerId !== serverId) {
                            serverIDTextElement.textContent = 'ID: ' + serverId;
                            serverIDTextElement.style.fontSize = '9px';

                            server.setAttribute('data-rovalra-serverid-displayed', serverId);

                            var existingCopyButton = server.querySelector('.rovalra-copy-join-link');
                            if (existingCopyButton) {
                                existingCopyButton.remove();
                            }

                            var privateLabel = server.querySelector('.rovalra-private-server-label');
                            if (privateLabel) {
                                privateLabel.remove();
                            }

                            if (inviteEnabled) {
                                addCopyJoinLinkButton(server, serverId, serverIDTextElement);
                            }
                        }
                    }
                }

                if (checkPrivate) {
                    server.setAttribute('data-rovalra-invite-enabled', inviteEnabled);
                    checkIfServerIsPrivate(server, serverId);
                } else if (!showFullId) {
                    if (inviteEnabled) {
                        addCopyJoinLinkButton(server, serverId);
                    }
                }
            }
        }

        if (uptimeBatch.size > 0 && placeId) {
            clearTimeout(uptimeTimeout);
            uptimeTimeout = setTimeout(() => {
                const batchToFetch = Array.from(uptimeBatch);
                uptimeBatch.clear();
                fetchServerUptime(placeId, batchToFetch);
            }, 500);
        }
    }

    function checkIfServerIsPrivate(server, serverId) {
        if (server.hasAttribute('data-rovalra-private-checked')) {
            if (server.getAttribute('data-rovalra-is-private') === 'false') {
                chrome.storage.local.get(['inviteEnabled', 'enableFriendservers', 'showfullserveridEnabled'], function(result) {
                    var inviteEnabled = result.inviteEnabled !== false;
                    var enableFriendservers = result.enableFriendservers !== false;
                    var showFullId = result.showfullserveridEnabled !== false;

                    if (inviteEnabled && enableFriendservers) {
                        if (showFullId) {
                            var serverIDTextElement = server.querySelector('.server-id-text.text-info.xsmall');
                            if (serverIDTextElement) {
                                addCopyJoinLinkButton(server, serverId, serverIDTextElement);
                                return;
                            }
                        }
                        addCopyJoinLinkButton(server, serverId);
                    }
                });
            }
            return;
        }

        server.setAttribute('data-rovalra-private-checked', 'true');

        var placeId = server.getAttribute('data-placeid');
        if (!placeId) {
            var gameDetailsElement = document.querySelector('#game-detail-page');
            if (gameDetailsElement) {
                var placeIdMatch = window.location.href.match(/\/games\/(\d+)\//);
                if (placeIdMatch && placeIdMatch[1]) {
                    placeId = placeIdMatch[1];
                }
            }
        }

        if (!placeId) return;

        var gameJoinAttemptId = createUUID();

        fetch('https://gamejoin.roblox.com/v1/join-game-instance', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                gameId: serverId,
                gameJoinAttemptId: gameJoinAttemptId,
                placeId: parseInt(placeId)
            }),
            credentials: 'include'
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 12 ||
                (data.message && data.message.includes("Can't join private instance"))) {

                server.setAttribute('data-rovalra-is-private', 'true');

                if (!server.querySelector('.rovalra-private-server-label')) {
                    addPrivateServerLabel(server);
                }

                var existingCopyButton = server.querySelector('.rovalra-copy-join-link');
                if (existingCopyButton) {
                    existingCopyButton.remove();
                }
            } else {
                server.setAttribute('data-rovalra-is-private', 'false');

                chrome.storage.local.get(['enableFriendservers', 'showfullserveridEnabled'], function(result) {
                    var enableFriendservers = result.enableFriendservers !== false;
                    var inviteEnabled = server.getAttribute('data-rovalra-invite-enabled') !== 'false';
                    var showFullId = result.showfullserveridEnabled !== false;

                    if (inviteEnabled && enableFriendservers) {
                        if (showFullId) {
                            var serverIDTextElement = server.querySelector('.server-id-text.text-info.xsmall');
                            if (serverIDTextElement) {
                                addCopyJoinLinkButton(server, serverId, serverIDTextElement);
                                return;
                            }
                        }
                        addCopyJoinLinkButton(server, serverId);
                    }
                });
            }
        })
        .catch(function(error) {});
    }

    function createUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0,
                v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    function addPrivateServerLabel(server) {
        if (server.classList.contains('rbx-friends-game-server-item')) {
            chrome.storage.local.get(['enableFriendservers'], function(result) {
                var enableFriendservers = result.enableFriendservers !== false;
                if (!enableFriendservers) {
                    return;
                }
                createAndAddPrivateServerLabel(server);
            });
        } else {
            createAndAddPrivateServerLabel(server);
        }
    }

    function createAndAddPrivateServerLabel(server) {
        var label = document.createElement('div');
        label.className = 'text-info rbx-game-status rbx-friends-game-server-status text-overflow rovalra-private-server-label';
        label.textContent = 'Private Server';

        var isLightMode = document.querySelector('.rbx-body.light-theme') !== null;

        label.style.fontWeight = '600';
        label.style.fontSize = '18px';
        label.style.lineHeight = '1.4em';
        label.style.color = isLightMode ? 'rgb(32, 34, 39)' : 'rgb(247, 247, 248)';
        label.style.textOverflow = 'ellipsis';
        label.style.overflow = 'hidden';
        label.style.whiteSpace = 'nowrap';
        label.style.margin = '0';

        var joinButton = server.querySelector('.game-server-join-btn');
        if (joinButton) {
            joinButton.parentElement.insertBefore(label, joinButton);
        } else {
            var serverDetails = server.querySelector('.rbx-game-server-details');
            if (serverDetails) {
                serverDetails.appendChild(label);
            } else {
                server.appendChild(label);
            }
        }
    }

    async function addCopyJoinLinkButton(server, serverId, serverIDTextElement = null) {
        if (!serverId || serverId === 'null') {
            return;
        }

        const settings = await new Promise(resolve => {
            chrome.storage.local.get(['inviteEnabled', 'enableFriendservers'], result => resolve(result));
        });

        const inviteEnabled = settings.inviteEnabled !== false;
        const enableFriendservers = settings.enableFriendservers !== false;
        const isFriendServer = server.classList.contains('rbx-friends-game-server-item');

        if (isFriendServer) {
            if (!enableFriendservers) {
                server.querySelector('.rovalra-copy-join-link')?.remove();
                return;
            }
        } else {
            if (!inviteEnabled) {
                server.querySelector('.rovalra-copy-join-link')?.remove();
                return;
            }
        }

        if (server.querySelector(`.rovalra-copy-join-link[data-serverid="${serverId}"]`)) return;

        server.querySelector('.rovalra-copy-join-link')?.remove();

        const placeId = server.getAttribute('data-placeid') || window.location.href.match(/\/games\/(\d+)\//)?.[1];
        if (!placeId) return;

        const copyButton = document.createElement('button');
        copyButton.type = 'button';
        copyButton.className = 'btn-full-width btn-control-xs rbx-public-game-server-join btn-primary-md btn-min-width rovalra-copy-join-link';
        copyButton.textContent = 'Share';
        copyButton.style.marginTop = '5px';
        copyButton.style.width = '100%';
        copyButton.setAttribute('data-serverid', serverId);

        copyButton.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();

            const deepLink = 'roblox://experiences/start?placeId=' + placeId + '&gameInstanceId=' + serverId;

            navigator.clipboard.writeText(deepLink).then(() => {
                copyButton.textContent = 'Copied!';
                setTimeout(() => { copyButton.textContent = 'Share'; }, 2000);
            }).catch(() => {
                copyButton.textContent = 'Failed to copy';
                setTimeout(() => { copyButton.textContent = 'Share'; }, 2000);
            });
        });

        if (serverIDTextElement && serverIDTextElement.parentElement) {
            serverIDTextElement.parentElement.insertBefore(copyButton, serverIDTextElement.nextSibling);
        } else {
            const joinButton = server.querySelector('.game-server-join-btn');
            if (joinButton?.parentElement) {
                joinButton.style.width = '100%';
                joinButton.parentElement.appendChild(copyButton);
            } else {
                server.querySelector('.rbx-game-server-details, .rbx-friends-game-server-details')?.appendChild(copyButton);
            }
        }
    }

    function createAndAddCopyJoinLinkButton(server, serverId, serverIDTextElement = null) {
        if (!serverId || serverId === 'null') {
            return;
        }
        var existingButton = server.querySelector('.rovalra-copy-join-link');
        if (existingButton) {
            var buttonServerId = existingButton.getAttribute('data-serverid');
            if (buttonServerId === serverId) {
                return;
            }
            existingButton.remove();
        }

        var placeId = server.getAttribute('data-placeid');
        if (!placeId) {
            var gameDetailsElement = document.querySelector('#game-detail-page');
            if (gameDetailsElement) {
                var placeIdMatch = window.location.href.match(/\/games\/(\d+)\//);
                if (placeIdMatch && placeIdMatch[1]) {
                    placeId = placeIdMatch[1];
                }
            }
        }

        if (!placeId) return;

        cleanupServerUI(server, server.classList.contains('rbx-friends-game-server-item'));

        var allServerShareButtons = server.querySelectorAll('.share-button, [class*="share-button"], [data-toggle="popover"], button[title*="Share"], a[title*="Share"]');
        allServerShareButtons.forEach(function(button) {
             if (!isExcludedButton(button)) { button.remove(); }
        });

        var allElements = server.querySelectorAll('*');
        allElements.forEach(function(element) {
            if (!isExcludedButton(element) && element.textContent && element.textContent.toLowerCase().includes('share') &&
                element.tagName && (element.tagName.toLowerCase() === 'button' || element.tagName.toLowerCase() === 'a')) {
                element.remove();
            } else if (!isExcludedButton(element) && element.hasAttribute('aria-label') && element.getAttribute('aria-label').toLowerCase().includes('share')) {
                element.remove();
            } else if (!isExcludedButton(element) && element.hasAttribute('title') && element.getAttribute('title').toLowerCase().includes('share')) {
                element.remove();
            }
        });

        var copyButton = document.createElement('button');
        copyButton.type = 'button';
        copyButton.className = 'btn-full-width btn-control-xs rbx-public-game-server-join btn-primary-md btn-min-width rovalra-copy-join-link';
        copyButton.textContent = 'Share';
        copyButton.style.marginTop = '5px';
        copyButton.style.width = '100%';
        copyButton.setAttribute('data-serverid', serverId);
        copyButton.setAttribute('data-rovalra-button-id', 'copy-' + serverId);

        copyButton.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();

            var deepLink = 'roblox://experiences/start?placeId=' + placeId + '&gameInstanceId=' + serverId;

            navigator.clipboard.writeText(deepLink).then(function() {
                copyButton.textContent = 'Copied!';
                setTimeout(function() {
                    copyButton.textContent = 'Share';
                }, 2000);
            }).catch(function(err) {
                copyButton.textContent = 'Failed to copy';
                setTimeout(function() {
                    copyButton.textContent = 'Share';
                }, 2000);
            });
        });

        var buttonId = 'copy-' + serverId;

        if (server.classList.contains('rbx-friends-game-server-item')) {
            var detailsElement = server.querySelector('.rbx-friends-game-server-details.game-server-details');
            if (detailsElement) {
                var shareButtons = [
                    ...Array.from(detailsElement.querySelectorAll('.share-button')),
                    ...Array.from(server.querySelectorAll('.share-button'))
                ];
                shareButtons.forEach(function(button) {
                    if (!isExcludedButton(button)) { button.remove(); }
                });

                chrome.storage.local.get(['enableFriendservers'], function(result) {
                    var enableFriendservers = result.enableFriendservers !== false;
                    if (enableFriendservers) {
                        var joinButton = detailsElement.querySelector('.game-server-join-btn');
                        if (joinButton) {
                            joinButton.style.width = '100%';
                        }
                    }
                });

                if (serverIDTextElement && serverIDTextElement.closest('.rbx-friends-game-server-details.game-server-details')) {
                    var container = serverIDTextElement.parentElement;
                    if (!container.classList.contains('rovalra-server-id-container')) {
                        var newContainer = document.createElement('div');
                        newContainer.className = 'rovalra-server-id-container';
                        newContainer.style.display = 'flex';
                        newContainer.style.flexDirection = 'column';
                        newContainer.style.alignItems = 'flex-start';
                        newContainer.style.width = '100%';

                        serverIDTextElement.parentElement.replaceChild(newContainer, serverIDTextElement);
                        newContainer.appendChild(serverIDTextElement);
                        container = newContainer;
                    }

                    container.insertBefore(copyButton, serverIDTextElement);
                } else {
                    var createServerLink = detailsElement.querySelector('.create-server-link');
                    if (createServerLink) {
                        createServerLink.style.width = '100%';
                        createServerLink.insertAdjacentElement('afterend', copyButton);
                    } else {
                        detailsElement.appendChild(copyButton);

                        buttonsToMonitor[buttonId] = {
                            server: server,
                            serverId: serverId,
                            detailsElement: detailsElement,
                            copyButton: copyButton,
                            attempts: 0
                        };
                    }
                }
                return;
            }
        }

        if (serverIDTextElement) {
            var container = serverIDTextElement.parentElement;
            if (!container.classList.contains('rovalra-server-id-container')) {
                var newContainer = document.createElement('div');
                newContainer.className = 'rovalra-server-id-container';
                newContainer.style.display = 'flex';
                newContainer.style.flexDirection = 'column';
                newContainer.style.alignItems = 'flex-start';
                newContainer.style.width = '100%';

                serverIDTextElement.parentElement.replaceChild(newContainer, serverIDTextElement);

                newContainer.appendChild(serverIDTextElement);
                container = newContainer;
            }
            container.insertBefore(copyButton, serverIDTextElement);
        } else {
            var joinButton = server.querySelector('.game-server-join-btn');
            if (joinButton && joinButton.parentElement) {
                var allServerShareButtons = server.querySelectorAll('.share-button, [class*="share-button"], [data-toggle="popover"], button[title*="Share"], a[title*="Share"]');
                allServerShareButtons.forEach(function(button) {
                    if (!isExcludedButton(button)) { button.remove(); }
                });

                var parentElement = joinButton.parentElement;
                var parentShareButtons = parentElement.querySelectorAll('.share-button, [class*="share-button"], [data-toggle="popover"], button[title*="Share"], a[title*="Share"]');
                parentShareButtons.forEach(function(button) {
                    if (!isExcludedButton(button)) { button.remove(); }
                });

                chrome.storage.local.get(['inviteEnabled', 'enableFriendservers'], function(result) {
                    var inviteEnabled = result.inviteEnabled !== false;
                    var enableFriendservers = result.enableFriendservers !== false;

                    if ((server.classList.contains('rbx-friends-game-server-item') && enableFriendservers) ||
                        (!server.classList.contains('rbx-friends-game-server-item') && inviteEnabled)) {
                        joinButton.style.width = '100%';
                    }
                });

                joinButton.parentElement.appendChild(copyButton);
            } else {
                server.appendChild(copyButton);
            }
        }
    }

    function cleanupServerUI(server, isFriendServer) {
        preventRoProShareButton(server);
        removeServerPerformanceElement(server);

        server.querySelectorAll('.share-button, [class*="share-button"], [data-toggle="popover"]').forEach(button => {
            if (!isExcludedButton(button)) {
                button.remove();
            }
        });

        chrome.storage.local.get(['inviteEnabled', 'enableFriendservers'], function(result) {
            const inviteEnabled = result.inviteEnabled !== false;
            const enableFriendservers = result.enableFriendservers !== false;

            if ((isFriendServer && enableFriendservers) || (!isFriendServer && inviteEnabled)) {
                server.querySelectorAll('.game-server-join-btn').forEach(button => {
                    button.style.width = '100%';
                });
            }
        });
    }

    var shareBtnCleanupInterval = setInterval(function() {
        chrome.storage.local.get(['enableFriendservers', 'inviteEnabled'], function(result) {
            var enableFriendservers = result.enableFriendservers !== false;
            var inviteEnabled = result.inviteEnabled !== false;

            var allServerElements = document.querySelectorAll('.rbx-public-game-server-item, .rbx-private-game-server-item, .rbx-friends-game-server-item');
            allServerElements.forEach(function(serverElement) {
                preventRoProShareButton(serverElement);
                removeServerPerformanceElement(serverElement);
            });

            var allShareButtons = document.querySelectorAll('.share-button, [class*="share-button"], [data-toggle="popover"], button[title*="Share"], a[title*="Share"]');
            allShareButtons.forEach(function(button) {
                if (!isExcludedButton(button)) { button.remove(); }
            });

            var privateServers = document.querySelectorAll('.rbx-private-game-server-item');
            privateServers.forEach(function(server) {
                var vipServerId = server.getAttribute('data-rovalra-vipserverid');
                if (vipServerId) {
                    addVipServerInviteButton(server, vipServerId);
                }
            });

            if (inviteEnabled) {
                var regularJoinButtons = document.querySelectorAll('.rbx-public-game-server-item .game-server-join-btn, .rbx-private-game-server-item .game-server-join-btn');
                regularJoinButtons.forEach(function(button) {
                    button.style.width = '100%';
                });
            }

            if (enableFriendservers) {
                var friendJoinButtons = document.querySelectorAll('.rbx-friends-game-server-item .game-server-join-btn');
                friendJoinButtons.forEach(function(button) {
                    button.style.width = '100%';
                });
            }

            if (enableFriendservers) {
                var friendServers = document.querySelectorAll('.rbx-friends-game-server-item');
                friendServers.forEach(function(server) {
                    cleanupServerUI(server, true);
                });

                var friendServerContainer = document.getElementById('rbx-friends-game-server-item-container');
                if (friendServerContainer) {
                    var containerShareButtons = friendServerContainer.querySelectorAll('.share-button, [class*="share-button"], [data-toggle="popover"], button[title*="Share"], a[title*="Share"]');
                    containerShareButtons.forEach(function(button) {
                        if (!isExcludedButton(button)) { button.remove(); }
                    });

                    var allButtons = friendServerContainer.querySelectorAll('button, a, [role="button"]');
                    allButtons.forEach(function(button) {
                        if (!isExcludedButton(button) && button.textContent && button.textContent.toLowerCase().includes('share')) {
                            button.remove();
                        }
                    });
                }

                var possibleShareElements = document.querySelectorAll('a[class*="share"], button[class*="share"], div[class*="share"], [aria-label*="share"], [title*="Share"]');
                possibleShareElements.forEach(function(element) {
                    if (!isExcludedButton(element) && element.textContent && element.textContent.toLowerCase().includes('share')) {
                        element.remove();
                    }
                });

                var popoverContainers = document.querySelectorAll('[data-original-title], .popover, .tooltip');
                popoverContainers.forEach(function(container) {
                    if (container.textContent && container.textContent.toLowerCase().includes('share')) {
                        container.remove();
                    }
                });
            }
        });
    }, 200);

    function setupShareButtonObserver() {
        var containers = [
            document.getElementById('rbx-friends-game-server-item-container'),
            document.body
        ].filter(Boolean);

        var shareButtonObserver = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                if (mutation.addedNodes && mutation.addedNodes.length > 0) {
                    mutation.addedNodes.forEach(function(node) {
                        if (node.nodeType === 1) {
                            if (node.matches && node.matches('.rbx-public-game-server-item, .rbx-private-game-server-item, .rbx-friends-game-server-item')) {
                                preventRoProShareButton(node);
                                removeFullServerStatus(node);
                                removeServerPerformanceElement(node);
                            }

                            const nestedServers = node.querySelectorAll('.rbx-public-game-server-item, .rbx-private-game-server-item, .rbx-friends-game-server-item');
                            nestedServers.forEach(server => {
                                preventRoProShareButton(server);
                                removeFullServerStatus(server);
                                removeServerPerformanceElement(server);
                            });

                            if (!isExcludedButton(node) && node.classList && (
                                node.classList.contains('share-button') ||
                                node.className.indexOf('share') !== -1 ||
                                (node.hasAttribute('data-toggle') && node.getAttribute('data-toggle') === 'popover')
                            )) {
                                node.remove();
                            }

                            var shareButtons = node.querySelectorAll('.share-button, [class*="share-button"], [data-toggle="popover"], button[title*="Share"], a[title*="Share"]');
                            shareButtons.forEach(function(button) {
                                if (!isExcludedButton(button)) { button.remove(); }
                            });
                              if (node.classList && node.classList.contains('rbx-friends-game-server-item')) {
                                cleanupServerUI(node, true);

                                setTimeout(function() {
                                    cleanupServerUI(node, true);
                                }, 50);
                            }

                            if (node.classList && node.classList.contains('rbx-private-game-server-item')) {
                                var vipServerId = node.getAttribute('data-rovalra-vipserverid');
                                if (vipServerId) {
                                    addVipServerInviteButton(node, vipServerId);
                                }
                            }

                            chrome.storage.local.get(['inviteEnabled', 'enableFriendservers'], function(result) {
                                var inviteEnabled = result.inviteEnabled !== false;
                                var enableFriendservers = result.enableFriendservers !== false;

                                if (node.classList && node.classList.contains('rbx-friends-game-server-item')) {
                                    if (enableFriendservers) {
                                        var friendJoinButtons = node.querySelectorAll('.game-server-join-btn');
                                        friendJoinButtons.forEach(function(button) {
                                            button.style.width = '100%';
                                        });
                                    }
                                } else {
                                    if (inviteEnabled) {
                                        var regularJoinButtons = node.querySelectorAll('.game-server-join-btn');
                                        regularJoinButtons.forEach(function(button) {
                                            button.style.width = '100%';
                                        });
                                    }
                                }
                            });
                        }
                    });
                }
            });
        });

        containers.forEach(function(container) {
            shareButtonObserver.observe(container, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['class']
            });
        });
    }

    let vipStatusCache = {};

    function addVipServerInviteButton(server, vipServerId) {
        const cachedStatus = vipStatusCache[vipServerId];
        if (cachedStatus === 'pending') { return; }
        const existingButtonContainer = server.querySelector('.rovalra-vip-buttons-container[data-vipserverid="' + vipServerId + '"]');
        if (existingButtonContainer) { if (cachedStatus !== 'success') { vipStatusCache[vipServerId] = 'success'; } return; }
        if (cachedStatus === 'no-link' || cachedStatus === 'error') { let container = server.querySelector('.rovalra-vip-buttons-container'); if (container) container.remove(); return; }
        let oldContainer = server.querySelector('.rovalra-vip-buttons-container');
        if (oldContainer) { oldContainer.remove(); }
        server.querySelectorAll('.rovalra-vip-invite-link, .rovalra-vip-new-invite-link').forEach(btn => btn.remove());
        vipStatusCache[vipServerId] = 'pending';    function getCsrfToken() {
                return new Promise((resolve, reject) => {
                    if (typeof Roblox !== 'undefined' && Roblox.CSRF && typeof Roblox.CSRF.getToken === 'function') {
                        const token = Roblox.CSRF.getToken();
                        if (token) {                    resolve(token);
                        return;
                    }
                }

                try {
                    const metaTokenElement = document.head.querySelector("meta[name='csrf-token']");
                    if (metaTokenElement) {
                        const token = metaTokenElement.getAttribute('data-token');
                        if (token) {                        resolve(token);
                            return;
                        }
                    }            } catch (e) {
                }

                fetch('https://auth.roblox.com/v2/logout', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    credentials: 'include'
                })
                .then(response => {
                    const csrfTokenFromHeader = response.headers.get('x-csrf-token');
                    if (csrfTokenFromHeader) {                    resolve(csrfTokenFromHeader);                } else {
                        reject('CSRF token refresh failed: Header not found after auth ping. Status: ' + response.status);
                    }
                })            .catch(error => {
                    reject('CSRF token refresh fetch error: ' + error.message);
                });
            });
        }
        function fetchVipServerDataInternal() {
            fetch('https://games.roblox.com/v1/vip-servers/' + vipServerId, {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                credentials: 'include'
            })
            .then(response => {            if (!response.ok) {
                }
                return response.json();
            })
            .then(data => {            if (vipStatusCache[vipServerId] !== 'pending') {
                    return;
                }
                let inviteLinkString = null;
                if (data && data.link) {
                    if (typeof data.link === 'string') {
                        inviteLinkString = data.link;
                    } else if (typeof data.link === 'object' && data.link.link && typeof data.link.link === 'string') {
                        inviteLinkString = data.link.link;
                    }
                }
                if (inviteLinkString) {
                    chrome.storage.local.get(['privateserverlink'], function(result) {
                        if (result.privateserverlink === true) {                        vipStatusCache[vipServerId] = 'success';
                            const initialInviteLink = inviteLinkString;
                            const buttonContainer = document.createElement('div');
                            buttonContainer.className = 'rovalra-vip-buttons-container';
                            buttonContainer.setAttribute('data-vipserverid', vipServerId);
                            buttonContainer.style.display = 'flex';
                            buttonContainer.style.flexDirection = 'column';
                            buttonContainer.style.gap = '5px';
                            buttonContainer.style.marginTop = '5px';
                            const copyButton = document.createElement('button');
                            copyButton.type = 'button';
                            copyButton.className = 'btn-full-width btn-control-xs rbx-public-game-server-join btn-primary-md btn-min-width rovalra-vip-invite-link';
                            copyButton.textContent = 'Copy Invite Link';
                            copyButton.setAttribute('data-clipboard-text', initialInviteLink);
                            copyButton.setAttribute('data-vipserverid', vipServerId);
                            copyButton.addEventListener('click', function(e) {
                                e.preventDefault();
                                e.stopPropagation();
                                const linkToCopy = this.getAttribute('data-clipboard-text');
                                navigator.clipboard.writeText(linkToCopy).then(() => {
                                    this.textContent = 'Copied!';
                                    setTimeout(() => { this.textContent = 'Copy Invite Link'; }, 2000);
                                }).catch(err => {
                                    this.textContent = 'Failed to copy';
                                    setTimeout(() => { this.textContent = 'Copy Invite Link'; }, 2000);
                                });
                            });
                            buttonContainer.appendChild(copyButton);
                            const generateButton = document.createElement('button');
                            generateButton.type = 'button';
                            generateButton.className = 'btn-full-width btn-control-xs rbx-public-game-server-join btn-secondary-md btn-min-width rovalra-vip-new-invite-link';
                            generateButton.textContent = 'Generate New Invite Link';
                            generateButton.setAttribute('data-vipserverid', vipServerId);
                            generateButton.addEventListener('click', function(e) {
                                e.preventDefault();
                                e.stopPropagation();
                                this.textContent = 'Generating...';
                                this.disabled = true;
                                getCsrfToken().then(csrfToken => {
                                    fetch('https://games.roblox.com/v1/vip-servers/' + vipServerId, {
                                        method: 'PATCH',
                                        headers: {
                                            'Content-Type': 'application/json',
                                            'X-CSRF-TOKEN': csrfToken,
                                            'Accept': 'application/json'
                                        },
                                        body: JSON.stringify({ newJoinCode: true }),
                                        credentials: 'include'
                                    })
                                    .then(response => {
                                        if (!response.ok) {
                                            return response.json().then(errData => {
                                                throw { status: response.status, data: errData, message: `HTTP error ${response.status}` };
                                            }).catch(() => {
                                                 throw { status: response.status, data: {}, message: `HTTP error ${response.status}, no JSON body` };
                                            });
                                        }
                                        return response.json();
                                    })
                                    .then(patchData => {
                                        let newGeneratedLinkString = null;
                                        if (patchData && patchData.link) {
                                            if (typeof patchData.link === 'string') {
                                                newGeneratedLinkString = patchData.link;
                                            } else if (typeof patchData.link === 'object' && patchData.link.link && typeof patchData.link.link === 'string') {
                                                newGeneratedLinkString = patchData.link.link;
                                            }
                                        }
                                        if (newGeneratedLinkString) {
                                            const newGeneratedLink = newGeneratedLinkString;
                                            copyButton.setAttribute('data-clipboard-text', newGeneratedLink);
                                            copyButton.textContent = 'Copy Invite Link';
                                            this.textContent = 'Generated!';
                                            setTimeout(() => {
                                                this.textContent = 'Generate New Invite Link';
                                                this.disabled = false;
                                            }, 2000);
                                        } else {
                                            this.textContent = 'Error (No Link Data)';                                        setTimeout(() => {
                                                this.textContent = 'Generate New Invite Link';
                                                this.disabled = false;
                                            }, 3000);
                                        }
                                    })
                                    .catch(error => {
                                        this.textContent = 'Error Generating';
                                        if (error && error.data && error.data.errors && error.data.errors.length > 0) {
                                            if (error.data.errors[0].message.toLowerCase().includes("configure")) {
                                                 this.textContent = 'Error (Configure Page)';
                                            }
                                        } else if (error && error.status === 403) {
                                            this.textContent = 'Error (Forbidden)';
                                        }
                                        setTimeout(() => {
                                            this.textContent = 'Generate New Invite Link';
                                            this.disabled = false;
                                        }, 3000);
                                    });
                                }).catch(csrfError => {
                                    this.textContent = 'Error (CSRF)';
                                    setTimeout(() => {
                                        this.textContent = 'Generate New Invite Link';
                                        this.disabled = false;
                                    }, 3000);
                                });
                            });
                            buttonContainer.appendChild(generateButton);
                            var joinButton = server.querySelector('.game-server-join-btn');
                            var serverDetails = server.querySelector('.rbx-game-server-details, .rbx-friends-game-server-details');
                            if (joinButton && joinButton.parentElement) {
                                joinButton.parentElement.appendChild(buttonContainer);
                            } else if (serverDetails) {
                                serverDetails.appendChild(buttonContainer);
                            } else {
                                server.appendChild(buttonContainer);
                            }                    } else {
                            vipStatusCache[vipServerId] = 'no-link';
                            let container = server.querySelector('.rovalra-vip-buttons-container');
                            if (container) container.remove();
                        }
                    });            } else {
                    vipStatusCache[vipServerId] = 'no-link';
                    let container = server.querySelector('.rovalra-vip-buttons-container');
                    if (container) container.remove();
                }
            })
            .catch(function(error) {
                if (vipStatusCache[vipServerId] === 'pending') {
                    vipStatusCache[vipServerId] = 'error';
                }
                let container = server.querySelector('.rovalra-vip-buttons-container');
                if (container) container.remove();
            });
        }
        fetchVipServerDataInternal();
    }



    function aggressiveShareButtonRemoval() {
        chrome.storage.local.get(['showfullserveridEnabled', 'inviteEnabled', 'enableFriendservers'], function(result) {
            var showFullId = result.showfullserveridEnabled !== false;
            var inviteEnabled = result.inviteEnabled !== false;
            var enableFriendservers = result.enableFriendservers !== false;

            if (!showFullId && inviteEnabled) {

                var serverContainers = document.querySelectorAll('.rbx-public-game-server-item, .rbx-private-game-server-item, .rbx-friends-game-server-item');
                serverContainers.forEach(function(container) {
                    preventRoProShareButton(container);
                    removeServerPerformanceElement(container);

                    var containerShareButtons = container.querySelectorAll('.share-button, [class*="share-button"], [data-toggle="popover"], button[title*="Share"], a[title*="Share"]');
                    containerShareButtons.forEach(function(button) {
                        if (!isExcludedButton(button)) { button.remove(); }
                    });

                    var allElements = container.querySelectorAll('button, a, [role="button"]');
                    allElements.forEach(function(element) {
                        if (!isExcludedButton(element) && element.textContent && element.textContent.toLowerCase().includes('share') &&
                            !element.classList.contains('rovalra-copy-join-link') &&
                            !element.classList.contains('rovalra-vip-invite-link') &&
                            !element.classList.contains('rovalra-vip-new-invite-link')) {
                            element.remove();
                        }
                    });
                });
            }
        });
    }

    var aggressiveRemovalInterval = setInterval(aggressiveShareButtonRemoval, 100);
async function enhanceServer(server) {
        if (server.dataset.rovalraEnhanced) {
            return;
        }
        server.dataset.rovalraEnhanced = 'true';

        preventRoProShareButton(server);
        removeServerPerformanceElement(server);
        server.querySelectorAll('.share-button, [class*="share-button"], [data-toggle="popover"]').forEach(button => {
            if (!isExcludedButton(button)) {
                button.remove();
            }
        });
        
        const statusElement = server.querySelector('.text-info.rbx-game-status');
        if (statusElement) {
            const originalText = statusElement.textContent;
            const cleanedText = originalText.replace(/^\s*(Region:|Ping:|Server is full).*$/gim, '').trim();
            if (statusElement.textContent !== cleanedText) {
                statusElement.textContent = cleanedText;
            }
        }
        
        const serverId = server.getAttribute('data-rovalra-serverid');
        if (!serverId || serverId === 'null') {
            server.removeAttribute('data-rovalra-enhanced'); 
            return;
        }

        const isFriendServer = server.classList.contains('rbx-friends-game-server-item');
        cleanupServerUI(server, isFriendServer); 

        const settings = await new Promise(resolve => chrome.storage.local.get([
            'serverUptimeServerLocationEnabled', 'showfullserveridEnabled', 'inviteEnabled', 'enableFriendservers', 'privateserverlink'
        ], resolve));

        if (settings.serverUptimeServerLocationEnabled !== false) {
            fetchAndDisplayRegion(server, serverId);
            if (!serverUptimes[serverId]) {
                serverUptimes[serverId] = 'fetching';
                uptimeBatch.add(serverId); 
            } else if (typeof serverUptimes[serverId] === 'number') {
                displayUptime(server, serverUptimes[serverId]);
            }
        }

        let serverIDTextElement = server.querySelector('.server-id-text');
        if (settings.showfullserveridEnabled !== false && !serverIDTextElement) {
            serverIDTextElement = document.createElement('div');
            serverIDTextElement.className = 'server-id-text text-info xsmall';
            serverIDTextElement.style.fontSize = '9px';
            serverIDTextElement.textContent = 'ID: ' + serverId;
            server.querySelector('.rbx-game-server-details, .rbx-friends-game-server-details')?.appendChild(serverIDTextElement);
        }

        addCopyJoinLinkButton(server, serverId, serverIDTextElement);
        
        if (server.classList.contains('rbx-private-game-server-item')) {
            const vipServerId = server.getAttribute('data-rovalra-vipserverid');
            if (vipServerId && settings.privateserverlink === true) {
                addVipServerInviteButton(server, vipServerId);
            }
        }
    }
 function resetServerState(server) {
        if (!server) return;
        
        server.querySelector('.rovalra-region-info')?.remove();
        server.querySelector('.rovalra-uptime-info')?.remove();
        server.querySelector('.rovalra-copy-join-link')?.remove();
        server.querySelector('.rovalra-server-full-info')?.remove();
        server.querySelector('.rovalra-private-server-label')?.remove();
        server.querySelector('.server-id-text')?.remove();
        server.querySelector('.rovalra-vip-buttons-container')?.remove();

        const joinButton = server.querySelector('.game-server-join-btn');
        if (joinButton) {
            joinButton.textContent = 'Join';
            joinButton.disabled = false;
            joinButton.classList.remove('btn-secondary-md');
            joinButton.classList.add('btn-primary-md');
            joinButton.style.width = ''; 
        }

        server.removeAttribute('data-rovalra-enhanced');
    }
    function observeServerList() {
        const serverListContainer = document.getElementById('game-server-item-container');

        if (!serverListContainer) {
            setTimeout(observeServerList, 500);
            return;
        }

        serverListContainer.querySelectorAll('.rbx-public-game-server-item, .rbx-private-game-server-item, .rbx-friends-game-server-item').forEach(processSingleServer);

        const observer = new MutationObserver((mutationsList) => {
            const serversToProcess = new Set();
            let placeId = null;

            for (const mutation of mutationsList) {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.matches('.rbx-public-game-server-item, .rbx-private-game-server-item, .rbx-friends-game-server-item')) {
                                serversToProcess.add(node);
                            }
                            node.querySelectorAll('.rbx-public-game-server-item, .rbx-private-game-server-item, .rbx-friends-game-server-item').forEach(s => serversToProcess.add(s));
                        }
                    });
                } else if (mutation.type === 'attributes' && mutation.attributeName === 'data-rovalra-serverid') {
                    if (mutation.target.matches('.rbx-public-game-server-item, .rbx-private-game-server-item, .rbx-friends-game-server-item')) {
                       serversToProcess.add(mutation.target);
                    }
                }
            }

            if (serversToProcess.size > 0) {
                serversToProcess.forEach(server => {
                    resetServerState(server);
                    processSingleServer(server);
                });

                if (uptimeBatch.size > 0) {
                    if (!placeId) {
                        placeId = window.location.href.match(/\/games\/(\d+)\//)?.[1];
                    }
                    if (placeId) {
                        clearTimeout(uptimeTimeout);
                        uptimeTimeout = setTimeout(() => {
                            const batchToFetch = Array.from(uptimeBatch);
                            uptimeBatch.clear();
                            fetchServerUptime(placeId, batchToFetch);
                        }, 250);
                    }
                }
            }
        });

        observer.observe(serverListContainer, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['data-rovalra-serverid'],
        });
    }



async function processSingleServer(server) {
        if (server.hasAttribute('data-rovalra-processed-id')) return;
        server.setAttribute('data-rovalra-processed-id', 'in-progress'); 

        const serverId = server.getAttribute('data-rovalra-serverid');
        if (!serverId || serverId === 'null') {
            server.removeAttribute('data-rovalra-processed-id');
            return;
        }

        const isFriendServer = server.classList.contains('rbx-friends-game-server-item');
        cleanupServerUI(server, isFriendServer);

        const settings = await new Promise(resolve => chrome.storage.local.get([
            'serverUptimeServerLocationEnabled', 'showfullserveridEnabled', 'inviteEnabled', 'enableFriendservers', 'privateserverlink'
        ], resolve));

        if (settings.serverUptimeServerLocationEnabled !== false) {
            fetchAndDisplayRegion(server, serverId);
            if (!serverUptimes[serverId]) {
                serverUptimes[serverId] = 'fetching';
                uptimeBatch.add(serverId);
            } else if (typeof serverUptimes[serverId] === 'number') {
                displayUptime(server, serverUptimes[serverId]);
            }
        }

        let serverIDTextElement = server.querySelector('.server-id-text');
        if (settings.showfullserveridEnabled !== false && !serverIDTextElement) {
            serverIDTextElement = document.createElement('div');
            serverIDTextElement.className = 'server-id-text text-info xsmall';
            serverIDTextElement.style.fontSize = '9px';
            serverIDTextElement.textContent = 'ID: ' + serverId;
            server.querySelector('.rbx-game-server-details, .rbx-friends-game-server-details')?.appendChild(serverIDTextElement);
        }

        addCopyJoinLinkButton(server, serverId, serverIDTextElement);
        if (server.classList.contains('rbx-private-game-server-item')) {
            const vipServerId = server.getAttribute('data-rovalra-vipserverid');
            if (vipServerId && settings.privateserverlink === true) {
                addVipServerInviteButton(server, vipServerId);
            }
        }
        
        server.setAttribute('data-rovalra-processed-id', serverId); 
    }
function cleanupNode(node) {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        
        node.querySelectorAll('.ropro-uptime-info, .ropro-server-info, .server-performance').forEach(el => el.remove());
        node.querySelectorAll('.text-info.rbx-game-status').forEach(element => {
            if (!element.classList.contains('rovalra-region-info') && !element.classList.contains('rovalra-uptime-info')) {
                const cleanedText = element.textContent.replace(/^\s*(Region:|Ping:|Server is full).*$/gim, '').trim();
                if (element.textContent !== cleanedText) element.textContent = cleanedText;
            }
        });
        node.querySelectorAll('.share-button, [class*="share-button"], [data-toggle="popover"]').forEach(button => {
            if (!isExcludedButton(button)) button.remove();
        });
    }
 function initializeMasterObserver() {
        const targetNode = document.getElementById('game-server-list');
        if (!targetNode) {
            setTimeout(initializeMasterObserver, 250); 
            return;
        }

        const config = { childList: true, subtree: true, attributes: true, attributeFilter: ['data-rovalra-serverid'] };

        const observer = new MutationObserver((mutationsList) => {
            const serversToProcess = new Set();
            
            for (const mutation of mutationsList) {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.matches('.rbx-public-game-server-item, .rbx-private-game-server-item, .rbx-friends-game-server-item')) {
                                serversToProcess.add(node);
                            }
                            node.querySelectorAll('.rbx-public-game-server-item, .rbx-private-game-server-item, .rbx-friends-game-server-item').forEach(s => serversToProcess.add(s));
                        }
                    });
                } else if (mutation.type === 'attributes' && mutation.attributeName === 'data-rovalra-serverid') {
                    resetServerState(mutation.target);
                    serversToProcess.add(mutation.target);
                }
            }

            if (serversToProcess.size > 0) {
                serversToProcess.forEach(enhanceServer);

                if (uptimeBatch.size > 0) {
                    const placeId = window.location.href.match(/\/games\/(\d+)\//)?.[1];
                    if (placeId) {
                        clearTimeout(uptimeTimeout);
                        uptimeTimeout = setTimeout(() => {
                            const batchToFetch = Array.from(uptimeBatch);
                            uptimeBatch.clear();
                            fetchServerUptime(placeId, batchToFetch);
                        }, 250); 
                    }
                }
            }
        });

        targetNode.querySelectorAll('.rbx-public-game-server-item, .rbx-private-game-server-item, .rbx-friends-game-server-item').forEach(enhanceServer);
        
        observer.observe(targetNode, config);
    }


    loadServerIpMap();

 
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeMasterObserver);
    } else {
        initializeMasterObserver();
    }
}
chrome.storage.local.get([
    'inviteEnabled',
    'showfullserveridEnabled',
    'serverUptimeServerLocationEnabled',
    'enableFriendservers',
    'privateserverlink',
    'ServerlistmodificationsEnabled'
], (settings) => {
    const inviteEnabled = settings.inviteEnabled !== false;
    const showFullIdEnabled = settings.showfullserveridEnabled !== false;
    const uptimeLocationEnabled = settings.serverUptimeServerLocationEnabled !== false;
    const friendServersEnabled = settings.enableFriendservers !== false;
    const privateServerLinkEnabled = settings.privateserverlink === true; 
    const serverListModificationsEnabled = settings.ServerlistmodificationsEnabled !== false;

    if (serverListModificationsEnabled) {
        initializeExtensionFeatures();

    } else {
        async function loadServerIpMap() {
            if (window.rovalraDatacenterState) return; 
            window.rovalraDatacenterState = 'loading_fallback';

            const processAndStoreData = (serverListData) => {
                let dataElement = document.getElementById('rovalra-datacenter-data-storage');
                if (!dataElement) {
                    dataElement = document.createElement('script');
                    dataElement.id = 'rovalra-datacenter-data-storage';
                    dataElement.type = 'application/json';
                    (document.head || document.documentElement).appendChild(dataElement);
                }
                dataElement.textContent = JSON.stringify(serverListData);

                const map = {};
                if (Array.isArray(serverListData)) {
                    serverListData.forEach(dc => {
                        if (dc.dataCenterIds && Array.isArray(dc.dataCenterIds) && dc.location) {
                            dc.dataCenterIds.forEach(id => {
                                map[id] = dc.location;
                            });
                        }
                    });
                }
                serverIpMap = map; 
            };

            try {
                const fallbackUrl = chrome.runtime.getURL('data/ServerList.json');
                const fallbackResponse = await fetch(fallbackUrl);
                if (!fallbackResponse.ok) throw new Error(`Status: ${fallbackResponse.status}`);
                const localData = await fallbackResponse.json();
                processAndStoreData(localData);
                window.rovalraDatacenterState = 'fallback_loaded';
            } catch (e) {
                console.error("Could not load local fallback ServerList.json", e);
                serverIpMap = {}; 
            }

            window.rovalraDatacenterState = 'fetching_api';
            const API_TIMEOUT = 8000; 
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);
                // You are allowed to use this API for personal projects only which is limited to open source projects on GitHub, they must be free and you must credit the RoValra repo.
                // You are not allowed to use the API for projects on the chrome web store or any other extension store. If you want to use the API for a website dm be on discord: Valra and we can figure something out.
                // If you want to use the API for something thats specifically said isnt allowed or you might be unsure if its allowed, please dm me on discord: Valra, Ill be happy to check out your stuff and maybe allow you to use it for your project.
                const apiResponse = await fetch('https://apis.rovalra.com/datacenters', {
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                if (!apiResponse.ok) throw new Error(`API returned status: ${apiResponse.status}`);
                
                const apiData = await apiResponse.json();
                processAndStoreData(apiData);
                

            } catch (e) {
            } finally {
                window.rovalraDatacenterState = 'complete'; 
            }
        }
        loadServerIpMap();
    }
});