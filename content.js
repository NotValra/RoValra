let trackedServerRequests = [];
let loadedScripts = [];
let roValraLoaded = false;

const loadScript = async (src, dataAttributes = {}) => {
    const startTime = performance.now();
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL(src);
        for (const key in dataAttributes) {
            script.dataset[key] = dataAttributes[key];
        }
        script.onload = () => {
            const endTime = performance.now();
            const duration = (endTime - startTime).toFixed(2);
            loadedScripts.push({ src, duration });
            resolve();
        };
        script.onerror = (error) => {
            loadedScripts.push({ src, error: "Failed to load" })
            reject(error);
        };
        document.head.appendChild(script);
    });
};

const detectTheme = async () => {
    try {
        const response = await fetch('https://apis.roblox.com/user-settings-api/v1/user-settings', {
            credentials: 'include'
        });
        if (!response.ok) {
            console.warn("Failed to fetch theme from API, falling back to DOM detection.");
            return detectThemeDOMFallback();
        }
        const data = await response.json();
        if (data && data.themeType) {
            return data.themeType.toLowerCase();
        } else {
            console.warn("Theme type not found in API response, falling back to DOM detection.");
            return detectThemeDOMFallback();
        }
    } catch (error) {
        console.error("Error fetching theme from API:", error);
        console.warn("Falling back to DOM theme detection due to API error.");
        return detectThemeDOMFallback();
    }
};

const detectThemeDOMFallback = () => {
    const header = document.getElementById('rbx-body');
    if (!header) {
        return 'dark';
    }
    const backgroundColor = window.getComputedStyle(header).backgroundColor;
    const isDarkMode = backgroundColor === 'rgb(25, 27, 29)' || backgroundColor === 'rgba(25, 27, 29, 1)' || backgroundColor === 'rgb(10, 10, 10)' || backgroundColor === 'rgb(35, 37, 39)' || backgroundColor === 'rgb(18, 18, 21)' || backgroundColor === '#181414';
    const theme = isDarkMode ? 'dark' : 'light';
    return theme;
};


const dispatchThemeEvent = (theme) => {
    const themeEvent = new CustomEvent('themeDetected', { detail: { theme: theme } });
    window.dispatchEvent(themeEvent);
};

function getPlaceIdFromUrl() {
    const url = window.location.href;
    const regex = /https:\/\/www\.roblox\.com\/(?:[a-z]{2}\/)?games\/(\d+)/;
    const match = url.match(regex);
    if (match && match[1]) {
        return match[1];
    } else {
        return null;
    }
}

(async () => {
    if (window.top !== window.self) {
        return;
    }
    if (roValraLoaded) {
        return;
    }
    roValraLoaded = true;

    const loadStartTime = performance.now();
    let settings;
    try {
        settings = await chrome.storage.local.get({
            hiddenCatalogEnabled: true,
            itemSalesEnabled: true,
            groupGamesEnabled: true,
            userGamesEnabled: true,
            userSniperEnabled: false,
            universalSniperEnabled: true,
            regionSelectorEnabled: true,
            subplacesEnabled: true,
            forceR6Enabled: true,
            fixR6Enabled: false,
            inviteEnabled: false, 
            regionSelectorInitialized: false,
            regionSelectorFirstTime: true, 
        });
    } catch (error) {
        console.error("Error loading settings:", error);
        settings = {};
    }

    if (settings.inviteEnabled === false) { 
        await chrome.storage.local.set({ inviteEnabled: false }); 
    }
    if (settings.regionSelectorFirstTime === true) { 
        await chrome.storage.local.set({ regionSelectorFirstTime: true }); 
    }
    if (settings.hiddenCatalogEnabled === true) { 
        await chrome.storage.local.set({hiddenCatalogEnabled: true }); 
    }
    if (settings.regionSelectorEnabled === true) { 
        await chrome.storage.local.set({regionSelectorEnabled: true }); 
    }
    if (settings.universalSniperEnabled === true) { 
        await chrome.storage.local.set({universalSniperEnabled: true }); 
    }

    if (settings.regionSelectorFirstTime) {
        if (settings.regionSelectorEnabled) {
            await loadScript('Games/Regions_content.js', { serverListURL: chrome.runtime.getURL('data/ServerList.json') });
        }
        //await chrome.storage.local.set({ regionSelectorEnabled: false, universalSniperEnabled: false,regionSelectorInitialized: 'pendingRefresh', regionSelectorFirstTime: false });
        return;
    }

    if (settings.regionSelectorInitialized === 'pendingRefresh') {
        await chrome.storage.local.set({ regionSelectorInitialized: true, universalSniperEnabled: true });
        if (settings.regionSelectorEnabled) {
            await loadScript('Games/Regions_content.js', { serverListURL: chrome.runtime.getURL('data/ServerList.json') });
        }
       // await chrome.storage.local.set({ regionSelectorEnabled: true, universalSniperEnabled: true }); 
        setTimeout(() => {
        }, 100);
        return;
    } else {
        if (settings.regionSelectorEnabled) {
            await loadScript('Games/Regions_content.js', { serverListURL: chrome.runtime.getURL('data/ServerList.json') });
        }
    }

    if (settings.inviteEnabled && currentPath.includes('/games/')) {
        await loadScript('Games/invite.js', { trackedRequests: JSON.stringify(trackedServerRequests) });
    }

    if (currentPath.includes('/catalog') || currentPath.includes('/bundles')) {
        if (settings.itemSalesEnabled) {
            await loadScript('misc/item_sales_content.js', { itemsUrl: chrome.runtime.getURL('data/items.json') });
        }
    } else if (currentPath.includes('/communities')) {
        if (settings.groupGamesEnabled) {
            await loadScript('HiddenGames/group_games.js');
        }
    } else if (currentPath.includes('/users/')) {
        if (settings.userGamesEnabled) {
            await loadScript('HiddenGames/user_games.js');
        }
        if (settings.userSniperEnabled) {
            await loadScript('misc/userSniper.js');
        }
        await loadScript('misc/itemChecker.js');
        await loadScript('misc/itemCheckerFilters.js');
    } else if (currentPath.includes('/games/')) {
        if (settings.subplacesEnabled) {
            await loadScript('Games/Subplaces.js');
        }
        if (settings.universalSniperEnabled) {
            await loadScript('Games/sniper.js');
        }
    }
    if (currentPath.includes('/my/avatar')) {
        if (settings.forceR6Enabled) {
            await loadScript('Avatar/R6Warning.js');
        }
        if (settings.fixR6Enabled) {
            await loadScript('Avatar/R6Fix.js');
        }
    }

    if (settings.hiddenCatalogEnabled) {
    }

    const theme = await detectTheme();
    dispatchThemeEvent(theme);
    if (theme === 'dark') {
        document.body.classList.add('dark-mode');
    } else {
        document.body.classList.remove('dark-mode');
    }

    const loadEndTime = performance.now();
    const totalLoadDuration = (loadEndTime - loadStartTime).toFixed(2);

    await loadScript('misc/style.js');

    console.log(
        "%cRoValra",
        "font-size: 3em; color: #FF4500;",
        "Developed by Valra",
        "\n",
        `Scripts Loaded (${totalLoadDuration}ms):`,
        loadedScripts.map(script => `\n   - ${script.src} - ${script.duration ? `${script.duration}ms` : "Failed to load"}`).join(""),
    );

})();