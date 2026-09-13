import { callRobloxApiJson } from '../api.js';
import { generateSettingInput } from './generateSettings.js';
import { initSettings, syncDonatorTier } from './handlesettings.js';

export async function setBadgeVisibility(badgeName, isVisible) {
    try {
        await callRobloxApiJson({
            isRovalraApi: true,
            subdomain: 'apis',
            endpoint: '/v1/auth/badges/visibility',
            method: 'POST',
            body: { badge: badgeName, visible: isVisible },
        });
    } catch (error) {
        console.error(
            `RoValra: Failed to set badge visibility for ${badgeName}`,
            error,
        );
    }
}

export async function getBadgeVisibilitySettings() {
    const response = await syncDonatorTier();
    if (!response || response.status !== 'success' || !response.badges) {
        return [];
    }

    return Object.keys(response.badges)
        .filter(
            (key) =>
                typeof response.badges[key] === 'boolean' &&
                !key.endsWith('_visible') &&
                response.badges[key] === true,
        )
        .map((key) => ({
            key,
            isVisible: response.badges[`${key}_visible`] !== false,
        }));
}
function updateMainToggleState(mainToggle, childToggles) {
    const someChecked = childToggles.some((t) => t.checked);
    mainToggle.checked = someChecked;
}

export async function createBadgeSettings(container) {
    try {
        const badgeSettings = await getBadgeVisibilitySettings();
        const badgeKeys = badgeSettings.map(({ key }) => key);

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

        const mainToggle = generateSettingInput('ShowAllBadges', {
            type: 'checkbox',
        });
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

            const isVisible =
                badgeSettings.find((badge) => badge.key === key)?.isVisible ??
                true;
            const badgeLabel = key
                .replace(/_/g, ' ')
                .replace(/\b\w/g, (l) => l.toUpperCase());
            const settingName = `ShowBadge_${key}`;

            const childContainer = document.createElement('div');
            childContainer.className = 'child-setting-item';
            childContainer.id = `setting-${settingName}`;

            const childControls = document.createElement('div');
            childControls.className = 'setting-controls';

            const childLabel = document.createElement('label');
            childLabel.textContent = badgeLabel;
            childControls.appendChild(childLabel);

            const childToggle = generateSettingInput(settingName, {
                type: 'checkbox',
            });
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
