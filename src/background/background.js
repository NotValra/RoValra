
function getDefaultSettings() {
    // This object should be kept in sync with the defaults in settingConfig.js
    return {
        hiddenCatalogEnabled: false,
        itemSalesEnabled: false,
        groupGamesEnabled: true,
        userGamesEnabled: true,
        userSniperEnabled: true,
        privateInventoryEnabled: true,
        PreferredRegionEnabled: true,
        robloxPreferredRegion: 'AUTO',
        subplacesEnabled: true,
        forceR6Enabled: true,
        inviteEnabled: true,
        pendingRobuxEnabled: false,
        ServerdataEnabled: true,
        revertLogo: false,
        customLogoData: null,
        botdataEnabled: true,
        showfullserveridEnabled: true,
        BanReasons: true,
        enableFriendservers: true,
        bandurationsEnabled: true,
        appealstuff: true,
        privateserverlink: true,
        pendingrobuxtrans: false,
        serverUptimeServerLocationEnabled: true,
        ServerlistmodificationsEnabled: true,
        TotalServersEnabled: true,
        ServerFilterEnabled: true,
        cssfixesEnabled: true,
        RoValraBadgesEnable: true,
        ShowBadgesEverywhere: false,
        QuickPlayEnable: true,
        PrivateServerBulkEnabled: true,
        GameVersionEnabled: true,
        OldestVersionEnabled: true,
        donationbuttonEnable: false,
        spoofAsStudio: false,
        spoofAsOffline: false,
        useroutfitsEnabled: true,
        avatarFiltersEnabled: true,
        searchbarEnabled: true,
        privateservers: true,
        playbuttonpreferredregionenabled: true,
        robloxPreferredRegionEnabled: false,
        AutoFindRegion: true,
        RobuxPlaceId: null,
        impersonateRobloxStaffSetting: false,
        whatamIJoiningEnabled: true,
        AlwaysGetInfo: true,
        antibotsEnabled: false,
        QuickActionsEnabled: true,
        userRapEnabled: true,
        HideSerial: false,
        EarlyAccessProgram: false,
        MemoryleakFixEnabled: false, 
        deeplinkEnabled: false, 
        eastereggslinksEnabled: true,
        giantInvisibleLink: true,
        SaveLotsRobuxEnabled: true,
        simulateRoValraServerErrors: false,
        onboardingShown: false,
        totalspentEnabled: true,
        enableShareLink: true,
        EnableServerUptime: true,
        EnableServerRegion: true,
        EnablePlaceVersion: true,
        EnableFullServerID: true,
        EnableServerPerformance: true,
        EnableMiscIndicators: true,
        EnableItemDependencies: true,
        EnablebannerTest: false,
        EnableVideoTest: false,
        EnableGameTrailer: false,
        Enableautoplay: true,
        alwaysShowDeveloperSettings: false,
        streamermode: false,
        settingsPageInfo: true,
        hideRobux: false,
        RegionFiltersEnabled: true,
        UptimeFiltersEnabled: true,
        VersionFiltersEnabled: true,
        totalearnedEnabled: true
    };
}


