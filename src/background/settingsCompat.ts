/// <reference types="chrome" />

const settingDeprecations: Record<string, ((value: any, gets: (key: string) => Promise<any>, sets: (key: string, value: any) => void) => void) | undefined> = {
    "EnableGameTrailer": undefined,
    "trustedConnectionsEnabled": undefined,
    "currencyTransferEnabled": undefined,
};


import { SETTINGS_CONFIG } from "../content/core/settings/settingConfig.js";
import { debugVerbose, flush } from "../content/core/debug.js";

const CONFIG = Object.freeze({
    COUNT_REPLACED_IF_INACTIVE: true,   // havent tested with this off
    COUNT_DEPRECATED_REMOVED_IF_INACTIVE: true,    // havent tested with this off
    SEEN_TRACK_STORAGE_KEY: "rovalra:settingsCompat:seenLocked",
} as const);

function _getSeenStorageKey(name: string): string {
    return `${CONFIG.SEEN_TRACK_STORAGE_KEY}:${name}`;
}

/**
 * Whether or not a setting was already marked as deprecated/locked/... and warned about to the user.
 * @param name The setting's name (as stored in local storage)
 */
async function alreadySeenLockedSetting(name: string): Promise<boolean> {
    const value = await chrome.storage.local.get({ [_getSeenStorageKey(name)]: false });
    if (!value[_getSeenStorageKey(name)])
        return false;

    return true;
}

/**
 * Mark a setting that's deprecated/locked/... as seen (see alreadySeenLockedSetting)
 * @param names The list of setting names (as stored in local storage) to mark as seen.
 */
function markSeenLockedSettings(names: string[]): Promise<void> {
    return chrome.storage.local.set(Object.fromEntries(
        names.map(n => [_getSeenStorageKey(n), true])
    ));
}

/**
 * Mark a setting that was previously deprecated/locked/... and warned about to the user as "unseen"
 * Example usage: If a previously-locked setting is now no longer locked
 */
function markLockedSettingAsUnseen(name: string): Promise<void> {
    return chrome.storage.local.remove(_getSeenStorageKey(name));
}

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
    const toAwait = [];

    console.debug("RoValra: Verifying settings compat.");

    let deleted = [];
    let replaced = [];
    let deletedOrReplacedKeys = [];  // to make sure the user isnt warned about the same setting twice
    
    for (const [setting, replaceFn] of Object.entries(settingDeprecations)) {
        try {
            let v: any = undefined;
            if ((v = await getStoredSettingValue(setting)) === true || CONFIG.COUNT_REPLACED_IF_INACTIVE) {
                debugVerbose(`Replaced setting ${setting}.`, {replacement: String(replaceFn)});
                if (replaceFn === undefined) {
                    if (!await alreadySeenLockedSetting(setting)) {
                        deleted.push(FLAT_SETTINGS_CONFIG[setting].label);
                        deletedOrReplacedKeys.push(setting);
                    }
                    
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

                        if (!await alreadySeenLockedSetting(setting)) {
                            replaced.push(setting);
                            deletedOrReplacedKeys.push(setting);
                        }
                    } catch (e) {
                        console.error(`Failed to update setting ${setting} — unexpected error: `, e);
                    }
                }
            }
        } catch (e) {
            console.error(`Failed to retrieve setting ${setting} for compat checks — unexpected error: `, e);
        }
    }
    const forEachLockedSetting = async (key: string, data: Record<string, any>) => {
        const name = data.label;

        if (!await alreadySeenLockedSetting(key)) {
            deleted.push(name);
            deletedOrReplacedKeys.push(key);
        }
    };
    for (const [category, settings] of Object.entries(SETTINGS_CONFIG)) {
        for (const [setting, data] of Object.entries(settings.settings)) {
            if (data['locked'] !== undefined || data['deprecated'] !== undefined) {
                let value = await getStoredSettingValue(setting);
                if ((value !== undefined && value !== false) || CONFIG.COUNT_DEPRECATED_REMOVED_IF_INACTIVE) {
                    debugVerbose(`Locked/deprecated setting: ${setting}`, data);
                    await forEachLockedSetting(setting, data);

                    // // Removed for data safety purposes
                    //if (data.default === false)
                    //    await chrome.storage.local.remove(setting);
                    //else
                    //    await chrome.storage.local.set({[setting]: false});

                    await chrome.storage.local.set({[setting]: false});
                }
            } else {
                if (await alreadySeenLockedSetting(setting)) {
                    debugVerbose(`Marking setting ${setting} as unseen.`, {
                        key: setting,
                        label: data.label,
                        seen: await alreadySeenLockedSetting(setting),
                        locked: data['deprecated'],
                        deprecated: data['deprecated'],
                    });
                    toAwait.push(markLockedSettingAsUnseen(setting));
                }
            }
        }
    }

    await Promise.all(toAwait);
    debugVerbose(`Marking ${deletedOrReplacedKeys.length} as seen.`, { values: deletedOrReplacedKeys })
    await markSeenLockedSettings(deletedOrReplacedKeys);

    compatResults = { replaced: replaced, deleted: deleted };

    //chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    //    if (tabs[0]?.id) {
    //        chrome.tabs.sendMessage(tabs[0].id, { type: "settingsCompatResultData", replaced: replaced, deleted: deleted }, () => {});
    //    }
    //});

    await cleanup();
    flush();

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
