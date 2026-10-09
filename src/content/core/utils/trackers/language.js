import { callRobloxApiJson } from '../../api.js';
import { getAuthenticatedUserId } from '../../user.js';

let cachedUserId = null;
let cachedLanguage = null;
let activeRequest = null;

export async function getAuthenticatedUserLanguage({ refresh = false } = {}) {
    const userId = await getAuthenticatedUserId();
    if (!userId) return null;

    const key = String(userId);
    if (!refresh && key === cachedUserId && cachedLanguage) {
        return cachedLanguage;
    }

    if (!refresh && activeRequest?.userId === key) {
        return activeRequest.promise;
    }

    const promise = (async () => {
        try {
            const user = await callRobloxApiJson({
                subdomain: 'apis',
                endpoint: `/cloud/v2/users/${encodeURIComponent(key)}`,
                method: 'GET',
                useApiKey: true,
                useBackground: true,
            });

            const locale =
                typeof user?.locale === 'string' ? user.locale.trim() : '';
            if (!locale) return null;

            cachedUserId = key;
            cachedLanguage = locale;
            return locale;
        } catch (error) {
            console.warn(
                'RoValra: Failed to fetch authenticated user language',
                error,
            );
            return null;
        }
    })();

    activeRequest = { userId: key, promise };
    try {
        return await promise;
    } finally {
        if (activeRequest?.promise === promise) activeRequest = null;
    }
}

export function getLanguageNameFromLocale(locale) {
    if (typeof locale !== 'string' || !locale.trim()) return null;

    const languageCode = locale.trim().replaceAll('_', '-').split('-')[0];
    try {
        return (
            new Intl.DisplayNames(['en'], { type: 'language' }).of(
                languageCode,
            ) || null
        );
    } catch (error) {
        return null;
    }
}

export async function getAuthenticatedUserLanguageName(options) {
    const locale = await getAuthenticatedUserLanguage(options);
    return getLanguageNameFromLocale(locale);
}

export function getCachedAuthenticatedUserLanguage() {
    return cachedLanguage;
}

export function initAuthenticatedUserLanguageTracking() {
    getAuthenticatedUserLanguage();
}
