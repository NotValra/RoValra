import {
    CUSTOM_THEME_FIELDS,
    DEFAULT_CUSTOM_THEME,
    getCustomThemeAlphaKey,
    sanitizeCustomTheme,
} from './themeCustom.js';

export const CUSTOM_THEME_SLOT_COUNT = 5;

export const THEME_CATALOG_THEMES = [
    {
        version: 1,
        name: 'Nighty',
        storageKey: 'custom-nighty',
        colors: {
            surface0: ['#121223', 100],
            surface100: ['#191a2d', 100],
            surface200: ['#20223c', 100],
            surface300: ['#272958', 100],
            shimmer: ['#393c44', 100],
            mainText: ['#f7f7f8', 100],
            secondaryText: ['#c7ccd8', 100],
            playButton: ['#4068f8', 100],

            tertiaryText: ['#bcbedc', 100],
            mainBackground: ['#121223', 100],
            buttonBackground: ['#d0d9ff', 12],
            borderColor: ['#fdfdff', 20],
            grayText: ['#bcbed7', 100],
            profileHeaderBackground: ['#191a1f', 100],
            iconBlocked: ['#646668', 100],

            themeContent: ['#585858', 100],
            themeText: ['#d5d7e1', 100],
            themeHeader: ['#ffffff', 100],
            themeSliderOn: ['#fdfdff', 100],
            themeSliderOff: ['#000005', 10],
            themeSliderButton: ['#ffffff', 100],
            themeButtonText: ['#fdfdff', 90],
            themeButtonBackground: ['#2d3037', 100],
            themeButtonHover: ['#393c44', 100],
            themeButtonActive: ['#454950', 100],
            themeButtonBorder: ['#0c0b0b', 10],

            discordLink: ['#647cd3', 100],
            githubLink: ['#33bd93', 100],
            robloxLink: ['#b14ae0', 100],
        },
    },
    {
        version: 1,
        name: 'Sunset',
        storageKey: 'custom-sunset',
        colors: {
            surface0: ['#fdffe1', 100],
            surface100: ['#fdffdc', 100],
            surface200: ['#fdffe1', 100],
            surface300: ['#fdffdc', 100],
            shimmer: ['#e3e2e0', 100],
            mainText: ['#25251f', 100],
            secondaryText: ['#575a49', 100],
            playButton: ['#3369ff', 100],

            tertiaryText: ['#817f6a', 100],
            mainBackground: ['#fffffa', 100],
            buttonBackground: ['#4a4b1b', 12],
            borderColor: ['#000000', 20],
            grayText: ['#81816a', 100],
            profileHeaderBackground: ['#f8f8f7', 100],
            iconBlocked: ['#ffffff', 100],

            themeContent: ['#f8f8f7', 100],
            themeText: ['#595a49', 100],
            themeHeader: ['#272720', 100],
            themeSliderOn: ['#444444', 100],
            themeSliderOff: ['#000000', 10],
            themeSliderButton: ['#2e2d24', 100],
            themeButtonText: ['#3d3d39', 100],
            themeButtonBackground: ['#f5f5f2', 100],
            themeButtonHover: ['#e3e2e0', 100],
            themeButtonActive: ['#d5d5d2', 100],
            themeButtonBorder: ['#000000', 0],

            discordLink: ['#5caac9', 100],
            githubLink: ['#9be272', 100],
            robloxLink: ['#ff94df', 100],
        },
    },
    {
        version: 1,
        name: 'High Contrast',
        storageKey: 'custom-highcontrast',
        colors: {
            surface0: ['#000000', 100],
            surface100: ['#050505', 100],
            surface200: ['#0a0a0a', 100],
            surface300: ['#141414', 100],
            shimmer: ['#212e3f', 100],
            mainText: ['#ffffff', 100],
            secondaryText: ['#cecece', 100],
            playButton: ['#0037ff', 100],

            tertiaryText: ['#d1d1d1', 100],
            mainBackground: ['#000000', 100],
            buttonBackground: ['#d0d9fb', 12],
            borderColor: ['#000000', 0],
            grayText: ['#a5a6af', 100],
            profileHeaderBackground: ['#14151d', 100],
            iconBlocked: ['#502e2e', 100],

            themeContent: ['#272930', 100],
            themeText: ['#ffffff', 100],
            themeHeader: ['#ffffff', 100],
            themeSliderOn: ['#ffffff', 100],
            themeSliderOff: ['#000000', 10],
            themeSliderButton: ['#ffffff', 100],
            themeButtonText: ['#ffffff', 90],
            themeButtonBackground: ['#21272e', 100],
            themeButtonHover: ['#212e3f', 100],
            themeButtonActive: ['#04294e', 100],
            themeButtonBorder: ['#ffffff', 0],

            discordLink: ['#5479ff', 100],
            githubLink: ['#0fff47', 100],
            robloxLink: ['#d900ff', 100],
        },
    },
];

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

