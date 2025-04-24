let trackedServerRequests = [];
let loadedScripts = [];
let roValraLoaded = false;

// Add preload hints for scripts we know we'll need
const addPreloadHints = () => {
    if (!document.head) {
        document.addEventListener('DOMContentLoaded', addPreloadHints);
        return;
    }
    
    const preloadScripts = [
        'misc/style.js',
        'Games/sniper.js',
        'misc/utils.js',
        'HiddenGames/user_games.js',
        'HiddenGames/group_games.js',
        'Avatar/R6Warning.js',
        'Avatar/R6Fix.js',
        'misc/userSniper.js',
        'misc/item_sales_content.js',
        'misc/pendingRobux.js',
    ];
    
    const modulePreloadScripts = [
       
    ];

    preloadScripts.forEach(src => {
        const existingPreload = document.querySelector(`link[rel="preload"][href="${chrome.runtime.getURL(src)}"]`);
        if (existingPreload) return;

        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'script';
        link.href = chrome.runtime.getURL(src);
        document.head.appendChild(link);
    });

    modulePreloadScripts.forEach(src => {
        const existingPreload = document.querySelector(`link[rel="preload"][href="${chrome.runtime.getURL(src)}"]`);
        if (existingPreload) return;

        const link = document.createElement('link');
        link.rel = 'modulepreload';
        link.href = chrome.runtime.getURL(src);
        document.head.appendChild(link);
    });
};

const loadScript = async (src, dataAttributes = {}) => {
    const startTime = performance.now();
    const scriptUrl = chrome.runtime.getURL(src);
    
    if (document.querySelector(`script[src="${scriptUrl}"]`)) {
        return Promise.resolve();
    }
    
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = scriptUrl;
        script.async = true;
        
        for (const key in dataAttributes) {
            script.dataset[key] = dataAttributes[key];
        }
        
        let retryCount = 0;
        const maxRetries = 2;
        
        const loadHandler = () => {
            const endTime = performance.now();
            const duration = (endTime - startTime).toFixed(2);
            loadedScripts.push({ src, duration });
            script.removeEventListener('load', loadHandler);
            script.removeEventListener('error', errorHandler);
            resolve();
        };
        
        const errorHandler = async (error) => {
            if (retryCount < maxRetries) {
                retryCount++;
                console.warn(`Retrying script load (${retryCount}/${maxRetries}):`, src);
                await new Promise(r => setTimeout(r, 100 * retryCount));
                script.src = scriptUrl + '?retry=' + retryCount; // Cache busting
            } else {
                loadedScripts.push({ src, error: "Failed to load after " + maxRetries + " attempts" });
                console.error("Script failed to load:", src, error);
                script.removeEventListener('load', loadHandler);
                script.removeEventListener('error', errorHandler);
                reject(error);
            }
        };
        
        script.addEventListener('load', loadHandler);
        script.addEventListener('error', errorHandler);
        document.head.appendChild(script);
    });
};

