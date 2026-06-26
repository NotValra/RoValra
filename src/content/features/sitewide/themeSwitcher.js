import { settings } from '../../core/settings/getSettings';
import {
    CUSTOM_THEME_FIELDS,
    DEFAULT_CUSTOM_THEME,
    getCustomThemeAlphaKey,
    sanitizeCustomTheme,
} from '../../core/themeCustom.js';

function getThemeByStorageKey(key) {
    for (const theme of Object.values(ThemeData)) {
        if (theme.StorageKey === key) return theme;
    }

    return undefined;
}

let OriginalTheme = undefined;
let storageListenerRegistered = false;

/**
 * @type {Record<string, {StorageKey: string, PrimaryClass: string, ClassList: string[]}>}
 */
let ThemeData = {};
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

async function loadThemeData() {
    if (Object.keys(ThemeData).length > 0) return;

    const response = await fetch(
        chrome.runtime.getURL(`public/Assets/data/RuntimeData/ThemeData.json`),
    ); // Verified
    ThemeData = await response.json();
}

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
    const field = CUSTOM_THEME_FIELDS.find((themeField) => {
        return themeField.key === key;
    });
    if (!field) return;

    document.body.style.setProperty(
        `--rovalra-custom-user-${field.key}`,
        getThemeFieldCssValue(themeValue || DEFAULT_CUSTOM_THEME, field),
    );
}

export function applyCustomTheme(themeValue) {
    const theme = sanitizeCustomTheme(themeValue || DEFAULT_CUSTOM_THEME);

    for (const field of CUSTOM_THEME_FIELDS) {
        document.body.style.setProperty(
            `--rovalra-custom-user-${field.key}`,
            getThemeFieldCssValue(theme, field),
        );
    }
}

export async function setTheme(themeKey) {
    await loadThemeData();

    for (const theme of Object.values(ThemeData)) {
        if (theme.PrimaryClass !== null) {
            const classlist = [theme.PrimaryClass, ...theme.ClassList];
            for (const t of classlist) document.body.classList.remove(t);
        }
    }

    const theme = getThemeByStorageKey(themeKey);
    if (!theme) {
        console.error(`(RoValra) Theme Switcher: Unknown theme "${themeKey}"`);
        return;
    }

    const classlist = [theme.PrimaryClass, ...theme.ClassList].filter(Boolean);
    document.body.classList.add(...classlist);

    if (themeKey === 'custom-user') {
        applyCustomTheme(await settings.customUserTheme);
    }
}

async function PrepareRenderedTheme() {
    const themeSwitcherEnabled = await settings.ThemeSwitcherEnabled;
    const theme = await settings.ThemeSwitcher;
    await loadThemeData();

    if (OriginalTheme === undefined) {
        if (document.body.matches('.light-theme'))
            OriginalTheme = 'builtin-light';

        if (document.body.matches('.dark-theme'))
            OriginalTheme = 'builtin-dark';
    }

    if (!storageListenerRegistered) {
        storageListenerRegistered = true;
        chrome.storage.local.onChanged.addListener(PrepareRenderedTheme);
    }

    if (!themeSwitcherEnabled) {
        await setTheme(OriginalTheme);
        return;
    }

    switch (theme) {
        case 'default':
            await setTheme(OriginalTheme);
            break;

        case 'builtin-light':
        case 'builtin-dark':
        case 'custom-nighty':
        case 'custom-sunset':
        case 'custom-highcontrast':
        case 'custom-user':
            await setTheme(theme);
            break;

        case theme:
            console.error(`(RoValra) Theme Switcher: Unknown theme "${theme}"`);
    }

}

export async function refreshThemeSwitcher() {
    await PrepareRenderedTheme();
}

export function init() {
    document.addEventListener('DOMContentLoaded', PrepareRenderedTheme);
}
