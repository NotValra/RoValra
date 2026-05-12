import * as TOML from "smol-toml";
import { t } from "../locale/i18n.js";
import { asyncReplaceAll } from "../utils/string.js";
import { safeHtml } from "../packages/dompurify.js";

const modify = async (obj) => {
    for (const key in obj) {
        if (obj[key] !== null && typeof obj[key] === "object")
            await modify(obj[key]);
        else {
            obj[key] = String(obj[key]);

            // Locales
            obj[key] = await asyncReplaceAll(obj[key], /\[\[locale (.*?)\]\]/g, async (substring, locale) => {
                return await t(locale);
            });

            // Nested Innerhtml
            obj[key] = await asyncReplaceAll(obj[key], /\[\[innerhtml (.*?)\]\]/g, async (substring, key) => {
                let newObj = structuredClone(obj);
                
                // some overly complex logic here
                const parts = key.split(".");
                let target = newObj;

                for (let i = 0; i < parts.length - 1; i++) {
                    target = target?.[parts[i]];

                    if (target === undefined)
                        target = null;
                                
                    if (target == null) {
                        break;
                    }
                }

                if (target != null) {
                    target[parts.at(-1)] = '';
                }


                await modify(newObj);
                
                let value = newObj;
                for (const subkey of key.split(".")) {
                    if (value === undefined) {
                        break;
                    }
                    value = value[subkey];
                }

                if (value === undefined)
                    value = "(Object undefined)";

                if (typeof value === "string")
                    return value;
                else
                    return `(Object ${typeof value})`;
            });
        }
    }
};

let verifiedInnerHtmlSyncVal = undefined;
export const verifiedInnerHtmlSync = () => {
    if (verifiedInnerHtmlSyncVal === undefined)
        console.error(`(RoValra) verifiedInnerHtmlSync returning undefined.`, new Error("Referencing an uninitialised variable."));
    return verifiedInnerHtmlSyncVal;
};

/**
 * @type {Promise<Record<string, string | Record>>}
 */
export const verifiedInnerHtml = (async () => {
    const response = await fetch(
        chrome.runtime.getURL(`public/Assets/data/innerHtmlList.toml`),
    );  // Verified

    const text = await response.text();

    const toml = TOML.parse(text);

    await modify(toml);

    const rawVerifiedInnerHtml = toml;

    const proxify = (obj) => new Proxy(obj, {
        get(target, prop, receiver) {
            if (prop === "fmt")
                return this.fmt;
            if (typeof target[prop] === "object")
                return proxify(target[prop]);
            else if (typeof target[prop] === "string")
                return (...args) => this.fmt(target, prop, ...args);
        },

        set(t, p, newValue, receiver) {
            console.error(`Attempted to modify innerHtml data.`, new TypeError("Assignment to constant variable."));
        },

        /**
         * Format an innerHTML block with variables
         * @param {{string: any}?} options
         */
        fmt(target, subKey, options) {
            if (options === undefined)
                options = {};

            /** @type {string} */
            let raw = target[subKey];

            if (raw === undefined) {
                console.error(`Undefined subkey: '${raw}'`, new Error());
                return;
            }

            for (const key of Object.keys(options)) {
                const value = options[key];

                raw = raw.replaceAll(`{{{${key}}}}`, safeHtml([value]));
                raw = raw.replaceAll(`{{${key}}}`, value);
            }

            return raw;
        }
    })

    verifiedInnerHtmlSyncVal = proxify(rawVerifiedInnerHtml)

    return verifiedInnerHtmlSyncVal;
})();
