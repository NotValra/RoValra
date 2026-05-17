import { loadSettings } from "./handlesettings";

let settingsCache = undefined;

async function getCachedSettings() {
    if (settingsCache === undefined)
        settingsCache = await loadSettings();
    return settingsCache;
}

// bunch of dark magic  - Bogdan
function proxify(path = []) {
    return new Proxy({}, {
        get(target, prop) {
            if (prop === "then") {
                return (r, f)  => {
                    getCachedSettings().then((value) => {
                        for (const p of path) {
                            if (value === undefined) break;
                            value = value[p];
                        }

                        r(value);
                    }).catch((...args) => f(...args));
                };
            }

            return proxify([...path, prop]);
        }
    })
}

export const settings = proxify();
