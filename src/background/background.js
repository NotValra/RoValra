import { SETTINGS_CONFIG } from '../content/core/settings/settingConfig.js';
import init from './settingsCompat.ts';
import { updateGameBookmarks } from './gameBookmarks.js';
import { setupNotifications } from './notifications.js';
import './indexedDb.js';

// --- Constants & State ---

const state = {
    isMemoryFixEnabled: false,
    programmaticallyNavigatedUrls: new Set(),
    currentUserId: null,
    latestPresence: null,
    pollingInterval: null,
    csrfTokenCache: null,
    rotatorInterval: null,
    rotatorIndex: 0,
    bannedUserRedirects: new Map(),
    privateGameRedirects: new Map(),
};
const rateLimitCooldowns = new Map();

// --- Session Storage Configuration ---
if (chrome.storage.session && chrome.storage.session.setAccessLevel) {
    chrome.storage.session
        .setAccessLevel({
            accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS',
        })
        .catch((err) =>
            console.error('RoValra: Failed to set session access level', err),
        );
}

// --- Settings Management ---

function getDefaultSettings() {
    const defaults = {};
    for (const category of Object.values(SETTINGS_CONFIG)) {
        for (const [settingName, settingDef] of Object.entries(
            category.settings,
        )) {
            if (settingDef.default !== undefined) {
                defaults[settingName] = settingDef.default;
            }
            if (settingDef.childSettings) {
                for (const [childName, childSettingDef] of Object.entries(
                    settingDef.childSettings,
                )) {
                    if (childSettingDef.default !== undefined) {
                        defaults[childName] = childSettingDef.default;
                    }
                }
            }
        }
    }
    return defaults;
}

function initializeSettings(reason) {
    const defaults = getDefaultSettings();

    chrome.storage.local.get(null, async (currentSettings) => {
        await init();
        const settingsToUpdate = {};
        let needsUpdate = false;

        for (const [key, defaultValue] of Object.entries(defaults)) {
            const storedValue = currentSettings[key];

            if (storedValue === undefined) {
                settingsToUpdate[key] = defaultValue;
                needsUpdate = true;
            } else if (defaultValue !== null) {
                const defaultType = typeof defaultValue;
                const storedType = typeof storedValue;

                if (storedValue === null) {
                    console.warn(
                        `RoValra: Setting '${key}' was null but expected ${defaultType}. Resetting.`,
                    );
                    settingsToUpdate[key] = defaultValue;
                    needsUpdate = true;
                } else if (storedType !== defaultType) {
                    console.warn(
                        `RoValra: Type mismatch for '${key}'. Expected ${defaultType}, got ${storedType}. Resetting.`,
                    );
                    settingsToUpdate[key] = defaultValue;
                    needsUpdate = true;
                }
            }
        }

        if (needsUpdate) {
            chrome.storage.local.set(settingsToUpdate, () => {
                if (chrome.runtime.lastError) {
                    console.error(
                        'RoValra: Failed to sync settings.',
                        chrome.runtime.lastError,
                    );
                } else {
                    console.log(
                        `RoValra: Synced/Fixed ${Object.keys(settingsToUpdate).length} settings (Trigger: ${reason}).`,
                    );
                }
            });
        }
    });
}

// --- User Agent Spoofing ---

function updateUserAgentRule() {
    const originalUA = self.navigator.userAgent;
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

    let rovalraSuffix = `RoValraExtension(RoValra/${browser}/${engine}/${version}/${environment})`;
    if (engine === 'Gecko' || engine === 'WebKit') {
        rovalraSuffix += ' UnofficialRoValraVersion'; // If you are developing a port for either of these don't remove this. It tells Roblox that I don't control requests coming from your port.
    }

    const rules = [
        {
            id: 999,
            priority: 5,
            action: {
                type: 'modifyHeaders',
                requestHeaders: [
                    {
                        header: 'User-Agent',
                        operation: 'set',
                        value: `${originalUA} ${rovalraSuffix}`,
                    },
                ],
            },
            condition: {
                regexFilter: '.*_RoValraRequest=',
                resourceTypes: ['xmlhttprequest'],
            },
        },
        {
            id: 1000,
            priority: 10,
            action: {
                type: 'modifyHeaders',
                requestHeaders: [
                    {
                        header: 'User-Agent',
                        operation: 'set',
                        value: `Roblox/WinInet ${rovalraSuffix}`,
                    },
                ],
            },
            condition: {
                regexFilter:
                    '^https://gamejoin\\.roblox\\.com/.*_RoValraRequest=|^https://apis\\.roblox\\.com/player-hydration-service/v1/players/signed',
                resourceTypes: ['xmlhttprequest'],
            },
        },
    ];

    chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [999, 1000],
        addRules: rules,
    });
}

// --- Banned User Redirect Tracking ---

function onBeforeRedirectHandler(details) {
    const match = details.url.match(/users\/(\d+)\/profile/);
    if (match && match[1]) {
        state.bannedUserRedirects.set(details.tabId, match[1]);
    }
}

