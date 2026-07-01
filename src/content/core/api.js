// All api requests should go through this script

import { getCsrfToken } from './utils.js';
import { getAuthenticatedUserId } from './user.js';
import { HBAClient } from 'roblox-bat';
import { getValidAccessToken } from './oauth/oauth.js';
import { getValidApiKey, invalidateApiKey } from './utils/trackers/apiKey.js';
import { showSystemAlert } from './ui/roblox/alert.js';

import { updateUserLocationIfChanged } from './utils/location.js';
const activeRequests = new Map();
let gameJoinErrorCount = 0;
let lastGameJoinRequestTime = 0;
const GAMEJOIN_TIMEOUT_MS = 2000;

const OAUTH_STORAGE_KEY = 'rovalra_oauth_verification';
let cachedRovalraUserAgent = null;

const hbaClient = new HBAClient({
    onSite: true,
});

function getRovalraUserAgent() {
    if (cachedRovalraUserAgent) return cachedRovalraUserAgent;

    const originalUA = navigator.userAgent;
    let browser = 'Unknown';
    let engine = 'Unknown';

    if (originalUA.includes('Firefox/')) {
        browser = 'Firefox';
        engine = 'Gecko';
    } else if (originalUA.includes('Edg/')) {
        browser = 'Edge';
        engine = 'Chromium';
    } else if (originalUA.includes('OPR/') || originalUA.includes('Opera/')) {
        browser = 'Opera';
        engine = 'Chromium';
    } else if (originalUA.includes('Chrome/')) {
        browser = 'Chrome';
        engine = 'Chromium';
    } else if (originalUA.includes('Safari/')) {
        browser = 'Safari';
        engine = 'WebKit';
    }

    const manifest = chrome.runtime.getManifest();
    const version = manifest.version || 'Unknown';
    const isDevelopment = !('update_url' in manifest);
    const environment = isDevelopment ? 'Development' : 'Production';

    cachedRovalraUserAgent = `RoValraExtension(RoValra/${browser}/${engine}/${version}/${environment})`;
    if (engine === 'Gecko' || engine === 'WebKit') {
        cachedRovalraUserAgent += ' UnofficialRoValraVersion';
    }

    return cachedRovalraUserAgent;
}

function getRequestKey({
    endpoint,
    subdomain = 'apis',
    method = 'GET',
    isRovalraApi = false,
    headers = {},
    body = null,
    fullUrl = null,
}) {
    const bodyStr =
        body && typeof body === 'object' ? JSON.stringify(body) : body || '';
    const headersStr = JSON.stringify(headers || {});
    const target = fullUrl || `${isRovalraApi}|${subdomain}|${endpoint}`;
    return `${target}|${method.toUpperCase()}|${bodyStr}|${headersStr}`;
}

