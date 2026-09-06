import i18next from 'i18next';
import en from '../../../../public/Assets/locales/en.json';
import { settings } from '../settings/getSettings';

async function getLanguage() {
    if (await settings.rovalraLanguage) {
        let lang = await settings.rovalraLanguage;
        return lang;
    }

    return 'en';
}

let loadedLanguages = new Set();

async function update_i18n() {
    const language = await getLanguage() || 'en';

    if (!loadedLanguages.has(language)) {
        loadedLanguages.add(language);
        
        const response = await fetch(
            chrome.runtime.getURL(`public/Assets/locales/${language}.json`),
        ); // Verified
        const translations = await response.json();
    
        i18next.addResourceBundle(language, 'translation', translations);
    }

    await i18next.changeLanguage(language);
}

let i18nInitialized = false;
const i18nPromise = (async () => {
    if (i18nInitialized) return;

    await i18next.init({
        lng: 'en',
        fallbackLng: 'en',
        debug: false,
        resources: {
            en: {
                translation: en,
            },
        },
    });

    try {
        await update_i18n();

        i18nInitialized = true;
    } catch (error) {
        console.error('RoValra: Failed to initialize i18n', error);

        i18nInitialized = true;
        throw error;
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
