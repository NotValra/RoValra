import { settings } from "../../core/settings/getSettings";

function getThemeByStorageKey(key) {
    for (const theme of Object.values(ThemeData)) {
        if (theme.StorageKey === key)
            return theme;
    }

    return undefined;
}

let OriginalTheme = undefined;

/**
 * @type {Record<string, {StorageKey: string, PrimaryClass: string, ClassList: string[]}>}
 */
let ThemeData = {};

function SetTheme(themeKey) {
    for (let theme of Object.values(ThemeData)) {
        if (theme.PrimaryClass !== null) {
            const classlist = [theme.PrimaryClass, ...theme.ClassList];
            for (const t of classlist)
                document.body.classList.remove(t);
        }
    }

    let v;
    const classlist = [getThemeByStorageKey(themeKey).PrimaryClass, ...getThemeByStorageKey(themeKey).ClassList];
    document.body.classList.add(...classlist);
}

async function PrepareRenderedTheme() {
    const theme = await settings.ThemeSwitcher;

    const response = await fetch(
        chrome.runtime.getURL(`public/Assets/data/RuntimeData/ThemeData.json`),
    ); // Verified
    ThemeData = await response.json();

    if (OriginalTheme === undefined) {
        if (document.body.matches(".light-theme"))
            OriginalTheme = 'builtin-light';

        if (document.body.matches(".dark-theme"))
            OriginalTheme = 'builtin-dark';
    }

    switch (theme) {
        case 'default':
            SetTheme(OriginalTheme);
            break;

        case 'builtin-light':
        case 'builtin-dark':
        case 'custom-nighty':
        case 'custom-sunset':
        case 'custom-highcontrast':
            SetTheme(theme);
            break;

        case theme:
            console.error(`(RoValra) Theme Switcher: Unknown theme "${theme}"`);
    }

    chrome.storage.local.onChanged.addListener(PrepareRenderedTheme);
}

export function init() {
    document.addEventListener('DOMContentLoaded', PrepareRenderedTheme);
}
