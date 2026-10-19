import { createButton } from '../../core/ui/buttons.js';
import { createDropdown } from '../../core/ui/dropdown.js';
import { createStyledInput } from '../../core/ui/catalog/input.js';
import { showConfirmationPrompt } from '../../core/ui/confirmationPrompt.js';
import { showSystemAlert } from '../../core/ui/roblox/alert.js';
import { downloadJsonFile } from '../../core/settings/portSettings.js';
import { ts } from '../../core/locale/i18n.js';
import {
    handleSaveSettings,
    loadSettings,
} from '../../core/settings/handlesettings.js';
import {
    BUILT_IN_THEMES,
    DEFAULT_THEME_VARIABLES,
    MAX_SAVED_THEMES,
    MAX_THEME_NAME_LENGTH,
    ROBLOX_THEME_PRESETS,
    THEME_VARIABLE_SAVED_SETTING,
    THEME_VARIABLES_ENABLED_SETTING,
    THEME_VARIABLES_MODES,
    THEME_VARIABLES_SETTING,
    THEME_VARIABLE_GROUPS,
    THEME_VARIABLE_KEYS,
    createThemeExport,
    createThemeId,
    getPresetClasses,
    getThemeLook,
    isThemeEmpty,
    parseThemeExport,
    sanitizeSavedThemes,
    sanitizeThemeName,
    sanitizeThemeVariables,
    themeLooksMatch,
} from '../../core/themeVariables.js';
import {
    applyThemeVariables,
    previewThemeVariable,
    withoutThemeVariables,
} from './themeVariables.js';

const SAVE_DELAY_MS = 400;
const NO_PRESET = 'none';
const NO_THEME = 'none';
const UNSAVED_THEME = 'unsaved';
const MAX_IMPORT_FILE_SIZE = 64 * 1024;

function text(key, defaultValue, options = {}) {
    return ts(`customThemeEditor.variables.${key}`, {
        defaultValue,
        ...options,
    });
}

function getThemeFileName(name) {
    const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    return `RoValraTheme-${slug || 'theme'}.json`;
}

function toHex(number) {
    return Math.round(Math.max(0, Math.min(255, number)))
        .toString(16)
        .padStart(2, '0');
}

let colorCanvasContext = null;
function parseCssColor(value) {
    const rgb = value.match(
        /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/i,
    );
    if (rgb) {
        const alpha = rgb[4] === undefined ? 1 : Number(rgb[4]);
        return `#${toHex(rgb[1])}${toHex(rgb[2])}${toHex(rgb[3])}${toHex(alpha * 255)}`;
    }
    const srgb = value.match(
        /^color\(srgb\s+([\d.e-]+)\s+([\d.e-]+)\s+([\d.e-]+)(?:\s*\/\s*([\d.e-]+))?\s*\)$/i,
    );
    if (srgb) {
        const alpha = srgb[4] === undefined ? 1 : Number(srgb[4]);
        return `#${toHex(srgb[1] * 255)}${toHex(srgb[2] * 255)}${toHex(srgb[3] * 255)}${toHex(alpha * 255)}`;
    }
    colorCanvasContext ??= document
        .createElement('canvas')
        .getContext('2d', { willReadFrequently: true });
    colorCanvasContext.clearRect(0, 0, 1, 1);
    colorCanvasContext.fillStyle = '#00000000';
    colorCanvasContext.fillStyle = value;
    colorCanvasContext.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = colorCanvasContext.getImageData(0, 0, 1, 1).data;
    return `#${toHex(r)}${toHex(g)}${toHex(b)}${toHex(a)}`;
}

function readRobloxThemeValues(preset = '') {
    return withoutThemeVariables(() => {
        const probe = document.createElement('div');
        probe.className = [
            'rovalra-theme-vars-probe',
            ...getPresetClasses(preset),
        ].join(' ');
        probe.setAttribute('aria-hidden', 'true');
        (document.body || document.documentElement).appendChild(probe);
        const values = { dark: {}, light: {} };
        try {
            for (const mode of THEME_VARIABLES_MODES) {
                for (const key of THEME_VARIABLE_KEYS) {
                    probe.style.color = 'rgba(0, 0, 0, 0)';
                    probe.style.color = `var(--${mode}-mode-${key})`;
                    values[mode][key] = parseCssColor(
                        getComputedStyle(probe).color,
                    );
                }
            }
        } finally {
            probe.remove();
        }
        return values;
    });
}

function getCurrentPageMode() {
    return document.body?.classList.contains('light-theme') ? 'light' : 'dark';
}

