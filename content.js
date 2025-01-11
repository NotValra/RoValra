
let trackedServerRequests = [];
let loadedScripts = [];

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
             loadedScripts.push({src, error: "Failed to load"})
            reject(error);
        };
        document.head.appendChild(script);
    });
};

const detectTheme = () => {
    const header = document.getElementById('rbx-body');
    if (!header) {
        return 'dark'; 
    }

    const backgroundColor = window.getComputedStyle(header).backgroundColor;

    const isDarkMode = backgroundColor === 'rgb(25, 27, 29)' || backgroundColor === 'rgba(25, 27, 29, 1)' || backgroundColor === 'rgb(10, 10, 10)' || backgroundColor === 'rgb(35, 37, 39)'  || backgroundColor === 'rgb(18, 18, 21)' || backgroundColor === '#181414';

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
            sniperEnabled: true,
        });
        } catch(error) {
        }

        const currentPath = window.location.pathname;

         if (settings.regionSelectorFirstTime) {
            if (settings.regionSelectorEnabled) {
                await loadScript('Games/Regions_content.js', { serverListURL: chrome.runtime.getURL('data/ServerList.json') });
            }

            await chrome.storage.local.set({ regionSelectorEnabled: false, regionSelectorInitialized: 'pendingRefresh', regionSelectorFirstTime: false });

            window.location.reload();
        }

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


        if (settings.inviteEnabled && currentPath.includes('/games/')) {
             await loadScript('Games/invite.js', {  trackedRequests: JSON.stringify(trackedServerRequests) });

        }


       // await loadScript('misc/utils.js');


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
           if (settings.userSniperEnabled && currentPath.includes('/users/')) {
                 await loadScript('misc/userSniper.js');
            }
        }
         else if (currentPath.includes('/games/')) {
            if (settings.subplacesEnabled) {
                await loadScript('Games/Subplaces.js');
            }
             if (settings.sniperEnabled && currentPath.includes('/games/')) {
                 await loadScript('Games/sniper.js', {  trackedRequests: JSON.stringify(trackedServerRequests) });
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


        const theme = detectTheme();
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

    } catch (error) {
    }
})();