console.log("Content.js: Content script started.");

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

        let settings = await chrome.storage.local.get({
            itemSalesEnabled: true,
            groupGamesEnabled: true,
            userGamesEnabled: true,
            userSniperEnabled: true,
            regionSelectorEnabled: true,
            subplacesEnabled: true,
            forceR6Enabled: true,
            fixR6Enabled: false,
            regionSelectorInitialized: false,
            regionSelectorFirstTime: true, //Track if this is the very first time using the extension
        });

         console.log("Content.js: Loaded settings:", settings);

         const currentPath = window.location.pathname;

          // First-time use logic for region selector
        if (settings.regionSelectorFirstTime) {
            console.log("Content.js: First time using extension");

           // Update settings to the correct state
            if (settings.regionSelectorEnabled) {
                console.log("Content.js: Region selector is enabled, loading once.");
                await loadScript('Games/Regions_content.js', { serverListURL: chrome.runtime.getURL('data/ServerList.json') });

           } else {
                console.log("Content.js: Region selector is disabled. Skipping first load");
           }

          console.log("Content.js: Disabling region selector");
            await chrome.storage.local.set({ regionSelectorEnabled: false,  regionSelectorInitialized: 'pendingRefresh', regionSelectorFirstTime: false});


            // Refresh the page after settings have been saved
            console.log("Content.js: Refreshing page to complete region selector initialization");
            window.location.reload();
            return; // Stop execution here as the page will reload.
       }

      if(settings.regionSelectorInitialized === 'pendingRefresh')
        {
             console.log("Content.js: Page Refreshed, loading second time.");
              await chrome.storage.local.set({  regionSelectorInitialized: true });

              if (settings.regionSelectorEnabled) {
                   console.log("Content.js: Region selector enabled, loading second time.")
                 await loadScript('Games/Regions_content.js', { serverListURL: chrome.runtime.getURL('data/ServerList.json') });

              } else {
                  console.log("Content.js: Region selector disabled, skipping second load.");
             }


            // Re-enable the setting
            console.log("Content.js: Enabling region selector.");
             await chrome.storage.local.set({ regionSelectorEnabled: true });
             console.log("Content.js: Region selector initialized.");

                // Wait 1 second and then refresh the page again
             console.log("Content.js: Waiting 1 second before refreshing again");
             setTimeout(() => {
                window.location.reload();
             }, 100);
            return;
        } else {
              if (settings.regionSelectorEnabled) {
                console.log("Content.js: Region Selector: Enabled, loading script");
                   await loadScript('Games/Regions_content.js', { serverListURL: chrome.runtime.getURL('data/ServerList.json') });
              } else {
                 console.log("Content.js: Region Selector: Disabled");
            }
        }

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
         else if (currentPath.startsWith('/games/')) {
            if (settings.subplacesEnabled) {
                console.log("Content.js: Subplaces: Loading");
                await loadScript('Games/Subplaces.js');
            }
            else {
                console.log("Content.js: Subplaces: Disabled")
            }
        }

         if (settings.forceR6Enabled) {
            console.log("Content.js: Disable R6 Warning: Enabled, loading script");
            await loadScript('Avatar/R6Warning.js');
        } else {
            console.log("Content.js: Disable R6 Warning: Disabled");
        }

        if (settings.fixR6Enabled) {
            console.log("Content.js: R6 Fix: Enabled, loading script");
            await loadScript('Avatar/R6Fix.js');
        } else {
            console.log("Content.js: R6 Fix: Disabled");
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