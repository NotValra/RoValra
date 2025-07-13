let trackedServerRequests = [];
let loadedScripts = [];
let roValraLoaded = false;

const URL_MATCHERS = {
    CATALOG: /^\/(?:[a-z]{2}\/)?catalog/,
    BUNDLES: /^\/(?:[a-z]{2}\/)?bundles/,
    COMMUNITIES: /^\/(?:[a-z]{2}\/)?communities/,
    USERS: /^\/(?:[a-z]{2}\/)?users\//,
    GAMES: /^\/(?:[a-z]{2}\/)?games\//,
    AVATAR: /^\/(?:[a-z]{2}\/)?my\/avatar/,
    TRANSACTIONS: /^\/(?:[a-z]{2}\/)?transactions/
};

const PAGE_SETTINGS_MAP = {
    CATALOG: ['itemSalesEnabled'],
    BUNDLES: ['itemSalesEnabled'],
    COMMUNITIES: ['groupGamesEnabled', 'pendingRobuxEnabled'],
    USERS: ['userGamesEnabled', 'userSniperEnabled'],
    GAMES: ['subplacesEnabled', 'universalSniperEnabled', 'inviteEnabled'],
    AVATAR: ['forceR6Enabled', 'fixR6Enabled'],
    TRANSACTIONS: ['pendingRobuxEnabled']
};

const getCurrentPathType = (path) => {
    for (const [type, regex] of Object.entries(URL_MATCHERS)) {
        if (regex.test(path)) return type;
    }
    return null;
};

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
        
        const loadHandler = () => {
            const endTime = performance.now();
            const duration = (endTime - startTime).toFixed(2);
            loadedScripts.push({ src, duration });
            script.removeEventListener('load', loadHandler);
            script.removeEventListener('error', errorHandler);
            resolve();
        };
        
        const errorHandler = (error) => {
            loadedScripts.push({ src, error: "Failed to load" });
            console.error("Script failed to load:", src, error);
            script.removeEventListener('load', loadHandler);
            script.removeEventListener('error', errorHandler);
            reject(error);
        };
        
        script.addEventListener('load', loadHandler);
        script.addEventListener('error', errorHandler);
        document.head.appendChild(script);
    });
};
// Getting the theme is totally not all over the place in this extension trust me bro
// COFFEEEEEEEEEEE
const detectTheme = async () => {
    try {
        const response = await fetch('https://accountsettings.roblox.com/v1/themes/user', {
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

    const currentPath = window.location.pathname;
    const pathType = getCurrentPathType(currentPath);
    
    const requiredSettings = pathType ? PAGE_SETTINGS_MAP[pathType] : [];
    const defaultSettings = {
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
        inviteEnabled: true,
        regionSelectorInitialized: false,
        regionSelectorFirstTime: true,
        regionSimpleUi: false,
        pendingRobuxEnabled: true,
        PreferredRegionEnabled: true,
        privateInventoryEnabled: true,
        ServerdataEnabled: true,
        botdataEnabled: true,
        showfullserveridEnabled: true,
        enableFriendservers: true,
        privateserverlink: true,
        pendingrobuxtrans: true,
    };

    const settingsToLoad = {
        ...defaultSettings,
        ...Object.fromEntries(requiredSettings.map(key => [key, defaultSettings[key]]))
    };

    const [settings, theme] = await Promise.all([
        chrome.storage.local.get(settingsToLoad).then(savedSettings => ({
            ...defaultSettings,
            ...savedSettings
        })),
        detectTheme()
    ]).catch(error => {
        console.error("Error in initial loading:", error);
        return [settingsToLoad, 'light'];
    });

    const settingsToUpdate = {};
    for (const [key, value] of Object.entries(settings)) {
        if (defaultSettings[key] === true && value === true) {
            settingsToUpdate[key] = true;
        }
    }
    
    if (Object.keys(settingsToUpdate).length > 0) {
        chrome.storage.local.set(settingsToUpdate).catch(error => {
            console.error("Error saving settings:", error);
        });
    }

    const scriptPromises = [];
    
    switch (pathType) {
        case 'CATALOG':
        case 'BUNDLES':
            if (settings.itemSalesEnabled) {
                scriptPromises.push(loadScript('misc/item_sales_content.js', { itemsUrl: chrome.runtime.getURL('data/items.json') }));
            }
            break;
        case 'COMMUNITIES':
            if (settings.groupGamesEnabled) {
                scriptPromises.push(loadScript('HiddenGames/group_games.js'));
            }
            if (settings.pendingRobuxEnabled) {
                scriptPromises.push(loadScript('misc/pendingRobux.js'));
                
            }
            break;
        case 'USERS':
            if (settings.userGamesEnabled) {
                scriptPromises.push(loadScript('HiddenGames/user_games.js'));
            }
            if (settings.userSniperEnabled) {
                scriptPromises.push(loadScript('misc/userSniper.js'));
            }
            break;
        case 'GAMES':
            if (settings.subplacesEnabled) {
                scriptPromises.push(loadScript('Games/Subplaces.js'));
            } 
           
            if (settings.universalSniperEnabled) {
                scriptPromises.push(loadScript('Games/sniper.js'));
            }
            
            scriptPromises.push(loadScript('Games/invite.js'));
            
            break;
        case 'AVATAR':
            if (settings.forceR6Enabled) {
                scriptPromises.push(loadScript('Avatar/R6Warning.js'));
            }
            if (settings.fixR6Enabled) {
                scriptPromises.push(loadScript('Avatar/R6Fix.js'));
            }
            break;
        case 'TRANSACTIONS':
            if (settings.pendingrobuxtrans) {
                scriptPromises.push(loadScript('misc/pendingRobuxTrans.js'));
            }
            
            break;
    }
    
    await loadScript('misc/style.js');
    
    await Promise.all(scriptPromises).catch(error => console.error("Error loading scripts:", error));

    dispatchThemeEvent(theme);
    document.body.classList.toggle('dark-mode', theme === 'dark');

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

