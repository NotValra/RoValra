import { createButton } from '../../core/ui/buttons.js';
import { createOverlay } from '../../core/ui/overlay.js';
import { handleSaveSettings, loadSettings } from '../../core/settings/handlesettings.js';
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
let initialized = false;
let editorHandle = null;

function inputRow(labelText, input) {
    const row = document.createElement('label');
    row.className = 'rovalra-custom-theme-background-row';
    const label = document.createElement('span');
    label.className = 'rovalra-custom-theme-selector-label';
    label.textContent = labelText;
    row.append(label, input);
    return row;
}

function selectInput(options, value) {
    const select = document.createElement('select');
    select.className = 'input-field';
    options.forEach((option) => {
        const optionValue = typeof option === 'string' ? option : option.value;
        const item = document.createElement('option');
        item.value = optionValue;
        item.textContent = typeof option === 'string' ? option : option.label;
        item.selected = optionValue === value;
        select.appendChild(item);
    });
    return select;
}

function rangeInput(value, min, max, step) {
    const input = document.createElement('input');
    input.type = 'range';
    input.min = min;
    input.max = max;
    input.step = step;
    input.value = value;
    return input;
}

async function openBackgroundEditor() {
    if (!SUPPORTED_HOSTS.has(window.location.hostname)) return;
    if (editorHandle) return;

    const settings = await loadSettings();
    let config = sanitizeBackgroundImage(
        settings[BACKGROUND_IMAGE_SETTING] || DEFAULT_BACKGROUND_IMAGE,
    );
    let enabled = settings[BACKGROUND_IMAGE_ENABLED_SETTING] === true;
    const body = document.createElement('div');
    body.className = 'rovalra-custom-theme-selector-body rovalra-custom-theme-background-body';

    const enabledInput = document.createElement('input');
    enabledInput.type = 'checkbox';
    enabledInput.checked = enabled;
    body.appendChild(inputRow('Enabled', enabledInput));

    const urlInput = document.createElement('input');
    urlInput.type = 'url';
    urlInput.className = 'input-field';
    urlInput.value = config.source;
    body.appendChild(inputRow('Image URL', urlInput));

    const sizeInput = selectInput(BACKGROUND_IMAGE_SIZE_OPTIONS, config.size);
    body.appendChild(inputRow('Size', sizeInput));
    const positionInput = selectInput(BACKGROUND_IMAGE_POSITION_OPTIONS, config.position);
    body.appendChild(inputRow('Position', positionInput));

    const opacityInput = rangeInput(config.opacity, 0, 1, 0.05);
    body.appendChild(inputRow('Opacity', opacityInput));
    const blurInput = rangeInput(config.blur, 0, 20, 1);
    body.appendChild(inputRow('Blur', blurInput));

    const updatePreview = () => {
        config = sanitizeBackgroundImage({
            ...config,
            source: urlInput.value.trim(),
            size: sizeInput.value,
            position: positionInput.value,
            opacity: Number(opacityInput.value),
            blur: Number(blurInput.value),
        });
        enabled = enabledInput.checked;
        applyBackgroundImage(config, enabled);
    };
    body.addEventListener('input', updatePreview);
    body.addEventListener('change', updatePreview);

    const save = async () => {
        updatePreview();
        await Promise.all([
            handleSaveSettings(BACKGROUND_IMAGE_SETTING, config),
            handleSaveSettings(BACKGROUND_IMAGE_ENABLED_SETTING, enabled),
        ]);
        sessionStorage.removeItem(EDITOR_SESSION_KEY);
        editorHandle?.close();
    };
    const reset = () => {
        config = { ...DEFAULT_BACKGROUND_IMAGE };
        enabledInput.checked = false;
        urlInput.value = config.source;
        sizeInput.value = config.size;
        positionInput.value = config.position;
        opacityInput.value = config.opacity;
        blurInput.value = config.blur;
        updatePreview();
    };

    editorHandle = createOverlay({
        title: 'Customize Background Image',
        bodyContent: body,
        actions: [
            createButton('Reset', 'secondary', { onClick: reset }),
            createButton('Save', 'primary', { onClick: () => save().catch(console.error) }),
        ],
        maxWidth: '420px',
        maxHeight: 'calc(100vh - 96px)',
        preventBackdropClose: true,
        onClose: () => {
            sessionStorage.removeItem(EDITOR_SESSION_KEY);
            editorHandle = null;
        },
    });
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
}
