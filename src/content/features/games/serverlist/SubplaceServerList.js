import { getPlaceIdFromUrl } from '../../core/idExtractor.js';

const SERVERS_RE = /^(https:\/\/games\.roblox\.com\/v[12]\/games\/)(\d+)(\/servers\/)/i;
const START_RE = /^(https:\/\/www\.roblox\.com\/games\/start\?.*placeId=)(\d+)/i;

function rewriteUrl(url) {
    const placeId = getPlaceIdFromUrl();
    if (!placeId) return url;

    const raw = String(url);
    const servers = raw.match(SERVERS_RE);
    if (servers && servers[2] !== placeId) {
        return raw.replace(SERVERS_RE, `$1${placeId}$3`);
    }

    const start = raw.match(START_RE);
    if (start && start[2] !== placeId) {
        return raw.replace(START_RE, `$1${placeId}`);
    }

    return url;
}

function rewriteJoinBody(body) {
    const placeId = getPlaceIdFromUrl();
    if (!placeId || body == null) return body;

    try {
        if (typeof body === 'string' && body.includes('placeId')) {
            const json = JSON.parse(body);
            if (json?.placeId && String(json.placeId) !== placeId) {
                json.placeId = Number(placeId);
                return JSON.stringify(json);
            }
        }
    } catch {
        // ignore non-json bodies
    }

    return body;
}

function patchNetworking() {
    if (window.fetch && !window.fetch.__rovalraSubplacePatched) {
        const rawFetch = window.fetch;
        window.fetch = function (input, init) {
            try {
                if (typeof input === 'string') {
                    input = rewriteUrl(input);
                } else if (input instanceof Request) {
                    const next = rewriteUrl(input.url);
                    if (next !== input.url) input = new Request(next, input);
                }
                if (init?.body && String(input).includes('join-game-instance')) {
                    init = { ...init, body: rewriteJoinBody(init.body) };
                }
            } catch {
                // keep original request on patch errors
            }
            return rawFetch.call(this, input, init);
        };
        window.fetch.__rovalraSubplacePatched = true;
    }

    if (
        window.XMLHttpRequest &&
        !XMLHttpRequest.prototype.__rovalraSubplacePatched
    ) {
        const rawOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function (method, url, ...rest) {
            try {
                url = rewriteUrl(url);
            } catch {
                // keep original url
            }
            this.__rovalraSubplaceUrl = String(url);
            return rawOpen.call(this, method, url, ...rest);
        };

        const rawSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.send = function (body) {
            try {
                if (this.__rovalraSubplaceUrl?.includes('join-game-instance')) {
                    body = rewriteJoinBody(body);
                }
            } catch {
                // keep original body
            }
            return rawSend.call(this, body);
        };

        XMLHttpRequest.prototype.__rovalraSubplacePatched = true;
    }
}

function hookGameLauncher() {
    const launcher = window.Roblox?.GameLauncher;
    if (!launcher || launcher.__rovalraSubplacePatched) return;

    if (typeof launcher.joinGameInstance === 'function') {
        const original = launcher.joinGameInstance;
        launcher.joinGameInstance = function (placeId, ...args) {
            const urlPlaceId = getPlaceIdFromUrl();
            if (urlPlaceId && placeId != null && String(placeId) !== urlPlaceId) {
                placeId = Number(urlPlaceId);
            }
            return original.call(this, placeId, ...args);
        };
    }

    launcher.__rovalraSubplacePatched = true;
}

export function init() {
    if (!getPlaceIdFromUrl()) return;

    patchNetworking();
    hookGameLauncher();
    const timer = setInterval(hookGameLauncher, 250);
    window.addEventListener(
        'load',
        () => {
            hookGameLauncher();
            setTimeout(() => clearInterval(timer), 15000);
        },
        { once: true },
    );
}
