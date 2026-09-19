import { createButton } from '../../core/ui/buttons.js';
import { createOverlay } from '../../core/ui/overlay.js';
import { createDropdown } from '../../core/ui/dropdown.js';
import { ts } from '../../core/locale/i18n.js';
import { handleSaveSettings, loadSettings } from '../../core/settings/handlesettings.js';
import { createStyledInput } from '../../core/ui/catalog/input.js';
import {
    BACKGROUND_IMAGE_ENABLED_SETTING,
    BACKGROUND_IMAGE_POSITION_OPTIONS,
    BACKGROUND_IMAGE_SETTING,
    BACKGROUND_IMAGE_SIZE_OPTIONS,
    DEFAULT_BACKGROUND_IMAGE,
    sanitizeBackgroundImage,
} from '../../core/backgroundImage.js';
import { applyBackgroundImage } from '../sitewide/backgroundImage.js';

const EDITOR_SESSION_KEY = 'rovalra_custom_theme_background_editor_active';
const SUPPORTED_HOSTS = new Set(['www.roblox.com', 'roblox.com']);
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
let initialized = false;
let editorHandle = null;
let backgroundImageConfig = { ...DEFAULT_BACKGROUND_IMAGE };
let backgroundEnabled = false;
let bgControls = null;
let bgUrlTimeout = null;
let bgSaveTimeout = null;

function text(key, defaultValue) {
    return ts(`customThemeEditor.${key}`, { defaultValue });
}

function getBg() { return sanitizeBackgroundImage(backgroundImageConfig); }

function setBgError(message = '') {
    if (!bgControls?.error) return;
    bgControls.error.textContent = message;
    bgControls.error.hidden = !message;
}

function saveBgToggle(enabled) {
    handleSaveSettings(BACKGROUND_IMAGE_ENABLED_SETTING, enabled).catch(console.error);
}

function persistBg() {
    return Promise.all([
        handleSaveSettings(BACKGROUND_IMAGE_SETTING, getBg()),
        handleSaveSettings(BACKGROUND_IMAGE_ENABLED_SETTING, backgroundEnabled),
    ]);
}

function applyBgPreview() { applyBackgroundImage(getBg(), backgroundEnabled); }

function setBg(next, immediate = false) {
    backgroundImageConfig = sanitizeBackgroundImage({ ...getBg(), ...next });
    syncBgControls();
    applyBgPreview();
    if (next.source && !backgroundEnabled) {
        backgroundEnabled = true;
        saveBgToggle(true);
    }
    if (bgSaveTimeout) clearTimeout(bgSaveTimeout);
    if (immediate) {
        persistBg().catch(console.error);
    } else {
        bgSaveTimeout = setTimeout(() => { bgSaveTimeout = null; persistBg().catch(console.error); }, 120);
    }
}

function normalizeBgUrl(value) {
    try { const url = new URL(String(value || '').trim()); return url.protocol === 'https:' ? url.href : null; }
    catch { return String(value || '').trim() ? null : ''; }
}

function applyBgUrlInput(input) {
    const value = normalizeBgUrl(input.value);
    if (value === null) {
        setBgError(text('background.errors.invalidUrl', 'Enter a valid https image URL.'));
        input.classList.add('rovalra-custom-theme-selector-input-invalid');
        return;
    }
    setBgError('');
    input.classList.remove('rovalra-custom-theme-selector-input-invalid');
    setBg({ source: value }, true);
}

function createBgToggle({ checked, ariaLabel, onChange }) {
    const label = document.createElement('label');
    label.className = 'toggle-switch rovalra-custom-theme-background-toggle';
    const input = document.createElement('input');
    input.type = 'checkbox'; input.checked = checked; input.setAttribute('aria-label', ariaLabel);
    input.addEventListener('change', () => onChange(input.checked));
    const slider = document.createElement('span'); slider.className = 'slider';
    label.append(input, slider);
    return { element: label, input };
}

function createBgRow(labelText, control) {
    const row = document.createElement('div'); row.className = 'rovalra-custom-theme-background-row';
    const label = document.createElement('label'); label.className = 'rovalra-custom-theme-selector-label'; label.textContent = labelText;
    row.append(label, control); return row;
}

