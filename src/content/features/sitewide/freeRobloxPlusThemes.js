import { settings } from '../../core/settings/getSettings.js';
import {
    get as getCache,
    set as setCache,
} from '../../core/storage/cacheHandler.js';

const SETTING_NAME = 'FreeRobloxPlusThemesEnabled';
const SESSION_SETTING_KEY = 'rovalra_freeRobloxPlusThemes';
const CACHE_SECTION = 'freeRobloxPlusThemes';
const CACHE_KEY = 'userSettings';
const CACHE_TTL_MS = 5 * 60 * 1000;

let injectedThemeClass = null;
let initialized = false;

function getThemeClass(accountTheme) {
    if (typeof accountTheme !== 'string' || !/^[A-Za-z0-9]+$/.test(accountTheme)) {
        return null;
    }

    const kebabTheme = accountTheme
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .toLowerCase();

    return `${kebabTheme}-theme`;
}

function removeInjectedThemeClass() {
    if (!injectedThemeClass) return;
    document.body?.classList.remove(injectedThemeClass);
    injectedThemeClass = null;
}

function applyAccountTheme(accountTheme) {
    const themeClass = getThemeClass(accountTheme);
    if (!themeClass || !document.body) return;

    if (injectedThemeClass && injectedThemeClass !== themeClass) {
        document.body.classList.remove(injectedThemeClass);
        injectedThemeClass = null;
    }

    if (document.body.classList.contains(themeClass)) return;

    document.body.classList.add(themeClass);
    injectedThemeClass = themeClass;
}

async function loadCachedAccountTheme() {
    const cached = await getCache(CACHE_SECTION, CACHE_KEY);
    if (!cached || cached.expiresAt <= Date.now()) return;

    applyAccountTheme(cached.settings?.accountTheme);
}

async function handleUserSettingsResponse(settingsData) {
    if (!settingsData || typeof settingsData !== 'object') return;

    const cached = await getCache(CACHE_SECTION, CACHE_KEY);
    const cachedSettings = cached?.settings;
    const accountThemeChanged =
        cachedSettings?.accountTheme !== settingsData.accountTheme;
    const cacheExpired = !cached || cached.expiresAt <= Date.now();

    if (!accountThemeChanged && !cacheExpired) return;

    await setCache(CACHE_SECTION, CACHE_KEY, {
        settings: settingsData,
        expiresAt: Date.now() + CACHE_TTL_MS,
    });

    if (freeRobloxPlusThemesEnabled) {
        applyAccountTheme(settingsData.accountTheme);
    }
}

let freeRobloxPlusThemesEnabled = false;

function setEnabled(value) {
    const isEnabled = value === true;
    freeRobloxPlusThemesEnabled = isEnabled;

    try {
        sessionStorage.setItem(SESSION_SETTING_KEY, String(isEnabled));
    } catch (e) {}

    if (isEnabled) {
        loadCachedAccountTheme();
    } else {
        removeInjectedThemeClass();
    }
}

function publishInitialSettingState(enabled) {
    document.dispatchEvent(
        new CustomEvent('rovalra:settingSaved', {
            detail: { name: SETTING_NAME, value: enabled === true },
        }),
    );
}

export function init() {
    if (initialized) return;
    initialized = true;

    settings[SETTING_NAME].then((enabled) => {
        setEnabled(enabled);
        publishInitialSettingState(enabled);
    });
    document.addEventListener('rovalra:user-settings-response', (event) => {
        if (!freeRobloxPlusThemesEnabled) return;

        handleUserSettingsResponse(event.detail).catch((error) =>
            console.warn('RoValra: Failed to cache Roblox user settings.', error),
        );
    });
    document.addEventListener('rovalra:settingSaved', (event) => {
        if (event.detail?.name === SETTING_NAME) {
            setEnabled(event.detail.value);
        }
    });
}
