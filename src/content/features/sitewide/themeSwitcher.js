import { settings } from '../../core/settings/getSettings';
import { observeAttributes } from '../../core/observer.js';
import {
    CUSTOM_THEME_FIELDS,
    DEFAULT_CUSTOM_THEME,
    getCustomThemeAlphaKey,
    sanitizeCustomTheme,
} from '../../core/themeCustom.js';

/**
 * @typedef {{StorageKey: string, PrimaryClass: string | null, ClassList?: string[] | undefined}} Theme
 * @typedef {'default' | 'builtin-light' | 'builtin-dark' | 'custom-nighty' | 'custom-sunset' | 'custom-highcontrast' | 'custom-user'} ThemeKey
 */

/** @param {Theme} theme  @returns {string[]} */
function GetClassList(theme) {
    const classList = [theme.PrimaryClass, ...(theme.ClassList ?? [])]; // join the rest of the ClassList, if any

    return classList.filter(Boolean); // remove empty strings
}

/** @param {ThemeKey} key  @returns {Theme | undefined} The theme with the corresponding storage key */
function getThemeByStorageKey(key) {
    for (const theme of Object.values(ThemeData)) {
        if (theme.StorageKey === key) return theme;
    }

    return undefined;
}

/** @type {Theme | undefined} */
let OriginalTheme = undefined;

/** @type {boolean} */
let storageListenerRegistered = false;
let themeSwitcherInitialized = false;
let themeOperation = Promise.resolve();
let themeDataPromise = null;
let themeEnforcementEnabled = false;
let activeThemeKey = null;
let activeCustomThemeValue = undefined;
let themeRepairScheduled = false;
let initialThemeReady = false;
let resolveInitialThemeReady = null;

/** @type {Record<string, Theme>} */
let ThemeData = {};

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const CUSTOM_THEME_FIELD_MAP = new Map(
    CUSTOM_THEME_FIELDS.map((field) => [field.key, field]),
);

async function loadThemeData() {
    if (Object.keys(ThemeData).length > 0) return;

    if (themeDataPromise) return themeDataPromise;

    themeDataPromise = fetch(
        chrome.runtime.getURL(`public/Assets/data/RuntimeData/ThemeData.json`),
    ) // Verified
        .then((response) => response.json())
        .then((data) => {
            ThemeData = data;
        })
        .catch((error) => {
            themeDataPromise = null;
            throw error;
        });

    return themeDataPromise;
}

function queueThemeOperation(operation) {
    const queuedOperation = themeOperation.then(operation, operation);
    themeOperation = queuedOperation.catch(() => {});
    return queuedOperation;
}

/**
 * @param {ThemeKey} themeKey
 * @param {object | undefined} customThemeValue
 * @returns {Promise<void>}
 */
async function applyTheme(themeKey, customThemeValue) {
    await loadThemeData();

    const theme = getThemeByStorageKey(themeKey);
    if (!theme) {
        console.error(`(RoValra) Theme Switcher: Unknown theme "${themeKey}"`);
        return;
    }

    let resolvedCustomThemeValue = customThemeValue;
    if (themeKey === 'custom-user' && resolvedCustomThemeValue === undefined) {
        const storedTheme = await chrome.storage.local.get({
            customUserTheme: DEFAULT_CUSTOM_THEME,
        });
        resolvedCustomThemeValue = storedTheme.customUserTheme;
    }

    activeThemeKey = themeKey;
    activeCustomThemeValue = resolvedCustomThemeValue;

    const desiredClasses = new Set(GetClassList(theme));
    const managedClasses = new Set();

    for (const theme of Object.values(ThemeData)) {
        if (theme.PrimaryClass !== null) {
            for (const className of GetClassList(theme)) {
                managedClasses.add(className);
            }
        }
    }

    for (const className of managedClasses) {
        if (
            !desiredClasses.has(className) &&
            document.body.classList.contains(className)
        ) {
            document.body.classList.remove(className);
        }
    }

    for (const className of desiredClasses) {
        if (!document.body.classList.contains(className)) {
            document.body.classList.add(className);
        }
    }

    if (themeKey === 'custom-user') {
        applyCustomTheme(resolvedCustomThemeValue);
    }
}

export function setTheme(themeKey, customThemeValue) {
    return queueThemeOperation(() => applyTheme(themeKey, customThemeValue));
}

async function PrepareRenderedTheme(changes = null) {
    return queueThemeOperation(() => prepareRenderedTheme(changes));
}

