import { SETTINGS_CONFIG } from "./settingConfig.js";
import { loadSettings } from "./handlesettings.js";

const settingDeprecations: Record<string, ((value: any, gets: (key: string) => Promise<any>, sets: (key: string, value: any) => void) => void) | undefined> = {
    "EnableGameTrailer": undefined,
    "trustedConnectionsEnabled": undefined,
    "currencyTransferEnabled": undefined,
};

const initPromise = (async () => {
    console.log("RoValra: Verifying settings compat.");
    const settings = await loadSettings();
        
    let deleted = [];
    let replaced = [];
    for (const [setting, replaceFn] of Object.entries(settingDeprecations)) {
        try {
            let v: any = undefined;
            if ((v = (await chrome.storage.local.get({[setting]: undefined}))[setting]) !== undefined) {
                if (replaceFn === undefined) {
                    console.info(`Deleted setting: ${setting}. No suitable replacement.`);
                    deleted.push(setting);
                    await chrome.storage.local.remove(setting);
                } else {
                    console.info(`Updating setting ${setting}.`, `(with function: \`${replaceFn.toString()}\`)`);
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
                let value = (await chrome.storage.local.get({[setting]: undefined}))[setting]
                if (value !== undefined && value !== false) {
                    forEachLockedSetting(setting, data);
                    await chrome.storage.local.remove(setting);
                }
            }
        }
    }

    if (replaced.length >= 1) {
        alert(`(RoValra) The following settings have been recently replaced or changed:
    *  ${replaced.join("\n\t*  ")}`);
    }

    if (deleted.length >= 1) {
        alert(`(RoValra) The following settings have been recently deleted, locked or deprecated:
    *  ${deleted.join("\n    *  ")}`);
    }

    await chrome.storage.local.set({"RoValraSettingsVersion": chrome.runtime.getManifest().version});

    console.info("Setting compat checks finished.");
})();

export default initPromise;