function normalizeGameJoinEndpoint(endpoint) {
    if (typeof endpoint !== 'string') return endpoint;
    return endpoint.replace(/^\/v1\//, '/v2/');
}

function isGameJoinTimeoutEnabled(endpoint) {
    if (typeof endpoint !== 'string') return true;
    return endpoint.split('?')[0] !== '/v2/join-game';
}

function createGameJoinFullResponse() {
    return new Response(
        JSON.stringify({
            status: 22,
            message: 'Server full',
            rovalraTimedOut: true,
        }),
        {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        },
    );
}

function parseServerSentEvents(text) {
    const events = [];
    const blocks = String(text || '').split(/\r?\n\r?\n/);

    for (const block of blocks) {
        if (!block.trim()) continue;

        const event = { event: 'message', data: '' };
        const dataLines = [];

        for (const rawLine of block.split(/\r?\n/)) {
            if (!rawLine || rawLine.startsWith(':')) continue;

            const separatorIndex = rawLine.indexOf(':');
            let field = rawLine;
            let value = '';

            if (separatorIndex !== -1) {
                field = rawLine.slice(0, separatorIndex);
                value = rawLine.slice(separatorIndex + 1);
                if (value.charCodeAt(0) === 32) value = value.slice(1);
            }

            if (field === 'event') event.event = value;
            else if (field === 'id') event.id = value;
            else if (field === 'retry') event.retry = value;
            else if (field === 'data') dataLines.push(value);
        }

        event.data = dataLines.join('\n');
        events.push(event);
    }

    return events;
}

async function normalizeGameJoinResponse(response) {
    const contentType = (
        response.headers.get('Content-Type') || ''
    ).toLowerCase();
    if (!contentType.includes('text/event-stream')) return response;

    const text = await response.text();
    const events = parseServerSentEvents(text);
    const readyEvent =
        events.find((event) => event.event === 'ResponseReady') ||
        events.find((event) => event.data?.trim());

    if (!readyEvent?.data) {
        return new Response(JSON.stringify({ status: 0 }), {
            status: response.status,
            statusText: response.statusText,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    try {
        JSON.parse(readyEvent.data);
    } catch (e) {
        return new Response(JSON.stringify({ status: 0 }), {
            status: response.status,
            statusText: response.statusText,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    return new Response(readyEvent.data, {
        status: response.status,
        statusText: response.statusText,
        headers: { 'Content-Type': 'application/json' },
    });
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

function checkSimulatedJoinError() {
    return new Promise((resolve) => {
        if (
            typeof chrome === 'undefined' ||
            !chrome.storage ||
            !chrome.storage.local
        ) {
            resolve(false);
            return;
        }
        chrome.storage.local.get(['simulateRobloxJoinErrors'], (result) => {
            resolve(!!result.simulateRobloxJoinErrors);
        });
    });
}

function checkSimulatedJoinHttpError() {
    return new Promise((resolve) => {
        if (
            typeof chrome === 'undefined' ||
            !chrome.storage ||
            !chrome.storage.local
        ) {
            resolve(false);
            return;
        }
        chrome.storage.local.get(['simulateRobloxJoinHttpErrors'], (result) => {
            resolve(!!result.simulateRobloxJoinHttpErrors);
        });
    });
}

export function resetGameJoinErrorCount() {
    gameJoinErrorCount = 0;
}

export async function callRobloxApi(options) {
    if (options.subdomain === 'gamejoin') {
        options = {
            ...options,
            endpoint: normalizeGameJoinEndpoint(options.endpoint),
        };
    }

    if (
        options.subdomain === 'gamejoin' &&
        (options.method || 'GET').toUpperCase() === 'POST'
    ) {
        if (
            options.body &&
            typeof options.body === 'object' &&
            !(options.body instanceof FormData)
        ) {
            const bodyUpdate = { joinOrigin: 'RoValraFetchInfo' };
            if (!options.body.gameJoinAttemptId) {
                bodyUpdate.gameJoinAttemptId = self.crypto.randomUUID();
            }

            options = {
                ...options,
                body: { ...options.body, ...bodyUpdate },
            };
        }
    }

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
            responseType = 'text',
        } = options;

        const normalizedHeaders = new Headers(headers);

        if (isRovalraApi && subdomain === 'apis') {
            normalizedHeaders.set(
                'x-rovalra-user-agent',
                getRovalraUserAgent(),
            );
        }

        if (useApiKey) {
            const apiKey = await getValidApiKey();
            if (apiKey) {
                normalizedHeaders.set('x-api-key', apiKey);
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
                            fullUrl: customFullUrl,
                            method,
                            body,
                            headers: Object.fromEntries(
                                normalizedHeaders.entries(),
                            ),
                            noCache,
                            responseType,
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

        if (isRovalraApi && subdomain === 'apis') {
            if (!skipAutoAuth) {
                const token = await getValidAccessToken();
                if (token) {
                    normalizedHeaders.set('Authorization', `Bearer ${token}`);
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

        if (subdomain === 'gamejoin') {
            const isJoinHttpErrorSimulated =
                await checkSimulatedJoinHttpError();
            if (isJoinHttpErrorSimulated) {
                console.warn(
                    `RoValra API: [SIMULATION] Returning 500 error for ${endpoint}`,
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

            const isJoinErrorSimulated = await checkSimulatedJoinError();
            if (isJoinErrorSimulated) {
                console.warn(
                    `RoValra API: [SIMULATION] Throwing network error for ${endpoint}`,
                );
                throw new Error('ERR_SOCKS_CONNECTION_FAILED');
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

        if (!isRovalraApi && !useBackground) {
            try {
                const authenticatedUserId = await getAuthenticatedUserId();
                const batHeaders = await hbaClient.generateBaseHeaders(
                    fullUrl,
                    method,
                    !!authenticatedUserId,
                    fetchOptions.body,
                );
                if (batHeaders['x-bound-auth-token']) {
                    normalizedHeaders.set(
                        'x-bound-auth-token',
                        batHeaders['x-bound-auth-token'],
                    );
                }
            } catch (err) {
                console.warn('RoValra API: Failed to generate BAT token', err);
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
                                (bodyJson.message ===
                                    'Invalid or obsolete token.' ||
                                    bodyJson.message ===
                                        'Invalid or obsolete session.')
                            ) {
                                isTokenInvalid = true;
                                bodyIsInvalid = true;
                                console.log(
                                    'RoValra API: Invalid token/session from response body detected.',
                                );
                            }
                        } catch (e) {}
                    }

                    if (
                        isTokenInvalid &&
                        endpoint &&
                        endpoint.includes('/v1/auth') &&
                        !skipAutoAuth
                    ) {
                        if (!authRetried) {
                            console.log(
                                'RoValra API: Invalid token/session, attempting token refresh...',
                            );
                            authRetried = true;
                            const newToken = await getValidAccessToken(
                                true,
                                false,
                            );
                            if (newToken) {
                                fetchOptions.headers.set(
                                    'Authorization',
                                    `Bearer ${newToken}`,
                                );
                                continue;
                            }
                        }

                        console.warn(
                            'RoValra API: Authentication failed repeatedly. Clearing storage as last resort.',
                        );
                        await chrome.storage.local.remove(OAUTH_STORAGE_KEY);
                        break;
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

        let timeoutId = null;
        let abortSignalCleanup = null;
        let didGameJoinTimeout = false;
        const shouldUseGameJoinTimeout =
            subdomain === 'gamejoin' && isGameJoinTimeoutEnabled(endpoint);

        if (shouldUseGameJoinTimeout) {
            const controller = new AbortController();
            timeoutId = setTimeout(() => {
                didGameJoinTimeout = true;
                controller.abort();
            }, GAMEJOIN_TIMEOUT_MS);

            if (signal) {
                if (signal.aborted) {
                    controller.abort();
                } else {
                    abortSignalCleanup = () => controller.abort();
                    signal.addEventListener('abort', abortSignalCleanup, {
                        once: true,
                    });
                }
            }

            fetchOptions.signal = controller.signal;
        }

        const cleanupGameJoinTimeout = () => {
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
            if (signal && abortSignalCleanup) {
                signal.removeEventListener('abort', abortSignalCleanup);
                abortSignalCleanup = null;
            }
        };

        let response;
        try {
            response = await fetch(fullUrl, fetchOptions);
        } catch (error) {
            cleanupGameJoinTimeout();
            if (didGameJoinTimeout) {
                return createGameJoinFullResponse();
            }
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
                    cleanupGameJoinTimeout();
                    if (didGameJoinTimeout) {
                        return createGameJoinFullResponse();
                    }
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

        try {
            if (subdomain === 'gamejoin') {
                response = await normalizeGameJoinResponse(response);
            }
        } catch (error) {
            if (didGameJoinTimeout) {
                return createGameJoinFullResponse();
            }
            throw error;
        } finally {
            cleanupGameJoinTimeout();
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

    let originalResponse;
    try {
        originalResponse = await requestPromise;
    } catch (err) {
        const errorMessage = err.message || 'Unknown network error';
        if (options.subdomain === 'gamejoin') {
            gameJoinErrorCount++;
            if (gameJoinErrorCount > 3) {
                document.dispatchEvent(
                    new CustomEvent('rovalra-gamejoin-critical-error', {
                        detail: {
                            errorMessage: `Network error: ${errorMessage}`,
                        },
                    }),
                );
            }
        }
        throw err;
    }

    const clonedResponse = originalResponse.clone();
    let errorMessage = `HTTP error: ${originalResponse.status} ${originalResponse.statusText}`;

    if (
        options.subdomain === 'gamejoin' &&
        !originalResponse.ok &&
        originalResponse.status !== 429
    ) {
        gameJoinErrorCount++;
        if (gameJoinErrorCount > 3) {
            originalResponse
                .clone()
                .json()
                .then((data) => {
                    if (data?.errors?.[0]?.message) {
                        errorMessage += ` - ${data.errors[0].message}`;
                    }
                    document.dispatchEvent(
                        new CustomEvent('rovalra-gamejoin-critical-error', {
                            detail: { errorMessage: errorMessage },
                        }),
                    );
                })
                .catch(() => {
                    document.dispatchEvent(
                        new CustomEvent('rovalra-gamejoin-critical-error', {
                            detail: { errorMessage: errorMessage },
                        }),
                    );
                });
        }
    }

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

export async function checkUrlStatus(url, options = {}) {
    const { method = 'GET', signal, expectNoRedirect = false } = options;
    try {
        const fetchOptions = {
            method,
            signal,
            credentials: 'include',
            redirect: expectNoRedirect ? 'manual' : 'follow',
        };
        const response = await fetch(url, fetchOptions);
        return response.status;
    } catch (error) {
        if (error.name === 'AbortError' || (signal && signal.aborted)) {
            return 499;
        }
        throw error;
    }
}

export async function callRobloxApiJson(options) {
    const response = await callRobloxApi(options);
    if (!response.ok) {
        const errorBody = await response
            .json()
            .catch(() => ({ message: 'Could not parse error response' }));

        if (options.isRovalraApi) {
            const message = errorBody?.message || errorBody?.error;
            if (
                message ===
                    'This feature has been disabled for your account due to moderation.' ||
                message ===
                    'Your account has been suspended for violating terms of service.'
            ) {
                showSystemAlert(
                    'This feature has been disabled due to your violation of the RoValra terms of service.',
                    'warning',
                );
            }
        }

        const error = new Error(
            `API request failed with status ${response.status}`,
        );
        error.response = errorBody;
        error.status = response.status;
        throw error;
    }
    return await response.json();
}
