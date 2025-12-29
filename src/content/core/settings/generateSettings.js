import { SETTINGS_CONFIG } from './settingConfig.js';
import { parseMarkdown } from '../utils/markdown.js';
import { getFullRegionName, REGIONS, getContinent } from '../regions.js';
import { getCurrentTheme, THEME_CONFIG } from '../theme.js';
import { createDropdown } from '../ui/dropdown.js';
import { createFileUpload } from '../ui/fileupload.js';
import { createPill } from '../ui/general/pill.js';
import { handleSaveSettings } from './handlesettings.js';
import { createStyledInput } from '../ui/catalog/input.js'; 
import DOMPurify from 'dompurify';


export function findSettingConfig(settingName) {
    for (const category of Object.values(SETTINGS_CONFIG)) {
        for (const [parentSettingName, parentSettingDef] of Object.entries(category.settings)) {
            if (parentSettingName === settingName) {
                return parentSettingDef;
            }
            if (parentSettingDef.childSettings && parentSettingDef.childSettings[settingName]) {
                return parentSettingDef.childSettings[settingName];
            }
        }
    }
    return null;
}

export function generateSettingInput(settingName, setting, REGIONS = {}) {
    const theme = getCurrentTheme();

    if (setting.type === 'checkbox') {
        const toggleClass = setting.disabled ? 'toggle-switch1' : 'toggle-switch';
        const label = document.createElement('label');
        label.className = toggleClass;
        label.innerHTML = DOMPurify.sanitize(`
            <input type="checkbox" id="${settingName}" data-setting-name="${settingName}"${setting.disabled ? ' disabled' : ''}>
            <span class="${setting.disabled ? 'slider1' : 'slider'}"></span>`);
        return label;
    } else if (setting.type === 'select') {
        let dropdownOptions = [];
        if (setting.options === 'REGIONS') {
            dropdownOptions.push({ value: 'AUTO', label: getFullRegionName("AUTO") });
            
            const regionsByContinent = {};
            Object.keys(REGIONS).filter(rc => rc !== "AUTO").forEach(regionCode => {
                const region = REGIONS[regionCode];
                const countryCode = regionCode.split('-')[0];
                const continent = getContinent(countryCode);
                
                if (!regionsByContinent[continent]) {
                    regionsByContinent[continent] = [];
                }
                
                regionsByContinent[continent].push({
                    value: regionCode,
                    label: getFullRegionName(regionCode),
                    group: continent
                });
            });
            
            Object.values(regionsByContinent).forEach(regions => {
                regions.sort((a, b) => a.label.localeCompare(b.label));
            });
            
            const continentOrder = ['North America', 'South America', 'Europe', 'Asia', 'Africa', 'Oceania', 'Other'];
            continentOrder.forEach(continent => {
                if (regionsByContinent[continent]) {
                    dropdownOptions.push(...regionsByContinent[continent]);
                }
            });
        } else if (Array.isArray(setting.options)) {
            dropdownOptions = setting.options;
        }

        const dropdown = createDropdown({
            items: dropdownOptions,
            initialValue: setting.default,
            showFlags: setting.showFlags || false,
            onValueChange: (value) => {

                const hiddenSelect = document.getElementById(settingName);
                if (hiddenSelect) {
                    hiddenSelect.value = value;
                    hiddenSelect.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
        });

        const tempDiv = document.createElement('div');
        tempDiv.style.position = 'absolute';
        tempDiv.style.visibility = 'hidden';
        tempDiv.style.height = 'auto';
        tempDiv.style.width = 'auto';
        tempDiv.style.whiteSpace = 'nowrap';
        tempDiv.style.fontSize = '14px'; 
        tempDiv.style.fontWeight = '500'; 
        document.body.appendChild(tempDiv);
        let maxItemWidth = 0;
        dropdownOptions.forEach(item => {
            tempDiv.textContent = item.label;
            maxItemWidth = Math.max(maxItemWidth, tempDiv.clientWidth);
        });
        document.body.removeChild(tempDiv);

        const hiddenSelect = document.createElement('select');
        hiddenSelect.id = settingName;
        hiddenSelect.dataset.settingName = settingName;
        hiddenSelect.style.display = 'none';
        dropdownOptions.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label;
            hiddenSelect.appendChild(option);
        });

        const wrapper = document.createElement('div');
        wrapper.style.marginLeft = 'auto';

        if (maxItemWidth > 0) {
            dropdown.element.style.minWidth = `${maxItemWidth + 60}px`;
        }
        
        hiddenSelect._dropdownApi = dropdown;
        
        wrapper.append(dropdown.element, hiddenSelect);
        return wrapper;

    } 
    else if (setting.type === 'input') {
        const { container, input } = createStyledInput({
            id: settingName,
            label: setting.placeholder || 'Enter value', 
            placeholder: ' ' 
        });

        input.dataset.settingName = settingName;
        
        container.style.marginLeft = 'auto';
        container.style.width = '200px'; 
        
        return container;
    } 
    else if (setting.type === 'file') {
        const fileUpload = createFileUpload({
            id: settingName,
            compress: setting.compress !== false, 
            compressSettingName: setting.compressSettingName, 
            onFileSelect: (base64Data) => {
                handleSaveSettings(settingName, base64Data);
            },
            onFileClear: () => {
                handleSaveSettings(settingName, null);
            }
        });
        fileUpload.element.dataset.settingName = settingName;
        fileUpload.element._uploadApi = fileUpload;
        return fileUpload.element;
    }
    else if (setting.type === 'number') {
        const wrapper = document.createElement('div');
        wrapper.className = 'rovalra-number-input-wrapper';
        wrapper.style.cssText = 'display: flex; align-items: center; gap: 12px; margin-left: auto;';
        wrapper.innerHTML = DOMPurify.sanitize(`
            <div class="rovalra-number-input-container" style="display: flex; align-items: center; gap: 8px; background-color: var(--rovalra-container-background-color); padding: 4px; border-radius: 8px;">
                <button type="button" class="rovalra-number-input-btn btn-control-xs" data-action="decrement" data-target="${settingName}" style="width: 32px; height: 32px; padding: 0; line-height: 0; border: none;">
                    <svg class="MuiSvgIcon-root MuiSvgIcon-fontSizeMedium css-1phnduy" focusable="false" aria-hidden="true" viewBox="0 0 24 24" style="width: 20px; height: 20px; fill: var(--rovalra-main-text-color);"><path d="M19 13H5v-2h14z"></path></svg>
                </button>
                <input type="number" id="${settingName}" data-setting-name="${settingName}" class="setting-number-input" 
                       min="${setting.min || 0}" max="${setting.max || 100}" step="${setting.step || 1}"
                       style="width: 60px; text-align: center; -moz-appearance: textfield; appearance: textfield; border-radius: 6px; border: 1px solid var(--rovalra-border-color); background-color: var(--rovalra-main-background-color); color: var(--rovalra-main-text-color); padding: 8px; font-weight: 500;">
                <button type="button" class="rovalra-number-input-btn btn-control-xs" data-action="increment" data-target="${settingName}" style="width: 32px; height: 32px; padding: 0; line-height: 0; border: none;">
                    <svg class="MuiSvgIcon-root MuiSvgIcon-fontSizeMedium css-1phnduy" focusable="false" aria-hidden="true" viewBox="0 0 24 24" style="width: 20px; height: 20px; fill: var(--rovalra-main-text-color);"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z"></path></svg>
                </button>
            </div>
            <label class="toggle-switch">
                <input type="checkbox" id="${settingName}-enabled" data-setting-name="${settingName}-enabled" data-controls-setting="${settingName}">
                <span class="slider"></span>
            </label>`);
        return wrapper;
    }
    return document.createElement('div'); 
}

