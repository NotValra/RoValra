// All api requests should go through this script

import { getCsrfToken } from './utils.js';
import { getAuthenticatedUserId } from './user.js';
import { getValidAccessToken } from './oauth/oauth.js';
import { getValidApiKey, invalidateApiKey } from './utils/trackers/apiKey.js';

import { updateUserLocationIfChanged } from './utils/location.js';
const activeRequests = new Map();
let lastGameJoinRequestTime = 0;

const OAUTH_STORAGE_KEY = 'rovalra_oauth_verification';
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
            body,
        });
    } catch (err) {}
});

function captureApiCall(options) {
    try {
        const {
            subdomain = 'apis',
            endpoint,
            method = 'GET',
            isRovalraApi = false,
            body = null,
        } = options;
        if (!endpoint) return;

        const [baseEndpoint] = endpoint.split('?');
        const category = isRovalraApi ? 'rovalra.com' : subdomain || 'apis';
        const methodUpper = method.toUpperCase();
        const key = `${category}|${baseEndpoint}|${methodUpper}`;
        const hasParams = endpoint.includes('?');

        if (seenRequests.has(key)) {
            const seenWithParams = seenRequests.get(key);
            if (seenWithParams || !hasParams) return;
        }
        seenRequests.set(key, hasParams || seenRequests.get(key) || false);

        chrome.storage.local.get(
            [CAPTURED_APIS_KEY, 'EnableRobloxApiDocs'],
            (result) => {
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
                        exampleEndpoint: endpoint,
                    };
                    changed = true;
                } else {
                    const currentDetails =
                        data[category][baseEndpoint][methodUpper];
                    if (
                        hasParams &&
                        (!currentDetails.exampleEndpoint ||
                            !currentDetails.exampleEndpoint.includes('?'))
                    ) {
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
            },
        );
    } catch (e) {}
}

function getRequestKey({
    endpoint,
    subdomain = 'apis',
    method = 'GET',
    isRovalraApi = false,
    body = null,
    fullUrl = null,
}) {
    const bodyStr =
        body && typeof body === 'object' ? JSON.stringify(body) : body || '';
    const target = fullUrl || `${isRovalraApi}|${subdomain}|${endpoint}`;
    return `${target}|${method.toUpperCase()}|${bodyStr}`;
}

function checkSimulatedDowntime() {
    return new Promise((resolve) => {
        if (
            typeof chrome === 'undefined' ||
            !chrome.storage ||
            !chrome.storage.local
        ) {
            resolve(false);
            return;
        }
        chrome.storage.local.get(['simulateRoValraServerErrors'], (result) => {
            resolve(!!result.simulateRoValraServerErrors);
        });
    });
}

function checkSimulatedLatency() {
    return new Promise((resolve) => {
        if (
            typeof chrome === 'undefined' ||
            !chrome.storage ||
            !chrome.storage.local
        ) {
            resolve(false);
            return;
        }
        chrome.storage.local.get(['simulateRoValraServerLatency'], (result) => {
            resolve(!!result.simulateRoValraServerLatency);
        });
    });
}