const detectTheme = async () => {
    try {
        const response = await fetch('https://apis.roblox.com/user-settings-api/v1/user-settings', {
            credentials: 'include'
        });
        if (!response.ok) throw new Error('API request failed');
        const data = await response.json();
        return data?.themeType?.toLowerCase() || detectThemeDOMFallback();
    } catch (error) {
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
    if (window.top !== window.self || roValraLoaded) return;
    roValraLoaded = true;

    const loadStartTime = performance.now();
    
    addPreloadHints();

    const [settings, theme] = await Promise.all([
        chrome.storage.local.get({
            hiddenCatalogEnabled: true,
            itemSalesEnabled: true,
            groupGamesEnabled: true,
            userGamesEnabled: true,
            userSniperEnabled: false,
            universalSniperEnabled: false,
            regionSelectorEnabled: true,
            subplacesEnabled: true,
            forceR6Enabled: true,
            fixR6Enabled: false,
            inviteEnabled: false,
            regionSelectorInitialized: false,
            regionSelectorFirstTime: true,
            regionSimpleUi: false,
            pendingRobuxEnabled: true,
            PreferredRegionEnabled: true,
        }),
        detectTheme()
    ]).catch(error => {
        console.error("Error in initial loading:", error);
        return [{}];
    });
    // There must be a better way to do this hehe
    if (settings.inviteEnabled === false) {
        await chrome.storage.local.set({ inviteEnabled: false });
    }
    if (settings.regionSelectorFirstTime === true) {
        await chrome.storage.local.set({ regionSelectorFirstTime: true });
    }
    if (settings.hiddenCatalogEnabled === true) {
        await chrome.storage.local.set({ hiddenCatalogEnabled: true });
    }
    if (settings.regionSelectorEnabled === true) {
        await chrome.storage.local.set({ regionSelectorEnabled: true });
    }
    if (settings.universalSniperEnabled === true) {
        await chrome.storage.local.set({ universalSniperEnabled: true });
    }

    if (settings.subplacesEnabled === true) {
        await chrome.storage.local.set({ subplacesEnabled: true });
    }
    if (settings.forceR6Enabled === true) {
        await chrome.storage.local.set({ forceR6Enabled: true });
    }
    if (settings.fixR6Enabled === true) {
        await chrome.storage.local.set({ fixR6Enabled: true });
    }
    if (settings.userSniperEnabled === true) {
        await chrome.storage.local.set({ userSniperEnabled: true });
    }
    if (settings.pendingRobuxEnabled === true) {
        await chrome.storage.local.set({ pendingRobuxEnabled: true });
    }
    if (settings.PreferredRegionEnabled === true) {
        await chrome.storage.local.set({ PreferredRegionEnabled: true });
    }
    if (settings.regionSimpleUi === true) {
        await chrome.storage.local.set({ regionSimpleUi: true });
    }
    if (settings.regionSelectorInitialized === true) {
        await chrome.storage.local.set({ regionSelectorInitialized: true });
    }
    
    if (settings.itemSalesEnabled === true) {
        await chrome.storage.local.set({ itemSalesEnabled: true });
    }
    if (settings.groupGamesEnabled === true) {
        await chrome.storage.local.set({ groupGamesEnabled: true });
    }
    if (settings.userGamesEnabled === true) {
        await chrome.storage.local.set({ userGamesEnabled: true });
    }
    if (settings.inviteEnabled === true) {
        await chrome.storage.local.set({ inviteEnabled: true });
    }
   

    const currentPath = window.location.pathname;
    
    const scriptPromises = [];
    
    if (settings.inviteEnabled && currentPath.includes('/games/')) {
        scriptPromises.push(loadScript('Games/invite.js', { trackedRequests: JSON.stringify(trackedServerRequests) }));
    }

    if (currentPath.includes('/catalog') || currentPath.includes('/bundles')) {
        if (settings.itemSalesEnabled) {
            scriptPromises.push(loadScript('misc/item_sales_content.js', { itemsUrl: chrome.runtime.getURL('data/items.json') }));
        }
    } else if (currentPath.includes('/communities')) {
        if (settings.groupGamesEnabled) {
            scriptPromises.push(loadScript('HiddenGames/group_games.js'));
        }
        if (settings.pendingRobuxEnabled) {
            scriptPromises.push(loadScript('misc/pendingRobux.js'));
        }
    } else if (currentPath.includes('/users/')) {
        if (settings.userGamesEnabled) {
            scriptPromises.push(loadScript('HiddenGames/user_games.js'));
        }
        if (settings.userSniperEnabled) {
            scriptPromises.push(loadScript('misc/userSniper.js'));
        }
    } else if (currentPath.includes('/games/')) {
        if (settings.subplacesEnabled) {
            scriptPromises.push(loadScript('Games/Subplaces.js'));
        }
        if (settings.universalSniperEnabled) {
            scriptPromises.push(loadScript('Games/sniper.js'));
        }
    }

    if (currentPath.includes('/my/avatar')) {
        if (settings.forceR6Enabled) {
            scriptPromises.push(loadScript('Avatar/R6Warning.js'));
        }
        if (settings.fixR6Enabled) {
            scriptPromises.push(loadScript('Avatar/R6Fix.js'));
        }
    }

    

    await Promise.all(scriptPromises).catch(error => console.error("Error loading scripts:", error));

    dispatchThemeEvent(theme);
    document.body.classList.toggle('dark-mode', theme === 'dark');

    await loadScript('misc/style.js');

    const loadEndTime = performance.now();
    const totalLoadDuration = (loadEndTime - loadStartTime).toFixed(2);

    console.log(
        "%cRoValra",
        "font-size: 3em; color: #FF4500;",
        "Developed by Valra",
        "\n",
        `Scripts Loaded (${totalLoadDuration}ms):`,
        loadedScripts.map(script => `\n   - ${script.src} - ${script.duration ? `${script.duration}ms` : "Failed to load"}`).join(""),
    );
})();

