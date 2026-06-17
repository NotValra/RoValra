import { createDropdownMenu } from '../../core/ui/dropdown.js';
import { createNavbarButton } from '../../core/ui/navbarButton.js';
import { getAssets } from '../../core/assets.js';
import { t } from '../../core/locale/i18n.js';
import { makeBadgeChanges } from './kidsThemeText.js';

const AGE_THEME_OPTIONS = [
    {
        labelKey: 'ageTheme.options.normal',
        fallbackLabel: 'Normal Roblox',
        value: 'normal',
    },
    {
        labelKey: 'ageTheme.options.kids',
        fallbackLabel: 'Roblox Kids',
        value: 'kids',
    },
    {
        labelKey: 'ageTheme.options.select',
        fallbackLabel: 'Roblox Select',
        value: 'select',
    },
];

const AGE_THEME_CLASSES = [
    'age-roblox-theme',
    'age-kids-theme',
    'age-startmode-theme',
];

let navbarInitialized = false;

function getThemeClass(themeSelection) {
    if (themeSelection === 'kids') return 'age-kids-theme';
    if (themeSelection === 'select') return 'age-startmode-theme';
    return 'age-roblox-theme';
}

function applyAgeTheme(themeSelection) {
    if (!document.body) return;

    document.body.classList.remove(...AGE_THEME_CLASSES);
    document.body.classList.add(getThemeClass(themeSelection));
}

function updateSelectedMenuItem(menu, themeSelection) {
    menu.panel.querySelectorAll('.rovalra-dropdown-item').forEach((item) => {
        const isSelected = item.dataset.value === String(themeSelection);
        item.setAttribute('data-selected', String(isSelected));
        item.setAttribute('aria-selected', String(isSelected));
    });
}

async function getLocalizedThemeOptions() {
    return Promise.all(
        AGE_THEME_OPTIONS.map(async (option) => ({
            label: await t(option.labelKey).catch(() => option.fallbackLabel),
            value: option.value,
        })),
    );
}

async function addAgeThemeNavbarButton(currentTheme) {
    if (navbarInitialized) return;
    navbarInitialized = true;

    const button = await createNavbarButton({
        id: 'rovalra-age-theme-toggle',
        iconSvgData: getAssets().ageThemeIcon,
        tooltipText: await t('ageTheme.navbarTooltip').catch(
            () => 'Age Theme',
        ),
    });

    if (!button) return;

    const menu = createDropdownMenu({
        trigger: button,
        items: await getLocalizedThemeOptions(),
        onValueChange: (themeSelection) => {
            chrome.storage.local.set({ ageThemeSelection: themeSelection });
            applyAgeTheme(themeSelection);
            updateSelectedMenuItem(menu, themeSelection);
            makeBadgeChanges(); // Makes badge changes because observing body doesn't work
        },
        position: 'center',
    });

    updateSelectedMenuItem(menu, currentTheme);

    menu.panel.style.transform = 'translateX(-50%)';
    menu.panel.style.setProperty('min-width', '180px', 'important');

    const updatePosition = () => {
        if (button.offsetWidth > 0) {
            menu.panel.style.marginLeft = `${button.offsetWidth / 2}px`;
        }
    };

    button.addEventListener('click', updatePosition);
    updatePosition();

    applyAgeTheme(currentTheme);
}

export function init() {
    chrome.storage.local.get(
        {
            ageKidsThemeEnabled: false,
            ageThemeSelection: 'normal',
            ageThemeNavbarEnabled: false,
        },
        (settings) => {
            if (!settings.ageKidsThemeEnabled || !document.body) return;

            applyAgeTheme(settings.ageThemeSelection);

            if (settings.ageThemeNavbarEnabled) {
                addAgeThemeNavbarButton(settings.ageThemeSelection);
            }
        },
    );
}
