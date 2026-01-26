import { SETTINGS_CONFIG } from './settingConfig.js';
import { findSettingConfig } from './generateSettings.js';
import { getFullRegionName, REGIONS } from '../regions.js';
import { sanitizeString } from '../utils/sanitize.js';


export const loadSettings = async () => {
    return new Promise((resolve, reject) => {
        const defaultSettings = {};
        for (const category of Object.values(SETTINGS_CONFIG)) {
            for (const [settingName, settingDef] of Object.entries(category.settings)) {
                if (settingDef.default !== undefined) {
                    defaultSettings[settingName] = settingDef.default;
                }
                if (settingDef.childSettings) {
                    for (const [childName, childSettingDef] of Object.entries(settingDef.childSettings)) {
                        if (childSettingDef.default !== undefined) {
                            defaultSettings[childName] = childSettingDef.default;
                        }
                    }
                }
            }
        }

        chrome.storage.local.get(defaultSettings, (settings) => {
            if (chrome.runtime.lastError) {
                console.error('Failed to load settings:', chrome.runtime.lastError);
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
                        console.warn(`Invalid boolean value for '${settingName}' - coercing to boolean`);
                        sanitizedValue = Boolean(value);
                    }
                    break;
                    
                case 'number': {
                    const numValue = Number(value);
                    if (isNaN(numValue)) {
                        console.warn(`Invalid number value for '${settingName}' - setting to default`);
                        sanitizedValue = settingConfig.default ?? 0;
                    } else {
                        sanitizedValue = numValue;
                        if (settingConfig.min !== undefined && sanitizedValue < settingConfig.min) {
                            sanitizedValue = settingConfig.min;
                        }
                        if (settingConfig.max !== undefined && sanitizedValue > settingConfig.max) {
                            sanitizedValue = settingConfig.max;
                        }
                    }
                    break;
                }
                    
                case 'text':
                case 'input':
                case 'select':
                    if (value === null) {
                        sanitizedValue = null;
                    } else if (typeof value === 'string') {
                        sanitizedValue = sanitizeString(value);
                        
                        if (settingConfig.type === 'select' && settingConfig.options) {
                            const validValues = Array.isArray(settingConfig.options) 
                                ? settingConfig.options.map(opt => typeof opt === 'object' ? opt.value : opt)
                                : [];
                            
                            if (validValues.length > 0 && !validValues.includes(sanitizedValue)) {
                                console.warn(`Invalid select value '${sanitizedValue}' for '${settingName}' - setting to default`);
                                sanitizedValue = settingConfig.default ?? validValues[0];
                            }
                        }
                    } else {
                        console.warn(`Invalid string value for '${settingName}' - converting to string and sanitizing`);
                        sanitizedValue = sanitizeString(String(value));
                    }
                    break;
                    
                case 'file':
                    if (value !== null && (typeof value !== 'string' || !value.startsWith('data:image/'))) {
                        console.warn('Attempted to save non-image data to file setting:', settingName);
                        sanitizedValue = null;
                    }
                    break;
            }
        }
        
        const settings = { [settingName]: sanitizedValue };

        return new Promise((resolve, reject) => {
            chrome.storage.local.set(settings, () => {
                if (chrome.runtime.lastError) {
                    console.error('Failed to save setting:', settingName, chrome.runtime.lastError);
                    reject(chrome.runtime.lastError);
                } else {
                    syncToSettingsKey(settingName, sanitizedValue);
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
            for (const [settingName, settingDef] of Object.entries(category.settings)) {
                allSettingKeys.push(settingName);
                if (settingDef.childSettings) {
                    for (const childName of Object.keys(settingDef.childSettings)) {
                        allSettingKeys.push(childName);
                    }
                }
            }
        }

        chrome.storage.local.get(allSettingKeys, (currentSettings) => {
            chrome.storage.local.set({ rovalra_settings: currentSettings }, () => {
                if (chrome.runtime.lastError) {
                    console.error('Failed to build settings key:', chrome.runtime.lastError);
                } else {
                    console.log('RoValra: Settings key initialized');
                }
                resolve();
            });
        });
    });
};


export const initSettings = async (settingsContent) => {
    if (!settingsContent) {
        console.error("settingsContent is null in initSettings! Check HTML structure.");
        return;
    }
    const settings = await loadSettings();


    if (settings) {
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
                        console.log(`RoValra: Disabling '${settingName}' because required permissions are missing.`);
                        await handleSaveSettings(settingName, false);
                        settings[settingName] = false;
                    }
                }
            }
        }
    }

    if (settings) {
        for (const sectionName in SETTINGS_CONFIG) {
            const section = SETTINGS_CONFIG[sectionName];
            for (const [settingName, setting] of Object.entries(section.settings)) {
                const element = settingsContent.querySelector(`#${settingName}`);
                if (element) {
                    if (setting.type === 'checkbox') {
                        element.checked = settings[settingName] !== undefined ? settings[settingName] : setting.default;
                    } else if (setting.type === 'select') {
                        const savedValue = settings[settingName] || setting.default;
                        element.value = savedValue;
                        
                        if (element._dropdownApi) {
                            element._dropdownApi.setValue(savedValue);
                        }
                    } else if (setting.type === 'input') {
                        element.value = settings[settingName] || '';
                    } else if (setting.type === 'file') {
                        const fileUploadWrapper = settingsContent.querySelector(`[data-setting-name="${settingName}"]`);
                        const previewElement = settingsContent.querySelector(`#preview-${settingName}`);
                        const customLogoData = settings[settingName];

                        if (fileUploadWrapper && fileUploadWrapper.rovalraFileUpload) {
                            const { setFileName, showClear } = fileUploadWrapper.rovalraFileUpload;
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
                                if (previewElement) previewElement.style.display = 'none';
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
                    for (const [childName, childSetting] of Object.entries(setting.childSettings)) {
                        const childElement = settingsContent.querySelector(`#${childName}`);
                        if (childElement) {
                            if (childSetting.type === 'checkbox') {
                                childElement.checked = settings[childName] !== undefined ? settings[childName] : childSetting.default;
                            } else if (childSetting.type === 'select') {
                                const savedValue = settings[childName] || childSetting.default;
                                childElement.value = savedValue;

                                if (childElement._dropdownApi) {
                                    childElement._dropdownApi.setValue(savedValue);
                                }

                                if (childName === 'robloxPreferredRegion' && childElement.options.length === 0) {
                                    Object.keys(REGIONS).forEach(regionCode => {
                                        const option = document.createElement('option');
                                        option.value = regionCode;
                                        option.textContent = getFullRegionName(regionCode);
                                        childElement.appendChild(option);
                                    });
                                }
                            } else if (childSetting.type === 'input') {
                                childElement.value = settings[childName] || '';
                            } else if (childSetting.type === 'number') {
                                const currentValue = settings[childName] !== undefined ? settings[childName] : childSetting.default;
                                childElement.value = currentValue;
                                const toggleElement = settingsContent.querySelector(`#${childName}-enabled`);
                                if (toggleElement) {
                                    const isEnabled = currentValue > 0;
                                    toggleElement.checked = isEnabled;
                                }
                            } else if (childSetting.type === 'file') {
                                const previewElement = settingsContent.querySelector(`#preview-${childName}`);
                                const clearButton = settingsContent.querySelector(`#clear-${childName}`);
                                if (previewElement && settings[childName]) {
                                    previewElement.src = settings[childName];
                                    previewElement.style.display = 'block';
                                    if (clearButton) clearButton.style.display = 'inline-block';
                                } else if (previewElement) {
                                    previewElement.style.display = 'none';
                                    if (clearButton) clearButton.style.display = 'none';
                                }
                            }
                        }
                    }
                }
            }
        }
        updateConditionalSettingsVisibility(settingsContent, settings);
        if (document.querySelector('.permission-manager')) {
            updateAllPermissionToggles();
        }
    };
    settingsContent.querySelectorAll('.permission-toggle').forEach(toggle => {
        toggle.addEventListener('change', handlePermissionToggle);
    });
};


function applyDisabledState(settingName, parentElement, isDisabled, isPermissionRelated = false) {
    const inputElement = parentElement.querySelector(`[data-setting-name="${settingName}"]`);
    if (!inputElement) return;

    const wrapper = inputElement.closest('.child-setting-item') || inputElement.closest('.setting');
    if (!wrapper) return;
    
    const toggleSwitch = wrapper.querySelector('.setting-controls > .toggle-switch');

    if (isDisabled && isPermissionRelated) {
        if (toggleSwitch) {
            toggleSwitch.style.opacity = '0.5';
            toggleSwitch.style.pointerEvents = 'none';
        }
        if (inputElement.type === 'checkbox') inputElement.disabled = true;
    } else if (isDisabled) {
        wrapper.classList.add('disabled-setting');
        wrapper.style.opacity = '0.5';
        wrapper.style.pointerEvents = 'none';
        wrapper.querySelectorAll('input, select, button').forEach(el => { el.disabled = true; });
    } else {
        wrapper.classList.remove('disabled-setting');
        wrapper.style.opacity = '1';
        wrapper.style.pointerEvents = 'auto';
        wrapper.querySelectorAll('input, select, button').forEach(el => { el.disabled = false; });
        if (toggleSwitch) {
            toggleSwitch.style.opacity = '1';
            toggleSwitch.style.pointerEvents = 'auto';
        }
    }
}


export function updateConditionalSettingsVisibility(settingsContent, currentSettings) {
    if (!settingsContent || !currentSettings) {
        return;
    }

    const settingsToDisable = new Set();

    for (const [settingName, isEnabled] of Object.entries(currentSettings)) {
        const config = findSettingConfig(settingName);
        if (!config) continue;

        if (config.childSettings) {
            for (const [childName, childConfig] of Object.entries(config.childSettings)) {
                if (childConfig.condition) {
                    if (currentSettings[childConfig.condition.parent] !== childConfig.condition.value) {
                        settingsToDisable.add(childName);
                    }
                } else if (config.type === 'checkbox' && !isEnabled) {
                    settingsToDisable.add(childName);
                }
            }
        }
    }

    const allSettingElements = settingsContent.querySelectorAll('[data-setting-name]');
    allSettingElements.forEach(element => {
        const settingName = element.dataset.settingName;
        applyDisabledState(settingName, settingsContent, settingsToDisable.has(settingName));
    });
    
    document.querySelectorAll('.permission-manager').forEach(manager => {
        const isGranted = manager.querySelector('.permission-revoke-ui').style.display === 'block';
        if (!isGranted) {
            const settingName = manager.dataset.permissionFor;
            applyDisabledState(settingName, settingsContent, true, true);
        }
    });

    const numberToggles = settingsContent.querySelectorAll('input[type="checkbox"][data-controls-setting]');
    numberToggles.forEach(toggle => {
        const controlledSettingName = toggle.dataset.controlsSetting;
        const numberInputContainer = settingsContent.querySelector(`#${controlledSettingName}`)?.closest('.rovalra-number-input-container');
        if (numberInputContainer) {
            const isDisabled = !toggle.checked;
            numberInputContainer.style.opacity = isDisabled ? '0.5' : '1';
            numberInputContainer.style.pointerEvents = isDisabled ? 'none' : 'auto';
            numberInputContainer.querySelectorAll('input, button').forEach(el => el.disabled = isDisabled);
        }
    });
}


async function hasPermission(permission) {
    return new Promise(resolve => {
        chrome.runtime.sendMessage({ action: 'checkPermission', permission: permission }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("RoValra: Error checking permission:", chrome.runtime.lastError.message);
                resolve(false);
            }
            resolve(response?.granted || false);
        });
    });
}


