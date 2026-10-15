export const THEME_VARIABLES_SETTING = 'customThemeVariables';
export const THEME_VARIABLES_ENABLED_SETTING = 'CustomThemeVariablesEnabled';
export const THEME_VARIABLES_MODES = ['dark', 'light'];

export const THEME_VARIABLE_GROUPS = [
    {
        key: 'surfaces',
        label: 'Surfaces',
        tokens: [
            { key: 'surface-0', label: 'Page Background' },
            { key: 'surface-100', label: 'Surface 100' },
            { key: 'surface-200', label: 'Surface 200' },
            { key: 'surface-300', label: 'Surface 300' },
            { key: 'common-navigation-bar', label: 'Navigation Bar' },
            { key: 'over-media-0', label: 'Over Media 0' },
            { key: 'over-media-100', label: 'Over Media 100' },
            { key: 'over-media-200', label: 'Over Media 200' },
            { key: 'over-media-300', label: 'Over Media 300' },
            { key: 'common-backdrop', label: 'Backdrop' },
        ],
    },
    {
        key: 'content',
        label: 'Text',
        tokens: [
            { key: 'content-emphasis', label: 'Emphasis Text' },
            { key: 'content-default', label: 'Default Text' },
            { key: 'content-muted', label: 'Muted Text' },
            { key: 'content-link', label: 'Link Text' },
        ],
    },
    {
        key: 'strokes',
        label: 'Strokes & Shifts',
        tokens: [
            { key: 'stroke-default', label: 'Stroke Default' },
            { key: 'stroke-emphasis', label: 'Stroke Emphasis' },
            { key: 'stroke-muted', label: 'Stroke Muted' },
            { key: 'common-heavy-divider', label: 'Heavy Divider' },
            { key: 'shift-100', label: 'Shift 100' },
            { key: 'shift-200', label: 'Shift 200' },
            { key: 'shift-300', label: 'Shift 300' },
            { key: 'shift-400', label: 'Shift 400' },
        ],
    },
    {
        key: 'system',
        label: 'System',
        tokens: [
            { key: 'system-emphasis', label: 'Emphasis' },
            { key: 'system-contrast', label: 'Contrast' },
            { key: 'system-alert', label: 'Alert' },
            { key: 'system-success', label: 'Success' },
            { key: 'system-warning', label: 'Warning' },
            { key: 'system-neutral', label: 'Neutral' },
        ],
    },
    {
        key: 'actions',
        label: 'Buttons',
        tokens: [
            { key: 'action-emphasis-background', label: 'Primary Background' },
            { key: 'action-emphasis-foreground', label: 'Primary Text' },
            { key: 'action-standard-background', label: 'Standard Background' },
            { key: 'action-standard-foreground', label: 'Standard Text' },
            {
                key: 'action-soft-emphasis-background',
                label: 'Soft Background',
            },
            { key: 'action-soft-emphasis-foreground', label: 'Soft Text' },
            { key: 'action-subtle-border', label: 'Subtle Border' },
            { key: 'action-alert-foreground', label: 'Alert Text' },
            {
                key: 'action-over-media-background',
                label: 'Over Media Background',
            },
            { key: 'action-over-media-foreground', label: 'Over Media Text' },
        ],
    },
];

export const THEME_VARIABLE_KEYS = THEME_VARIABLE_GROUPS.flatMap((group) =>
    group.tokens.map((token) => token.key),
);
const THEME_VARIABLE_KEY_SET = new Set(THEME_VARIABLE_KEYS);

export const ROBLOX_THEME_PRESETS = [
    { label: 'Classic', value: 'classic' },
    { label: 'Circuit Rush', value: 'circuit-rush' },
    { label: 'Cosmic Dust', value: 'cosmic-dust' },
    { label: 'Electric Lime', value: 'electric-lime' },
    { label: 'Hyper Plum', value: 'hyper-plum' },
    { label: 'Inferno Blast', value: 'inferno-blast' },
    { label: 'Kinetic Energy', value: 'kinetic-energy' },
    { label: 'Lava Glow', value: 'lava-glow' },
    { label: 'Nebula Drift', value: 'nebula-drift' },
    { label: 'Nitro Frost', value: 'nitro-frost' },
    { label: 'Pixel Pop', value: 'pixel-pop' },
    { label: 'Polar Freeze', value: 'polar-freeze' },
    { label: 'Quantum Pulse', value: 'quantum-pulse' },
    { label: 'Star Burst', value: 'star-burst' },
    { label: 'Super Charge', value: 'super-charge' },
];
const PRESET_VALUES = new Set(
    ROBLOX_THEME_PRESETS.map((preset) => preset.value),
);

export function getPresetClasses(preset) {
    return PRESET_VALUES.has(preset)
        ? [`theme-${preset}`, `${preset}-theme`]
        : [];
}

export const ALL_PRESET_CLASSES = ROBLOX_THEME_PRESETS.flatMap((preset) =>
    getPresetClasses(preset.value),
);