export function createThemeVariablesEditor() {
    let config = sanitizeThemeVariables(DEFAULT_THEME_VARIABLES);
    let enabled = false;
    let baseline = { dark: {}, light: {} };
    let editorMode = getCurrentPageMode();
    let rows = new Map();
    let saveTimeout = null;
    let pendingPreview = new Map();
    let previewFrame = null;

    const persist = () =>
        handleSaveSettings(
            THEME_VARIABLES_SETTING,
            sanitizeThemeVariables(config),
        );

    const scheduleSave = () => {
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            saveTimeout = null;
            persist().catch(console.error);
        }, SAVE_DELAY_MS);
    };

    const flushSave = () => {
        if (!saveTimeout) return;
        clearTimeout(saveTimeout);
        saveTimeout = null;
        persist().catch(console.error);
    };

    const applyAll = () => applyThemeVariables(config, enabled);

    const queuePreview = (mode, key) => {
        pendingPreview.set(`${mode}|${key}`, [mode, key]);
        if (previewFrame) return;
        previewFrame = requestAnimationFrame(() => {
            previewFrame = null;
            const pending = pendingPreview;
            pendingPreview = new Map();
            if (!enabled) return;
            for (const [mode, key] of pending.values()) {
                previewThemeVariable(mode, key, config[mode][key] || null);
            }
        });
    };

    const getValue = (mode, key) =>
        config[mode][key] || baseline[mode][key] || '#000000ff';

    const syncRow = (key, { skipColor = false } = {}) => {
        const row = rows.get(key);
        if (!row) return;
        const value = getValue(editorMode, key);
        const alpha = Math.round((parseInt(value.slice(7, 9), 16) / 255) * 100);
        if (!skipColor) row.color.value = value.slice(0, 7);
        row.alpha.value = String(alpha);
        row.alphaValue.textContent = `${alpha}%`;
        row.element.classList.toggle(
            'rovalra-theme-vars-row-edited',
            Boolean(config[editorMode][key]),
        );
    };

    const syncAllRows = () => {
        for (const key of rows.keys()) syncRow(key);
    };

    const setToken = (key, { hex, alpha }) => {
        const current = getValue(editorMode, key);
        const nextHex = hex ?? current.slice(0, 7);
        const nextAlpha =
            alpha === undefined
                ? current.slice(7, 9)
                : toHex((alpha / 100) * 255);
        config[editorMode][key] = `${nextHex}${nextAlpha}`.toLowerCase();
        syncRow(key, { skipColor: hex !== undefined });
        queuePreview(editorMode, key);
        scheduleSave();
        savedSection.refresh();
    };

    const resetToken = (key) => {
        delete config[editorMode][key];
        syncRow(key);
        queuePreview(editorMode, key);
        scheduleSave();
        savedSection.refresh();
    };

    const createTokenRow = (token) => {
        const element = document.createElement('div');
        element.className = 'rovalra-theme-vars-row';
        element.title = `--${editorMode}-mode-${token.key}`;

        const label = document.createElement('span');
        label.className = 'rovalra-theme-vars-row-label';
        label.textContent = text(`tokens.${token.key}`, token.label);

        const color = document.createElement('input');
        color.type = 'color';
        color.setAttribute('aria-label', label.textContent);
        color.addEventListener('input', () =>
            setToken(token.key, { hex: color.value }),
        );
        color.addEventListener('change', flushSave);

        const alpha = document.createElement('input');
        alpha.type = 'range';
        alpha.min = '0';
        alpha.max = '100';
        alpha.step = '1';
        alpha.setAttribute(
            'aria-label',
            `${label.textContent} ${text('opacity', 'Opacity')}`,
        );
        alpha.addEventListener('input', () =>
            setToken(token.key, { alpha: Number(alpha.value) }),
        );
        alpha.addEventListener('change', flushSave);

        const alphaValue = document.createElement('span');
        alphaValue.className = 'rovalra-theme-vars-row-alpha';

        const reset = createButton(text('reset', 'Reset'), 'secondary', {
            onClick: () => resetToken(token.key),
        });
        reset.type = 'button';
        reset.classList.add('rovalra-theme-vars-row-reset');
        reset.setAttribute(
            'aria-label',
            `${text('reset', 'Reset')} ${label.textContent}`,
        );

        element.append(label, color, alpha, alphaValue, reset);
        rows.set(token.key, { element, color, alpha, alphaValue });
        return element;
    };

    const list = document.createElement('div');
    list.className = 'rovalra-custom-theme-selector-list';

    const renderRows = () => {
        rows = new Map();
        list.replaceChildren();
        for (const group of THEME_VARIABLE_GROUPS) {
            const title = document.createElement('div');
            title.className = 'rovalra-custom-theme-selector-group-title';
            title.textContent = text(`groups.${group.key}`, group.label);
            list.appendChild(title);
            for (const token of group.tokens)
                list.appendChild(createTokenRow(token));
        }
        syncAllRows();
    };

    const presetDropdown = createDropdown({
        items: [
            { label: text('presetNone', 'None'), value: NO_PRESET },
            ...ROBLOX_THEME_PRESETS.map((preset) => ({
                label: text(`presets.${preset.value}`, preset.label),
                value: preset.value,
            })),
        ],
        initialValue: NO_PRESET,
        onValueChange: (value) => {
            loadConfig({ ...config, preset: value === NO_PRESET ? '' : value });
        },
    });

    function loadConfig(next) {
        config = sanitizeThemeVariables(next);
        presetDropdown.setValue(config.preset || NO_PRESET);
        baseline = readRobloxThemeValues(config.preset);
        syncAllRows();
        applyAll();
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = null;
        persist().catch(console.error);
        savedSection.refresh();
    }
    presetDropdown.element.classList.add('rovalra-theme-vars-preset-dropdown');

    const modeLabel = document.createElement('span');
    modeLabel.className = 'rovalra-custom-theme-selector-copy';
    const syncModeLabel = () => {
        modeLabel.textContent =
            editorMode === 'light'
                ? text('modes.editingLight', 'Editing light mode colors')
                : text('modes.editingDark', 'Editing dark mode colors');
    };
    syncModeLabel();

    const syncPageMode = () => {
        const mode = getCurrentPageMode();
        if (mode === editorMode) return;
        editorMode = mode;
        syncModeLabel();
        renderRows();
    };

    const resetAll = createButton(
        text('resetAll', 'Reset Colors'),
        'secondary',
        {
            onClick: () => {
                config = sanitizeThemeVariables({
                    ...config,
                    [editorMode]: {},
                });
                syncAllRows();
                applyAll();
                if (saveTimeout) clearTimeout(saveTimeout);
                saveTimeout = null;
                persist().catch(console.error);
                savedSection.refresh();
            },
        },
    );
    resetAll.type = 'button';

    const toolbar = document.createElement('div');
    toolbar.className = 'rovalra-theme-vars-toolbar';
    toolbar.append(modeLabel, resetAll);

    const intro = document.createElement('p');
    intro.className = 'rovalra-custom-theme-selector-copy';
    intro.textContent = text(
        'intro',
        'Pick a Roblox theme above to use it as-is, or change any color below to customize it. Changes apply live.',
    );

    const savedSection = createSavedThemesSection();

    const panel = document.createElement('div');
    panel.className = 'rovalra-theme-vars-panel';
    panel.append(intro, savedSection.element, toolbar, list);
    panel.addEventListener('pointerenter', syncPageMode);
    panel.addEventListener('focusin', syncPageMode);

    function createSavedThemesSection() {
        let savedThemes = [];
        let savedDropdown = null;
        let renderedKey = null;

        const element = document.createElement('div');
        element.className = 'rovalra-theme-vars-saved';

        const title = document.createElement('div');
        title.className = 'rovalra-custom-theme-selector-group-title';
        title.textContent = text('saved.title', 'My Themes');

        const status = document.createElement('p');
        status.className =
            'rovalra-custom-theme-selector-copy rovalra-theme-vars-saved-status';

        const pickerRow = document.createElement('div');
        pickerRow.className = 'rovalra-theme-vars-saved-row';
        const nameRow = document.createElement('div');
        nameRow.className = 'rovalra-theme-vars-saved-row';
        const portRow = document.createElement('div');
        portRow.className = 'rovalra-theme-vars-saved-row';

        const { container: nameContainer, input: nameInput } =
            createStyledInput({
                id: 'rovalra-theme-vars-saved-name',
                label: '',
                placeholder: text('saved.namePlaceholder', 'Theme name'),
                value: '',
            });
        nameContainer.classList.add('rovalra-theme-vars-saved-name');
        nameInput.maxLength = MAX_THEME_NAME_LENGTH;

        const persistSaved = () =>
            handleSaveSettings(
                THEME_VARIABLE_SAVED_SETTING,
                sanitizeSavedThemes(savedThemes),
            );

        const getThemeName = (theme) =>
            theme.nameKey
                ? text(`builtIn.${theme.nameKey}`, theme.name)
                : theme.name;

        const findTheme = (id) =>
            BUILT_IN_THEMES.find((entry) => entry.id === id) ||
            savedThemes.find((entry) => entry.id === id) ||
            null;

        const getEquipped = () => {
            const theme = config.themeId ? findTheme(config.themeId) : null;
            if (theme)
                return {
                    value: theme.id,
                    theme,
                    edited: !themeLooksMatch(config, theme.theme),
                };
            if (isThemeEmpty(config))
                return { value: NO_THEME, theme: null, edited: false };
            return { value: UNSAVED_THEME, theme: null, edited: true };
        };

        const deleteButton = createButton(
            text('saved.delete', 'Delete'),
            'secondary',
            {
                onClick: () => {
                    const theme = savedThemes.find(
                        (entry) => entry.id === config.themeId,
                    );
                    if (!theme) return;
                    showConfirmationPrompt({
                        title: text('saved.deleteTitle', 'Delete theme'),
                        message: text(
                            'saved.deleteMessage',
                            'Are you sure you want to delete this saved theme?',
                        ),
                        confirmText: text('saved.delete', 'Delete'),
                        onConfirm: () => {
                            savedThemes = savedThemes.filter(
                                (entry) => entry.id !== theme.id,
                            );
                            config.themeId = '';
                            nameInput.value = '';
                            persist().catch(console.error);
                            refresh();
                            persistSaved()
                                .then(() =>
                                    showSystemAlert(
                                        text('saved.deleted', 'Theme deleted.'),
                                        'success',
                                    ),
                                )
                                .catch(console.error);
                        },
                    });
                },
            },
        );
        deleteButton.type = 'button';

        function selectTheme(id) {
            if (id === NO_THEME) {
                nameInput.value = '';
                loadConfig(DEFAULT_THEME_VARIABLES);
                return;
            }
            const theme = findTheme(id);
            if (!theme) return;
            const isBuiltIn = BUILT_IN_THEMES.includes(theme);
            nameInput.value = isBuiltIn ? '' : theme.name;
            loadConfig({ ...theme.theme, themeId: theme.id });
        }

        function refresh() {
            const equipped = getEquipped();
            const editingLabel = (name) =>
                text('saved.editingLabel', '{{name}} (editing)', { name });
            const toItem = (entry) => ({
                label:
                    equipped.value === entry.id && equipped.edited
                        ? editingLabel(getThemeName(entry))
                        : getThemeName(entry),
                value: entry.id,
            });
            const items = [
                { label: text('saved.noTheme', 'No theme'), value: NO_THEME },
                ...(equipped.value === UNSAVED_THEME
                    ? [
                          {
                              label: text('saved.unsaved', 'Unsaved theme'),
                              value: UNSAVED_THEME,
                          },
                      ]
                    : []),
                ...BUILT_IN_THEMES.map(toItem),
                ...savedThemes.map(toItem),
            ];

            const key = JSON.stringify([items, equipped.value]);
            if (key === renderedKey) return;
            renderedKey = key;

            if (equipped.value === NO_THEME) {
                status.textContent = text(
                    'saved.statusNone',
                    'No theme equipped, Roblox looks the way it normally does.',
                );
            } else if (equipped.value === UNSAVED_THEME) {
                status.textContent = text(
                    'saved.statusUnsaved',
                    "You're using colors that aren't saved as a theme yet.",
                );
            } else if (equipped.edited) {
                status.textContent = text(
                    'saved.statusEditing',
                    'Editing {{name}}. Save to keep your changes.',
                    { name: getThemeName(equipped.theme) },
                );
            } else {
                status.textContent = text(
                    'saved.statusEquipped',
                    '{{name}} is equipped.',
                    { name: getThemeName(equipped.theme) },
                );
            }

            savedDropdown?.destroy();
            savedDropdown = createDropdown({
                items,
                initialValue: equipped.value,
                onValueChange: (id) => {
                    if (id !== UNSAVED_THEME) selectTheme(id);
                },
            });
            savedDropdown.element.classList.add(
                'rovalra-theme-vars-saved-dropdown',
            );
            deleteButton.disabled = !savedThemes.some(
                (entry) => entry.id === equipped.value,
            );
            pickerRow.replaceChildren(savedDropdown.element, deleteButton);
        }

        const saveButton = createButton(text('saved.save', 'Save'), 'primary', {
            onClick: () => {
                const name = sanitizeThemeName(nameInput.value);
                if (!name) {
                    showSystemAlert(
                        text(
                            'saved.nameRequired',
                            'Enter a name for your theme first.',
                        ),
                        'warning',
                    );
                    return;
                }
                const theme = getThemeLook(config);
                const existing = savedThemes.find(
                    (entry) => entry.name.toLowerCase() === name.toLowerCase(),
                );
                if (existing) {
                    existing.name = name;
                    existing.theme = theme;
                    config.themeId = existing.id;
                } else {
                    if (savedThemes.length >= MAX_SAVED_THEMES) {
                        showSystemAlert(
                            text(
                                'saved.limitReached',
                                'You can only save up to {{count}} themes.',
                                { count: MAX_SAVED_THEMES },
                            ),
                            'warning',
                        );
                        return;
                    }
                    config.themeId = createThemeId();
                    savedThemes.push({ id: config.themeId, name, theme });
                }
                nameInput.value = name;
                if (saveTimeout) clearTimeout(saveTimeout);
                saveTimeout = null;
                persist().catch(console.error);
                refresh();
                persistSaved()
                    .then(() =>
                        showSystemAlert(
                            existing
                                ? text('saved.updated', 'Theme updated!')
                                : text('saved.saved', 'Theme saved!'),
                            'success',
                        ),
                    )
                    .catch(console.error);
            },
        });
        saveButton.type = 'button';

        const exportButton = createButton(
            text('saved.export', 'Export'),
            'secondary',
            {
                onClick: () => {
                    const name = sanitizeThemeName(
                        nameInput.value ||
                            (getEquipped().theme &&
                                getThemeName(getEquipped().theme)),
                        text('saved.defaultName', 'My Theme'),
                    );
                    downloadJsonFile(
                        getThemeFileName(name),
                        createThemeExport(name, config),
                    );
                },
            },
        );
        exportButton.type = 'button';

        const importButton = createButton(
            text('saved.import', 'Import'),
            'secondary',
            {
                onClick: () => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = '.json,application/json';
                    input.addEventListener(
                        'change',
                        async () => {
                            const file = input.files?.[0];
                            if (!file) return;
                            if (file.size > MAX_IMPORT_FILE_SIZE) {
                                showSystemAlert(
                                    text(
                                        'saved.fileTooLarge',
                                        'That file is too large to be a theme.',
                                    ),
                                    'warning',
                                );
                                return;
                            }
                            let imported = null;
                            try {
                                imported = parseThemeExport(
                                    JSON.parse(await file.text()),
                                    text(
                                        'saved.importedName',
                                        'Imported Theme',
                                    ),
                                );
                            } catch {
                                imported = null;
                            }
                            if (!imported) {
                                showSystemAlert(
                                    text(
                                        'saved.invalidFile',
                                        "That file isn't a RoValra theme.",
                                    ),
                                    'warning',
                                );
                                return;
                            }
                            nameInput.value = imported.name;
                            loadConfig(imported.theme);
                            showSystemAlert(
                                text('saved.imported', 'Theme imported!'),
                                'success',
                            );
                        },
                        { once: true },
                    );
                    input.click();
                },
            },
        );
        importButton.type = 'button';

        nameRow.append(nameContainer, saveButton);
        portRow.append(exportButton, importButton);
        element.append(title, status, pickerRow, nameRow, portRow);
        refresh();

        return {
            element,
            refresh,
            setSavedThemes(value) {
                savedThemes = sanitizeSavedThemes(value);
                const equipped = savedThemes.find(
                    (entry) => entry.id === config.themeId,
                );
                if (equipped) nameInput.value = equipped.name;
                refresh();
            },
        };
    }

    const control = presetDropdown.element;
    control.dataset.settingName = THEME_VARIABLES_SETTING;
    control.rovalraVisualizer = panel;

    loadSettings()
        .then((settings) => {
            config = sanitizeThemeVariables(
                settings[THEME_VARIABLES_SETTING] || DEFAULT_THEME_VARIABLES,
            );
            enabled = settings[THEME_VARIABLES_ENABLED_SETTING] === true;
            editorMode = getCurrentPageMode();
            syncModeLabel();
            savedSection.setSavedThemes(settings[THEME_VARIABLE_SAVED_SETTING]);
            presetDropdown.setValue(config.preset || NO_PRESET);
            baseline = readRobloxThemeValues(config.preset);
            renderRows();
        })
        .catch((error) =>
            console.error('RoValra: Failed to load the theme colors.', error),
        );

    document.addEventListener('rovalra:settingSaved', (event) => {
        if (event.detail?.name !== THEME_VARIABLES_ENABLED_SETTING) return;
        enabled = event.detail.value === true;
        applyAll();
    });

    return control;
}
