import { SETTINGS_CONFIG } from './settingConfig.js';
import { findSettingConfig } from './generateSettings.js';
import { getFullRegionName, REGIONS } from '../regions.js';
import { sanitizeString } from '../utils/sanitize.js';
import { callRobloxApiJson } from '../api.js';
import { getAuthenticatedUserId } from '../user.js';
import {
    getUserDescription,
    updateUserDescription,
    updateUserSettingViaApi,
} from '../profile/descriptionhandler.js';
import { createAndShowPopup } from '../../features/catalog/40method.js';
import * as CacheHandler from '../storage/cacheHandler.js';

let currentUserTier = 0;
let gradientSyncTimeout = null;
let donatorTierPromise = null;
const colorLiveSaveTimeouts = new Map();

export const getCurrentUserTier = () => currentUserTier;

export const syncDonatorTier = async () => {
    if (donatorTierPromise) return donatorTierPromise;

    const now = Date.now();
    const currentHref = window.location.href;
    const currentPath = window.location.pathname;
    const storePageUrl = 'store-section/9452973012';
    const currentUserId = await getAuthenticatedUserId();

    const state = (await CacheHandler.get(
        'donator_info',
        'sync_state',
        'local',
    )) || {
        lastSync: 0,
        cachedResponse: null,
        priorityActive: false,
        checksLeft: 0,
        lastPath: '',
        lastTier: 0,
        userId: null,
    };

    if (state.userId !== currentUserId) {
        state.lastSync = 0;
        state.cachedResponse = null;
        state.lastTier = 0;
        state.userId = currentUserId;
        currentUserTier = 0;

        await CacheHandler.set('donator_info', 'sync_state', state, 'local');
    }

    if (state.lastTier !== undefined) currentUserTier = state.lastTier;

    if (currentHref.includes(storePageUrl)) {
        state.priorityActive = true;
        state.checksLeft = 10;
    }

    const isUrlChange = currentPath !== state.lastPath;
    const isPriorityCheck =
        state.priorityActive && isUrlChange && state.checksLeft > 0;
    const isExpired = now - state.lastSync > 5 * 60 * 1000;

    if (state.cachedResponse && !isPriorityCheck && !isExpired) {
        return state.cachedResponse;
    }

    donatorTierPromise = (async () => {
        try {
            const response = await callRobloxApiJson({
                isRovalraApi: true,
                subdomain: 'apis',
                endpoint: '/v1/auth/badges',
                method: 'GET',
            });

            if (response.status !== 'success' || !response.badges) {
                return state.cachedResponse || null;
            }

            const badges = response.badges;
            let tier = 0;
            if (badges.donator_3 === true || badges.legacy_donator === true) {
                tier = 3;
            } else if (badges.donator_2 === true) {
                tier = 2;
            } else if (badges.donator_1 === true) {
                tier = 1;
            }

            if (state.priorityActive && isUrlChange) {
                if (tier !== state.lastTier) {
                    state.priorityActive = false;
                    state.checksLeft = 0;
                } else {
                    state.checksLeft--;
                    if (state.checksLeft <= 0) {
                        state.priorityActive = false;
                    }
                }
            }

            currentUserTier = tier;
            state.lastTier = tier;
            state.lastSync = Date.now();
            state.lastPath = currentPath;
            state.cachedResponse = response;
            state.userId = currentUserId;

            await CacheHandler.set(
                'donator_info',
                'sync_state',
                state,
                'local',
            );

            const settingsContent = document.querySelector(
                '#setting-section-content',
            );
            if (settingsContent) {
                const settings = await loadSettings();
                await checkSettingLocks(settingsContent, settings);
            }

            return response;
        } catch (error) {
            console.error('RoValra: Failed to sync donator tier', error);
            return state.cachedResponse || null;
        } finally {
            donatorTierPromise = null;
        }
    })();

    return donatorTierPromise;
};

export const loadSettings = async () => {
    return new Promise((resolve, reject) => {
        const defaultSettings = {};
        for (const category of Object.values(SETTINGS_CONFIG)) {
            for (const [settingName, settingDef] of Object.entries(
                category.settings,
            )) {
                if (settingDef.default !== undefined) {
                    defaultSettings[settingName] = settingDef.default;
                }
                if (settingDef.childSettings) {
                    for (const [childName, childSettingDef] of Object.entries(
                        settingDef.childSettings,
                    )) {
                        if (childSettingDef.default !== undefined) {
                            defaultSettings[childName] =
                                childSettingDef.default;
                        }
                    }
                }
            }
        }

        chrome.storage.local.get(defaultSettings, (settings) => {
            if (chrome.runtime.lastError) {
                console.error(
                    'Failed to load settings:',
                    chrome.runtime.lastError,
                );
                reject(chrome.runtime.lastError);
            } else {
                resolve(settings);
            }
        });
    });
};

