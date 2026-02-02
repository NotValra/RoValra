import { getRegionData } from '../../regions.js';
import { SETTINGS_CONFIG } from '../settingConfig.js';
import { generateSettingsUI } from '../generateSettings.js';
import { initSettings } from '../handlesettings.js';
import { buildSettingsPage } from './settingui.js';
import { updateContent, handleSearch, buttonData, applyTheme } from '../../../features/settings/index.js';
import { createBadgeSettings } from '../badgeSettings.js';

let isSettingsPage = false;


export async function checkRoValraPage() {
    const urlParams = new URLSearchParams(window.location.search);
    const rovalraTab = urlParams.get('rovalra');

    if (!rovalraTab) {
        isSettingsPage = false;
        return;
    }

    document.body.classList.add('rovalra-settings-loading');

    const regionData = await getRegionData().catch(err => {
        console.error("Settings: Failed to load region data.", err);
        return { regions: {}, continents: {} };
    });

    const containerMain = document.querySelector('main.container-main');
    if (!containerMain) {
        return;
    }

    isSettingsPage = true;


    async function loadTabContent(hashKey) {
        if (!hashKey) hashKey = 'info';

        document.querySelectorAll('#unified-menu .menu-option-content').forEach(el => {
            el.classList.remove('active');
            el.removeAttribute('aria-current');
        });

        let targetMenuLink = document.querySelector(`#unified-menu li[id="${hashKey.toLowerCase()}-tab"] a.menu-option-content`);
        if (!targetMenuLink) {
            const capitalizedHash = hashKey.charAt(0).toUpperCase() + hashKey.slice(1);
            targetMenuLink = document.querySelector(`#unified-menu li[data-text="${capitalizedHash}"] a.menu-option-content, #unified-menu li[data-section="${capitalizedHash}"] a.menu-option-content`);
        }

        if (targetMenuLink) {
            targetMenuLink.classList.add('active');
            targetMenuLink.setAttribute('aria-current', 'page');
        } else {
            console.warn(`Menu link for hashKey "${hashKey}" not found. Defaulting to info tab.`);
            const infoLink = document.querySelector(`#unified-menu li[id="info-tab"] a.menu-option-content`);
            if (infoLink) {
                infoLink.classList.add('active');
                infoLink.setAttribute('aria-current', 'page');
            }
        }

        const contentContainer = document.querySelector('#content-container');
        if (!contentContainer) {
            console.error("Content container not found in loadTabContent.");
            return;
        }

        const searchInput = document.getElementById('settings-search-input');
        if (searchInput) {
            searchInput.value = '';
        }

        const lowerHashKey = hashKey.toLowerCase();
        const settingsConfigKey = Object.keys(SETTINGS_CONFIG).find(k => k.toLowerCase() === lowerHashKey);

        contentContainer.innerHTML = ''; 

        if (lowerHashKey === "info" || lowerHashKey === "credits") {
            const buttonInfo = buttonData.find(b => b.text.toLowerCase() === lowerHashKey);
            if (buttonInfo) {
                await updateContent(buttonInfo, contentContainer);
            }
        } else if (settingsConfigKey && SETTINGS_CONFIG[settingsConfigKey]) {
            const settingsContent = document.createElement('div');
            settingsContent.id = 'setting-section-content';
            settingsContent.style.cssText = 'padding: 5px; width: 100%;';
            settingsContent.appendChild(generateSettingsUI(settingsConfigKey, regionData.regions));
            contentContainer.appendChild(settingsContent);

            const settingsContentElement = contentContainer.querySelector('#setting-section-content');
            if (settingsContentElement) {
                initSettings(settingsContentElement);
                await applyTheme();
            }
        } else {
            console.warn("Unknown hashKey for content:", hashKey, "Falling back to info page.");
            const infoButtonData = buttonData.find(b => b.text.toLowerCase() === "info");
            if (infoButtonData) {
                await updateContent(infoButtonData, contentContainer);
            }
        }

        if (lowerHashKey === "profile") {
            await createBadgeSettings(contentContainer);
        }
    }

 
    async function handleHashChange() {
        const urlParams = new URLSearchParams(window.location.search);
        const rovalraTabFromParam = urlParams.get('rovalra');
        const hashPart = window.location.hash.replace('#!/', '').replace('#!', '');
        const currentHash = hashPart || rovalraTabFromParam || 'info';
        await loadTabContent(currentHash);
    }

    window.addEventListener("hashchange", handleHashChange, false);

    const debouncedSearch = (func, wait) => {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    };

    const { rovalraHeader, settingsContainer } = await buildSettingsPage({
        handleSearch: (event) => handleSearch(event, regionData.regions),
        debounce: debouncedSearch,
        loadTabContent,
        buttonData,
        REGIONS: regionData.regions,
        initSettings
    });

    if (rovalraHeader && settingsContainer) {
        const unifiedMenu = document.getElementById('unified-menu');
        await loadTabContent(rovalraTab || 'info');
        await applyTheme();
    }
}