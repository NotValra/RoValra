console.log("Content.js: Content script started.");
// Main brain that makes the settings actually work
const loadScript = (src, dataAttributes = {}) => {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL(src);
        for (const key in dataAttributes) {
            script.dataset[key] = dataAttributes[key];
        }
        script.onload = () => {
            console.log(`Content.js: Script loaded successfully: ${src}`);
            resolve();
        };
        script.onerror = (error) => {
            console.error(`Content.js: Error loading script: ${src}`, error);
            reject(error);
        };
        document.head.appendChild(script);
    });
};

(async () => {
    try {
        await loadScript('misc/utils.js');
        console.log('Content.js: utils.js loaded.');

        await loadScript('misc/style.js');
        console.log('Content.js: style.js loaded.');
        // Only the first five are actual features i just wanted to see if it was easily expandable 
        const settings = await chrome.storage.local.get({
            itemSalesEnabled: true,
            groupGamesEnabled: true,
            userGamesEnabled: true,
            userSniperEnabled: true,
            regionSelectorEnabled: false,
            actionTab: true,
            backgroundTab: true,
            pinnedGroups: false,
            improvedSearch: true,
            messagePing: true
        });
        console.log("Content.js: Loaded settings:", settings);

        const currentPath = window.location.pathname;

        if (currentPath.startsWith('/catalog') || currentPath.startsWith('/bundles')) {
            if (settings.itemSalesEnabled) {
                console.log("Content.js: Item Sales: Enabled, loading script");
                await loadScript('misc/item_sales_content.js', { itemsUrl: chrome.runtime.getURL('data/items.json') });

            } else {
                console.log("Content.js: Item Sales: Disabled");
            }
        } else if (currentPath.startsWith('/communities')) {
            if (settings.groupGamesEnabled) {
                console.log("Content.js: Group Games: Enabled, loading script");
                await loadScript('HiddenGames/group_games.js');
            } else {
                console.log("Content.js: Group Games: Disabled");
            }
        } else if (currentPath.startsWith('/users/')) {
            if (settings.userGamesEnabled) {
                console.log("Content.js: User Games: Enabled, loading script");
                await loadScript('HiddenGames/user_games.js');
            } else {
                console.log("Content.js: User Games: Disabled");
            }
            if (settings.userSniperEnabled) {
                console.log("Content.js: User Sniper: Enabled, loading script");
                await loadScript('misc/userSniper.js');
            } else {
                console.log("Content.js: User Sniper: Disabled");
            }
        }
        if (settings.regionSelectorEnabled) {
            console.log("Content.js: Region Selector: Enabled, loading script");
            await loadScript('misc/Regions_content.js', { serverListURL: chrome.runtime.getURL('data/ServerList.json') });
        } else {
            console.log("Content.js: Region Selector: Disabled");
        }

        window.addEventListener('loadNonBtroblox', () => {
            loadNonBtrobloxFile();
        });

        const retryFindElement = (selector, maxRetries, retryInterval, callback, fallbackSelector) => {
            let retries = 0;
            const interval = setInterval(() => {
                let element = document.querySelector(selector);
                if (!element && fallbackSelector) {
                    element = document.querySelector(fallbackSelector);
                }

                if (element) {
                    clearInterval(interval);
                    callback(element);
                } else if (retries >= maxRetries) {
                    clearInterval(interval);
                    console.log(`Content.js: ${selector} and fallback ${fallbackSelector} not found after ${maxRetries} retries.`);
                }
                retries++;
            }, retryInterval);
        };

        
    } catch (error) {
        console.error("Content.js: An error occurred:", error);
    }
})();