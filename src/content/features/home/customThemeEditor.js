import { createButton } from '../../core/ui/buttons.js';
import { createOverlay } from '../../core/ui/overlay.js';
import { createDropdown } from '../../core/ui/dropdown.js';
import { createPillToggle } from '../../core/ui/general/pillToggle.js';
import { ts } from '../../core/locale/i18n.js';
import {
    handleSaveSettings,
    loadSettings,
} from '../../core/settings/handlesettings.js';
import { createStyledInput } from '../../core/ui/catalog/input.js';
import { CUSTOM_THEME_SLOT_COUNT } from '../../core/themeCatalog.js';
import {
    BACKGROUND_IMAGE_ENABLED_SETTING,
    BACKGROUND_IMAGE_POSITION_OPTIONS,
    BACKGROUND_IMAGE_SETTING,
    BACKGROUND_IMAGE_SIZE_OPTIONS,
    DEFAULT_BACKGROUND_IMAGE,
    sanitizeBackgroundImage,
} from '../../core/backgroundImage.js';
import {
    CUSTOM_THEME_FIELDS,
    DEFAULT_CUSTOM_THEME,
    getCustomThemeAlphaKey,
    sanitizeCustomTheme,
} from '../../core/themeCustom.js';
import {
    applyBackgroundImage,
    applyCustomTheme,
    applyCustomThemeField,
    setTheme,
} from '../sitewide/themeSwitcher.js';
import { THEME_PATH } from '../themes/themeCatalogPage.js';

const ACTIVE_SESSION_KEY = 'rovalra_custom_theme_editor_active';
const BG_EDITOR_SESSION_KEY =
    'rovalra_custom_theme_background_editor_active';
const PENDING_THEME_OPEN_KEY = 'rovalra_custom_theme_editor_pending_theme';
const SELECTED_SLOT_SESSION_KEY = 'rovalra_custom_theme_editor_slot';
const SAVE_DELAY_MS = 120;
const TEXT_INPUT_DELAY_MS = 80;
const MAX_THEME_NAME_LENGTH = 20;
const EDITOR_MODES = [
    { key: 'roblox', label: 'Roblox' },
    { key: 'rovalra', label: 'RoValra' },
];
const BG_SIZE_ITEMS = [
    { label: 'Cover', value: 'cover' },
    { label: 'Contain', value: 'contain' },
    { label: 'Auto', value: 'auto' },
    { label: 'Custom', value: 'custom' },
];
const BG_POSITION_ITEMS = [
    { label: 'Center', value: 'center' },
    { label: 'Top', value: 'top' },
    { label: 'Bottom', value: 'bottom' },
    { label: 'Left', value: 'left' },
    { label: 'Right', value: 'right' },
    { label: 'Top Left', value: 'top left' },
    { label: 'Top Right', value: 'top right' },
    { label: 'Bottom Left', value: 'bottom left' },
    { label: 'Bottom Right', value: 'bottom right' },
];
const BG_TOGGLE_SETTING = BACKGROUND_IMAGE_ENABLED_SETTING;
let initialized = false;
let saveTimeout = null;
let bgSaveTimeout = null;
let textInputTimeouts = new Map();
let currentTheme = { ...DEFAULT_CUSTOM_THEME };
let backgroundImageConfig = { ...DEFAULT_BACKGROUND_IMAGE };
let backgroundEnabled = false;
let overlayHandle = null;
let editorInputs = new Map();
let editorRgbInputs = new Map();
let editorAlphaInputs = new Map();
let editorAlphaNumberInputs = new Map();
let bgControls = null;
let bgUrlTimeout = null;
let bgOverlayHandle = null;
let pendingThemeFieldKeys = new Set();
let applyFrame = null;
let customThemeSlots = [];
let currentSlotIndex = 0;
let slotDropdownApi = null;
let slotDropdownItems = [];
let slotNameInput = null;
let editorMode = 'roblox';
let editorListElement = null;

