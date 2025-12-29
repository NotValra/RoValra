import { getAssets } from '../../core/assets.js';
import { getRegionData, loadDatacenterMap, getFullRegionName } from '../../core/regions.js';
import DOMPurify from 'dompurify';
import { observeElement } from '../../core/observer.js';
import { generateSingleSettingHTML } from '../../core/settings/generateSettings.js';
import { SETTINGS_CONFIG } from '../../core/settings/settingConfig.js';
import { exportSettings, importSettings, createExportImportButtons } from '../../core/settings/portSettings.js';
import { 
    initSettings, 
    initializeSettingsEventListeners, 
    loadSettings, 
    handleSaveSettings, 
    updateConditionalSettingsVisibility, 
    buildSettingsKey 
} from '../../core/settings/handlesettings.js';
import { addCustomButton, addPopoverButton } from '../../core/settings/ui/settingsbutton.js';
import { checkRoValraPage } from '../../core/settings/ui/page.js';
import { callRobloxApi } from '../../core/api.js';



const assets = getAssets();
let REGIONS = {};



function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

function getLevenshteinDistance(a, b) {
    if (!a.length) return b.length;
    if (!b.length) return a.length;

    const matrix = Array.from({ length: b.length + 1 }, (_, j) => 
        Array.from({ length: a.length + 1 }, (_, i) => (j === 0 ? i : (i === 0 ? j : 0)))
    );

    for (let j = 1; j <= b.length; j++) {
        for (let i = 1; i <= a.length; i++) {
            const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[j][i] = Math.min(
                matrix[j][i - 1] + 1,
                matrix[j - 1][i] + 1,
                matrix[j - 1][i - 1] + indicator
            );
        }
    }
    return matrix[b.length][a.length];
}

export async function applyTheme() {
    if (document.body.classList.contains('rovalra-settings-loading')) {
        document.body.classList.remove('rovalra-settings-loading');
    }
}

const debouncedApplyTheme = debounce(applyTheme, 50);
const debouncedAddPopoverButton = debounce(addPopoverButton, 100);
const debouncedAddCustomButton = debounce(() => addCustomButton(debouncedAddPopoverButton), 100);