export const handleSaveSettings = async (settingName, value) => {
    if (!settingName) {
        console.error('No setting name provided');
        return Promise.reject(new Error('No setting name provided'));
    }

    try {
        const settingConfig = findSettingConfig(settingName);

        let sanitizedValue = value;

        if (settingConfig) {
            switch (settingConfig.type) {
                case 'checkbox':
                    if (value !== true && value !== false && value !== null) {
                        console.warn(
                            `Invalid boolean value for '${settingName}' - coercing to boolean`,
                        );
                        sanitizedValue = Boolean(value);
                    }
                    break;

                case 'number': {
                    const numValue = Number(value);
                    if (isNaN(numValue)) {
                        console.warn(
                            `Invalid number value for '${settingName}' - setting to default`,
                        );
                        sanitizedValue = settingConfig.default ?? 0;
                    } else {
                        sanitizedValue = numValue;
                        if (
                            settingConfig.min !== undefined &&
                            sanitizedValue < settingConfig.min
                        ) {
                            sanitizedValue = settingConfig.min;
                        }
                        if (
                            settingConfig.max !== undefined &&
                            sanitizedValue > settingConfig.max
                        ) {
                            sanitizedValue = settingConfig.max;
                        }
                    }
                    break;
                }

                case 'text':
                case 'input':
                case 'select':
                case 'color':
                case 'gradient':
                    if (value === null) {
                        sanitizedValue = null;
                    } else if (typeof value === 'string') {
                        sanitizedValue = sanitizeString(value);

                        if (
                            settingConfig.type === 'select' &&
                            settingConfig.options
                        ) {
                            let validValues = [];
                            if (settingConfig.options === 'REGIONS') {
                                validValues = ['AUTO', ...Object.keys(REGIONS)];
                            } else if (Array.isArray(settingConfig.options)) {
                                validValues = settingConfig.options.map(
                                    (opt) =>
                                        typeof opt === 'object'
                                            ? opt.value
                                            : opt,
                                );
                            }

                            if (
                                validValues.length > 1 &&
                                !validValues.includes(sanitizedValue)
                            ) {
                                console.warn(
                                    `Invalid select value '${sanitizedValue}' for '${settingName}' - setting to default`,
                                );
                                sanitizedValue =
                                    settingConfig.default ?? validValues[0];
                            }
                        }
                    } else if (
                        settingConfig.type === 'gradient' &&
                        typeof value === 'object'
                    ) {
                        sanitizedValue = {
                            enabled: value.enabled !== false,
                            color1: sanitizeString(
                                String(value.color1 || '#667eea'),
                            ),
                            color2: sanitizeString(
                                String(value.color2 || '#764ba2'),
                            ),
                            angle: Math.max(
                                0,
                                Math.min(360, parseInt(value.angle, 10) || 0),
                            ),
                            fade: Math.max(
                                0,
                                Math.min(100, parseInt(value.fade, 10) || 0),
                            ),
                        };
                    } else {
                        console.warn(
                            `Invalid string value for '${settingName}' - converting to string and sanitizing`,
                        );
                        sanitizedValue = sanitizeString(String(value));
                    }
                    break;

                case 'list':
                    if (Array.isArray(value)) {
                        sanitizedValue = value.map((item) =>
                            typeof item === 'string'
                                ? sanitizeString(item)
                                : '',
                        );
                    } else {
                        console.warn(
                            `Invalid array value for list setting '${settingName}' - setting to default`,
                        );
                        sanitizedValue = settingConfig.default ?? [];
                    }
                    break;

                case 'file':
                    if (value === null) {
                        sanitizedValue = null;
                    } else if (
                        typeof value !== 'string' ||
                        !value.startsWith('data:')
                    ) {
                        console.warn(
                            `Invalid data URI for file setting '${settingName}'`,
                        );
                        sanitizedValue = null;
                    } else {
                        const accept = settingConfig.accept || 'image/*';
                        if (
                            accept.includes('image') &&
                            !value.startsWith('data:image/')
                        ) {
                            console.warn(
                                `Attempted to save non-image data to an image file setting: '${settingName}'`,
                            );
                            sanitizedValue = null;
                        }
                    }
                    break;
            }
        }

        const settings = { [settingName]: sanitizedValue };

        return new Promise((resolve, reject) => {
            chrome.storage.local.set(settings, () => {
                if (chrome.runtime.lastError) {
                    console.error(
                        'Failed to save setting:',
                        settingName,
                        chrome.runtime.lastError,
                    );
                    reject(chrome.runtime.lastError);
                } else {
                    syncToSettingsKey(settingName, sanitizedValue);
                    if (settingName === 'profileGradient' && sanitizedValue) {
                        if (gradientSyncTimeout)
                            clearTimeout(gradientSyncTimeout);
                        gradientSyncTimeout = setTimeout(async () => {
                            const isDonator = currentUserTier >= 2;
                            if (isDonator) {
                                const val = sanitizedValue.enabled
                                    ? `${sanitizedValue.color1}, ${sanitizedValue.color2}, ${sanitizedValue.fade}, ${sanitizedValue.angle}`
                                    : '';

                                updateUserSettingViaApi('gradient', val).catch(
                                    (error) =>
                                        console.error(
                                            'RoValra: Gradient sync failed',
                                            error,
                                        ),
                                );
                            }
                        }, 1000);
                    }
                    resolve();
                }
            });
        });
    } catch (error) {
        console.error(`Error saving setting ${settingName}:`, error);
        return Promise.reject(error);
    }
};

const syncToSettingsKey = (settingName, value) => {
    chrome.storage.local.get('rovalra_settings', (result) => {
        const settingsData = result.rovalra_settings || {};
        settingsData[settingName] = value;
        chrome.storage.local.set({ rovalra_settings: settingsData });
    });
};

export const buildSettingsKey = async () => {
    return new Promise((resolve) => {
        const allSettingKeys = [];
        for (const category of Object.values(SETTINGS_CONFIG)) {
            for (const [settingName, settingDef] of Object.entries(
                category.settings,
            )) {
                allSettingKeys.push(settingName);
                if (settingDef.childSettings) {
                    for (const childName of Object.keys(
                        settingDef.childSettings,
                    )) {
                        allSettingKeys.push(childName);
                    }
                }
            }
        }

        chrome.storage.local.get(allSettingKeys, (currentSettings) => {
            chrome.storage.local.set(
                { rovalra_settings: currentSettings },
                () => {
                    if (chrome.runtime.lastError) {
                        console.error(
                            'Failed to build settings key:',
                            chrome.runtime.lastError,
                        );
                    } else {
                        console.log('RoValra: Settings key initialized');
                    }
                    resolve();
                },
            );
        });
    });
};

