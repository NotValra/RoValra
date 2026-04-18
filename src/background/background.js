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
    rotatorIndex: 0,
    bannedUserRedirects: new Map(),
    privateGameRedirects: new Map(),
    scanningUsers: new Set(),
    transactionInterval: null,
};

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
                { bannedUserDetectionEnabled: false },
                (data) => {
                    if (data.bannedUserDetectionEnabled) {
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
                { privateGameDetectionEnabled: true },
                (data) => {
                    if (data.privateGameDetectionEnabled) {
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
    } = options;

    const separator = endpoint.includes('?') ? '&' : '?';
    let url = `https://${subdomain}.roblox.com${endpoint}`;

    if (!endpoint.includes('/player-hydration-service/v1/players/signed')) {
        url += `${separator}_RoValraRequest=`;
    }

    const fetchOptions = { method, headers: { ...headers } };

    if (body) {
        if (typeof body === 'object') {
            fetchOptions.headers['Content-Type'] = 'application/json';
            fetchOptions.body = JSON.stringify(body);
        } else {
            fetchOptions.body = body;
        }
    }

    if (method !== 'GET' && method !== 'HEAD' && state.csrfTokenCache) {
        fetchOptions.headers['X-CSRF-TOKEN'] = state.csrfTokenCache;
    }

    let response = await fetch(url, fetchOptions); //Verified

    if (response.status === 403 && method !== 'GET' && method !== 'HEAD') {
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

        const detailsRes = await callWithRetry({
            subdomain: 'avatar',
            endpoint: `/v3/outfits/${outfitId}/details`,
        });
        if (!detailsRes?.ok) return { ok: false };

        const details = await detailsRes.json();
        const promises = [];

        if (details.assets)
            promises.push(
                callWithRetry({
                    subdomain: 'avatar',
                    endpoint: '/v2/avatar/set-wearing-assets',
                    method: 'POST',
                    body: { assets: details.assets },
                }),
            );
        if (details.playerAvatarType)
            promises.push(
                callWithRetry({
                    subdomain: 'avatar',
                    endpoint: '/v1/avatar/set-player-avatar-type',
                    method: 'POST',
                    body: { playerAvatarType: details.playerAvatarType },
                }),
            );
        if (details.scale)
            promises.push(
                callWithRetry({
                    subdomain: 'avatar',
                    endpoint: '/v1/avatar/set-scales',
                    method: 'POST',
                    body: details.scale,
                }),
            );

        if (details.bodyColor3s) {
            promises.push(
                callWithRetry({
                    subdomain: 'avatar',
                    endpoint: '/v2/avatar/set-body-colors',
                    method: 'POST',
                    body: details.bodyColor3s,
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

// --- Transaction Tracking ---

const TRANSACTIONS_DATA_KEY = 'rovalra_transactions_data';
const TRANSACTION_REFRESH_DURATION = 5 * 60 * 1000;
const TRANSACTION_REQUEST_DELAY = 5000;

async function fetchTransactionsPage(userId, cursor = null) {
    let endpoint = `/transaction-records/v1/users/${userId}/transactions?limit=100&transactionType=Purchase&itemPricingType=PaidAndLimited`;
    if (cursor) endpoint += `&cursor=${encodeURIComponent(cursor)}`;

    while (true) {
        try {
            const response = await callRobloxApiBackground({
                subdomain: 'apis',
                endpoint: endpoint,
            });

            if (response.status === 429) {
                await new Promise((resolve) => setTimeout(resolve, 10000));
                continue;
            }

            if (!response.ok) return null;
            return await response.json();
        } catch (error) {
            console.error('RoValra: Failed to fetch transactions page', error);
            return null;
        }
    }
}

function processTransaction(transaction) {
    const base = {
        amount: Math.abs(transaction.currency.amount),
        purchaseToken: transaction.purchaseToken,
        creatorId: transaction.agent.id,
        creatorType: transaction.agent.type,
        creatorName: transaction.agent.name,
    };

    if (transaction.details.place) {
        return {
            ...base,
            universeId: transaction.details.place.universeId,
            gameName: transaction.details.place.name,
        };
    }
    return base;
}

function mergeTransactionsIntoAggregated(existingAggregated, rawTransactions) {
    const updated = existingAggregated || {
        totals: { totalSpent: 0, totalTransactions: 0 },
        creators: {},
    };

    rawTransactions.forEach((tx) => {
        const processed = processTransaction(tx);

        updated.totals.totalSpent += processed.amount;
        updated.totals.totalTransactions += 1;

        const creatorKey = String(processed.creatorId);
        if (!updated.creators[creatorKey]) {
            updated.creators[creatorKey] = {
                name: processed.creatorName,
                type: processed.creatorType,
                totalSpent: 0,
                totalTransactions: 0,
                games: {},
            };
        }

        const creator = updated.creators[creatorKey];
        creator.name = processed.creatorName || creator.name;
        creator.totalSpent += processed.amount;
        creator.totalTransactions += 1;

        if (processed.universeId) {
            if (!creator.games[processed.universeId]) {
                creator.games[processed.universeId] = {
                    name: processed.gameName,
                    totalSpent: 0,
                    totalTransactions: 0,
                };
            }
            const game = creator.games[processed.universeId];
            game.totalSpent += processed.amount;
            game.totalTransactions += 1;
        }
    });

    return updated;
}

async function handleBackgroundTransactionScan(userId) {
    const settings = await chrome.storage.local.get({
        TotalSpentGamesEnabled: true,
    });
    if (!settings.TotalSpentGamesEnabled) return;

    if (state.scanningUsers.has(userId)) return;
    state.scanningUsers.add(userId);

    try {
        const storage = await chrome.storage.local.get([TRANSACTIONS_DATA_KEY]);
        const allData = storage[TRANSACTIONS_DATA_KEY] || {};
        const userData = allData[userId] || {};

        const now = Date.now();
        if (userData.isFullyScanned) {
            const lastCheck =
                userData.lastIncrementalCheck || userData.lastFullScan || 0;
            if (now - lastCheck < TRANSACTION_REFRESH_DURATION) return;

            await runTransactionLoop(userId, userData, true);
        } else {
            await runTransactionLoop(userId, userData, false);
        }
    } finally {
        state.scanningUsers.delete(userId);
    }
}

async function runTransactionLoop(userId, existingData, isIncremental) {
    let cursor = isIncremental ? null : existingData.scanCursor || null;
    let pagesChecked = 0;
    let foundMatch = false;
    let emptyPageCount = 0;
    const seenTokens = new Set();

    let currentAggregated = {
        totals: existingData.totals || { totalSpent: 0, totalTransactions: 0 },
        creators: existingData.creators || {},
        latestPurchaseTokens: existingData.latestPurchaseTokens || [],
    };

    while (true) {
        const data = await fetchTransactionsPage(userId, cursor);
        if (!data) break;

        if (!data.data || data.data.length === 0) {
            emptyPageCount++;
            if (emptyPageCount >= 3 || !data.nextPageCursor) break;
            cursor = data.nextPageCursor;
            continue;
        }
        emptyPageCount = 0;

        const newBatch = [];
        for (const tx of data.data) {
            if (seenTokens.has(tx.purchaseToken)) continue;
            seenTokens.add(tx.purchaseToken);

            if (
                isIncremental &&
                currentAggregated.latestPurchaseTokens.includes(
                    tx.purchaseToken,
                )
            ) {
                foundMatch = true;
                break;
            }
            newBatch.push(tx);
        }

        currentAggregated = mergeTransactionsIntoAggregated(
            currentAggregated,
            newBatch,
        );

        if (pagesChecked === 0) {
            const firstTokens = data.data
                .slice(0, 2)
                .map((tx) => tx.purchaseToken);
            currentAggregated.latestPurchaseTokens = [
                ...new Set([
                    ...firstTokens,
                    ...currentAggregated.latestPurchaseTokens,
                ]),
            ].slice(0, 2);
        }

        cursor = data.nextPageCursor;
        pagesChecked++;

        const storage = await chrome.storage.local.get([TRANSACTIONS_DATA_KEY]);
        const allData = storage[TRANSACTIONS_DATA_KEY] || {};
        allData[userId] = {
            ...existingData,
            ...currentAggregated,
            latestPurchaseToken: currentAggregated.latestPurchaseTokens[0],
            scanCursor: isIncremental ? null : cursor,
            isFullyScanned: isIncremental || !cursor,
            isScanning: !isIncremental && !!cursor,
            [isIncremental ? 'lastIncrementalCheck' : 'lastFullScan']:
                Date.now(),
        };
        await chrome.storage.local.set({ [TRANSACTIONS_DATA_KEY]: allData });

        if (!cursor || foundMatch || (isIncremental && pagesChecked >= 5))
            break;
        await new Promise((r) => setTimeout(r, TRANSACTION_REQUEST_DELAY));
    }

    if (isIncremental && !foundMatch && pagesChecked >= 5) {
        await runTransactionLoop(userId, currentAggregated, false);
    }
}

// --- Event Listeners ---

chrome.runtime.onInstalled.addListener((details) => {
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
        if (changes.privateGameDetectionEnabled) {
            updatePrivateGameListener();
        }
        if (changes.bannedUserDetectionEnabled) {
            updateBannedUserListener();
        }
        if (changes.TotalSpentGamesEnabled) {
            if (changes.TotalSpentGamesEnabled.newValue === false) {
                if (state.transactionInterval) {
                    clearInterval(state.transactionInterval);
                    state.transactionInterval = null;
                }
            } else if (state.currentUserId) {
                handleBackgroundTransactionScan(state.currentUserId);
                if (state.transactionInterval)
                    clearInterval(state.transactionInterval);
                state.transactionInterval = setInterval(() => {
                    handleBackgroundTransactionScan(state.currentUserId);
                }, TRANSACTION_REFRESH_DURATION);
            }
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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
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

                if (state.transactionInterval) {
                    clearInterval(state.transactionInterval);
                    state.transactionInterval = null;
                }

                chrome.storage.local.get(
                    { TotalSpentGamesEnabled: true },
                    (settings) => {
                        if (settings.TotalSpentGamesEnabled) {
                            handleBackgroundTransactionScan(
                                state.currentUserId,
                            );
                            state.transactionInterval = setInterval(() => {
                                handleBackgroundTransactionScan(
                                    state.currentUserId,
                                );
                            }, TRANSACTION_REFRESH_DURATION);
                        }
                    },
                );
            }
            return false;

        case 'triggerTransactionScan':
            handleBackgroundTransactionScan(request.userId);
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

        case 'fetchRobloxApi':
            callRobloxApiBackground(request.options)
                .then(async (response) => {
                    const headers = {};
                    response.headers.forEach(
                        (val, key) => (headers[key] = val),
                    );
                    const body = await response.text().catch(() => null);
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
                                        if (settings.copyUniverseIdEnabled) {
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