export const buttonData = [
    {
        text: "Info",
        content: `
            <div style="padding: 8px;">
                <h2 style="margin-bottom: 10px; color: var(--rovalra-main-text-color) !important;">RoValra Information!</h2>
                <p>RoValra is an extension that's trying to make basic quality of life features free and accessible to everyone, by making everything completely open-source.</p>
                <div style="margin-top: 5px;">
                    <p>This is possible by running almost everything locally.</p>
                    <div style="margin-top: 5px;">
                        <p>And the server side features doesn't cost me anything to run which is why I can afford to make this free.</p>
                        <div style="margin-top: 5px;">
                            <p>This extension is also a project to learn, so a lot of stuff might change or get reworked overtime as I learn more.</p>
                            <div style="margin-top: 5px;">
                                <p>WE ALL LOVE GILBERT</p>
                                <div style="margin-top: 5px;">
                                    <p>If you have any feature suggestions please let me know in my Discord server or via GitHub</p>
                                    <div style="margin-top: 5px;">
                                        <p>If you find any bugs let me know in my Discord server or via GitHub</p>
                                        <div style="margin-top: 5px;">
                                            <p>If you like this extension please consider <a href="https://chromewebstore.google.com/detail/rovalra-roblox-improved/njcickgebhnpgmoodjdgohkclfplejli/reviews" target="_blank" class="rovalra-review-link">leaving a review</a>, it helps a lot ❤️</p>
                                        </div>
                                        <div style="margin-top: 10px; margin-bottom: 20px;">
                                            <a href="https://discord.gg/GHd5cSKJRk" target="_blank" class="rovalra-discord-link">Discord Server</a>
                                            <a href="https://github.com/NotValra/RoValra" target="_blank" class="rovalra-github-link">
                                                Github Repo
                                                <img src="${assets.rovalraIcon}" style="width: 20px; height: 20px; margin-right: 0px; vertical-align: middle;" />
                                            </a>
                                            <a href="https://www.roblox.com/games/9676908657/Gamepasses#!/store" target="_blank" class="rovalra-roblox-link">Support Me on Roblox</a>
                                            <a href="https://www.tiktok.com/@valrawantbanana" target="_blank" class="rovalra-tiktok-link">TikTok: ValraWantBanana</a>
                                        </div>
                                        <div id="export-import-buttons-container" style="border-top: 1px solid var(--rovalra-secondary-text-color); opacity: 0.8; padding-top: 15px; display: flex; justify-content: flex-start; gap: 10px;"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`
    },
    {
        text: "Credits",
        content: `
            <div style="padding: 8px;">
                <h2 style="margin-bottom: 10px; color: var(--rovalra-main-text-color) !important;">RoValra Credits!</h2>
                <ul style="margin-top: 10px; padding-left: 0px; color: var(--rovalra-secondary-text-color);">
                    <li style="margin-bottom: 8px; list-style-type: disc; margin-left: 20px;">
                        Thanks to <b style="font-weight: bold;">everyone who</b>
                        <a href="https://github.com/NotValra/RoValra/graphs/contributors" target="_blank" class="rovalra-github-link">contributed</a>
                    </li>
                    <li style="margin-bottom: 8px; list-style-type: disc; margin-left: 20px;">
                        Thanks to <b style="font-weight: bold;">Frames</b> for somehow getting the Roblox sales and revenue on some items
                        <a href="https://github.com/workframes/roblox-owner-counts" target="_blank" class="rovalra-github-link">GitHub Repo</a>
                    </li>
                    <li style="margin-bottom: 8px; list-style-type: disc; margin-left: 20px;">
                        Thanks to <b style="font-weight: bold;">Julia</b> for making a repo with all Roblox server datacenters which I used to use to get the regions, but now I switched to my own api.
                        <a href="https://github.com/RoSeal-Extension/Top-Secret-Thing" target="_blank" class="rovalra-github-link">GitHub Repo</a>
                    </li>
                    <li style="margin-bottom: 8px; list-style-type: disc; margin-left: 20px;">
                         Thanks to <b style="font-weight: bold;">Aspect</b> for helping me out here and there when I had a bunch of dumb questions or problems.
                         <a href="https://github.com/Aspectise" target="_blank" class="rovalra-github-link">GitHub</a>
                    </li>
                    <li style="margin-bottom: 8px; list-style-type: disc; margin-left: 20px;">
                         Thanks to <b style="font-weight: bold;">l5se</b> for allowing me to use their open source region selector as a template for my extension.
                    </li>
                    <li style="margin-bottom: 8px; list-style-type: disc; margin-left: 20px;">
                        Thanks to <b style="font-weight: bold;">7_lz</b> for helping me a bunch when preparing for the Chrome Web Store release. They helped a ton and I'm very thankful.
                    </li>
                    <li style="margin-bottom: 8px; list-style-type: disc; margin-left: 20px;">
                        Thanks to <b style="font-weight: bold;">mmfw</b> for making the screenshots on the chrome web store, and general help with UI design of the extension.
                    </li>
                    <li style="margin-bottom: 8px; list-style-type: disc; margin-left: 20px;">
                        Thanks to <b style="font-weight: bold;">Coweggs</b> for coming up with the very funny name that is "RoValra" as a joke that I then ended up using.
                    </li>
                    <li style="margin-bottom: 8px; list-style-type: disc; margin-left: 20px;">
                        Thanks to <b style="font-weight: bold;">WoozyNate</b> for making the amazing game called fisch, which is where Gilbert (the logo) is from <3
                    </li>
                </ul>
            </div>`
    },
    {
        text: "Settings",
        content: `
            <div id="settings-content" style="padding: 0; background-color: transparent;">
                <div id="setting-section-buttons" style="display: flex; margin-bottom: 25px;"></div>
                <div id="setting-section-content" style="padding: 5px;"></div>
            </div>`
    }
];