export const initSettings = async (settingsContent) => {
    if (!settingsContent) {
        console.error(
            'settingsContent is null in initSettings! Check HTML structure.',
        );
        return;
    }
    const settings = await loadSettings();

    if (settings) {
        for (const sectionName in SETTINGS_CONFIG) {
            const section = SETTINGS_CONFIG[sectionName];
            for (const [settingName, config] of Object.entries(
                section.settings,
            )) {
                if (
                    settings[settingName] === true &&
                    config.requiredPermissions
                ) {
                    let missingPerms = false;

                    for (const perm of config.requiredPermissions) {
                        const hasIt = await hasPermission(perm);
                        if (!hasIt) {
                            missingPerms = true;
                            break;
                        }
                    }

                    if (missingPerms) {
                        console.log(
                            `RoValra: Disabling '${settingName}' because required permissions are missing.`,
                        );
                        await handleSaveSettings(settingName, false);
                        settings[settingName] = false;
                    }
                }
            }
        }
    }

    if (settings) {
        updateConditionalSettingsVisibility(settingsContent, settings);
        for (const sectionName in SETTINGS_CONFIG) {
            const section = SETTINGS_CONFIG[sectionName];
            for (const [settingName, setting] of Object.entries(
                section.settings,
            )) {
                const element = settingsContent.querySelector(
                    `#${settingName}`,
                );
                if (element) {
                    if (setting.type === 'checkbox') {
                        element.checked =
                            settings[settingName] !== undefined
                                ? settings[settingName]
                                : setting.default;
                    } else if (setting.type === 'select') {
                        const savedValue =
                            settings[settingName] || setting.default;
                        element.value = savedValue;

                        if (element._dropdownApi) {
                            element._dropdownApi.setValue(savedValue);
                        }
                    } else if (setting.type === 'gradient') {
                        if (element.rovalraGradientApi) {
                            element.rovalraGradientApi.setValue(
                                settings[settingName] || setting.default,
                            );
                        }
                    } else if (
                        setting.type === 'input' ||
                        setting.type === 'color'
                    ) {
                        element.value = settings[settingName] || '';
                        element.dispatchEvent(
                            new Event('input', { bubbles: true }),
                        );
                    } else if (setting.type === 'file') {
                        const fileUploadWrapper = settingsContent.querySelector(
                            `[data-setting-name="${settingName}"]`,
                        );
                        const previewElement = settingsContent.querySelector(
                            `#preview-${settingName}`,
                        );
                        const customLogoData = settings[settingName];

                        if (
                            fileUploadWrapper &&
                            fileUploadWrapper.rovalraFileUpload
                        ) {
                            const { setFileName, showClear } =
                                fileUploadWrapper.rovalraFileUpload;
                            if (customLogoData) {
                                setFileName('custom_icon.png');
                                showClear(true);
                                if (previewElement) {
                                    previewElement.src = customLogoData;
                                    previewElement.style.display = 'block';
                                }
                            } else {
                                setFileName(null);
                                showClear(false);
                                if (previewElement)
                                    previewElement.style.display = 'none';
                            }
                        } else {
                            if (previewElement && settings[settingName]) {
                                previewElement.src = settings[settingName];
                                previewElement.style.display = 'block';
                            } else if (previewElement) {
                                previewElement.src = '#';
                                previewElement.style.display = 'none';
                            }
                        }
                    }
                }

                if (setting.childSettings) {
                    for (const [childName, childSetting] of Object.entries(
                        setting.childSettings,
                    )) {
                        const childElement = settingsContent.querySelector(
                            `#${childName}`,
                        );
                        if (childElement) {
                            if (childSetting.type === 'checkbox') {
                                childElement.checked =
                                    settings[childName] !== undefined
                                        ? settings[childName]
                                        : childSetting.default;
                            } else if (childSetting.type === 'select') {
                                const savedValue =
                                    settings[childName] || childSetting.default;
                                childElement.value = savedValue;

                                if (childElement._dropdownApi) {
                                    childElement._dropdownApi.setValue(
                                        savedValue,
                                    );
                                }

                                if (
                                    childName === 'robloxPreferredRegion' &&
                                    childElement.options.length === 0
                                ) {
                                    Object.keys(REGIONS).forEach(
                                        (regionCode) => {
                                            const option =
                                                document.createElement(
                                                    'option',
                                                );
                                            option.value = regionCode;
                                            option.textContent =
                                                getFullRegionName(regionCode);
                                            childElement.appendChild(option);
                                        },
                                    );
                                }
                            } else if (childSetting.type === 'gradient') {
                                if (childElement.rovalraGradientApi) {
                                    childElement.rovalraGradientApi.setValue(
                                        settings[childName] ||
                                            childSetting.default,
                                    );
                                }
                            } else if (
                                childSetting.type === 'input' ||
                                childSetting.type === 'color'
                            ) {
                                childElement.value = settings[childName] || '';
                                childElement.dispatchEvent(
                                    new Event('input', { bubbles: true }),
                                );
                            } else if (childSetting.type === 'list') {
                                const values = settings[childName] ||
                                    childSetting.default || [''];
                                if (
                                    childElement.rovalraList &&
                                    typeof childElement.rovalraList
                                        .setValues === 'function'
                                ) {
                                    childElement.rovalraList.setValues(values);
                                }
                            } else if (childSetting.type === 'number') {
                                const currentValue =
                                    settings[childName] !== undefined
                                        ? settings[childName]
                                        : childSetting.default;
                                childElement.value = currentValue;
                                const toggleElement =
                                    settingsContent.querySelector(
                                        `#${childName}-enabled`,
                                    );
                                if (toggleElement) {
                                    const isEnabled = currentValue > 0;
                                    toggleElement.checked = isEnabled;
                                }
                            } else if (childSetting.type === 'file') {
                                const previewElement =
                                    settingsContent.querySelector(
                                        `#preview-${childName}`,
                                    );
                                const clearButton =
                                    settingsContent.querySelector(
                                        `#clear-${childName}`,
                                    );
                                if (previewElement && settings[childName]) {
                                    previewElement.src = settings[childName];
                                    previewElement.style.display = 'block';
                                    if (clearButton)
                                        clearButton.style.display =
                                            'inline-block';
                                } else if (previewElement) {
                                    previewElement.style.display = 'none';
                                    if (clearButton)
                                        clearButton.style.display = 'none';
                                }
                            } else if (childSetting.type === 'button') {
                                // No state to restore from settings
                            }
                        }
                    }
                }
            }
        }
        await checkSettingLocks(settingsContent, settings);
        if (document.querySelector('.permission-manager')) {
            updateAllPermissionToggles();
        }
    }
    settingsContent.querySelectorAll('.permission-toggle').forEach((toggle) => {
        toggle.addEventListener('change', handlePermissionToggle);
    });
};

