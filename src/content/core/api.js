// All api requests should go through this script

import { getCsrfToken } from './utils.js';

import { updateUserLocationIfChanged } from './utils/location.js';
const activeRequests = new Map();

const CAPTURED_APIS_KEY = 'rovalra_captured_apis';
const seenRequests = new Map();

document.addEventListener('rovalra-traffic-capture', (e) => {
    const { url, method, body } = e.detail;
    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname;
        const pathname = urlObj.pathname + urlObj.search;
        
        let subdomain = 'apis';
        let isRovalraApi = false;

        if (hostname.endsWith('.roblox.com')) {
            subdomain = hostname.replace('.roblox.com', '');
        } else if (hostname.includes('rovalra.com')) {
            isRovalraApi = true;
            subdomain = 'apis'; 
        } else {
            
            return;
        }

        captureApiCall({
            subdomain,
            endpoint: pathname,
            method,
            isRovalraApi,
            body
        });
    } catch (err) {}
});

function captureApiCall(options) {
    try {
        const { subdomain = 'apis', endpoint, method = 'GET', isRovalraApi = false, body = null } = options;
        if (!endpoint) return;
        
        const [baseEndpoint] = endpoint.split('?');
        const category = isRovalraApi ? 'rovalra.com' : (subdomain || 'apis');
        const methodUpper = method.toUpperCase();
        const key = `${category}|${baseEndpoint}|${methodUpper}`;
        const hasParams = endpoint.includes('?');
        
        if (seenRequests.has(key)) {
            const seenWithParams = seenRequests.get(key);
            if (seenWithParams || !hasParams) return;
        }
        seenRequests.set(key, hasParams || seenRequests.get(key) || false);

        chrome.storage.local.get([CAPTURED_APIS_KEY, 'EnableRobloxApiDocs'], (result) => {
            if (!result.EnableRobloxApiDocs) return;

            const data = result[CAPTURED_APIS_KEY] || {};
            let changed = false;

            if (!data[category]) {
                data[category] = {};
                changed = true;
            }
            
            if (!data[category][baseEndpoint]) {
                data[category][baseEndpoint] = {};
                changed = true;
            }

            if (!data[category][baseEndpoint][methodUpper]) {
                data[category][baseEndpoint][methodUpper] = {
                    exampleBody: body,
                    exampleEndpoint: endpoint
                };
                changed = true;
            } else {
                const currentDetails = data[category][baseEndpoint][methodUpper];
                if (hasParams && (!currentDetails.exampleEndpoint || !currentDetails.exampleEndpoint.includes('?'))) {
                    currentDetails.exampleEndpoint = endpoint;
                    changed = true;
                }
                if (body && !currentDetails.exampleBody) {
                    currentDetails.exampleBody = body;
                    changed = true;
                }
            }

            if (changed) {
                chrome.storage.local.set({ [CAPTURED_APIS_KEY]: data });
            }
        });
    } catch (e) {}
}

function getRequestKey({ endpoint, subdomain = 'apis', method = 'GET', isRovalraApi = false, body = null, fullUrl = null }) {
    const bodyStr = body && typeof body === 'object' ? JSON.stringify(body) : (body || '');
    const target = fullUrl || `${isRovalraApi}|${subdomain}|${endpoint}`;
    return `${target}|${method.toUpperCase()}|${bodyStr}`;
}


function checkSimulatedDowntime() {
    return new Promise((resolve) => {
        if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
            resolve(false);
            return;
        }
        chrome.storage.local.get(['simulateRoValraServerErrors'], (result) => {
            resolve(!!result.simulateRoValraServerErrors);
        });
    });
}