function updateBannedUserListener() {
    if (!chrome.webRequest) return;

    chrome.permissions.contains({ permissions: ['webRequest'] }, (granted) => {
        if (granted) {
            chrome.storage.local.get(
                { bannedUserDetectionFallbackEnabled: false },
                (data) => {
                    if (data.bannedUserDetectionFallbackEnabled) {
                        if (
                            !chrome.webRequest.onBeforeRedirect.hasListener(
                                onBeforeRedirectHandler,
                            )
                        ) {
                            chrome.webRequest.onBeforeRedirect.addListener(
                                onBeforeRedirectHandler,
                                {
                                    urls: [
                                        '*://www.roblox.com/users/*/profile*',
                                    ],
                                },
                            );
                        }
                    } else {
                        chrome.webRequest.onBeforeRedirect.removeListener(
                            onBeforeRedirectHandler,
                        );
                    }
                },
            );
        }
    });
}

// --- Private Game Redirect Tracking ---

function onPrivateGameRedirectHandler(details) {
    const match = details.url.match(/games\/(\d+)/);
    if (match && match[1]) {
        const placeId = match[1];
        state.privateGameRedirects.set(details.tabId, placeId);
    }
}

function updatePrivateGameListener() {
    if (!chrome.webRequest) return;

    chrome.permissions.contains({ permissions: ['webRequest'] }, (granted) => {
        if (granted) {
            chrome.storage.local.get(
                { privateGameDetectionFallbackEnabled: false },
                (data) => {
                    if (data.privateGameDetectionFallbackEnabled) {
                        if (
                            !chrome.webRequest.onBeforeRedirect.hasListener(
                                onPrivateGameRedirectHandler,
                            )
                        ) {
                            chrome.webRequest.onBeforeRedirect.addListener(
                                onPrivateGameRedirectHandler,
                                {
                                    urls: ['*://www.roblox.com/games/*'],
                                },
                            );
                        }
                    } else {
                        chrome.webRequest.onBeforeRedirect.removeListener(
                            onPrivateGameRedirectHandler,
                        );
                    }
                },
            );
        }
    });
}

// --- Memory Leak Fix ---

const handleMemoryLeakNavigation = (details) => {
    if (state.programmaticallyNavigatedUrls.has(details.url)) {
        state.programmaticallyNavigatedUrls.delete(details.url);
        return;
    }

    if (
        details.frameId !== 0 ||
        details.transitionType === 'auto_subframe' ||
        details.transitionType === 'reload'
    ) {
        return;
    }
    if (details.url.includes('/download/client')) {
        return;
    }

    const newUrl = details.url;
    const tabId = details.tabId;

    state.programmaticallyNavigatedUrls.add(newUrl);

    chrome.tabs.update(tabId, { url: 'about:blank' }, () => {
        setTimeout(() => {
            chrome.tabs.update(tabId, { url: newUrl });
        }, 50);
    });
};

const navigationListener = (details) => {
    if (state.isMemoryFixEnabled) {
        handleMemoryLeakNavigation(details);
    }
};

async function setupNavigationListener() {
    const hasRequiredPermissions = await chrome.permissions.contains({
        permissions: ['webNavigation'],
    });
    if (
        hasRequiredPermissions &&
        !chrome.webNavigation.onBeforeNavigate.hasListener(navigationListener)
    ) {
        chrome.webNavigation.onBeforeNavigate.addListener(navigationListener, {
            url: [{ hostContains: '.roblox.com' }],
            urlExcludes: ['roblox-player:*'],
        });
    }
}

// --- Context Menu ---

const contextMenuClickListener = async (info, tab) => {
    if (info.menuItemId.startsWith('rovalra-copy-universe-')) {
        const placeId = info.menuItemId.replace('rovalra-copy-universe-', '');
        const universeId = await getUniverseIdFromPlaceId(placeId);
        if (universeId && tab?.id) {
            chrome.tabs.sendMessage(tab.id, {
                action: 'copyToClipboard',
                text: String(universeId),
            });
        }
    } else if (info.menuItemId.startsWith('rovalra-viewid-')) {
        const id = info.menuItemId.replace('rovalra-viewid-', '');
        if (id && tab?.id) {
            chrome.tabs.sendMessage(tab.id, {
                action: 'view-ids',
                data: {
                    targetId: id,
                },
            });
        }
    } else if (info.menuItemId.startsWith('rovalra-copy-') && tab?.id) {
        const textToCopy = info.menuItemId.replace('rovalra-copy-', '');
        chrome.tabs.sendMessage(tab.id, {
            action: 'copyToClipboard',
            text: textToCopy,
        });
    }
};

async function setupContextMenuListener() {
    const hasRequiredPermissions = await chrome.permissions.contains({
        permissions: ['contextMenus'],
    });
    if (
        hasRequiredPermissions &&
        chrome.contextMenus &&
        !chrome.contextMenus.onClicked.hasListener(contextMenuClickListener)
    ) {
        chrome.contextMenus.onClicked.addListener(contextMenuClickListener);
    }
}

