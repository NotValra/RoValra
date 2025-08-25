// This script is stable, if u read it with your eyes closed.

function initializeExtensionFeatures() {
    // --- STATE AND CACHE ---
    let serverIpMap = null;
    let serverLocations = {};
    let serverUptimes = {};
    let csrfToken = null;
    let uptimeBatch = new Set();
    let uptimeTimeout;
    let vipStatusCache = {};

    // --- UTILITY & HELPER FUNCTIONS ---

    function isExcludedButton(button) {
        if (!button || typeof button.matches !== 'function') return false;
        return button.classList.contains('rovalra-copy-join-link') ||
               button.classList.contains('rovalra-vip-invite-link') ||
               button.classList.contains('rovalra-vip-new-invite-link') ||
               (button.getAttribute('data-bind') === 'game-context-menu' && button.classList.contains('rbx-menu-item'));
    }

    function createUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    async function getGlobalCsrfToken() {
        if (csrfToken) return csrfToken;
        // Modified to only get the CSRF token from the meta tag, as requested.
        try {
            const meta = document.querySelector("meta[name='csrf-token']");
            if (meta) {
                const token = meta.getAttribute('data-token');
                if (token) return (csrfToken = token);
            }
        } catch (e) {
            // If the meta tag doesn't exist or an error occurs, we'll return null.
        }
        return null;
    }

    function getFullLocationName(location) {
        if (!location || typeof location !== 'object') return "Unknown Region";
        const { city, region, country } = location;
        const parts = [];
        const cityAbbreviations = { "Los Angeles": "LA", "New York City": "NYC" };
        const countryAbbreviations = { "US": "USA", "GB": "UK" };
        const countryNames = { "AU": "Australia", "DE": "Germany", "FR": "France", "IN": "India", "JP": "Japan", "NL": "Netherlands", "SG": "Singapore" };
        if (city) parts.push(cityAbbreviations[city] || city);
        if (country === "US" && region && region !== city) parts.push(region);
        if (country) parts.push(countryAbbreviations[country] || countryNames[country] || country);
        return [...new Set(parts)].join(', ') || "Unknown Region";
    }

    // --- CORE API FETCHING FUNCTIONS ---

    /**
     * Fetches datacenter and server IP mapping information.
     * This function is preserved exactly as in the original script.
     */
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
            const apiResponse = await fetch('https://apis.rovalra.com/datacenters', { signal: controller.signal });
            clearTimeout(timeoutId);
            if (!apiResponse.ok) throw new Error(`API returned status: ${apiResponse.status}`);
            const apiData = await apiResponse.json();
            processAndStoreData(apiData);
            document.querySelectorAll('[data-rovalra-enhanced="true"]').forEach(server => {
                const serverId = server.getAttribute('data-rovalra-serverid');
                if (serverId) {
                    delete serverLocations[serverId];
                    fetchAndDisplayRegion(server, serverId);
                }
            });
        } catch (e) {} finally {
            window.rovalraDatacenterState = 'complete';
        }
    }



