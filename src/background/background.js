import { SETTINGS_CONFIG } from '../content/core/settings/settingConfig.js';

// --- Constants & State ---

const state = {
    isMemoryFixEnabled: false,
    programmaticallyNavigatedUrls: new Set(),
    currentUserId: null,
    latestPresence: null,
    pollingInterval: null,
    csrfTokenCache: null,
    rotatorInterval: null,
    rotatorIndex: 0
};

// --- Settings Management ---

function getDefaultSettings() {
    const defaults = {};
    for (const category of Object.values(SETTINGS_CONFIG)) {
        for (const [settingName, settingDef] of Object.entries(category.settings)) {
            if (settingDef.default !== undefined) {
                defaults[settingName] = settingDef.default;
            }
            if (settingDef.childSettings) {
                for (const [childName, childSettingDef] of Object.entries(settingDef.childSettings)) {
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

    chrome.storage.local.get(null, (currentSettings) => {
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
                    console.warn(`RoValra: Setting '${key}' was null but expected ${defaultType}. Resetting.`);
                    settingsToUpdate[key] = defaultValue;
                    needsUpdate = true;
                } else if (storedType !== defaultType) {
                    console.warn(`RoValra: Type mismatch for '${key}'. Expected ${defaultType}, got ${storedType}. Resetting.`);
                    settingsToUpdate[key] = defaultValue;
                    needsUpdate = true;
                }
            }
        }

        if (needsUpdate) {
            chrome.storage.local.set(settingsToUpdate, () => {
                if (chrome.runtime.lastError) {
                    console.error('RoValra: Failed to sync settings.', chrome.runtime.lastError);
                } else {
                    console.log(`RoValra: Synced/Fixed ${Object.keys(settingsToUpdate).length} settings (Trigger: ${reason}).`);
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

    if (originalUA.includes("Firefox/")) { browser = "Firefox"; engine = "Gecko"; }
    else if (originalUA.includes("Edg/")) { browser = "Edge"; engine = "Chromium"; }
    else if (originalUA.includes("OPR/") || originalUA.includes("Opera/")) { browser = "Opera"; engine = "Chromium"; }
    else if (originalUA.includes("Chrome/")) { browser = "Chrome"; engine = "Chromium"; }
    else if (originalUA.includes("Safari/")) { browser = "Safari"; engine = "WebKit"; }

    const manifest = chrome.runtime.getManifest();
    const version = manifest.version || 'Unknown';
    const isDevelopment = !('update_url' in manifest);
    const environment = isDevelopment ? 'Development' : 'Production';

    let rovalraSuffix = `RoValraExtension(RoValra/${browser}/${engine}/${version}/${environment})`;
    if (engine === "Gecko" || engine === "WebKit") {
        rovalraSuffix += " UnofficialRoValraVersion"; // If you are developing a port for either of these don't remove this. It tells Roblox that I don't control requests coming from your port.
    }

    const rules = [
        {
            id: 999,
            priority: 5,
            action: {
                type: 'modifyHeaders',
                requestHeaders: [{ header: 'User-Agent', operation: 'set', value: `${originalUA} ${rovalraSuffix}` }]
            },
            condition: { regexFilter: ".*_RoValraRequest=", resourceTypes: ["xmlhttprequest"] }
        },
        {
            id: 1000,
            priority: 10,
            action: {
                type: 'modifyHeaders',
                requestHeaders: [{ header: 'User-Agent', operation: 'set', value: `Roblox/WinInet ${rovalraSuffix}` }]
            },
            condition: { regexFilter: "^https://gamejoin\\.roblox\\.com/.*_RoValraRequest=", resourceTypes: ["xmlhttprequest"] }
        }
    ];

    chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [999, 1000],
        addRules: rules
    });
}

// --- Memory Leak Fix ---

const handleMemoryLeakNavigation = (details) => {
    if (state.programmaticallyNavigatedUrls.has(details.url)) {
        state.programmaticallyNavigatedUrls.delete(details.url);
        return;
    }

    if (details.frameId !== 0 || details.transitionType === 'auto_subframe' || details.transitionType === 'reload') {
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
    const hasRequiredPermissions = await chrome.permissions.contains({ permissions: ['webNavigation'] });
    if (hasRequiredPermissions && !chrome.webNavigation.onBeforeNavigate.hasListener(navigationListener)) {
        chrome.webNavigation.onBeforeNavigate.addListener(navigationListener, {
            url: [{ hostContains: ".roblox.com" }],
            urlExcludes: ["roblox-player:*"]
        });
    }
}

// --- Context Menu ---

const contextMenuClickListener = async (info, tab) => {
    if (info.menuItemId.startsWith('rovalra-copy-universe-')) {
        const placeId = info.menuItemId.replace('rovalra-copy-universe-', '');
        const universeId = await getUniverseIdFromPlaceId(placeId);
        if (universeId && tab?.id) {
            chrome.tabs.sendMessage(tab.id, { action: 'copyToClipboard', text: String(universeId) });
        }
    } else if (info.menuItemId.startsWith('rovalra-copy-') && tab?.id) {
        const textToCopy = info.menuItemId.replace('rovalra-copy-', '');
        chrome.tabs.sendMessage(tab.id, { action: 'copyToClipboard', text: textToCopy });
    }
};

async function setupContextMenuListener() {
    const hasRequiredPermissions = await chrome.permissions.contains({ permissions: ['contextMenus'] });
    if (hasRequiredPermissions && chrome.contextMenus && !chrome.contextMenus.onClicked.hasListener(contextMenuClickListener)) {
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
    const { subdomain = 'api', endpoint, method = 'GET', body = null, headers = {} } = options;

    const separator = endpoint.includes('?') ? '&' : '?';
    const url = `https://${subdomain}.roblox.com${endpoint}${separator}_RoValraRequest=`;

    const fetchOptions = { method, headers: { ...headers } };

    if (body) {
        fetchOptions.headers['Content-Type'] = 'application/json';
        fetchOptions.body = JSON.stringify(body);
    }

    if (method !== 'GET' && method !== 'HEAD' && state.csrfTokenCache) {
        fetchOptions.headers['X-CSRF-TOKEN'] = state.csrfTokenCache;
    }

    let response = await fetch(url, fetchOptions); //Verified

    if (response.status === 403 && (method !== 'GET' && method !== 'HEAD')) {
        const newCsrf = response.headers.get('x-csrf-token');
        if (newCsrf) {
            state.csrfTokenCache = newCsrf;
            fetchOptions.headers['X-CSRF-TOKEN'] = newCsrf;
            response = await fetch(url, fetchOptions); //Verified
        }
    }

    return response;
}

async function wearOutfit(outfitId) {
    const callWithRetry = async (options) => {
        for (let i = 0; i < 4; i++) {
            const response = await callRobloxApiBackground(options);
            if (response.ok) return response;
            if (response.status === 429 || response.status >= 500) {
                if (i < 3) await new Promise(r => setTimeout(r, 1000));
                continue;
            }
            return response;
        }
    };

    try {
        const detailsRes = await callWithRetry({ subdomain: 'avatar', endpoint: `/v1/outfits/${outfitId}/details` });
        if (!detailsRes?.ok) return { ok: false };

        const details = await detailsRes.json();
        const promises = [];

        if (details.bodyColors) promises.push(callWithRetry({ subdomain: 'avatar', endpoint: '/v1/avatar/set-body-colors', method: 'POST', body: details.bodyColors }));
        if (details.assets) promises.push(callWithRetry({ subdomain: 'avatar', endpoint: '/v2/avatar/set-wearing-assets', method: 'POST', body: { assets: details.assets } }));
        if (details.playerAvatarType) promises.push(callWithRetry({ subdomain: 'avatar', endpoint: '/v1/avatar/set-player-avatar-type', method: 'POST', body: { playerAvatarType: details.playerAvatarType } }));
        if (details.scale) promises.push(callWithRetry({ subdomain: 'avatar', endpoint: '/v1/avatar/set-scales', method: 'POST', body: details.scale }));

        const results = await Promise.all(promises);
        return { ok: results.every(r => r?.ok) };
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

        chrome.tabs.query({ url: "*://*.roblox.com/*" }, (tabs) => {
            tabs.forEach(tab => chrome.tabs.sendMessage(tab.id, { action: 'presenceUpdate', presence: state.latestPresence }).catch(() => {}));
        });

        // Server History Logic
        const isJoiningGame = p => p && (p.userPresenceType === 2 || p.userPresenceType === 4);
        if (isJoiningGame(presence) && presence.gameId && presence.rootPlaceId) {
            if (!isJoiningGame(oldPresence) || oldPresence.gameId !== presence.gameId) {
                chrome.storage.local.get({ 'rovalra_server_history': {} }, (res) => {
                    const history = res.rovalra_server_history || {};
                    const gameId = presence.rootPlaceId.toString();
                    let gameHistory = history[gameId] || [];
                    const now = Date.now();
                    
                    gameHistory = gameHistory.filter(entry => (now - entry.timestamp) < 24 * 60 * 60 * 1000);
                    const serverIndex = gameHistory.findIndex(entry => entry.presence.gameId === presence.gameId);
                    if (serverIndex > -1) gameHistory.splice(serverIndex, 1);
                    
                    gameHistory.unshift({ presence, timestamp: now });
                    history[gameId] = gameHistory.slice(0, 4);
                    chrome.storage.local.set({ 'rovalra_server_history': history });
                });
            }
        }
    }
}

function pollUserPresence() {
    if (!state.currentUserId) return;

    chrome.storage.local.get({ recentServersEnabled: true }, async (settings) => {
        if (!settings.recentServersEnabled) return;

        try {
            const response = await callRobloxApiBackground({
                subdomain: 'presence',
                endpoint: '/v1/presence/users',
                method: 'POST',
                body: { userIds: [parseInt(state.currentUserId, 10)] }
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
    });
}

// --- Avatar Rotator ---

function updateAvatarRotator() {
    chrome.storage.local.get(['rovalra_avatar_rotator_enabled', 'rovalra_avatar_rotator_ids', 'rovalra_avatar_rotator_interval'], (data) => {
        if (state.rotatorInterval) {
            clearInterval(state.rotatorInterval);
            state.rotatorInterval = null;
        }

        if (data.rovalra_avatar_rotator_enabled && data.rovalra_avatar_rotator_ids?.length > 0) {
            const ids = data.rovalra_avatar_rotator_ids;
            state.rotatorIndex = 0;
            
            let intervalSeconds = Math.max(parseInt(data.rovalra_avatar_rotator_interval, 10) || 5, 5);
            
            const rotate = () => {
                if (ids.length === 0) return;
                const outfitId = ids[state.rotatorIndex];
                wearOutfit(outfitId);
                state.rotatorIndex = (state.rotatorIndex + 1) % ids.length;
            };

            rotate();
            state.rotatorInterval = setInterval(rotate, intervalSeconds * 1000);
        }
    });
}

// --- Event Listeners ---

chrome.runtime.onInstalled.addListener((details) => {
    initializeSettings(details.reason);
    updateUserAgentRule();
    setupContextMenuListener();
});

chrome.runtime.onStartup.addListener(() => {
    initializeSettings("startup");
    updateUserAgentRule();
    setupContextMenuListener();
});

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
        if (changes.MemoryleakFixEnabled) {
            state.isMemoryFixEnabled = changes.MemoryleakFixEnabled.newValue;
            if (state.isMemoryFixEnabled) setupNavigationListener();
        }
        if (changes.rovalra_avatar_rotator_enabled || changes.rovalra_avatar_rotator_ids || changes.rovalra_avatar_rotator_interval) {
            updateAvatarRotator();
        }
    }
});

chrome.permissions.onAdded.addListener((permissions) => {
    if (permissions.permissions?.includes('webNavigation')) setupNavigationListener();
    if (permissions.permissions?.includes('contextMenus')) setupContextMenuListener();
    
    chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => chrome.tabs.sendMessage(tab.id, { action: 'permissionsUpdated' }).catch(() => {}));
    });
});

chrome.permissions.onRemoved.addListener((permissions) => {
    if (permissions.permissions?.includes('webNavigation') && chrome.webNavigation.onBeforeNavigate.hasListener(navigationListener)) {
        chrome.webNavigation.onBeforeNavigate.removeListener(navigationListener);
    }
    if (permissions.permissions?.includes('contextMenus') && chrome.contextMenus?.onClicked.hasListener(contextMenuClickListener)) {
        chrome.contextMenus.onClicked.removeListener(contextMenuClickListener);
    }
    
    chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => chrome.tabs.sendMessage(tab.id, { action: 'permissionsUpdated' }).catch(() => {}));
    });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
        case 'updateOfflineRule':
            chrome.declarativeNetRequest.updateEnabledRulesets(
                request.enabled ? { enableRulesetIds: ["ruleset_status"] } : { disableRulesetIds: ["ruleset_status"] }
            );
            sendResponse({ success: true });
            return false;

        case 'updateEarlyAccessRule':
            chrome.declarativeNetRequest.updateEnabledRulesets(
                request.enabled ? { enableRulesetIds: ["ruleset_3"] } : { disableRulesetIds: ["ruleset_3"] }
            );
            sendResponse({ success: true });
            return false;

        case 'enableServerJoinHeaders':
            chrome.declarativeNetRequest.updateEnabledRulesets({ enableRulesetIds: ['ruleset_2'] });
            return false;

        case 'disableServerJoinHeaders':
            chrome.declarativeNetRequest.updateEnabledRulesets({ disableRulesetIds: ['ruleset_2'] });
            return false;

        case "injectScript":
            chrome.scripting.executeScript({
                target: { tabId: sender.tab.id },
                world: "MAIN",
                func: (code) => {
                    try {
                        const script = document.createElement('script');
                        script.textContent = code;
                        document.documentElement.appendChild(script);
                        script.remove();
                    } catch (e) {}
                },
                args: [request.codeToInject],
            }).then(() => sendResponse({ success: true }))
              .catch((err) => sendResponse({ success: false, error: err.message }));
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
            chrome.permissions.contains({ permissions: [].concat(request.permission) }, (granted) => {
                sendResponse({ granted });
            });
            return true;

        case 'requestPermission':
            chrome.permissions.request({ permissions: [].concat(request.permission) }, (granted) => {
                if (chrome.runtime.lastError) console.warn("RoValra: Permission request failed:", chrome.runtime.lastError);
                sendResponse({ granted: !!granted });
            });
            return true;

        case 'revokePermission':
            chrome.permissions.remove({ permissions: [].concat(request.permission) }, (removed) => {
                if (chrome.runtime.lastError) {
                    sendResponse({ revoked: false, error: chrome.runtime.lastError.message });
                } else {
                    sendResponse({ revoked: removed });
                }
            });
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

        case 'presencePollResult':
            return false;

        case 'getLatestPresence':
            sendResponse({ presence: state.latestPresence });
            return false;

        case 'wearOutfit':
            wearOutfit(request.outfitId).then(result => sendResponse(result));
            return true;

        case 'updateContextMenu':
            if (chrome.contextMenus) {
                chrome.storage.local.get(['copyIdEnabled', 'copyUniverseIdEnabled'], (settings) => {
                    chrome.contextMenus.removeAll(() => {
                        if (!chrome.runtime.lastError && request.ids?.length > 0) {
                            request.ids.forEach((item) => {
                                if (item.type === 'Universe') {
                                    if (settings.copyUniverseIdEnabled) {
                                        chrome.contextMenus.create({
                                            id: `rovalra-copy-universe-${item.id}`,
                                            title: 'Copy Universe ID',
                                            contexts: ['link'],
                                        });
                                    }
                                } else {
                                    if (settings.copyIdEnabled) {
                                        chrome.contextMenus.create({
                                            id: `rovalra-copy-${item.id}`,
                                            title: `Copy ${item.type} ID`,
                                            contexts: ['link'],
                                        });
                                    }
                                }
                            });
                        }
                    });
                });
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

updateAvatarRotator();
setupContextMenuListener();