// --- API & Networking ---

async function getUniverseIdFromPlaceId(placeId) {
    try {
        const response = await callRobloxApiBackground({
            subdomain: 'apis',
            endpoint: `/universes/v1/places/${placeId}/universe`,
        });

        if (response.ok) {
            const data = await response.json();
            return data.universeId;
        }
        return null;
    } catch (e) {
        console.error('RoValra: Error fetching universe ID from place ID', e);
        return null;
    }
}

async function callRobloxApiBackground(options) {
    const {
        subdomain = 'api',
        endpoint,
        method = 'GET',
        body = null,
        headers = {},
        fullUrl = null,
        isRovalraApi = false,
    } = options;

    let url;
    if (isRovalraApi) {
        if (subdomain !== 'apis') {
            throw new Error(
                'Unsupported RoValra subdomain for background fetch',
            );
        }
        url = `https://apis.rovalra.com${endpoint}`;
    } else if (fullUrl) {
        const parsedUrl = new URL(fullUrl);
        if (parsedUrl.hostname !== 'setup.rbxcdn.com') {
            throw new Error('Unsupported fullUrl host for background fetch');
        }
        url = parsedUrl.toString();
    } else {
        url = `https://${subdomain}.roblox.com${endpoint}`;
    }

    const separator = url.includes('?') ? '&' : '?';

    if (!endpoint?.includes('/player-hydration-service/v1/players/signed')) {
        url += `${separator}_RoValraRequest=`;
    }

    const fetchOptions = { method, headers: { ...headers } };
    if (isRovalraApi) {
        fetchOptions.credentials = 'omit';
    }

    if (body) {
        if (typeof body === 'object') {
            fetchOptions.headers['Content-Type'] = 'application/json';
            fetchOptions.body = JSON.stringify(body);
        } else {
            fetchOptions.body = body;
        }
    }

    if (
        !isRovalraApi &&
        method !== 'GET' &&
        method !== 'HEAD' &&
        state.csrfTokenCache
    ) {
        fetchOptions.headers['X-CSRF-TOKEN'] = state.csrfTokenCache;
    }

    const rateLimitKey = new URL(url).origin;
    const cooldownUntil = rateLimitCooldowns.get(rateLimitKey) || 0;
    if (cooldownUntil > Date.now()) {
        await sleep(cooldownUntil - Date.now());
    } else {
        rateLimitCooldowns.delete(rateLimitKey);
    }

    let response = await fetch(url, fetchOptions); //Verified

    if (response.status === 429) {
        const cooldown = getRateLimitDelay(response);
        if (cooldown > 0) {
            rateLimitCooldowns.set(
                rateLimitKey,
                Math.max(
                    rateLimitCooldowns.get(rateLimitKey) || 0,
                    Date.now() + cooldown,
                ),
            );
        }
    }

    if (
        !isRovalraApi &&
        response.status === 403 &&
        method !== 'GET' &&
        method !== 'HEAD'
    ) {
        const newCsrf = response.headers.get('x-csrf-token');
        if (newCsrf) {
            state.csrfTokenCache = newCsrf;
            fetchOptions.headers['X-CSRF-TOKEN'] = newCsrf;
            response = await fetch(url, fetchOptions); //Verified
        }
    }

    return response;
}

