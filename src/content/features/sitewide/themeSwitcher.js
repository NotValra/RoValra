import { settings } from "../../core/settings/getSettings";

const ThemeClasses = {
    'default': undefined,
    'builtin-light': 'light-theme',
    'builtin-dark': 'dark-theme'
};

let OriginalTheme = undefined;

function SetTheme(theme) {
    for (const theme of Object.values(ThemeClasses)) {
        if (theme !== undefined) {
            document.body.classList.remove(theme);
        }
    }

    document.body.classList.add(ThemeClasses[theme] ?? OriginalTheme);
}

async function PrepareRenderedTheme() {
    const theme = await settings.ThemeSwitcher;
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
