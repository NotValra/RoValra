/// <reference types="chrome" />

const settingDeprecations: Record<string, ((value: any, gets: (key: string) => Promise<any>, sets: (key: string, value: any) => void) => void) | undefined> = {
    "EnableGameTrailer": undefined,
    "trustedConnectionsEnabled": undefined,
    "currencyTransferEnabled": undefined,
};


import { loadSettings } from "./handlesettings.js";
import { SETTINGS_CONFIG } from "./settingConfig.js";
import { debugVerbose, flush } from "../debug.js";

const getStoredSettingValue: (s: string) => Promise<any | undefined> = async (setting: string) => {
    const individual = await chrome.storage.local.get({
        [setting]: undefined,
    });

    if (individual[setting] !== undefined) {
        return individual[setting];
    }

    const bundled = await chrome.storage.local.get({
        rovalra_settings: {},
    }) as { rovalra_settings?: Record<string, any>};

    return bundled.rovalra_settings?.[setting];
};

const FLAT_SETTINGS_CONFIG: Record<string, any> = {};

for (const category of Object.values(SETTINGS_CONFIG)) {
    for (const [key, value] of Object.entries(category.settings)) {
        FLAT_SETTINGS_CONFIG[key] = value;
    }
}

const cleanup = (async () => {
    const settings = await chrome.storage.local.get(null);
    for (const [key, value] of Object.entries(settings)) {
        const data = FLAT_SETTINGS_CONFIG[key];
        if (!data)
            continue;  // not a setting
        if (data.default === value) {
            await chrome.storage.local.remove(key);
            debugVerbose(`Cleaning up setting ${key}.`, {value: value, default: data.default});
        }
    }
});

const initPromise = (async () => {
    console.debug("RoValra: Verifying settings compat.");

    let deleted = [];
    let replaced = [];
    for (const [setting, replaceFn] of Object.entries(settingDeprecations)) {
        try {
            let v: any = undefined;
            if ((v = await getStoredSettingValue(setting)) === true) {
                debugVerbose(`Replaced setting ${setting}.`, {replacement: String(replaceFn)});
                if (replaceFn === undefined) {
                    deleted.push(FLAT_SETTINGS_CONFIG[setting].label);
                    if (FLAT_SETTINGS_CONFIG[setting].default === true)
                        await chrome.storage.local.set({[setting]: false});
                    else
                        await chrome.storage.local.remove(setting);
                } else {
                    try {
                        const replacements: Record<string, any> = {};
                        replaceFn(
                            v,
                            async (key) => (await chrome.storage.local.get({[key]: undefined}))[key],
                            (key, newValue) => {replacements[key] = newValue;}
                        );
                        await chrome.storage.local.set(replacements);
                        replaced.push(setting);
                    } catch (e) {
                        console.error(`Failed to update setting ${setting} — unexpected error: `, e);
                    }
                }
            }
        } catch (e) {
            console.error(`Failed to retrieve setting ${setting} for compat checks — unexpected error: `, e);
        }
    }
    const forEachLockedSetting = (key: string, data: Record<string, any>) => {
        const name = data.label;
        deleted.push(name);
    };
    for (const [category, settings] of Object.entries(SETTINGS_CONFIG)) {
        for (const [setting, data] of Object.entries(settings.settings)) {
            if (data['locked'] !== undefined || data['deprecated'] !== undefined) {
                let value = await getStoredSettingValue(setting);
                if (value !== undefined && value !== false) {
                    debugVerbose(`Locked/deprecated setting: ${setting}`, data);
                    forEachLockedSetting(setting, data);
                    if (data.default === false)
                        await chrome.storage.local.remove(setting);
                    else
                        await chrome.storage.local.set({[setting]: false});
                }
            }
        }
    }

    if (replaced.length >= 1) {
        alert(`(RoValra) The following settings have been recently replaced or changed:
    *  ${replaced.join("\n\t*  ")}`);
        debugVerbose(`Replaced/changed ${replaced.length} settings.`, replaced);
    }

    if (deleted.length >= 1) {
        alert(`(RoValra) The following settings have been recently deleted, locked or deprecated:
    *  ${deleted.join("\n    *  ")}`);
        debugVerbose(`Deleted/locked/deprecated ${deleted.length} settings.`, deleted);
    }

    await chrome.storage.local.set({"RoValraSettingsVersion": chrome.runtime.getManifest().version});

    await cleanup();
    flush();

    console.debug("Setting compat checks finished.");
})();

export default initPromise;