function handleGlobalDomChange(event) {
    if (document.getElementById('settings-popover-menu')) {
        addPopoverButton();
    } else if (window.rovalraPopoverButtonAdded) {
        window.rovalraPopoverButtonAdded = false;
    }

    debouncedAddCustomButton();
    debouncedAddPopoverButton();

    const mutationsList = event.detail?.mutationsList;
    if (!mutationsList) return;

    const shouldUpdateTheme = mutationsList.some(mutation => 
        mutation.type === 'childList' && 
        mutation.addedNodes.length > 0 &&
        Array.from(mutation.addedNodes).some(node => 
            node.nodeType === Node.ELEMENT_NODE && 
            (node.matches('[data-theme-dependent], .setting, .menu-option, #content-container') || 
             node.querySelector('[data-theme-dependent], .setting, .menu-option, #content-container'))
        )
    );

    if (shouldUpdateTheme) {
        debouncedApplyTheme();
    }
}

export async function updateContent(buttonInfo, contentContainer) {
    if (typeof buttonInfo !== 'object' || buttonInfo === null || !buttonInfo.content) return;

    const lowerText = buttonInfo.text.toLowerCase();
    const sanitizeConfig = { ADD_URI_SCHEMES: ['chrome-extension'] };

    if (lowerText === "info" || lowerText === "credits") {
        contentContainer.innerHTML = `
            <div id="settings-content" style="padding: 0; background-color: transparent !important;"> 
                <div id="setting-section-content" style="padding: 5px;"> 
                    <div id="info-credits-background-wrapper" class="setting" style="margin-bottom: 15px;">
                        ${buttonInfo.content}
                    </div> 
                </div> 
            </div>`, sanitizeConfig;
    } else {
        contentContainer.innerHTML = DOMPurify.sanitize(buttonInfo.content, sanitizeConfig);
    }

    if (lowerText === "info") {
        const buttonContainer = contentContainer.querySelector('#export-import-buttons-container');
        if (buttonContainer) {
            buttonContainer.appendChild(createExportImportButtons());
        }
    }

    const rovalraHeader = document.querySelector('#react-user-account-base > h1');
    if (rovalraHeader) {
        rovalraHeader.style.setProperty('color', 'var(--rovalra-main-text-color)', 'important');
    }
}