export async function callRobloxApi(options) {
    captureApiCall(options);

    if (options.subdomain === 'gamejoin') {
        const now = Date.now();
        const nextAllowedTime = lastGameJoinRequestTime + 100;
        if (now < nextAllowedTime) {
            lastGameJoinRequestTime = nextAllowedTime;
            await new Promise((resolve) =>
                setTimeout(resolve, nextAllowedTime - now),
            );
        } else {
            lastGameJoinRequestTime = now;
        }
    }

    const requestKey = getRequestKey(options);

    const shouldCache = !options.noCache && options.subdomain !== 'gamejoin';

    if (shouldCache && activeRequests.has(requestKey)) {
        const originalResponse = await activeRequests.get(requestKey);
        const clonedResponse = originalResponse.clone();

        if (
            options.subdomain === 'games' &&
            options.endpoint.includes('/servers/') &&
            !options.isRovalraApi
        ) {
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
            fullUrl: customFullUrl,
            skipAutoAuth = false,
            signal,
            useBackground = false,
            useApiKey = false,
            noCache = false,
        } = options;

        if (useApiKey) {
            const apiKey = await getValidApiKey();
            if (apiKey) {
                headers['x-api-key'] = apiKey;
            }
        }

        if (useBackground) {
            return new Promise((resolve) => {
                chrome.runtime.sendMessage(
                    {
                        action: 'fetchRobloxApi',
                        options: {
                            endpoint,
                            subdomain,
                            method,
                            body,
                            headers,
                            noCache,
                        },
                    },
                    (response) => {
                        if (chrome.runtime.lastError || !response) {
                            resolve(Response.error());
                            return;
                        }
                        if (useApiKey && response.status === 401) {
                            invalidateApiKey();
                        }
                        const { body, ...init } = response;
                        resolve(new Response(body, init));
                    },
                );
            });
        }

        if (isRovalraApi) {
            if (endpoint && endpoint.includes('/v1/auth') && !skipAutoAuth) {
                const token = await getValidAccessToken();
                if (token) {
                    headers['Authorization'] = `Bearer ${token}`;
                } else {
                    return new Response(
                        JSON.stringify({
                            status: 'error',
                            message: 'Unauthorized',
                        }),
                        {
                            status: 401,
                            headers: { 'Content-Type': 'application/json' },
                        },
                    );
                }
            }
            const isDowntimeSimulated = await checkSimulatedDowntime();
            if (isDowntimeSimulated) {
                console.warn(
                    `RoValra API: [SIMULATION] 500 Error for ${endpoint}`,
                );
                return new Response(
                    JSON.stringify({
                        errors: [
                            {
                                code: 500,
                                message: 'Simulated Internal Server Error',
                            },
                        ],
                    }),
                    {
                        status: 500,
                        statusText: 'Internal Server Error',
                        headers: { 'Content-Type': 'application/json' },
                    },
                );
            }

            const isLatencySimulated = await checkSimulatedLatency();
            if (isLatencySimulated) {
                console.warn(
                    `RoValra API: [SIMULATION] Adding 5s latency for ${endpoint}`,
                );
                await new Promise((resolve) => setTimeout(resolve, 5000));
            }
        }

        const baseUrl = isRovalraApi
            ? subdomain === 'www'
                ? 'https://www.rovalra.com'
                : `https://${subdomain}.rovalra.com`
            : `https://${subdomain}.roblox.com`;
        let fullUrl = customFullUrl || `${baseUrl}${endpoint}`;

        if (fullUrl.includes('?')) {
            fullUrl += `&_RoValraRequest=${noCache ? Date.now() : ''}`;
        } else {
            fullUrl += `?_RoValraRequest=${noCache ? Date.now() : ''}`;
        }

        const isMutatingMethod = ['POST', 'PATCH', 'DELETE'].includes(
            method.toUpperCase(),
        );

        const credentials =
            options.credentials ?? (isRovalraApi ? 'omit' : 'include');

        const normalizedHeaders = new Headers(headers);
        if (!normalizedHeaders.has('Accept')) {
            normalizedHeaders.set('Accept', 'application/json');
        }

        const fetchOptions = {
            method,
            headers: normalizedHeaders,
            credentials,
            signal,
            cache: noCache ? 'no-store' : 'default',
        };

        if (body) {
            if (body instanceof FormData) {
                fetchOptions.body = body;
                if (normalizedHeaders.has('Content-Type')) {
                    normalizedHeaders.delete('Content-Type');
                }
            } else {
                if (!normalizedHeaders.has('Content-Type')) {
                    normalizedHeaders.set('Content-Type', 'application/json');
                }
                fetchOptions.body =
                    typeof body === 'string' ? body : JSON.stringify(body);
            }
        }

        if (isRovalraApi) {
            let lastResponse;
            let authRetried = false;
            for (let attempt = 0; attempt < 4; attempt++) {
                try {
                    lastResponse = await fetch(fullUrl, fetchOptions);
                    let newAccessToken = null;
                    try {
                        const bodyClone = await lastResponse.clone().json();
                        if (bodyClone && bodyClone.accessToken) {
                            newAccessToken = bodyClone.accessToken;
                        }
                    } catch (e) {}

                    if (newAccessToken) {
                        try {
                            const authedUserId = await getAuthenticatedUserId();
                            if (authedUserId) {
                                const storage =
                                    await chrome.storage.local.get(
                                        OAUTH_STORAGE_KEY,
                                    );
                                let allVerifications =
                                    storage[OAUTH_STORAGE_KEY] || {};
                                let storedVerification =
                                    allVerifications[authedUserId];

                                if (storedVerification) {
                                    console.log(
                                        'RoValra API: New token detected in body. Updating storage.',
                                    );
                                    storedVerification.accessToken =
                                        newAccessToken;
                                    storedVerification.timestamp = Date.now();

                                    try {
                                        const data = await lastResponse
                                            .clone()
                                            .json();
                                    } catch {}

                                    allVerifications[authedUserId] =
                                        storedVerification;
                                    await chrome.storage.local.set({
                                        [OAUTH_STORAGE_KEY]: allVerifications,
                                    });
                                }
                            }
                        } catch (e) {
                            console.error(
                                'RoValra API: Failed to update new access token.',
                                e,
                            );
                        }
                    }

                    let isTokenInvalid = lastResponse.status === 401;
                    let bodyIsInvalid = false;

                    if (
                        lastResponse.ok &&
                        endpoint &&
                        endpoint.includes('/v1/auth') &&
                        !skipAutoAuth
                    ) {
                        const clonedForBodyCheck = lastResponse.clone();
                        try {
                            const bodyJson = await clonedForBodyCheck.json();
                            if (
                                bodyJson.status === 'error' &&
                                bodyJson.message ===
                                    'Invalid or obsolete token.'
                            ) {
                                isTokenInvalid = true;
                                bodyIsInvalid = true;
                                console.log(
                                    'RoValra API: Invalid token from response body detected.',
                                );
                            }
                        } catch (e) {}
                    }

                    if (
                        isTokenInvalid &&
                        endpoint &&
                        endpoint.includes('/v1/auth') &&
                        !skipAutoAuth &&
                        !authRetried
                    ) {
                        console.log(
                            'RoValra API: Invalid token, attempting token refresh...',
                        );
                        authRetried = true;
                        const newToken = await getValidAccessToken(true);
                        if (newToken) {
                            fetchOptions.headers.set(
                                'Authorization',
                                `Bearer ${newToken}`,
                            );
                            continue;
                        }
                    }

                    if (lastResponse.ok && !bodyIsInvalid) {
                        return lastResponse;
                    }

                    if (endpoint && endpoint.includes('/v1/auth')) break;
                } catch (error) {
                    if (
                        attempt === 3 ||
                        (endpoint && endpoint.includes('/v1/auth'))
                    ) {
                        console.error(
                            `RoValra API: Request to ${fullUrl} failed${attempt === 3 ? ' after multiple retries' : ''}.`,
                            error,
                        );
                        throw error;
                    }
                }
                if (attempt < 3) {
                    await new Promise((res) => setTimeout(res, 1000));
                }
            }
            if (!lastResponse.ok) {
                console.error(
                    `RoValra API: Request to ${fullUrl} failed with status ${lastResponse.status} after multiple retries.`,
                );
            }
            return lastResponse;
        }

        if (isMutatingMethod) {
            const csrfToken = await getCsrfToken();
            if (csrfToken) {
                normalizedHeaders.set('X-CSRF-TOKEN', csrfToken);
            }
        }

        let response;
        try {
            response = await fetch(fullUrl, fetchOptions);
        } catch (error) {
            if (error.name === 'AbortError' || (signal && signal.aborted)) {
                return new Response(null, {
                    status: 499,
                    statusText: 'Client Closed Request',
                });
            }
            throw error;
        }

        if (response.status === 403 && isMutatingMethod) {
            const newCsrfToken = response.headers.get('x-csrf-token');
            if (newCsrfToken) {
                if (typeof getCsrfToken.setToken === 'function')
                    getCsrfToken.setToken(newCsrfToken);
                fetchOptions.headers.set('X-CSRF-TOKEN', newCsrfToken);
                try {
                    response = await fetch(fullUrl, fetchOptions);
                } catch (error) {
                    if (
                        error.name === 'AbortError' ||
                        (signal && signal.aborted)
                    ) {
                        return new Response(null, {
                            status: 499,
                            statusText: 'Client Closed Request',
                        });
                    }
                    throw error;
                }
            }
        }

        if (!response.ok) {
            console.error(
                `RoValra API: Request to ${fullUrl} failed with status ${response.status}.`,
            );

            if (useApiKey && response.status === 401) {
                await invalidateApiKey();
            }
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
        gameJoinClone
            .json()
            .then((data) => {
                if (data?.joinScript?.SessionId) {
                    try {
                        if (
                            typeof data.joinScript.SessionId === 'string' &&
                            data.joinScript.SessionId.startsWith('{')
                        ) {
                            const sessionId = JSON.parse(
                                data.joinScript.SessionId,
                            );
                            if (
                                typeof sessionId.Latitude === 'number' &&
                                typeof sessionId.Longitude === 'number'
                            ) {
                                updateUserLocationIfChanged({
                                    userLat: sessionId.Latitude,
                                    userLon: sessionId.Longitude,
                                });
                            }
                        }
                    } catch (e) {}
                }

                if (data.status === 5) {
                    let serverId = null;
                    try {
                        const bodyData =
                            options.body && typeof options.body === 'string'
                                ? JSON.parse(options.body)
                                : options.body;
                        if (bodyData && bodyData.gameId)
                            serverId = bodyData.gameId;
                    } catch (e) {}

                    if (serverId) {
                        document.dispatchEvent(
                            new CustomEvent('rovalra-server-inactive', {
                                detail: { serverId },
                            }),
                        );
                    }
                }
            })
            .catch(() => {});
    }

    if (
        options.subdomain === 'games' &&
        options.endpoint.includes('/servers/') &&
        !options.isRovalraApi
    ) {
        try {
            const monitorClone = clonedResponse.clone();
            const fullUrl = `https://${options.subdomain || 'games'}.roblox.com${options.endpoint}`;

            monitorClone
                .json()
                .then((data) => {
                    document.dispatchEvent(
                        new CustomEvent('rovalra-game-servers-response', {
                            detail: { url: fullUrl, data: data },
                        }),
                    );
                })
                .catch(() => {});
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
        const errorBody = await response
            .json()
            .catch(() => ({ message: 'Could not parse error response' }));
        const error = new Error(
            `API request failed with status ${response.status}`,
        );
        error.response = errorBody;
        error.status = response.status;
        throw error;
    }
    return await response.json();
}
