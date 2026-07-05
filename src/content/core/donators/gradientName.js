const DEFAULT_GRADIENT_NAME = {
    enabled: true,
    color1: '#ff4ecd',
    color2: '#ffe66d',
    color3: '#4dd4ff',
    angle: 90,
    fade: 100,
};

const CODE_TO_EFFECT = {
    0: 'none',
    1: 'shine',
    2: 'sparkles',
    3: 'blooming-bloom',
};
const EFFECT_ALIASES = {
    boom: 'blooming-bloom',
    bloom: 'blooming-bloom',
    'blooming bloom': 'blooming-bloom',
};
const VALID_EFFECTS = new Set([
    'none',
    'shine',
    'sparkles',
    'blooming-bloom',
]);

function normalizeHexColor(color, fallback) {
    const source = String(color || fallback || '').replace(/^#/, '');
    return /^[0-9a-f]{6}$/i.test(source)
        ? source.toLowerCase()
        : String(fallback || 'ffffff').replace(/^#/, '').toLowerCase();
}

function toBoundedInt(value, fallback, min, max) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
}

function fromBase36Pair(value, fallback, min, max) {
    const parsed = Number.parseInt(value, 36);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
}

function normalizeEffect(effect) {
    const normalized = String(effect || 'none').toLowerCase();
    const aliased = EFFECT_ALIASES[normalized] || normalized;
    return VALID_EFFECTS.has(aliased) ? aliased : 'none';
}

export function serializeGradientNameSetting(gradient, effect = 'none') {
    const normalizedEffect = normalizeEffect(effect);
    if (!gradient?.enabled) return normalizedEffect;

    const color1 = normalizeHexColor(
        gradient.color1,
        DEFAULT_GRADIENT_NAME.color1,
    );
    const color2 = normalizeHexColor(
        gradient.color2,
        DEFAULT_GRADIENT_NAME.color2,
    );
    const color3 = normalizeHexColor(
        gradient.color3,
        DEFAULT_GRADIENT_NAME.color3,
    );
    const angle = toBoundedInt(
        gradient.angle,
        DEFAULT_GRADIENT_NAME.angle,
        0,
        360,
    );
    const fade = toBoundedInt(gradient.fade, DEFAULT_GRADIENT_NAME.fade, 0, 100);
    return [
        `#${color1}`,
        `#${color2}`,
        `#${color3}`,
        fade,
        angle,
        normalizedEffect,
    ].join(', ');
}

function parseCompactGradientNameSetting(compact) {
    if (compact.length < 23) return null;

    const color1 = compact.slice(0, 6);
    const color2 = compact.slice(6, 12);
    const color3 = compact.slice(12, 18);
    if (
        !/^[0-9a-f]{6}$/i.test(color1) ||
        !/^[0-9a-f]{6}$/i.test(color2) ||
        !/^[0-9a-f]{6}$/i.test(color3)
    ) {
        return null;
    }

    return {
        gradient: {
            enabled: true,
            color1: `#${color1.toLowerCase()}`,
            color2: `#${color2.toLowerCase()}`,
            color3: `#${color3.toLowerCase()}`,
            angle: fromBase36Pair(compact.slice(18, 20), 90, 0, 360),
            fade: fromBase36Pair(compact.slice(20, 22), 100, 0, 100),
        },
        effect: CODE_TO_EFFECT[compact.slice(22, 23)] || 'none',
    };
}

function parseReadableGradientNameSetting(value) {
    const parts = value.split(',').map((part) => part.trim());
    if (parts.length < 5) return null;

    const color1 = normalizeHexColor(parts[0], DEFAULT_GRADIENT_NAME.color1);
    const color2 = normalizeHexColor(parts[1], DEFAULT_GRADIENT_NAME.color2);
    const color3 = normalizeHexColor(parts[2], DEFAULT_GRADIENT_NAME.color3);

    return {
        gradient: {
            enabled: true,
            color1: `#${color1}`,
            color2: `#${color2}`,
            color3: `#${color3}`,
            fade: toBoundedInt(parts[3], DEFAULT_GRADIENT_NAME.fade, 0, 100),
            angle: toBoundedInt(parts[4], DEFAULT_GRADIENT_NAME.angle, 0, 360),
        },
        effect: normalizeEffect(parts[5]),
    };
}

export function parseGradientNameSetting(value) {
    if (!value || typeof value !== 'string') return null;

    const setting = value.trim();
    if (!setting) return null;

    if (setting.includes(',')) {
        return parseReadableGradientNameSetting(setting);
    }

    const compact = parseCompactGradientNameSetting(setting);
    if (compact) return compact;

    return {
        gradient: null,
        effect: normalizeEffect(setting),
    };
}