export async function handleSearch(event) {
    const query = (event.target && event.target.value) ? event.target.value.toLowerCase().trim() : '';
    
    const contentContainer = document.querySelector('#content-container');
    if (!contentContainer) return;

    document.querySelectorAll('#unified-menu .menu-option-content').forEach(el => {
        el.classList.remove('active');
        el.removeAttribute('aria-current');
    });

    if (query.length < 2) {
        contentContainer.innerHTML = DOMPurify.sanitize(`<div id="settings-content" style="padding: 15px; text-align: center; color: var(--rovalra-main-text-color);">Please enter at least 2 characters to search.</div>`);
        await applyTheme();
        return;
    }

    const searchResults = [];
    const queryNoSpaces = query.replace(/\s+/g, '');

    for (const categoryName in SETTINGS_CONFIG) {
        const category = SETTINGS_CONFIG[categoryName];
        for (const [settingName, settingDef] of Object.entries(category.settings)) {
            const label = (Array.isArray(settingDef.label) ? settingDef.label.join(' ') : settingDef.label || '').toLowerCase();
            const description = (Array.isArray(settingDef.description) ? settingDef.description.join(' ') : settingDef.description || '').toLowerCase();
            const fullText = `${label} ${description}`;
            
            let isMatch = fullText.includes(query) || fullText.replace(/\s+/g, '').includes(queryNoSpaces);

            if (!isMatch) {
                const words = fullText.split(/\s+/);
                const threshold = query.length > 5 ? 2 : 1;
                isMatch = words.some(word => getLevenshteinDistance(query, word) <= threshold);
            }

            if (!isMatch && settingDef.childSettings) {
                for (const childDef of Object.values(settingDef.childSettings)) {
                    const childLabel = (Array.isArray(childDef.label) ? childDef.label.join(' ') : childDef.label || '').toLowerCase();
                    const childDesc = (Array.isArray(childDef.description) ? childDef.description.join(' ') : childDef.description || '').toLowerCase();
                    if (`${childLabel} ${childDesc}`.includes(query)) {
                        isMatch = true;
                        break;
                    }
                }
            }

            if (isMatch && !searchResults.some(res => res.name === settingName)) {
                searchResults.push({ category: category.title, name: settingName, config: settingDef });
            }
        }
    }

    if (searchResults.length === 0) {
        contentContainer.innerHTML = DOMPurify.sanitize(`<div id="settings-content" style="padding: 15px; text-align: center; color: var(--rovalra-main-text-color);">No settings found for "${query}".</div>`);
    } else {
        const groupedResults = searchResults.reduce((acc, setting) => {
            if (!acc[setting.category]) acc[setting.category] = [];
            acc[setting.category].push(setting);
            return acc;
        }, {});

        contentContainer.innerHTML = '';

        const resultsWrapper = document.createElement('div');
        resultsWrapper.id = 'setting-section-content';
        resultsWrapper.style.padding = '5px';

        for (const categoryTitle in groupedResults) {
            const header = document.createElement('h2');
            header.className = 'settings-category-header';
            header.style.cssText = 'margin-left: 5px; margin-bottom: 10px; color: var(--rovalra-main-text-color);';
            header.textContent = categoryTitle;
            resultsWrapper.appendChild(header);

            for (const setting of groupedResults[categoryTitle]) {
                const settingElement = generateSingleSettingHTML(setting.name, setting.config, REGIONS);
                
                if (settingElement instanceof Node) {
                    resultsWrapper.appendChild(settingElement);
                } else {
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = DOMPurify.sanitize(settingElement);
                    while (tempDiv.firstChild) {
                        resultsWrapper.appendChild(tempDiv.firstChild);
                    }
                }
            }
        }

        contentContainer.appendChild(resultsWrapper);
    }

    await initSettings(contentContainer);
    await applyTheme();
}

document.addEventListener('click', (event) => {
    const target = event.target;

    if (target.id === 'export-rovalra-settings') return exportSettings();
    if (target.id === 'import-rovalra-settings') return importSettings();
    if (target.matches('.tab-button, .setting-section-button')) return;

    if (target.matches('input[type="checkbox"]')) {
        const settingName = target.dataset.settingName;
        if (settingName) {
            handleSaveSettings(settingName, target.checked).then(() => {
                const settingsContent = document.querySelector('#setting-section-content');
                if (settingsContent) {
                    loadSettings().then(currentSettings => updateConditionalSettingsVisibility(settingsContent, currentSettings));
                }
            });
        }
    } else if (target.matches('select')) {
        const settingName = target.dataset.settingName;
        if (settingName) {
            handleSaveSettings(settingName, target.value).then(() => {
                const settingsContent = document.querySelector('#setting-section-content');
                if (settingsContent) {
                    loadSettings().then(currentSettings => updateConditionalSettingsVisibility(settingsContent, currentSettings));
                }
            });
        }
    }
});



function onPopoverRemoved() {
    window.rovalraPopoverButtonAdded = false;
}

async function initializeExtension() {
    try {
        const data = await getRegionData();
        REGIONS = data.regions;
    } catch (e) {
        console.warn('Failed to load region data:', e);
    }

    await applyTheme();
    await buildSettingsKey();

    addCustomButton(debouncedAddPopoverButton);
    addPopoverButton();

    initializeSettingsEventListeners();
    
    document.addEventListener('roblox-dom-changed', handleGlobalDomChange);

    observeElement('#settings-popover-menu', addPopoverButton, { onRemove: onPopoverRemoved });
    observeElement('ul.menu-vertical[role="tablist"]', () => addCustomButton(debouncedAddPopoverButton));

    await checkRoValraPage();
}

export function init() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeExtension);
    } else {
        initializeExtension();
    }
}

