import { settings } from "../../core/settings/getSettings";

const ThemeClasses = {
    'default': undefined,
    'builtin-light': 'light-theme',
    'builtin-dark': 'dark-theme',
    'custom-nighty': ['rovalra-custom-nighty-theme', 'dark-theme'],
};

let OriginalTheme = undefined;

function SetTheme(theme) {
    for (let theme of Object.values(ThemeClasses)) {
        if (theme !== undefined) {
            if (!Array.isArray(theme)) theme = [theme];
            for (const t of theme)
                document.body.classList.remove(t);
        }
    }

    let v;
    if (Array.isArray(v = ThemeClasses[theme] ?? OriginalTheme)) {
        document.body.classList.add(...v);
    } else {
        document.body.classList.add(v);
    }
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
        case 'custom-nighty':
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
