import { callRobloxApiJson } from '../api.js';
import { generateSettingInput } from './generateSettings.js';
import { initSettings } from './handlesettings.js';

async function setBadgeVisibility(badgeName, isVisible) {
    try {
        await callRobloxApiJson({
            isRovalraApi: true,
            subdomain: 'apis',
            endpoint: '/v1/auth/badges/visibility',
            method: 'POST',
            body: { badge: badgeName, visible: isVisible },
        });
    } catch (error) {
        console.error(`RoValra: Failed to set badge visibility for ${badgeName}`, error);
    }
}

function updateMainToggleState(mainToggle, childToggles) {
    const someChecked = childToggles.some(t => t.checked);
    mainToggle.checked = someChecked;
}

export async function createBadgeSettings(container) {
    try {
        const response = await callRobloxApiJson({
            isRovalraApi: true,
            subdomain: 'apis',
            endpoint: '/v1/auth/badges',
            method: 'GET',
        });

        if (response.status !== 'success' || !response.badges) {
            return;
        }

        const badges = response.badges;
        const badgeKeys = Object.keys(badges).filter(key => typeof badges[key] === 'boolean' && !key.endsWith('_visible') && badges[key] === true);

        if (badgeKeys.length === 0) {
            return;
        }

        const settingsContent = document.createElement('div');
        settingsContent.id = 'setting-section-content';
        settingsContent.style.cssText = 'padding: 5px; width: 100%;';
        
        const settingContainer = document.createElement('div');
        settingContainer.className = 'setting';
        settingContainer.id = 'setting-container-ShowAllBadges';

        const mainControls = document.createElement('div');
        mainControls.className = 'setting-controls';
        
        const mainLabel = document.createElement('label');
        mainLabel.textContent = 'Toggle your donation badges visibility.';
        mainControls.appendChild(mainLabel);

        const mainToggle = generateSettingInput('ShowAllBadges', { type: 'checkbox' });
        const mainToggleInput = mainToggle.querySelector('input');
        mainControls.appendChild(mainToggle);
        
        settingContainer.appendChild(mainControls);

        const divider = document.createElement('div');
        divider.className = 'setting-label-divider';
        settingContainer.appendChild(divider);

        const childToggles = [];
        let isFirstChild = true;

        for (const key of badgeKeys) {
            if (!isFirstChild) {
                const separator = document.createElement('div');
                separator.className = 'child-setting-separator';
                settingContainer.appendChild(separator);
            }
            isFirstChild = false;

            const isVisible = badges[`${key}_visible`] !== false;
            const badgeLabel = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            const settingName = `ShowBadge_${key}`;

            const childContainer = document.createElement('div');
            childContainer.className = 'child-setting-item';
            childContainer.id = `setting-${settingName}`;
            
            const childControls = document.createElement('div');
            childControls.className = 'setting-controls';

            const childLabel = document.createElement('label');
            childLabel.textContent = badgeLabel;
            childControls.appendChild(childLabel);

            const childToggle = generateSettingInput(settingName, { type: 'checkbox' });
            const childInput = childToggle.querySelector('input');
            childInput.checked = isVisible;
            childControls.appendChild(childToggle);
            
            childContainer.appendChild(childControls);
            settingContainer.appendChild(childContainer);

            childToggles.push(childInput);

            childInput.addEventListener('change', async (event) => {
                const isChecked = event.target.checked;
                await setBadgeVisibility(key, isChecked);
                updateMainToggleState(mainToggleInput, childToggles);
            });
        }
        
        mainToggleInput.addEventListener('change', async (event) => {
            const isChecked = event.target.checked;
            for (const toggle of childToggles) {
                toggle.checked = isChecked;
            }
            for (const key of badgeKeys) {
                await setBadgeVisibility(key, isChecked);
            }
        });
        
        updateMainToggleState(mainToggleInput, childToggles);
        
        settingsContent.appendChild(settingContainer);
        container.appendChild(settingsContent);
        initSettings(settingsContent);

    } catch (error) {
        console.error('RoValra: Failed to create badge settings', error);
    }
}
