function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

chrome.storage.local.get({
    regionSelectorEnabled: false,
    regionSimpleUi: false
}, function(settings) {
    if (settings.regionSelectorEnabled && settings.regionSimpleUi) {
    regionSelectorEnabled = settings.regionSelectorEnabled;

    if (window.location.pathname.includes('/games/')) {

    const url = window.location.href;
    let placeId = null;
    const regex = /roblox\.com\/(?:[a-z]{2}\/)?games\/(\d+)/;
    const match = url.match(regex);


    if (match && match[1]) {
        placeId = match[1]
    }
    let defaultRegions = [
        "SG", "DE", "FR", "JP", "BR", "NL",
        "US-CA", "US-VA", "US-IL", "US-TX", "US-FL", "US-NY", "US-WA", "US-NJ", "US-OR", "US-OH",
        "AU", "GB", "IN"
    ];

    const regionCoordinates = {
        "SG": { latitude: 1.2897, longitude: 103.8501, city: "Singapore", state: null, country: "Singapore" },
        "DE": { latitude: 50.1155, longitude: 8.6842, city: "Frankfurt", state: null, country: "Germany" },
        "FR": { latitude: 48.8534, longitude: 2.3488, city: "Paris", state: null, country: "France" },
        "JP": { latitude: 35.6895, longitude: 139.6917, city: "Tokyo", state: null, country: "Japan" },
        "BR": { latitude: -14.2350, longitude: -51.9253, city: "Brazil", state: null, country: "Brazil" },
        "NL": { latitude: 52.3740, longitude: 4.8897, city: "Amsterdam", state: null, country: "Netherlands" },
        "US-CA": { latitude: 34.0522, longitude: -118.2437, city: "Los Angeles", state: "California", country: "United States" },
        "US-VA": { latitude: 39.0437, longitude: -77.4875, city: "Ashburn", state: "Virginia", country: "United States" },
        "US-IL": { latitude: 41.8500, longitude: -87.6500, city: "Chicago", state: "Illinois", country: "United States" },
        "US-TX": { latitude: 32.7831, longitude: -96.8067, city: "Dallas", state: "Texas", country: "United States" },
        "US-FL": { latitude: 25.7743, longitude: -80.1937, city: "Miami", state: "Florida", country: "United States" },
        "US-NY": { latitude: 40.7128, longitude: -74.0060, city: "New York City", state: "New York", country: "United States" },
        "US-WA": { latitude: 47.6062, longitude: -122.3321, city: "Seattle", state: "Washington", country: "United States" },
        "AU": { latitude: -33.8678, longitude: 151.2073, city: "Sydney", state: null, country: "Australia" },
        "GB": { latitude: 51.5130, longitude: -0.0800, city: "London", state: null, country: "United Kingdom" },
        "IN": { latitude: 19.0728, longitude: 72.8826, city: "Mumbai", state: null, country: "India" },
        "US-NJ": { latitude: 40.7895, longitude: -74.0565, city: "Secaucus", state: "New Jersey", country: "United States" },
        "US-OR": { latitude: 45.8399, longitude: -119.7006, city: "Boardman", state: "Oregon", country: "United States" },
        "US-OH": { latitude: 39.9612, longitude: -82.9988, city: "Columbus", state: "Ohio", country: "United States" }
    };


    let regionServerMap = {};
    let regionCounts = {};
    let allServers = [];
    let userRegion = null;
    let userIP = null;
    let serverLocations = {};
    let userLocation = null;
    let serverScores = {};

    let isRefreshing = false;
    let rateLimited = false;
    let regionMarkerVisibility = {};
    let waterData = null;
    defaultRegions.forEach(region => {
        regionMarkerVisibility[region] = true;
    });
    regionMarkerVisibility["BR"] = false;

    let isFetchingServersForRegion = {};
    let isSearchingMoreRegions = false;


    const INACTIVE_THRESHOLD = 3 * 60 * 60 * 1000;
    let config;
    let started = 'off';
    let debug_mode = false;
    const isChrome = navigator.userAgent.toLowerCase().indexOf('chrome') !== -1;
    let regionSelectorShowServerListOverlay = true;
    let regionSelectorEnabled = false;
    let regionButtonAdded = false;
    let prioritizedRegion = null;
    let lastHoveredRegion = null;
    let hoveredRegion = null;
    let globeInitialized = false;
    let isDragging = false;
    let serverListState = {
        visibleServerCount: 0,
        fetchedServerIds: new Set(),
        renderedServerIds: new Set(),
        servers: [],
        renderedServersData: new Map(),
        loading: false,
        currentSort: 'ping_lowest'
    };

    let currentTheme;
    async function detectThemeAPI() {
        if (currentTheme) return currentTheme;

        if (document.body.classList.contains('dark-theme')) {
            currentTheme = 'dark';
        } else if (document.body.classList.contains('light-theme')) {
            currentTheme = 'light';
        } else {
            currentTheme = document.body.classList.contains('dark-theme') ? 'dark' : 'light';
        }
        return currentTheme;
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
                    target_page: '',
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
    }

    updateRegionSelectorState().then(() => {
    if (placeId) {

    } else {
    }
    });

    if (false) {
    }

    function handleRateLimitedState(limited) {
        rateLimited = limited;
    }

    let hasSearchedRegionsOnce = false;

    async function getServerInfo(placeId, robloxCookie, regions, cursor = null) {
        if (hasSearchedRegionsOnce) {
            return;
        }
        hasSearchedRegionsOnce = true;



        const regionDropdown = document.getElementById('regionDropdown');
        if (regionDropdown && regionDropdown.style.display !== 'flex') {
            isRefreshing = false;
            return;
        }


        let url = `https://games.roblox.com/v1/games/${placeId}/servers/Public?excludeFullGames=true&limit=100`;
        if (cursor) {
            url += `&cursor=${cursor}`;
        }


        try {
            let totalRequests = 0;
            let serverPromises = [];
            let newServerCount = 0;
            const BATCH_SIZE = 1;

            const response = await fetch(url, {
                headers: {
                    "Referer": `https://www.roblox.com/games/${placeId}/`,
                    "Origin": "https://roblox.com",
                    "Cache-Control": "no-cache",
                },
                credentials: 'include',
            });
            if (response.status === 429) {
                rateLimited = true;
                isRefreshing = false;
                handleRateLimitedState(true)
                await new Promise(resolve => setTimeout(resolve, 5000));
                await getServerInfo(placeId, robloxCookie, regions, cursor);
                return;
            }
            if (!response.ok) {
                const errorDetails = await response.text();
                isRefreshing = false;
                return;
            }

            const servers = await response.json();

            if (!servers.data || servers.data.length === 0) {
                isRefreshing = false;
                return;
            }

            for (const server of servers.data) {
                if (regionDropdown && regionDropdown.style.display !== 'flex') {
                    isRefreshing = false;
                    return;
                }

                const promise = handleServer(server, placeId, robloxCookie, regions, newServerCount);
                serverPromises.push(promise);
                allServers.push(server);
            }
            isRefreshing = false;

            while (serverPromises.length > 0) {
                const batch = serverPromises.splice(0, BATCH_SIZE);
                const results = await Promise.all(batch);
                if (results.length > 0) {
                    newServerCount = results.reduce((accumulator, currentValue) => accumulator + currentValue, 0);
                }
            }

            if (servers.nextPageCursor && isRefreshing) {
                await getServerInfo(placeId, robloxCookie, regions, servers.nextPageCursor)
            }


            if (rateLimited) {
                isRefreshing = false;
            } else {
                handleRateLimitedState(false)
                updatePopup();
            }
        } catch (error) {
            isRefreshing = false;
        } finally {
        }
    }


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

    function getStateCodeFromRegion(regionName) {
        if (!regionName) return null;

        const stateNameToCode = {
            'alabama': 'AL',
            'alaska': 'AK',
            'arizona': 'AZ',
            'arkansas': 'AR',
            'california': 'CA',
            'colorado': 'CO',
            'connecticut': 'CT',
            'delaware': 'DE',
            'florida': 'FL',
            'georgia': 'GA',
            'hawaii': 'HI',
            'idaho': 'ID',
            'illinois': 'IL',
            'indiana': 'IN',
            'iowa': 'IA',
            'kansas': 'KS',
            'kentucky': 'KY',
            'louisiana': 'LA',
            'maine': 'ME',
            'maryland': 'MD',
            'massachusetts': 'MA',
            'michigan': 'MI',
            'minnesota': 'MN',
            'mississippi': 'MS',
            'missouri': 'MO',
            'montana': 'MT',
            'nebraska': 'NE',
            'nevada': 'NV',
            'new hampshire': 'NH',
            'new jersey': 'NJ',
            'new mexico': 'NM',
            'new york': 'NY',
            'north carolina': 'NC',
            'north dakota': 'ND',
            'ohio': 'OH',
            'oklahoma': 'OK',
            'oregon': 'OR',
            'pennsylvania': 'PA',
            'rhode island': 'RI',
            'south carolina': 'SC',
            'south dakota': 'SD',
            'tennessee': 'TN',
            'texas': 'TX',
            'utah': 'UT',
            'vermont': 'VT',
            'virginia': 'VA',
            'washington': 'WA',
            'west virginia': 'WV',
            'wisconsin': 'WI',
            'wyoming': 'WY'
        };

        const cleanedName = regionName.toLowerCase().trim();

        if (stateNameToCode[cleanedName]) {
            return stateNameToCode[cleanedName];
        }

        for (const [stateName, stateCode] of Object.entries(stateNameToCode)) {
            if (cleanedName.includes(stateName)) {
                return stateCode;
            }
        }

        if (cleanedName.includes('va') || cleanedName.includes('ashburn')) {
            return 'VA';
        }
        if (cleanedName.includes('ca') || cleanedName.includes('los angeles') || cleanedName.includes('san francisco')) {
            return 'CA';
        }
        if (cleanedName.includes('ny') || cleanedName.includes('new york')) {
            return 'NY';
        }
        if (cleanedName.includes('tx') || cleanedName.includes('dallas')) {
            return 'TX';
        }
        if (cleanedName.includes('il') || cleanedName.includes('chicago')) {
            return 'IL';
        }
        if (cleanedName.includes('fl') || cleanedName.includes('miami')) {
            return 'FL';
        }
        if (cleanedName.includes('wa') || cleanedName.includes('seattle')) {
            return 'WA';
        }
        if (cleanedName.includes('nj') || cleanedName.includes('secaucus')) {
            return 'NJ';
        }
        if (cleanedName.includes('or') || cleanedName.includes('boardman')) {
            return 'OR';
        }
        if (cleanedName.includes('oh') || cleanedName.includes('columbus')) {
            return 'OH';
        }

        return null;
    }


    let serverIpMap = null;
    let countryData = null;
    let countryPaths = [];
    let preProcessedCountryData = null;

    function preprocessCountryData(data) {
        const processedFeatures = data.features.map(feature => {
            if (feature.geometry && feature.geometry.coordinates) {
                const geometryType = feature.geometry.type;
                let coordinates = JSON.parse(JSON.stringify(feature.geometry.coordinates));

                function flipCoordinates(coords) {
                    if (Array.isArray(coords[0]) && typeof coords[0][0] === 'number') {
                        for (let i = 0; i < coords.length; i++) {
                            coords[i][1] = -coords[i][1];
                            coords[i][0] = -coords[i][0];
                        }
                    } else if (Array.isArray(coords[0])) {
                        for (let i = 0; i < coords.length; i++) {
                            flipCoordinates(coords[i]);
                        }
                    }
                }
                flipCoordinates(coordinates);

                return {
                    ...feature,
                    geometry: {
                        ...feature.geometry,
                        coordinates: coordinates
                    }
                };
            }
            return feature;
        });
        return { ...data, features: processedFeatures };
    }


    (async () => {
        try {
            const response = await fetch(chrome.runtime.getURL("data/ServerList.json"));
            const serverListData = await response.json();

            if (Array.isArray(serverListData)) {
                serverIpMap = serverListData;
            } else {
                serverIpMap = serverListData;
            }
        } catch (error) {
            serverIpMap = {};
        }

        countryData = await fetch(chrome.runtime.getURL("data/countries.json"))
            .then(response => response.json())
            .then(data => {
                preProcessedCountryData = preprocessCountryData(data);
                return data;
            })
            .catch(error => {
                return null;
            });
    })();


    let activeRequests = 0;
    async function handleServer(server, placeId, robloxCookie, regions, newServerCount = 0) {

        const serverId = server.id;
        activeRequests++;
        try {
            const serverInfo = await fetch(`https://gamejoin.roblox.com/v1/join-game-instance`, {
                method: 'POST',
                headers: {
                    "Accept": "*/*",
                    "Accept-Encoding": "gzip, deflate, br, zstd",
                    "Accept-Language": "en,en-US;q=0.9",
                    "Referer": `https://www.roblox.com/games/${placeId}/`,
                    "Origin": "https://roblox.com",
                    "Content-Type": "application/x-www-form-urlencoded"
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
            let latitude = null;
            let longitude = null;
            try {
                const sessionData = JSON.parse(ipData?.joinScript?.SessionId);
                latitude = sessionData?.Latitude;
                longitude = sessionData?.Longitude;
            } catch (e) {
            }

            let countryCode = null;
            let stateCode = null;
            let regionCode = null;

            const dataCenterId = ipData?.joinScript?.DataCenterId;

            if (dataCenterId && Array.isArray(serverIpMap)) {
                const dataCenter = serverIpMap.find(dc => dc.dataCenterId === dataCenterId);

                if (dataCenter) {
                    countryCode = dataCenter.location.country;

                    if (countryCode === "US") {
                        stateCode = getStateCodeFromRegion(dataCenter.location.region);
                        regionCode = `US-${stateCode}`;
                    } else {
                        regionCode = countryCode;
                    }
                }
            }

            if (!regionCode) {
                let ip = ipData?.joinScript?.UdmuxEndpoints?.[0]?.Address;
                if (!ip) {
                    return;
                }

                ip = ip.split('.').slice(0, 3).join('.') + '.0';

                let serverLocationData = !Array.isArray(serverIpMap) ? serverIpMap[ip] : null;

                if (!serverLocationData) {
                    serverLocationData = { country: { code: "US" } };
                }

                countryCode = serverLocationData?.country?.code;

                if (countryCode === "US") {
                    stateCode = serverLocationData.region?.code?.replace(/-\d+$/, '') || null;
                    regionCode = `US-${stateCode}`;
                } else {
                    regionCode = countryCode;
                }
            }

            const optimizedLocation = {
                c: countryCode === "US" ? stateCode : regionCode,
                x: 0,
                y: 0,
            };


            if (regions.includes(regionCode)) {
                regionCounts[regionCode] = (regionCounts[regionCode] || 0) + 1;
                regionServerMap[regionCode] = server;
            } else {

                if (regionCode && regionCode.startsWith('US-') && stateCode) {
                    const anyUSRegion = regions.find(r => r.startsWith('US-'));
                    if (anyUSRegion) {
                        regionCounts[regionCode] = (regionCounts[regionCode] || 0) + 1;
                        regionServerMap[regionCode] = server;
                    }
                }
            }
            if (regionCode === "BR") {
                regionMarkerVisibility["BR"] = true;
            }
            serverLocations[serverId] = {
                c: regionCode,
                l: optimizedLocation
            };
            userLocation = {
                latitude: latitude || 0,
                longitude: longitude || 0,
            }
            newServerCount++;
            return newServerCount;
        } catch (error) {
        } finally {
            activeRequests--;
        }
        return newServerCount;
    }


    function mapStateToRegion(data) {
        if (data && data.l?.c?.includes("US-")) {
            return data.l.c;
        }
        if (data && data.l?.c === "US" && data.isUS) {
            return `US-${data.l.c}`;
        }
        if (data && data.l?.c === "US") {
            return data.l.c;
        }
        return data?.c;
    }



    function calculateDistance(lat1, lon1, lat2, lon2) {
        if (lat1 === null || lon1 === null || lat2 === null || lon2 === null || typeof lat1 !== 'number' || typeof lon1 !== 'number' || typeof lat2 !== 'number' || typeof lon2 !== 'number' || isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)) {
            return NaN;
        }
        const R = 6371;
        const toRadians = (degrees) => degrees * Math.PI / 180;
        const lat1Rad = toRadians(lat1);
        const lon1Rad = toRadians(lon1);
        const lat2Rad = toRadians(lat2);
        const lon2Rad = toRadians(lon2);

        const latDiff = lat2Rad - lat1Rad;
        const lonDiff = lon2Rad - lon1Rad;

        const a = Math.sin(latDiff / 2) * Math.sin(latDiff / 2) +
            Math.cos(lat1Rad) * Math.cos(lat2Rad) *
            Math.sin(lonDiff / 2) * Math.sin(lonDiff / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        const distance = R * c;
        return distance;
    }


    let isFindingBestServer = false;

    async function findBestServer() {
        if (isFindingBestServer) {
            return;
        }

        isFindingBestServer = true;
        let combinedServers = [];
        let bestServer = null;
        let bestScore = -Infinity;

        try {
            if (!userLocation || typeof userLocation.latitude !== 'number' || typeof userLocation.longitude !== 'number' || userLocation.latitude === 0 || userLocation.longitude === 0 || isNaN(userLocation.latitude) || isNaN(userLocation.longitude)) {
                return null;
            }

            if (allServers.length > 0) {
                combinedServers = [...allServers];
            }

            if (combinedServers.length === 0) {
                return null;
            }

            const serverScoresPromises = combinedServers.map(async server => {
                let serverLat = 0;
                let serverLon = 0;
                let serverId = server.id;
                let serverScores = {};
                let serverData;
                if (server.id) {
                    serverData = await fetchServerData(server.id);
                }
                if (serverData?.joinScript?.UdmuxEndpoints?.length > 0) {
                    const serverIp = serverData?.joinScript?.UdmuxEndpoints[0]?.Address
                    if (serverIp) {
                        const serverIP = serverIp.split('.').slice(0, 3).join('.') + '.0';
                        const serverLocationData = serverIpMap[serverIP]
                        serverLat = serverLocationData?.latitude || 0;
                        serverLon = serverLocationData?.longitude || 0;
                    }
                } else if (serverLocations[server.id]?.l) {
                    const serverIP = Object.keys(serverIpMap).find(ip => {
                        const serverAddress = serverLocations[server.id]?.l
                        if (serverAddress) {
                            const currentIp = Object.keys(serverIpMap).find(ip => {
                                return ip === serverAddress;
                            });
                            if (serverAddress) {
                                return ip === currentIp;
                            }
                        }
                        return false
                    });
                    let locationData = null;
                    if (serverIP) {
                        locationData = serverIpMap[serverIP];
                        serverLat = typeof locationData?.latitude === 'number' ? locationData.latitude : 0;
                        serverLon = typeof locationData?.longitude === 'number' ? locationData.longitude : 0;
                    }
                } else if (serverLocations[server.id]?.l?.x && serverLocations[server.id]?.l?.y) {
                    serverLat = serverLocations[server.id].l?.x;
                    serverLon = serverLocations[server.id].l?.y;
                }
                if (!serverScores[serverId]) {
                    serverScores[serverId] = {};
                }
                serverScores[serverId].serverLat = serverLat;
                serverScores[serverId].serverLon = serverLon;
                let fps = server.fps;
                let ping = server.ping;


                if (isNaN(serverLat) || isNaN(serverLon) || serverLat === 0 || serverLon === 0) {
                    return { server, score: 0, serverId, serverScores };
                }
                const distance = calculateDistance(
                    userLocation.latitude,
                    userLocation.longitude,
                    serverLat,
                    serverLon
                );
                if (isNaN(distance)) {
                    return { server, score: 0, serverId, serverScores };
                }
                ping = typeof ping === 'number' && !isNaN(ping) ? ping : 0;
                fps = typeof fps === 'number' && !isNaN(fps) ? fps : 0;
                if (isNaN(fps) || fps < 0) {
                    return { server, score: 0, serverId, serverScores };
                }
                if (isNaN(ping) || ping < 0) {
                    return { server, score: 0, serverId, serverScores };
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

                serverScores[serverId].score = score;
                return { server, score, serverId, serverScores };
            });

            const serverScores = await Promise.all(serverScores);
            const validServerScores = serverScores.filter(result => result.score > 0);

            validServerScores.forEach((result) => {
                if (result) {
                    const { server, score } = result;
                    if (score > bestScore) {
                        bestScore = score;
                        bestServer = server;
                    }
                }
            });


            if (bestServer === null) {
                if (allServers.length > 0) {
                    for (const server of allServers) {
                        bestServer = server;
                        break;
                    }
                }
            }

            let serverId = bestServer?.id;
            return bestServer;
        } catch (error) {
            return null;
        } finally {
            isFindingBestServer = false;
        }
    }

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


    function calculateUptime(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;
        const seconds = Math.floor(diff / 1000);
        let minutes = 0;
        let hours = 0;
        let days = 0;

        if (seconds >= 60) {
            minutes = Math.floor(seconds / 60);
        }
        if (minutes >= 60) {
            hours = Math.floor(minutes / 60);
        }
        if (hours >= 24) {
            days = Math.floor(hours / 24);
        }


        if (days > 0) {
            return `${days} day${days > 1 ? 's' : ''}, ${hours % 24} hr${hours % 24 > 1 ? 's' : ''}`;
        } else if (hours > 0) {
            return `${hours} hr${hours > 1 ? 's' : ''}, ${minutes % 60} min`;
        } else if (minutes > 0) {
            return `${minutes} min, ${seconds % 60} sec`;
        }
        return `${seconds} sec`;
    }


    async function joinSpecificRegion(region) {
        let bestServer = null;
        if (allServers.length > 0 && userLocation) {
            bestServer = await findBestServer();
        }
        if (bestServer) {
            let serverId = bestServer?.id;

            const codeToInject = `
                    (function() {
                        if (typeof Roblox !== 'undefined' && Roblox.GameLauncher && Roblox.GameLauncher.joinGameInstance) {
                          Roblox.GameLauncher.joinGameInstance(parseInt('` + placeId + `', 10), String('` + serverId + `'));
                        } else {
                          console.error("Roblox.GameLauncher.joinGameInstance is not available in page context.");
                        }
                      })();
                    `;

            chrome.runtime.sendMessage(
                { action: "injectScript", codeToInject: codeToInject },
                (response) => {
                    if (response && response.success) {
                    } else {
                    }
                }
            );
        } else {
        }


    }

    function joinSpecificServer(serverId) {
        const codeToInject = `
            (function() {
                if (typeof Roblox !== 'undefined' && Roblox.GameLauncher && Roblox.GameLauncher.joinGameInstance) {
                  Roblox.GameLauncher.joinGameInstance(parseInt('` + placeId + `', 10), String('` + serverId + `'));
                } else {
                  console.error("Roblox.GameLauncher.joinGameInstance is not available in page context.");
                }
              })();
            `;

        chrome.runtime.sendMessage(
            { action: "injectScript", codeToInject: codeToInject },
            (response) => {
                if (response && response.success) {
                } else {
                }
            }
        );
    }

    function getFullLocationName(region) {
        const regionData = regionCoordinates[region];
        if (!regionData) {
            return region;
        }

        let locationString = "";
        if (regionData.country === "United States") {
            if (regionData.state) {
                locationString += `${regionData.state}`;
                if (regionData.city) {
                    locationString += `, ${regionData.city}`;
                }
            } else if (regionData.city) {
                locationString += `${regionData.city}`;
            }
            locationString += `, USA`;
        } else {
            if (regionData.city) {
                locationString += regionData.city;
                if (regionData.country) {
                    locationString += `, ${regionData.country}`;
                }
            } else if (regionData.country) {
                locationString += regionData.country;
            } else {
                locationString += region;
            }
        }
        return locationString;
    }


    function latLonToVector3(latitude, longitude) {
        const phi = (90 - latitude) * Math.PI / 180;
        const theta = longitude * Math.PI / 180;

        const x = Math.sin(phi) * Math.cos(theta);
        const y = Math.cos(phi);
        const z = Math.sin(phi) * Math.sin(theta);
        return { x: x, y: y, z: z };
    }


    let lastCacheKey = null;
    let cachedProjections = new Map();

    const projectionCache = new Map();
    function project(point3D, rotationX, rotationY, horizontalMarkerOffset, zoomLevel) {
        const cacheKey = `${point3D.x},${point3D.y},${point3D.z},${rotationX},${rotationY},${horizontalMarkerOffset},${zoomLevel}`;
        if (projectionCache.has(cacheKey)) {

            return projectionCache.get(cacheKey);
        }

        const cosX = Math.cos(rotationX);
        const sinX = Math.sin(rotationX);
        const cosY = Math.cos(rotationY);
        const sinY = Math.sin(rotationY);

        const offsetXPoint3D = {
            x: point3D.x + horizontalMarkerOffset,
            y: point3D.y,
            z: point3D.z
        };

        const rotatedX = cosY * offsetXPoint3D.x + sinY * offsetXPoint3D.z;
        const rotatedZ = -sinY * offsetXPoint3D.x + cosY * offsetXPoint3D.z;

        const finalY = cosX * point3D.y - sinX * rotatedZ;
        const finalZ = sinX * point3D.y + cosX * rotatedZ;
        const finalX = rotatedX;

        const projectionX = Math.round(finalX * 250 * zoomLevel + 250);
        const projectionY = Math.round(finalY * 250 * zoomLevel + 250);
        const projectedOutput = { x: projectionX, y: projectionY, z: finalZ, scale: 1 };

        projectionCache.set(cacheKey, projectedOutput);
        return projectedOutput;
    }



    let lastUpdateTime = 0;
    const targetUpdateFPS =60;
    const updateInterval = 1000 / targetUpdateFPS;
    const fixedHitRadius = 10;

    let lastRotationX = null;
    let lastRotationY = null;
    let lastZoomLevel = null;
    let lastRegionMarkerVisibility = {};

    let drawnCountryPaths = [];
    const MIN_DISTANCE_BETWEEN_COUNTRIES = 0;


    function updateGlobeVisualization(
        canvas, context, countryData,
        rotationX, rotationY, globeRadius, globeCenterX, globeCenterY,
        isDarkMode, zoomLevel, regionMarkers,
        mouseX, mouseY,
        hoveredRegion,
        lastDrawnMouseX, lastDrawnMouseY,
        setLastDrawnMouseX, setLastDrawnMouseY
    ) {

        let shouldRedraw = false;

        if (lastRotationX === null || lastRotationY === null || lastZoomLevel === null) {
            shouldRedraw = true;
        } else if (rotationX !== lastRotationX || rotationY !== lastRotationY || zoomLevel !== lastZoomLevel) {
            shouldRedraw = true;
        } else if (hoveredRegion !== lastHoveredRegion) {
            shouldRedraw = true;
        } else if (isDragging) {
             shouldRedraw = true;
        } else {
            for (const region in regionMarkerVisibility) {
                if (regionMarkerVisibility[region] !== lastRegionMarkerVisibility[region]) {
                    shouldRedraw = true;
                    break;
                }
            }
            if (!shouldRedraw && hoveredRegion !== null && (mouseX !== lastDrawnMouseX || mouseY !== lastDrawnMouseY)) {
                shouldRedraw = true;
            }
        }


        if (!shouldRedraw) {
            return;
        }

        lastRotationX = rotationX;
        lastRotationY = rotationY;
        lastZoomLevel = zoomLevel;
        lastRegionMarkerVisibility = { ...regionMarkerVisibility };
        lastHoveredRegion = hoveredRegion;
        setLastDrawnMouseX(mouseX);
        setLastDrawnMouseY(mouseY);

        context.clearRect(0, 0, canvas.width, canvas.height);
        projectionCache.clear();
        drawnCountryPaths = [];

        context.beginPath();
        context.arc(globeCenterX, globeCenterY, globeRadius * zoomLevel, 0, 2 * Math.PI);
        context.fillStyle = isDarkMode ? 'rgba(57, 57, 58, 0.6)' : 'rgba(255, 255, 255, 0.6)';
        context.globalAlpha = 5.0;
        context.fill();
        context.globalAlpha = 1.0;

        if (preProcessedCountryData && preProcessedCountryData.features) {
             preProcessedCountryData.features.forEach(feature => {
                if (feature.geometry && feature.geometry.coordinates) {
                    const geometryType = feature.geometry.type;
                    const coordinates = feature.geometry.coordinates;

                    if (geometryType === 'Polygon') {
                        const projectedCenter = getProjectedPolygonCenter(coordinates[0], rotationX, rotationY, zoomLevel);
                        if (!isOverlapping(projectedCenter, drawnCountryPaths, MIN_DISTANCE_BETWEEN_COUNTRIES)) {
                            drawCountryPath(context, coordinates, rotationX, rotationY, globeRadius, globeCenterX, globeCenterY, isDarkMode, zoomLevel);
                            drawnCountryPaths.push(projectedCenter);
                        }
                    } else if (geometryType === 'MultiPolygon') {
                        coordinates.forEach(polygonCoords => {
                            const projectedCenter = getProjectedPolygonCenter(polygonCoords[0], rotationX, rotationY, zoomLevel);
                            if (!isOverlapping(projectedCenter, drawnCountryPaths, MIN_DISTANCE_BETWEEN_COUNTRIES)) {
                                drawCountryPath(context, polygonCoords, rotationX, rotationY, globeRadius, globeCenterX, globeCenterY, isDarkMode, zoomLevel);
                                drawnCountryPaths.push(projectedCenter);
                            }
                        });
                    }
                }
            });
        }

        const horizontalMarkerOffsetValue = -0;
        const rotationYOffset = 9.425;

        const visibleRegionMarkers = regionMarkers.filter(markerData => regionMarkerVisibility[markerData.region]);

        visibleRegionMarkers.forEach(markerData => {
            const flippedPoint = {...markerData.point3D};
            flippedPoint.y = -flippedPoint.y;
            flippedPoint.x = -flippedPoint.x;

            const projectedCenter = project(flippedPoint, rotationX, rotationY + rotationYOffset, horizontalMarkerOffsetValue, zoomLevel);

            if (projectedCenter.z >= 0) {

                const circleRadius = 0.04 / zoomLevel;

                context.beginPath();

                for (let i = 0; i <= 12; i++) {
                    const angle = (i / 12) * Math.PI * 2;
                    const circlePoint3D = calculateRotatedPointOnCircle(flippedPoint, angle, circleRadius);
                    const projectedPoint = project(circlePoint3D, rotationX, rotationY + rotationYOffset, horizontalMarkerOffsetValue, zoomLevel);
                    if (i === 0) {
                        context.moveTo(projectedPoint.x, projectedPoint.y);
                    } else {
                        context.lineTo(projectedPoint.x, projectedPoint.y);
                    }
                }
                context.closePath();
                context.fillStyle = "rgba(255, 127, 14, 0.7)";
                context.fill();
                context.strokeStyle = "#ff7f0e";
                context.lineWidth = 1 / zoomLevel;
                context.stroke();

                markerData.projected3DPosition = projectedCenter;
                markerData.hitArea2D = { x: projectedCenter.x, y: projectedCenter.y, radius: fixedHitRadius };
            } else {
                markerData.projected3DPosition = null;
                markerData.hitArea2D = null;
            }
        });

        let tooltipData = updateTooltipPosition(mouseX, mouseY, hoveredRegion, regionMarkers, regionCounts, getFullLocationName);
        if (tooltipData) {
            draw3DTooltip(context, tooltipData.x, tooltipData.y, tooltipData.text, isDarkMode);
        }
    }

    function updateTooltipPosition(mouseX, mouseY, hoveredRegion, regionMarkers, regionCounts, getFullLocationName) {
        if (!hoveredRegion) {
            return null;
        }

        const regionName = getFullLocationName(hoveredRegion);
        const serverCount = regionCounts[hoveredRegion] || 0;
        const tooltipText = `${regionName}\n${serverCount} servers`;

        const estimatedTooltipWidth = 0;
        const estimatedTooltipHeight = 20;

        const tooltipX = mouseX - (estimatedTooltipWidth / 2);
        const tooltipY = mouseY - (estimatedTooltipHeight / 2);

        return {
            x: tooltipX,
            y: tooltipY,
            text: tooltipText
        };
    }
   function draw3DTooltip(context, x, y, text, isDarkMode) {
       context.save();

       const paddingX = 8;
       const paddingY = 5;
       const borderRadius = 4;
       const fontSize = 12;
       const fontFamily = 'sans-serif';
       const fontWeight = 'normal';
       context.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
       context.textAlign = 'center';
       context.textBaseline = 'bottom';

       const lines = text.split('\n');
       let textWidth = 0;
       for (const line of lines) {
           textWidth = Math.max(textWidth, context.measureText(line).width);
       }
       const tooltipWidth = textWidth + 2 * paddingX;
       const tooltipHeight = lines.length * (fontSize * 1.2) + 2 * paddingY;

       const tooltipX = x - tooltipWidth / 2;
       const tooltipY = y - tooltipHeight;

       const backgroundColor = isDarkMode ? '#222' : '#f0f0f0';
       const gradient = context.createLinearGradient(tooltipX, tooltipY, tooltipX + tooltipWidth, tooltipY + tooltipHeight);
       gradient.addColorStop(0, isDarkMode ? '#333' : '#fafafa');
       gradient.addColorStop(1, backgroundColor);

       context.fillStyle = gradient;

       context.shadowColor = 'rgba(0, 0, 0, 0.2)';
       context.shadowBlur = 3;
       context.shadowOffsetX = 0;
       context.shadowOffsetY = 1;

       context.beginPath();
       context.roundRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight, borderRadius);
       context.fill();

       context.shadowColor = 'transparent';
       context.strokeStyle = isDarkMode ? '#555' : '#ccc';
       context.lineWidth = 1;
       context.stroke();

       context.fillStyle = isDarkMode ? '#eee' : '#333';
       context.textBaseline = 'top';
       let currentY = tooltipY + paddingY;
       for (const line of lines) {
           context.fillText(line, x, currentY);
           currentY += fontSize * 1.2;
       }

       context.restore();
   }


    function getProjectedPolygonCenter(polygonRing, rotationX, rotationY, zoomLevel) {
        let sumX = 0;
        let sumY = 0;
        let visiblePointCount = 0;

        for (let i = 0; i < polygonRing.length; i++) {
            const lon = polygonRing[i][0];
            const lat = polygonRing[i][1];
            const point3D = latLonToVector3(lat, lon);
            const projectedPoint = project(point3D, rotationX, rotationY, 0, zoomLevel);
            if (projectedPoint.z >= 0) {
                sumX += projectedPoint.x;
                sumY += projectedPoint.y;
                visiblePointCount++;
            }
        }

        if (visiblePointCount > 0) {
            return { x: sumX / visiblePointCount, y: sumY / visiblePointCount };
        } else {
            return null;
        }
    }


    function isOverlapping(projectedCenter, drawnPaths, minDistance) {
        if (!projectedCenter) return false;
        for (const drawnPathCenter of drawnPaths) {
            if (!drawnPathCenter) continue;
            const dx = projectedCenter.x - drawnPathCenter.x;
            const dy = projectedCenter.y - drawnPathCenter.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < minDistance) {
                return true;
            }
        }
        return false;
    }


    function calculateRotatedPointOnCircle(centerPoint3D, angle, radius) {
        const normal = normalizeVector(centerPoint3D);
        let localX, localY;

        if (Math.abs(normal.y) > 0.9) {
            localX = {x: 1, y: 0, z: 0};
            localY = normalizeVector(crossProduct(normal, localX));
        } else {
            localY = {x: 0, y: 1, z: 0};
            localX = normalizeVector(crossProduct(localY, normal));
            localY = normalizeVector(crossProduct(normal, localX));
        }


        const localPoint = {
            x: Math.cos(angle) * radius,
            y: Math.sin(angle) * radius,
            z: 0
        };

        const worldPoint = {
            x: centerPoint3D.x + localPoint.x * localX.x + localPoint.y * localY.x,
            y: centerPoint3D.y + localPoint.x * localX.y + localPoint.y * localY.y,
            z: centerPoint3D.z + localPoint.x * localX.z + localPoint.y * localY.z
        };

        return worldPoint;
    }


    function normalizeVector(vec) {
        const magnitude = Math.sqrt(vec.x * vec.x + vec.y * vec.y + vec.z * vec.z);
        if (magnitude === 0) return {x: 0, y: 0, z: 0};
        return { x: vec.x / magnitude, y: vec.y / magnitude, z: vec.z / magnitude };
    }

    function crossProduct(vecA, vecB) {
        return {
            x: vecA.y * vecB.z - vecA.z * vecB.y,
            y: vecA.z * vecB.x - vecA.x * vecB.z,
            z: vecA.x * vecB.y - vecA.y * vecB.x
        };
    }
    function dotProduct(vecA, vecB) {
        return vecA.x * vecB.x + vecA.y * vecB.y + vecA.z * vecB.z;
    }


    function setRotation(axis, angle) {
        const s = Math.sin(angle / 2);
        const c = Math.cos(angle / 2);
        return {
            x: axis.x * s,
            y: axis.y * s,
            z: axis.z * s,
            w: c
        };
    }

    function rotateVector(v, q) {
        const qv = { x: q.x, y: q.y, z: q.z };
        const qq_v = crossProduct(qv, v);
        const q_qq_v = crossProduct(qv, qq_v);
        const scalar_part = dotProduct(qv, v);

        return {
            x: v.x + 2 * (q.w * qq_v.x + q_qq_v.x),
            y: v.y + 2 * (q.w * qq_v.y + q_qq_v.y),
            z: v.z + 2 * (q.w * qq_v.z + q_qq_v.z)
        };
    }


    function drawWaterPath(context, polygonCoordinates, rotationX, rotationY, globeRadius, globeCenterX, globeCenterY, isDarkMode, zoomLevel) {
    }
    function drawCountryPath(context, polygonCoordinates, rotationX, rotationY, globeRadius, globeCenterX, globeCenterY, isDarkMode, zoomLevel, drawOutlines = true) {
        context.save();

        context.beginPath();
        context.arc(globeCenterX, globeCenterY, globeRadius * zoomLevel, 0, 2 * Math.PI);
        context.closePath();
        context.clip();

        context.strokeStyle = isDarkMode ? 'rgba(200, 200, 200, 1)' : 'rgba(100, 100, 100, 1)';
        context.lineWidth = 0.3;

        for (const ring of polygonCoordinates) {
            const projectedPoints = [];

            for (let i = 0; i < ring.length; i++) {
                const lon = ring[i][0];
                const lat = ring[i][1];
                const point3D = latLonToVector3(lat, lon);
                projectedPoints.push(project(point3D, rotationX, rotationY, 0, zoomLevel));
            }

            if (projectedPoints.length < 2) continue;

            let pathStarted = false;

            for (let i = 0; i < projectedPoints.length; i++) {
                const currentPoint = projectedPoints[i];
                const nextPointIndex = (i + 1) % projectedPoints.length;
                const nextPoint = projectedPoints[nextPointIndex];

                if (currentPoint.z >= 0 && nextPoint.z >= 0) {
                    if (!pathStarted) {
                        context.beginPath();
                        context.moveTo(currentPoint.x, currentPoint.y);
                        pathStarted = true;
                    }
                    context.lineTo(nextPoint.x, nextPoint.y);
                } else {
                    if (pathStarted) {
                        context.stroke();
                        pathStarted = false;
                    }
                }
            }

            if (pathStarted) {
                context.stroke();
            }
        }
        context.restore();
    }

    async function fetchThumbnailsBatch(tokens) {
        if (!tokens || tokens.length === 0) {
            return {};
        }

        const baseUrl = "https://thumbnails.roblox.com/v1/batch";
        const batchSize = 50;
        const thumbnailMap = {};
        const allRequests = [];

        for (let i = 0; i < tokens.length; i += batchSize) {
            const tokenBatch = tokens.slice(i, i + batchSize);
            if (tokenBatch.length === 0) continue;

            const requests = tokenBatch.map((token, index) => ({
                requestId: `0:${token}:AvatarHeadshot:96x96:webp:regular`,
                type: "AvatarHeadShot",
                targetId: 0,
                token: token,
                format: "png",
                size: "150x150"
            }));

            const requestPayload = JSON.stringify(requests);

            const fetchPromise = fetch(baseUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: requestPayload
            }).then(response => {
                if (!response.ok) {
                    return [];
                }
                return response.json();
            }).then(data => {
                if (data && data.data) {
                    data.data.forEach((thumbnailData, idx) => {
                        const token = tokenBatch[idx];
                        if (thumbnailData.imageUrl) {
                            thumbnailMap[token] = thumbnailData.imageUrl;
                        } else {
                            thumbnailMap[token] = null;
                        }
                    });
                }
            }).catch(error => {
            });
            allRequests.push(fetchPromise);
        }
        await Promise.all(allRequests);
        return thumbnailMap;
    }


    async function updatePopup(retries = 5) {

        let gameTitleContainer = document.querySelector(".game-title-container");
        if (!gameTitleContainer) {
            if (retries > 0) {
                setTimeout(() => updatePopup(retries - 1), 1000);
                return;
            } else {
                return;
            }
        }

        let existingRegionButton = gameTitleContainer.querySelector("#regionDropdownButton");
        if (existingRegionButton) {
            return;
        }

        const theme = await detectThemeAPI();
        const isDarkMode = theme === 'dark';

        const regionDropdownButton = document.createElement('button');
        regionDropdownButton.id = 'regionDropdownButton';
        regionDropdownButton.textContent = 'Regions';

        const globeSVG = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        globeSVG.setAttribute("width", "17");
        globeSVG.setAttribute("height", "17");
        globeSVG.setAttribute("viewBox", "0 0 24 24");
        globeSVG.setAttribute("fill", "none");
        globeSVG.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        globeSVG.style.display = 'inline-block';
        globeSVG.style.verticalAlign = 'middle';
        globeSVG.style.marginLeft = '4px';

        const pathSVG = document.createElementNS("http://www.w3.org/2000/svg", "path");
        pathSVG.setAttribute("d", "M15 2.4578C14.053 2.16035 13.0452 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 10.2847 21.5681 8.67022 20.8071 7.25945M17 5.75H17.005M10.5001 21.8883L10.5002 19.6849C10.5002 19.5656 10.5429 19.4502 10.6205 19.3596L13.1063 16.4594C13.3106 16.2211 13.2473 15.8556 12.9748 15.6999L10.1185 14.0677C10.0409 14.0234 9.97663 13.9591 9.93234 13.8814L8.07046 10.6186C7.97356 10.4488 7.78657 10.3511 7.59183 10.3684L2.06418 10.8607M21 6C21 8.20914 19 10 17 12C15 10 13 8.20914 13 6C13 3.79086 14.7909 2 17 2C19.2091 2 21 3.79086 21 6ZM17.25 5.75C17.25 5.88807 17.1381 6 17 6C16.8619 6 16.75 5.88807 16.75 5.75C16.75 5.61193 16.8619 5.5 17 5.5C17.1381 5.5 17.25 5.61193 17.25 5.75Z");
        pathSVG.setAttribute("stroke", isDarkMode ? "white" : "rgb(39, 41, 48)");
        pathSVG.setAttribute("stroke-width", "2");
        pathSVG.setAttribute("stroke-linecap", "round");
        pathSVG.setAttribute("stroke-linejoin", "round");

        globeSVG.appendChild(pathSVG);
        regionDropdownButton.appendChild(globeSVG);


        regionDropdownButton.style.marginLeft = '0px';
        regionDropdownButton.style.padding = "0px";
        regionDropdownButton.style.backgroundColor = 'transparent';
        regionDropdownButton.style.border = 'none';
        regionDropdownButton.style.borderRadius = "0px";
        regionDropdownButton.style.cursor = "pointer";
        regionDropdownButton.style.fontSize = "15px";
        regionDropdownButton.style.fontFamily = 'Builder Sans';
        regionDropdownButton.style.fontWeight = "500";
        regionDropdownButton.style.color = isDarkMode ? "white" : "rgb(39, 41, 48)";
        regionDropdownButton.style.transition = "text-decoration 0.3s ease";

        regionDropdownButton.addEventListener('mouseover', () => {
            regionDropdownButton.style.textDecoration = 'underline';
            pathSVG.setAttribute("stroke", isDarkMode ? "white" : "rgb(39, 41, 48)");
        });
        regionDropdownButton.addEventListener('mouseout', () => {
            regionDropdownButton.style.textDecoration = 'none';
            pathSVG.setAttribute("stroke", isDarkMode ? "white" : "rgb(39, 41, 48)");
        });
        const regionDropdown = document.createElement('div');
        regionDropdown.id = 'regionDropdown';
        regionDropdown.style.position = 'absolute';
        regionDropdown.style.right = '100%';
        regionDropdown.style.top = '170px';
        regionDropdown.style.left = 'auto';
        regionDropdown.style.backgroundColor = isDarkMode ? 'rgb(39, 41, 48)' : '#f0f0f0';
        regionDropdown.style.border = isDarkMode ? '1px solid #444' : '1px solid #ddd';
        regionDropdown.style.borderRadius = '6px';
        regionDropdown.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
        regionDropdown.style.zIndex = '9999';
        regionDropdown.style.padding = '5px';
        regionDropdown.style.minWidth = '550px';
        regionDropdown.style.maxWidth = '650px';
        regionDropdown.style.height = '550px';
        regionDropdown.style.display = 'none';
        regionDropdown.style.flexDirection = 'column';
        regionDropdown.style.overflow = 'hidden';
        regionDropdown.style.justifyContent = 'center';
        regionDropdown.style.alignItems = 'center';


        const explanationContainer = document.createElement('div');
        explanationContainer.style.display = 'flex';
        explanationContainer.style.alignItems = 'center';
        explanationContainer.style.justifyContent = 'center';
        explanationContainer.style.marginBottom = '10px';

        const iconImage = document.createElement('img');
        iconImage.src = chrome.runtime.getURL("Assets/icon-128.png");
        iconImage.alt = "RoValra Icon";
        iconImage.style.width = '20px';
        iconImage.style.height = '20px';
        iconImage.style.marginLeft = '5px';

        const explanationText = document.createElement('p');
        explanationText.textContent = "RoValra Region Selector";
        explanationText.style.color = isDarkMode ? 'white' : 'rgb(39, 41, 48)';
        explanationText.style.textAlign = 'center';
        explanationText.style.fontSize = '20px';
        explanationText.style.fontWeight = '700';
        explanationText.style.fontFamily = 'Builder Sans';
        explanationText.style.marginBottom = '0';

        explanationContainer.appendChild(explanationText);
        explanationContainer.appendChild(iconImage);

        regionDropdown.appendChild(explanationContainer);


        const canvas = document.createElement('canvas');
        canvas.width = 500;
        canvas.height = 500;
        const context = canvas.getContext('2d');
        regionDropdown.appendChild(canvas);


        let regionMarkers = defaultRegions.map(region => {
            const coords = regionCoordinates[region];
            const point3D = latLonToVector3(coords.latitude, coords.longitude);
            return { region: region, point3D: point3D, projected3DPosition: null, hitArea2D: null};
        });


        function initializeGlobe() {
            if (globeInitialized) return;

            const globeRadius = 250;
            const globeCenterX = 250;
            const globeCenterY = 250;
            let rotationX = 0;
            let rotationY = 0;
            let targetRotationX = 0;
            let targetRotationY = 0;
            let startDragX, startDragY;
            let zoomLevel = 1;
            let rotationSpeedY = 0.001;
            let storedRotationSpeedY = rotationSpeedY;
            const rotationEasingFactor = 0.15;

            let mouseX = 0;
            let mouseY = 0;
            let lastDrawnMouseX = -1;
            let lastDrawnMouseY = -1;

            countryPaths = [];

            function animateGlobe() {
                const now = performance.now();
                const elapsed = now - lastUpdateTime;

                rotationX += (targetRotationX - rotationX) * rotationEasingFactor;
                rotationY += (targetRotationY - rotationY) * rotationEasingFactor;

                updateGlobeVisualization(
                    canvas, context, countryData,
                    rotationX, rotationY, globeRadius, globeCenterX, globeCenterY,
                    isDarkMode, zoomLevel, regionMarkers,
                    mouseX, mouseY,
                    hoveredRegion,
                    lastDrawnMouseX, lastDrawnMouseY,
                    (newX) => { lastDrawnMouseX = newX; },
                    (newY) => { lastDrawnMouseY = newY; }
                );
                lastUpdateTime = now;

                requestAnimationFrame(animateGlobe);
            }

            lastUpdateTime = performance.now();
            animateGlobe();

            let possibleClick = false;

            function handleDocumentMouseMove(event) {
                if (!isDragging) return;
                possibleClick = false;
                const currentX = event.clientX;
                const currentY = event.clientY;
                const deltaX = currentX - startDragX;
                const deltaY = currentY - startDragY;
                const rotationSensitivity = 0.008;
                targetRotationY += deltaX * rotationSensitivity;
                targetRotationX -= deltaY * rotationSensitivity;
                const maxRotationX = Math.PI / 2 - 0.1;
                const minRotationX = -Math.PI / 2 + 0.1;
                targetRotationX = Math.max(minRotationX, Math.min(maxRotationX, targetRotationX));
                startDragX = currentX;
                startDragY = currentY;
            }

            function handleDocumentMouseUp(event) {
                if (!isDragging) return;
                isDragging = false;
                canvas.style.cursor = 'pointer';
                event.stopPropagation();
                document.removeEventListener('mousemove', handleDocumentMouseMove);

                if (possibleClick) {
                    const rect = canvas.getBoundingClientRect();
                    const clickMouseX = event.clientX - rect.left;
                    const clickMouseY = event.clientY - rect.top;
                    const currentMarkers = regionMarkers.filter(markerData => regionMarkerVisibility[markerData.region]);
                    for (const markerData of currentMarkers) {
                        if (markerData.hitArea2D && markerData.projected3DPosition && markerData.projected3DPosition.z >= 0) {
                            const dx = clickMouseX - markerData.hitArea2D.x;
                            const dy = clickMouseY - markerData.hitArea2D.y;
                            const distance = Math.sqrt(dx * dx + dy * dy);
                            if (distance < markerData.hitArea2D.radius) {
                                regionDropdown.style.display = 'none';
                                isRefreshing = false;
                                showRegionServerListOverlay(markerData.region);
                                possibleClick = false;
                                break;
                            }
                        }
                    }
                }
                possibleClick = false;
            }

            canvas.addEventListener('mousedown', (event) => {
                if (event.button !== 0) return;
                isDragging = true;
                possibleClick = true;
                startDragX = event.clientX;
                startDragY = event.clientY;
                canvas.style.cursor = 'grabbing';
                document.addEventListener('mousemove', handleDocumentMouseMove);
                document.addEventListener('mouseup', handleDocumentMouseUp, { once: true });
            });

            canvas.addEventListener('mousemove', (event) => {
                if (isDragging) return;

                const rect = canvas.getBoundingClientRect();
                mouseX = event.clientX - rect.left;
                mouseY = event.clientY - rect.top;

                let foundRegion = null;
                const visibleMarkers = regionMarkers.filter(markerData => regionMarkerVisibility[markerData.region]);

                for (const markerData of visibleMarkers) {
                    if (markerData.hitArea2D && markerData.projected3DPosition && markerData.projected3DPosition.z >= 0) {
                        const dx = mouseX - markerData.hitArea2D.x;
                        const dy = mouseY - markerData.hitArea2D.y;
                        const distance = Math.sqrt(dx * dx + dy * dy);

                        if (distance < markerData.hitArea2D.radius) {
                            foundRegion = markerData.region;
                            break;
                        }
                    }
                }

                if (hoveredRegion !== foundRegion) {
                    hoveredRegion = foundRegion;
                    prioritizedRegion = hoveredRegion;
                }
            });

            canvas.addEventListener('wheel', (event) => {
                event.preventDefault();
                const zoomSpeed = 0.1;
                const zoomFactor = 1.0 - event.deltaY * 0.001 * zoomSpeed;
                let newZoomLevel = zoomLevel * zoomFactor;
                zoomLevel = Math.max(1.0, Math.min(newZoomLevel, 3.0));
            });

             canvas.addEventListener('mouseleave', () => {
                 if (!isDragging) {
                    if (hoveredRegion !== null || prioritizedRegion !== null) {
                         hoveredRegion = null;
                         prioritizedRegion = null;
                         lastHoveredRegion = null;
                         mouseX = -1;
                         mouseY = -1;
                    }
                 }
             });

            canvas.addEventListener('mouseover', () => {
            });

            globeInitialized = true;
        }


        regionDropdownButton.addEventListener('click', (event) => {
            event.stopPropagation();

            const isCurrentlyHidden = !globeInitialized || regionDropdown.style.display !== 'flex';

            if (!globeInitialized) {
                regionDropdown.style.display = 'flex';
                setTimeout(() => {
                    initializeGlobe();
                }, 200);

                if (placeId && !isRefreshing && !rateLimited) {
                    isRefreshing = true;
                    getServerInfo(placeId, null, defaultRegions);

                    if (!window.serverRefreshInterval) {
                        window.serverRefreshInterval = setInterval(() => {
                            if (!isRefreshing && !rateLimited && regionDropdown.style.display === 'flex') {
                                isRefreshing = true;
                                getServerInfo(placeId, null, defaultRegions);
                            } else if (regionDropdown.style.display !== 'flex') {
                            }
                        }, 30000);
                    }
                }
            } else {
                mouseX = 0;
                mouseY = 0;
                hoveredRegion = null;
                prioritizedRegion = null;
                lastHoveredRegion = null;

                regionDropdown.style.display = isCurrentlyHidden ? 'flex' : 'none';

                if (isCurrentlyHidden) {
                    updateGlobe();

                    if (placeId && !isRefreshing && !rateLimited) {
                        if (!allServers.length) {
                            isRefreshing = true;
                            getServerInfo(placeId, null, defaultRegions);
                        } else {
                            if (!isRefreshing && !rateLimited) {
                                isRefreshing = true;
                                getServerInfo(placeId, null, defaultRegions);
                            }
                        }

                        if (!window.serverRefreshInterval) {
                            window.serverRefreshInterval = setInterval(() => {
                                if (!isRefreshing && !rateLimited && regionDropdown.style.display === 'flex') {
                                    isRefreshing = true;
                                    getServerInfo(placeId, null, defaultRegions);
                                } else if (regionDropdown.style.display !== 'flex') {
                                }
                            }, 30000);
                        }
                    }
                } else {

                    if (window.serverRefreshInterval) {
                        clearInterval(window.serverRefreshInterval);
                        window.serverRefreshInterval = null;
                    }

                    isRefreshing = false;
                }
            }
        });


        if (gameTitleContainer) {
            gameTitleContainer.appendChild(regionDropdownButton);
            gameTitleContainer.appendChild(regionDropdown);
            gameTitleContainer.style.position = 'relative';
            if (!regionButtonAdded) {
                regionButtonAdded = true;
            }
        }

        regionDropdown.addEventListener('mouseover', () => {
            storedRotationSpeedY = rotationSpeedY;
            rotationSpeedY = 0;
        });


        regionDropdown.addEventListener('mouseleave', () => {
            hoveredRegion = null;
            prioritizedRegion = null;
            lastHoveredRegion = null;

            rotationSpeedY = 0.001;
        });

        regionDropdown.addEventListener('mouseenter', () => {
            mouseX = 0;
            mouseY = 0;
            hoveredRegion = null;
            prioritizedRegion = null;
            lastHoveredRegion = null;
        });
    }


    async function showRegionServerListOverlay(region) {
        if (isFetchingServersForRegion[region]) {
            return;
        }
        isFetchingServersForRegion[region] = true;

        serverListState.visibleServerCount = 0;
        serverListState.fetchedServerIds.clear();
        serverListState.renderedServerIds.clear();
        serverListState.renderedServersData.clear();
        serverListState.servers = [];

        const modalOverlay = document.createElement('div');
        modalOverlay.style.position = 'fixed';
        modalOverlay.style.top = '0';
        modalOverlay.style.left = '0';
        modalOverlay.style.width = '100%';
        modalOverlay.style.height = '100%';
        modalOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.4)';
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

        let modalContent = document.createElement('div');
        const theme = await detectThemeAPI();
        const isDarkMode = theme === 'dark';
        modalContent.style.backgroundColor = isDarkMode ? 'rgb(18, 18, 21)' : '#fff';
        modalContent.style.padding = '20px';
        modalContent.style.borderRadius = '8px';
        modalContent.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
        modalContent.style.textAlign = 'center';
        modalContent.style.maxHeight = '800px';
        modalContent.style.overflowY = 'auto';
        modalContent.style.color = isDarkMode ? 'white' : 'rgb(39, 41, 48)';
        modalContent.style.width = '70%';
        modalContent.style.maxWidth = '800px';

        const headerContainer = document.createElement('div');
        headerContainer.style.position = 'relative';
        headerContainer.style.top = '0';
        headerContainer.style.backgroundColor = isDarkMode ? 'rgb(18, 18, 21)' : '#fff';
        headerContainer.style.zIndex = '1002';
        headerContainer.style.paddingBottom = "10px";
        headerContainer.style.width = "100%";
        headerContainer.style.height = "50px";
        headerContainer.style.display = 'flex';
        headerContainer.style.alignItems = 'center';
        headerContainer.style.justifyContent = 'space-between';


        const abortController = new AbortController();

        const title = document.createElement('h1');
        const locationData = getFullLocationName(region);
        title.textContent = `Servers in ${locationData}`;
        title.style.marginBottom = '0px';
        title.style.textAlign = "left";
        title.style.marginLeft = "0px";
        title.style.fontSize = "26px";
        headerContainer.appendChild(title);

        const sortDropdown = document.createElement('select');
        sortDropdown.id = 'serverSortDropdown';
        sortDropdown.style.marginLeft = '10px';
        sortDropdown.style.padding = '8px';
        sortDropdown.style.borderRadius = '6px';
        sortDropdown.style.backgroundColor = isDarkMode ? '#24292e' : '#fff';
        sortDropdown.style.color = isDarkMode ? 'white' : 'rgb(39, 41, 48)';
        sortDropdown.style.border = isDarkMode ? '1px solid #444' : '1px solid #ddd';
        sortDropdown.style.cursor = 'pointer';
        sortDropdown.style.marginLeft = 'auto';

        const sortOptions = [
            { value: 'ping_lowest', text: 'Lowest Ping' },
            { value: 'players_highest', text: 'Highest Player Count' },
            { value: 'players_lowest', text: 'Lowest Player Count' }
        ];

        sortOptions.forEach(option => {
            const optionElement = document.createElement('option');
            optionElement.value = option.value;
            optionElement.textContent = option.text;
            sortDropdown.appendChild(optionElement);
        });
        sortDropdown.value = serverListState.currentSort;
        sortDropdown.addEventListener('change', (event) => {
            serverListState.currentSort = event.target.value;
            sortServers();
            renderFullServerList();
        });
        headerContainer.appendChild(sortDropdown);


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
        closeButton.style.marginLeft = '10px';
        closeButton.style.marginRight = '0px';
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

        let serverListScrollHandler;

        closeButton.addEventListener('click', () => {
            abortController.abort();
            modalOverlay.remove();
            overlay.remove();
            body.style.overflow = "auto";
            body.style.pointerEvents = "all";
            isFetchingServersForRegion[region] = false;

            isRefreshing = false;

            if (modalContent && serverListScrollHandler) {
                modalContent.removeEventListener('scroll', serverListScrollHandler);
            }
        });
        headerContainer.appendChild(closeButton);

        modalContent.appendChild(headerContainer)


        const serverList = document.createElement('div');
        serverList.style.display = 'flex';
        serverList.style.flexDirection = 'column';
        serverList.style.gap = '10px';

        serverList.innerHTML = `<p style="text-align:center;font-weight:bold;color:${isDarkMode ? 'white' : '#24292e'};">Searching for servers in ${getFullLocationName(region)}...</p>`;

        modalContent.appendChild(serverList);
        modalOverlay.appendChild(modalContent);
        document.body.appendChild(modalOverlay);

        let servers = [];
        for (const server of allServers) {
            let currentRegion = mapStateToRegion(serverLocations[server.id]);
            if (currentRegion === region) {
                servers.push(server);
            }
        }

        if (servers.length === 0) {
            serverList.innerHTML = `<p style="text-align:center;font-weight:bold;color:${isDarkMode ? 'white' : '#24292e'};">No active servers in this region.</p>`;
            modalContent.appendChild(serverList)
            modalOverlay.appendChild(modalContent);
            document.body.appendChild(modalOverlay);
            modalContent.addEventListener('scroll', serverListScrollHandler);
            modalOverlay.addEventListener('click', (event) => {
                if (event.target === modalOverlay) {
                    abortController.abort();
                    modalOverlay.remove();
                    overlay.remove();
                    body.style.overflow = "auto";
                    body.style.pointerEvents = "all";
                    isFetchingServersForRegion[region] = false;
                    if (modalContent && serverListScrollHandler) {
                        modalContent.removeEventListener('scroll', serverListScrollHandler);
                    }
                }
            });
            const Body = document.querySelector("body");
            Body.style.pointerEvents = "none";
            serverListState.visibleServerCount = 0;
            isFetchingServersForRegion[region] = false;
            return;
        }
        serverListState.servers = servers;
        sortServers();
        const serversPerPage = 20;


        async function appendServers() {
            const serversToRender = serverListState.servers.slice(serverListState.visibleServerCount, serverListState.visibleServerCount + serversPerPage);
            const serverDataPromises = serversToRender.map(async (server) => {
                const serverId = server.id;
                if (serverListState.renderedServerIds.has(serverId)) {
                    return serverListState.renderedServersData.get(serverId);
                }

                const serverEntry = document.createElement('div');
                serverEntry.className = 'server-entry';
                let isServerUnknownPing = false;

                serverEntry.style.backgroundColor = isDarkMode ? '#24292e' : 'rgb(247, 247, 248)';
                serverEntry.style.border = isDarkMode ? '0px solid #444' : '#ddd';
                serverEntry.style.borderRadius = '6px';
                serverEntry.style.marginBottom = '10px';
                serverEntry.style.padding = '10px';
                serverEntry.style.display = 'flex';
                serverEntry.style.flexDirection = 'column';
                serverEntry.style.alignItems = 'stretch';
                serverEntry.style.position = '';


                const profilePicturesRow = document.createElement('div');
                profilePicturesRow.className = 'profile-pictures-row';
                profilePicturesRow.style.display = 'flex';
                profilePicturesRow.style.justifyContent = 'flex-start';
                profilePicturesRow.style.gap = '5px';
                profilePicturesRow.style.marginBottom = '10px';
                const playerTokens = server.playerTokens || [];
                const thumbnailUrls = await fetchThumbnailsBatch(playerTokens);
                for (let i = 0; i < Math.min(server.playing, 5); i++) {
                    const profileCircle = document.createElement('div');
                    profileCircle.className = 'profile-circle';
                    profileCircle.style.width = '60px';
                    profileCircle.style.height = '60px';
                    profileCircle.style.borderRadius = '50%';
                    profileCircle.style.backgroundColor = '#bbb';
                    const token = playerTokens[i];
                    const thumbnailUrl = thumbnailUrls[token];
                    if (thumbnailUrl) {
                        profileCircle.style.backgroundImage = `url(${thumbnailUrl})`;
                    } else {
                        profileCircle.style.backgroundImage = `url(https://www.roblox.com/headshot-thumbnail/image?userId=1&width=96&height=96&format=png)`;
                    }
                    profileCircle.style.backgroundSize = 'cover';
                    profileCircle.style.backgroundPosition = 'center';
                    profilePicturesRow.appendChild(profileCircle);
                }
                 if (server.playing > 5) {
                    const plusCount = document.createElement('div');
                    plusCount.className = 'plus-count';
                    plusCount.style.width = '60px';
                    plusCount.style.height = '60px';
                    plusCount.style.borderRadius = '50%';
                    plusCount.style.backgroundColor = '#777';
                    plusCount.style.color = 'white';
                    plusCount.style.display = 'flex';
                    plusCount.style.justifyContent = 'center';
                    plusCount.style.alignItems = 'center';
                    plusCount.textContent = `+${server.playing - 5}`;
                    profilePicturesRow.appendChild(plusCount);
                } else if (server.playing === 0) {
                    const profileCirclePlaceholder = document.createElement('div');
                    profileCirclePlaceholder.className = 'profile-circle-placeholder';
                    profileCirclePlaceholder.style.width = '60px';
                    profileCirclePlaceholder.style.height = '60px';
                    profileCirclePlaceholder.style.borderRadius = '50%';
                    profileCirclePlaceholder.style.backgroundColor = '#ddd';
                    profilePicturesRow.appendChild(profileCirclePlaceholder);
                }
                serverEntry.appendChild(profilePicturesRow);


                const serverInfoRow = document.createElement('div');
                serverInfoRow.className = 'server-info-row';
                serverInfoRow.style.display = 'flex';
                serverInfoRow.style.justifyContent = 'space-between';
                serverInfoRow.style.alignItems = 'center';
                serverInfoRow.style.marginBottom = '10px';
                const serverDetails = document.createElement('div');
                serverDetails.className = 'server-details';
                serverDetails.style.textAlign = 'left';
                const playerCountText = document.createElement('div');
                playerCountText.className = 'player-count-text';
                playerCountText.style.fontWeight = 'bold';
                const pingContainer = document.createElement('div');
                pingContainer.className = 'ping-container';
                pingContainer.style.display = 'flex';
                pingContainer.style.alignItems = 'center';
                pingContainer.style.gap = '3px';
                const pingText = document.createElement('div');
                pingText.className = 'ping-text';

                const serverData = await fetchServerData(serverId);
                let pingValue = "Unknown";
                try {
                    const sessionData = JSON.parse(serverData?.joinScript?.SessionId);
                    userLat = sessionData?.Latitude;
                    userLon = sessionData?.Longitude;
                } catch (e) {}
                const dataCenterId = serverData?.joinScript?.DataCenterId;
                let serverLat = 0;
                let serverLon = 0;

                if (dataCenterId && Array.isArray(serverIpMap)) {
                    const dataCenter = serverIpMap.find(dc => dc.dataCenterId === dataCenterId);

                    if (dataCenter && dataCenter.location && dataCenter.location.latLong) {
                        serverLat = parseFloat(dataCenter.location.latLong[0]);
                        serverLon = parseFloat(dataCenter.location.latLong[1]);
                    }
                }

                if (serverLat === 0 && serverLon === 0 && serverData?.joinScript?.UdmuxEndpoints?.length > 0) {
                    const serverIp = serverData?.joinScript?.UdmuxEndpoints[0]?.Address;
                    if (serverIp) {
                        const serverIP = serverIp.split('.').slice(0, 3).join('.') + '.0';
                        const serverLocationData = !Array.isArray(serverIpMap) ? serverIpMap[serverIP] : null;
                        serverLat = serverLocationData?.latitude || 0;
                        serverLon = serverLocationData?.longitude || 0;
                    }
                }

                const clientAddress = serverData?.joinScript?.MachineAddress;
                if (clientAddress && serverLat !== 0 && serverLon !== 0) {
                    const distance = calculateDistance(
                        userLat,
                        userLon,
                        serverLat,
                        serverLon
                    );
                    const calculatedPing = Math.round((distance / 3000) * 100);
                    pingValue = `${calculatedPing}ms`;
                } else {
                    pingValue = "Unknown";
                }

                if (pingValue === "Unknown") {
                    isServerUnknownPing = true;
                }

                if (isServerUnknownPing) {
                    return null;
                }

                playerCountText.textContent = `${server.playing} of ${server.maxPlayers} people max`;
                serverDetails.appendChild(playerCountText);
                server.calculatedPing = pingValue === "Unknown" ? Infinity : parseInt(pingValue.replace('ms', ''));
                pingText.textContent = `Ping: ${pingValue}`;
                pingText.style.marginRight = '2.5px';
                pingContainer.appendChild(pingText);
                const pingTooltipIcon = document.createElement('span');
                pingTooltipIcon.innerHTML = '<svg fill="rgb(170, 170, 170)" height="200px" width="200px" version="1.1" id="Capa_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 29.536 29.536" xml:space="preserve"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <g> <path d="M14.768,0C6.611,0,0,6.609,0,14.768c0,8.155,6.611,14.767,14.768,14.767s14.768-6.612,14.768-14.767 C29.535,6.609,22.924,0,14.768,0z M14.768,27.126c-6.828,0-12.361-5.532-12.361-12.359c0-6.828,5.533-12.362,12.361-12.362 c6.826,0,12.359,5.535,12.359,12.362C27.127,21.594,21.594,27.126,14.768,27.126z"></path> <path d="M14.385,19.337c-1.338,0-2.289,0.951-2.289,2.34c0,1.336,0.926,2.339,2.289,2.339c1.414,0,2.314-1.003,2.314-2.339 C16.672,20.288,15.771,19.337,14.385,19.337z"></path> <path d="M14.742,6.092c-1.824,0-3.34,0.513-4.293,1.053l0.875,2.804c0.668-0.462,1.697-0.772,2.545-0.772 c1.285,0.027,1.879,0.644,1.879,1.543c0,0.85-0.67,1.697-1.494,2.701c-1.156,1.364-1.594,2.701-1.516,4.012l0.025,0.669h3.42 v-0.463c-0.025-1.158,0.387-2.162,1.311-3.215c0.979-1.08,2.211-2.366,2.211-4.321C19.705,7.968,18.139,6.092,14.742,6.092z"></path> <g> </g> <g> </g> <g> </g> <g> </g> <g> </g> <g> </g> <g> </g> <g> </g> <g> </g> <g> </g> <g> </g> <g> </g> <g> </g> <g> </g> <g> </g> </g> </g></svg>';
                pingTooltipIcon.className = 'ping-tooltip-icon';
                pingTooltipIcon.style.cursor = 'pointer';
                pingTooltipIcon.style.fontSize = '1em';
                pingTooltipIcon.style.position = 'relative';
                pingTooltipIcon.style.display = 'inline-block';
                const svgElement = pingTooltipIcon.querySelector('svg');
                if (svgElement) {
                    svgElement.style.height = '14px';
                    svgElement.style.width = '14px';
                    svgElement.style.verticalAlign = 'middle';
                }
                const pingTooltip = document.createElement('div');
                pingTooltip.className = 'ping-tooltip';
                pingTooltip.textContent = 'The ping is an approximation and may not be entirely accurate.';
                pingTooltip.style.position = 'absolute';
                pingTooltip.style.backgroundColor = isDarkMode ? '#444' : '#eee';
                pingTooltip.style.color = isDarkMode ? 'white' : 'black';
                pingTooltip.style.padding = '5px';
                pingTooltip.style.borderRadius = '4px';
                pingTooltip.style.fontSize = '0.8em';
                pingTooltip.style.zIndex = '1001';
                pingTooltip.style.left = '50%';
                pingTooltip.style.bottom = '100%';
                pingTooltip.style.transform = 'translateX(-50%)';
                pingTooltip.style.marginBottom = '5px';
                pingTooltip.style.whiteSpace = 'normal';
                pingTooltip.style.width = '200px';
                pingTooltip.style.textAlign = 'center';
                pingTooltip.style.display = 'none';
                pingTooltipIcon.appendChild(pingTooltip);
                pingTooltipIcon.addEventListener('mouseover', () => { pingTooltip.style.display = 'block'; });
                pingTooltipIcon.addEventListener('mouseout', () => { pingTooltip.style.display = 'none'; });
                serverDetails.appendChild(pingContainer);

                const regionText = document.createElement('div');
                regionText.className = 'region-text';
                serverDetails.appendChild(regionText);
                serverInfoRow.appendChild(serverDetails);
                serverEntry.appendChild(serverInfoRow);


                const bottomRow = document.createElement('div');
                bottomRow.className = 'bottom-row';
                bottomRow.style.display = 'flex';
                bottomRow.style.justifyContent = 'flex-start';
                bottomRow.style.alignItems = 'center';
                bottomRow.style.gap = '5px';
                const joinButton = document.createElement('button');
                joinButton.textContent = 'Join';
                joinButton.className = 'server-button join-button';
                joinButton.style.backgroundColor = isDarkMode ? 'rgb(51, 95, 255)' : 'rgb(51, 95, 255)';
                joinButton.style.color = 'white';
                joinButton.style.border = 'none';
                joinButton.style.width = '90px'
                joinButton.style.borderRadius = '6px';
                joinButton.style.padding = '8px 15px';
                joinButton.style.cursor = 'pointer';
                joinButton.disabled = false;
                joinButton.addEventListener('click', () => {
                    joinSpecificServer(serverId);
                    modalOverlay.remove();
                    overlay.remove();
                    body.style.overflow = "auto";
                    body.style.pointerEvents = "all";
                    if (modalContent && serverListScrollHandler) {
                        modalContent.removeEventListener('scroll', serverListScrollHandler);
                    }
                });
                const shareButton = document.createElement('button');
                shareButton.textContent = 'Share';
                shareButton.className = 'server-button share-button';
                shareButton.style.backgroundColor = isDarkMode ? '#555' : '#ddd';
                shareButton.style.color = isDarkMode ? 'white' : '#333';
                shareButton.style.border = 'none';
                shareButton.style.borderRadius = '6px';
                shareButton.style.padding = '8px 15px';
                shareButton.style.cursor = 'pointer';
                shareButton.addEventListener('click', () => {
                    const linkToCopy = `roblox://experiences/start?placeId=${placeId}&gameInstanceId=${serverId}`;
                    navigator.clipboard.writeText(linkToCopy).then(() => {
                    shareButton.textContent = 'Copied';
                    setTimeout(() => { shareButton.textContent = 'Share'; }, 5000);
                    }).catch(err => {
                        alert('Failed to copy server link to clipboard.');
                        setTimeout(() => { shareButton.textContent = 'Share'; }, 5000);
                    });
                });
                const serverIdUptime = document.createElement('div');
                serverIdUptime.className = 'server-id-uptime';
                serverIdUptime.style.textAlign = 'right';
                serverIdUptime.style.fontSize = '0.9em';
                serverIdUptime.style.color = isDarkMode ? '#aaa' : '#777';
                serverIdUptime.style.marginLeft = 'auto';
                const uptime = calculateUptime(server.started * 1000);
                serverIdUptime.innerHTML = `ID: ${serverId}`;
                bottomRow.appendChild(joinButton);
                bottomRow.appendChild(shareButton);
                bottomRow.appendChild(serverIdUptime);
                serverEntry.appendChild(bottomRow);


                let isFull = false;
                let isInvalid = false;
                let isShutDown = false;
                if (isFull || isInvalid || isShutDown) return null;

                serverListState.renderedServerIds.add(serverId);
                serverListState.fetchedServerIds.add(serverId)
                serverListState.renderedServersData.set(serverId, serverEntry);
                return serverEntry;
            });
            const serverEntries = await Promise.all(serverDataPromises);
            const filteredServerEntries = serverEntries.filter(entry => entry !== null);
            filteredServerEntries.forEach(entry => {
                serverList.appendChild(entry);
            });
        }
        async function renderFullServerList() {
            serverList.innerHTML = '';
            serverListState.visibleServerCount = 0;
            serverListState.renderedServerIds.clear();
            serverListState.renderedServersData.clear();
            await appendServers();
        }


        function sortServers() {
            const sortValue = serverListState.currentSort;
            serverListState.servers.sort((a, b) => {
                if (sortValue === 'ping_lowest') {
                    return a.calculatedPing - b.calculatedPing;
                } else if (sortValue === 'players_highest') {
                    return b.playing - a.playing;
                } else if (sortValue === 'players_lowest') {
                    return a.playing - b.playing;
                }
                return 0;
            });
        }


        renderFullServerList();


        modalContent.appendChild(serverList)
        modalOverlay.appendChild(modalContent);
        document.body.appendChild(modalOverlay);

        serverListScrollHandler = async () => {
            if (serverListState.loading) return;
            const scrollTop = modalContent.scrollTop;
            const scrollHeight = modalContent.scrollHeight;
            const clientHeight = modalContent.clientHeight;
            if (scrollHeight - scrollTop - clientHeight < 300) {
                serverListState.loading = true;
                serverListState.visibleServerCount += serversPerPage;
                await appendServers();
                serverListState.loading = false;
            }
        };


        modalContent.addEventListener('scroll', serverListScrollHandler);
        modalOverlay.addEventListener('click', (event) => {
            if (event.target === modalOverlay) {
                abortController.abort();
                modalOverlay.remove();
                overlay.remove();
                body.style.overflow = "auto";
                body.style.pointerEvents = "all";
                isFetchingServersForRegion[region] = false;
                if (modalContent && serverListScrollHandler) {
                    modalContent.removeEventListener('scroll', serverListScrollHandler);
                }
            }
        });

        const Body = document.querySelector("body");
        Body.style.pointerEvents = "none";
        serverListState.visibleServerCount = 0;
    }

    async function fetchRegionServersWithCursor(placeId, region, cursor = null, modalOverlay, abortSignal) {
        if (!document.body.contains(modalOverlay)) {
            return { servers: [], nextPageCursor: null };
        }
        let url = `https://games.roblox.com/v1/games/${placeId}/servers/Public?excludeFullGames=true&limit=100`;
        if (cursor) {
            url += `&cursor=${cursor}`;
        }
        try {
            const response = await fetch(url, {
                headers: {
                    "Referer": `https://www.roblox.com/games/${placeId}/`,
                    "Origin": "https://roblox.com",
                    "Cache-Control": "no-cache",
                },
                credentials: 'include',
                signal: abortSignal
            });
            if (!response.ok) {
                const errorDetails = await response.text();
                return { servers: [], nextPageCursor: null };
            }
            const serversData = await response.json();
            if (!serversData.data) {
                return { servers: [], nextPageCursor: null };
            }

            let regionSpecificServers = [];
            const serverPromises = serversData.data.map(async server => {
                try {
                    await handleServer(server, placeId, null, defaultRegions, 0);

                    let currentRegion = mapStateToRegion(serverLocations[server.id]);

                    if (currentRegion === region) {
                        regionSpecificServers.push(server);
                    }
                } catch (err) {
                }
            });
            await Promise.all(serverPromises);

            return { servers: regionSpecificServers, nextPageCursor: serversData.nextPageCursor };
        } catch (error) {
            if (error.name === 'AbortError') {
                return { servers: [], nextPageCursor: null };
            }
            return { servers: [], nextPageCursor: null };
        } finally {
            isFetchingServersForRegion[region] = false;
            if (!document.body.contains(modalOverlay)) {
                return { servers: [], nextPageCursor: null };
            }
        }
    }

    async function searchMoreRegions() {
        if (isSearchingMoreRegions) return;
        isSearchingMoreRegions = true;

        const allRegionCodes = Object.keys(regionCoordinates);

        let newRegionsFound = false;
        for (const regionCode of allRegionCodes) {
            if (!defaultRegions.includes(regionCode)) {
                await getServerInfo(placeId, null, [regionCode]);
                if (regionCounts[regionCode] > 0) {
                    defaultRegions.push(regionCode);
                    regionMarkerVisibility[regionCode] = true;
                    newRegionsFound = true;
                }
            }
        }

        if (newRegionsFound) {
            updateGlobeVisualization(canvas, context, countryData, lastRotationX, lastRotationY, 250, 250, 250, await detectThemeAPI() === 'dark', lastZoomLevel, regionMarkers, tooltip, mouseX, mouseY, lastHoveredRegion);
            updatePopup();
        } else {
        }
        isSearchingMoreRegions = false;
    }


    (async () => {
        const theme = await detectThemeAPI();
        if (typeof applyTheme === 'function') {
            applyTheme(theme);
        }

        if (typeof updatePopup === 'function') {
            updatePopup();
        }
    })();

    }
}});