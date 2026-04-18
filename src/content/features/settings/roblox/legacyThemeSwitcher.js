import { observeElement } from '../../../core/observer.js';
import { createDropdown } from '../../../core/ui/dropdown.js';
import { callRobloxApi } from '../../../core/api.js';
import { getAuthenticatedUserId } from '../../../core/user.js';
import { ts } from '../../../core/locale/i18n.js';

const THEMES = {
    LIGHT: 'Light',
    DARK: 'Dark'
}

const THEME_VALUES = {
    Light: 0,
    Dark: 1
}

const ENDPOINTS = {
    THEME: '/v1/themes/1/0'
}

function updateThemeDocument(themeString) {
    if (themeString === THEMES.LIGHT) {
        document.body.classList.remove('dark-theme')
        document.body.classList.add('light-theme')
    } else if (themeString === THEMES.DARK) {
        document.body.classList.remove('light-theme')
        document.body.classList.add('dark-theme')
    }
}

async function updateThemeStorage(themeString) {
    const userId = await getAuthenticatedUserId();

    const storedThemes = localStorage.getItem('theme');
    if (!storedThemes) return;

    const accountThemes = JSON.parse(storedThemes);
    const currentTheme = accountThemes.data.find(e => e[0] === userId);
    if (!currentTheme) return;

    currentTheme[1] = THEME_VALUES[themeString];
    
    const newThemes = JSON.stringify(accountThemes);
    localStorage.setItem('theme', newThemes);
}

async function attemptUpdateThemeApi(themeString) {
    const themeResponse = await callRobloxApi({
        subdomain: 'accountsettings',
        endpoint: ENDPOINTS.THEME,
        method: "PATCH",
        body: {
            themeType: themeString
        }
    });

    return themeResponse.ok;
}

async function updateTheme(themeString) {
    if (!attemptUpdateThemeApi(themeString)) {
        return alert('Failed to update theme! Try again later.');
    }

    updateThemeDocument(themeString);
    updateThemeStorage(themeString);
}

async function getCurrentTheme() {
    const currentTheme = await callRobloxApi({
        subdomain: 'accountsettings',
        endpoint: ENDPOINTS.THEME
    });

    if (!currentTheme.ok) return THEMES.LIGHT;
    const data = await currentTheme.json()

    return data.themeType;
}

async function createThemeDropdown() {
    const container = document.createElement('div');
    container.className = 'collapsible-user-input rovalra-theme-switcher';

    const label = document.createElement('label');
    label.className = 'text-title-large';
    label.textContent = ts('legacyThemeSwitcher.label');

    const dropdownOptions = [
        {
            label: ts('legacyThemeSwitcher.light'),
            value: THEMES.LIGHT
        },
        {
            label: ts('legacyThemeSwitcher.dark'),
            value: THEMES.DARK
        }
    ];

    const dropdown = createDropdown({
        items: dropdownOptions,
        initialValue: await getCurrentTheme(),
        onValueChange: updateTheme
    });

    dropdown.element.classList.add('col-xs-12', 'col-sm-6');
    
    container.appendChild(label);
    container.appendChild(dropdown.element);

    return container;
}

export async function init() {
    if (!window.location.pathname.startsWith('/my/account')) {
        return;
    }

    chrome.storage.local.get({ legacyThemeSwitcherEnabled: true }, (result) => {
        if (!result.legacyThemeSwitcherEnabled) return;

        observeElement(
            'h2.setting-section-header',
            async (header) => {
                if (header.textContent.trim() === 'Personal') {
                    const section = header.closest('.setting-section');
                    if (
                        section &&
                        !section.querySelector('.rovalra-theme-switcher')
                    ) {
                        const element = await createThemeDropdown();

                        const contentContainer =
                            section.querySelector(
                                '.section-content',
                            ) || section;
                        contentContainer.appendChild(element);
                    }
                }
            },
            { multiple: true }
        );
    });
}
