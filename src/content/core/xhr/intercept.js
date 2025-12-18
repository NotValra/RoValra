(function() {
    'use strict';

    if (window.__ROVALRA_INTERCEPTOR_SETUP__) {
        return;
    }
    window.__ROVALRA_INTERCEPTOR_SETUP__ = true;
    // yup............
    const CATALOG_API_URL = 'https://catalog.roblox.com/v1/catalog/items/details';
    const CLIENT_STATUS_API_URL = 'https://apis.roblox.com/matchmaking-api/v1/client-status';
    const GAME_LAUNCH_SUCCESS_URL = 'https://metrics.roblox.com/v1/games/report-event';
    const GAME_SERVERS_API_URL = 'https://games.roblox.com/v1/games/';
    const GAMES_ROBLOX_API = 'https://games.roblox.com/'; 

    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const [url, config] = args;
        const response = await originalFetch(...args);
        
        if (typeof url === 'string' && url.includes(CATALOG_API_URL)) {
            const clonedResponse = response.clone();
            clonedResponse.json().then(data => {
                document.dispatchEvent(new CustomEvent('rovalra-catalog-details-response', { detail: data }));
            }).catch(() => {});
        }

        if (typeof url === 'string' && url.includes(CLIENT_STATUS_API_URL)) {
            const clonedResponse = response.clone();
            clonedResponse.json().then(data => {
                document.dispatchEvent(new CustomEvent('rovalra-client-status-response', { detail: data }));
            }).catch(() => {});
        }

        if (typeof url === 'string' && url.includes(GAME_LAUNCH_SUCCESS_URL) && 
            (url.includes('GameLaunchSuccessWeb_Win32') || url.includes('GameLaunchSuccessWeb_Win32_Protocol'))) {
            document.dispatchEvent(new CustomEvent('rovalra-game-launch-success', { detail: { url } }));
        }

        if (typeof url === 'string' && url.includes(GAME_SERVERS_API_URL) && url.includes('/servers/')) {
            const clonedResponse = response.clone();
            clonedResponse.json().then(data => {
                document.dispatchEvent(new CustomEvent('rovalra-game-servers-response', { detail: { url, data } }));
            }).catch(() => {});
        }

        if (typeof url === 'string' && url.includes(GAMES_ROBLOX_API) && url.includes('/media')) {
            const clonedResponse = response.clone();
            clonedResponse.json().then(data => {
                document.dispatchEvent(new CustomEvent('rovalra-game-media-response', { detail: data }));
            }).catch(() => {});
        }

        return response;
    };

    const originalXhrOpen = XMLHttpRequest.prototype.open;
    const originalXhrSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this._rovalra_url = url; 
        return originalXhrOpen.apply(this, [method, url, ...rest]);
    };

    XMLHttpRequest.prototype.send = function(...args) {
        const xhr = this;

        xhr.addEventListener('load', function() {
            if (typeof xhr._rovalra_url === 'string') {
                
                if (xhr._rovalra_url.includes(CATALOG_API_URL)) {
                    try {
                        const data = JSON.parse(xhr.responseText);
                        document.dispatchEvent(new CustomEvent('rovalra-catalog-details-response', { detail: data }));
                    } catch (e) {}
                }

                if (xhr._rovalra_url.includes(CLIENT_STATUS_API_URL)) {
                    try {
                        const data = JSON.parse(xhr.responseText);
                        document.dispatchEvent(new CustomEvent('rovalra-client-status-response', { detail: data }));
                    } catch (e) {}
                }

                if (xhr._rovalra_url.includes(GAME_LAUNCH_SUCCESS_URL) && 
                    (xhr._rovalra_url.includes('GameLaunchSuccessWeb_Win32') || xhr._rovalra_url.includes('GameLaunchSuccessWeb_Win32_Protocol'))) {
                    document.dispatchEvent(new CustomEvent('rovalra-game-launch-success', { detail: { url: xhr._rovalra_url } }));
                }

                if (xhr._rovalra_url.includes(GAME_SERVERS_API_URL) && xhr._rovalra_url.includes('/servers/')) {
                    try {
                        const data = JSON.parse(xhr.responseText);
                        document.dispatchEvent(new CustomEvent('rovalra-game-servers-response', { detail: { url: xhr._rovalra_url, data } }));
                    } catch (e) {}
                }

                if (xhr._rovalra_url.includes(GAMES_ROBLOX_API) && xhr._rovalra_url.includes('/media')) {
                    try {
                        const data = JSON.parse(xhr.responseText);
                        document.dispatchEvent(new CustomEvent('rovalra-game-media-response', { detail: data }));
                    } catch (e) {}
                }
            }
        });

        return originalXhrSend.apply(this, args);
    };

    console.log('RoValra: Request capture injected...');
})();