export const DEFAULT_THEME_VARIABLES = Object.freeze({
    preset: '',
    themeId: '',
    dark: Object.freeze({}),
    light: Object.freeze({}),
});

const HEXA_COLOR_PATTERN = /^#[0-9a-f]{8}$/i;
const THEME_ID_PATTERN = /^[a-z0-9-]{1,40}$/;

function sanitizeModeValues(values) {
    const result = {};
    if (!values || typeof values !== 'object') return result;
    for (const [key, value] of Object.entries(values)) {
        if (!THEME_VARIABLE_KEY_SET.has(key)) continue;
        if (typeof value !== 'string' || !HEXA_COLOR_PATTERN.test(value))
            continue;
        result[key] = value.toLowerCase();
    }
    return result;
}

export function sanitizeThemeVariables(value) {
    const config = value && typeof value === 'object' ? value : {};
    return {
        preset: PRESET_VALUES.has(config.preset) ? config.preset : '',
        themeId:
            typeof config.themeId === 'string' &&
            THEME_ID_PATTERN.test(config.themeId)
                ? config.themeId
                : '',
        dark: sanitizeModeValues(config.dark),
        light: sanitizeModeValues(config.light),
    };
}

export function getThemeLook(value) {
    const { preset, dark, light } = sanitizeThemeVariables(value);
    return { preset, dark, light };
}

export function isThemeEmpty(value) {
    const look = getThemeLook(value);
    return (
        !look.preset &&
        THEME_VARIABLES_MODES.every((mode) => !Object.keys(look[mode]).length)
    );
}

export function themeLooksMatch(left, right) {
    const a = getThemeLook(left);
    const b = getThemeLook(right);
    if (a.preset !== b.preset) return false;
    return THEME_VARIABLES_MODES.every((mode) => {
        const keys = Object.keys(a[mode]);
        return (
            keys.length === Object.keys(b[mode]).length &&
            keys.every((key) => a[mode][key] === b[mode][key])
        );
    });
}

export const BUILT_IN_THEMES = [
    {
        id: 'builtin-very-dark',
        nameKey: 'veryDark',
        name: 'Very dark theme',
        theme: getThemeLook({
            dark: {
                'surface-0': '#000000ff',
                'surface-100': '#000000ff',
                'surface-200': '#000000ff',
                'surface-300': '#131316ff',
            },
        }),
    },
];

export function hexaToRgba(hexa) {
    const r = parseInt(hexa.slice(1, 3), 16);
    const g = parseInt(hexa.slice(3, 5), 16);
    const b = parseInt(hexa.slice(5, 7), 16);
    const a = Math.round((parseInt(hexa.slice(7, 9), 16) / 255) * 1000) / 1000;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function getThemeVariableEntries(config) {
    const sanitized = sanitizeThemeVariables(config);
    return THEME_VARIABLES_MODES.flatMap((mode) =>
        Object.entries(sanitized[mode]).map(([key, value]) => ({
            token: `${mode}-${key}`,
            value: hexaToRgba(value),
        })),
    );
}

export const THEME_VARIABLE_SAVED_SETTING = 'customThemeVariableSaved';
export const MAX_SAVED_THEMES = 25;
export const MAX_THEME_NAME_LENGTH = 32;
export const THEME_EXPORT_TYPE = 'rovalra-theme';
export const THEME_EXPORT_VERSION = 1;
const SAVED_THEME_ID_PATTERN = /^[a-z0-9]{1,32}$/;

export function sanitizeThemeName(name, fallback = '') {
    if (typeof name !== 'string') return fallback;
    const cleaned = [...name]
        .filter(
            (char) =>
                char >= ' ' &&
                char !== '\u007f' &&
                char !== '<' &&
                char !== '>',
        )
        .join('')
        .trim()
        .slice(0, MAX_THEME_NAME_LENGTH);
    return cleaned || fallback;
}

export function createThemeId() {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function sanitizeSavedThemes(value) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    const result = [];
    for (const entry of value) {
        if (!entry || typeof entry !== 'object') continue;
        const id =
            typeof entry.id === 'string' &&
            SAVED_THEME_ID_PATTERN.test(entry.id)
                ? entry.id
                : createThemeId();
        const name = sanitizeThemeName(entry.name);
        if (!name || seen.has(id)) continue;
        seen.add(id);
        result.push({ id, name, theme: getThemeLook(entry.theme) });
        if (result.length >= MAX_SAVED_THEMES) break;
    }
    return result;
}

export function createThemeExport(name, config) {
    return {
        type: THEME_EXPORT_TYPE,
        version: THEME_EXPORT_VERSION,
        name: sanitizeThemeName(name),
        ...getThemeLook(config),
    };
}

export function parseThemeExport(data, fallbackName = '') {
    if (!data || typeof data !== 'object' || data.type !== THEME_EXPORT_TYPE)
        return null;
    return {
        name: sanitizeThemeName(data.name, fallbackName),
        theme: getThemeLook(data),
    };
}
