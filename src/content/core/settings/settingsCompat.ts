import Version, { getVersion } from "../utils/version.js";
import { SETTINGS_CONFIG } from "./settingConfig.js";

const settingDeprecations: Record<string, ((value: any, gets: (key: string) => Promise<any>, sets: (key: string, value: any) => void) => void) | undefined> = {
    "EnableGameTrailer": undefined,
    "trustedConnectionsEnabled": undefined,
    "currencyTransferEnabled": undefined,
};

const FLAT_SETTINGS_CONFIG = Object.entries(SETTINGS_CONFIG).map(([c, s]) => s);

let initialised = false;

if (!initialised) {
initialised = true;
chrome.runtime.onInstalled.addListener(async (details) => {
    let oldVersion;
    try {
        oldVersion = (await chrome.storage.local.get("RoValraSettingsVersion")).RoValraSettingsVersion;
    } catch {
        await chrome.storage.local.set({"RoValraSettingsVersion": chrome.runtime.getManifest().version});
        oldVersion = "2.5.1";
    }

    const oldv = new Version(oldVersion);
    const newv = getVersion();

    if (newv.greater_than(oldv) == 2) {
        
        let deleted = [];
        let replaced = [];
        for (const [setting, replaceFn] of Object.entries(settingDeprecations)) {
            try {
                let v: any = undefined;
                if (v = (await chrome.storage.local.get(setting))[setting]) {
                    if (replaceFn === undefined) {
                        console.info(`Deleted setting: ${setting}. No suitable replacement.`);
                        deleted.push(setting);
                        chrome.storage.local.remove(setting);
                    } else {
                        console.info(`Updating setting ${setting}.`, `(with function: \`${replaceFn.toString()}\`)`);
                        try {
                            const replacements: Record<string, any> = {};
                            replaceFn(
                                v,
                                async (key) => (await chrome.storage.local.get({key: undefined}))[key],
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
            deleted.push(key, data);
        };

        for (const [category, settings] of Object.entries(SETTINGS_CONFIG)) {
            for (const [setting, data] of Object.entries(settings)) {
                forEachLockedSetting(setting, data);
            }
        }

        if (replaced.length >= 1) {
            alert(`(RoValra) The following settings have been recently replaced or changed:
\t*  ${replaced.join("\n\t*  ")}`);
        }
        if (deleted.length >= 1) {
            alert(`(RoValra) The following settings have been recently deleted or locked:
\t*  ${deleted.join("\n\t*  ")}`);
        }

    } else if (newv.greater_than(oldv) == 0) {  // How
        console.warn(`(RoValra) Downgraded version (?)`);
    }
});
}