async function requestPermission(permission) {
    return new Promise(resolve => {
        chrome.runtime.sendMessage({ action: 'requestPermission', permission: permission }, (response) => {
            if (chrome.runtime.lastError) {
                console.warn(`RoValra: Permission request for '${permission}' failed or was dismissed:`, chrome.runtime.lastError.message);
                resolve(false);
            }
            resolve(response?.granted || false);
        });
    });
}


async function revokePermission(permission) {
    return new Promise(resolve => {
        chrome.runtime.sendMessage({ action: 'revokePermission', permission: permission }, (response) => {
            if (chrome.runtime.lastError) {
                console.error(`RoValra: Failed to revoke '${permission}' permission:`, chrome.runtime.lastError.message);
                resolve(false);
            }
            resolve(response?.revoked || false);
        });
    });
}


export async function updateAllPermissionToggles() {
    const settings = await loadSettings();
    const permissionManagers = document.querySelectorAll('.permission-manager');
    for (const manager of permissionManagers) {
        const permissionName = manager.dataset.permissionName;
        const isGranted = await hasPermission(permissionName);
        const requestUI = manager.querySelector('.permission-request-ui');
        const revokeUI = manager.querySelector('.permission-revoke-ui');
        const revokeToggle = manager.querySelector('.permission-toggle');

        if (requestUI) requestUI.style.display = isGranted ? 'none' : 'block';
        if (revokeUI) revokeUI.style.display = isGranted ? 'block' : 'none';

        if (revokeToggle) {
            revokeToggle.checked = isGranted;
        }
    }
    updateConditionalSettingsVisibility(document, settings);
}


