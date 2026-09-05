import { SETTINGS_CONFIG } from '../settings/settingConfig.js';
import { createToggle } from '../ui/general/toggle.js';
import { ts } from '../locale/i18n.js';
import {
    registerProfileEditCategory,
    registerProfileEditFeature,
} from './profileEditRegistry.js';

const profileSettings = SETTINGS_CONFIG.Profile.settings;

function getSetting(name, parentName) {
    return parentName
        ? profileSettings[parentName]?.childSettings?.[name]
        : profileSettings[name];
}

async function createSettingsOverlay(entries) {
    const [{ loadSettings }, { generateSingleSettingHTML }] = await Promise.all(
        [
            import('../settings/handlesettings.js'),
            import('../settings/generateSettings.js'),
        ],
    );
    const settings = await loadSettings().catch(() => ({}));
    const body = document.createElement('div');
    body.style.cssText = 'color:var(--rovalra-main-text-color);';
    const panels = [];

    for (const { name, setting } of entries) {
        if (!setting) continue;
        if (setting.type === 'checkbox') {
            const row = document.createElement('div');
            row.className = 'setting-controls';
            const label = document.createElement('label');
            label.textContent = setting.label;
            const toggle = createToggle({
                id: name,
                checked: settings[name] === true,
                onChange: async (checked) => {
                    const { handleSaveSettings } =
                        await import('../settings/handlesettings.js');
                    await handleSaveSettings(name, checked);
                    updateChildren();
                },
            });
            row.append(label, toggle);
            body.appendChild(row);
            panels.push({ name, setting, element: row, toggle });
            continue;
        }

        const element = generateSingleSettingHTML(name, {
            ...setting,
            hideContributors: true,
        });
        body.appendChild(element);
        const currentValue = settings[name];
        const input = element.querySelector(`#${name}`);
        if (setting.type === 'select' && input && currentValue) {
            input.value = currentValue;
            input.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (setting.type === 'gradient' && currentValue) {
            element
                .querySelector(`#${name}`)
                ?.rovalraGradientApi?.setValue(currentValue);
        }
        panels.push({ name, setting, element });
    }

    function updateChildren() {
        for (const panel of panels) {
            if (!panel.setting.parentName) continue;
            const parent = panels.find(
                ({ name }) => name === panel.setting.parentName,
            );
            if (!parent) continue;
            const enabled = parent.toggle.classList.contains('on');
            panel.element.style.opacity = enabled ? '1' : '0.5';
            panel.element.style.pointerEvents = enabled ? '' : 'none';
        }
    }
    updateChildren();

    return {
        title: ts('profileEdit.featuresTitle'),
        bodyContent: body,
        showLogo: true,
        maxWidth: '650px',
        titleFontSize: '22px',
    };
}

const child = (name, parentName) => ({
    name,
    setting: { ...getSetting(name, parentName), parentName },
});

registerProfileEditCategory({
    id: 'donator-perks',
    label: ts('profileEdit.donatorPerks'),
    labelKey: 'profileEdit.donatorPerks',
});
registerProfileEditFeature('donator-perks', {
    id: 'donatorPerks',
    label: ts('profileEdit.donatorPerks'),
    labelKey: 'profileEdit.donatorPerks',
    onOpen: () =>
        createSettingsOverlay([
            {
                name: 'profileBackgroundGradientEnabled',
                setting: getSetting('profileBackgroundGradientEnabled'),
            },
            child('profileGradient', 'profileBackgroundGradientEnabled'),
            {
                name: 'displayNameGradientEnabled',
                setting: getSetting('displayNameGradientEnabled'),
            },
            child('displayNameGradient', 'displayNameGradientEnabled'),
            child('displayNameGradientEffect', 'displayNameGradientEnabled'),
        ]),
});

registerProfileEditCategory({
    id: 'username-customizations',
    label: ts('profileEdit.usernameCustomizations'),
    labelKey: 'profileEdit.usernameCustomizations',
});
registerProfileEditFeature('username-customizations', {
    id: 'usernameCustomizations',
    label: ts('profileEdit.usernameCustomizations'),
    labelKey: 'profileEdit.usernameCustomizations',
    onOpen: () =>
        createSettingsOverlay([
            { name: 'usernameColor', setting: getSetting('usernameColor') },
            {
                name: 'displayNameGradientEnabled',
                setting: getSetting('displayNameGradientEnabled'),
            },
            child('displayNameGradient', 'displayNameGradientEnabled'),
            child('displayNameGradientEffect', 'displayNameGradientEnabled'),
        ]),
});
