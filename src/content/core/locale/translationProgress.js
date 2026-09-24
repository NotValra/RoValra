const localeResources = new Map();

function flattenTranslationKeys(value, prefix = '', keys = []) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        Object.entries(value).forEach(([key, child]) => {
            flattenTranslationKeys(
                child,
                prefix ? `${prefix}.${key}` : key,
                keys,
            );
        });
    } else if (prefix) {
        keys.push(prefix);
    }

    return keys;
}

function getValueAtPath(value, path) {
    return path.split('.').reduce((current, key) => current?.[key], value);
}

let translationProgressPromise;

export function loadTranslationProgress() {
    if (!translationProgressPromise) {
        translationProgressPromise = fetch(
            chrome.runtime.getURL('public/Assets/locales/index.json'),
        )
            .then((response) => response.json())
            .then((localeCodes) =>
                Promise.all(
                    localeCodes.map(async (language) => {
                        const response = await fetch(
                            chrome.runtime.getURL(
                                `public/Assets/locales/${language}.json`,
                            ),
                        );
                        if (!response.ok) {
                            throw new Error(
                                `HTTP ${response.status} loading "${language}"`,
                            );
                        }
                        localeResources.set(language, await response.json());
                    }),
                ),
            )
            .catch((error) => {
                console.warn(
                    'RoValra: Failed to load translation progress',
                    error,
                );
            });
    }

    return translationProgressPromise;
}

export function getTranslationProgress(language) {
    const locale = localeResources.get(language);
    const english = localeResources.get('en');
    if (!locale || !english) return null;
    if (language === 'en') return 100;

    const englishKeys = flattenTranslationKeys(english);
    const translatedKeys = englishKeys.filter((key) => {
        const value = getValueAtPath(locale, key);
        return typeof value === 'string' && value.trim().length > 0;
    }).length;

    return Math.round((translatedKeys / englishKeys.length) * 1000) / 10;
}
