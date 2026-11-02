import { settings } from '../../core/settings/getSettings.js';
import { observeAttributes, observeElement } from '../../core/observer.js';
import { getAssets } from '../../core/assets.js';
import { enableGameCards, disableGameCards } from './roblox2016GameCards.js';
import { t } from '../../core/locale/i18n.js';

const SETTING_NAME = 'roblox2016ThemeEnabled';
const SUPPORTED_HOSTS = new Set(['www.roblox.com', 'roblox.com']);
const ROOT_CLASS = 'rovalra-theme-2016';
const FONT_FAMILY = 'Source Sans 3';
const FONT_FILES = [
    [
        'roblox2016FontLatin',
        'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
    ],
    [
        'roblox2016FontLatinExt',
        'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF',
    ],
    [
        'roblox2016FontCyrillic',
        'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116',
    ],
    [
        'roblox2016FontVietnamese',
        'U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB',
    ],
];

const DARK_CLASSES = ['dark-theme', 'color-mode-dark'];
const LIGHT_CLASSES = ['light-theme', 'color-mode-light'];

const IMAGE_VARIABLES = {
    '--rovalra-2016-logo': 'roblox2016Logo',
    '--rovalra-2016-logo-r': 'roblox2016LogoR',
    '--rovalra-2016-nav-sprite': 'roblox2016NavSprite',
    '--rovalra-2016-branded-sprite': 'roblox2016BrandedSprite',
    '--rovalra-2016-thumbs-sprite': 'roblox2016ThumbsSprite',
    '--rovalra-2016-generic-sprite': 'roblox2016GenericSprite',
    '--rovalra-2016-games-sprite': 'roblox2016GamesSprite',
};

const NAV_RENAMES = [
    ['a[id^="nav-charts"]', 'roblox2016Theme.games'],
    ['a[id^="nav-marketplace"]', 'roblox2016Theme.catalog'],
    [
        '#catalog-react-page .catalog-header h1.heading a',
        'roblox2016Theme.catalog',
    ],
];
const ORIGINAL_TEXT_ATTRIBUTE = 'rovalra2016OriginalText';

let initialized = false;
let navRenameObservers = [];
let fontFaces = [];
let bodyClassObserver = null;
let displacedClasses = [];
let addedClasses = [];

function whenBodyReady(callback) {
    if (document.body) {
        callback();
        return;
    }
    document.addEventListener('DOMContentLoaded', callback, { once: true });
}

function forceLightMode() {
    const body = document.body;
    const dark = DARK_CLASSES.filter((className) =>
        body.classList.contains(className),
    );
    if (dark.length) {
        body.classList.remove(...dark);
        displacedClasses = [...new Set([...displacedClasses, ...dark])];
    }

    const missing = LIGHT_CLASSES.filter(
        (className) => !body.classList.contains(className),
    );
    if (missing.length && displacedClasses.length) {
        body.classList.add(...missing);
        addedClasses = [...new Set([...addedClasses, ...missing])];
    }
}

function restoreColorMode() {
    bodyClassObserver?.disconnect();
    bodyClassObserver = null;
    const body = document.body;
    if (!body) return;
    if (addedClasses.length) body.classList.remove(...addedClasses);
    if (displacedClasses.length) body.classList.add(...displacedClasses);
    addedClasses = [];
    displacedClasses = [];
}

function addFont() {
    if (fontFaces.length) return;
    const assets = getAssets();
    fontFaces = FONT_FILES.map(
        ([assetKey, unicodeRange]) =>
            new FontFace(FONT_FAMILY, `url("${assets[assetKey]}")`, {
                weight: '300 700',
                display: 'swap',
                unicodeRange,
            }),
    );
    fontFaces.forEach((fontFace) => document.fonts.add(fontFace));
}

function removeFont() {
    fontFaces.forEach((fontFace) => document.fonts.delete(fontFace));
    fontFaces = [];
}

function setImageVariables(enabled) {
    const root = document.documentElement;
    const assets = enabled ? getAssets() : null;
    for (const [property, assetKey] of Object.entries(IMAGE_VARIABLES)) {
        if (enabled)
            root.style.setProperty(property, `url("${assets[assetKey]}")`);
        else root.style.removeProperty(property);
    }
}

function renameNavLink(link, text) {
    if (link.dataset[ORIGINAL_TEXT_ATTRIBUTE] === undefined) {
        link.dataset[ORIGINAL_TEXT_ATTRIBUTE] = link.textContent;
    }
    link.textContent = text;
}

function renameNavLinks() {
    if (navRenameObservers.length) return;
    navRenameObservers = NAV_RENAMES.map(([selector, textKey]) =>
        observeElement(
            selector,
            async (link) => {
                const text = await t(textKey);
                if (navRenameObservers.length) renameNavLink(link, text);
            },
            { multiple: true },
        ),
    );
}

function restoreNavLinks() {
    navRenameObservers.forEach((observer) => observer.disconnect());
    navRenameObservers = [];
    for (const [selector] of NAV_RENAMES) {
        document.querySelectorAll(selector).forEach((link) => {
            const original = link.dataset[ORIGINAL_TEXT_ATTRIBUTE];
            if (original === undefined) return;
            link.textContent = original;
            delete link.dataset[ORIGINAL_TEXT_ATTRIBUTE];
        });
    }
}

function applyTheme(enabled) {
    document.documentElement.classList.toggle(ROOT_CLASS, enabled);
    setImageVariables(enabled);

    if (!enabled) {
        removeFont();
        restoreColorMode();
        disableGameCards();
        restoreNavLinks();
        return;
    }

    addFont();
    enableGameCards().catch((error) =>
        console.error('RoValra: Failed to restyle game cards.', error),
    );
    renameNavLinks();
    whenBodyReady(() => {
        if (bodyClassObserver) return;
        forceLightMode();
        bodyClassObserver = observeAttributes(document.body, forceLightMode, [
            'class',
        ]);
    });
}

export function isRoblox2016ThemeHost() {
    return SUPPORTED_HOSTS.has(window.location.hostname);
}

export function init() {
    if (initialized || !isRoblox2016ThemeHost()) return;
    initialized = true;

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local' || !changes[SETTING_NAME]) return;
        applyTheme(changes[SETTING_NAME].newValue === true);
    });

    applyStoredTheme().catch((error) =>
        console.error('RoValra: Failed to apply the 2016 theme.', error),
    );
}

async function applyStoredTheme() {
    applyTheme((await settings[SETTING_NAME]) === true);
}