export function generateSingleSettingHTML(settingName, setting, REGIONS = {}) {
    const themeColors = THEME_CONFIG[getCurrentTheme()] || THEME_CONFIG.dark;
    const settingContainer = document.createElement('div');
    settingContainer.className = 'setting';
    settingContainer.id = `setting-container-${settingName}`;

    const controlsContainer = document.createElement('div');
    controlsContainer.className = 'setting-controls';

    const label = document.createElement('label');
    label.textContent = setting.label;
    controlsContainer.appendChild(label);
    
    if (setting.experimental) {
        const experimentalPill = createPill('Experimental', setting.experimental, 'experimental');
        controlsContainer.appendChild(experimentalPill);
    }
    if (setting.beta) {
        const betaPill = createPill('Beta', setting.beta, 'beta');
        controlsContainer.appendChild(betaPill);
    }
    if (setting.deprecated) {
        const deprecatedPill = createPill('Deprecated', setting.deprecated, 'deprecated');
        controlsContainer.appendChild(deprecatedPill);
    }

    const inputElement = generateSettingInput(settingName, setting, REGIONS);
    controlsContainer.appendChild(inputElement);
    settingContainer.appendChild(controlsContainer);

    const divider = document.createElement('div');
    divider.className = 'setting-label-divider';
    settingContainer.appendChild(divider);

    if (setting.description) {
        const descriptions = Array.isArray(setting.description) ? setting.description : [String(setting.description)];
        descriptions.forEach(desc => {
            const descElement = document.createElement('div');
            descElement.className = 'setting-description';
            descElement.innerHTML = DOMPurify.sanitize(parseMarkdown(desc, themeColors));
            settingContainer.appendChild(descElement);
        });
    }

    if (setting.type === 'file') {
        const uploadElement = inputElement;
        const uploadApi = uploadElement._uploadApi || uploadElement.rovalraFileUpload;
        
        if (uploadApi) {
            const previewElement = uploadApi.getPreviewElement();
            settingContainer.appendChild(previewElement);
            
            chrome.storage.local.get([settingName], (result) => {
                if (result[settingName]) {
                    const base64Data = result[settingName];
                    
                    if (!base64Data || typeof base64Data !== 'string' || !base64Data.startsWith('data:image/')) {
                        console.warn('Invalid image data detected for', settingName, '- clearing');
                        chrome.storage.local.set({ [settingName]: null });
                        return;
                    }
                    
                    const size = Math.round((base64Data.length * 3) / 4);
                    uploadApi.setPreview(base64Data, size);
                }
            });
        } else {
            console.error('Upload API not found for', settingName);
        }
    }

    if (setting.childSettings) {
        for (const [childName, childSetting] of Object.entries(setting.childSettings)) {
            const separator = document.createElement('div');
            separator.className = 'child-setting-separator';
            settingContainer.appendChild(separator);

            const childContainer = document.createElement('div');
            childContainer.className = 'child-setting-item';
            childContainer.id = `setting-${childName}`;
            if (childSetting.condition) {
                childContainer.style.display = 'none';
            }

            const childControls = document.createElement('div');
            childControls.className = 'setting-controls';

            const childLabel = document.createElement('label');
            childLabel.textContent = childSetting.label;
            childControls.appendChild(childLabel);
            
            if (childSetting.experimental) {
                const experimentalPill = createPill('Experimental', childSetting.experimental, 'experimental');
                childControls.appendChild(experimentalPill);
            }
            if (childSetting.beta) {
                const betaPill = createPill('Beta', childSetting.beta, 'beta');
                childControls.appendChild(betaPill);
            }
            if (childSetting.deprecated) {
                const deprecatedPill = createPill('Deprecated', childSetting.deprecated, 'deprecated');
                childControls.appendChild(deprecatedPill);
            }

            const childInput = generateSettingInput(childName, childSetting, REGIONS);
            childControls.appendChild(childInput);
            childContainer.appendChild(childControls);

            const childDivider = document.createElement('div');
            childDivider.className = 'setting-label-divider';
            childContainer.appendChild(childDivider);

            if (childSetting.description) {
                const childDescriptions = Array.isArray(childSetting.description) ? childSetting.description : [String(childSetting.description)];
                childDescriptions.forEach(desc => {
                    const childDescElement = document.createElement('div');
                    childDescElement.className = 'setting-description';
                    childDescElement.innerHTML = DOMPurify.sanitize(parseMarkdown(desc, themeColors));
                    childContainer.appendChild(childDescElement);
                });
            }
            
            if (childSetting.type === 'file') {
                const uploadElement = childInput;
                const uploadApi = uploadElement._uploadApi || uploadElement.rovalraFileUpload;
                
                if (uploadApi) {
                    const previewElement = uploadApi.getPreviewElement();
                    childContainer.appendChild(previewElement);
                    
                    chrome.storage.local.get([childName], (result) => {
                        if (result[childName]) {
                            const base64Data = result[childName];
                            
                            if (!base64Data || typeof base64Data !== 'string' || !base64Data.startsWith('data:image/')) {
                                console.warn('Invalid image data detected for', childName, '- clearing');
                                chrome.storage.local.set({ [childName]: null });
                                return;
                            }
                            
                            const size = Math.round((base64Data.length * 3) / 4);
                            uploadApi.setPreview(base64Data, size);
                        }
                    });
                } else {
                    console.error('Child upload API not found for', childName);
                }
            }
            
            settingContainer.appendChild(childContainer);
        }
    }

    return settingContainer;
}

export function generateSettingsUI(section, REGIONS = {}) {
    const fragment = document.createDocumentFragment();
    const sectionConfig = SETTINGS_CONFIG[section];

    if (!sectionConfig) return fragment;

    for (const [settingName, setting] of Object.entries(sectionConfig.settings)) {
        fragment.appendChild(generateSingleSettingHTML(settingName, setting, REGIONS));
    }

    return fragment;
}