async function wearOutfit(outfitData) {
    const callWithRetry = async (options) => {
        let response;
        for (let i = 0; i < 4; i++) {
            response = await callRobloxApiBackground(options);
            if (response.ok) return response;
            if (response.status === 429 || response.status >= 500) {
                if (i < 3) await new Promise((r) => setTimeout(r, 1000));
                continue;
            }
            return response;
        }
        return response;
    };

    try {
        const outfitId =
            typeof outfitData === 'object' && outfitData !== null
                ? outfitData.itemId
                : outfitData;
        if (!outfitId) {
            console.error(
                'RoValra: wearOutfit called with invalid outfitData',
                outfitData,
            );
            return { ok: false };
        }

        const storedDetails = await new Promise((resolve) => {
            chrome.storage.local.get(
                'rovalra_avatar_rotator_details',
                (data) => {
                    resolve(
                        data.rovalra_avatar_rotator_details?.[
                            String(outfitId)
                        ] || null,
                    );
                },
            );
        });
        let details = storedDetails;
        if (!details) {
            const detailsRes = await callWithRetry({
                subdomain: 'avatar',
                endpoint: `/v4/outfits/${outfitId}/details`,
            });
            if (!detailsRes?.ok) return { ok: false };
            details = await detailsRes.json();
        }

        const outfitModel = details.outfitModel || details;
        const assets = [...(outfitModel.assets || [])];

        let bodyColor3s = details.bodyColor3s || outfitModel.bodyColor3s;

        if (!bodyColor3s && outfitModel.bodyColors) {
            const colorKeys = {
                headColor: 'headColor3',
                torsoColor: 'torsoColor3',
                leftArmColor: 'leftArmColor3',
                rightArmColor: 'rightArmColor3',
                leftLegColor: 'leftLegColor3',
                rightLegColor: 'rightLegColor3',
            };

            bodyColor3s = Object.fromEntries(
                Object.entries(colorKeys)
                    .filter(([key]) => outfitModel.bodyColors[key])
                    .map(([key, outputKey]) => {
                        const color = String(outfitModel.bodyColors[key]);
                        return [
                            outputKey,
                            color.startsWith('#') ? color : `#${color}`,
                        ];
                    }),
            );
        }

        const backgroundAsset =
            details.outfitConfigurations?.background?.backgroundAsset;
        const promises = [];

        if (backgroundAsset?.id)
            promises.push(
                callWithRetry({
                    subdomain: 'avatar',
                    endpoint: '/v4/avatar',
                    method: 'PATCH',
                    body: {
                        updateTypes: ['UpdateBackground'],
                        avatarDefinition: {
                            updateAvatarConfig: {
                                backgroundRequestModel: {
                                    id: backgroundAsset.id,
                                },
                            },
                        },
                    },
                }),
            );

        if (assets.length > 0)
            promises.push(
                callWithRetry({
                    subdomain: 'avatar',
                    endpoint: '/v2/avatar/set-wearing-assets',
                    method: 'POST',
                    body: { assets },
                }),
            );
        if (outfitModel.playerAvatarType)
            promises.push(
                callWithRetry({
                    subdomain: 'avatar',
                    endpoint: '/v1/avatar/set-player-avatar-type',
                    method: 'POST',
                    body: { playerAvatarType: outfitModel.playerAvatarType },
                }),
            );
        if (outfitModel.scale)
            promises.push(
                callWithRetry({
                    subdomain: 'avatar',
                    endpoint: '/v1/avatar/set-scales',
                    method: 'POST',
                    body: outfitModel.scale,
                }),
            );

        if (bodyColor3s) {
            promises.push(
                callWithRetry({
                    subdomain: 'avatar',
                    endpoint: '/v2/avatar/set-body-colors',
                    method: 'POST',
                    body: bodyColor3s,
                }),
            );
        }

        const results = await Promise.all(promises);
        return { ok: results.every((r) => r && r.ok) };
    } catch (e) {
        console.error('RoValra: Error wearing outfit', e);
        return { ok: false };
    }
}

// --- Presence Polling ---

function handlePresenceUpdate(presence) {
    if (JSON.stringify(presence) !== JSON.stringify(state.latestPresence)) {
        const oldPresence = state.latestPresence;
        state.latestPresence = presence;

        chrome.tabs.query({ url: '*://*.roblox.com/*' }, (tabs) => {
            tabs.forEach((tab) =>
                chrome.tabs
                    .sendMessage(tab.id, {
                        action: 'presenceUpdate',
                        presence: state.latestPresence,
                    })
                    .catch(() => {}),
            );
        });

        // Server History Logic
        const isJoiningGame = (p) =>
            p && (p.userPresenceType === 2 || p.userPresenceType === 4);
        if (
            isJoiningGame(presence) &&
            presence.gameId &&
            presence.rootPlaceId
        ) {
            if (
                !isJoiningGame(oldPresence) ||
                oldPresence.gameId !== presence.gameId
            ) {
                chrome.storage.local.get(
                    { rovalra_server_history: {} },
                    (res) => {
                        const history = res.rovalra_server_history || {};
                        const gameId = presence.rootPlaceId.toString();
                        let gameHistory = history[gameId] || [];
                        const now = Date.now();

                        gameHistory = gameHistory.filter(
                            (entry) =>
                                now - entry.timestamp < 24 * 60 * 60 * 1000,
                        );
                        const serverIndex = gameHistory.findIndex(
                            (entry) =>
                                entry.presence.gameId === presence.gameId,
                        );
                        if (serverIndex > -1)
                            gameHistory.splice(serverIndex, 1);

                        gameHistory.unshift({ presence, timestamp: now });
                        history[gameId] = gameHistory.slice(0, 4);
                        chrome.storage.local.set({
                            rovalra_server_history: history,
                        });
                    },
                );
            }
        }
    }
}

function pollUserPresence() {
    if (!state.currentUserId) return;

    chrome.storage.local.get(
        { recentServersEnabled: true },
        async (settings) => {
            if (!settings.recentServersEnabled) return;

            try {
                const response = await callRobloxApiBackground({
                    subdomain: 'presence',
                    endpoint: '/v1/presence/users',
                    method: 'POST',
                    body: { userIds: [parseInt(state.currentUserId, 10)] },
                });

                if (response.ok) {
                    const data = await response.json();
                    const presence = data?.userPresences?.[0];
                    if (presence) {
                        handlePresenceUpdate(presence);
                    }
                }
            } catch (e) {
                // ignore
            }
        },
    );
}

