import * as ezlocale from 'ezlocale';

let initialized = false;

const localePromise = (async () => {
    if (initialized) return;

    try {
        const settings = await new Promise(
            (resolve) => chrome.storage.local.get({ language: 'en' }, resolve), //Place holder in case that wasnt clear.
        );
        const language = settings.language || 'en';

        const response = await fetch(
            chrome.runtime.getURL(`public/Assets/locales/${language}.json`),
        ); // Verified
        const translations = await response.json();

        const response_EN = await fetch(
            chrome.runtime.getURL(`public/Assets/locales/en.json`),
        ); // Verified
        const translations_EN = await response_EN.json();

        await ezlocale.init();
        await ezlocale.add_locale(language, translations);
        await ezlocale.add_locale('en', translations_EN);
        await ezlocale.config({
            'lang.current': language,
            'lang.fallback': 'en'
        });

        initialized = true;
    } catch (error) {
        console.error('RoValra: Failed to initialize i18n', error);

        initialized = true;
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
    await localePromise;
    return ezlocale.fmt_locale(key, ...options);
}

/**
 * Synchronously gets a translation. If i18n is not yet initialized, it will
 * return the key itself as a fallback.
 * @param {string} key The translation key.
 * @param {object} [options] i18next options.
 * @returns {string} The translated string or the key if not available.
 */
export function ts(key, options) {
    return ezlocale.fmt_locale(key, ...options);
}