function initializeSettings(reason) {
    const defaults = getDefaultSettings();

    chrome.storage.local.get(null, (currentSettings) => {
        const settingsToUpdate = {};
        let needsUpdate = false;
        
        for (const key in defaults) {
            const defaultValue = defaults[key];
            const storedValue = currentSettings[key];

            if (storedValue === undefined) {
                settingsToUpdate[key] = defaultValue;
                needsUpdate = true;
                continue; 
            }


            if (defaultValue !== null) {
                const defaultType = typeof defaultValue;
                const storedType = typeof storedValue;


                if (storedValue === null) {
                    console.warn(`RoValra: Setting '${key}' was null but expected ${defaultType}. Resetting to default.`);
                    settingsToUpdate[key] = defaultValue;
                    needsUpdate = true;
                    continue;
                }

                if (storedType !== defaultType) {
                    console.warn(`RoValra: Type mismatch for '${key}'. Expected ${defaultType}, got ${storedType}. Resetting to default.`);
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
        } else {
        }
    });
}


chrome.runtime.onInstalled.addListener((details) => {
    initializeSettings(details.reason);
});


chrome.runtime.onStartup.addListener(() => {
    initializeSettings("startup");
});

chrome.storage.onChanged.addListener((changes) => {
    if (changes.MemoryleakFixEnabled) { 
        isMemoryFixEnabled = changes.MemoryleakFixEnabled.newValue; 
        if (isMemoryFixEnabled) setupNavigationListener();
    }
});


let isMemoryFixEnabled = false;
const programmaticallyNavigatedUrls = new Set(); 

const handleMemoryLeakNavigation = (details) => {
    if (programmaticallyNavigatedUrls.has(details.url)) {
        programmaticallyNavigatedUrls.delete(details.url);
        return;
    }

    if (details.frameId !== 0 || details.transitionType === 'auto_subframe' || details.transitionType === 'reload') {
        return;
    }

    const newUrl = details.url;
    const tabId = details.tabId;


    programmaticallyNavigatedUrls.add(newUrl);

    chrome.tabs.update(tabId, { url: 'about:blank' }, () => {
        setTimeout(() => {
            chrome.tabs.update(tabId, { url: newUrl });
        }, 50); 
    });
};

const navigationFilter = {
    url: [{ hostContains: ".roblox.com" }],
    urlExcludes: ["roblox-player:*"] 
};

const navigationListener = (details) => {
    if (isMemoryFixEnabled) { 
        handleMemoryLeakNavigation(details);
    }
};

async function setupNavigationListener() {
    const hasRequiredPermissions = await chrome.permissions.contains({ permissions: ['webNavigation'] });
    if (hasRequiredPermissions && !chrome.webNavigation.onBeforeNavigate.hasListener(navigationListener)) {
        chrome.webNavigation.onBeforeNavigate.addListener(navigationListener, navigationFilter);
    }
}

chrome.permissions.onAdded.addListener((permissions) => {
    if (permissions.permissions?.includes('webNavigation')) {
        setupNavigationListener(); 
    }
});

chrome.permissions.onRemoved.addListener((permissions) => {
    if (permissions.permissions?.includes('webNavigation') && chrome.webNavigation.onBeforeNavigate.hasListener(navigationListener)) {
        chrome.webNavigation.onBeforeNavigate.removeListener(navigationListener);
    }
});
const connectedContentScripts = new Map(); 

chrome.runtime.onConnect.addListener(port => {
    if (port.name !== 'mutation-reporter') {
        return; 
    }


    let contentScriptUUID; 

    port.onMessage.addListener(message => {
        if (message.type === 'init_connection' && message.uuid) {
            contentScriptUUID = message.uuid;
            connectedContentScripts.set(contentScriptUUID, port);
        } 
        else {
        }
    });


    port.onDisconnect.addListener(() => {
        if (contentScriptUUID && connectedContentScripts.has(contentScriptUUID)) {
            connectedContentScripts.delete(contentScriptUUID);
        }
    });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
        case 'updateOfflineRule':
            chrome.declarativeNetRequest.updateEnabledRulesets(request.enabled ? { enableRulesetIds: ["ruleset_status"] } : { disableRulesetIds: ["ruleset_status"] });
            sendResponse({ success: true });
            break;

        case 'updateEarlyAccessRule':
            chrome.declarativeNetRequest.updateEnabledRulesets(request.enabled ? { enableRulesetIds: ["ruleset_3"] } : { disableRulesetIds: ["ruleset_3"] });
            sendResponse({ success: true });
            break;

        case 'enableServerJoinHeaders':
            chrome.declarativeNetRequest.updateEnabledRulesets({ enableRulesetIds: ['ruleset_2'] });
            break;

        case 'disableServerJoinHeaders':
            chrome.declarativeNetRequest.updateEnabledRulesets({ disableRulesetIds: ['ruleset_2'] });
            break;


        case "injectScript":
            chrome.scripting.executeScript({
                target: { tabId: sender.tab.id },
                world: "MAIN",
                func: (codeToInject) => {
                    try {
                        const script = document.createElement('script');
                        script.textContent = codeToInject;
                        document.documentElement.appendChild(script);
                        script.remove();
                    } catch (error) {
                    }
                },
                args: [request.codeToInject],
            }).then(() => sendResponse({ success: true }))
              .catch((error) => sendResponse({ success: false, error: error.message }));
            return true; 

        case "fetchItemData":
            fetch("URL_GOES_HERE").then(response => response.json())
                .then(data => sendResponse({ success: true, data: data }))
                .catch(error => sendResponse({ success: false, message: error.message }));
            return true; 
            
        case "fetchHiddenGames":
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs.length > 0) {
                    chrome.tabs.sendMessage(tabs[0].id, request, (response) => {
                        if (chrome.runtime.lastError) {
                            console.warn("Could not send message to content script:", chrome.runtime.lastError.message);
                            sendResponse({ success: false, error: "Content script not ready." });
                        } else {
                            sendResponse(response);
                        }
                    });
                } else {
                    sendResponse({ success: false, error: "No active tab found." });
                }
            });
            return true; 

        case 'toggleMemoryLeakFix':
            isMemoryFixEnabled = request.enabled;
            sendResponse({ success: true }); 
            break;

        case 'injectMainWorldScript':
            if (sender.tab?.id) {
                chrome.scripting.executeScript({
                    target: { tabId: sender.tab.id },
                    files: [request.path],
                    world: 'MAIN',
                });
            }
            sendResponse({ success: true });
            break;

        case 'checkPermission':
            const permissionsToCheck = Array.isArray(request.permission) ? request.permission : [request.permission];
            chrome.permissions.contains({ permissions: permissionsToCheck }, (granted) => {
                sendResponse({ granted: granted });
            });
            return true; 

        case 'requestPermission':
            const permissionsToRequest = Array.isArray(request.permission) ? request.permission : [request.permission];
            chrome.permissions.request({ permissions: permissionsToRequest }, (granted) => {
                if (chrome.runtime.lastError) {
                    sendResponse({ granted: false });
                } else {
                    sendResponse({ granted: granted });
                }
            });
            return true; 

        case 'revokePermission':
            const permissionsToRevoke = Array.isArray(request.permission) ? request.permission : [request.permission];
            chrome.permissions.remove({ permissions: permissionsToRevoke }, (removed) => {
                if (chrome.runtime.lastError) {
                    sendResponse({ revoked: false, error: chrome.runtime.lastError.message });
                } else {
                    if (removed) {
                    } else {
                    }
                    sendResponse({ revoked: removed });
                }
            });
            return true; 
        
    }
    return [
        "injectScript", "fetchItemData", "fetchHiddenGames"
    ].includes(request.action);
});

chrome.storage.local.get('MemoryleakFixEnabled', (result) => {
    if (result.MemoryleakFixEnabled) {
        isMemoryFixEnabled = true;
    }
    setupNavigationListener();
});