export const applyLockedState = (
    settingName,
    parentElement,
    isLocked,
    reason = '',
    isDonatorLock = false,
) => {
    const inputElement = parentElement.querySelector(
        `[data-setting-name="${settingName}"]`,
    );
    if (!inputElement) return;

    const wrapper =
        inputElement.closest('.child-setting-item') ||
        inputElement.closest('.setting');
    if (!wrapper) return;

    const existingNotice = wrapper.querySelector('.rovalra-lock-notice');
    if (existingNotice) existingNotice.remove();

    if (isLocked || isDonatorLock) {
        const config = findSettingConfig(settingName);
        const lockType = config?.isPermanent ? 'permanently' : 'temporarily';

        if (isLocked) {
            wrapper.classList.add('setting-locked');
            wrapper.style.setProperty('opacity', '1', 'important');
            wrapper.style.setProperty('pointer-events', 'none', 'important');
        } else {
            wrapper.classList.remove('setting-locked');
            wrapper.style.removeProperty('opacity');
            if (!wrapper.classList.contains('disabled-setting')) {
                wrapper.style.setProperty('pointer-events', 'auto');
            }
        }

        if (isDonatorLock) {
            wrapper.classList.add('donator-locked');
        }

        const notice = document.createElement('div');
        notice.className = 'rovalra-lock-notice';
        if (isDonatorLock) {
            notice.classList.add('donator-notice');
            if (!isLocked) notice.classList.add('unlocked-donator-notice');
        }

        const statusLine = document.createElement('div');
        statusLine.className = 'lock-status-text';
        if (isDonatorLock) {
            const tier = config?.donatorTier || '';
            statusLine.textContent = isLocked
                ? `RoValra Donator Tier ${tier} Required`
                : `RoValra Donator Perk (Tier ${tier})`;
        } else {
            statusLine.textContent = `This feature has been disabled ${lockType}`;
        }

        const reasonLine = document.createElement('div');
        reasonLine.className = 'lock-reason-text';
        reasonLine.textContent = reason;

        notice.append(statusLine, reasonLine);
        wrapper.prepend(notice);

        if (isLocked) {
            Array.from(wrapper.children).forEach((child) => {
                if (!child.classList.contains('rovalra-lock-notice')) {
                    child.style.opacity = '0.5';
                }
            });

            wrapper.querySelectorAll('input, select, button').forEach((el) => {
                if (!el.dataset.forceEnabled) {
                    el.disabled = true;
                }
            });
        } else {
            Array.from(wrapper.children).forEach((child) => {
                child.style.opacity = '';
            });

            wrapper.querySelectorAll('input, select, button').forEach((el) => {
                if (
                    !wrapper.classList.contains('disabled-setting') &&
                    !wrapper.classList.contains('setting-locked')
                ) {
                    el.disabled = false;
                }
            });
        }
    } else {
        wrapper.classList.remove('setting-locked');
        wrapper.classList.remove('donator-locked');
        wrapper.style.removeProperty('opacity');
        wrapper.style.removeProperty('filter');
        if (!wrapper.classList.contains('disabled-setting')) {
            wrapper.style.setProperty('pointer-events', 'auto');
        }

        Array.from(wrapper.children).forEach((child) => {
            child.style.opacity = '';
        });

        wrapper.querySelectorAll('input, select, button').forEach((el) => {
            if (
                !wrapper.classList.contains('disabled-setting') &&
                !wrapper.classList.contains('setting-locked')
            ) {
                el.disabled = false;
            }
        });
    }
};

