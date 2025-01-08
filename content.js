console.log("%cRoValra", "font-size: 3em; color: #FF4500;", "Developed by Valra");

let trackedServerRequests = [];

const trackRequests = () => {
    const originalFetch = window.fetch;
    window.fetch = async function (url, options) {
         const serverApiRegex = new RegExp(`^https:\\/\\/games\\.roblox\\.com\\/v1\\/games\\/\\d+\\/servers\\/Public(?:\\?.*)?$`);
        if (serverApiRegex.test(url) && !url.includes('limit=')) {
            try{
                 const response = await originalFetch.apply(this, arguments);
                 if(!response.ok) {
                      return response;
                 }
                 const responseClone = response.clone();
                 const data = await responseClone.json();
                  if (data && data.data) {
                       const serverIds = data.data.map(server => server.id);
                       trackedServerRequests.push({url: url, serverIds: serverIds});
                  }
                  return response
             } catch (error) {
                return originalFetch.apply(this, arguments);
             }
        } else{
            return originalFetch.apply(this, arguments);
        }
    };

    const originalXHR = window.XMLHttpRequest;
        window.XMLHttpRequest = function() {
            const xhr = new originalXHR();
            const originalOpen = xhr.open;
            const originalSend = xhr.send;
            let requestURL = '';

            xhr.open = function (method, url) {
                requestURL = url;
                originalOpen.apply(this, arguments);
            };

            xhr.send = function () {
                const serverApiRegex = new RegExp(`^https:\\/\\/games\\.roblox\\.com\\/v1\\/games\\/\\d+\\/servers\\/Public(?:\\?.*)?$`);

                if(serverApiRegex.test(requestURL) && !requestURL.includes('limit=')){
                    this.addEventListener("load", function(){
                        try {
                            const response = JSON.parse(this.responseText);
                              if (response && response.data) {
                                const serverIds = response.data.map(server => server.id);
                                 trackedServerRequests.push({url: requestURL, serverIds: serverIds});
                            }
                        } catch (error) {
                        }
                    });
                    this.addEventListener("error", function () {
                    });
                }


                originalSend.apply(this, arguments);
            };
            return xhr;
        }
};

const stopTrackRequests = () => {
    window.fetch = originalFetch;
    window.XMLHttpRequest = originalXMLHttpRequest;
};



const loadScript = (src, dataAttributes = {}) => {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL(src);
        for (const key in dataAttributes) {
            script.dataset[key] = dataAttributes[key];
        }
        script.onload = () => {
            resolve();
        };
        script.onerror = (error) => {
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

    const isDarkMode = backgroundColor === 'rgb(25, 27, 29)' || backgroundColor === 'rgba(25, 27, 29, 1)' || backgroundColor === 'rgb(10, 10, 10)' || backgroundColor === 'rgb(35, 37, 39)';

    const theme = isDarkMode ? 'dark' : 'light';
    return theme;
};


const dispatchThemeEvent = (theme) => {
    const themeEvent = new CustomEvent('themeDetected', { detail: { theme: theme } });
    window.dispatchEvent(themeEvent);
};

function getPlaceIdFromUrl() {
    const path = window.location.pathname;
    const match = path.match(/\/games\/(\d+)/);
    if (match) {
        return match[1];
    }
    return null;
}


const originalFetch = window.fetch;
const originalXMLHttpRequest = window.XMLHttpRequest;


(async () => {
    try {

        trackRequests()
        let settings = await chrome.storage.local.get({
            itemSalesEnabled: true,
            groupGamesEnabled: true,
            userGamesEnabled: true,
            userSniperEnabled: true,
            regionSelectorEnabled: true,
            subplacesEnabled: true,
            forceR6Enabled: true,
            fixR6Enabled: false,
            inviteEnabled: true,
            regionSelectorInitialized: false,
            regionSelectorFirstTime: true, 
        });


        const currentPath = window.location.pathname;


         if (settings.regionSelectorFirstTime) {
            if (settings.regionSelectorEnabled) {
                await loadScript('Games/Regions_content.js', { serverListURL: chrome.runtime.getURL('data/ServerList.json') });
            }

            await chrome.storage.local.set({ regionSelectorEnabled: false, regionSelectorInitialized: 'pendingRefresh', regionSelectorFirstTime: false });

            window.location.reload();
            return; 
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
            return;
        } else {
            if (settings.regionSelectorEnabled) {
                await loadScript('Games/Regions_content.js', { serverListURL: chrome.runtime.getURL('data/ServerList.json') });
            }
        }


        if (settings.inviteEnabled && currentPath.startsWith('/games/')) {
              stopTrackRequests();
             await loadScript('Games/invite.js', {  trackedRequests: JSON.stringify(trackedServerRequests) });

        }


        await loadScript('misc/utils.js');

        await loadScript('misc/style.js');


        if (currentPath.startsWith('/catalog') || currentPath.startsWith('/bundles')) {
            if (settings.itemSalesEnabled) {
                await loadScript('misc/item_sales_content.js', { itemsUrl: chrome.runtime.getURL('data/items.json') });
            }
        } else if (currentPath.startsWith('/communities')) {
            if (settings.groupGamesEnabled) {
                await loadScript('HiddenGames/group_games.js');
            }
        } else if (currentPath.startsWith('/users/')) {
            if (settings.userGamesEnabled) {
                await loadScript('HiddenGames/user_games.js');
            }
            if (settings.userSniperEnabled) {
                await loadScript('misc/userSniper.js');
            }
        }
        else if (currentPath.startsWith('/games/')) {
            if (settings.subplacesEnabled) {
                await loadScript('Games/Subplaces.js');
            }
        }
        if (settings.forceR6Enabled) {
            await loadScript('Avatar/R6Warning.js');
        }
        if (settings.fixR6Enabled) {
            await loadScript('Avatar/R6Fix.js');
        }


        window.addEventListener('loadNonBtroblox', () => {
            loadNonBtrobloxFile();
        });

        const theme = detectTheme();
        dispatchThemeEvent(theme);

        if (theme === 'dark') {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }

    } catch (error) {
        console.error("Content.js: An error occurred:", error);
    }
})();