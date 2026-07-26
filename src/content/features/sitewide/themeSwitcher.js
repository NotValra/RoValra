import { settings } from '../../core/settings/getSettings';
import { observeAttributes } from '../../core/observer.js';
import {
    BACKGROUND_IMAGE_ENABLED_SETTING,
    BACKGROUND_IMAGE_SETTING,
    DEFAULT_BACKGROUND_IMAGE,
    sanitizeBackgroundImage,
} from '../../core/backgroundImage.js';
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
const BG_LAYER_ID = 'rovalra-custom-background-layer';
const BG_ACTIVE_CLASS = 'rovalra-custom-background-image-active';
const BG_NAV_OVERRIDE_CLASS = 'rovalra-custom-background-nav-override';
const BG_CSS_PROPERTIES = [
    '--rovalra-background-image-opacity',
    '--rovalra-background-image-size',
    '--rovalra-background-image-position',
    '--rovalra-background-image-repeat',
    '--rovalra-background-image-blur',
    '--rovalra-background-overlay-color',
    '--rovalra-background-overlay-opacity',
];
const BG_OVERLAY_CLASS = 'rovalra-custom-background-overlay';
const BG_FRAME_CLASS = 'rovalra-custom-background-frame';
const BG_FRAME_PATH = 'public/Assets/background-wallpaper.html';
const BG_SUPPORTED_HOSTS = new Set(['www.roblox.com', 'roblox.com']);
const EXTENSION_ORIGIN = new URL(chrome.runtime.getURL('/')).origin;

function isBackgroundImageSupportedHost() {
    return BG_SUPPORTED_HOSTS.has(window.location.hostname);
}

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
                BACKGROUND_IMAGE_SETTING,
                BACKGROUND_IMAGE_ENABLED_SETTING,
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
        activeThemeKey = null;
        activeCustomThemeValue = undefined;
        await applyStoredBackgroundImage(changes);
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

    await applyStoredBackgroundImage(changes);
}

export async function refreshThemeSwitcher() {
    await PrepareRenderedTheme();
}

// Custom themes

function getBgRoot() {
    return document.body || document.documentElement;
}

function pruneBgLayers(primaryLayer) {
    document.querySelectorAll(`#${BG_LAYER_ID}`).forEach((layer) => {
        if (layer !== primaryLayer) layer.remove();
    });
}

function createBgFrame() {
    const frame = document.createElement('iframe');
    frame.className = BG_FRAME_CLASS;
    frame.src = chrome.runtime.getURL(BG_FRAME_PATH);
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    return frame;
}

function getBgParts() {
    const root = getBgRoot();
    let layer = document.getElementById(BG_LAYER_ID);

    if (layer && layer.parentElement !== root) {
        layer.remove();
        layer = null;
    }

    if (!layer) {
        layer = document.createElement('div');
        layer.id = BG_LAYER_ID;
        layer.setAttribute('aria-hidden', 'true');
        layer.tabIndex = -1;
        root.appendChild(layer);
    }

    let frame = layer.querySelector(`.${BG_FRAME_CLASS}`);
    let overlay = layer.querySelector(`.${BG_OVERLAY_CLASS}`);

    if (!frame) {
        frame = createBgFrame();
        layer.prepend(frame);
    }

    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = BG_OVERLAY_CLASS;
        layer.appendChild(overlay);
    }

    pruneBgLayers(layer);
    return { root, frame, overlay };
}

function clearBackgroundImage() {
    const root = getBgRoot();
    const classTargets = new Set([root, document.documentElement]);
    if (document.body) classTargets.add(document.body);

    for (const target of classTargets) {
        target.classList.remove(BG_ACTIVE_CLASS, BG_NAV_OVERRIDE_CLASS);
    }

    for (const property of BG_CSS_PROPERTIES) {
        for (const target of classTargets) {
            target.style.removeProperty(property);
        }
    }

    document.querySelectorAll(`#${BG_LAYER_ID}`).forEach((layer) => {
        layer.remove();
    });
}

function getBgState(bg) {
    return {
        source: bg.source,
        size: bg.size === 'custom' ? `${bg.customSize}%` : bg.size,
        position: bg.position,
        repeat: bg.repeat,
        attachment: 'fixed',
        opacity: String(bg.opacity),
        filter: `blur(${bg.blur}px)`,
        overlayColor: bg.overlayColor,
        overlayOpacity: String(bg.overlayOpacity),
    };
}

function postBgState(frame, state) {
    if (!frame.contentWindow) return;

    frame.contentWindow.postMessage(
        {
            type: 'rovalra:set-background',
            source: state.source,
            size: state.size,
            position: state.position,
            repeat: state.repeat,
            attachment: state.attachment,
            opacity: state.opacity,
            filter: state.filter,
        },
        EXTENSION_ORIGIN,
    );
}

function setStyle(style, property, value) {
    if (style[property] !== value) style[property] = value;
}

function setVar(element, property, value) {
    if (element.style.getPropertyValue(property) !== value) {
        element.style.setProperty(property, value);
    }
}

function applyBackground(value) {
    const bg = sanitizeBackgroundImage(value);

    if (!bg.source) {
        clearBackgroundImage();
        return;
    }

    const { root, frame, overlay } = getBgParts();
    const state = getBgState(bg);

    root.classList.add(BG_ACTIVE_CLASS);
    document.body?.classList.add(BG_ACTIVE_CLASS);
    root.classList.toggle(BG_NAV_OVERRIDE_CLASS, bg.overrideTopbarSidebar);
    document.body?.classList.toggle(
        BG_NAV_OVERRIDE_CLASS,
        bg.overrideTopbarSidebar,
    );
    Object.entries({
        '--rovalra-background-image-opacity': state.opacity,
        '--rovalra-background-image-size': state.size,
        '--rovalra-background-image-position': state.position,
        '--rovalra-background-image-repeat': state.repeat,
        '--rovalra-background-image-blur': `${bg.blur}px`,
        '--rovalra-background-overlay-color': state.overlayColor,
        '--rovalra-background-overlay-opacity': state.overlayOpacity,
    }).forEach(([property, value]) => setVar(root, property, value));

    setStyle(frame.style, 'opacity', state.opacity);
    setStyle(frame.style, 'filter', state.filter);
    postBgState(frame, state);
    frame.onload = () => postBgState(frame, state);

    setStyle(overlay.style, 'backgroundColor', state.overlayColor);
    setStyle(overlay.style, 'opacity', state.overlayOpacity);
}

export function applyBackgroundImage(config, enabled) {
    if (enabled !== true || !isBackgroundImageSupportedHost()) {
        clearBackgroundImage();
        return;
    }

    applyBackground(config);
}

async function applyStoredBackgroundImage(changes = null) {
    const enabled = changes?.[BACKGROUND_IMAGE_ENABLED_SETTING]
        ? changes[BACKGROUND_IMAGE_ENABLED_SETTING].newValue === true
        : (await settings[BACKGROUND_IMAGE_ENABLED_SETTING]) === true;
    const config = changes?.[BACKGROUND_IMAGE_SETTING]
        ? changes[BACKGROUND_IMAGE_SETTING].newValue
        : await settings[BACKGROUND_IMAGE_SETTING];

    applyBackgroundImage(
        sanitizeBackgroundImage(config || DEFAULT_BACKGROUND_IMAGE),
        enabled,
    );
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