export const checkSettingLocks = async (settingsContent, currentSettings) => {
    const data = await chrome.storage.local.get([
        'profile3DRenderForceDisabled',
    ]);

    const userTier = currentUserTier;

    const is3DLocked =
        data.profile3DRenderForceDisabled === true &&
        !currentSettings.profile3DRenderBypassCheck;

    if (is3DLocked && currentSettings.profile3DRenderEnabled === true) {
        await handleSaveSettings('profile3DRenderEnabled', false);
    }

    applyLockedState(
        'profile3DRenderEnabled',
        settingsContent,
        is3DLocked,
        'The 3D Profile Renderer was forcefully disabled because WebGL 2 is disabled or your graphics card doesnt support it.',
    );

    for (const category of Object.values(SETTINGS_CONFIG)) {
        for (const [settingName, config] of Object.entries(category.settings)) {
            const processSetting = async (name, conf) => {
                if (conf.donatorTier) {
                    const isLocked = userTier < conf.donatorTier;
                    applyLockedState(
                        name,
                        settingsContent,
                        isLocked,
                        conf.donatorReason ||
                            'This is a donator-exclusive feature.',
                        true,
                    );
                    if (isLocked) return true;
                }
                if (conf.locked) {
                    if (currentSettings[name] === true) {
                        await handleSaveSettings(name, false);
                    }
                    applyLockedState(name, settingsContent, true, conf.locked);
                    return true;
                }
                return false;
            };

            await processSetting(settingName, config);

            if (config.childSettings) {
                for (const [childName, childConfig] of Object.entries(
                    config.childSettings,
                )) {
                    await processSetting(childName, childConfig);
                }
            }
        }
    }
};

function applyDisabledState(
    settingName,
    parentElement,
    isDisabled,
    isPermissionRelated = false,
) {
    const inputElement = parentElement.querySelector(
        `[data-setting-name="${settingName}"]`,
    );
    if (!inputElement) return;

    const wrapper =
        inputElement.closest('.child-setting-item') ||
        inputElement.closest('.setting');
    if (!wrapper) return;

    const toggleSwitch = wrapper.querySelector(
        '.setting-controls > .toggle-switch',
    );

    if (isDisabled && isPermissionRelated) {
        if (toggleSwitch) {
            toggleSwitch.style.opacity = '0.5';
            toggleSwitch.style.setProperty(
                'pointer-events',
                'none',
                'important',
            );
        }
        if (inputElement.type === 'checkbox') inputElement.disabled = true;
    } else if (isDisabled) {
        wrapper.classList.add('disabled-setting');
        wrapper.style.opacity = '0.5';
        wrapper.style.setProperty('pointer-events', 'none', 'important');
        wrapper.querySelectorAll('input, select, button').forEach((el) => {
            el.disabled = true;
        });
    } else {
        wrapper.classList.remove('disabled-setting');
        wrapper.style.opacity = '1';
        if (!wrapper.classList.contains('setting-locked')) {
            wrapper.style.setProperty('pointer-events', 'auto');
        }
        wrapper.querySelectorAll('input, select, button').forEach((el) => {
            if (!wrapper.classList.contains('setting-locked')) {
                el.disabled = false;
            }
        });
        if (toggleSwitch) {
            toggleSwitch.style.opacity = '1';
            if (!wrapper.classList.contains('setting-locked')) {
                toggleSwitch.style.setProperty('pointer-events', 'auto');
            }
        }
    }
}

export function updateConditionalSettingsVisibility(
    settingsContent,
    currentSettings,
) {
    if (!settingsContent || !currentSettings) {
        return;
    }

    const settingsToDisable = new Set();

    for (const [settingName, isEnabled] of Object.entries(currentSettings)) {
        const config = findSettingConfig(settingName);
        if (!config) continue;

        if (config.childSettings) {
            for (const [childName, childConfig] of Object.entries(
                config.childSettings,
            )) {
                if (childConfig.condition) {
                    if (
                        currentSettings[childConfig.condition.parent] !==
                        childConfig.condition.value
                    ) {
                        settingsToDisable.add(childName);
                    }
                } else if (config.type === 'checkbox' && !isEnabled) {
                    settingsToDisable.add(childName);
                }
            }
        }
    }

    const allSettingElements = settingsContent.querySelectorAll(
        '[data-setting-name]',
    );
    allSettingElements.forEach((element) => {
        const settingName = element.dataset.settingName;
        applyDisabledState(
            settingName,
            settingsContent,
            settingsToDisable.has(settingName),
        );
    });

    const numberToggles = settingsContent.querySelectorAll(
        'input[type="checkbox"][data-controls-setting]',
    );
    numberToggles.forEach((toggle) => {
        const controlledSettingName = toggle.dataset.controlsSetting;
        const numberInputContainer = settingsContent
            .querySelector(`#${controlledSettingName}`)
            ?.closest('.rovalra-number-input-container');
        if (numberInputContainer) {
            const isDisabled = !toggle.checked;
            numberInputContainer.style.opacity = isDisabled ? '0.5' : '1';
            numberInputContainer.style.pointerEvents = isDisabled
                ? 'none'
                : 'auto';
            numberInputContainer
                .querySelectorAll('input, button')
                .forEach((el) => (el.disabled = isDisabled));
        }
    });
}

async function hasPermission(permission) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage(
            { action: 'checkPermission', permission: permission },
            (response) => {
                if (chrome.runtime.lastError) {
                    console.error(
                        'RoValra: Error checking permission:',
                        chrome.runtime.lastError.message,
                    );
                    resolve(false);
                }
                resolve(response?.granted || false);
            },
        );
    });
}

async function requestPermission(permission) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage(
            { action: 'requestPermission', permission: permission },
            (response) => {
                if (chrome.runtime.lastError) {
                    console.warn(
                        `RoValra: Permission request for '${permission}' failed or was dismissed:`,
                        chrome.runtime.lastError.message,
                    );
                    resolve(false);
                }
                resolve(response?.granted || false);
            },
        );
    });
}

async function revokePermission(permission) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage(
            { action: 'revokePermission', permission: permission },
            (response) => {
                if (chrome.runtime.lastError) {
                    console.error(
                        `RoValra: Failed to revoke '${permission}' permission:`,
                        chrome.runtime.lastError.message,
                    );
                    resolve(false);
                }
                resolve(response?.revoked || false);
            },
        );
    });
}