function isThemePath() {
    const normalizedPath = window.location.pathname
        .toLowerCase()
        .replace(/^\/[a-z]{2}(?:-[a-z]{2})?\//, '/');
    return normalizedPath === THEME_PATH;
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

function areThemesEqual(left, right) {
    const leftTheme = sanitizeCustomTheme(left);
    const rightTheme = sanitizeCustomTheme(right);

    for (const field of CUSTOM_THEME_FIELDS) {
        const alphaKey = getCustomThemeAlphaKey(field.key);
        if (leftTheme[field.key] !== rightTheme[field.key]) return false;
        if (leftTheme[alphaKey] !== rightTheme[alphaKey]) return false;
    }

    return true;
}

function text(key, defaultValue, options = {}) {
    return ts(`customThemeEditor.${key}`, { defaultValue, ...options });
}

function getModeFields(mode = editorMode) {
    return CUSTOM_THEME_FIELDS.filter((field) => {
        if (mode === 'rovalra') return field.rovalra;
        return !field.rovalra;
    });
}

function getDefaultSlotName(index) {
    return `Custom Theme ${index + 1}`;
}

function normalizeSlotName(value, index) {
    const trimmed = String(value || '').trim();
    return (trimmed || getDefaultSlotName(index)).slice(
        0,
        MAX_THEME_NAME_LENGTH,
    );
}

function getEditableSlotName(value, index) {
    return String(value ?? getDefaultSlotName(index)).slice(
        0,
        MAX_THEME_NAME_LENGTH,
    );
}

function createDefaultSlot(index, theme = DEFAULT_CUSTOM_THEME) {
    return {
        slot: index,
        name: getDefaultSlotName(index),
        theme: sanitizeCustomTheme(theme),
        created: false,
    };
}

function normalizeSlots(settings) {
    const slots = Array.from({ length: CUSTOM_THEME_SLOT_COUNT }, (_, index) =>
        createDefaultSlot(
            index,
            index === 0
                ? settings.customUserTheme || DEFAULT_CUSTOM_THEME
                : DEFAULT_CUSTOM_THEME,
        ),
    );
    const storedSlots = Array.isArray(settings.customUserThemeSlots)
        ? settings.customUserThemeSlots
        : [];

    for (const [fallbackIndex, slot] of storedSlots.entries()) {
        if (!slot || typeof slot !== 'object') continue;

        const rawSlotIndex = Number(slot.slot ?? slot.index);
        const slotIndex = Number.isFinite(rawSlotIndex)
            ? Math.max(
                  0,
                  Math.min(
                      CUSTOM_THEME_SLOT_COUNT - 1,
                      Math.round(rawSlotIndex),
                  ),
              )
            : fallbackIndex;
        if (!slots[slotIndex]) continue;

        slots[slotIndex] = {
            slot: slotIndex,
            name: normalizeSlotName(slot.name, slotIndex),
            theme: sanitizeCustomTheme(slot.theme || slot.colors || slot),
            created: true,
        };
    }

    return slots;
}

function serializeCreatedSlots() {
    return customThemeSlots
        .filter((slot) => slot?.created)
        .slice(0, CUSTOM_THEME_SLOT_COUNT)
        .map((slot) => ({
            slot: slot.slot,
            name: normalizeSlotName(slot.name, slot.slot),
            theme: sanitizeCustomTheme(slot.theme),
        }));
}

function updateCurrentSlotFromEditor() {
    const slot = customThemeSlots[currentSlotIndex];
    if (!slot) return;

    slot.created = true;
    slot.name = getEditableSlotName(
        slotNameInput?.value || slot.name,
        slot.slot,
    );
    slot.theme = sanitizeCustomTheme(currentTheme);
}

async function persistCurrentSlot() {
    updateCurrentSlotFromEditor();
    const savedTheme = sanitizeCustomTheme(currentTheme);
    await Promise.all([
        handleSaveSettings('customUserTheme', savedTheme),
        handleSaveSettings('customUserThemeSlots', serializeCreatedSlots()),
    ]);
}

function scheduleSave() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        saveTimeout = null;
        persistCurrentSlot().catch((error) => {
            console.error('RoValra: Failed to save custom theme.', error);
        });
    }, SAVE_DELAY_MS);
}

function clearTextInputTimeouts() {
    for (const pending of textInputTimeouts.values()) {
        clearTimeout(pending.timeout);
    }
    textInputTimeouts = new Map();
}

function flushTextInputTimeouts() {
    const pendingEntries = [...textInputTimeouts.entries()];
    clearTextInputTimeouts();

    for (const [key, pending] of pendingEntries) {
        setFieldValue(key, pending.value, { save: false });
    }
}

function flushBgUrlInput() {
    if (!bgUrlTimeout) return;

    clearTimeout(bgUrlTimeout);
    bgUrlTimeout = null;
    if (bgControls?.urlInput) applyBgUrlInput(bgControls.urlInput);
}

async function flushSave() {
    flushTextInputTimeouts();

    if (saveTimeout) {
        clearTimeout(saveTimeout);
        saveTimeout = null;
    }

    await persistCurrentSlot();
}

async function persistBackgroundConfig() {
    await handleSaveSettings(
        BACKGROUND_IMAGE_SETTING,
        sanitizeBackgroundImage(backgroundImageConfig),
    );
}