window.addEventListener('beforeunload', () => {
    document.removeEventListener('roblox-dom-changed', handleGlobalDomChange);
});

document.addEventListener('DOMContentLoaded', function() {
    const PreferredRegionEnabled = document.getElementById('PreferredRegionEnabled');
    const preferredRegionSelect = document.getElementById('preferredRegionSelect');
    const regionSettingDiv = document.getElementById('setting-preferred-region');

    function updateRegionSelectVisibility() {
        if (PreferredRegionEnabled && regionSettingDiv) {
            const isEnabled = PreferredRegionEnabled.checked;
            regionSettingDiv.style.display = isEnabled ? 'flex' : 'none';
            if (preferredRegionSelect) preferredRegionSelect.disabled = !isEnabled;
        }
    }

    if (PreferredRegionEnabled) {
        PreferredRegionEnabled.addEventListener('change', function() {
            updateRegionSelectVisibility();
            handleSaveSettings('PreferredRegionEnabled', this.checked);
        });
    }

    if (preferredRegionSelect) {
        preferredRegionSelect.addEventListener('change', function() {
            handleSaveSettings('robloxPreferredRegion', this.value);
        });

        if (preferredRegionSelect.options.length === 0) {
            Object.keys(REGIONS).forEach(regionCode => {
                const option = document.createElement('option');
                option.value = regionCode;
                option.textContent = getFullRegionName(regionCode);
                preferredRegionSelect.appendChild(option);
            });
        }
    }
    updateRegionSelectVisibility();
});



function initializeHeartbeatSpoofer() {
    const originalFetch = window.fetch;
    let pulseInterval = null;
    let spoofingMode = 'off';

    const sendSpoofedHeartbeat = async () => {
        let locationInfoPayload;
        
        if (spoofingMode === 'studio') {
            locationInfoPayload = { studioLocationInfo: { placeId: 0 } };
        } else {
            return;
        }

        const spoofedPulseRequest = {
            clientSideTimestampEpochMs: Date.now(),
            locationInfo: locationInfoPayload,
            sessionInfo: { sessionId: crypto.randomUUID() }
        };

        try {
            await callRobloxApi({
                subdomain: 'apis',
                endpoint: '/user-heartbeats-api/pulse',
                method: 'POST',
                body: spoofedPulseRequest,
                headers: { 'RoValra-Internal': 'true' }
            });
            console.log(`RoValra: Spoofed heartbeat sent. Mode: ${spoofingMode}`);
        } catch (error) {
            console.error("RoValra: Failed to send spoofed heartbeat.", error);
        }
    };

    const startSpoofingTimer = () => {
        if (pulseInterval) return;
        console.log(`RoValra: Starting spoofer timer (${spoofingMode}).`);
        pulseInterval = setInterval(async () => {
            if (spoofingMode === 'studio') {
                sendSpoofedHeartbeat();
            }
        }, 30000);
    };

    const stopSpoofingTimer = () => {
        if (pulseInterval) {
            console.log("RoValra: Stopping spoofer timer.");
            clearInterval(pulseInterval);
            pulseInterval = null;
        }
    };

    const updateSpoofingMode = (settings) => {
        chrome.runtime.sendMessage({ action: 'updateOfflineRule', enabled: settings.spoofAsOffline });
        chrome.runtime.sendMessage({ action: 'updateEarlyAccessRule', enabled: settings.EarlyAccessProgram });

        if (settings.spoofAsOffline) spoofingMode = 'offline';
        else if (settings.spoofAsStudio) spoofingMode = 'studio';
        else spoofingMode = 'off';

        if (spoofingMode === 'studio') startSpoofingTimer();
        else stopSpoofingTimer();
    };

    const relevantSettings = ['spoofAsStudio', 'spoofAsOffline', 'EarlyAccessProgram'];
    chrome.storage.local.get(relevantSettings, updateSpoofingMode);

    chrome.storage.onChanged.addListener((changes) => {
        if (relevantSettings.some(setting => changes[setting])) {
            chrome.storage.local.get(relevantSettings, (result) => {
                if (changes.LaunchDelay) {
                    const toggle = document.querySelector('#LaunchDelay-enabled');
                    if (toggle) {
                        toggle.checked = changes.LaunchDelay.newValue > 0;
                        updateConditionalSettingsVisibility(document.body, result);
                    }
                }
                updateSpoofingMode(result);
            });
        }
    });

    window.fetch = async function(...args) {
        const url = args[0] ? args[0].toString() : '';
        let isInternal = false;


        if (args.length > 1 && args[1] && args[1].headers) {
            const originalOptions = args[1];
            const newOptions = { ...originalOptions };
            
            let hasHeader = false;
            
            if (newOptions.headers instanceof Headers) {
                if (newOptions.headers.get('RoValra-Internal') === 'true') {
                    hasHeader = true;
                    newOptions.headers = new Headers(newOptions.headers);
                    newOptions.headers.delete('RoValra-Internal');
                }
            } else if (typeof newOptions.headers === 'object' && !Array.isArray(newOptions.headers)) {
                if (newOptions.headers['RoValra-Internal'] === 'true') {
                    hasHeader = true;
                    newOptions.headers = { ...newOptions.headers };
                    delete newOptions.headers['RoValra-Internal'];
                }
            }

            if (hasHeader) {
                isInternal = true;
                args[1] = newOptions;
            }
        }

        if (url.includes("apis.roblox.com/user-heartbeats-api/pulse") && spoofingMode !== 'off' && !isInternal) {
            return new Response(null, { status: 200, statusText: "OK" });
        }
        
        return originalFetch.apply(this, args);
    };

    console.log("RoValra: Proactive heartbeat spoofer initialized.");
}



