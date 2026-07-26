export const BACKGROUND_IMAGE_SETTING = 'customBackgroundImage';
export const BACKGROUND_IMAGE_ENABLED_SETTING = 'CustomThemeBackgroundEnabled';

export const BACKGROUND_IMAGE_SIZE_OPTIONS = [
    'cover',
    'contain',
    'auto',
    'custom',
];
export const BACKGROUND_IMAGE_POSITION_OPTIONS = [
    'center',
    'top',
    'bottom',
    'left',
    'right',
    'top left',
    'top right',
    'bottom left',
    'bottom right',
];
export const BACKGROUND_IMAGE_REPEAT_OPTIONS = [
    'no-repeat',
    'repeat',
    'repeat-x',
    'repeat-y',
];

export const DEFAULT_BACKGROUND_IMAGE = Object.freeze({
    source: '',
    opacity: 1,
    size: 'cover',
    customSize: 100,
    position: 'center',
    repeat: 'no-repeat',
    blur: 0,
    overlayColor: '#000000',
    overlayOpacity: 0,
    overrideTopbarSidebar: false,
});

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

function clampNumber(value, fallback, min, max, round = false) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    const clamped = Math.max(min, Math.min(max, number));
    return round ? Math.round(clamped) : clamped;
}

function sanitizeEnum(value, options, fallback) {
    return options.includes(value) ? value : fallback;
}

function sanitizeBackgroundSource(source) {
    if (typeof source !== 'string') return '';

    try {
        const url = new URL(source.trim());
        return url.protocol === 'https:' ? url.href : '';
    } catch {
        return '';
    }
}

export function sanitizeBackgroundImage(value) {
    const bg = value && typeof value === 'object' ? value : {};

    return {
        source: sanitizeBackgroundSource(bg.source),
        opacity: clampNumber(
            bg.opacity,
            DEFAULT_BACKGROUND_IMAGE.opacity,
            0,
            1,
        ),
        size: sanitizeEnum(
            bg.size,
            BACKGROUND_IMAGE_SIZE_OPTIONS,
            DEFAULT_BACKGROUND_IMAGE.size,
        ),
        customSize: clampNumber(
            bg.customSize,
            DEFAULT_BACKGROUND_IMAGE.customSize,
            25,
            300,
            true,
        ),
        position: sanitizeEnum(
            bg.position,
            BACKGROUND_IMAGE_POSITION_OPTIONS,
            DEFAULT_BACKGROUND_IMAGE.position,
        ),
        repeat: sanitizeEnum(
            bg.repeat,
            BACKGROUND_IMAGE_REPEAT_OPTIONS,
            DEFAULT_BACKGROUND_IMAGE.repeat,
        ),
        blur: clampNumber(
            bg.blur,
            DEFAULT_BACKGROUND_IMAGE.blur,
            0,
            20,
            true,
        ),
        overlayColor:
            typeof bg.overlayColor === 'string' &&
            HEX_COLOR_PATTERN.test(bg.overlayColor)
                ? bg.overlayColor.toLowerCase()
                : DEFAULT_BACKGROUND_IMAGE.overlayColor,
        overlayOpacity: clampNumber(
            bg.overlayOpacity,
            DEFAULT_BACKGROUND_IMAGE.overlayOpacity,
            0,
            1,
        ),
        overrideTopbarSidebar: bg.overrideTopbarSidebar === true,
    };
}
