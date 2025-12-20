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

    let streamerModeEnabled = false;
    let settingsPageInfoEnabled = true;

    try {
        streamerModeEnabled = sessionStorage.getItem('rovalra_streamermode') === 'true';
        settingsPageInfoEnabled = sessionStorage.getItem('rovalra_settingsPageInfo') !== 'false';
    } catch (e) {}

    document.addEventListener('rovalra-streamer-mode', (e) => {
        if (typeof e.detail === 'object') {
            streamerModeEnabled = e.detail.enabled === true;
            settingsPageInfoEnabled = e.detail.settingsPageInfo !== false;
        } else {
            streamerModeEnabled = e.detail === true;
        }
    });

    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const [url, config] = args;
        let response = await originalFetch(...args);
        
        if (streamerModeEnabled && settingsPageInfoEnabled && typeof url === 'string' && (url.includes('/my/settings/json') || url.includes('accountinformation.roblox.com/v1/phone') || url.includes('users.roblox.com/v1/birthdate') || url.includes('apis.roblox.com/age-verification-service/v1/age-verification/verified-age') || url.includes('accountsettings.roblox.com/v1/account/settings/account-country') || url.includes('apis.roblox.com/user-settings-api/v1/account-insights/age-group'))) {
            try {
                const clone = response.clone();
                const data = await clone.json();
                
                if (url.includes('/my/settings/json')) {
                    data.UserEmail = "RoValra Streamer Mode Enabled";
                    data.UserEmailVerified = true;
                }
                if (url.includes('accountinformation.roblox.com/v1/phone')) {
                    data.countryCode = "RoValra Streamer Mode Enabled";
                    data.prefix = "RoValra Streamer Mode Enabled";
                    data.phone = "RoValra Streamer Mode Enabled";
                }
                if (url.includes('users.roblox.com/v1/birthdate')) {
                    data.birthMonth = 0;
                    data.birthDay = 0;
                    data.birthYear = 0;
                }
                if (url.includes('apis.roblox.com/age-verification-service/v1/age-verification/verified-age')) {
                    data.isVerified = true;
                    data.verifiedAge = 0;
                    data.isSeventeenPlus = false;
                }
                if (url.includes('accountsettings.roblox.com/v1/account/settings/account-country')) {
                    if (data.value) {
                        data.value.countryName = "RoValra Streamer Mode Enabled";
                        data.value.localizedName = "RoValra Streamer Mode Enabled";
                        data.value.countryId = 1;
                    }
                }
                if (url.includes('apis.roblox.com/user-settings-api/v1/account-insights/age-group')) {
                    data.ageGroupTranslationKey = "RoValra Streamer Mode Enabled";
                }

                const newHeaders = new Headers(response.headers);
                newHeaders.delete('content-length');

                response = new Response(JSON.stringify(data), {
                    status: response.status,
                    statusText: response.statusText,
                    headers: newHeaders
                });
            } catch (e) {}
        }

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
        
        if (streamerModeEnabled && typeof url === 'string') {
            if (settingsPageInfoEnabled) {
                if (url.includes('/my/settings/json')) {
                    this._rovalra_spoof_settings = true;
                }
                if (url.includes('accountinformation.roblox.com/v1/phone')) {
                    this._rovalra_spoof_phone = true;
                }
                if (url.includes('users.roblox.com/v1/birthdate')) {
                    this._rovalra_spoof_birthdate = true;
                }
                if (url.includes('apis.roblox.com/age-verification-service/v1/age-verification/verified-age')) {
                    this._rovalra_spoof_age = true;
                }
                if (url.includes('accountsettings.roblox.com/v1/account/settings/account-country')) {
                    this._rovalra_spoof_country = true;
                }
                if (url.includes('apis.roblox.com/user-settings-api/v1/account-insights/age-group')) {
                    this._rovalra_spoof_age_group = true;
                }
            }
        }

        return originalXhrOpen.apply(this, [method, url, ...rest]);
    };

    XMLHttpRequest.prototype.send = function(...args) {
        const xhr = this;

        if (xhr._rovalra_spoof_settings || xhr._rovalra_spoof_phone || xhr._rovalra_spoof_birthdate || xhr._rovalra_spoof_age || xhr._rovalra_spoof_country || xhr._rovalra_spoof_age_group) {
            Object.defineProperty(xhr, 'responseText', {
                configurable: true,
                get: function() {
                    const original = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'responseText').get.call(this);
                    if (this.readyState !== 4) return original;
                    
                    try {
                        const data = JSON.parse(original);
                        if (xhr._rovalra_spoof_settings) {
                            data.UserEmail = "RoValra Streamer Mode Enabled";
                            data.UserEmailVerified = true;
                        }
                        if (xhr._rovalra_spoof_phone) {
                            data.countryCode = "RoValra Streamer Mode Enabled";
                            data.prefix = "RoValra Streamer Mode Enabled";
                            data.phone = "RoValra Streamer Mode Enabled";
                        }
                        if (xhr._rovalra_spoof_birthdate) {
                            data.birthMonth = 0;
                            data.birthDay = 0;
                            data.birthYear = 0;
                        }
                        if (xhr._rovalra_spoof_age) {
                            data.isVerified = true;
                            data.verifiedAge = 0;
                            data.isSeventeenPlus = false;
                        }
                        if (xhr._rovalra_spoof_country) {
                            if (data.value) {
                                data.value.countryName = "RoValra Streamer Mode Enabled";
                                data.value.localizedName = "RoValra Streamer Mode Enabled";
                                data.value.countryId = 1;
                            }
                        }
                        if (xhr._rovalra_spoof_age_group) {
                            data.ageGroupTranslationKey = "RoValra Streamer Mode Enabled";
                        }
                        return JSON.stringify(data);
                    } catch (e) {
                        return original;
                    }
                }
            });

            Object.defineProperty(xhr, 'response', {
                configurable: true,
                get: function() {
                    if (this.responseType === 'json') {
                        const original = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'response').get.call(this);
                        if (this.readyState !== 4 || !original) return original;
                        
                        if (xhr._rovalra_spoof_settings) {
                            return Object.assign({}, original, { UserEmail: "RoValra Streamer Mode Enabled", UserEmailVerified: true });
                        }
                        if (xhr._rovalra_spoof_phone) {
                            original.countryCode = "RoValra Streamer Mode Enabled";
                            original.prefix = "RoValra Streamer Mode Enabled";
                            original.phone = "RoValra Streamer Mode Enabled";
                        }
                        if (xhr._rovalra_spoof_birthdate) {
                            original.birthMonth = 0;
                            original.birthDay = 0;
                            original.birthYear = 0;
                        }
                        if (xhr._rovalra_spoof_age) {
                            original.isVerified = true;
                            original.verifiedAge = 0;
                            original.isSeventeenPlus = false;
                        }
                        if (xhr._rovalra_spoof_country) {
                            if (original.value) {
                                original.value.countryName = "RoValra Streamer Mode Enabled";
                                original.value.localizedName = "RoValra Streamer Mode Enabled";
                                original.value.countryId = 1;
                            }
                        }
                        if (xhr._rovalra_spoof_age_group) {
                            original.ageGroupTranslationKey = "RoValra Streamer Mode Enabled";
                        }
                        return original;
                    }
                    return this.responseText;
                }
            });
        }

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