function manageSingletonExecution() {
    const KEYS = {
        ID: 'rovalra_singleton_leader_id',
        SEEN: 'rovalra_singleton_last_seen'
    };
    const INTERVAL = 5000;
    const LEASE = 10000;

    const instanceId = crypto.randomUUID();
    let isLeader = false;
    let timerId = null;
    let featuresInitialized = false;

    const toggleFeatures = (shouldRun) => {
        if (shouldRun && !featuresInitialized) {
            console.log("RoValra: Leader instance. Initializing singleton features.");
            initializeHeartbeatSpoofer();
            featuresInitialized = true;
        } else if (!shouldRun && featuresInitialized) {
            featuresInitialized = false;
            console.log("RoValra: No longer leader.");
        }
    };

    const resetLoop = (nextFn) => {
        if (timerId) clearInterval(timerId);
        timerId = setInterval(nextFn, INTERVAL);
    };

    const attemptToBecomeLeader = () => {
        isLeader = true;
        const info = { [KEYS.ID]: instanceId, [KEYS.SEEN]: Date.now() };
        
        chrome.storage.local.set(info, () => {
            toggleFeatures(true);
            resetLoop(renewLease);
        });
    };

    const renewLease = () => {
        if (!isLeader) return;
        
        if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
            isLeader = false;
            toggleFeatures(false);
            resetLoop(checkForLeader);
            return;
        }

        chrome.storage.local.get(KEYS.ID, (result) => {
            if (chrome.runtime?.lastError || result[KEYS.ID] !== instanceId) {
                isLeader = false;
                toggleFeatures(false);
                resetLoop(checkForLeader);
            } else {
                chrome.storage.local.set({ [KEYS.SEEN]: Date.now() });
            }
        });
    };

    const checkForLeader = () => {
        chrome.storage.local.get([KEYS.ID, KEYS.SEEN], (result) => {
            const lastSeen = result[KEYS.SEEN];
            const isLeaseActive = lastSeen && (Date.now() - lastSeen < LEASE);

            if (!result[KEYS.ID] || !isLeaseActive) {
                attemptToBecomeLeader();
            }
        });
    };

    window.addEventListener('beforeunload', () => {
        if (isLeader) chrome.storage.local.remove([KEYS.ID, KEYS.SEEN]);
    });

    checkForLeader();
    resetLoop(checkForLeader);
}

manageSingletonExecution();
loadDatacenterMap();