// --- Avatar Rotator ---

function updateAvatarRotator() {
    chrome.storage.local.get(
        [
            'rovalra_avatar_rotator_enabled',
            'rovalra_avatar_rotator_ids',
            'rovalra_avatar_rotator_interval',
        ],
        (data) => {
            if (state.rotatorInterval) {
                clearInterval(state.rotatorInterval);
                state.rotatorInterval = null;
            }

            if (
                data.rovalra_avatar_rotator_enabled &&
                data.rovalra_avatar_rotator_ids?.length > 0
            ) {
                const ids = data.rovalra_avatar_rotator_ids;
                state.rotatorIndex = 0;

                let intervalSeconds = Math.max(
                    parseInt(data.rovalra_avatar_rotator_interval, 10) || 5,
                    5,
                );

                const rotate = () => {
                    if (ids.length === 0) return;
                    const outfit = ids[state.rotatorIndex];
                    wearOutfit(outfit);
                    state.rotatorIndex = (state.rotatorIndex + 1) % ids.length;
                };

                rotate();
                state.rotatorInterval = setInterval(
                    rotate,
                    intervalSeconds * 1000,
                );
            }
        },
    );
}

// --- Rate Limit Helpers ---

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRateLimitDelay(response) {
    const retryAfter = response.headers.get('retry-after');
    if (retryAfter) {
        const retryAfterSeconds = Number(retryAfter);
        if (Number.isFinite(retryAfterSeconds)) {
            return Math.max(0, retryAfterSeconds * 1000) + 1000;
        }

        const retryAt = Date.parse(retryAfter);
        if (Number.isFinite(retryAt)) {
            return Math.max(0, retryAt - Date.now()) + 1000;
        }
    }

    const remaining = Number(response.headers.get('x-ratelimit-remaining'));
    const resetValue = Number(response.headers.get('x-ratelimit-reset'));

    if (
        Number.isFinite(remaining) &&
        remaining <= 1 &&
        Number.isFinite(resetValue) &&
        resetValue > 0
    ) {
        return (
            (resetValue > 1e9
                ? Math.max(0, resetValue * 1000 - Date.now())
                : resetValue * 1000) + 1000
        );
    }

    return 0;
}

// --- Fetch Roblox Font Assets ---

function uint8ToBase64(u8) {
    let binary = '';
    const chunk = 8192;
    for (let i = 0; i < u8.length; i += chunk) {
        binary += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
    }
    return btoa(binary);
}

const customFontCache = new Map();

function getAssetIdFromValue(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return String(Math.trunc(value));
    }
    if (typeof value !== 'string') return null;
    const match = value.match(/\d+/);
    return match ? match[0] : null;
}

function detectFontMimeType(bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.length < 4)
        return 'application/octet-stream';

    const signature = String.fromCharCode(
        bytes[0],
        bytes[1],
        bytes[2],
        bytes[3],
    );
    if (signature === 'OTTO') return 'font/otf';
    if (signature === 'ttcf') return 'font/collection';
    if (signature === 'wOFF') return 'font/woff';
    if (signature === 'wOF2') return 'font/woff2';
    if (
        bytes[0] === 0x00 &&
        bytes[1] === 0x01 &&
        bytes[2] === 0x00 &&
        bytes[3] === 0x00
    ) {
        return 'font/ttf';
    }
    if (signature === 'true' || signature === 'typ1') return 'font/ttf';

    return 'application/octet-stream';
}

function findFontFaces(fontInfo) {
    if (!fontInfo || typeof fontInfo !== 'object') return [];

    if (Array.isArray(fontInfo.faces)) return fontInfo.faces;
    if (Array.isArray(fontInfo.Faces)) return fontInfo.Faces;
    if (Array.isArray(fontInfo.fonts)) return fontInfo.fonts;

    return [fontInfo];
}

async function fetchAssetDelivery(assetId) {
    return callRobloxApiBackground({
        subdomain: 'assetdelivery',
        endpoint: `/v1/asset/?id=${encodeURIComponent(assetId)}`,
    });
}

