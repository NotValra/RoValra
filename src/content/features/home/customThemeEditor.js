import { createButton } from '../../core/ui/buttons.js';
import { createOverlay } from '../../core/ui/overlay.js';
import {
    handleSaveSettings,
    loadSettings,
} from '../../core/settings/handlesettings.js';
import {
    CUSTOM_THEME_FIELDS,
    DEFAULT_CUSTOM_THEME,
    getCustomThemeAlphaKey,
    sanitizeCustomTheme,
} from '../../core/themeCustom.js';
import {
    applyCustomTheme,
    applyCustomThemeField,
    setTheme,
} from '../sitewide/themeSwitcher.js';

const ACTIVE_SESSION_KEY = 'rovalra_custom_theme_editor_active';
const PENDING_HOME_OPEN_KEY = 'rovalra_custom_theme_editor_pending_home';
const SAVE_DELAY_MS = 120;

let initialized = false;
let saveTimeout = null;
let currentTheme = { ...DEFAULT_CUSTOM_THEME };
let overlayHandle = null;
let editorInputs = new Map();
let editorRgbInputs = new Map();
let editorAlphaInputs = new Map();
let editorAlphaNumberInputs = new Map();
let pendingThemeFieldKeys = new Set();
let applyFrame = null;

function isHomePath() {
    const normalizedPath = window.location.pathname
        .toLowerCase()
        .replace(/^\/[a-z]{2}(?:-[a-z]{2})?\//, '/');
    return normalizedPath.startsWith('/home');
}

function normalizeHex(value) {
    const trimmed = String(value || '').trim();
    const shortHex = trimmed.match(/^#?([0-9a-f]{3})$/i);
    if (shortHex) {
        return `#${shortHex[1]
            .split('')
            .map((char) => char + char)
            .join('')}`.toLowerCase();
    }

    const longHex = trimmed.match(/^#?([0-9a-f]{6})$/i);
    if (longHex) return `#${longHex[1]}`.toLowerCase();

    return null;
}

function clampRgbPart(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    return Math.max(0, Math.min(255, Math.round(number)));
}

function clampAlpha(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    return Math.max(0, Math.min(100, Math.round(number)));
}

function normalizeAlpha(value) {
    if (value === undefined || value === null || value === '') return null;

    const raw = String(value).trim();
    if (raw.endsWith('%')) return clampAlpha(raw.slice(0, -1));

    const number = Number(raw);
    if (!Number.isFinite(number)) return null;
    if (number >= 0 && number <= 1) return clampAlpha(number * 100);

    return clampAlpha(number);
}

function parseColorInput(value) {
    const hex = normalizeHex(value);
    if (hex) return { hex };

    const rgbMatch = String(value || '')
        .trim()
        .match(
            /^rgba?\(\s*([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)(?:\s*,\s*([+-]?\d+(?:\.\d+)?%?))?\s*\)$/i,
        );
    const commaMatch = String(value || '')
        .trim()
        .match(
            /^([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)(?:\s*,\s*([+-]?\d+(?:\.\d+)?%?))?$/,
        );
    const parts = rgbMatch || commaMatch;
    if (!parts) return null;

    const red = clampRgbPart(parts[1]);
    const green = clampRgbPart(parts[2]);
    const blue = clampRgbPart(parts[3]);
    if (red === null || green === null || blue === null) return null;

    const parsed = {
        hex: `#${[red, green, blue]
            .map((part) => part.toString(16).padStart(2, '0'))
            .join('')}`,
    };

    const alpha = normalizeAlpha(parts[4]);
    if (alpha !== null) parsed.alpha = alpha;

    return parsed;
}

function hexToRgbText(hex) {
    const normalized = normalizeHex(hex) || '#000000';
    const red = parseInt(normalized.slice(1, 3), 16);
    const green = parseInt(normalized.slice(3, 5), 16);
    const blue = parseInt(normalized.slice(5, 7), 16);
    return `rgb(${red}, ${green}, ${blue})`;
}

function colorToRgbText(hex, alpha) {
    const rgb = hexToRgbText(hex);
    if (alpha >= 100) return rgb;

    return rgb.replace('rgb(', 'rgba(').replace(')', `, ${alpha / 100})`);
}

function scheduleSave() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        saveTimeout = null;
        handleSaveSettings('customUserTheme', currentTheme).catch((error) => {
            console.error('RoValra: Failed to save custom theme.', error);
        });
    }, SAVE_DELAY_MS);
}

function scheduleFieldApply(key) {
    pendingThemeFieldKeys.add(key);
    if (applyFrame !== null) return;

    applyFrame = requestAnimationFrame(() => {
        const keys = [...pendingThemeFieldKeys];
        pendingThemeFieldKeys = new Set();
        applyFrame = null;

        for (const fieldKey of keys) {
            applyCustomThemeField(fieldKey, currentTheme);
        }
    });
}

async function activateCustomTheme() {
    await handleSaveSettings('ThemeSwitcher', 'custom-user');
    await setTheme('custom-user');
    applyCustomTheme(currentTheme);
}

function syncSingleInput(
    key,
    { syncColor = true, syncRgb = true, syncAlpha = true } = {},
) {
    const alphaKey = getCustomThemeAlphaKey(key);
    const colorInput = editorInputs.get(key);
    if (syncColor && colorInput && colorInput.value !== currentTheme[key]) {
        colorInput.value = currentTheme[key];
    }

    const rgbInput = editorRgbInputs.get(key);
    if (syncRgb && rgbInput) {
        rgbInput.value = colorToRgbText(
            currentTheme[key],
            currentTheme[alphaKey],
        );
        rgbInput.classList.remove(
            'rovalra-custom-theme-selector-input-invalid',
        );
    }

    const alphaInput = editorAlphaInputs.get(key);
    if (syncAlpha && alphaInput) alphaInput.value = currentTheme[alphaKey];

    const alphaNumberInput = editorAlphaNumberInputs.get(key);
    if (syncAlpha && alphaNumberInput) {
        alphaNumberInput.value = currentTheme[alphaKey];
        alphaNumberInput.classList.remove(
            'rovalra-custom-theme-selector-input-invalid',
        );
    }
}

function setFieldValue(
    key,
    value,
    { save = true, syncRgb = true, syncColor = true } = {},
) {
    const parsed = parseColorInput(value);
    const rgbInput = editorRgbInputs.get(key);
    if (!parsed) {
        if (rgbInput) {
            rgbInput.classList.add(
                'rovalra-custom-theme-selector-input-invalid',
            );
        }
        return false;
    }

    currentTheme[key] = parsed.hex;
    if (parsed.alpha !== undefined) {
        currentTheme[getCustomThemeAlphaKey(key)] = parsed.alpha;
    }

    syncSingleInput(key, {
        syncColor,
        syncRgb,
        syncAlpha: parsed.alpha !== undefined,
    });
    scheduleFieldApply(key);
    if (save) scheduleSave();
    return true;
}

function setFieldAlpha(
    key,
    value,
    { save = true, syncRgb = true, syncAlpha = true } = {},
) {
    const parsed = normalizeAlpha(value);
    const alphaNumberInput = editorAlphaNumberInputs.get(key);
    if (parsed === null) {
        if (alphaNumberInput) {
            alphaNumberInput.classList.add(
                'rovalra-custom-theme-selector-input-invalid',
            );
        }
        return false;
    }

    currentTheme[getCustomThemeAlphaKey(key)] = parsed;

    syncSingleInput(key, { syncColor: false, syncRgb, syncAlpha });
    scheduleFieldApply(key);
    if (save) scheduleSave();
    return true;
}

function syncInputs(themeValue) {
    currentTheme = sanitizeCustomTheme(themeValue);
    for (const field of CUSTOM_THEME_FIELDS) syncSingleInput(field.key);
    applyCustomTheme(currentTheme);
}

function createColorRow(field) {
    const row = document.createElement('div');
    row.className = 'rovalra-custom-theme-selector-row';

    const label = document.createElement('label');
    label.className = 'rovalra-custom-theme-selector-label';
    label.htmlFor = `rovalra-custom-theme-${field.key}`;

    const labelText = document.createElement('span');
    labelText.textContent = field.label;
    label.appendChild(labelText);

    if (field.rovalra) {
        const badge = document.createElement('span');
        badge.className = 'rovalra-custom-theme-selector-badge';
        badge.textContent = 'RoValra';
        label.appendChild(badge);
    }

    const controls = document.createElement('div');
    controls.className = 'rovalra-custom-theme-selector-controls';

    const colorInput = document.createElement('input');
    colorInput.id = `rovalra-custom-theme-${field.key}`;
    colorInput.type = 'color';
    colorInput.value = currentTheme[field.key] || field.default;
    colorInput.addEventListener('input', () => {
        setFieldValue(field.key, colorInput.value, {
            syncColor: false,
            syncRgb: false,
        });
    });
    colorInput.addEventListener('change', () => {
        syncSingleInput(field.key);
    });

    const rgbInput = document.createElement('input');
    rgbInput.type = 'text';
    rgbInput.className = 'rovalra-custom-theme-selector-rgb-input';
    rgbInput.placeholder = 'rgb(51, 95, 255)';
    rgbInput.value = hexToRgbText(colorInput.value);
    rgbInput.addEventListener('input', () => {
        setFieldValue(field.key, rgbInput.value);
    });
    rgbInput.addEventListener('paste', () => {
        requestAnimationFrame(() => setFieldValue(field.key, rgbInput.value));
    });

    const alphaControls = document.createElement('div');
    alphaControls.className = 'rovalra-custom-theme-selector-alpha-controls';

    const alphaLabel = document.createElement('span');
    alphaLabel.className = 'rovalra-custom-theme-selector-alpha-label';
    alphaLabel.textContent = 'Opacity';

    const alphaInput = document.createElement('input');
    alphaInput.type = 'range';
    alphaInput.min = '0';
    alphaInput.max = '100';
    alphaInput.step = '1';
    alphaInput.value = currentTheme[getCustomThemeAlphaKey(field.key)] ?? 100;
    alphaInput.addEventListener('input', () => {
        setFieldAlpha(field.key, alphaInput.value, {
            syncRgb: false,
            syncAlpha: false,
        });
    });
    alphaInput.addEventListener('change', () => {
        syncSingleInput(field.key);
    });

    const alphaNumberInput = document.createElement('input');
    alphaNumberInput.type = 'number';
    alphaNumberInput.min = '0';
    alphaNumberInput.max = '100';
    alphaNumberInput.step = '1';
    alphaNumberInput.className = 'rovalra-custom-theme-selector-alpha-input';
    alphaNumberInput.value = alphaInput.value;
    alphaNumberInput.addEventListener('input', () => {
        setFieldAlpha(field.key, alphaNumberInput.value);
    });

    const alphaPercent = document.createElement('span');
    alphaPercent.className = 'rovalra-custom-theme-selector-alpha-percent';
    alphaPercent.textContent = '%';

    alphaControls.append(
        alphaLabel,
        alphaInput,
        alphaNumberInput,
        alphaPercent,
    );

    editorInputs.set(field.key, colorInput);
    editorRgbInputs.set(field.key, rgbInput);
    editorAlphaInputs.set(field.key, alphaInput);
    editorAlphaNumberInputs.set(field.key, alphaNumberInput);
    controls.append(colorInput, rgbInput, alphaControls);
    row.append(label, controls);
    return row;
}

function createEditorBody() {
    editorInputs = new Map();
    editorRgbInputs = new Map();
    editorAlphaInputs = new Map();
    editorAlphaNumberInputs = new Map();

    const body = document.createElement('div');
    body.className = 'rovalra-custom-theme-selector-body';

    const intro = document.createElement('p');
    intro.className = 'rovalra-custom-theme-selector-copy';
    intro.textContent =
        'Pick colors or paste RGB values. Changes apply live to the page behind this editor.';

    const controls = document.createElement('div');
    controls.className = 'rovalra-custom-theme-selector-list';
    const groups = [
        {
            title: 'Roblox Surfaces',
            fields: CUSTOM_THEME_FIELDS.filter((field) => !field.rovalra),
        },
        {
            title: 'RoValra Colors',
            fields: CUSTOM_THEME_FIELDS.filter((field) => field.rovalra),
        },
    ];

    for (const group of groups) {
        if (group.fields.length === 0) continue;

        const groupTitle = document.createElement('div');
        groupTitle.className = 'rovalra-custom-theme-selector-group-title';
        groupTitle.textContent = group.title;
        controls.appendChild(groupTitle);

        for (const field of group.fields) {
            controls.appendChild(createColorRow(field));
        }
    }

    body.append(intro, controls);
    return body;
}

function closeEditor() {
    if (!overlayHandle) return;
    const { close } = overlayHandle;
    close();
}

async function openEditor({ routeHome = false } = {}) {
    if (routeHome && !isHomePath()) {
        sessionStorage.setItem(ACTIVE_SESSION_KEY, 'true');
        sessionStorage.setItem(PENDING_HOME_OPEN_KEY, 'true');
        window.location.href = '/home';
        return;
    }

    if (overlayHandle) {
        syncInputs(currentTheme);
        return;
    }

    sessionStorage.setItem(ACTIVE_SESSION_KEY, 'true');

    const settings = await loadSettings();
    currentTheme = sanitizeCustomTheme(
        settings.customUserTheme || DEFAULT_CUSTOM_THEME,
    );
    await activateCustomTheme();

    const resetButton = createButton('Reset', 'secondary', {
        onClick: () => {
            syncInputs(DEFAULT_CUSTOM_THEME);
            scheduleSave();
        },
    });
    const closeButton = createButton('Close Editor', 'primary', {
        onClick: closeEditor,
    });

    overlayHandle = createOverlay({
        title: 'Custom Theme',
        bodyContent: createEditorBody(),
        actions: [resetButton, closeButton],
        maxWidth: '420px',
        maxHeight: 'calc(100vh - 96px)',
        preventBackdropClose: true,
        onClose: () => {
            sessionStorage.removeItem(ACTIVE_SESSION_KEY);
            sessionStorage.removeItem(PENDING_HOME_OPEN_KEY);
            overlayHandle = null;
            editorInputs = new Map();
            editorRgbInputs = new Map();
            editorAlphaInputs = new Map();
            editorAlphaNumberInputs = new Map();
        },
    });
    overlayHandle.overlay.classList.add(
        'rovalra-custom-theme-selector-overlay',
    );
    document.body.style.overflow = '';
    syncInputs(currentTheme);
}

function maybeRestoreOpenEditor() {
    if (sessionStorage.getItem(ACTIVE_SESSION_KEY) !== 'true') return;

    const pendingHomeOpen =
        sessionStorage.getItem(PENDING_HOME_OPEN_KEY) === 'true';
    if (pendingHomeOpen && !isHomePath()) return;

    sessionStorage.removeItem(PENDING_HOME_OPEN_KEY);
    openEditor();
}

export function init() {
    if (!initialized) {
        initialized = true;

        document.addEventListener('rovalra:openCustomThemeEditor', () => {
            openEditor({ routeHome: true });
        });

        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace !== 'local') return;
            if (!changes.customUserTheme || !overlayHandle) return;
            syncInputs(
                changes.customUserTheme.newValue || DEFAULT_CUSTOM_THEME,
            );
        });

        window.addEventListener('popstate', maybeRestoreOpenEditor);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', maybeRestoreOpenEditor, {
            once: true,
        });
    } else {
        maybeRestoreOpenEditor();
    }
}
