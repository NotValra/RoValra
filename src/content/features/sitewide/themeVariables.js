import { settings } from '../../core/settings/getSettings';
import { observeAttributes } from '../../core/observer.js';
import {
    ALL_PRESET_CLASSES,
    DEFAULT_THEME_VARIABLES,
    THEME_VARIABLES_ENABLED_SETTING,
    THEME_VARIABLES_MODES,
    THEME_VARIABLES_SETTING,
    getPresetClasses,
    hexaToRgba,
    sanitizeThemeVariables,
} from '../../core/themeVariables.js';

const ACTIVE_ATTRIBUTE = 'data-rovalra-theme-vars';
const PROPERTY_PREFIX = '--rovalra-theme-';
const SUPPORTED_HOSTS = new Set(['www.roblox.com', 'roblox.com']);

let enabled = false;
let currentConfig = sanitizeThemeVariables(DEFAULT_THEME_VARIABLES);
let appliedKey = null;
let appliedTokens = new Set();
let appliedPresetClasses = [];
let displacedClasses = [];
let bodyClassObserver = null;

function canApply() {
    return enabled && SUPPORTED_HOSTS.has(window.location.hostname);
}

function whenBodyReady(callback) {
    if (document.body) {
        callback();
        return;
    }
    document.addEventListener('DOMContentLoaded', callback, { once: true });
}

function displaceOtherPresetClasses() {
    const body = document.body;
    const others = ALL_PRESET_CLASSES.filter(
        (className) =>
            !appliedPresetClasses.includes(className) &&
            body.classList.contains(className),
    );
    if (!others.length) return;
    body.classList.remove(...others);
    displacedClasses = [...new Set([...displacedClasses, ...others])];
}

function clearPreset() {
    bodyClassObserver?.disconnect();
    bodyClassObserver = null;
    const body = document.body;
    if (!body) return;
    if (appliedPresetClasses.length)
        body.classList.remove(...appliedPresetClasses);
    if (displacedClasses.length) body.classList.add(...displacedClasses);
    appliedPresetClasses = [];
    displacedClasses = [];
}

function applyPreset(preset) {
    whenBodyReady(() => {
        const classes = canApply() ? getPresetClasses(preset) : [];
        if (classes.join(' ') === appliedPresetClasses.join(' ')) return;
        clearPreset();
        if (!classes.length) return;

        appliedPresetClasses = classes;
        displaceOtherPresetClasses();
        document.body.classList.add(...classes);
        bodyClassObserver = observeAttributes(
            document.body,
            displaceOtherPresetClasses,
            ['class'],
        );
    });
}

function syncActiveAttribute() {
    const root = document.documentElement;
    if (appliedTokens.size)
        root.setAttribute(ACTIVE_ATTRIBUTE, [...appliedTokens].join(' '));
    else root.removeAttribute(ACTIVE_ATTRIBUTE);
}

function setToken(mode, key, hexa) {
    const token = `${mode}-${key}`;
    const root = document.documentElement;
    if (hexa && canApply()) {
        root.style.setProperty(`${PROPERTY_PREFIX}${token}`, hexaToRgba(hexa));
        if (appliedTokens.has(token)) return false;
        appliedTokens.add(token);
        return true;
    }
    if (!appliedTokens.has(token)) return false;
    root.style.removeProperty(`${PROPERTY_PREFIX}${token}`);
    appliedTokens.delete(token);
    return true;
}

function applyCurrent() {
    applyPreset(currentConfig.preset);

    const wanted = new Set();
    let attributeChanged = false;
    for (const mode of THEME_VARIABLES_MODES) {
        for (const [key, value] of Object.entries(currentConfig[mode])) {
            wanted.add(`${mode}-${key}`);
            attributeChanged = setToken(mode, key, value) || attributeChanged;
        }
    }
    for (const token of [...appliedTokens]) {
        if (wanted.has(token) && canApply()) continue;
        const [mode, ...key] = token.split('-');
        attributeChanged =
            setToken(mode, key.join('-'), null) || attributeChanged;
    }
    if (attributeChanged) syncActiveAttribute();
}

export function applyThemeVariables(config, isEnabled) {
    const next = sanitizeThemeVariables(config);
    const key = JSON.stringify([isEnabled === true, next]);
    if (key === appliedKey) return;
    appliedKey = key;
    enabled = isEnabled === true;
    currentConfig = next;
    applyCurrent();
}

export function previewThemeVariable(mode, key, hexa) {
    if (!THEME_VARIABLES_MODES.includes(mode)) return;
    if (hexa) currentConfig[mode][key] = hexa;
    else delete currentConfig[mode][key];
    appliedKey = JSON.stringify([enabled, currentConfig]);
    if (setToken(mode, key, hexa)) syncActiveAttribute();
}

export function isThemeVariablesEnabled() {
    return enabled;
}

export function withoutThemeVariables(callback) {
    const root = document.documentElement;
    const body = document.body;
    const active = root.getAttribute(ACTIVE_ATTRIBUTE);
    root.removeAttribute(ACTIVE_ATTRIBUTE);
    const presetClasses = body ? appliedPresetClasses : [];
    if (presetClasses.length) {
        body.classList.remove(...presetClasses);
        if (displacedClasses.length) body.classList.add(...displacedClasses);
    }
    try {
        return callback();
    } finally {
        if (presetClasses.length) {
            if (displacedClasses.length)
                body.classList.remove(...displacedClasses);
            body.classList.add(...presetClasses);
        }
        if (active !== null) root.setAttribute(ACTIVE_ATTRIBUTE, active);
    }
}

async function applyStoredThemeVariables(changes = null) {
    const isEnabled = changes?.[THEME_VARIABLES_ENABLED_SETTING]
        ? changes[THEME_VARIABLES_ENABLED_SETTING].newValue === true
        : (await settings[THEME_VARIABLES_ENABLED_SETTING]) === true;
    const config = changes?.[THEME_VARIABLES_SETTING]
        ? changes[THEME_VARIABLES_SETTING].newValue
        : await settings[THEME_VARIABLES_SETTING];
    applyThemeVariables(config || DEFAULT_THEME_VARIABLES, isEnabled);
}

let initialized = false;
export function init() {
    if (initialized) return;
    initialized = true;
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local') return;
        if (
            changes[THEME_VARIABLES_SETTING] ||
            changes[THEME_VARIABLES_ENABLED_SETTING]
        ) {
            applyStoredThemeVariables(changes).catch((error) =>
                console.error(
                    'RoValra: Failed to refresh the custom theme colors.',
                    error,
                ),
            );
        }
    });
    applyStoredThemeVariables().catch((error) =>
        console.error(
            'RoValra: Failed to apply the custom theme colors.',
            error,
        ),
    );
}