function scheduleBackgroundSave() {
    if (bgSaveTimeout) clearTimeout(bgSaveTimeout);
    bgSaveTimeout = setTimeout(() => {
        bgSaveTimeout = null;
        persistBackgroundConfig().catch((error) => {
            console.error(
                'RoValra: Failed to save background image settings.',
                error,
            );
        });
    }, SAVE_DELAY_MS);
}

async function flushBackgroundSave() {
    flushBgUrlInput();

    if (bgSaveTimeout) {
        clearTimeout(bgSaveTimeout);
        bgSaveTimeout = null;
    }

    await persistBackgroundConfig();
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
    await handleSaveSettings('ThemeSwitcherEnabled', true);
    await handleSaveSettings('ThemeSwitcher', 'custom-user');
    await setTheme('custom-user', currentTheme);
    applyCustomTheme(currentTheme);
}

function resetField(key) {
    const field = CUSTOM_THEME_FIELDS.find((entry) => entry.key === key);
    if (!field) return;

    currentTheme[key] = field.default;
    currentTheme[getCustomThemeAlphaKey(key)] = field.alphaDefault ?? 100;
    syncSingleInput(key);
    scheduleFieldApply(key);
    scheduleSave();
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
    const existingPending = textInputTimeouts.get(key);
    if (existingPending) {
        clearTimeout(existingPending.timeout);
        textInputTimeouts.delete(key);
    }

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

function scheduleTextFieldValue(key, value) {
    const existingPending = textInputTimeouts.get(key);
    if (existingPending) clearTimeout(existingPending.timeout);

    textInputTimeouts.set(key, {
        value,
        timeout: setTimeout(() => {
            textInputTimeouts.delete(key);
            setFieldValue(key, value);
        }, TEXT_INPUT_DELAY_MS),
    });
}

function syncInputs(themeValue) {
    currentTheme = sanitizeCustomTheme(themeValue);
    for (const field of getModeFields()) syncSingleInput(field.key);
    applyCustomTheme(currentTheme);
}

function getBg() {
    return sanitizeBackgroundImage(backgroundImageConfig);
}

function applyBackgroundPreview() {
    applyBackgroundImage(getBg(), backgroundEnabled);
}

function setBg(next, { immediate = false } = {}) {
    backgroundImageConfig = sanitizeBackgroundImage({
        ...getBg(),
        ...next,
    });
    syncBgControls();
    applyBackgroundPreview();
    if (next.source && backgroundEnabled !== true) {
        backgroundEnabled = true;
        saveBgToggle(true);
    }
    if (immediate) {
        persistBackgroundConfig().catch((error) => {
            console.error(
                'RoValra: Failed to save background image settings.',
                error,
            );
        });
        return;
    }
    scheduleBackgroundSave();
}

function saveBgToggle(enabled) {
    handleSaveSettings(BG_TOGGLE_SETTING, enabled)
        .catch((error) => {
            console.error('RoValra: Failed to save background toggle.', error);
        });
}

async function applyBgToggle(enabled) {
    try {
        backgroundEnabled = enabled === true;
        if (!bgOverlayHandle) {
            const settings = await loadSettings();
            backgroundImageConfig = sanitizeBackgroundImage(
                settings[BACKGROUND_IMAGE_SETTING],
            );
        }
        applyBackgroundPreview();
    } catch (error) {
        console.error('RoValra: Failed to toggle background image.', error);
    }
}

function normalizeBgUrl(value) {
    try {
        const url = new URL(String(value || '').trim());
        return url.protocol === 'https:' ? url.href : null;
    } catch {
        return String(value || '').trim() ? null : '';
    }
}

function applyBgUrlInput(urlInput, updates = {}) {
    const bgUrl = normalizeBgUrl(urlInput.value);
    if (bgUrl === null) {
        setBgError(
            text(
                'background.errors.invalidUrl',
                'Enter a valid https image URL.',
            ),
        );
        urlInput.classList.add('rovalra-custom-theme-selector-input-invalid');
        return;
    }

    setBgError('');
    urlInput.classList.remove('rovalra-custom-theme-selector-input-invalid');
    if (bgUrl) {
        backgroundEnabled = true;
        saveBgToggle(true);
    }
    setBg(
        {
            ...updates,
            source: bgUrl,
        },
        { immediate: true },
    );
}

function scheduleBgUrlInput(urlInput) {
    if (bgUrlTimeout) clearTimeout(bgUrlTimeout);
    bgUrlTimeout = setTimeout(() => {
        bgUrlTimeout = null;
        applyBgUrlInput(urlInput);
    }, TEXT_INPUT_DELAY_MS);
}

function setBgError(message = '') {
    if (!bgControls?.error) return;
    bgControls.error.textContent = message;
    bgControls.error.hidden = !message;
}

function createBgToggle({ checked = false, ariaLabel, onChange }) {
    const label = document.createElement('label');
    label.className = 'toggle-switch rovalra-custom-theme-background-toggle';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.setAttribute('aria-label', ariaLabel);
    input.addEventListener('change', () => onChange(input.checked));

    const slider = document.createElement('span');
    slider.className = 'slider';

    label.append(input, slider);

    return { element: label, input };
}

function createBgRow(labelText, control) {
    const row = document.createElement('div');
    row.className = 'rovalra-custom-theme-background-row';

    const label = document.createElement('label');
    label.className = 'rovalra-custom-theme-selector-label';
    label.textContent = labelText;

    row.append(label, control);
    return row;
}

function createBgRange({ label, min, max, step = 1, value, unit = '', onInput }) {
    const wrapper = document.createElement('div');
    wrapper.className = 'rovalra-custom-theme-background-range';

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.setAttribute('aria-label', label);

    const valueEl = document.createElement('span');
    valueEl.className = 'rovalra-custom-theme-background-range-value';

    const update = (next) => {
        valueEl.textContent = `${next}${unit}`;
        input.setAttribute('aria-valuetext', valueEl.textContent);
    };

    input.addEventListener('input', () => {
        update(input.value);
        onInput(Number(input.value));
    });

    update(value);
    wrapper.append(input, valueEl);

    const row = createBgRow(label, wrapper);
    row.rovalraRangeInput = input;
    row.rovalraRangeValue = valueEl;
    return row;
}

function syncBgRange(row, value, unit) {
    row.rovalraRangeInput.value = value;
    row.rovalraRangeValue.textContent = `${value}${unit}`;
    row.rovalraRangeInput.setAttribute(
        'aria-valuetext',
        row.rovalraRangeValue.textContent,
    );
}

function syncBgControls() {
    if (!bgControls) return;

    const bg = getBg();
    const opacity = Math.round(bg.opacity * 100);
    const overlay = Math.round(bg.overlayOpacity * 100);

    bgControls.urlInput.value = bg.source;
    syncBgRange(bgControls.opacityRow, opacity, '%');
    syncBgRange(bgControls.blurRow, bg.blur, 'px');
    syncBgRange(bgControls.customSizeRow, bg.customSize, '%');
    bgControls.customSizeRow.hidden = bg.size !== 'custom';
    bgControls.overlayColor.value = bg.overlayColor;
    syncBgRange(bgControls.overlayOpacityRow, overlay, '%');
    bgControls.overrideTopbarSidebar.checked = bg.overrideTopbarSidebar;
    bgControls.sizeDropdown.setValue(bg.size);
    bgControls.positionDropdown.setValue(bg.position);
}

function createBgDropdown(items, value, validValues, onChange) {
    const dropdown = createDropdown({
        items,
        initialValue: value,
        onValueChange: (next) => {
            if (!validValues.includes(next)) return;
            onChange(next);
        },
    });
    dropdown.element.classList.add('rovalra-custom-theme-background-dropdown');
    dropdown.panel.classList.add(
        'rovalra-custom-theme-background-dropdown-panel',
    );
    return dropdown;
}

function createBgSection() {
    const bg = getBg();
    const section = document.createElement('section');
    section.className =
        'rovalra-custom-theme-background-section rovalra-custom-theme-background-section-compact';
    const { container: urlContainer, input: urlInput } = createStyledInput({
        id: 'rovalra-custom-theme-background-url',
        label: '',
        placeholder: 'https://example.com/image.png',
        value: bg.source,
    });
    urlContainer.classList.add('rovalra-custom-theme-background-url-wrapper');
    urlInput.type = 'url';
    urlInput.addEventListener('input', () => scheduleBgUrlInput(urlInput));
    urlInput.addEventListener('change', () => applyBgUrlInput(urlInput));

    const sourceControls = document.createElement('div');
    sourceControls.className = 'rovalra-custom-theme-background-source';
    sourceControls.append(urlContainer);

    const sourceRow = createBgRow(
        text('background.source', 'Image Source'),
        sourceControls,
    );

    const error = document.createElement('div');
    error.className = 'rovalra-custom-theme-background-error';
    error.hidden = true;
    error.setAttribute('role', 'alert');

    const opacityRow = createBgRange({
        label: text('background.opacity', 'Image Opacity'),
        min: 0,
        max: 100,
        value: Math.round(bg.opacity * 100),
        unit: '%',
        onInput: (value) => setBg({ opacity: value / 100 }),
    });

    const sizeDropdown = createBgDropdown(
        BG_SIZE_ITEMS.map((item) => ({
            ...item,
            label: text(`background.size.${item.value}`, item.label),
        })),
        bg.size,
        BACKGROUND_IMAGE_SIZE_OPTIONS,
        (size) => setBg({ size }, { immediate: true }),
    );
    const sizeRow = createBgRow(
        text('background.size.label', 'Background Size'),
        sizeDropdown.element,
    );

    const customSizeRow = createBgRange({
        label: text('background.customSize', 'Custom Scale'),
        min: 25,
        max: 300,
        value: bg.customSize,
        unit: '%',
        onInput: (customSize) => setBg({ customSize }),
    });
    customSizeRow.hidden = bg.size !== 'custom';

    const positionDropdown = createBgDropdown(
        BG_POSITION_ITEMS.map((item) => ({
            ...item,
            label: text(
                `background.position.${item.value.replaceAll(' ', '')}`,
                item.label,
            ),
        })),
        bg.position,
        BACKGROUND_IMAGE_POSITION_OPTIONS,
        (position) => setBg({ position }, { immediate: true }),
    );

    const blurRow = createBgRange({
        label: text('background.blur', 'Blur'),
        min: 0,
        max: 20,
        value: bg.blur,
        unit: 'px',
        onInput: (blur) => setBg({ blur }),
    });

    const overlayColor = document.createElement('input');
    overlayColor.type = 'color';
    overlayColor.value = bg.overlayColor;
    overlayColor.setAttribute(
        'aria-label',
        text('background.overlay.color', 'Overlay Color'),
    );
    overlayColor.addEventListener('input', () =>
        setBg({ overlayColor: overlayColor.value }),
    );
    const overlayColorRow = createBgRow(
        text('background.overlay.color', 'Overlay Color'),
        overlayColor,
    );

    const overlayOpacityRow = createBgRange({
        label: text('background.overlay.opacity', 'Overlay Opacity'),
        min: 0,
        max: 100,
        value: Math.round(bg.overlayOpacity * 100),
        unit: '%',
        onInput: (value) => setBg({ overlayOpacity: value / 100 }),
    });

    const { element: overrideTopbarSidebarToggle, input: overrideTopbarSidebarInput } = createBgToggle({
        checked: bg.overrideTopbarSidebar,
        ariaLabel: text(
            'background.overrideTopbarSidebar',
            'Transparent Mode',
        ),
        onChange: (overrideTopbarSidebar) =>
            setBg({ overrideTopbarSidebar }, { immediate: true }),
    });

    const overrideTopbarSidebarRow = createBgRow(
        text(
            'background.overrideTopbarSidebar',
            'Transparent Mode',
        ),
        overrideTopbarSidebarToggle,
    );
    overrideTopbarSidebarRow.classList.add(
        'rovalra-custom-theme-background-toggle-row',
    );

    section.append(
        sourceRow,
        error,
        opacityRow,
        blurRow,
        overlayOpacityRow,
        overlayColorRow,
        overrideTopbarSidebarRow,
        sizeRow,
        customSizeRow,
        createBgRow(
            text('background.position.label', 'Background Position'),
            positionDropdown.element,
        ),
    );

    bgControls = {
        urlInput,
        error,
        opacityRow,
        sizeDropdown,
        customSizeRow,
        positionDropdown,
        blurRow,
        overlayColor,
        overlayOpacityRow,
        overrideTopbarSidebar: overrideTopbarSidebarInput,
    };
    syncBgControls();

    return section;
}

function syncSlotDropdownLabels() {
    for (const item of slotDropdownItems) {
        const slotIndex = Number(item.value);
        const slotValue = customThemeSlots[slotIndex];
        item.label = slotValue
            ? `Slot ${slotIndex + 1}: ${normalizeSlotName(
                  slotValue.name,
                  slotIndex,
              )}`
            : `Slot ${slotIndex + 1}`;
    }

    slotDropdownApi?.refresh();
}

function syncSlotControls({ syncNameInput = true } = {}) {
    const slot = customThemeSlots[currentSlotIndex];
    if (!slot) return;

    if (syncNameInput && slotNameInput) {
        slotNameInput.value = getEditableSlotName(slot.name, slot.slot);
    }

    syncSlotDropdownLabels();
    slotDropdownApi?.setValue(String(currentSlotIndex));
}

async function selectSlot(slotIndex) {
    const nextSlotIndex = Math.max(
        0,
        Math.min(CUSTOM_THEME_SLOT_COUNT - 1, Number(slotIndex) || 0),
    );
    if (nextSlotIndex === currentSlotIndex) return;

    await flushSave();
    currentSlotIndex = nextSlotIndex;
    const slot = customThemeSlots[currentSlotIndex];
    syncSlotControls();
    syncInputs(slot?.theme || DEFAULT_CUSTOM_THEME);
    await activateCustomTheme();
}

function createColorRow(field) {
    const row = document.createElement('div');
    row.className = 'rovalra-custom-theme-selector-row';

    const label = document.createElement('div');
    label.className = 'rovalra-custom-theme-selector-label';

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
    colorInput.setAttribute('aria-label', field.label);
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

    const resetButton = createButton('Reset', 'secondary', {
        onClick: () => resetField(field.key),
    });
    resetButton.classList.add('rovalra-custom-theme-selector-reset');
    resetButton.setAttribute('aria-label', `Reset ${field.label}`);

    const { container: rgbInputContainer, input: rgbInput } = createStyledInput(
        {
            id: `rovalra-custom-theme-${field.key}-rgb`,
            label: 'RGB',
            placeholder: 'rgb(51, 95, 255)',
            value: hexToRgbText(colorInput.value),
        },
    );
    rgbInputContainer.classList.add(
        'rovalra-custom-theme-selector-rgb-input-wrapper',
    );
    rgbInput.classList.add('rovalra-custom-theme-selector-rgb-input');
    rgbInput.addEventListener('input', () => {
        scheduleTextFieldValue(field.key, rgbInput.value);
    });
    rgbInput.addEventListener('paste', () => {
        requestAnimationFrame(() =>
            scheduleTextFieldValue(field.key, rgbInput.value),
        );
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

    const { container: alphaNumberInputContainer, input: alphaNumberInput } =
        createStyledInput({
            id: `rovalra-custom-theme-${field.key}-alpha`,
            label: '',
            value: alphaInput.value,
        });
    alphaNumberInput.type = 'number';
    alphaNumberInput.min = '0';
    alphaNumberInput.max = '100';
    alphaNumberInput.step = '1';
    alphaNumberInput.classList.add('rovalra-custom-theme-selector-alpha-input');
    alphaNumberInputContainer.classList.add(
        'rovalra-custom-theme-selector-alpha-input-wrapper',
    );
    alphaNumberInput.addEventListener('input', () => {
        setFieldAlpha(field.key, alphaNumberInput.value);
    });

    const alphaPercent = document.createElement('span');
    alphaPercent.className = 'rovalra-custom-theme-selector-alpha-percent';
    alphaPercent.textContent = '%';

    alphaControls.append(
        alphaLabel,
        alphaInput,
        alphaNumberInputContainer,
        alphaPercent,
    );

    editorInputs.set(field.key, colorInput);
    editorRgbInputs.set(field.key, rgbInput);
    editorAlphaInputs.set(field.key, alphaInput);
    editorAlphaNumberInputs.set(field.key, alphaNumberInput);
    controls.append(colorInput, rgbInputContainer, resetButton, alphaControls);
    row.append(label, controls);
    return row;
}

function createSlotControls() {
    const wrapper = document.createElement('div');
    wrapper.className = 'rovalra-custom-theme-slot-controls';

    const slotField = document.createElement('div');
    slotField.className = 'rovalra-custom-theme-slot-field';

    const slotLabel = document.createElement('span');
    slotLabel.className = 'rovalra-custom-theme-slot-label';
    slotLabel.textContent = 'Save Slot';

    slotDropdownItems = Array.from(
        { length: CUSTOM_THEME_SLOT_COUNT },
        (_, index) => ({
            label: `Slot ${index + 1}: ${normalizeSlotName(
                customThemeSlots[index]?.name,
                index,
            )}`,
            value: String(index),
        }),
    );
    slotDropdownApi = createDropdown({
        items: slotDropdownItems,
        initialValue: String(currentSlotIndex),
        onValueChange: (value) => {
            selectSlot(Number(value)).catch((error) => {
                console.error(
                    'RoValra: Failed to switch custom theme slot.',
                    error,
                );
            });
        },
    });

    slotField.append(slotLabel, slotDropdownApi.element);

    const nameField = document.createElement('div');
    nameField.className = 'rovalra-custom-theme-slot-field';

    const nameLabel = document.createElement('span');
    nameLabel.className = 'rovalra-custom-theme-slot-label';
    nameLabel.textContent = 'Theme Name';

    const { container: nameInputContainer, input: nameInput } =
        createStyledInput({
            id: 'rovalra-custom-theme-slot-name',
            label: 'Theme Name',
            value: normalizeSlotName(
                customThemeSlots[currentSlotIndex]?.name,
                currentSlotIndex,
            ),
        });
    nameInput.maxLength = MAX_THEME_NAME_LENGTH;
    nameInputContainer.classList.add('rovalra-custom-theme-slot-name-wrapper');
    nameInput.addEventListener('input', () => {
        if (nameInput.value.length > MAX_THEME_NAME_LENGTH) {
            nameInput.value = nameInput.value.slice(0, MAX_THEME_NAME_LENGTH);
        }
        updateCurrentSlotFromEditor();
        syncSlotControls({ syncNameInput: false });
        scheduleSave();
    });
    slotNameInput = nameInput;

    nameField.append(nameLabel, nameInputContainer);
    wrapper.append(slotField, nameField);
    return wrapper;
}

function renderEditorFields() {
    if (!editorListElement) return;

    editorInputs = new Map();
    editorRgbInputs = new Map();
    editorAlphaInputs = new Map();
    editorAlphaNumberInputs = new Map();
    editorListElement.replaceChildren();

    const groupTitle = document.createElement('div');
    groupTitle.className = 'rovalra-custom-theme-selector-group-title';
    groupTitle.textContent =
        EDITOR_MODES.find((mode) => mode.key === editorMode)?.label || 'Theme';
    editorListElement.appendChild(groupTitle);

    for (const field of getModeFields()) {
        editorListElement.appendChild(createColorRow(field));
    }
}

function createModeControls() {
    const wrapper = document.createElement('div');
    wrapper.className = 'rovalra-custom-theme-mode-controls';

    const toggle = createPillToggle({
        options: EDITOR_MODES.map((mode) => ({
            text: mode.label,
            value: mode.key,
        })),
        initialValue: editorMode,
        onChange: (value) => {
            if (editorMode === value) return;
            flushTextInputTimeouts();
            editorMode = value;
            renderEditorFields();
            for (const field of getModeFields()) syncSingleInput(field.key);
        },
    });

    wrapper.appendChild(toggle);

    return wrapper;
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
    editorListElement = controls;
    renderEditorFields();

    body.append(intro, createSlotControls(), createModeControls(), controls);
    return body;
}

async function openBgEditor() {
    if (bgOverlayHandle) return;

    sessionStorage.setItem(BG_EDITOR_SESSION_KEY, 'true');

    const settings = await loadSettings();
    backgroundImageConfig = sanitizeBackgroundImage(
        settings[BACKGROUND_IMAGE_SETTING],
    );
    backgroundEnabled = settings[BG_TOGGLE_SETTING] === true;
    applyBackgroundPreview();

    const closeButton = createButton('Close', 'primary', {
        onClick: () => {
            flushBackgroundSave()
                .catch((error) => {
                    console.error(
                        'RoValra: Failed to save custom background.',
                        error,
                    );
                })
                .finally(() => bgOverlayHandle?.close());
        },
    });

    const resetButton = createButton('Reset', 'secondary', {
        onClick: () => {
            setBgError('');
            backgroundImageConfig = { ...DEFAULT_BACKGROUND_IMAGE };
            backgroundEnabled = false;
            saveBgToggle(false);
            syncBgControls();
            applyBackgroundPreview();
            persistBackgroundConfig().catch((error) => {
                console.error(
                    'RoValra: Failed to reset background image settings.',
                    error,
                );
            });
        },
    });

    const body = document.createElement('div');
    body.className =
        'rovalra-custom-theme-selector-body rovalra-custom-theme-background-body';
    body.append(createBgSection());

    bgOverlayHandle = createOverlay({
        title: text('background.title', 'Customize Image Settings'),
        bodyContent: body,
        actions: [resetButton, closeButton],
        maxWidth: '420px',
        maxHeight: 'calc(100vh - 96px)',
        preventBackdropClose: true,
        onClose: () => {
            if (bgUrlTimeout) clearTimeout(bgUrlTimeout);
            bgUrlTimeout = null;
            if (bgSaveTimeout) clearTimeout(bgSaveTimeout);
            bgSaveTimeout = null;
            destroyBgControls();
            sessionStorage.removeItem(BG_EDITOR_SESSION_KEY);
            bgOverlayHandle = null;
        },
    });
    bgOverlayHandle.overlay.classList.add(
        'rovalra-custom-theme-selector-overlay',
        'rovalra-custom-theme-background-overlay',
    );
    document.body.style.overflow = '';
    syncBgControls();
}

function closeEditor() {
    if (!overlayHandle) return;
    const { close } = overlayHandle;
    flushSave()
        .catch((error) => {
            console.error('RoValra: Failed to save custom theme.', error);
        })
        .finally(close);
}

function getRequestedSlotIndex(slotIndex) {
    const number = Number(slotIndex);
    if (!Number.isFinite(number)) return 0;
    return Math.max(
        0,
        Math.min(CUSTOM_THEME_SLOT_COUNT - 1, Math.round(number)),
    );
}

async function openEditor({ routeTheme = false, slotIndex = 0 } = {}) {
    const requestedSlotIndex = getRequestedSlotIndex(slotIndex);

    if (routeTheme && !isThemePath()) {
        sessionStorage.setItem(ACTIVE_SESSION_KEY, 'true');
        sessionStorage.setItem(PENDING_THEME_OPEN_KEY, 'true');
        sessionStorage.setItem(
            SELECTED_SLOT_SESSION_KEY,
            String(requestedSlotIndex),
        );
        window.location.href = THEME_PATH;
        return;
    }

    if (overlayHandle) {
        if (requestedSlotIndex !== currentSlotIndex) {
            selectSlot(requestedSlotIndex).catch((error) => {
                console.error(
                    'RoValra: Failed to switch custom theme slot.',
                    error,
                );
            });
        } else {
            syncInputs(currentTheme);
        }
        return;
    }

    sessionStorage.setItem(ACTIVE_SESSION_KEY, 'true');

    const settings = await loadSettings();
    customThemeSlots = normalizeSlots(settings);
    currentSlotIndex = requestedSlotIndex;
    currentTheme = sanitizeCustomTheme(
        customThemeSlots[currentSlotIndex].theme,
    );
    await activateCustomTheme();

    const resetButton = createButton('Reset', 'secondary', {
        onClick: () => {
            syncInputs(DEFAULT_CUSTOM_THEME);
            updateCurrentSlotFromEditor();
            syncSlotControls();
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
            clearTextInputTimeouts();
            if (saveTimeout) {
                clearTimeout(saveTimeout);
                saveTimeout = null;
            }
            if (applyFrame !== null) {
                cancelAnimationFrame(applyFrame);
                applyFrame = null;
                pendingThemeFieldKeys = new Set();
            }
            sessionStorage.removeItem(ACTIVE_SESSION_KEY);
            sessionStorage.removeItem(PENDING_THEME_OPEN_KEY);
            sessionStorage.removeItem(SELECTED_SLOT_SESSION_KEY);
            overlayHandle = null;
            editorInputs = new Map();
            editorRgbInputs = new Map();
            editorAlphaInputs = new Map();
            editorAlphaNumberInputs = new Map();
            slotDropdownApi?.destroy();
            slotDropdownApi = null;
            slotDropdownItems = [];
            slotNameInput = null;
            editorListElement = null;
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

    const pendingThemeOpen =
        sessionStorage.getItem(PENDING_THEME_OPEN_KEY) === 'true';
    if (pendingThemeOpen && !isThemePath()) return;

    sessionStorage.removeItem(PENDING_THEME_OPEN_KEY);
    openEditor({
        slotIndex: sessionStorage.getItem(SELECTED_SLOT_SESSION_KEY),
    });
}

function destroyBgControls() {
    bgControls?.sizeDropdown.destroy();
    bgControls?.positionDropdown.destroy();
    bgControls = null;
}

function maybeRestoreBgEditor() {
    if (sessionStorage.getItem(BG_EDITOR_SESSION_KEY) !== 'true') return;

    if (bgOverlayHandle && !document.body.contains(bgOverlayHandle.overlay)) bgOverlayHandle = null;

    openBgEditor().catch((error) => {
        console.error(
            'RoValra: Failed to restore custom background settings.',
            error,
        );
    });
}

export function init() {
    if (!initialized) {
        initialized = true;

        document.addEventListener('rovalra:openCustomThemeEditor', (event) => {
            openEditor({
                routeTheme: true,
                slotIndex: event.detail?.slotIndex ?? 0,
            });
        });

        document.addEventListener('rovalra:openCustomThemeBackground', () => {
            openBgEditor().catch((error) => {
                console.error(
                    'RoValra: Failed to open custom background settings.',
                    error,
                );
            });
        });

        document.addEventListener('rovalra:settingSaved', (event) => {
            if (event.detail?.name !== BG_TOGGLE_SETTING) return;
            applyBgToggle(event.detail.value === true);
        });

        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace !== 'local') return;
            if (!changes.customUserTheme || !overlayHandle) return;
            if (
                areThemesEqual(changes.customUserTheme.newValue, currentTheme)
            ) {
                return;
            }
            syncInputs(
                changes.customUserTheme.newValue || DEFAULT_CUSTOM_THEME,
            );
        });

        window.addEventListener('popstate', maybeRestoreOpenEditor);
        window.addEventListener('popstate', maybeRestoreBgEditor);
        window.addEventListener('rovalra:urlChanged', maybeRestoreBgEditor);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', maybeRestoreOpenEditor, {
            once: true,
        });
        document.addEventListener('DOMContentLoaded', maybeRestoreBgEditor, {
            once: true,
        });
    } else {
        maybeRestoreOpenEditor();
        maybeRestoreBgEditor();
    }
}
