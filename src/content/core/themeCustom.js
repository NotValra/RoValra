export const CUSTOM_THEME_FIELDS = [
    {
        key: 'surface0',
        label: 'Surface 0',
        default: '#121215',
    },
    {
        key: 'surface100',
        label: 'Surface 100',
        default: '#191a1f',
    },
    {
        key: 'surface200',
        label: 'Surface 200',
        default: '#272930',
    },
    {
        key: 'surface300',
        label: 'Surface 300',
        default: '#45494d',
    },
    {
        key: 'shimmer',
        label: 'Loading Shimmer',
        default: '#393c40',
    },
    {
        key: 'mainText',
        label: 'Main Text Color',
        default: '#f7f7f8',
    },
    {
        key: 'inverseContentEmphasis',
        label: 'Inverse Content Emphasis',
        default: '#f7f7f8',
    },
    {
        key: 'secondaryText',
        label: 'Secondary Text Color',
        default: '#d5d7dd',
    },
    {
        key: 'tertiaryText',
        label: 'Tertiary Text',
        rovalra: true,
        default: '#bcbec8',
    },
    {
        key: 'playButton',
        label: 'Playbutton Color',
        default: '#335fff',
    },
    {
        key: 'mainBackground',
        label: 'Main Background',
        rovalra: true,
        default: '#121215',
    },
    {
        key: 'buttonBackground',
        label: 'Button Background',
        rovalra: true,
        default: '#d0d9fb',
        alphaDefault: 12,
    },
    {
        key: 'borderColor',
        label: 'Border Color',
        rovalra: true,
        default: '#ffffff',
        alphaDefault: 20,
    },
    {
        key: 'grayText',
        label: 'Gray Text',
        rovalra: true,
        default: '#bcbec8',
    },
    {
        key: 'profileHeaderBackground',
        label: 'Profile Header',
        rovalra: true,
        default: '#191a1f',
    },
    {
        key: 'iconBlocked',
        label: 'Blocked Icon',
        rovalra: true,
        default: '#646668',
    },
    {
        key: 'themeContent',
        label: 'Settings Content',
        rovalra: true,
        default: '#272930',
    },
    {
        key: 'themeText',
        label: 'Settings Text',
        rovalra: true,
        default: '#d5d7dd',
    },
    {
        key: 'themeHeader',
        label: 'Settings Header',
        rovalra: true,
        default: '#ffffff',
    },
    {
        key: 'themeSliderOn',
        label: 'Slider On',
        rovalra: true,
        default: '#444444',
    },
    {
        key: 'themeSliderOff',
        label: 'Slider Off',
        rovalra: true,
        default: '#000000',
        alphaDefault: 10,
    },
    {
        key: 'themeSliderButton',
        label: 'Slider Button',
        rovalra: true,
        default: '#ffffff',
    },
    {
        key: 'themeButtonText',
        label: 'Settings Button Text',
        rovalra: true,
        default: '#ffffff',
        alphaDefault: 90,
    },
    {
        key: 'themeButtonBackground',
        label: 'Settings Button',
        rovalra: true,
        default: '#2d3033',
    },
    {
        key: 'themeButtonHover',
        label: 'Settings Button Hover',
        rovalra: true,
        default: '#393c40',
    },
    {
        key: 'themeButtonActive',
        label: 'Settings Button Active',
        rovalra: true,
        default: '#45494d',
    },
    {
        key: 'themeButtonBorder',
        label: 'Settings Button Border',
        rovalra: true,
        default: '#ffffff',
        alphaDefault: 10,
    },
    {
        key: 'discordLink',
        label: 'Discord Link',
        rovalra: true,
        default: '#7289da',
    },
    {
        key: 'githubLink',
        label: 'GitHub Link',
        rovalra: true,
        default: '#2dba4e',
    },
    {
        key: 'robloxLink',
        label: 'Roblox Link',
        rovalra: true,
        default: '#c13ad9',
    },
];

export const DEFAULT_CUSTOM_THEME = CUSTOM_THEME_FIELDS.reduce(
    (theme, field) => {
        theme[field.key] = field.default;
        return theme;
    },
    {},
);
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const ALPHA_SUFFIX = 'Alpha';

export function getCustomThemeAlphaKey(key) {
    return `${key}${ALPHA_SUFFIX}`;
}

function sanitizeAlpha(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 100;
    return Math.max(0, Math.min(100, Math.round(number)));
}

export function sanitizeCustomTheme(value) {
    const source = value && typeof value === 'object' ? value : {};
    const sanitized = {};

    for (const field of CUSTOM_THEME_FIELDS) {
        const color = source[field.key];
        const alphaKey = getCustomThemeAlphaKey(field.key);
        sanitized[field.key] =
            typeof color === 'string' && HEX_COLOR_PATTERN.test(color)
                ? color
                : field.default;
        sanitized[alphaKey] = sanitizeAlpha(
            source[alphaKey] ?? field.alphaDefault ?? 100,
        );
    }

    return sanitized;
}
