import { debugVerbose } from "../debugManager.js";
import { settings } from "./getSettings";

chrome.runtime.sendMessage({ type: "settingsCompatGetRes" }, (message) => {
    debugVerbose(`settingsCompatResultData recieved data.`, message);

    const replaced = message.replaced;
    const deleted = message.deleted;
    if (!replaced || !deleted)
        console.error(`settingsCompatGetRes returned no data.`);

    (async () => {
        if (await settings.settingChangeNote !== true)
            return;

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
    })();

    return true; 
});

