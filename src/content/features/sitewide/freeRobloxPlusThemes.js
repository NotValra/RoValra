import { observeElement } from '../../core/observer.js';
import { getAssets } from '../../core/assets.js';
import { t } from '../../core/locale/i18n.js';
import { settings } from '../../core/settings/getSettings.js';
import { callRobloxApi } from '../../core/api.js';
import {
    get as getCache,
    set as setCache,
} from '../../core/storage/cacheHandler.js';

const SETTING_NAME = 'FreeRobloxPlusThemesEnabled';
const SESSION_SETTING_KEY = 'rovalra_freeRobloxPlusThemes';
const CACHE_SECTION = 'freeRobloxPlusThemes';
const CACHE_KEY = 'userSettings';
const CACHE_TTL_MS = 5 * 60 * 1000;
const THEME_SECTION_SELECTOR = '.app-theme-section';
const NOTICE_ID = 'rovalra-free-roblox-plus-themes-notice';

let injectedThemeClass = null;
let initialized = false;
let accountThemeRequest = null;
let themeSectionObserver = null;

function removeThemeNotices() {
    document.querySelectorAll(`#${NOTICE_ID}`).forEach((notice) => {
        notice.remove();
    });
}

async function addThemeNotice(themeSection) {
    if (!freeRobloxPlusThemesEnabled || !(themeSection instanceof Element)) {
        return;
    }

    const existingNotice = themeSection.querySelector(`#${NOTICE_ID}`);
    if (existingNotice) return;

    const notice = document.createElement('p');
    notice.id = NOTICE_ID;
    notice.className =
        'flex items-center gap-small text-body-medium content-muted margin-none';

    const logo = document.createElement('img');
    logo.dataset.rovalraAsset = 'rovalraIcon';
    logo.src = getAssets().rovalraIcon;
    logo.alt = 'RoValra';
    logo.width = 24;
    logo.height = 24;
    logo.className = 'shrink-0 radius-small';

    const text = document.createElement('span');
    notice.append(logo, text);

    const themeControls = themeSection.querySelector('[role="group"]');
    (themeControls || themeSection).before(notice);

    text.textContent = await t('freeRobloxPlusThemes.notice');
}

function observeThemeSection(themeSection) {
    if (themeSectionObserver) themeSectionObserver.disconnect();

    const ensureNotice = () => {
        addThemeNotice(themeSection).catch((error) =>
            console.warn('RoValra: Failed to add the theme notice.', error),
        );
    };

    ensureNotice();

    const observer = new MutationObserver(ensureNotice);
    observer.observe(themeSection, { childList: true, subtree: true });
    themeSectionObserver = observer;
}

function getThemeClass(accountTheme) {
    if (
        typeof accountTheme !== 'string' ||
        !/^[A-Za-z0-9]+$/.test(accountTheme)
    ) {
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
    if (
        !cached ||
        cached.expiresAt <= Date.now() ||
        typeof cached.settings?.accountTheme !== 'string'
    ) {
        return false;
    }

    applyAccountTheme(cached.settings?.accountTheme);
    return true;
}

async function requestAccountTheme() {
    if (accountThemeRequest) return accountThemeRequest;

    accountThemeRequest = callRobloxApi({
        subdomain: 'apis',
        endpoint: '/user-settings-api/v1/user-settings',
        method: 'GET',
        noCache: true,
    })
        .then(async (response) => {
            if (!response.ok) return;

            await handleUserSettingsResponse(await response.json());
        })
        .finally(() => {
            accountThemeRequest = null;
        });

    return accountThemeRequest;
}

async function loadAccountTheme() {
    if (await loadCachedAccountTheme()) return;
    await requestAccountTheme();
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
        document
            .querySelectorAll(THEME_SECTION_SELECTOR)
            .forEach((themeSection) => {
                addThemeNotice(themeSection).catch((error) =>
                    console.warn(
                        'RoValra: Failed to add the theme notice.',
                        error,
                    ),
                );
            });

        loadAccountTheme().catch((error) =>
            console.warn(
                'RoValra: Failed to load Roblox user settings.',
                error,
            ),
        );
    } else {
        removeThemeNotices();
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

    observeElement(THEME_SECTION_SELECTOR, observeThemeSection, {
        onRemove: () => {
            themeSectionObserver?.disconnect();
            themeSectionObserver = null;
        },
    });

    settings[SETTING_NAME].then((enabled) => {
        setEnabled(enabled);
        publishInitialSettingState(enabled);
    });
    document.addEventListener('rovalra:user-settings-response', (event) => {
        if (!freeRobloxPlusThemesEnabled) return;

        handleUserSettingsResponse(event.detail).catch((error) =>
            console.warn(
                'RoValra: Failed to cache Roblox user settings.',
                error,
            ),
        );
    });
    document.addEventListener('rovalra:settingSaved', (event) => {
        if (event.detail?.name === SETTING_NAME) {
            setEnabled(event.detail.value);
        }
    });
}