async function getCustomFontFamily(assetId) {
    const normalizedAssetId = getAssetIdFromValue(assetId);
    if (!normalizedAssetId) throw new Error('Invalid custom font asset id');

    if (customFontCache.has(normalizedAssetId)) {
        return customFontCache.get(normalizedAssetId);
    }

    const promise = (async () => {
        const infoResponse = await fetchAssetDelivery(normalizedAssetId);
        if (!infoResponse.ok) {
            throw new Error(
                `Font info request failed: HTTP ${infoResponse.status}`,
            );
        }

        const fontInfo = await infoResponse.json();
        const familyName = `RoValraCustomFont${normalizedAssetId}`;
        const faces = [];

        for (const face of findFontFaces(fontInfo)) {
            const faceAssetId = getAssetIdFromValue(
                face.assetId ??
                    face.AssetId ??
                    face.assetID ??
                    face.id ??
                    face.Id,
            );
            if (!faceAssetId) continue;

            const fileResponse = await fetchAssetDelivery(faceAssetId);
            if (!fileResponse.ok) {
                console.warn(
                    `RoValra: Custom font file ${faceAssetId} failed with HTTP ${fileResponse.status}`,
                );
                continue;
            }

            const fontBytes = new Uint8Array(await fileResponse.arrayBuffer());
            faces.push({
                weight: Number(face.weight ?? face.Weight ?? 400) || 400,
                style: face.style ?? face.Style ?? 'normal',
                mimeType: detectFontMimeType(fontBytes),
                base64: uint8ToBase64(fontBytes),
            });
        }

        if (faces.length === 0) {
            throw new Error(
                'Custom font did not contain any downloadable faces',
            );
        }

        return { success: true, name: familyName, faces };
    })();

    customFontCache.set(normalizedAssetId, promise);
    try {
        return await promise;
    } catch (error) {
        customFontCache.delete(normalizedAssetId);
        throw error;
    }
}

// --- Event Listeners ---

chrome.runtime.onInstalled.addListener((details) => {
    chrome.storage.local.remove('rovalra_transactions_data');
    chrome.storage.local.get({ rovalra_installed_at: null }, (result) => {
        if (!result.rovalra_installed_at) {
            chrome.storage.local.set({ rovalra_installed_at: Date.now() });
        }
    });

    initializeSettings(details.reason);
    setupContextMenuListener();
});

chrome.runtime.onStartup.addListener(() => {
    initializeSettings('startup');
    setupContextMenuListener();
});

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
        if (changes.MemoryleakFixEnabled) {
            state.isMemoryFixEnabled = changes.MemoryleakFixEnabled.newValue;
            if (state.isMemoryFixEnabled) setupNavigationListener();
        }
        if (
            changes.rovalra_avatar_rotator_enabled ||
            changes.rovalra_avatar_rotator_ids ||
            changes.rovalra_avatar_rotator_interval
        ) {
            updateAvatarRotator();
        }
        if (
            changes.privateGameViewerEnabled ||
            changes.privateGameDetectionFallbackEnabled
        ) {
            updatePrivateGameListener();
        }
        if (
            changes.bannedUserViewerEnabled ||
            changes.bannedUserDetectionFallbackEnabled
        ) {
            updateBannedUserListener();
        }
    }
});

chrome.permissions.onAdded.addListener((permissions) => {
    if (permissions.permissions?.includes('webNavigation'))
        setupNavigationListener();
    if (permissions.permissions?.includes('contextMenus'))
        setupContextMenuListener();
    if (permissions.permissions?.includes('webRequest')) {
        updateBannedUserListener();
        updatePrivateGameListener();
    }

    chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) =>
            chrome.tabs
                .sendMessage(tab.id, { action: 'permissionsUpdated' })
                .catch(() => {}),
        );
    });
});

chrome.permissions.onRemoved.addListener((permissions) => {
    if (
        permissions.permissions?.includes('webNavigation') &&
        chrome.webNavigation.onBeforeNavigate.hasListener(navigationListener)
    ) {
        chrome.webNavigation.onBeforeNavigate.removeListener(
            navigationListener,
        );
    }
    if (
        permissions.permissions?.includes('contextMenus') &&
        chrome.contextMenus?.onClicked.hasListener(contextMenuClickListener)
    ) {
        chrome.contextMenus.onClicked.removeListener(contextMenuClickListener);
    }
    if (permissions.permissions?.includes('webRequest')) {
        chrome.webRequest.onBeforeRedirect.removeListener(
            onBeforeRedirectHandler,
        );
    }

    chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) =>
            chrome.tabs
                .sendMessage(tab.id, { action: 'permissionsUpdated' })
                .catch(() => {}),
        );
    });
});