function createBgRange({ label, min, max, step = 1, value, unit = '', onInput }) {
    const wrapper = document.createElement('div'); wrapper.className = 'rovalra-custom-theme-background-range';
    const input = document.createElement('input'); input.type = 'range'; input.min = String(min); input.max = String(max); input.step = String(step); input.value = String(value); input.setAttribute('aria-label', label);
    const valueEl = document.createElement('span'); valueEl.className = 'rovalra-custom-theme-background-range-value';
    const update = (next) => { valueEl.textContent = `${next}${unit}`; input.setAttribute('aria-valuetext', valueEl.textContent); };
    input.addEventListener('input', () => { update(input.value); onInput(Number(input.value)); }); update(value); wrapper.append(input, valueEl);
    const row = createBgRow(label, wrapper); row.rovalraRangeInput = input; row.rovalraRangeValue = valueEl; return row;
}

function syncBgRange(row, value, unit) { row.rovalraRangeInput.value = value; row.rovalraRangeValue.textContent = `${value}${unit}`; row.rovalraRangeInput.setAttribute('aria-valuetext', row.rovalraRangeValue.textContent); }
function createBgDropdown(items, value, validValues, onChange) {
    const dropdown = createDropdown({ items, initialValue: value, onValueChange: (next) => validValues.includes(next) && onChange(next) });
    dropdown.element.classList.add('rovalra-custom-theme-background-dropdown'); dropdown.panel.classList.add('rovalra-custom-theme-background-dropdown-panel'); return dropdown;
}
function syncBgControls() {
    if (!bgControls) return;
    const bg = getBg(); syncBgRange(bgControls.opacityRow, Math.round(bg.opacity * 100), '%'); syncBgRange(bgControls.blurRow, bg.blur, 'px'); syncBgRange(bgControls.customSizeRow, bg.customSize, '%');
    bgControls.urlInput.value = bg.source; bgControls.customSizeRow.hidden = bg.size !== 'custom'; bgControls.overlayColor.value = bg.overlayColor; syncBgRange(bgControls.overlayOpacityRow, Math.round(bg.overlayOpacity * 100), '%'); bgControls.overrideTopbarSidebar.checked = bg.overrideTopbarSidebar; bgControls.sizeDropdown.setValue(bg.size); bgControls.positionDropdown.setValue(bg.position);
}
function createBgSection() {
    const bg = getBg(); const section = document.createElement('section'); section.className = 'rovalra-custom-theme-background-section rovalra-custom-theme-background-section-compact';
    const { container, input: urlInput } = createStyledInput({ id: 'rovalra-custom-theme-background-url', label: '', placeholder: 'https://example.com/image.png', value: bg.source });
    container.classList.add('rovalra-custom-theme-background-url-wrapper'); urlInput.type = 'url'; urlInput.addEventListener('input', () => { clearTimeout(bgUrlTimeout); bgUrlTimeout = setTimeout(() => applyBgUrlInput(urlInput), 80); }); urlInput.addEventListener('change', () => applyBgUrlInput(urlInput));
    const error = document.createElement('div'); error.className = 'rovalra-custom-theme-background-error'; error.hidden = true; error.setAttribute('role', 'alert');
    const opacityRow = createBgRange({ label: text('background.opacity', 'Image Opacity'), min: 0, max: 100, value: Math.round(bg.opacity * 100), unit: '%', onInput: (value) => setBg({ opacity: value / 100 }) });
    const blurRow = createBgRange({ label: text('background.blur', 'Blur'), min: 0, max: 20, value: bg.blur, unit: 'px', onInput: (value) => setBg({ blur: value }) });
    const overlayOpacityRow = createBgRange({ label: text('background.overlay.opacity', 'Overlay Opacity'), min: 0, max: 100, value: Math.round(bg.overlayOpacity * 100), unit: '%', onInput: (value) => setBg({ overlayOpacity: value / 100 }) });
    const customSizeRow = createBgRange({ label: text('background.customSize', 'Custom Scale'), min: 25, max: 300, value: bg.customSize, unit: '%', onInput: (value) => setBg({ customSize: value }) }); customSizeRow.hidden = bg.size !== 'custom';
    const overlayColor = document.createElement('input'); overlayColor.type = 'color'; overlayColor.value = bg.overlayColor; overlayColor.setAttribute('aria-label', text('background.overlay.color', 'Overlay Color')); overlayColor.addEventListener('input', () => setBg({ overlayColor: overlayColor.value }));
    const sizeDropdown = createBgDropdown(BG_SIZE_ITEMS.map((item) => ({ ...item, label: text(`background.size.${item.value}`, item.label) })), bg.size, BACKGROUND_IMAGE_SIZE_OPTIONS, (size) => setBg({ size }, true));
    const positionDropdown = createBgDropdown(BG_POSITION_ITEMS.map((item) => ({ ...item, label: text(`background.position.${item.value.replaceAll(' ', '')}`, item.label) })), bg.position, BACKGROUND_IMAGE_POSITION_OPTIONS, (position) => setBg({ position }, true));
    const toggle = createBgToggle({ checked: bg.overrideTopbarSidebar, ariaLabel: 'Transparent Mode', onChange: (value) => setBg({ overrideTopbarSidebar: value }, true) });
    const sourceControls = document.createElement('div'); sourceControls.className = 'rovalra-custom-theme-background-source'; sourceControls.append(container);
    const sourceRow = createBgRow(text('background.source', 'Image Source'), sourceControls); const sizeRow = createBgRow(text('background.size.label', 'Background Size'), sizeDropdown.element); const colorRow = createBgRow(text('background.overlay.color', 'Overlay Color'), overlayColor); const toggleRow = createBgRow(text('background.overrideTopbarSidebar', 'Transparent Mode'), toggle.element); toggleRow.classList.add('rovalra-custom-theme-background-toggle-row'); const positionRow = createBgRow(text('background.position.label', 'Background Position'), positionDropdown.element);
    section.append(sourceRow, error, opacityRow, blurRow, overlayOpacityRow, colorRow, toggleRow, sizeRow, customSizeRow, positionRow);
    bgControls = { urlInput, error, opacityRow, blurRow, overlayOpacityRow, customSizeRow, overlayColor, overrideTopbarSidebar: toggle.input, sizeDropdown, positionDropdown }; syncBgControls(); return section;
}