async function fetchServerUptime(placeId, serverIdsToFetch) {
    const validServerIds = serverIdsToFetch.filter(id => id && id !== 'null');
    if (validServerIds.length === 0) return;

    try {
        const serverIdsString = validServerIds.join(',');
        const url = `https://apis.rovalra.com/v1/server_details?place_id=${placeId}&server_ids=${serverIdsString}`;

        const response = await fetch(url, {
            method: 'GET', 
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        if (data.status !== 'success' || !Array.isArray(data.servers)) throw new Error("API did not return a success status.");

        const now = new Date();
        const returnedServerIds = new Set();

        data.servers.forEach(serverDetails => {
            const { server_id, first_seen, city, country, is_full, place_version } = serverDetails;
            if (!server_id) return;
            returnedServerIds.add(server_id);

            const serverElement = document.querySelector(`[data-rovalra-serverid="${server_id}"]`);
            if (!serverElement) return; 


            if (place_version) {
                displayPlaceVersion(serverElement, place_version);
            }

            let uptime = 'N/A'; 
            if (first_seen) { 
                const firstSeenDate = new Date(first_seen.endsWith('Z') ? first_seen : first_seen + 'Z');
                if (!isNaN(firstSeenDate.getTime())) {
                    uptime = Math.max(0, (now - firstSeenDate) / 1000);
                }
            }
            serverUptimes[server_id] = uptime;
            displayUptime(serverElement, uptime);



            if (city && country && country !== "Unknown" && !city.includes("Unknown")) {
                let regionString = `${city}, ${country}`;
                
                displayRegion(serverElement, regionString);
                serverLocations[server_id] = regionString;
            }
        });


        validServerIds.forEach(serverId => {
            if (!returnedServerIds.has(serverId)) {
                serverUptimes[serverId] = 'N/A'; 
                const serverElement = document.querySelector(`[data-rovalra-serverid="${serverId}"]`);
                if (serverElement) displayUptime(serverElement, 'N/A');
            }
        });

    } catch (error) {
        validServerIds.forEach(serverId => {
            serverUptimes[serverId] = 'error';
            const serverElement = document.querySelector(`[data-rovalra-serverid="${serverId}"]`);
            if (serverElement) displayUptime(serverElement, 'error');
        });
    }
}
    


async function fetchAndDisplayRegion(server, serverId) {
    if (serverLocations[serverId]) {
        return;
    }


    let placeId = server.getAttribute('data-placeid'); 
    if (!placeId) {
        const placeIdElement = server.querySelector('[data-placeid]'); 
        if (placeIdElement) {
            placeId = placeIdElement.getAttribute('data-placeid');
        }
    }
    if (!placeId) {
        placeId = window.location.href.match(/\/games\/(\d+)\//)?.[1]; 
    }

    const token = await getGlobalCsrfToken();

    if (!token || !serverIpMap || !placeId) {
        displayRegion(server, (serverLocations[serverId] = "Unknown Region"));
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

        if (response.ok) {
            const serverInfo = await response.json();
            if (server.getAttribute('data-rovalra-serverid') !== serverId) return;
            
            const joinScriptMessage = serverInfo?.message;

            if (serverInfo.status === 12 && joinScriptMessage === "Can't join private instance through specific joins" && server.matches('.rbx-friends-game-server-item')) { 
                serverLocations[serverId] = 'private'; 
                
                const container = getOrCreateDetailsContainer(server);
                container.innerHTML = ''; 
                
                const privateSVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`;
                const privateElement = createInfoElement('rovalra-private-server-info', privateSVG, "Playing in a private server");
                
                container.appendChild(privateElement);
                return; 
            }

            if (joinScriptMessage === "Game's root place is not active.") {
                serverLocations[serverId] = 'inactive'; 
                
                const container = getOrCreateDetailsContainer(server);
                container.innerHTML = ''; 

                const inactiveSVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
 <path d="M12 8V12M12 16H12.01M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
 </svg>`;
                const inactiveElement = createInfoElement('rovalra-inactive-place-info', inactiveSVG, "Cannot join the place.");

                container.appendChild(inactiveElement);
                return; 
            }

            const joinButton = server.querySelector('.game-server-join-btn');
            if (serverInfo.status === 22) { 
                serverLocations[serverId] = 'full';
                displayServerFullStatus(server);
                if (joinButton) {
                    joinButton.textContent = serverInfo.queuePosition > 0 ? `Join (${serverInfo.queuePosition} In Queue)` : 'Server Full';
                    joinButton.classList.replace('btn-primary-md', 'btn-secondary-md');
                }
                return; 
            } else if (joinButton && serverInfo.status === 2) {
                joinButton.textContent = 'Join';
                joinButton.classList.replace('btn-secondary-md', 'btn-primary-md');
            } else if (joinButton && !server.classList.contains('rbx-friends-game-server-item') && !server.classList.contains('rbx-private-game-server-item')) {
                 server.style.display = 'none'; 
            }

            if (serverInfo.joinScript?.placeVersion) displayPlaceVersion(server, serverInfo.joinScript.placeVersion);
            
            let fullRegionName = "Unknown Region";
            const dataCenterId = serverInfo.joinScript?.DataCenterId;
            if (dataCenterId && serverIpMap[dataCenterId]) {
                fullRegionName = getFullLocationName(serverIpMap[dataCenterId]);
            }
            displayRegion(server, (serverLocations[serverId] = fullRegionName));
        } else {
             displayRegion(server, (serverLocations[serverId] = "Unknown Region"));
        }
    } catch (error) {
        if (server.getAttribute('data-rovalra-serverid') === serverId) {
            displayRegion(server, (serverLocations[serverId] = "Unknown Region"));
        }
    }
}


    function getOrCreateDetailsContainer(server) {
        let container = server.querySelector('.rovalra-details-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'rovalra-details-container';
            
            if (server.classList.contains('rbx-friends-game-server-item')) {
                 container.style.cssText = `display: flex; flex-direction: column; align-items: flex-start; gap: 4px; margin-bottom: 8px; width: 100%; order: -1;`;
            } else {
                container.style.cssText = `display: flex; flex-direction: column; align-items: flex-start; gap: 2px; margin-top: 4px;`;
            }
    
            const detailsParent = server.querySelector('.rbx-game-server-details, .rbx-friends-game-server-details');
            if (detailsParent) {
                detailsParent.prepend(container);
            } else {
                const referenceNode = server.querySelector('.text-info.rbx-game-status');
                referenceNode?.parentNode.insertBefore(container, referenceNode.nextSibling);
            }
        }
        return container;
    }

    function createInfoElement(className, svg, text) {
        const element = document.createElement('div');
        element.className = `${className} text-info`;
        element.style.cssText = `display: flex; align-items: center; gap: 6px; font-size: 14px;`;
        element.style.color = document.body.classList.contains('light-theme') ? 'rgb(73, 77, 90)' : '#B8B8B8';
        element.innerHTML = `${svg} <span style="line-height: 1;">${text}</span>`;
        return element;
    }
    // caboom? or kaboom?
    function createPlaceholderUI(server) {
        const container = getOrCreateDetailsContainer(server);

        displayUptime(server, 'N/A', container);
        displayPlaceVersion(server, 'N/A', container);
        displayRegion(server, 'N/A', container);
    }
function displayUptime(server, uptimeValue, container = null) {
    const serverId = server.getAttribute('data-rovalra-serverid');
    if (serverLocations[serverId] === 'private') {
        const existingElement = server.querySelector('.rovalra-uptime-info');
        if (existingElement) existingElement.remove();
        return;
    }

    container = container || getOrCreateDetailsContainer(server);
    let uptimeElement = container.querySelector('.rovalra-uptime-info');
    
    let uptimeString;
    if (uptimeValue === 'fetching') {
        uptimeString = 'Loading...';
    } else if (uptimeValue === 'N/A') {
        uptimeString = 'N/A';
    } else if (typeof uptimeValue === 'number' && uptimeValue >= 0) {
        if (uptimeValue < 3600) {
            uptimeString = 'New Server';
        } else {
            let remainingSeconds = uptimeValue;
            const days = Math.floor(remainingSeconds / 86400); remainingSeconds %= 86400;
            const hours = Math.floor(remainingSeconds / 3600); remainingSeconds %= 3600;
            const minutes = Math.floor(remainingSeconds / 60);
            const parts = [];
            if (days > 0) parts.push(`${days}d`);
            if (hours > 0) parts.push(`${hours}h`);
            if (minutes > 0) parts.push(`${minutes}m~`);
            uptimeString = parts.join(' ') || '0m~';
        }
    } else {
        uptimeString = 'Error';
    }

    const uptimeSVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 6V12L16 14M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

    if (uptimeElement) {
        uptimeElement.querySelector('span').textContent = `${uptimeString.trim()}`;
    } else {
        uptimeElement = createInfoElement('rovalra-uptime-info', uptimeSVG, uptimeString.trim());
        container.prepend(uptimeElement);
    }
}

function displayPlaceVersion(server, version, container = null) {
    const serverId = server.getAttribute('data-rovalra-serverid');

    if (serverLocations[serverId] === 'private') {
        const existingElement = server.querySelector('.rovalra-version-info');
        if (existingElement) existingElement.remove();
        return;
    }

    container = container || getOrCreateDetailsContainer(server);
    let versionElement = container.querySelector('.rovalra-version-info');

    const serverListContainer = document.getElementById('rbx-public-game-server-item-container');
    const newestVersion = serverListContainer ? serverListContainer.getAttribute('data-newest-version') : null;
    const oldestVersion = serverListContainer ? serverListContainer.getAttribute('data-oldest-version') : null;

    let displayText;
    if (version === 'Unknown' || !version) {
        displayText = 'Version: N/A';
    } else {
        displayText = `Version: ${version}`;
        const versionStr = version.toString();
        
        if (newestVersion && versionStr === newestVersion) {
            displayText += ' (newest)';
        } 
        else if (oldestVersion && versionStr === oldestVersion) {
            displayText += ' (oldest)';
        }
    }
    
    const versionSVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
 <path d="M22.7 11.5L20.7005 13.5L18.7 11.5M20.9451 13C20.9814 12.6717 21 12.338 21 12C21 7.02944 16.9706 3 12 3C7.02944 3 3 7.02944 3 12C3 16.9706 7.02944 21 12 21C14.8273 21 17.35 19.6963 19 17.6573M12 7V12L15 14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
 </svg>`;

    if (versionElement) {
        versionElement.querySelector('span').textContent = displayText;
    } else {
        versionElement = createInfoElement('rovalra-version-info', versionSVG, displayText);
        const uptimeElement = container.querySelector('.rovalra-uptime-info');
        if (uptimeElement) {
            uptimeElement.after(versionElement);
        } else {
            container.prepend(versionElement);
        }
    }
}


function displayRegion(server, regionName, container = null) {
    container = container || getOrCreateDetailsContainer(server);

    const fullElement = container.querySelector('.rovalra-server-full-info');
    if (fullElement && fullElement.parentNode === container) {
        container.removeChild(fullElement);
    }

    let regionElement = container.querySelector('.rovalra-region-info');
    const displayText = (regionName && regionName !== "Unknown Region") ? regionName : "N/A";
    const regionSVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2.4578C14.053 2.16035 13.0452 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 10.2847 21.5681 8.67022 20.8071 7.25945M17 5.75H17.005M10.5001 21.8883L10.5002 19.6849C10.5002 19.5656 10.5429 19.4502 10.6205 19.3596L13.1063 16.4594C13.3106 16.2211 13.2473 15.8556 12.9748 15.6999L10.1185 14.0677C10.0409 14.0234 9.97663 13.9591 9.93234 13.8814L8.07046 10.6186C7.97356 10.4488 7.78657 10.3511 7.59183 10.3684L2.06418 10.8607M21 6C21 8.20914 19 10 17 12C15 10 13 8.20914 13 6C13 3.79086 14.7909 2 17 2C19.2091 2 21 3.79086 21 6Z"></path></svg>`;

    if (regionElement) {
        regionElement.querySelector('span').textContent = displayText;
    } else {
        regionElement = createInfoElement('rovalra-region-info', regionSVG, displayText);
        container.appendChild(regionElement); 
    }
}
    
function displayServerFullStatus(server, container = null) {
    container = container || getOrCreateDetailsContainer(server);
    // When displaying "full", always remove the region message.
    container.querySelector('.rovalra-region-info')?.remove();
    let fullElement = container.querySelector('.rovalra-server-full-info');
    const fullSVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2.4578C14.053 2.16035 13.0452 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 10.2847 21.5681 8.67022 20.8071 7.25945M17 5.75H17.005M10.5001 21.8883L10.5002 19.6849C10.5002 19.5656 10.5429 19.4502 10.6205 19.3596L13.1063 16.4594C13.3106 16.2211 13.2473 15.8556 12.9748 15.6999L10.1185 14.0677C10.0409 14.0234 9.97663 13.9591 9.93234 13.8814L8.07046 10.6186C7.97356 10.4488 7.78657 10.3511 7.59183 10.3684L2.06418 10.8607M21 6C21 8.20914 19 10 17 12C15 10 13 8.20914 13 6C13 3.79086 14.7909 2 17 2C19.2091 2 21 3.79086 21 6Z"></path></svg>`;

    if (fullElement) {
        // The text never changes, so we don't need to update it, but we do it for consistency.
        fullElement.querySelector('span').textContent = "Server is Full";
    } else {
        fullElement = createInfoElement('rovalra-server-full-info', fullSVG, "Server is Full");
        container.appendChild(fullElement);
    }
}

async function addCopyJoinLinkButton(server, serverId) {
    // --- MODIFICATION START ---
    // This function no longer checks individual settings. If the script is running,
    // the button will be added.
    server.querySelector('.rovalra-copy-join-link')?.remove();
    // --- MODIFICATION END ---
    
    const placeId = server.getAttribute('data-placeid') || window.location.href.match(/\/games\/(\d+)\//)?.[1];
    if (!placeId) return null;

    const button = document.createElement('button');
    button.className = 'btn-full-width btn-control-xs btn-primary-md btn-min-width rovalra-copy-join-link';
    button.textContent = 'Share';
    button.style.cssText = 'margin-top: 5px; width: 100%;';
    button.onclick = e => {
        e.preventDefault(); e.stopPropagation();
        navigator.clipboard.writeText(`roblox://experiences/start?placeId=${placeId}&gameInstanceId=${serverId}`).then(() => {
            button.textContent = 'Copied!';
            setTimeout(() => { button.textContent = 'Share'; }, 2000);
        });
    };
    
    const joinButton = server.querySelector('.game-server-join-btn');
    if (joinButton) {
        joinButton.after(button); // Insert button into the page
        joinButton.style.width = '100%';
    } else {
        // Fallback placement
        server.querySelector('.rbx-game-server-details, .rbx-friends-game-server-details')?.appendChild(button);
    }
    
    return button; // Return the created button element
}
    
    // --- MAIN LOGIC & OBSERVERS ---
    
/**
 * Completely resets a server element by removing all custom UI.
 * This is crucial for handling server list refreshes.
 * @param {HTMLElement} server The server element to clean.
 */
    /**
 * Attaches a persistent MutationObserver to a server element to continuously
 * remove UI elements added by other extensions after the initial cleanup.
 * @param {HTMLElement} server The server element to watch.
 */
function attachCleanupObserver(server) {
    // Prevent attaching multiple observers to the same element
    if (server.dataset.rovalraCleanupAttached) return;

    const cleanupSelectors = '.share-button, .server-performance, .ropro-server-info, .ropro-uptime-info';
    
    const observer = new MutationObserver((mutationsList) => {
        for (const mutation of mutationsList) {
            // We only care about new nodes being added
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(node => {
                    // Check if the added node itself or any of its children match the selectors
                    if (node.nodeType === 1) { // Ensure it's an element
                        // --- MODIFICATION START ---
                        // Check if the node still has a parent before removing it.
                        if (node.matches(cleanupSelectors) && !isExcludedButton(node) && node.parentNode) {
                            node.remove();
                        } else {
                            node.querySelectorAll(cleanupSelectors).forEach(el => {
                                // Also check here for the same reason.
                                if (!isExcludedButton(el) && el.parentNode) el.remove();
                            });
                        }
                        // --- MODIFICATION END ---
                    }
                });
            }
        }
    });

    observer.observe(server, { childList: true, subtree: true });
    
    // Mark the server as having an observer and store the observer instance
    // so we can disconnect it later to prevent memory leaks.
    server.dataset.rovalraCleanupAttached = 'true';
    server._rovalraCleanupObserver = observer;
}
function cleanupServerUI(server) {
    // MODIFIED: Removed '.rbx-public-server-debug-info' and the generic '.share-button'
    // from the selector to prevent them from being deleted before they can be checked.
    server.querySelectorAll('.server-performance, .ropro-server-info, .ropro-uptime-info').forEach(el => {
        if (!isExcludedButton(el)) el.remove();
    });
    server.querySelectorAll('.text-info.rbx-game-status').forEach(el => {
        el.textContent = el.textContent.replace(/^\s*(Region:|Ping:|Server is full).*$/gim, '').trim();
    });
}


async function enhanceServer(server) {
    // Get the current serverId from the element's attributes
    const newServerId = server.getAttribute('data-rovalra-serverid') || server.getAttribute('data-gameid') || server.getAttribute('jobid');
    // Get the ID we last processed for this element, if any
    const oldProcessedId = server.dataset.rovalraProcessedId;

    // If there's no server ID, we can't do anything.
    if (!newServerId) {
        return;
    }

    // --- THIS IS THE CRUCIAL FIX ---
    // Check if we have processed this element before, but its server ID has now changed.
    // This happens when a friend joins a new game.
    if (oldProcessedId && oldProcessedId !== newServerId) {
        // This element has been updated in-place. Run the update logic.
        await updateServer(server, newServerId, oldProcessedId);
        return; // Stop here to avoid running the "new server" logic below.
    }

    // If the new ID is the same as the old one, it's already processed and unchanged.
    if (oldProcessedId === newServerId) {
        return;
    }
    // --- END OF FIX ---

    // Proactively add classes to prevent RoPro from modifying this element.
    server.classList.add('rovalra-checked', 'ropro-checked', 'ropro-server-invite-added');
    
    // Mark this element with the ID we are about to process.
    server.dataset.rovalraProcessedId = newServerId;
    
    // Cleanup and initial UI setup
    cleanupServerUI(server);
    attachCleanupObserver(server);
    const container = getOrCreateDetailsContainer(server);
    displayPlaceVersion(server, 'N/A', container);
    displayRegion(server, 'N/A', container);

    // Fetch and display server details
    const currentUptimeStatus = serverUptimes[newServerId];
    if (currentUptimeStatus === undefined) {
        displayUptime(server, 'fetching', container);
        serverUptimes[newServerId] = 'fetching';
        uptimeBatch.add(newServerId);
    } else {
        displayUptime(server, currentUptimeStatus, container);
    }
    fetchAndDisplayRegion(server, newServerId);

    // Add 'Share' button if one doesn't exist
    let shareButton = null;
    if (!server.querySelector('.rbx-public-game-server-copy-link')) {
        shareButton = await addCopyJoinLinkButton(server, newServerId);
    }

    // Display the server ID text
    if (!server.querySelector('.rbx-public-server-debug-info')) {
        server.querySelector('.server-id-text')?.remove();
        const serverIDTextElement = document.createElement('div');
        serverIDTextElement.className = 'server-id-text text-info xsmall';
        serverIDTextElement.style.cssText = 'font-size: 9px; margin-top: 8px; text-align: center; width: 100%;';
        serverIDTextElement.textContent = `ID: ${newServerId}`;

        const anchorElement = shareButton || server.querySelector('.game-server-join-btn');
        if (anchorElement) {
            anchorElement.after(serverIDTextElement);
        } else {
            const detailsContainer = server.querySelector('.rbx-game-server-details, .rbx-friends-game-server-details');
            detailsContainer?.appendChild(serverIDTextElement);
        }
    }
}
/**
 * Efficiently updates an existing server's UI in-place when its ID changes.
 * @param {HTMLElement} server The server element to update.
 * @param {string} newServerId The new game instance ID.
 * @param {string} oldServerId The previous game instance ID.
 */
async function updateServer(server, newServerId, oldServerId) {
    // 1. Update the internal state and caches
    if (oldServerId) {
        delete serverLocations[oldServerId];
        delete serverUptimes[oldServerId];
    }
    server.dataset.rovalraProcessedId = newServerId;

    // --- FIX ---
    // Ensure the classes are still present on the updated element.
    server.classList.add('rovalra-checked', 'ropro-checked', 'ropro-server-invite-added');

    // 2. Update the UI elements that require new data fetching
    const container = getOrCreateDetailsContainer(server);
    displayUptime(server, 'fetching', container);
    displayRegion(server, 'N/A', container);
    displayPlaceVersion(server, 'N/A', container);

    // 3. Trigger the new data fetches
    serverUptimes[newServerId] = 'fetching';
    uptimeBatch.add(newServerId);
    fetchAndDisplayRegion(server, newServerId);

    // 4. Update the server ID text display
    const serverIdElement = server.querySelector('.server-id-text');
    if (serverIdElement) {
        serverIdElement.textContent = `ID: ${newServerId}`;
    }

    // 5. Update the Share button's onClick handler with the new server ID
    const shareButton = server.querySelector('.rovalra-copy-join-link');
    if (shareButton) {
        const placeId = server.getAttribute('data-placeid') || window.location.href.match(/\/games\/(\d+)\//)?.[1];
        if (placeId) {
            shareButton.onclick = e => {
                e.preventDefault(); e.stopPropagation();
                navigator.clipboard.writeText(`roblox://experiences/start?placeId=${placeId}&gameInstanceId=${newServerId}`).then(() => {
                    shareButton.textContent = 'Copied!';
                    setTimeout(() => { shareButton.textContent = 'Share'; }, 2000);
                });
            };
        }
    }
}

function initializeMasterObserver() {
    let serversToProcess = new Set();
    let debounceTimeout = null;
    // --- MODIFICATION START ---
    // This selector now finds both public servers and the servers friends are in.
    const serverSelector = '.rbx-public-game-server-item, .rbx-friends-game-server-item';
    // --- MODIFICATION END ---

    const runProcessing = async () => {
        const enhancementPromises = [];
        serversToProcess.forEach(server => {
            if (document.body.contains(server)) {
                enhancementPromises.push(enhanceServer(server));
            }
        });
        serversToProcess.clear();

        await Promise.all(enhancementPromises);

        if (uptimeBatch.size > 0) {
            const placeId = window.location.href.match(/\/games\/(\d+)\//)?.[1];
            if (placeId) {
                const batchToFetch = Array.from(uptimeBatch);
                uptimeBatch.clear();
                setTimeout(() => fetchServerUptime(placeId, batchToFetch), 100);
            }
        }
    };
    
    const requestProcessing = () => {
        clearTimeout(debounceTimeout);
        // By reducing the timeout from 50ms to 0, we schedule the processing to run
        // as soon as the current browser task is complete. This makes the UI updates
        // feel instantaneous without sacrificing the benefits of batch processing.
        debounceTimeout = setTimeout(runProcessing, 0);
    };

    // --- MODIFICATION START ---
    // This new observer is more robust. It watches the entire page body for server
    // elements being added, making it compatible with more page layouts.
    const masterObserver = new MutationObserver((mutationsList) => {
        let needsApiCall = false;
        for (const mutation of mutationsList) {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) { // Check if it's an element
                        if (node.matches(serverSelector)) serversToProcess.add(node);
                        node.querySelectorAll(serverSelector).forEach(s => serversToProcess.add(s));
                    }
                });
            } else if (mutation.type === 'attributes' && (mutation.attributeName === 'data-rovalra-serverid' || mutation.attributeName === 'data-gameid')) {
                const server = mutation.target;
                if (server.matches(serverSelector)) {
                    const newServerId = server.getAttribute('data-rovalra-serverid') || server.getAttribute('data-gameid');
                    const oldProcessedId = server.dataset.rovalraProcessedId;
                    
                    if (newServerId && newServerId !== oldProcessedId) {
                        if (oldProcessedId) {
                            updateServer(server, newServerId, oldProcessedId);
                            needsApiCall = true;
                        } else {
                            serversToProcess.add(server);
                        }
                    }
                }
            }
        }
        if (serversToProcess.size > 0 || needsApiCall) {
            requestProcessing();
        }
    });

    masterObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-rovalra-serverid', 'data-gameid', 'jobid']
    });

    // Process any servers that are already on the page when the script loads
    document.querySelectorAll(serverSelector).forEach(s => serversToProcess.add(s));
    requestProcessing();
    // --- MODIFICATION END ---
}

    // --- INITIALIZATION ---
    loadServerIpMap();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeMasterObserver);
    } else {
        initializeMasterObserver();
    }
}

// --- ENTRY POINT ---
chrome.storage.local.get(['ServerlistmodificationsEnabled'], (settings) => {
    if (settings.ServerlistmodificationsEnabled !== false) {
        initializeExtensionFeatures();
    }
});