export async function updateAllPermissionToggles() {
    const settings = await loadSettings();
    const permissionManagers = document.querySelectorAll('.permission-manager');
    for (const manager of permissionManagers) {
        const permissionName = manager.dataset.permissionName;
        const isGranted = await hasPermission(permissionName);

        const toggle = manager.querySelector('.permission-toggle');
        if (toggle) {
            toggle.checked = isGranted;
        }
    }

    for (const sectionName in SETTINGS_CONFIG) {
        const section = SETTINGS_CONFIG[sectionName];
        for (const [settingName, config] of Object.entries(section.settings)) {
            if (settings[settingName] === true && config.requiredPermissions) {
                let missingPerms = false;

                for (const perm of config.requiredPermissions) {
                    const hasIt = await hasPermission(perm);
                    if (!hasIt) {
                        missingPerms = true;
                        break;
                    }
                }

                if (missingPerms) {
                    console.log(
                        `RoValra: Disabling '${settingName}' because required permissions are missing.`,
                    );
                    await handleSaveSettings(settingName, false);
                    settings[settingName] = false;

                    const element = document.querySelector(`#${settingName}`);
                    if (element) {
                        element.checked = false;
                    }
                }
            }
        }
    }
    updateConditionalSettingsVisibility(document, settings);
}

