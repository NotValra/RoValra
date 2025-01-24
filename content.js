// Tracked Server Requests - This is an array to store requests made by the server.
let trackedServerRequests = [];
// Loaded Scripts - This array will track which scripts are loaded, and how long they take to load.
let loadedScripts = [];

// Function to dynamically load a script into the document.
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

// Function to detect if the user is in dark mode or light mode.
const detectTheme = () => {
    const header = document.getElementById('rbx-body');
    if (!header) {
        return 'dark';
    }

    const backgroundColor = window.getComputedStyle(header).backgroundColor;

    const isDarkMode = backgroundColor === 'rgb(25, 27, 29)' || backgroundColor === 'rgba(25, 27, 29, 1)' || backgroundColor === 'rgb(10, 10, 10)' || backgroundColor === 'rgb(35, 37, 39)' || backgroundColor === 'rgb(18, 18, 21)' || backgroundColor === '#181414';

    const theme = isDarkMode ? 'dark' : 'light';
    return theme;
};

// Function to dispatch a custom event with the current theme.
const dispatchThemeEvent = (theme) => {
    const themeEvent = new CustomEvent('themeDetected', { detail: { theme: theme } });
    window.dispatchEvent(themeEvent);
};

// Function to get the placeId from the current url,
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
    const loadStartTime = performance.now();
    try {
        let settings;
        try {
            settings = await chrome.storage.local.get({
                itemSalesEnabled: true,
                groupGamesEnabled: true,
                userGamesEnabled: true,
                userSniperEnabled: true,
                regionSelectorEnabled: true,
                subplacesEnabled: true,
                forceR6Enabled: true,
                fixR6Enabled: false,
                inviteEnabled: false,
                regionSelectorInitialized: false,
                regionSelectorFirstTime: true,
            });
        } catch (error) {
        }

        const currentPath = window.location.pathname;

        // Check if it's the first time the region selector is loaded.
        if (settings.regionSelectorFirstTime) {
            if (settings.regionSelectorEnabled) {
                await loadScript('Games/Regions_content.js', { serverListURL: chrome.runtime.getURL('data/ServerList.json') });
            }

            await chrome.storage.local.set({ regionSelectorEnabled: false, regionSelectorInitialized: 'pendingRefresh', regionSelectorFirstTime: false });

            window.location.reload();
        }

        // Check if the region selector has been loaded and needs a refresh.
        if (settings.regionSelectorInitialized === 'pendingRefresh') {
            await chrome.storage.local.set({ regionSelectorInitialized: true });
            if (settings.regionSelectorEnabled) {
                await loadScript('Games/Regions_content.js', { serverListURL: chrome.runtime.getURL('data/ServerList.json') });
            }
            await chrome.storage.local.set({ regionSelectorEnabled: true });
            setTimeout(() => {
                window.location.reload();
            }, 100);

        } else {
            if (settings.regionSelectorEnabled) {
                await loadScript('Games/Regions_content.js', { serverListURL: chrome.runtime.getURL('data/ServerList.json') });
            }
        }

        // Load invite script for games pages.
        if (settings.inviteEnabled && currentPath.includes('/games/')) {
            await loadScript('Games/invite.js', { trackedRequests: JSON.stringify(trackedServerRequests) });

        }

        // Load item sales script for catalog and bundles pages
        if (currentPath.includes('/catalog') || currentPath.includes('/bundles')) {
            if (settings.itemSalesEnabled) {
                await loadScript('misc/item_sales_content.js', { itemsUrl: chrome.runtime.getURL('data/items.json') });
            }
        } else if (currentPath.includes('/communities')) {
            // Load group games script for communities pages
            if (settings.groupGamesEnabled) {
                await loadScript('HiddenGames/group_games.js');
            }
        } else if (currentPath.includes('/users/')) {
            // Load user games script for user pages
            if (settings.userGamesEnabled) {
                await loadScript('HiddenGames/user_games.js');
            }
            if (settings.userSniperEnabled && currentPath.includes('/users/')) {
                await loadScript('misc/userSniper.js');
            }
        }
        else if (currentPath.includes('/games/')) {
            // Load subplaces script for game pages
            if (settings.subplacesEnabled) {
                await loadScript('Games/Subplaces.js');
            }

        }
        // Load r6 avatar scripts
        if (currentPath.includes('/my/avatar')) {
            if (settings.forceR6Enabled) {
                await loadScript('Avatar/R6Warning.js');
            }
            if (settings.fixR6Enabled) {
                await loadScript('Avatar/R6Fix.js');
            }
        }
        // Determine the current theme
        const theme = detectTheme();
        dispatchThemeEvent(theme);
        // Apply light/dark class to body element
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

    } catch (error) {
    }
})();