export async function callRobloxApi(options) {
    captureApiCall(options);
    const requestKey = getRequestKey(options);


    const shouldCache = !options.noCache && options.subdomain !== 'gamejoin';

    if (shouldCache && activeRequests.has(requestKey)) {
        const originalResponse = await activeRequests.get(requestKey);
        const clonedResponse = originalResponse.clone();


        if (options.subdomain === 'games' && options.endpoint.includes('/servers/') && !options.isRovalraApi) {
        }

        return clonedResponse;
    }

    const requestPromise = (async () => {
        const {
            endpoint,
            subdomain = 'apis',
            method = 'GET',
            isRovalraApi = false,
            headers = {},
            body = null,
            fullUrl: customFullUrl
        } = options;

        if (isRovalraApi) {
            const isDowntimeSimulated = await checkSimulatedDowntime();
            if (isDowntimeSimulated) {
                console.warn(`RoValra API: [SIMULATION] 500 Error for ${endpoint}`);
                return new Response(JSON.stringify({
                    errors: [{ code: 500, message: "Simulated Internal Server Error" }]
                }), { status: 500, statusText: "Internal Server Error", headers: { "Content-Type": "application/json" } });
            }
        }

        const baseUrl = isRovalraApi 
            ? (subdomain === 'www' ? 'https://www.rovalra.com' : 'https://apis.rovalra.com')
            : `https://${subdomain}.roblox.com`;
        let fullUrl = customFullUrl || `${baseUrl}${endpoint}`;

        if (fullUrl.includes('?')) {
            fullUrl += `&_RoValraRequest=`;
        } else {
            fullUrl += `?_RoValraRequest=`;
        }

        const isMutatingMethod = ['POST', 'PATCH', 'DELETE'].includes(method.toUpperCase());
        
        const credentials = options.credentials ?? (isRovalraApi ? 'omit' : 'include');

        const fetchOptions = {
            method,
            headers: {
                'Accept': 'application/json',
                ...headers
            },
            credentials
        };

        if (body) {
            fetchOptions.headers['Content-Type'] = 'application/json';
            fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
        }

        if (isRovalraApi) {
            let lastResponse;
            for (let attempt = 0; attempt < 4; attempt++) { 
                try {
                    lastResponse = await fetch(fullUrl, fetchOptions);
                    if (lastResponse.ok) {
                        return lastResponse; 
                    }
                } catch (error) {
                    if (attempt === 3) {
                        console.error(`RoValra API: Request to ${fullUrl} failed after multiple retries.`, error);
                        throw error;
                    }
                }
                if (attempt < 3) {
                    await new Promise(res => setTimeout(res, 1000));
                }
            }
            if (!lastResponse.ok) {
                console.error(`RoValra API: Request to ${fullUrl} failed with status ${lastResponse.status} after multiple retries.`);
            }
            return lastResponse;
        }

        if (isMutatingMethod) {
            const csrfToken = await getCsrfToken();
            if (!csrfToken) throw new Error('CSRF token is required but could not be obtained.');
            fetchOptions.headers['X-CSRF-TOKEN'] = csrfToken;
        }

        let response = await fetch(fullUrl, fetchOptions);

        if (response.status === 403 && isMutatingMethod) {
            const newCsrfToken = response.headers.get('x-csrf-token');
            if (newCsrfToken) {
                if (typeof getCsrfToken.setToken === 'function') getCsrfToken.setToken(newCsrfToken);
                fetchOptions.headers['X-CSRF-TOKEN'] = newCsrfToken;
                response = await fetch(fullUrl, fetchOptions);
            }
        }

        if (!response.ok) {
            console.error(`RoValra API: Request to ${fullUrl} failed with status ${response.status}.`);
        }

        return response;
    })();


    if (shouldCache) {
        activeRequests.set(requestKey, requestPromise);
        requestPromise.finally(() => activeRequests.delete(requestKey));
    }

    const originalResponse = await requestPromise;
    const clonedResponse = originalResponse.clone();

    if (options.subdomain === 'gamejoin' && originalResponse.ok) {
        const gameJoinClone = originalResponse.clone();
        gameJoinClone.json().then(data => {
            if (data?.joinScript?.SessionId) {
                try {
                    if (typeof data.joinScript.SessionId === 'string' && data.joinScript.SessionId.startsWith('{')) {
                        const sessionId = JSON.parse(data.joinScript.SessionId);
                        if (typeof sessionId.Latitude === 'number' && typeof sessionId.Longitude === 'number') {
                            updateUserLocationIfChanged({
                                userLat: sessionId.Latitude,
                                userLon: sessionId.Longitude
                            });
                        }
                    }
                } catch (e) {}
            }

            if (data.status === 5) {
                let serverId = null;
                try {
                    const bodyData = options.body && typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
                    if (bodyData && bodyData.gameId) serverId = bodyData.gameId;
                } catch (e) {}

                if (serverId) {
                    document.dispatchEvent(new CustomEvent('rovalra-server-inactive', {
                        detail: { serverId }
                    }));
                }
            }
        }).catch(() => {});
    }

    if (options.subdomain === 'games' && options.endpoint.includes('/servers/') && !options.isRovalraApi) {
        try {
            const monitorClone = clonedResponse.clone();
            const fullUrl = `https://${options.subdomain || 'games'}.roblox.com${options.endpoint}`;
            
            monitorClone.json().then(data => {
                document.dispatchEvent(new CustomEvent('rovalra-game-servers-response', {
                    detail: { url: fullUrl, data: data }
                }));
            }).catch(() => {});
        } catch (e) {
            console.warn('RoValra API: Monitor hook failed', e);
        }
    }

    return clonedResponse;
}

export async function callRobloxApiUnsafe(options) {
    return callRobloxApi(options);
}

export async function callRobloxApiJson(options) {
    const response = await callRobloxApi(options);
    if (!response.ok) {
        const errorBody = await response.json().catch(() => ({ message: 'Could not parse error response' }));
        const error = new Error(`API request failed with status ${response.status}`);
        error.response = errorBody;
        throw error;
    }
    return await response.json();
}