export async function handlePermissionToggle(event) {
    const toggle = event.target;
    const permissionName = toggle.dataset.permissionName;

    if (toggle.checked) {
        const granted = await requestPermission(permissionName);
        if (!granted) {
            toggle.checked = false;
        }
    } else {
        const wasRevoked = await revokePermission(permissionName);
        if (!wasRevoked) {
            toggle.checked = true;
        }
    }
    await updateAllPermissionToggles();
}

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export function initializeSettingsEventListeners() {
    document.addEventListener('rovalra:open40methodSetup', () => {
        createAndShowPopup(() => {
            // Configuration is saved by the popup.
        });
    });

    document.addEventListener('rovalra:generateEnvironmentJson', async () => {
        const settings = await loadSettings();
        const envConfig = {};

        // Model
        if (settings.modelUrl) {
            envConfig.model = {
                url: settings.modelUrl,
                position: [
                    parseFloat(settings.modelPosX) || 0,
                    parseFloat(settings.modelPosY) || 0,
                    parseFloat(settings.modelPosZ) || 0,
                ],
                scale: [
                    parseFloat(settings.modelScaleX) || 1,
                    parseFloat(settings.modelScaleY) || 1,
                    parseFloat(settings.modelScaleZ) || 1,
                ],
                castShadow: settings.modelCastShadow,
                receiveShadow: settings.modelReceiveShadow,
            };
        }

        const atmosphere = {};
        if (settings.bgColor) {
            atmosphere.background = settings.bgColor;
        }
        atmosphere.showFloor = settings.showFloor;

        const lights = [];
        if (settings.ambientLightToggle) {
            lights.push({
                type: 'AmbientLight',
                color: settings.ambientLightColor,
                intensity: parseFloat(settings.ambientLightIntensity) || 0,
            });
        }
        if (settings.dirLightToggle) {
            lights.push({
                type: 'DirectionalLight',
                color: settings.dirLightColor,
                intensity: parseFloat(settings.dirLightIntensity) || 0,
                position: [
                    parseFloat(settings.dirLightPosX) || 0,
                    parseFloat(settings.dirLightPosY) || 0,
                    parseFloat(settings.dirLightPosZ) || 0,
                ],
                castShadow: settings.dirLightCastShadow,
            });
        }
        if (lights.length > 0) {
            atmosphere.lights = lights;
        }

        if (settings.fogToggle) {
            atmosphere.fog = {
                color: settings.fogColor,
                near: parseFloat(settings.fogNear) || 0,
                far: parseFloat(settings.fogFar) || 0,
            };
        }

        if (Object.keys(atmosphere).length > 0) {
            envConfig.atmosphere = atmosphere;
        }

        if (settings.cameraFar) {
            const far = parseFloat(settings.cameraFar);
            if (!isNaN(far) && far !== 100) {
                envConfig.camera = { far: far };
            }
        }

        if (settings.tooltipToggle && settings.tooltipText) {
            envConfig.tooltip = {
                text: settings.tooltipText,
                link: settings.tooltipLink || '',
            };
        }

        if (
            settings.skyboxToggle &&
            settings.skyboxPx &&
            settings.skyboxNx &&
            settings.skyboxPy &&
            settings.skyboxNy &&
            settings.skyboxPz &&
            settings.skyboxNz
        ) {
            envConfig.skybox = [
                settings.skyboxPx,
                settings.skyboxNx,
                settings.skyboxPy,
                settings.skyboxNy,
                settings.skyboxPz,
                settings.skyboxNz,
            ];
        }

        console.log(
            'Generated Environment JSON:\n' +
                JSON.stringify(envConfig, null, 2),
        );
        alert('Environment JSON has been printed to the console (F12).');
    });

    document.addEventListener('rovalra:importEnvironmentJson', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (readerEvent) => {
                try {
                    const config = JSON.parse(readerEvent.target.result);
                    const updates = {};

                    const set = (key, value) => {
                        updates[key] = value;
                    };

                    if (config.model) {
                        if (config.model.url) set('modelUrl', config.model.url);
                        if (Array.isArray(config.model.position)) {
                            set('modelPosX', config.model.position[0]);
                            set('modelPosY', config.model.position[1]);
                            set('modelPosZ', config.model.position[2]);
                        }
                        if (Array.isArray(config.model.scale)) {
                            set('modelScaleX', config.model.scale[0]);
                            set('modelScaleY', config.model.scale[1]);
                            set('modelScaleZ', config.model.scale[2]);
                        }
                        if (typeof config.model.castShadow === 'boolean')
                            set('modelCastShadow', config.model.castShadow);
                        if (typeof config.model.receiveShadow === 'boolean')
                            set(
                                'modelReceiveShadow',
                                config.model.receiveShadow,
                            );
                    }

                    if (config.atmosphere) {
                        if (config.atmosphere.background)
                            set('bgColor', config.atmosphere.background);
                        if (typeof config.atmosphere.showFloor === 'boolean')
                            set('showFloor', config.atmosphere.showFloor);

                        set('ambientLightToggle', false);
                        set('dirLightToggle', false);

                        if (Array.isArray(config.atmosphere.lights)) {
                            config.atmosphere.lights.forEach((light) => {
                                if (light.type === 'AmbientLight') {
                                    set('ambientLightToggle', true);
                                    if (light.color)
                                        set('ambientLightColor', light.color);
                                    if (light.intensity !== undefined)
                                        set(
                                            'ambientLightIntensity',
                                            light.intensity,
                                        );
                                } else if (light.type === 'DirectionalLight') {
                                    set('dirLightToggle', true);
                                    if (light.color)
                                        set('dirLightColor', light.color);
                                    if (light.intensity !== undefined)
                                        set(
                                            'dirLightIntensity',
                                            light.intensity,
                                        );
                                    if (Array.isArray(light.position)) {
                                        set('dirLightPosX', light.position[0]);
                                        set('dirLightPosY', light.position[1]);
                                        set('dirLightPosZ', light.position[2]);
                                    }
                                    if (typeof light.castShadow === 'boolean')
                                        set(
                                            'dirLightCastShadow',
                                            light.castShadow,
                                        );
                                }
                            });
                        }

                        if (config.atmosphere.fog) {
                            set('fogToggle', true);
                            if (config.atmosphere.fog.color)
                                set('fogColor', config.atmosphere.fog.color);
                            if (config.atmosphere.fog.near !== undefined)
                                set('fogNear', config.atmosphere.fog.near);
                            if (config.atmosphere.fog.far !== undefined)
                                set('fogFar', config.atmosphere.fog.far);
                        } else {
                            set('fogToggle', false);
                        }
                    }

                    if (config.camera && config.camera.far) {
                        set('cameraFar', config.camera.far);
                    }

                    if (
                        Array.isArray(config.skybox) &&
                        config.skybox.length === 6
                    ) {
                        set('skyboxToggle', true);
                        set('skyboxPx', config.skybox[0]);
                        set('skyboxNx', config.skybox[1]);
                        set('skyboxPy', config.skybox[2]);
                        set('skyboxNy', config.skybox[3]);
                        set('skyboxPz', config.skybox[4]);
                        set('skyboxNz', config.skybox[5]);
                    } else {
                        set('skyboxToggle', false);
                    }

                    if (config.tooltip) {
                        set('tooltipToggle', true);
                        set('tooltipText', config.tooltip.text || '');
                        set('tooltipLink', config.tooltip.link || '');
                    } else {
                        set('tooltipToggle', false);
                    }

                    const promises = Object.entries(updates).map(
                        ([key, value]) => handleSaveSettings(key, value),
                    );
                    await Promise.all(promises);

                    alert(
                        'Environment config imported successfully. The page will reload to apply changes.',
                    );
                    location.reload();
                } catch (error) {
                    console.error(
                        'Failed to import environment config:',
                        error,
                    );
                    alert('Failed to parse the JSON file.');
                }
            };
            reader.readAsText(file);
        };

        input.click();
    });

    document.addEventListener('rovalra:showLocalStorageUsage', async () => {
        chrome.storage.local.get(null, (items) => {
            let totalBytes = 0;
            for (const key in items) {
                if (Object.prototype.hasOwnProperty.call(items, key)) {
                    const item = items[key];
                    const itemSize = JSON.stringify(item).length;
                    totalBytes += itemSize;
                }
            }
            alert(`Total Local Storage Used: ${formatBytes(totalBytes)}`);
        });
    });

    chrome.runtime.onMessage.addListener((request) => {
        if (request.action === 'permissionsUpdated') {
            updateAllPermissionToggles();
        }
    });

    document.addEventListener('change', async (event) => {
        const target = event.target;
        const settingName = target.dataset.settingName;

        if (target.matches('input[type="checkbox"][data-controls-setting]')) {
            const controlledSettingName = target.dataset.controlsSetting;
            const numberInput = document.getElementById(controlledSettingName);
            const settingConfig = findSettingConfig(controlledSettingName);
            const defaultValue =
                settingConfig?.default !== undefined &&
                settingConfig.default > 0
                    ? settingConfig.default
                    : 1;

            if (numberInput) {
                if (!target.checked) {
                    numberInput.value = 0;
                    numberInput.dispatchEvent(
                        new Event('change', { bubbles: true }),
                    );
                } else {
                    const currentValue = parseFloat(numberInput.value) || 0;
                    if (currentValue === 0) {
                        numberInput.value = defaultValue;
                        numberInput.dispatchEvent(
                            new Event('change', { bubbles: true }),
                        );
                    }
                }
            }
        }

        if (!settingName) return;

        if (target.matches('input[type="file"]')) return;

        const savePromises = [];
        let value;

        if (target.matches('input[type="checkbox"]')) {
            value = target.checked;

            if (value) {
                const settingConfig = findSettingConfig(settingName);

                if (settingConfig?.requiredPermissions) {
                    const missingPermissions = [];
                    for (const perm of settingConfig.requiredPermissions) {
                        const hasIt = await hasPermission(perm);
                        if (!hasIt) missingPermissions.push(perm);
                    }

                    if (missingPermissions.length > 0) {
                        const granted =
                            await requestPermission(missingPermissions);

                        if (!granted) {
                            target.checked = false;
                            console.log(
                                `RoValra: Permission denied for ${settingName}`,
                            );
                            return;
                        }
                    }
                }

                if (settingConfig?.exclusiveWith) {
                    settingConfig.exclusiveWith.forEach(
                        (exclusiveSettingName) => {
                            const exclusiveElement = document.querySelector(
                                `#${exclusiveSettingName}`,
                            );
                            if (exclusiveElement?.checked) {
                                exclusiveElement.checked = false;
                                savePromises.push(
                                    handleSaveSettings(
                                        exclusiveSettingName,
                                        false,
                                    ),
                                );
                            }
                        },
                    );
                }
            }

            savePromises.push(handleSaveSettings(settingName, value));
        } else if (target.matches('select')) {
            value = target.value;
            savePromises.push(handleSaveSettings(settingName, value));
            if (settingName === 'profileRenderEnvironment') {
                const userId = await getAuthenticatedUserId();
                if (userId) {
                    const profileEnvs =
                        SETTINGS_CONFIG.Profile.settings.profile3DRenderEnabled
                            .childSettings.profileRenderEnvironment.options;
                    const selectedEnv = profileEnvs.find(
                        (opt) => opt.value === value,
                    );
                    const envId = selectedEnv ? selectedEnv.id : 1;

                    const currentDescription = await getUserDescription(userId);
                    if (currentDescription !== null) {
                        let newDescription = currentDescription
                            .split('\n')
                            .filter((line) => !line.trim().startsWith('e:'))
                            .join('\n')
                            .trim();

                        if (envId !== 1) {
                            if (newDescription) {
                                newDescription += `\n\ne:${envId}`;
                            } else {
                                newDescription = `e:${envId}`;
                            }
                        }

                        if (newDescription !== currentDescription) {
                            await updateUserDescription(userId, newDescription);
                        }
                    }
                }
            }
        } else if (target.matches('input[type="text"], input:not([type])')) {
            value = target.value.trim() === '' ? null : target.value;
            savePromises.push(handleSaveSettings(settingName, value));
        } else if (target.matches('input[type="number"]')) {
            const min = parseFloat(target.min) || 0;
            const max = parseFloat(target.max) || Infinity;
            value = Math.max(min, Math.min(max, parseFloat(target.value) || 0));

            const toggleElement = document.querySelector(
                `[data-controls-setting="${settingName}"]`,
            );
            if (toggleElement) {
                toggleElement.checked = value > 0;
            }
            savePromises.push(handleSaveSettings(settingName, value));
        } else if (target.matches('input[type="color"]')) {
            value = target.value;
            savePromises.push(handleSaveSettings(settingName, value));
        } else {
            return;
        }

        if (savePromises.length === 0) return;

        Promise.all(savePromises)
            .then(async () => {
                const settingsContent = document.querySelector(
                    '#setting-section-content',
                );
                if (settingsContent) {
                    const currentSettings = await loadSettings();
                    updateConditionalSettingsVisibility(
                        settingsContent,
                        currentSettings,
                    );
                    await checkSettingLocks(settingsContent, currentSettings);
                    updateAllPermissionToggles();

                    if (settingName === 'MemoryleakFixEnabled') {
                        chrome.runtime.sendMessage({
                            action: 'toggleMemoryLeakFix',
                            enabled: currentSettings.MemoryleakFixEnabled,
                        });
                    }
                }
            })
            .catch((error) => {
                console.error('Error saving one or more settings:', error);
            });
    });

    document.addEventListener('input', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        if (target.type !== 'color') return;
        const settingName = target.dataset.settingName;
        if (!settingName) return;

        const existing = colorLiveSaveTimeouts.get(settingName);
        if (existing) clearTimeout(existing);
        const timeoutId = setTimeout(() => {
            colorLiveSaveTimeouts.delete(settingName);
            handleSaveSettings(settingName, target.value).catch((error) => {
                console.error('Error saving color setting:', error);
            });
        }, 80);
        colorLiveSaveTimeouts.set(settingName, timeoutId);
    });

    document.addEventListener('click', (event) => {
        const target = event.target;

        const numberButton = target.closest('.rovalra-number-input-btn');
        if (numberButton) {
            const action = numberButton.dataset.action;
            const inputId = numberButton.dataset.target;
            const inputElement = document.getElementById(inputId);
            if (inputElement) {
                const step = parseFloat(inputElement.step) || 1;
                const min = parseFloat(inputElement.min) || 0;
                const max = parseFloat(inputElement.max) || Infinity;
                let currentValue = parseFloat(inputElement.value) || 0;
                currentValue =
                    action === 'increment'
                        ? currentValue + step
                        : currentValue - step;
                inputElement.value = Math.max(min, Math.min(max, currentValue));
                inputElement.dispatchEvent(
                    new Event('change', { bubbles: true }),
                );
            }
        }

        if (target.id?.startsWith('clear-')) {
            const settingName = target.dataset.settingName;
            if (settingName) {
                const fileUploadWrapper = document.querySelector(
                    `[data-setting-name="${settingName}"]`,
                );
                if (fileUploadWrapper && fileUploadWrapper.rovalraFileUpload) {
                    const clearButton = fileUploadWrapper.querySelector(
                        `#${settingName}-clear`,
                    );
                    if (clearButton) clearButton.click();
                } else {
                    handleSaveSettings(settingName, null);
                    target.style.display = 'none';
                }
            }
        }
    });
}
