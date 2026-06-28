import { loadSettings } from './handlesettings.js';
import { REMOTE_SETTING_LOCKS_KEY } from './remoteSettingLocks.js';

let settingsCache = undefined;

function updateCachedSetting(name, value) {
    if (settingsCache === undefined || !name) return;
    settingsCache[name] = value;
}

if (typeof document !== 'undefined') {
    document.addEventListener('rovalra:settingSaved', (event) => {
        updateCachedSetting(event.detail?.name, event.detail?.value);
    });
}

if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local' || settingsCache === undefined) return;

        if (changes[REMOTE_SETTING_LOCKS_KEY]) {
            settingsCache = undefined;
            return;
        }

        for (const [name, change] of Object.entries(changes)) {
            if (name === 'rovalra_settings') continue;
            updateCachedSetting(name, change.newValue);
        }
    });
}

// Loads settings once per content-script runtime and reuses the same object for
// every `await settings.someSetting` call. This avoids asking chrome.storage for
// the full settings object every time a feature needs one value.
async function getCachedSettings() {
    if (settingsCache === undefined) settingsCache = await loadSettings();
    return settingsCache;
}
// bunch of dark magic  - Bogdan

// Comments so I remember how to use it - Valra cuz i totally wrote all of this manually by hand believe me bro
// `settings` is a tiny async settings reader built with a Proxy.
//
// How to use it in another script:
//   import { settings } from "../../core/settings/getSettings";
//
// Then await the setting name you want:
//   if (await settings.reducePlusAds) {
//       // run feature code when the setting is enabled
//   }
//
// Nested values also work because each property access adds to the path:
//   const value = await settings.someParentSetting.someChildSetting;
//
// Important: always use `await`. Without it, `settings.reducePlusAds` is just
// another Proxy object, not the real boolean/string/number stored in settings.
//
// Use `loadSettings()` from handlesettings.js instead when you need the entire
// settings object at once or you need the freshest value after saving changes.
function proxify(path = []) {
    return new Proxy(
        {},
        {
            get(target, prop) {
                // Promise/await looks for a `.then` method. When code awaits any
                // proxy path, this branch resolves the cached settings object and
                // walks the recorded path to return the requested value.
                if (prop === 'then') {
                    return (r, f) => {
                        getCachedSettings()
                            .then((value) => {
                                for (const p of path) {
                                    if (value === undefined) break;
                                    value = value[p];
                                }

                                r(value);
                            })
                            .catch((...args) => f(...args));
                    };
                }

                // Every normal property access, like `.reducePlusAds`, records the
                // requested key and returns another Proxy until the chain is awaited.
                return proxify([...path, prop]);
            },
        },
    );
}

/**
 * @typedef {{ [settingKey: string]: string | Settings }} Settings
 */

/**
 * @type {Settings}
 * @group Internal/Settings
 * @internal
 */
export const settings = proxify();
