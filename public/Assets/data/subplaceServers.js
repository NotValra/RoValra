(function () {
    'use strict';

    if (window.__ROVALRA_SUBPLACE_SERVERS__) return;
    window.__ROVALRA_SUBPLACE_SERVERS__ = true;

    const SERVERS_RE =
        /^(https:\/\/games\.roblox\.com\/v[12]\/games\/)(\d+)(\/servers\/)/i;

    function getUrlPlaceId() {
        try {
            return window.location.pathname.match(/\/games\/(\d+)/i)?.[1] || null;
        } catch (e) {
            return null;
        }
    }

    function rewriteServersUrl(url) {
        const placeId = getUrlPlaceId();
        if (!placeId || typeof url !== 'string') return url;
        return url.replace(SERVERS_RE, (full, prefix, id, suffix) =>
            id === placeId ? full : prefix + placeId + suffix,
        );
    }

    const originalFetch = window.fetch;
    window.fetch = function (input, init) {
        try {
            if (typeof input === 'string') {
                input = rewriteServersUrl(input);
            } else if (input instanceof Request) {
                const next = rewriteServersUrl(input.url);
                if (next !== input.url) input = new Request(next, input);
            }
        } catch (e) {}
        return originalFetch.call(this, input, init);
    };

    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        try {
            url = rewriteServersUrl(url);
        } catch (e) {}
        return originalOpen.call(this, method, url, ...rest);
    };

    function hookLauncher() {
        const launcher = window.Roblox && window.Roblox.GameLauncher;
        if (!launcher || launcher.__rovalraSubplacePatched) return;
        if (typeof launcher.joinGameInstance === 'function') {
            const original = launcher.joinGameInstance;
            launcher.joinGameInstance = function (placeId, ...args) {
                const urlPlaceId = getUrlPlaceId();
                if (
                    urlPlaceId &&
                    placeId != null &&
                    String(placeId) !== urlPlaceId
                ) {
                    placeId = Number(urlPlaceId);
                }
                return original.call(this, placeId, ...args);
            };
        }
        launcher.__rovalraSubplacePatched = true;
    }

    hookLauncher();
    const timer = setInterval(hookLauncher, 250);
    window.addEventListener(
        'load',
        function () {
            hookLauncher();
            setTimeout(function () {
                clearInterval(timer);
            }, 15000);
        },
        { once: true },
    );
})();