function getImageTypeFromBytes(bytes) {
    const startsWith = (signature, offset = 0) =>
        signature.every((byte, i) => bytes[offset + i] === byte);
    const ascii = (text) => [...text].map((char) => char.charCodeAt(0));

    if (startsWith([0x89, 0x50, 0x4e, 0x47])) return 'image/png';
    if (startsWith([0xff, 0xd8, 0xff])) return 'image/jpeg';
    if (startsWith(ascii('GIF8'))) return 'image/gif';
    if (startsWith(ascii('RIFF')) && startsWith(ascii('WEBP'), 8)) {
        return 'image/webp';
    }
    if (startsWith(ascii('BM'))) return 'image/bmp';
    if (startsWith(ascii('ftypavif'), 4)) return 'image/avif';
    return null;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
        case 'updateGameBookmarks':
            updateGameBookmarks(request.operation)
                .then((state) => sendResponse({ state }))
                .catch((error) => sendResponse({ error: error.message }));
            return true;
        case 'fetchJson':
            fetch(request.url)
                .then((res) => {
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    return res.json();
                })
                .then((data) => sendResponse({ data }))
                .catch((err) => sendResponse({ error: err.message }));
            return true;

        case 'updateOfflineRule':
            chrome.declarativeNetRequest.updateEnabledRulesets(
                request.enabled
                    ? { enableRulesetIds: ['ruleset_status'] }
                    : { disableRulesetIds: ['ruleset_status'] },
            );
            sendResponse({ success: true });
            return false;

        case 'updateEarlyAccessRule':
            chrome.declarativeNetRequest.updateEnabledRulesets(
                request.enabled
                    ? { enableRulesetIds: ['ruleset_3'] }
                    : { disableRulesetIds: ['ruleset_3'] },
            );
            sendResponse({ success: true });
            return false;

        case 'enableServerJoinHeaders':
            chrome.declarativeNetRequest.updateEnabledRulesets({
                enableRulesetIds: ['ruleset_2'],
            });
            return false;

        case 'disableServerJoinHeaders':
            chrome.declarativeNetRequest.updateEnabledRulesets({
                disableRulesetIds: ['ruleset_2'],
            });
            return false;

        case 'injectScript':
            chrome.scripting
                .executeScript({
                    target: { tabId: sender.tab.id },
                    world: 'MAIN',
                    func: (code) => {
                        try {
                            const script = document.createElement('script');
                            script.textContent = code;
                            document.documentElement.appendChild(script);
                            script.remove();
                        } catch (e) {}
                    },
                    args: [request.codeToInject],
                })
                .then(() => sendResponse({ success: true }))
                .catch((err) =>
                    sendResponse({ success: false, error: err.message }),
                );
            return true;

        case 'toggleMemoryLeakFix':
            state.isMemoryFixEnabled = request.enabled;
            sendResponse({ success: true });
            return false;

        case 'injectMainWorldScript':
            if (sender.tab?.id) {
                chrome.scripting.executeScript({
                    target: { tabId: sender.tab.id },
                    files: [request.path],
                    world: 'MAIN',
                });
            }
            sendResponse({ success: true });
            return false;

        case 'checkPermission':
            chrome.permissions.contains(
                { permissions: [].concat(request.permission) },
                (granted) => {
                    sendResponse({ granted });
                },
            );
            return true;

        case 'requestPermission':
            chrome.permissions.request(
                { permissions: [].concat(request.permission) },
                (granted) => {
                    if (chrome.runtime.lastError)
                        console.warn(
                            'RoValra: Permission request failed:',
                            chrome.runtime.lastError,
                        );
                    sendResponse({ granted: !!granted });
                },
            );
            return true;

        case 'revokePermission':
            chrome.permissions.remove(
                { permissions: [].concat(request.permission) },
                (removed) => {
                    if (chrome.runtime.lastError) {
                        sendResponse({
                            revoked: false,
                            error: chrome.runtime.lastError.message,
                        });
                    } else {
                        sendResponse({ revoked: removed });
                    }
                },
            );
            return true;

        case 'updateUserId':
            if (request.userId && request.userId !== state.currentUserId) {
                state.currentUserId = request.userId;
                state.latestPresence = null;
                if (state.pollingInterval) clearInterval(state.pollingInterval);
                pollUserPresence();
                state.pollingInterval = setInterval(pollUserPresence, 5000);
            }
            return false;

        case 'getBannedUserRedirect': {
            const userId = state.bannedUserRedirects.get(sender.tab?.id);
            state.bannedUserRedirects.delete(sender.tab?.id);
            sendResponse({ userId });
            return false;
        }

        case 'getPrivateGameRedirect': {
            const placeId = state.privateGameRedirects.get(sender.tab?.id);
            state.privateGameRedirects.delete(sender.tab?.id);
            sendResponse({ placeId });
            return false;
        }

        case 'presencePollResult':
            return false;

        case 'getLatestPresence':
            sendResponse({ presence: state.latestPresence });
            return false;

        case 'wearOutfit':
            wearOutfit(request.outfitId).then(sendResponse);
            return true;

        case 'getCustomFontFamily':
            getCustomFontFamily(request.assetId)
                .then(sendResponse)
                .catch((err) => {
                    sendResponse({ success: false, error: err.message });
                });
            return true;

        case 'fetchImageAsDataUrl': {
            let imageUrl;
            try {
                imageUrl = new URL(request.url);
            } catch {
                sendResponse({ error: 'Invalid URL' });
                return false;
            }
            if (
                imageUrl.protocol !== 'https:' &&
                imageUrl.protocol !== 'http:'
            ) {
                sendResponse({ error: 'Unsupported protocol' });
                return false;
            }
            //Verified
            fetch(imageUrl.toString(), { credentials: 'omit' })
                .then(async (response) => {
                    if (!response.ok) {
                        throw new Error(`Request failed (${response.status})`);
                    }
                    const bytes = new Uint8Array(await response.arrayBuffer());
                    if (bytes.length > 20 * 1024 * 1024) {
                        throw new Error('Image too large');
                    }
                    const contentType = (
                        response.headers.get('content-type') || ''
                    ).split(';')[0];
                    const imageType = contentType.startsWith('image/')
                        ? contentType
                        : getImageTypeFromBytes(bytes);
                    if (!imageType) throw new Error('Not an image');
                    let binary = '';
                    for (let i = 0; i < bytes.length; i += 0x8000) {
                        binary += String.fromCharCode(
                            ...bytes.subarray(i, i + 0x8000),
                        );
                    }
                    sendResponse({
                        dataUrl: `data:${imageType};base64,${btoa(binary)}`,
                    });
                })
                .catch((err) => sendResponse({ error: err.message }));
            return true;
        }

        case 'proxyFetch': {
            let parsedUrl;
            try {
                parsedUrl = new URL(request.url);
            } catch {
                sendResponse({ error: 'Invalid URL' });
                return false;
            }
            if (
                parsedUrl.protocol !== 'https:' &&
                parsedUrl.protocol !== 'http:'
            ) {
                sendResponse({ error: 'Unsupported protocol' });
                return false;
            }
            const { method, headers, body, credentials, cache, redirect } =
                request.options || {};
            //Verified
            fetch(parsedUrl.toString(), {
                method,
                headers,
                body,
                credentials,
                cache,
                redirect,
            })
                .then(async (response) => {
                    const responseHeaders = {};
                    response.headers.forEach(
                        (val, key) => (responseHeaders[key] = val),
                    );
                    sendResponse({
                        status: response.status,
                        statusText: response.statusText,
                        headers: responseHeaders,
                        body: await response.arrayBuffer().catch(() => null),
                    });
                })
                .catch((err) => sendResponse({ error: err.message }));
            return true;
        }

        case 'fetchRobloxApi':
            callRobloxApiBackground(request.options)
                .then(async (response) => {
                    const headers = {};
                    response.headers.forEach(
                        (val, key) => (headers[key] = val),
                    );
                    const body =
                        request.options?.responseType === 'arrayBuffer'
                            ? await response.arrayBuffer().catch(() => null)
                            : await response.text().catch(() => null);
                    sendResponse({
                        ok: response.ok,
                        status: response.status,
                        statusText: response.statusText,
                        headers: headers,
                        body: body,
                    });
                })
                .catch((err) => {
                    console.error('RoValra: Background API fetch failed', err);
                    sendResponse({
                        ok: false,
                        status: 500,
                        statusText: 'Extension Error',
                        body: null,
                    });
                });
            return true;

        case 'updateContextMenu':
            if (chrome.contextMenus) {
                if (request.feature === 'copyid') {
                    chrome.storage.local.get(
                        ['copyIdEnabled', 'copyUniverseIdEnabled'],
                        (settings) => {
                            chrome.contextMenus.removeAll(() => {
                                if (
                                    !chrome.runtime.lastError &&
                                    request.ids?.length > 0
                                ) {
                                    request.ids.forEach((item) => {
                                        if (item.type === 'Universe') {
                                            if (
                                                settings.copyUniverseIdEnabled
                                            ) {
                                                chrome.contextMenus.create({
                                                    id: `rovalra-copy-universe-${item.id}`,
                                                    title: item.title,
                                                    contexts: ['link'],
                                                    documentUrlPatterns: [
                                                        '*://*.roblox.com/*',
                                                    ],
                                                });
                                            }
                                        } else {
                                            if (settings.copyIdEnabled) {
                                                chrome.contextMenus.create({
                                                    id: `rovalra-copy-${item.id}`,
                                                    title: item.title,
                                                    contexts: ['link'],
                                                    documentUrlPatterns: [
                                                        '*://*.roblox.com/*',
                                                    ],
                                                });
                                            }
                                        }
                                    });
                                }
                            });
                        },
                    );
                } else if (request.feature === 'viewid') {
                    request.ids.forEach((id) => {
                        chrome.storage.local.get(
                            ['viewIdEnabled'],
                            (settings) => {
                                if (settings.viewIdEnabled) {
                                    chrome.contextMenus.create({
                                        id: `rovalra-viewid-${id}`,
                                        title: request.data.title,
                                        contexts: ['link'],
                                        documentUrlPatterns: [
                                            '*://*.roblox.com/*',
                                        ],
                                    });
                                }
                            },
                        );
                    });
                }
            }
            return false;
    }
    return false;
});

// --- Initialization ---

chrome.storage.local.get('MemoryleakFixEnabled', (result) => {
    if (result.MemoryleakFixEnabled) {
        state.isMemoryFixEnabled = true;
        setupNavigationListener();
    }
});

updateUserAgentRule();
updateAvatarRotator();
setupContextMenuListener();
updateBannedUserListener();
updatePrivateGameListener();
setupNotifications(callRobloxApiBackground);
