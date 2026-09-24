import i18next from 'i18next';
import en from '../../../../public/Assets/locales/en.json';
import { settings } from '../settings/getSettings';

const defaultLanguage = 'en';
let supportedLanguages = new Set();
const neutralPrefixes = new Set(['my']);

const supportedLanguagesReady = fetch(
    chrome.runtime.getURL('public/Assets/locales/index.json'),
)
    .then((response) => response.json())
    .then((languages) => {
        supportedLanguages = new Set(languages);
    })
    .catch((error) => {
        console.warn('RoValra: Failed to load supported locales', error);
        supportedLanguages = new Set([defaultLanguage]);
    });

function getLanguageFromUrl(url = window.location.href) {
    const [segment] = new URL(url).pathname.split('/').filter(Boolean);
    const code = segment?.toLowerCase();

    if (neutralPrefixes.has(code)) return null;
    return supportedLanguages.has(code) ? code : defaultLanguage;
}

async function getLanguage() {
    await supportedLanguagesReady;
    const lang = await settings.rovalraLanguage;

    if (!lang) return defaultLanguage;
    if (lang !== 'auto') return lang;

    const detected = getLanguageFromUrl();
    if (detected) {
        await chrome.storage.local.set({ rovalra_autolang: detected });
        return detected;
    }

    const { rovalra_autolang } = await chrome.storage.local.get({
        rovalra_autolang: defaultLanguage,
    });
    return rovalra_autolang;
}

const pendingLoads = new Map();

function loadLanguage(language) {
    if (i18next.hasResourceBundle(language, 'translation')) {
        return Promise.resolve();
    }

    if (!pendingLoads.has(language)) {
        const load = fetch(
            chrome.runtime.getURL(`public/Assets/locales/${language}.json`),
        ) // Verified
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status} loading "${language}"`);
                }
                return response.json();
            })
            .then((translations) => {
                i18next.addResourceBundle(language, 'translation', translations);
            })
            .finally(() => pendingLoads.delete(language));

        pendingLoads.set(language, load);
    }

    return pendingLoads.get(language);
}

async function update_i18n() {
    const language = await getLanguage();
    await loadLanguage(language);
    await i18next.changeLanguage(language);
}

const i18nPromise = (async () => {
    await i18next.init({
        lng: defaultLanguage,
        fallbackLng: defaultLanguage,
        debug: false,
        resources: {
            en: { translation: en },
        },
    });

    try {
        await update_i18n();
    } catch (error) {
        console.error('RoValra: Failed to load language, falling back to English', error);
    }
})();

/**
 * Asynchronously gets a translation. This is the preferred method as it guarantees
 * the translation resources are loaded before returning a value.
 * @param {string} key The translation key.
 * @param {object} [options] i18next options.
 * @returns {Promise<string>} The translated string.
 */
export async function t(key, options) {
    await i18nPromise;
    return i18next.t(key, options);
}

/**
 * Synchronously gets a translation. If i18n is not yet initialized, it will
 * return the key itself as a fallback.
 * @param {string} key The translation key.
 * @param {object} [options] i18next options.
 * @returns {string} The translated string or the key if not available.
 */
export function ts(key, options) {
    return i18next.t(key, options);
}