async function prepareRenderedTheme(changes = null) {
    const themeSwitcherEnabled = changes?.ThemeSwitcherEnabled
        ? changes.ThemeSwitcherEnabled.newValue
        : await settings.ThemeSwitcherEnabled;
    const theme = changes?.ThemeSwitcher
        ? changes.ThemeSwitcher.newValue
        : await settings.ThemeSwitcher;
    await loadThemeData();

    if (OriginalTheme === undefined) {
        if (document.body.matches('.light-theme'))
            OriginalTheme = 'builtin-light';

        if (document.body.matches('.dark-theme'))
            OriginalTheme = 'builtin-dark';
    }

    if (!storageListenerRegistered) {
        storageListenerRegistered = true;
        chrome.storage.onChanged.addListener((storageChanges, areaName) => {
            if (areaName !== 'local') return;

            const relevantChanges = {};
            for (const key of [
                'ThemeSwitcherEnabled',
                'ThemeSwitcher',
                'customUserTheme',
            ]) {
                if (storageChanges[key]) {
                    relevantChanges[key] = storageChanges[key];
                }
            }

            if (Object.keys(relevantChanges).length === 0) return;
            PrepareRenderedTheme(relevantChanges).catch((error) =>
                console.error(
                    'RoValra: Failed to refresh the selected theme.',
                    error,
                ),
            );
        });
    }

    if (!themeSwitcherEnabled) {
        themeEnforcementEnabled = false;
        await applyTheme(OriginalTheme ?? 'builtin-dark');
        return;
    }

    themeEnforcementEnabled = true;

    switch (theme) {
        case 'default':
            await applyTheme(OriginalTheme ?? 'builtin-dark');
            break;

        case 'builtin-light':
        case 'builtin-dark':
        case 'custom-nighty':
        case 'custom-sunset':
        case 'custom-highcontrast':
        case 'custom-user':
            await applyTheme(theme, changes?.customUserTheme?.newValue);
            break;

        case theme:
            console.error(`(RoValra) Theme Switcher: Unknown theme "${theme}"`);
    }
}

export async function refreshThemeSwitcher() {
    await PrepareRenderedTheme();
}

// Custom themes

function getThemeFieldCssValue(theme, field) {
    const source = theme && typeof theme === 'object' ? theme : {};
    const rawHex = source[field.key];
    const hex =
        typeof rawHex === 'string' && HEX_COLOR_PATTERN.test(rawHex)
            ? rawHex
            : field.default;
    const rawAlpha = Number(source[getCustomThemeAlphaKey(field.key)]);
    const alpha = Number.isFinite(rawAlpha)
        ? Math.max(0, Math.min(100, Math.round(rawAlpha))) / 100
        : 1;
    const red = parseInt(hex.slice(1, 3), 16);
    const green = parseInt(hex.slice(3, 5), 16);
    const blue = parseInt(hex.slice(5, 7), 16);

    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function applyCustomThemeField(key, themeValue) {
    const field = CUSTOM_THEME_FIELD_MAP.get(key);
    if (!field) return;

    const property = `--rovalra-custom-user-${field.key}`;
    const value = getThemeFieldCssValue(
        themeValue || DEFAULT_CUSTOM_THEME,
        field,
    );
    if (document.body.style.getPropertyValue(property) !== value) {
        document.body.style.setProperty(property, value);
    }
}

export function applyCustomTheme(themeValue) {
    const theme = sanitizeCustomTheme(themeValue || DEFAULT_CUSTOM_THEME);

    for (const field of CUSTOM_THEME_FIELDS) {
        const property = `--rovalra-custom-user-${field.key}`;
        const value = getThemeFieldCssValue(theme, field);
        if (document.body.style.getPropertyValue(property) !== value) {
            document.body.style.setProperty(property, value);
        }
    }
}

// --

export function init() {
    if (themeSwitcherInitialized) return;
    themeSwitcherInitialized = true;

    observeAttributes(
        document.body,
        () => {
            if (
                !themeEnforcementEnabled ||
                !activeThemeKey ||
                themeRepairScheduled
            ) {
                return;
            }

            const activeTheme = getThemeByStorageKey(activeThemeKey);
            if (
                !activeTheme ||
                GetClassList(activeTheme).every((className) =>
                    document.body.classList.contains(className),
                )
            ) {
                return;
            }

            themeRepairScheduled = true;
            queueThemeOperation(() =>
                applyTheme(activeThemeKey, activeCustomThemeValue),
            )
                .catch((error) =>
                    console.error(
                        'RoValra: Failed to repair the selected theme.',
                        error,
                    ),
                )
                .finally(() => {
                    themeRepairScheduled = false;
                });
        },
        ['class'],
    );

    window.addEventListener('themeDetected', (event) => {
        const detectedTheme = event.detail?.theme;
        if (detectedTheme === 'light') OriginalTheme = 'builtin-light';
        if (detectedTheme === 'dark') OriginalTheme = 'builtin-dark';

        if (!initialThemeReady) {
            initialThemeReady = true;
            resolveInitialThemeReady?.();
            resolveInitialThemeReady = null;
            return;
        }

        PrepareRenderedTheme().catch((error) =>
            console.error(
                'RoValra: Failed to apply the detected theme.',
                error,
            ),
        );
    });

    const waitForInitialTheme = new Promise((resolve) => {
        resolveInitialThemeReady = resolve;
    });
    const timeout = new Promise((resolve) => setTimeout(resolve, 1500));

    return Promise.race([waitForInitialTheme, timeout]).then(() => {
        initialThemeReady = true;
        resolveInitialThemeReady = null;
        return PrepareRenderedTheme();
    });
}