function clampAlpha(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 100;
    return Math.max(0, Math.min(100, Math.round(number)));
}

export async function getThemeCatalogThemes() {
    return THEME_CATALOG_THEMES;
}

export function catalogThemeToCustomTheme(theme) {
    const colors = theme && typeof theme === 'object' ? theme.colors : {};
    const customTheme = {};

    for (const field of CUSTOM_THEME_FIELDS) {
        const tuple = colors && colors[field.key];
        const color = Array.isArray(tuple) ? tuple[0] : undefined;
        const alpha = Array.isArray(tuple) ? tuple[1] : undefined;

        customTheme[field.key] =
            typeof color === 'string' && HEX_COLOR_PATTERN.test(color)
                ? color
                : field.default;
        customTheme[getCustomThemeAlphaKey(field.key)] = clampAlpha(alpha);
    }
    return sanitizeCustomTheme(customTheme);
}

export function customThemeToCatalogTheme(
    customTheme,
    name = 'Custom Theme',
    extras = {},
) {
    const sanitized = sanitizeCustomTheme(customTheme || DEFAULT_CUSTOM_THEME);
    const colors = {};

    for (const field of CUSTOM_THEME_FIELDS) {
        colors[field.key] = [
            sanitized[field.key],
            sanitized[getCustomThemeAlphaKey(field.key)],
        ];
    }

    return {
        version: 1,
        name,
        colors,
        ...extras,
    };
}

export function getCustomThemeSlotThemes(settings) {
    const slots = Array.isArray(settings?.customUserThemeSlots)
        ? settings.customUserThemeSlots
        : [];
    const slotThemeMap = new Map();
    slots.slice(0, CUSTOM_THEME_SLOT_COUNT).forEach((slot, index) => {
        const slotSource = slot && typeof slot === 'object' ? slot : {};
        const themeValue = slotSource.theme || slotSource.colors || slot;
        if (!themeValue || typeof themeValue !== 'object') return;
        const rawSlotIndex = Number(slotSource.slot ?? slotSource.index);
        const slotIndex = Number.isFinite(rawSlotIndex)
            ? Math.max(0, Math.min(CUSTOM_THEME_SLOT_COUNT - 1, rawSlotIndex))
            : index;

        slotThemeMap.set(
            slotIndex,
            customThemeToCatalogTheme(
                themeValue,
                slotSource.name || `Custom Theme ${index + 1}`,
                {
                    userSlotIndex: slotIndex,
                },
            ),
        );
    });
    const slotThemes = [...slotThemeMap.values()].sort(
        (left, right) => left.userSlotIndex - right.userSlotIndex,
    );

    if (slotThemes.length === 0) {
        return [
            customThemeToCatalogTheme(
                settings?.customUserTheme || DEFAULT_CUSTOM_THEME,
                'Current Custom Theme',
                {
                    userSlotIndex: 0,
                },
            ),
        ];
    }

    return slotThemes.slice(0, CUSTOM_THEME_SLOT_COUNT);
}

export function customThemeMatchesCatalogTheme(customTheme, catalogTheme) {
    const left = sanitizeCustomTheme(customTheme);
    const right = catalogThemeToCustomTheme(catalogTheme);

    for (const field of CUSTOM_THEME_FIELDS) {
        const alphaKey = getCustomThemeAlphaKey(field.key);
        if (left[field.key] !== right[field.key]) return false;
        if (left[alphaKey] !== right[alphaKey]) return false;
    }

    return true;
}
