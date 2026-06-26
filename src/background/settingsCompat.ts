/// <reference types="chrome" />

const settingDeprecations: Record<string, ((value: any, gets: (key: string) => Promise<any>, sets: (key: string, value: any) => void) => void) | undefined> = {
    "EnableGameTrailer": undefined,
    "trustedConnectionsEnabled": undefined,
    "currencyTransferEnabled": undefined,
};


import { SETTINGS_CONFIG } from "../content/core/settings/settingConfig.js";
import { debugVerbose } from "../content/core/debugManager.js";

let compatResults: { replaced: string[]; deleted: string[] } | null = null;

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
    // Removed for data safety purposes
    //
    //const settings = await chrome.storage.local.get(null);
    //for (const [key, value] of Object.entries(settings)) {
    //    const data = FLAT_SETTINGS_CONFIG[key];
    //    if (!data)
    //        continue;  // not a setting
    //    if (data.default === value) {
    //        await chrome.storage.local.remove(key);
    //        debugVerbose(`Cleaning up setting ${key}.`, {value: value, default: data.default});
    //    }
    //}
});

const init = (async () => {
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
                    
                    // // Removed for data safety purposes
                    //if (FLAT_SETTINGS_CONFIG[setting].default === true)
                    //    await chrome.storage.local.set({[setting]: false});
                    //else
                    //    await chrome.storage.local.remove(setting);
                } else {
                    try {
                        const replacements: Record<string, any> = {};
                        await replaceFn(
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

                    // // Removed for data safety purposes
                    //if (data.default === false)
                    //    await chrome.storage.local.remove(setting);
                    //else
                    //    await chrome.storage.local.set({[setting]: false});

                    await chrome.storage.local.set({[setting]: false});
                }
            }
        }
    }

    compatResults = { replaced: replaced, deleted: deleted };

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
            chrome.tabs.sendMessage(tabs[0].id, { type: "settingsCompatResultData", replaced: replaced, deleted: deleted }, () => {});
        }
    });

    await cleanup();

    console.debug("Setting compat checks finished.");
});

chrome.runtime.onMessage.addListener((message: any, sender: unknown, sendResponse: (...args: any[]) => void) => {
    if (message.type === "settingsCompatGetRes") {
        debugVerbose("Recieved signal settingsCompatGetRes.", {message: message, data: compatResults});
        sendResponse(compatResults);
        compatResults = {replaced: [], deleted: []};
    }
    return true;
});

export default init;