async function openBackgroundEditor() {
    if (!SUPPORTED_HOSTS.has(window.location.hostname)) return;
    if (editorHandle && !document.body.contains(editorHandle.overlay)) {
        editorHandle = null;
        bgControls = null;
    }
    if (editorHandle) return;

    const settings = await loadSettings();
    backgroundImageConfig = sanitizeBackgroundImage(settings[BACKGROUND_IMAGE_SETTING] || DEFAULT_BACKGROUND_IMAGE);
    backgroundEnabled = settings[BACKGROUND_IMAGE_ENABLED_SETTING] === true;
    applyBgPreview();
    const body = document.createElement('div');
    body.className = 'rovalra-custom-theme-selector-body rovalra-custom-theme-background-body'; body.append(createBgSection());
    const close = createButton('Close', 'primary', { onClick: () => { if (bgUrlTimeout) clearTimeout(bgUrlTimeout); if (bgSaveTimeout) clearTimeout(bgSaveTimeout); persistBg().finally(() => editorHandle?.close()); } });
    const reset = createButton('Reset', 'secondary', { onClick: () => { setBgError(''); backgroundImageConfig = { ...DEFAULT_BACKGROUND_IMAGE }; backgroundEnabled = false; syncBgControls(); applyBgPreview(); persistBg().catch(console.error); } });

    editorHandle = createOverlay({
        title: text('background.title', 'Customize Image Settings'),
        bodyContent: body,
        actions: [
            reset,
            close,
        ],
        maxWidth: '420px',
        maxHeight: 'calc(100vh - 96px)',
        preventBackdropClose: true,
        onClose: () => {
            sessionStorage.removeItem(EDITOR_SESSION_KEY);
            bgControls?.sizeDropdown.destroy(); bgControls?.positionDropdown.destroy(); bgControls = null; editorHandle = null;
        },
    });
    editorHandle.overlay.classList.add(
        'rovalra-custom-theme-selector-overlay',
        'rovalra-custom-theme-background-overlay',
    );
    document.body.style.overflow = '';
    syncBgControls();
}

function restoreBackgroundEditor() {
    if (sessionStorage.getItem(EDITOR_SESSION_KEY) !== 'true') return;
    openBackgroundEditor().catch((error) =>
        console.error('RoValra: Failed to restore custom background settings.', error),
    );
}

export function init() {
    if (initialized) return;
    initialized = true;
    document.addEventListener('rovalra:openCustomThemeBackground', () => {
        sessionStorage.setItem(EDITOR_SESSION_KEY, 'true');
        openBackgroundEditor().catch((error) =>
            console.error('RoValra: Failed to open custom background settings.', error),
        );
    });
    document.addEventListener('rovalra:settingSaved', (event) => {
        if (event.detail?.name !== BACKGROUND_IMAGE_ENABLED_SETTING) return;
        backgroundEnabled = event.detail.value === true; applyBgPreview();
    });
    window.addEventListener('popstate', restoreBackgroundEditor);
    window.addEventListener('hashchange', restoreBackgroundEditor);
}