export async function handlePermissionToggle(event) {
    const toggle = event.target;
    const permissionName = toggle.dataset.permissionName;

    if (!toggle.checked) { 
        const wasRevoked = await revokePermission(permissionName);
        if (!wasRevoked) {
            toggle.checked = true;
        } else {
            console.log(`RoValra: Permission '${permissionName}' revoked.`);
        }
    }
    await updateAllPermissionToggles();
}


export function initializeSettingsEventListeners() {
    document.addEventListener('change', async (event) => {
        const target = event.target;
        const settingName = target.dataset.settingName;

        if (target.matches('input[type="checkbox"][data-controls-setting]')) {
            const controlledSettingName = target.dataset.controlsSetting;
            const numberInput = document.getElementById(controlledSettingName);
            const settingConfig = findSettingConfig(controlledSettingName);
            const defaultValue = (settingConfig?.default !== undefined && settingConfig.default > 0) ? settingConfig.default : 1;

            if (numberInput) {
                if (!target.checked) {
                    numberInput.value = 0;
                    numberInput.dispatchEvent(new Event('change', { bubbles: true }));
                } else {
                    const currentValue = parseFloat(numberInput.value) || 0;
                    if (currentValue === 0) {
                        numberInput.value = defaultValue;
                        numberInput.dispatchEvent(new Event('change', { bubbles: true }));
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
                        const granted = await requestPermission(missingPermissions);
                        
                        if (!granted) {
                            target.checked = false;
                            console.log(`RoValra: Permission denied for ${settingName}`);
                            return; 
                        }
                    }
                }

                if (settingConfig?.exclusiveWith) {
                    settingConfig.exclusiveWith.forEach(exclusiveSettingName => {
                        const exclusiveElement = document.querySelector(`#${exclusiveSettingName}`);
                        if (exclusiveElement?.checked) {
                            exclusiveElement.checked = false;
                            savePromises.push(handleSaveSettings(exclusiveSettingName, false));
                        }
                    });
                }
            }
            
            savePromises.push(handleSaveSettings(settingName, value));

        } else if (target.matches('select')) {
            value = target.value;
            savePromises.push(handleSaveSettings(settingName, value));
        } else if (target.matches('input[type="text"], input:not([type])')) {
            value = target.value.trim() === '' ? null : target.value;
            savePromises.push(handleSaveSettings(settingName, value));
        } else if (target.matches('input[type="number"]')) {
            const min = parseFloat(target.min) || 0;
            const max = parseFloat(target.max) || Infinity;
            value = Math.max(min, Math.min(max, parseFloat(target.value) || 0));
            
            const toggleElement = document.querySelector(`[data-controls-setting="${settingName}"]`);
            if (toggleElement) {
                toggleElement.checked = value > 0;
            }
            savePromises.push(handleSaveSettings(settingName, value));
        } else {
            return;
        }

        if (savePromises.length === 0) return;

        Promise.all(savePromises).then(async () => {
            const settingsContent = document.querySelector('#setting-section-content');
            if (settingsContent) {
                const currentSettings = await loadSettings();
                updateConditionalSettingsVisibility(settingsContent, currentSettings);
                updateAllPermissionToggles();

                if (settingName === 'MemoryleakFixEnabled') {
                    chrome.runtime.sendMessage({ action: 'toggleMemoryLeakFix', enabled: currentSettings.MemoryleakFixEnabled });
                }
            }
        }).catch(error => {
            console.error("Error saving one or more settings:", error);
        });
    });

    document.addEventListener('click', (event) => {
        const target = event.target;

        if (target.classList.contains('permission-request-btn')) {
            const permissions = JSON.parse(target.dataset.permissions);
            requestPermission(permissions).then(granted => {
                if (granted) { updateAllPermissionToggles(); }
            });
        }

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
                currentValue = (action === 'increment') ? currentValue + step : currentValue - step;
                inputElement.value = Math.max(min, Math.min(max, currentValue));
                inputElement.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
        
        if (target.id?.startsWith('clear-')) {
            const settingName = target.dataset.settingName;
            if (settingName) {
                const fileUploadWrapper = document.querySelector(`[data-setting-name="${settingName}"]`);
                if (fileUploadWrapper && fileUploadWrapper.rovalraFileUpload) {
                    const clearButton = fileUploadWrapper.querySelector(`#${settingName}-clear`);
                    if (clearButton) clearButton.click();
                } else {
                    handleSaveSettings(settingName, null);
                    target.style.display = 'none';
                }
            }
        }
    });
}