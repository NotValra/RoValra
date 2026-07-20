import { observeElement } from '../../core/observer.js';
import {
    loadSettings,
    handleSaveSettings,
} from '../../core/settings/handlesettings.js';
import { createButton } from '../../core/ui/buttons.js';
import { createPillToggle } from '../../core/ui/general/pillToggle.js';
import {
    catalogThemeToCustomTheme,
    customThemeMatchesCatalogTheme,
    getCustomThemeSlotThemes,
    getThemeCatalogThemes,
} from '../../core/themeCatalog.js';
import {
    applyCustomTheme,
    refreshThemeSwitcher,
    setTheme,
} from '../sitewide/themeSwitcher.js';

export const THEME_PATH = '/theme';

let initialized = false;
let pageRenderedFor = null;

function normalizePath(pathname = window.location.pathname) {
    return pathname.toLowerCase().replace(/^\/[a-z]{2}(?:-[a-z]{2})?\//, '/');
}

function isThemesPath() {
    return normalizePath() === THEME_PATH;
}

function openThemesPage() {
    window.location.assign(THEME_PATH);
}

function hexWithAlphaToRgba(hex, alpha = 100) {
    const normalized = /^#[0-9a-f]{6}$/i.test(hex) ? hex : '#000000';
    const alphaNumber = Number(alpha);
    const clampedAlpha =
        (Number.isFinite(alphaNumber)
            ? Math.max(0, Math.min(100, alphaNumber))
            : 100) / 100;
    const red = parseInt(normalized.slice(1, 3), 16);
    const green = parseInt(normalized.slice(3, 5), 16);
    const blue = parseInt(normalized.slice(5, 7), 16);
    return `rgba(${red}, ${green}, ${blue}, ${clampedAlpha})`;
}

function getCatalogColor(theme, key, fallback = '#000000') {
    const tuple = theme.colors && theme.colors[key];
    if (!Array.isArray(tuple)) return fallback;
    return hexWithAlphaToRgba(tuple[0], tuple[1]);
}

function setPreviewColors(preview, theme) {
    const colorKeys = [
        'surface0',
        'surface100',
        'surface200',
        'surface300',
        'mainText',
        'secondaryText',
        'playButton',
        'buttonBackground',
        'borderColor',
    ];

    for (const key of colorKeys) {
        preview.style.setProperty(
            `--rovalra-theme-preview-${key}`,
            getCatalogColor(theme, key),
        );
    }
}

function createPreviewWindow(theme) {
    const preview = document.createElement('div');
    preview.className = 'rovalra-themes-preview';
    setPreviewColors(preview, theme);

    const topbar = document.createElement('div');
    topbar.className = 'rovalra-themes-preview-topbar';

    const dots = document.createElement('div');
    dots.className = 'rovalra-themes-preview-dots';
    dots.append(
        document.createElement('span'),
        document.createElement('span'),
        document.createElement('span'),
    );

    const title = document.createElement('div');
    title.className = 'rovalra-themes-preview-title';
    title.textContent = 'roblox.com';
    topbar.append(dots, title);

    const body = document.createElement('div');
    body.className = 'rovalra-themes-preview-body';

    const sidebar = document.createElement('div');
    sidebar.className = 'rovalra-themes-preview-sidebar';
    for (let i = 0; i < 4; i += 1) {
        const item = document.createElement('span');
        item.className = 'rovalra-themes-preview-nav-item';
        sidebar.appendChild(item);
    }

    const content = document.createElement('div');
    content.className = 'rovalra-themes-preview-content';

    const hero = document.createElement('div');
    hero.className = 'rovalra-themes-preview-hero';

    const avatar = document.createElement('div');
    avatar.className = 'rovalra-themes-preview-avatar';

    const heroText = document.createElement('div');
    heroText.className = 'rovalra-themes-preview-hero-text';
    heroText.append(
        document.createElement('span'),
        document.createElement('span'),
    );

    const play = document.createElement('div');
    play.className = 'play-game-button rovalra-themes-preview-play';
    play.setAttribute('aria-hidden', 'true');
    const playIcon = document.createElement('span');
    playIcon.className = 'icon-common-play';
    play.appendChild(playIcon);

    hero.append(avatar, heroText, play);

    const grid = document.createElement('div');
    grid.className = 'rovalra-themes-preview-grid';
    for (let i = 0; i < 4; i += 1) {
        const tile = document.createElement('div');
        tile.className = 'rovalra-themes-preview-tile';
        tile.appendChild(document.createElement('span'));
        grid.appendChild(tile);
    }

    content.append(hero, grid);
    body.append(sidebar, content);
    preview.append(topbar, body);

    return preview;
}

function createSwatchList(theme) {
    const swatches = document.createElement('div');
    swatches.className = 'rovalra-themes-swatches';

    const keys = [
        'surface0',
        'surface100',
        'surface200',
        'surface300',
        'mainText',
        'playButton',
    ];

    for (const key of keys) {
        const swatch = document.createElement('span');
        swatch.className = 'rovalra-themes-swatch';
        swatch.title = key;
        swatch.style.background = getCatalogColor(theme, key);
        swatches.appendChild(swatch);
    }

    return swatches;
}

async function applyCatalogTheme(theme, button, card) {
    button.disabled = true;
    button.textContent = 'Applying...';

    await handleSaveSettings('ThemeSwitcherEnabled', true);

    if (theme.storageKey) {
        await handleSaveSettings('ThemeSwitcher', theme.storageKey);
        await setTheme(theme.storageKey);
    } else {
        const customTheme = catalogThemeToCustomTheme(theme);
        await handleSaveSettings('customUserTheme', customTheme);
        await handleSaveSettings('ThemeSwitcher', 'custom-user');
        await setTheme('custom-user');
        applyCustomTheme(customTheme);
    }

    updateThemeCardSelection(card);

    button.disabled = false;
}

async function unequipCatalogTheme(button) {
    button.disabled = true;
    button.textContent = 'Unequipping...';

    await handleSaveSettings('ThemeSwitcher', 'default');
    await refreshThemeSwitcher();
    updateThemeCardSelection(null);

    button.disabled = false;
}

function updateThemeCardSelection(selectedCard) {
    document
        .querySelectorAll('.rovalra-theme-card-action')
        .forEach((themeButton) => {
            const themeCard = themeButton.closest('.rovalra-theme-card');
            const isSelected = selectedCard && themeCard === selectedCard;
            themeCard?.classList.toggle(
                'rovalra-theme-card-selected',
                isSelected,
            );
            themeButton.disabled = false;
            themeButton.textContent = isSelected ? 'Unequip' : 'Use Theme';
        });
}

function openThemeSlotEditor(slotIndex) {
    document.dispatchEvent(
        new CustomEvent('rovalra:openCustomThemeEditor', {
            detail: { slotIndex },
        }),
    );
}

function createThemeCard(theme, settings) {
    const currentCustomTheme = settings.customUserTheme;
    const isSelected = theme.storageKey
        ? settings.ThemeSwitcherEnabled !== false &&
          settings.ThemeSwitcher === theme.storageKey
        : settings.ThemeSwitcherEnabled !== false &&
          settings.ThemeSwitcher === 'custom-user' &&
          customThemeMatchesCatalogTheme(currentCustomTheme, theme);

    const card = document.createElement('article');
    card.className = 'rovalra-theme-card';
    if (isSelected) card.classList.add('rovalra-theme-card-selected');

    const preview = createPreviewWindow(theme);

    const details = document.createElement('div');
    details.className = 'rovalra-theme-card-details';

    const titleRow = document.createElement('div');
    titleRow.className = 'rovalra-theme-card-title-row';

    const titleGroup = document.createElement('div');
    titleGroup.className = 'rovalra-theme-card-title-group';

    const title = document.createElement('h2');
    title.textContent = theme.name;

    const meta = document.createElement('p');
    meta.textContent = `Theme format v${theme.version}`;

    titleGroup.append(title, meta);

    const button = createButton(
        isSelected ? 'Unequip' : 'Use Theme',
        'primary',
        {
            onClick: () => {
                const action = card.classList.contains(
                    'rovalra-theme-card-selected',
                )
                    ? unequipCatalogTheme(button)
                    : applyCatalogTheme(theme, button, card);

                action.catch((error) => {
                    console.error(
                        'RoValra: Failed to apply catalog theme.',
                        error,
                    );
                    button.disabled = false;
                    button.textContent = card.classList.contains(
                        'rovalra-theme-card-selected',
                    )
                        ? 'Unequip'
                        : 'Use Theme';
                });
            },
        },
    );
    button.classList.add('rovalra-theme-card-action');

    titleRow.append(titleGroup, button);
    details.append(titleRow, createSwatchList(theme));

    if (Number.isInteger(theme.userSlotIndex)) {
        const editButton = createButton('Edit', 'secondary', {
            onClick: () => {
                openThemeSlotEditor(theme.userSlotIndex);
            },
        });
        editButton.classList.add('rovalra-theme-card-edit-action');
        details.appendChild(editButton);
    }

    card.append(preview, details);

    return card;
}

function createThemeGrid(themes, settings, emptyText) {
    const grid = document.createElement('section');
    grid.className = 'rovalra-themes-grid';

    if (!themes.length) {
        const empty = document.createElement('p');
        empty.className = 'rovalra-themes-empty';
        empty.textContent = emptyText;
        grid.appendChild(empty);
        return grid;
    }

    for (const theme of themes) {
        grid.appendChild(createThemeCard(theme, settings));
    }

    return grid;
}

async function renderThemesPage(content) {
    if (!isThemesPath()) return;

    const renderKey = `${window.location.pathname}:${window.location.search}`;
    if (
        pageRenderedFor === renderKey &&
        content.dataset.rovalraThemesPage === 'true'
    ) {
        return;
    }
    pageRenderedFor = renderKey;
    content.dataset.rovalraThemesPage = 'true';
    content.innerHTML = '';

    const catalogThemes = await getThemeCatalogThemes();
    const settings = await loadSettings();
    const userThemes = getCustomThemeSlotThemes(settings);

    const page = document.createElement('main');
    page.className = 'rovalra-themes-page';

    const header = document.createElement('header');
    header.className = 'rovalra-themes-header';

    const heading = document.createElement('h1');
    heading.textContent = 'Themes';

    const subheading = document.createElement('p');

    header.append(heading, subheading);

    const tabs = document.createElement('div');
    tabs.className = 'rovalra-themes-tabs';

    const catalogGrid = createThemeGrid(
        catalogThemes,
        settings,
        'No RoValra themes are available yet.',
    );
    catalogGrid.dataset.themeTabPanel = 'rovalra';

    const userGrid = createThemeGrid(
        userThemes,
        settings,
        'Create a custom theme to see it here.',
    );
    userGrid.dataset.themeTabPanel = 'yours';
    userGrid.hidden = true;

    const toggle = createPillToggle({
        options: [
            { text: 'RoValra', value: 'rovalra' },
            { text: 'Yours', value: 'yours' },
        ],
        initialValue: 'rovalra',
        onChange: (value) => {
            catalogGrid.hidden = value !== 'rovalra';
            userGrid.hidden = value !== 'yours';
        },
    });

    tabs.appendChild(toggle);

    page.append(header, tabs, catalogGrid, userGrid);
    content.appendChild(page);
}

function renderWhenReady() {
    if (!isThemesPath()) return;

    observeElement('.content#content, #content', (content) => {
        renderThemesPage(content).catch((error) => {
            console.error('RoValra: Failed to render themes page.', error);
        });
    });
}

export function init() {
    if (!initialized) {
        initialized = true;
        document.addEventListener('rovalra:openThemesPage', openThemesPage);
    }

    renderWhenReady();
}
