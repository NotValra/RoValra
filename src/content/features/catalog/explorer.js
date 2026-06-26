import { getPlaceIdFromUrl } from '../../core/idExtractor.js';
import {
    loadAssetTree,
    canAccessAsset,
} from '../../core/utils/assetStreamer.js';
import { observeElement } from '../../core/observer.js';
import { createOverlay } from '../../core/ui/overlay.js';
import { getAssets } from '../../core/assets.js';
import { callRobloxApi, callRobloxApiJson } from '../../core/api.js';
import { addTooltip } from '../../core/ui/tooltip.js';
import { createStyledInput } from '../../core/ui/catalog/input.js';
import { unzipSync } from 'fflate';
import {
    CATALOG_ITEM_TYPES,
    getCatalogItemDetails,
} from '../../core/apis/catalog.js';
import { ts } from '../../core/locale/i18n.js';
import { settings } from '../../core/settings/getSettings.js';
import { isDarkMode } from '../../core/theme.js';
import { CLASS_ORDER } from '../../core/utils/vendor/classOrder.js';
import { PROP_CATEGORY } from '../../core/utils/vendor/propGroups.js';

// Sorts instances like the Studio Explorer: by class order (Workspace, Players,
// Lighting... first), then alphabetically. Unknown classes sink to the bottom.
function sortInstances(instances) {
    return [...instances].sort((a, b) => {
        const ao = CLASS_ORDER[a.ClassName] ?? Number.MAX_SAFE_INTEGER;
        const bo = CLASS_ORDER[b.ClassName] ?? Number.MAX_SAFE_INTEGER;
        if (ao !== bo) return ao - bo;
        const an = getInstanceName(a);
        const bn = getInstanceName(b);
        return an < bn ? -1 : an > bn ? 1 : 0;
    });
}

function classIconUrl(className) {
    const folder = isDarkMode() ? 'class_icons_dark' : 'class_icons_light';
    return `https://www.rovalra.com/static/${folder}/${encodeURIComponent(className)}.png`;
}

const CLASSIC_CLOTHING_ASSET_TYPES = new Set([
    'TShirt',
    'Shirt',
    'Pants',
    'ClassicTShirt',
    'ClassicShirt',
    'ClassicPants',
]);
const CLASSIC_CLOTHING_ASSET_TYPE_IDS = new Set([2, 11, 12]);

function catalogAssetTypeName(details) {
    const assetType = details?.assetType;
    if (typeof assetType === 'string') return assetType;
    if (assetType && typeof assetType === 'object') {
        return assetType.name || assetType.displayName || assetType.Name || '';
    }
    return '';
}

function catalogAssetTypeId(details) {
    const candidates = [
        details?.assetType,
        details?.assetTypeId,
        details?.AssetTypeId,
        details?.productType,
        details?.assetType?.id,
        details?.assetType?.assetTypeId,
        details?.assetType?.Id,
    ];
    for (const candidate of candidates) {
        const id = Number(candidate);
        if (Number.isFinite(id)) return id;
    }
    return null;
}

function isClassicClothingDetails(details) {
    const assetTypeName = catalogAssetTypeName(details).replace(
        /[^A-Za-z0-9]/g,
        '',
    );
    const assetTypeId = catalogAssetTypeId(details);
    return (
        CLASSIC_CLOTHING_ASSET_TYPES.has(assetTypeName) ||
        CLASSIC_CLOTHING_ASSET_TYPE_IDS.has(assetTypeId)
    );
}

async function isClassicClothingItem(assetId) {
    try {
        const details = await getCatalogItemDetails(
            assetId,
            CATALOG_ITEM_TYPES.ASSET,
        );
        if (isClassicClothingDetails(details)) return true;

        const economyDetails = await callRobloxApiJson({
            subdomain: 'economy',
            endpoint: `/v2/assets/${assetId}/details`,
            method: 'GET',
        });
        return isClassicClothingDetails(economyDetails);
    } catch (error) {
        console.warn(
            '[RoValra Explorer] Failed to check catalog item type:',
            error,
        );
        return false;
    }
}

function applyMaskIcon(el, url) {
    const mask = `url("${url}") no-repeat center / contain`;
    el.style.webkitMask = mask;
    el.style.mask = mask;
}

function getInstanceName(instance) {
    const name = instance.Properties?.Name;
    if (typeof name === 'string' && name.length > 0) return name;
    return instance.ClassName || 'Instance';
}

function fixNum(v) {
    return Math.round(v * 1e3) / 1e3;
}

function formatValue(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') return String(fixNum(value));
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'string') return value;

    if (Array.isArray(value)) {
        return `${value.length} keypoint${value.length === 1 ? '' : 's'}`;
    }

    if (typeof value === 'object') {
        if ('x' in value && 'y' in value) {
            return 'z' in value
                ? `${fixNum(value.x)}, ${fixNum(value.y)}, ${fixNum(value.z)}`
                : `${fixNum(value.x)}, ${fixNum(value.y)}`;
        }
        if ('r' in value && 'g' in value && 'b' in value) {
            const to255 = (c) => (c <= 1 ? Math.round(c * 255) : Math.round(c));
            return `${to255(value.r)}, ${to255(value.g)}, ${to255(value.b)}`;
        }
        if ('Scale' in value && 'Offset' in value) {
            return `{${fixNum(value.Scale)}, ${value.Offset}}`;
        }
        if (value.X && value.Y && 'Scale' in value.X) {
            return `{${fixNum(value.X.Scale)}, ${value.X.Offset}}, {${fixNum(value.Y.Scale)}, ${value.Y.Offset}}`;
        }
        if (value.Origin && value.Direction) {
            return `${formatValue(value.Origin)} → ${formatValue(value.Direction)}`;
        }
        if ('Min' in value && 'Max' in value) {
            return `${formatValue(value.Min)} .. ${formatValue(value.Max)}`;
        }
        if ('Family' in value) return value.Family;
        if ('Density' in value) return 'Custom';
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }
    return String(value);
}

const GROUP_PRIORITY = [
    'Appearance',
    'Data',
    'Behavior',
    'Transform',
    'Pivot',
    'Part',
    'Collision',
    'Physics',
    'Surface Inputs',
    'Surface',
    'Camera',
    'Goals',
    'Image',
    'Text',
    'Assembly',
    'Scale',
];

function propGroup(name) {
    return PROP_CATEGORY[name] || 'Data';
}

const HIDDEN_PROPS = new Set(['HistoryId', 'SourceAssetId']);

function groupSortKey(group) {
    if (group === 'Attributes') return 1e6;
    if (group === 'Tags') return 1e6 + 1;
    const index = GROUP_PRIORITY.indexOf(group);
    return index === -1 ? GROUP_PRIORITY.length : index;
}

function parseTags(value) {
    if (value instanceof Uint8Array) value = new TextDecoder().decode(value);
    if (typeof value !== 'string') return [];
    return value.split('\0').filter((t) => t.length > 0);
}

function parseAttributes(bytes) {
    const result = {};
    if (!(bytes instanceof Uint8Array) || bytes.length < 4) return result;

    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let o = 0;
    const u8 = () => bytes[o++];
    const u16 = () => ((o += 2), dv.getUint16(o - 2, true));
    const u32 = () => ((o += 4), dv.getUint32(o - 4, true));
    const i32 = () => ((o += 4), dv.getInt32(o - 4, true));
    const f32 = () => ((o += 4), dv.getFloat32(o - 4, true));
    const f64 = () => ((o += 8), dv.getFloat64(o - 8, true));
    const str = () => {
        const len = u32();
        const s = new TextDecoder().decode(bytes.subarray(o, o + len));
        o += len;
        return s;
    };

    try {
        const count = u32();
        for (let n = 0; n < count; n++) {
            const name = str();
            const type = u8();
            let value;
            switch (type) {
                case 0x02:
                    value = str();
                    break;
                case 0x03:
                    value = u8() !== 0;
                    break;
                case 0x04:
                    value = i32();
                    break;
                case 0x05:
                    value = f32();
                    break;
                case 0x06:
                    value = f64();
                    break;
                case 0x09:
                    value = { Scale: f32(), Offset: i32() };
                    break;
                case 0x0a:
                    value = {
                        X: { Scale: f32(), Offset: i32() },
                        Y: { Scale: f32(), Offset: i32() },
                    };
                    break;
                case 0x0e:
                    value = u32();
                    break;
                case 0x0f:
                    value = { r: f32(), g: f32(), b: f32() };
                    break;
                case 0x10:
                    value = { x: f32(), y: f32() };
                    break;
                case 0x11:
                    value = { x: f32(), y: f32(), z: f32() };
                    break;
                case 0x14: {
                    const x = f32(),
                        y = f32(),
                        z = f32();
                    if (u8() === 0) for (let k = 0; k < 9; k++) f32();
                    value = `${x}, ${y}, ${z}`;
                    break;
                }
                case 0x15: {
                    const enumName = str();
                    value = `${enumName}.${u32()}`;
                    break;
                }
                case 0x17: {
                    const kc = u32();
                    const arr = [];
                    for (let k = 0; k < kc; k++)
                        arr.push({
                            Time: f32(),
                            Value: f32(),
                            Envelope: f32(),
                        });
                    value = arr;
                    break;
                }
                case 0x19: {
                    const kc = u32();
                    const arr = [];
                    for (let k = 0; k < kc; k++) {
                        const envelope = f32();
                        const time = f32();
                        arr.push({
                            Time: time,
                            Value: { r: f32(), g: f32(), b: f32() },
                            Envelope: envelope,
                        });
                    }
                    value = arr;
                    break;
                }
                case 0x1b:
                    value = { Min: f32(), Max: f32() };
                    break;
                case 0x1c:
                    value = {
                        Min: { x: f32(), y: f32() },
                        Max: { x: f32(), y: f32() },
                    };
                    break;
                case 0x21: {
                    const weight = u16();
                    const style = u8();
                    const family = str();
                    str();
                    value = { Family: family, Weight: weight, Style: style };
                    break;
                }
                default:
                    return result;
            }
            result[name] = value;
        }
    } catch {
        /* return whatever parsed cleanly */
    }
    return result;
}

const LUAU_KEYWORDS = new Set([
    'and',
    'break',
    'do',
    'else',
    'elseif',
    'end',
    'false',
    'for',
    'function',
    'if',
    'in',
    'local',
    'nil',
    'not',
    'or',
    'repeat',
    'return',
    'then',
    'true',
    'until',
    'while',
    'continue',
    'export',
    'type',
    'self',
]);

function highlightLuau(source) {
    const code = document.createElement('code');
    code.className = 'rovalra-explorer-code';

    const re =
        /(--\[\[[\s\S]*?\]\]|--[^\n]*)|(\[\[[\s\S]*?\]\]|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|(0[xX][0-9a-fA-F]+|\d+\.?\d*(?:[eE][+-]?\d+)?)|([A-Za-z_]\w*)|(\s+)|(.)/g;

    let m;
    while ((m = re.exec(source))) {
        let cls = null;
        if (m[1]) cls = 'tok-comment';
        else if (m[2]) cls = 'tok-string';
        else if (m[3]) cls = 'tok-number';
        else if (m[4]) cls = LUAU_KEYWORDS.has(m[4]) ? 'tok-keyword' : null;
        else if (m[5]) cls = null;
        else cls = 'tok-op';

        if (cls) {
            const span = document.createElement('span');
            span.className = cls;
            span.textContent = m[0];
            code.appendChild(span);
        } else {
            code.appendChild(document.createTextNode(m[0]));
        }
    }
    return code;
}

function asColorSwatch(value) {
    if (
        value &&
        typeof value === 'object' &&
        'r' in value &&
        'g' in value &&
        'b' in value
    ) {
        const to255 = (c) => (c <= 1 ? Math.round(c * 255) : Math.round(c));
        return `rgb(${to255(value.r)}, ${to255(value.g)}, ${to255(value.b)})`;
    }
    return null;
}

function isColorSequence(value) {
    if (!Array.isArray(value) || value.length === 0) return false;
    return value.every(
        (kp) =>
            kp &&
            typeof kp === 'object' &&
            typeof kp.Time === 'number' &&
            kp.Value &&
            typeof kp.Value === 'object' &&
            'r' in kp.Value &&
            'g' in kp.Value &&
            'b' in kp.Value,
    );
}

function isNumberSequence(value) {
    if (!Array.isArray(value) || value.length === 0) return false;
    return value.every(
        (kp) =>
            kp &&
            typeof kp === 'object' &&
            typeof kp.Time === 'number' &&
            typeof kp.Value === 'number',
    );
}

function buildColorSequenceGradient(value) {
    const stops = value.map((kp) => {
        const pct = (kp.Time || 0) * 100;
        const to255 = (c) => Math.round(c <= 1 ? c * 255 : c);
        const color = `rgb(${to255(kp.Value.r)}, ${to255(kp.Value.g)}, ${to255(kp.Value.b)})`;
        return `${color} ${pct}%`;
    });
    return `linear-gradient(90deg, ${stops.join(', ')})`;
}

function buildNumberSequenceSvg(value, width = 150, height = 18) {
    let min = Infinity,
        max = -Infinity;
    for (const kp of value) {
        if (kp.Value < min) min = kp.Value;
        if (kp.Value > max) max = kp.Value;
    }
    if (min === max) {
        min -= 1;
        max += 1;
    }

    const pts = value.map((kp) => {
        const x = (kp.Time || 0) * width;
        const y = height - ((kp.Value - min) / (max - min)) * (height - 4) - 2;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
    });

    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.style.display = 'block';

    const polygon = document.createElementNS(ns, 'polygon');
    polygon.setAttribute(
        'points',
        `0,${height} ${pts.join(' ')} ${width},${height}`,
    );
    polygon.setAttribute('fill', 'rgba(100, 170, 255, 0.25)');
    svg.appendChild(polygon);

    const polyline = document.createElementNS(ns, 'polyline');
    polyline.setAttribute('points', pts.join(' '));
    polyline.setAttribute('fill', 'none');
    polyline.setAttribute('stroke', 'rgb(120, 190, 255)');
    polyline.setAttribute('stroke-width', '1.5');
    polyline.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.appendChild(polyline);

    return svg;
}

// --- BEGIN SCREENGUI VIEWER LOGIC ---

function robloxColorToCss(color, alpha = 1) {
    if (!color || typeof color.r !== 'number') return null;
    const to255 = (c) => Math.round(c <= 1 ? c * 255 : c);
    return `rgba(${to255(color.r)}, ${to255(color.g)}, ${to255(color.b)}, ${alpha})`;
}

function getTintFilter(color) {
    if (!color) return null;
    const r = color.r <= 1 ? color.r : color.r / 255;
    const g = color.g <= 1 ? color.g : color.g / 255;
    const b = color.b <= 1 ? color.b : color.b / 255;

    if (
        Math.abs(r - 1) < 0.001 &&
        Math.abs(g - 1) < 0.001 &&
        Math.abs(b - 1) < 0.001
    )
        return null;

    const id = `rovalra-tint-${Math.round(r * 255)}-${Math.round(g * 255)}-${Math.round(b * 255)}`;
    if (document.getElementById(id)) return `url(#${id})`;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.style.position = 'absolute';

    const filter = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'filter',
    );
    filter.setAttribute('id', id);
    filter.setAttribute('color-interpolation-filters', 'sRGB');

    const matrix = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'feColorMatrix',
    );
    matrix.setAttribute('type', 'matrix');
    matrix.setAttribute(
        'values',
        `${r} 0 0 0 0  0 ${g} 0 0 0  0 0 ${b} 0 0  0 0 0 1 0`,
    );

    filter.appendChild(matrix);
    svg.appendChild(filter);
    document.body.appendChild(svg);

    return `url(#${id})`;
}

function buildUIGradient(g, baseColor = null, elementTransparency = 0) {
    const rot = 90 - (g.Rotation || 0);
    const stops = [];
    const base = baseColor || { r: 1, g: 1, b: 1 };
    const baseR = base.r <= 1 ? base.r : base.r / 255;
    const baseG = base.g <= 1 ? base.g : base.g / 255;
    const baseB = base.b <= 1 ? base.b : base.b / 255;
    const elementOpacity = 1 - (elementTransparency || 0);

    if (Array.isArray(g.Color) && g.Color.length > 0) {
        for (const kp of g.Color) {
            const pct = (kp.Time || 0) * 100;
            let transp = 0;
            if (Array.isArray(g.Transparency) && g.Transparency.length > 0) {
                let prev = g.Transparency[0];
                let next = g.Transparency[g.Transparency.length - 1];
                for (const t of g.Transparency) {
                    if (t.Time <= kp.Time) prev = t;
                    if (t.Time >= kp.Time) {
                        next = t;
                        break;
                    }
                }
                const range = next.Time - prev.Time;
                if (range > 0) {
                    transp =
                        prev.Value +
                        (next.Value - prev.Value) *
                            ((kp.Time - prev.Time) / range);
                } else {
                    transp = prev.Value;
                }
            }
            const gradientOpacity = 1 - transp;
            const finalOpacity = elementOpacity * gradientOpacity;

            const r = (kp.Value.r <= 1 ? kp.Value.r : kp.Value.r / 255) * baseR;
            const grn =
                (kp.Value.g <= 1 ? kp.Value.g : kp.Value.g / 255) * baseG;
            const bl =
                (kp.Value.b <= 1 ? kp.Value.b : kp.Value.b / 255) * baseB;

            const to255 = (c) => Math.round(c * 255);
            stops.push(
                `rgba(${to255(r)}, ${to255(grn)}, ${to255(bl)}, ${finalOpacity}) ${pct}%`,
            );
        }
    }
    if (stops.length === 1) stops.push(stops[0]);
    return `linear-gradient(${rot}deg, ${stops.join(', ')})`;
}

function parseRichTextAttributes(attrs) {
    const parsed = {};
    const attrRegex = /([a-zA-Z]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let match;
    while ((match = attrRegex.exec(attrs))) {
        parsed[match[1].toLowerCase()] = match[2] ?? match[3] ?? '';
    }
    return parsed;
}

function safeRichTextColor(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(trimmed)) return trimmed;
    const rgbMatch = trimmed.match(
        /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i,
    );
    if (!rgbMatch) return null;
    const parts = rgbMatch.slice(1).map(Number);
    if (parts.some((part) => part < 0 || part > 255)) return null;
    return `rgb(${parts.join(', ')})`;
}

function safeRichTextFontFace(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!/^[\w .'-]{1,80}$/.test(trimmed)) return null;
    return trimmed;
}

function applyRichTextFontStyles(el, attrs) {
    const color = safeRichTextColor(attrs.color);
    if (color) el.style.color = color;

    const size = Number(attrs.size);
    if (Number.isFinite(size)) {
        el.style.fontSize = `${Math.max(1, Math.min(100, Math.round(size)))}px`;
    }

    const face = safeRichTextFontFace(attrs.face);
    if (face) el.style.fontFamily = `"${face}", sans-serif`;
}

function appendRichText(parent, text) {
    const stack = [parent];
    const tagRegex = /<\s*(\/?)\s*(br|b|i|u|s|font)\b([^>]*)>/gi;
    let lastIndex = 0;
    let match;

    while ((match = tagRegex.exec(text))) {
        if (match.index > lastIndex) {
            stack[stack.length - 1].appendChild(
                document.createTextNode(text.slice(lastIndex, match.index)),
            );
        }

        const isClosing = match[1] === '/';
        const tagName = match[2].toLowerCase();

        if (tagName === 'br' && !isClosing) {
            stack[stack.length - 1].appendChild(document.createElement('br'));
        } else if (isClosing) {
            for (let i = stack.length - 1; i > 0; i--) {
                if (stack[i].dataset.richTextTag === tagName) {
                    stack.length = i;
                    break;
                }
            }
        } else {
            const el = document.createElement(
                tagName === 'font' ? 'span' : tagName,
            );
            el.dataset.richTextTag = tagName;
            if (tagName === 'font')
                applyRichTextFontStyles(el, parseRichTextAttributes(match[3]));
            stack[stack.length - 1].appendChild(el);
            stack.push(el);
        }

        lastIndex = tagRegex.lastIndex;
    }

    if (lastIndex < text.length) {
        stack[stack.length - 1].appendChild(
            document.createTextNode(text.slice(lastIndex)),
        );
    }
}

// --- Font Loading Logic ---

const fontFamilyMap = new Map();
const ROBLOX_TEXT_PADDING = 4;

const ROBLOX_FONT_ENUM_MAP = {
    0: 'Legacy',
    1: 'Arial',
    2: 'Arial Bold',
    3: 'Source Sans Pro',
    4: 'Source Sans Pro Bold',
    5: 'Source Sans Pro Light',
    6: 'Source Sans Pro Italic',
    7: 'Bodoni',
    8: 'Garamond',
    9: 'Cartoon',
    10: 'Code',
    11: 'Highway',
    12: 'SciFi',
    13: 'Arcade',
    14: 'Fantasy',
    15: 'Antique',
    16: 'Source Sans Pro Semibold',
    17: 'Gotham',
    18: 'Gotham Medium',
    19: 'Gotham Bold',
    20: 'Gotham Black',
    21: 'Amatic SC',
    22: 'Bangers',
    23: 'Creepster',
    24: 'Denk One',
    25: 'Fondamento',
    26: 'Fredoka One',
    27: 'Grenze Gotisch',
    28: 'Indie Flower',
    29: 'Josefin Sans',
    30: 'Jura',
    31: 'Kalam',
    32: 'Luckiest Guy',
    33: 'Merriweather',
    34: 'Michroma',
    35: 'Nunito',
    36: 'Oswald',
    37: 'Patrick Hand',
    38: 'Permanent Marker',
    39: 'Roboto',
    40: 'Roboto Condensed',
    41: 'Roboto Mono',
    42: 'Sarpanch',
    43: 'Special Elite',
    44: 'Titillium Web',
    45: 'Ubuntu',
    46: 'Builder Sans',
    47: 'Builder Sans Medium',
    48: 'Builder Sans Bold',
    49: 'Builder Sans ExtraBold',
    50: 'Arimo',
    51: 'Arimo Bold',
    100: 'Unknown',
};

const ROBLOX_FONT_FAMILY_FALLBACKS = {
    AmaticSC: '"Amatic SC", sans-serif',
    BuilderSans: '"Builder Sans", sans-serif',
    BuilderSansBold: '"Builder Sans", sans-serif',
    BuilderSansExtraBold: '"Builder Sans", sans-serif',
    BuilderSansMedium: '"Builder Sans", sans-serif',
    SourceSansPro: '"Source Sans Pro", sans-serif',
    SourceSansProBold: '"Source Sans Pro", sans-serif',
    SourceSansProLight: '"Source Sans Pro", sans-serif',
    SourceSansProSemiBold: '"Source Sans Pro", sans-serif',
};

function getRobloxAssetId(value) {
    if (typeof value !== 'string') return null;
    const match = value.match(
        /(?:rbxassetid:\/\/|\/asset\/?\?id=|assetid=|[?&]id=)(\d+)/i,
    );
    return match ? match[1] : null;
}

function cssFontStyle(style) {
    if (typeof style === 'string') return style.toLowerCase();
    if (typeof style === 'number') {
        const styles = ['normal', 'italic', 'oblique'];
        return styles[style] || 'normal';
    }
    return 'normal';
}

let cachedStudioFonts = null;
let studioFontsFetchPromise = null;

function uint8ToBase64(u8) {
    let binary = '';
    const chunk = 8192;
    for (let i = 0; i < u8.length; i += chunk) {
        binary += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
    }
    return btoa(binary);
}

function detectFontMimeType(bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.length < 4)
        return 'application/octet-stream';

    const signature = String.fromCharCode(
        bytes[0],
        bytes[1],
        bytes[2],
        bytes[3],
    );
    if (signature === 'OTTO') return 'font/otf';
    if (signature === 'ttcf') return 'font/collection';
    if (signature === 'wOFF') return 'font/woff';
    if (signature === 'wOF2') return 'font/woff2';
    if (
        bytes[0] === 0x00 &&
        bytes[1] === 0x01 &&
        bytes[2] === 0x00 &&
        bytes[3] === 0x00
    ) {
        return 'font/ttf';
    }
    if (signature === 'true' || signature === 'typ1') return 'font/ttf';

    return 'application/octet-stream';
}

async function callRbxcdn(url) {
    const response = await callRobloxApi({
        fullUrl: url,
        method: 'GET',
        credentials: 'omit',
        noCache: true,
        useBackground: true,
        responseType: url.endsWith('.zip') ? 'arrayBuffer' : 'text',
    });
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
    }
    return response;
}

async function getStudioFontsCache() {
    if (cachedStudioFonts) return cachedStudioFonts;
    if (studioFontsFetchPromise) return studioFontsFetchPromise;

    studioFontsFetchPromise = (async () => {
        try {
            const version = (
                await (
                    await callRbxcdn('https://setup.rbxcdn.com/versionQTStudio')
                ).text()
            ).trim();
            const zipArrayBuffer = await (
                await callRbxcdn(
                    `https://setup.rbxcdn.com/${version}-content-fonts.zip`,
                )
            ).arrayBuffer();

            cachedStudioFonts = unzipSync(new Uint8Array(zipArrayBuffer));
            return cachedStudioFonts;
        } catch (error) {
            console.error(
                'RoValra Explorer: Failed to load Studio fonts',
                error,
            );
            studioFontsFetchPromise = null;
            throw error;
        }
    })();

    return studioFontsFetchPromise;
}

async function getStudioFontFamily(familyName) {
    const cache = await getStudioFontsCache();
    const normalizedFamilyName =
        typeof familyName === 'string' ? familyName.toLowerCase() : '';
    const jsonKey = Object.keys(cache).find((key) =>
        key
            .replace(/\\/g, '/')
            .toLowerCase()
            .endsWith(`families/${normalizedFamilyName}.json`),
    );

    if (!jsonKey) throw new Error('Font family JSON not found');

    const jsonData = JSON.parse(new TextDecoder().decode(cache[jsonKey]));
    const faces = [];

    for (const face of jsonData.faces || []) {
        if (typeof face.assetId !== 'string') continue;
        const fontFileName = face.assetId.split('/').pop()?.toLowerCase();
        if (!fontFileName) continue;

        const fontKey = Object.keys(cache).find((key) =>
            key.replace(/\\/g, '/').toLowerCase().endsWith(fontFileName),
        );
        if (!fontKey) continue;

        faces.push({
            weight: face.weight,
            style: face.style,
            mimeType: detectFontMimeType(cache[fontKey]),
            base64: uint8ToBase64(cache[fontKey]),
        });
    }

    return { name: jsonData.name, faces };
}

async function loadFontFamily(fontFamilyUrl) {
    if (fontFamilyMap.has(fontFamilyUrl))
        return fontFamilyMap.get(fontFamilyUrl);

    const customAssetId = getRobloxAssetId(fontFamilyUrl);
    const isCustomFont = !!customAssetId;
    const familyName = isCustomFont
        ? null
        : fontFamilyUrl.split('/').pop().replace('.json', '');

    const fallback = familyName
        ? ROBLOX_FONT_FAMILY_FALLBACKS[familyName] ||
          `"${familyName}", sans-serif`
        : 'sans-serif';

    const loadPromise = (async () => {
        try {
            const { name, faces } = isCustomFont
                ? await new Promise((resolve, reject) => {
                      chrome.runtime.sendMessage(
                          {
                              action: 'getCustomFontFamily',
                              assetId: customAssetId,
                          },
                          (response) => {
                              if (
                                  chrome.runtime.lastError ||
                                  !response ||
                                  !response.success
                              ) {
                                  reject(
                                      new Error(
                                          response?.error ||
                                              chrome.runtime.lastError
                                                  ?.message ||
                                              'Failed to load custom font',
                                      ),
                                  );
                                  return;
                              }
                              resolve(response);
                          },
                      );
                  })
                : await getStudioFontFamily(familyName);

            const fontPromises = [];

            for (const face of faces) {
                const mimeType = face.mimeType || 'font/ttf';
                const fontUrl = `data:${mimeType};base64,${face.base64}`;
                const fontFace = new FontFace(name, `url(${fontUrl})`, {
                    weight: face.weight.toString(),
                    style: cssFontStyle(face.style),
                });
                fontPromises.push(
                    fontFace
                        .load()
                        .then((loadedFace) => {
                            document.fonts.add(loadedFace);
                        })
                        .catch((e) => {
                            console.warn(
                                'Failed to load font face',
                                name,
                                face.weight,
                                e,
                            );
                        }),
                );
            }

            await Promise.all(fontPromises);
            const cssName = `'${name}', sans-serif`;
            fontFamilyMap.set(fontFamilyUrl, cssName);
            return cssName;
        } catch (error) {
            console.warn('Failed to load font', fontFamilyUrl, error);
            fontFamilyMap.set(fontFamilyUrl, fallback);
            return fallback;
        }
    })();
    fontFamilyMap.set(fontFamilyUrl, loadPromise);
    return loadPromise;
}

async function preloadFonts(instance) {
    if (!instance) return;
    const fontPromises = [];

    function collectFonts(inst) {
        if (!inst) return;
        if (['TextLabel', 'TextButton', 'TextBox'].includes(inst.ClassName)) {
            const fontFace = inst.Properties?.FontFace;
            if (
                fontFace &&
                fontFace.Family &&
                !fontFamilyMap.has(fontFace.Family)
            ) {
                fontPromises.push(
                    loadFontFamily(fontFace.Family).catch((e) => {
                        console.warn(
                            'Failed to preload font',
                            fontFace.Family,
                            e,
                        );
                        fontFamilyMap.set(fontFace.Family, 'sans-serif');
                    }),
                );
            }
        }
        if (inst.Children) {
            for (const child of inst.Children) {
                collectFonts(child);
            }
        }
    }

    collectFonts(instance);
    await Promise.all(fontPromises);
}

function parseOpenTypeFeatures(features) {
    if (!features || typeof features !== 'string') return null;
    const cssFeatures = [];
    const parts = features.split(',');
    for (let part of parts) {
        part = part.trim();
        if (!part) continue;
        const match = part.match(/^([a-zA-Z0-9]{4})(?:=(\d+))?$/);
        if (match) {
            const tag = match[1];
            const val = match[2] || '1';
            cssFeatures.push(`"${tag}" ${val}`);
        }
    }
    return cssFeatures.length > 0 ? cssFeatures.join(', ') : null;
}

function calculateOptimalFontSize(
    width,
    height,
    text,
    fontFamily,
    fontWeight,
    fontStyle,
    maxFontSize,
    minFontSize,
) {
    if (width <= 0 || height <= 0 || !text || text.length === 0)
        return minFontSize;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    let low = Math.floor(minFontSize);
    let high = Math.ceil(maxFontSize);
    let bestFit = low;

    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        ctx.font = `${fontStyle} ${fontWeight} ${mid}px ${fontFamily}`;

        const paragraphs = text.split('\n');
        let lines = 0;
        let maxLineWidth = 0;

        for (const p of paragraphs) {
            const words = p.split(' ');
            let currentLine = '';

            if (words.length === 1 && words[0] === '') {
                lines++;
                continue;
            }

            for (const word of words) {
                const testLine = currentLine ? currentLine + ' ' + word : word;
                const metrics = ctx.measureText(testLine);
                if (metrics.width > width && currentLine) {
                    lines++;
                    const w = ctx.measureText(currentLine).width;
                    if (w > maxLineWidth) maxLineWidth = w;
                    currentLine = word;
                } else {
                    currentLine = testLine;
                }
            }

            if (currentLine) {
                lines++;
                const w = ctx.measureText(currentLine).width;
                if (w > maxLineWidth) maxLineWidth = w;
            }
        }

        const estimatedHeight = lines * mid * 1.2;

        if (estimatedHeight <= height && maxLineWidth <= width) {
            bestFit = mid;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }

    return bestFit;
}

const DEFAULT_DEVICES = [
    {
        Name: 'iPad 8th Generation',
        Width: 1080,
        Height: 810,
        PixelDensity: 264,
        Category: 'Tablet',
    },
    {
        Name: 'iPad 9th Generation',
        Width: 1080,
        Height: 810,
        PixelDensity: 264,
        Category: 'Tablet',
    },
    {
        Name: 'Xiaomi Redmi Pad SE',
        Width: 960,
        Height: 600,
        PixelDensity: 206,
        Category: 'Tablet',
    },
    {
        Name: 'Amazon Fire HD 10 (2023)',
        Width: 960,
        Height: 600,
        PixelDensity: 224,
        Category: 'Tablet',
    },
    {
        Name: 'iPad 10th Generation',
        Width: 1180,
        Height: 820,
        PixelDensity: 264,
        Category: 'Tablet',
    },
    {
        Name: 'iPad A16',
        Width: 1180,
        Height: 820,
        PixelDensity: 264,
        Category: 'Tablet',
    },
    {
        Name: 'Samsung Galaxy Tab A8',
        Width: 960,
        Height: 600,
        PixelDensity: 216,
        Category: 'Tablet',
    },
    {
        Name: 'Samsung Galaxy Tab A9',
        Width: 1340,
        Height: 800,
        PixelDensity: 179,
        Category: 'Tablet',
    },
    {
        Name: 'iPad Air 5th Generation',
        Width: 1180,
        Height: 820,
        PixelDensity: 264,
        Category: 'Tablet',
    },
    {
        Name: 'iPad Pro M4 (11in)',
        Width: 1210,
        Height: 834,
        PixelDensity: 264,
        Category: 'Tablet',
    },
    {
        Name: 'iPad Pro M5 (13in)',
        Width: 1376,
        Height: 1032,
        PixelDensity: 264,
        Category: 'Tablet',
    },
    {
        Name: 'Samsung Galaxy Tab A9+',
        Width: 960,
        Height: 600,
        PixelDensity: 206,
        Category: 'Tablet',
    },
    {
        Name: 'Samsung Galaxy Tab S11',
        Width: 1280,
        Height: 800,
        PixelDensity: 274,
        Category: 'Tablet',
    },
    {
        Name: 'iPhone XR',
        Width: 896,
        Height: 414,
        PixelDensity: 326,
        Category: 'Phone',
    },
    {
        Name: 'iPhone 11',
        Width: 896,
        Height: 414,
        PixelDensity: 326,
        Category: 'Phone',
    },
    {
        Name: 'Samsung Galaxy A06',
        Width: 800,
        Height: 360,
        PixelDensity: 262,
        Category: 'Phone',
    },
    {
        Name: 'iPhone 13',
        Width: 844,
        Height: 390,
        PixelDensity: 460,
        Category: 'Phone',
    },
    {
        Name: 'iPhone 13 Pro',
        Width: 844,
        Height: 390,
        PixelDensity: 460,
        Category: 'Phone',
    },
    {
        Name: 'iPhone 13 Pro Max',
        Width: 926,
        Height: 428,
        PixelDensity: 458,
        Category: 'Phone',
    },
    {
        Name: 'iPhone 14',
        Width: 844,
        Height: 390,
        PixelDensity: 460,
        Category: 'Phone',
    },
    {
        Name: 'Samsung Galaxy A16',
        Width: 780,
        Height: 360,
        PixelDensity: 385,
        Category: 'Phone',
    },
    {
        Name: 'iPhone 16',
        Width: 852,
        Height: 393,
        PixelDensity: 460,
        Category: 'Phone',
    },
    {
        Name: 'iPhone 16 Pro',
        Width: 874,
        Height: 402,
        PixelDensity: 460,
        Category: 'Phone',
    },
    {
        Name: 'iPhone 16 Pro Max',
        Width: 956,
        Height: 440,
        PixelDensity: 460,
        Category: 'Phone',
    },
    {
        Name: 'iPhone 17 Pro',
        Width: 874,
        Height: 402,
        PixelDensity: 460,
        Category: 'Phone',
    },
    {
        Name: 'Samsung Galaxy S22 Ultra',
        Width: 772,
        Height: 360,
        PixelDensity: 501,
        Category: 'Phone',
    },
    {
        Name: 'Samsung Galaxy S25 Ultra',
        Width: 780,
        Height: 360,
        PixelDensity: 498,
        Category: 'Phone',
    },
    {
        Name: 'Desktop',
        Width: 1366,
        Height: 768,
        PixelDensity: 96,
        Category: 'Desktop',
    },
    {
        Name: 'HD 720',
        Width: 1280,
        Height: 720,
        PixelDensity: 96,
        Category: 'Desktop',
    },
    {
        Name: 'HD 1080',
        Width: 1920,
        Height: 1080,
        PixelDensity: 96,
        Category: 'Desktop',
    },
    {
        Name: 'VGA',
        Width: 640,
        Height: 480,
        PixelDensity: 96,
        Category: 'Desktop',
    },
    {
        Name: 'Xbox One',
        Width: 1920,
        Height: 1080,
        PixelDensity: 96,
        Category: 'Console',
    },
    {
        Name: 'PS4',
        Width: 1920,
        Height: 1080,
        PixelDensity: 96,
        Category: 'Console',
    },
    {
        Name: 'PS5',
        Width: 1920,
        Height: 1080,
        PixelDensity: 96,
        Category: 'Console',
    },
    {
        Name: 'Generic Handheld HD 720',
        Width: 1280,
        Height: 720,
        PixelDensity: 274,
        Category: 'Console',
    },
    {
        Name: 'Generic Handheld HD 1080',
        Width: 1920,
        Height: 1080,
        PixelDensity: 411,
        Category: 'Console',
    },
    {
        Name: 'Meta Quest 2',
        Width: 611,
        Height: 640,
        PixelDensity: 773,
        Category: 'VR',
    },
    {
        Name: 'Meta Quest 3',
        Width: 688,
        Height: 736,
        PixelDensity: 1218,
        Category: 'VR',
    },
];

function resolveTextXAlignment(value) {
    if (value === 0 || value === 'Left') return 'left';
    if (value === 1 || value === 'Right') return 'right';
    return 'center'; // 2 or Center
}

function resolveTextYAlignment(value) {
    if (value === 0 || value === 'Top') return 'top';
    if (value === 2 || value === 'Bottom') return 'bottom';
    return 'center'; // 1 or Center
}

const DECORATOR_CLASSES = new Set([
    'UIStroke',
    'UICorner',
    'UIGradient',
    'UIPadding',
    'UIScale',
    'UIShadow',
    'UIAspectRatioConstraint',
    'UISizeConstraint',
    'UITextSizeConstraint',
    'UIFlexItem',
    'UIListLayout',
    'UIGridLayout',
]);

const VALID_GUI_CLASSES = new Set([
    'ScreenGui',
    'BillboardGui',
    'SurfaceGui',
    'PluginGui',
    'DockWidgetPluginGui',
    'Frame',
    'ScrollingFrame',
    'TextLabel',
    'TextButton',
    'TextBox',
    'ImageLabel',
    'ImageButton',
    'ViewportFrame',
    'VideoFrame',
    'CanvasGroup',
    'Folder',
    'StarterGui',
]);

function getVisibilityProp(className) {
    if (
        className === 'ScreenGui' ||
        className === 'BillboardGui' ||
        className === 'SurfaceGui'
    ) {
        return 'Enabled';
    }
    return 'Visible';
}

// ==========================================
// PASS 1: Build Layout Tree
// ==========================================
function buildLayoutTree(instance, isRoot = false, parentPath = '') {
    const props = instance.Properties || {};

    if (!isRoot) {
        const visProp = getVisibilityProp(instance.ClassName);
        if (
            props[visProp] === false ||
            props[visProp] === 'false' ||
            props[visProp] === 0
        )
            return null;
    }
    if (DECORATOR_CLASSES.has(instance.ClassName)) return null;

    // Ignore non-UI objects so their descendants don't render
    if (!isRoot && !VALID_GUI_CLASSES.has(instance.ClassName)) return null;

    const decorators = {};
    let childrenToProcess = [];

    if (instance.Children) {
        for (const child of instance.Children) {
            if (DECORATOR_CLASSES.has(child.ClassName)) {
                if (!decorators[child.ClassName]) {
                    decorators[child.ClassName] = child.Properties || {};
                }
            } else {
                childrenToProcess.push(child);
            }
        }
    }

    if (decorators.UIListLayout || decorators.UIGridLayout) {
        const layout = decorators.UIListLayout || decorators.UIGridLayout;
        const sortOrder = layout.SortOrder ?? 0;
        childrenToProcess.sort((a, b) => {
            if (sortOrder === 2) {
                // LayoutOrder
                const ao = a.Properties?.LayoutOrder ?? 0;
                const bo = b.Properties?.LayoutOrder ?? 0;
                if (ao !== bo) return ao - bo;
            }
            const an = getInstanceName(a);
            const bn = getInstanceName(b);
            return an < bn ? -1 : an > bn ? 1 : 0;
        });
    }

    const name = getInstanceName(instance);
    const currentPath = parentPath ? `${parentPath}.${name}` : name;

    const node = {
        instance,
        decorators,
        isRoot,
        children: [],
        resolvedWidth: 0,
        resolvedHeight: 0,
        resolvedX: 0,
        resolvedY: 0,
        path: currentPath,
    };

    for (const child of childrenToProcess) {
        const childNode = buildLayoutTree(child, false, currentPath);
        if (childNode) node.children.push(childNode);
    }

    return node;
}

// ==========================================
// PASS 2: Resolve Layouts
// ==========================================
function applyModifiers(child) {
    let width = child.resolvedWidth;
    let height = child.resolvedHeight;

    // UIScale
    if (child.decorators.UIScale) {
        const scale = child.decorators.UIScale.Scale ?? 1;
        width *= scale;
        height *= scale;
    }

    const props = child.instance.Properties || {};
    if (props.SizeConstraint === 1) {
        // RelativeXX → width follows height
        height = width;
    } else if (props.SizeConstraint === 2) {
        // RelativeYY → height follows width
        width = height;
    }

    // UISizeConstraint
    if (child.decorators.UISizeConstraint) {
        const max = child.decorators.UISizeConstraint.MaxSize;
        const min = child.decorators.UISizeConstraint.MinSize;
        if (max) {
            if (max.x > 0) width = Math.min(width, max.x);
            if (max.y > 0) height = Math.min(height, max.y);
        }
        if (min) {
            if (min.x > 0) width = Math.max(width, min.x);
            if (min.y > 0) height = Math.max(height, min.y);
        }
    }

    // UIAspectRatioConstraint
    if (child.decorators.UIAspectRatioConstraint) {
        const c = child.decorators.UIAspectRatioConstraint;
        const ar = c.AspectRatio || 1;
        const dominantAxis = c.DominantAxis ?? 0;
        const aspectType = c.AspectType ?? 0;

        if (aspectType === 0) {
            // FitWithinMaxSize
            if (dominantAxis === 0) {
                const newHeight = width / ar;
                if (newHeight <= height) height = newHeight;
                else width = height * ar;
            } else {
                const newWidth = height * ar;
                if (newWidth <= width) width = newWidth;
                else height = width / ar;
            }
        } else {
            // ScaleWithParentSize
            if (width / height > ar) width = height * ar;
            else height = width / ar;
        }
    }

    child.resolvedWidth = Math.max(0, width);
    child.resolvedHeight = Math.max(0, height);
}

function resolveNodeSize(node, parentW, parentH) {
    if (node.isRoot) {
        node.resolvedWidth = parentW;
        node.resolvedHeight = parentH;
        node.resolvedX = 0;
        node.resolvedY = 0;
        return;
    }

    const props = node.instance.Properties || {};
    const size = props.Size || {
        X: { Scale: 1, Offset: 0 },
        Y: { Scale: 1, Offset: 0 },
    };

    let scaleX = size.X?.Scale || 0;
    let offsetX = size.X?.Offset || 0;
    let scaleY = size.Y?.Scale || 0;
    let offsetY = size.Y?.Offset || 0;

    const pos = props.Position || {
        X: { Scale: 0, Offset: 0 },
        Y: { Scale: 0, Offset: 0 },
    };
    let x = parentW * (pos.X?.Scale || 0) + (pos.X?.Offset || 0);
    let y = parentH * (pos.Y?.Scale || 0) + (pos.Y?.Offset || 0);

    node.resolvedWidth = Math.max(0, parentW * scaleX + offsetX);
    node.resolvedHeight = Math.max(0, parentH * scaleY + offsetY);
    node.resolvedX = x;
    node.resolvedY = y;

    // Apply modifiers first so AnchorPoint uses the final size
    applyModifiers(node);

    if (props.AnchorPoint) {
        node.resolvedX -= (props.AnchorPoint.x || 0) * node.resolvedWidth;
        node.resolvedY -= (props.AnchorPoint.y || 0) * node.resolvedHeight;
    }

    // Pre-calculate CanvasSize relative to the parent's content size
    if (node.instance.ClassName === 'ScrollingFrame') {
        const canvasSize = props.CanvasSize || {
            X: { Scale: 0, Offset: 0 },
            Y: { Scale: 0, Offset: 0 },
        };
        node.baseCanvasW = Math.max(
            parentW * (canvasSize.X?.Scale || 0) + (canvasSize.X?.Offset || 0),
            node.resolvedWidth,
        );
        node.baseCanvasH = Math.max(
            parentH * (canvasSize.Y?.Scale || 0) + (canvasSize.Y?.Offset || 0),
            node.resolvedHeight,
        );
    }
}

function applyChildLayout(node) {
    let contentW = node.resolvedWidth;
    let contentH = node.resolvedHeight;

    if (node.decorators.UIPadding) {
        const pad = node.decorators.UIPadding;
        const padL =
            (pad.PaddingLeft?.Scale || 0) * node.resolvedWidth +
            (pad.PaddingLeft?.Offset || 0);
        const padR =
            (pad.PaddingRight?.Scale || 0) * node.resolvedWidth +
            (pad.PaddingRight?.Offset || 0);
        const padT =
            (pad.PaddingTop?.Scale || 0) * node.resolvedHeight +
            (pad.PaddingTop?.Offset || 0);
        const padB =
            (pad.PaddingBottom?.Scale || 0) * node.resolvedHeight +
            (pad.PaddingBottom?.Offset || 0);
        contentW = Math.max(0, contentW - padL - padR);
        contentH = Math.max(0, contentH - padT - padB);

        node.padX = padL;
        node.padY = padT;
    } else {
        node.padX = 0;
        node.padY = 0;
    }

    // --- ScrollingFrame CanvasSize Logic ---
    if (node.instance.ClassName === 'ScrollingFrame') {
        const props = node.instance.Properties || {};
        let canvasW = node.baseCanvasW;
        let canvasH = node.baseCanvasH;

        const autoCanvas = props.AutomaticCanvasSize ?? 0; // 0: None, 1: X, 2: Y, 3: XY

        const resolveChildren = (cW, cH) => {
            if (node.decorators.UIListLayout) {
                resolveListLayout(node, cW, cH);
            } else if (node.decorators.UIGridLayout) {
                resolveGridLayout(node, cW, cH);
            } else {
                for (const child of node.children) {
                    resolveNodeSize(child, cW, cH);
                    child.resolvedX += node.padX;
                    child.resolvedY += node.padY;
                    applyChildLayout(child);
                }
            }
        };

        // First pass to determine bounds
        resolveChildren(canvasW, canvasH);

        if (autoCanvas > 0) {
            let maxChildX = 0,
                maxChildY = 0;
            for (const child of node.children) {
                maxChildX = Math.max(
                    maxChildX,
                    child.resolvedX + child.resolvedWidth - node.padX,
                );
                maxChildY = Math.max(
                    maxChildY,
                    child.resolvedY + child.resolvedHeight - node.padY,
                );
            }

            let padR = 0,
                padB = 0;
            if (node.decorators.UIPadding) {
                const pad = node.decorators.UIPadding;
                padR =
                    (pad.PaddingRight?.Scale || 0) * node.resolvedWidth +
                    (pad.PaddingRight?.Offset || 0);
                padB =
                    (pad.PaddingBottom?.Scale || 0) * node.resolvedHeight +
                    (pad.PaddingBottom?.Offset || 0);
            }

            let needsRerun = false;
            if (autoCanvas === 1 || autoCanvas === 3) {
                const newW = Math.max(canvasW, maxChildX + padR);
                if (newW > canvasW) {
                    canvasW = newW;
                    needsRerun = true;
                }
            }
            if (autoCanvas === 2 || autoCanvas === 3) {
                const newH = Math.max(canvasH, maxChildY + padB);
                if (newH > canvasH) {
                    canvasH = newH;
                    needsRerun = true;
                }
            }

            // Second pass with updated canvas size
            if (needsRerun) {
                resolveChildren(canvasW, canvasH);
            }
        }

        node.canvasWidth = canvasW;
        node.canvasHeight = canvasH;
        return; // Skip default AutomaticSize logic for ScrollingFrame
    }

    if (node.decorators.UIListLayout) {
        resolveListLayout(node, contentW, contentH);
    } else if (node.decorators.UIGridLayout) {
        resolveGridLayout(node, contentW, contentH);
    } else {
        for (const child of node.children) {
            resolveNodeSize(child, contentW, contentH);
            child.resolvedX += node.padX;
            child.resolvedY += node.padY;
            applyChildLayout(child);
        }
    }

    // Implement AutomaticSize
    const automaticSize = node.instance.Properties?.AutomaticSize ?? 0; // 0: None, 1: X, 2: Y, 3: XY
    if (automaticSize > 0) {
        let maxChildX = 0;
        let maxChildY = 0;
        for (const child of node.children) {
            const childVisProp = getVisibilityProp(child.instance.ClassName);
            if (child.instance.Properties?.[childVisProp] === false) continue;
            maxChildX = Math.max(
                maxChildX,
                child.resolvedX + child.resolvedWidth,
            );
            maxChildY = Math.max(
                maxChildY,
                child.resolvedY + child.resolvedHeight,
            );
        }

        let padR = 0,
            padB = 0;
        if (node.decorators.UIPadding) {
            const pad = node.decorators.UIPadding;
            padR =
                (pad.PaddingRight?.Scale || 0) * node.resolvedWidth +
                (pad.PaddingRight?.Offset || 0);
            padB =
                (pad.PaddingBottom?.Scale || 0) * node.resolvedHeight +
                (pad.PaddingBottom?.Offset || 0);
        }

        if (automaticSize === 1 || automaticSize === 3) {
            node.resolvedWidth = Math.max(node.resolvedWidth, maxChildX + padR);
        }
        if (automaticSize === 2 || automaticSize === 3) {
            node.resolvedHeight = Math.max(
                node.resolvedHeight,
                maxChildY + padB,
            );
        }
    }
}

function resolveListLayout(node, cw, ch) {
    const layout = node.decorators.UIListLayout;
    const isHorizontal = layout.FillDirection === 0;

    const flexMode = isHorizontal ? layout.HorizontalFlex : layout.VerticalFlex;

    const pad = layout.Padding || { Scale: 0, Offset: 0 };

    let padSize =
        (isHorizontal ? cw : ch) * (pad.Scale || 0) + (pad.Offset || 0);

    if (flexMode === 2 || flexMode === 3 || flexMode === 4) {
        padSize = 0;
    }

    const children = node.children;

    for (const child of children) {
        resolveNodeSize(child, cw, ch);
    }

    let lines = [[]];
    let currentLineSize = 0;

    for (const child of children) {
        const childSize = isHorizontal
            ? child.resolvedWidth
            : child.resolvedHeight;

        if (
            layout.Wraps &&
            currentLineSize + childSize > (isHorizontal ? cw : ch) &&
            lines[lines.length - 1].length > 0
        ) {
            lines.push([]);
            currentLineSize = 0;
        }

        lines[lines.length - 1].push(child);
        currentLineSize += childSize + padSize;
    }

    // -----------------------------
    // FIX 1: COMPUTE TOTAL CROSS SIZE
    // -----------------------------
    const crossAlign = isHorizontal
        ? layout.VerticalAlignment
        : layout.HorizontalAlignment;

    const containerCross = isHorizontal ? ch : cw;

    let totalCrossSize = 0;
    const lineCrossSizes = [];

    for (const line of lines) {
        let maxCross = 0;
        for (const child of line) {
            const cross = isHorizontal
                ? child.resolvedHeight
                : child.resolvedWidth;
            if (cross > maxCross) maxCross = cross;
        }
        lineCrossSizes.push(maxCross);
        totalCrossSize += maxCross + padSize;
    }
    totalCrossSize -= padSize;

    let containerOffset = 0;

    if (crossAlign === 2) {
        containerOffset = containerCross - totalCrossSize;
    } else if (crossAlign === 0) {
        containerOffset = (containerCross - totalCrossSize) / 2;
    }

    let lineOffset = containerOffset;

    // -----------------------------
    // MAIN LOOP
    // -----------------------------
    for (let li = 0; li < lines.length; li++) {
        const line = lines[li];

        const lineSize = layout.Wraps
            ? lineCrossSizes[li]
            : isHorizontal
              ? ch
              : cw;

        let lineMainSize = 0;
        for (const child of line) {
            lineMainSize += isHorizontal
                ? child.resolvedWidth
                : child.resolvedHeight;
        }

        lineMainSize += padSize * Math.max(0, line.length - 1);

        let freeSpace = (isHorizontal ? cw : ch) - lineMainSize;

        const isFill = flexMode === 1;

        let totalGrow = 0;
        let totalShrink = 0;

        for (const child of line) {
            const flexItem = child.decorators.UIFlexItem;

            let grow = 0;
            let shrink = 0;

            if (flexItem) {
                const mode = flexItem.FlexMode ?? 0;

                if (mode === 1) {
                    grow = flexItem.GrowRatio || 1;
                    shrink = flexItem.ShrinkRatio || 1;
                } else if (mode === 2) {
                    grow = 0;
                    shrink = flexItem.ShrinkRatio || 1;
                } else if (mode === 3) {
                    grow = 1;
                    shrink = 1;
                } else if (mode === 4) {
                    grow = flexItem.GrowRatio || 0;
                    shrink = flexItem.ShrinkRatio || 0;
                }
            } else if (isFill) {
                grow = 1;
                shrink = 1;
            }

            child._grow = grow;
            child._shrink = shrink;

            totalGrow += grow;
            totalShrink += shrink;
        }

        if (isFill) {
            const available =
                (isHorizontal ? cw : ch) -
                padSize * Math.max(0, line.length - 1);

            const sizePerChild = line.length > 0 ? available / line.length : 0;

            for (const child of line) {
                if (isHorizontal) child.resolvedWidth = sizePerChild;
                else child.resolvedHeight = sizePerChild;
            }
        } else {
            if (freeSpace > 0 && totalGrow > 0) {
                for (const child of line) {
                    if (child._grow > 0) {
                        const add = freeSpace * (child._grow / totalGrow);
                        if (isHorizontal) child.resolvedWidth += add;
                        else child.resolvedHeight += add;
                    }
                }
            } else if (freeSpace < 0) {
                let effectiveShrink = totalShrink;

                if (effectiveShrink === 0) {
                    effectiveShrink = line.length;
                    for (const child of line) child._shrink = 1;
                }

                for (const child of line) {
                    const sub = (-freeSpace * child._shrink) / effectiveShrink;

                    if (isHorizontal) {
                        child.resolvedWidth = Math.max(
                            0,
                            child.resolvedWidth - sub,
                        );
                    } else {
                        child.resolvedHeight = Math.max(
                            0,
                            child.resolvedHeight - sub,
                        );
                    }
                }
            }
        }

        for (const child of line) {
            applyModifiers(child);
        }

        // recompute main size
        lineMainSize = 0;
        for (const child of line) {
            lineMainSize += isHorizontal
                ? child.resolvedWidth
                : child.resolvedHeight;
        }

        lineMainSize += padSize * Math.max(0, line.length - 1);
        freeSpace = (isHorizontal ? cw : ch) - lineMainSize;

        const mainAlign = isHorizontal
            ? layout.HorizontalAlignment
            : layout.VerticalAlignment;

        let mainStartOffset = 0;

        if (mainAlign === 2) mainStartOffset = freeSpace;
        else if (mainAlign === 0) mainStartOffset = freeSpace / 2;

        if (flexMode === 3 && line.length > 1) mainStartOffset = 0;

        let cursor = mainStartOffset;

        const crossBaseOffset = lineOffset;

        for (let i = 0; i < line.length; i++) {
            const child = line[i];

            if (i > 0) {
                if (flexMode === 3)
                    cursor += freeSpace / Math.max(1, line.length - 1);
                else if (flexMode === 2) cursor += freeSpace / line.length;
                else if (flexMode === 4)
                    cursor += (freeSpace * 2) / (line.length + 1);
            }

            let crossStartOffset = 0;

            const flexItem = child.decorators.UIFlexItem;
            const itemAlign =
                flexItem?.ItemLineAlignment ?? layout.ItemLineAlignment ?? 0;

            const childCross = isHorizontal
                ? child.resolvedHeight
                : child.resolvedWidth;

            if (itemAlign === 2) crossStartOffset = (lineSize - childCross) / 2;
            else if (itemAlign === 3) crossStartOffset = lineSize - childCross;

            const crossFlex = isHorizontal
                ? layout.VerticalFlex
                : layout.HorizontalFlex;

            if (crossFlex === 1) {
                if (isHorizontal) child.resolvedHeight = lineSize;
                else child.resolvedWidth = lineSize;
            }

            applyModifiers(child);

            child.resolvedX =
                (isHorizontal ? cursor : crossBaseOffset + crossStartOffset) +
                node.padX;

            child.resolvedY =
                (isHorizontal ? crossBaseOffset + crossStartOffset : cursor) +
                node.padY;

            applyChildLayout(child);

            cursor +=
                (isHorizontal ? child.resolvedWidth : child.resolvedHeight) +
                padSize;
        }

        lineOffset += lineSize + padSize;
    }
}

function resolveGridLayout(node, cw, ch) {
    const layout = node.decorators.UIGridLayout;
    const isHorizontal = layout.FillDirection === 0;

    const cellSize = layout.CellSize || {
        X: { Scale: 0, Offset: 100 },
        Y: { Scale: 0, Offset: 100 },
    };
    const cellW = cw * (cellSize.X?.Scale || 0) + (cellSize.X?.Offset || 0);
    const cellH = ch * (cellSize.Y?.Scale || 0) + (cellSize.Y?.Offset || 0);

    const pad = layout.CellPadding || {
        X: { Scale: 0, Offset: 5 },
        Y: { Scale: 0, Offset: 5 },
    };
    const padW = cw * (pad.X?.Scale || 0) + (pad.X?.Offset || 0);
    const padH = ch * (pad.Y?.Scale || 0) + (pad.Y?.Offset || 0);

    const cols = Math.max(1, Math.floor((cw + padW) / (cellW + padW)));
    const rows = Math.max(1, Math.floor((ch + padH) / (cellH + padH)));

    const hAlign = layout.HorizontalAlignment;
    const vAlign = layout.VerticalAlignment;

    const gridW = cols * cellW + (cols - 1) * padW;
    const gridH = rows * cellH + (rows - 1) * padH;

    let startX = 0;
    let startY = 0;
    if (hAlign === 0) startX = (cw - gridW) / 2;
    else if (hAlign === 2) startX = cw - gridW;

    if (vAlign === 0) startY = (ch - gridH) / 2;
    else if (vAlign === 2) startY = ch - gridH;

    let col = 0,
        row = 0;
    for (const child of node.children) {
        if (isHorizontal) {
            if (col >= cols) {
                col = 0;
                row++;
            }
        } else {
            if (row >= rows) {
                row = 0;
                col++;
            }
        }

        child.resolvedWidth = cellW;
        child.resolvedHeight = cellH;
        child.resolvedX = startX + col * (cellW + padW) + node.padX;
        child.resolvedY = startY + row * (cellH + padH) + node.padY;

        applyChildLayout(child);

        if (isHorizontal) col++;
        else row++;
    }
}

function resolveLayoutTree(node, parentW, parentH) {
    resolveNodeSize(node, parentW, parentH);
    applyChildLayout(node);
}

// ==========================================
// PASS 3: Render DOM
// ==========================================
function renderDom(node, imageMap, onSelectInstance, instanceToElMap) {
    const instance = node.instance;
    const props = instance.Properties || {};
    const decorators = node.decorators;

    const el = document.createElement('div');
    el.dataset.rovalraPath = node.path || '';

    // Store the element in our map so we can highlight it later
    if (instanceToElMap) instanceToElMap.set(instance, el);

    // Make it clickable and select the instance when clicked
    el.style.cursor = 'pointer';
    el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (onSelectInstance) onSelectInstance(instance, el);
    });

    el.style.boxSizing = 'border-box';
    el.style.position = node.isRoot ? 'relative' : 'absolute';
    el.style.display = 'block';

    const automaticSize = props.AutomaticSize ?? 0;
    const isText = ['TextLabel', 'TextButton', 'TextBox'].includes(
        instance.ClassName,
    );

    // Implement AutomaticSize visually
    if (isText && automaticSize > 0 && props.TextTruncate === 0) {
        if (automaticSize === 1 || automaticSize === 3) {
            el.style.minWidth = `${Math.max(0, node.resolvedWidth)}px`;
            el.style.width = 'fit-content';
        } else {
            el.style.width = `${Math.max(0, node.resolvedWidth)}px`;
        }
        if (automaticSize === 2 || automaticSize === 3) {
            el.style.minHeight = `${Math.max(0, node.resolvedHeight)}px`;
            el.style.height = 'fit-content';
        } else {
            el.style.height = `${Math.max(0, node.resolvedHeight)}px`;
        }
    } else {
        el.style.width = `${Math.max(0, node.resolvedWidth)}px`;
        el.style.height = `${Math.max(0, node.resolvedHeight)}px`;
    }

    const transparency =
        typeof props.BackgroundTransparency === 'number'
            ? props.BackgroundTransparency
            : 1;

    // Visual transparency for click-through
    let isVisuallyTransparent = transparency >= 1;

    if (['ImageLabel', 'ImageButton'].includes(instance.ClassName)) {
        const imgTransparency =
            typeof props.ImageTransparency === 'number'
                ? props.ImageTransparency
                : 1;
        if (imgTransparency < 1) isVisuallyTransparent = false;
    }
    if (['TextLabel', 'TextButton', 'TextBox'].includes(instance.ClassName)) {
        const textTransparency =
            typeof props.TextTransparency === 'number'
                ? props.TextTransparency
                : 1;
        if (
            textTransparency < 1 &&
            typeof props.Text === 'string' &&
            props.Text.length > 0
        ) {
            isVisuallyTransparent = false;
        }
    }
    if (decorators.UIStroke && decorators.UIStroke.Enabled !== false) {
        const strokeTransparency =
            typeof decorators.UIStroke.Transparency === 'number'
                ? decorators.UIStroke.Transparency
                : 1;
        if (strokeTransparency < 1) isVisuallyTransparent = false;
    }

    // Explicitly set pointerEvents to auto or none to prevent inheritance issues
    if (isVisuallyTransparent && instance.ClassName !== 'ScrollingFrame') {
        el.style.pointerEvents = 'none';
    } else {
        el.style.pointerEvents = 'auto';
    }

    if (!node.isRoot) {
        el.style.left = `${node.resolvedX}px`;
        el.style.top = `${node.resolvedY}px`;

        if (props.AnchorPoint) {
            el.style.transformOrigin = `${(props.AnchorPoint.x || 0) * 100}% ${(props.AnchorPoint.y || 0) * 100}%`;
        } else {
            el.style.transformOrigin = '0px 0px';
        }

        let transform = '';
        if (typeof props.Rotation === 'number' && props.Rotation !== 0) {
            transform += ` rotate(${props.Rotation}deg)`;
        }
        if (decorators.UIScale) {
            const scale = decorators.UIScale.Scale ?? 1;
            if (scale !== 1) {
                transform += ` scale(${scale})`;
            }
        }
        if (transform) el.style.transform = transform.trim();
    }

    if (typeof props.ZIndex === 'number') {
        el.style.zIndex = props.ZIndex;
    }

    const supportsUIGradient =
        instance.ClassName !== 'TextBox' &&
        instance.ClassName !== 'ScrollingFrame';
    const hasUIGradient =
        supportsUIGradient &&
        decorators.UIGradient &&
        decorators.UIGradient.Enabled !== false;

    if (transparency < 1) {
        if (hasUIGradient) {
            const g = decorators.UIGradient;
            el.style.backgroundImage = buildUIGradient(
                g,
                props.BackgroundColor3,
                transparency,
            );
            const posX = 50 + (g.Offset?.x || 0) * 100;
            const posY = 50 + (g.Offset?.y || 0) * 100;
            el.style.backgroundPosition = `${posX}% ${posY}%`;
        } else {
            el.style.backgroundColor = robloxColorToCss(
                props.BackgroundColor3,
                1 - transparency,
            );
        }
    }

    const shadows = [];

    // Implement BorderMode and BorderSizePixel properly
    const borderSize = props.BorderSizePixel ?? 1;
    if (borderSize > 0) {
        const borderColor = props.BorderColor3 || {
            r: 0.105882,
            g: 0.164706,
            b: 0.203922,
        };
        const borderMode = props.BorderMode ?? 0; // 0: Outline, 1: Middle, 2: Inset
        const shadowColor = robloxColorToCss(borderColor, 1 - transparency);
        if (shadowColor) {
            if (borderMode === 0) {
                shadows.push(`0 0 0 ${borderSize}px ${shadowColor}`);
            } else if (borderMode === 1) {
                shadows.push(
                    `0 0 0 ${borderSize / 2}px ${shadowColor}, inset 0 0 0 ${borderSize / 2}px ${shadowColor}`,
                );
            } else {
                shadows.push(`inset 0 0 0 ${borderSize}px ${shadowColor}`);
            }
        }
    }

    if (decorators.UIShadow && decorators.UIShadow.Enabled !== false) {
        const s = decorators.UIShadow;
        const minDim = Math.min(node.resolvedWidth, node.resolvedHeight);
        const blur =
            (s.BlurRadius?.Scale || 0) * minDim + (s.BlurRadius?.Offset || 0);
        const offX =
            (s.Offset?.X?.Scale || 0) * node.resolvedWidth +
            (s.Offset?.X?.Offset || 0);
        const offY =
            (s.Offset?.Y?.Scale || 0) * node.resolvedHeight +
            (s.Offset?.Y?.Offset || 0);
        const spread =
            (s.Spread?.X?.Scale || 0) * node.resolvedWidth +
            (s.Spread?.X?.Offset || 0);
        const color = robloxColorToCss(s.Color, 1 - (s.Transparency || 0));
        if (color)
            shadows.push(`${offX}px ${offY}px ${blur}px ${spread}px ${color}`);
    }

    let textStrokeWidth = null;
    let textStrokeColor = null;
    if (decorators.UIStroke && decorators.UIStroke.Enabled !== false) {
        const s = decorators.UIStroke;
        const thickness = s.Thickness || 1;
        const color =
            robloxColorToCss(s.Color, 1 - (s.Transparency || 0)) || '#000';
        const pos = s.BorderStrokePosition;
        const isTextEl = ['TextLabel', 'TextButton', 'TextBox'].includes(
            instance.ClassName,
        );

        if (isTextEl && s.ApplyStrokeMode === 0) {
            textStrokeWidth = `${thickness * 2}px`;
            textStrokeColor = color;
        } else {
            if (pos === 2) shadows.push(`inset 0 0 0 ${thickness}px ${color}`);
            else if (pos === 0) shadows.push(`0 0 0 ${thickness}px ${color}`);
            else
                shadows.push(
                    `0 0 0 ${thickness / 2}px ${color}, inset 0 0 0 ${thickness / 2}px ${color}`,
                );
        }
    }

    if (shadows.length > 0) {
        el.style.boxShadow = shadows.join(', ');
    }

    if (decorators.UICorner) {
        const c = decorators.UICorner;
        const getRad = (udim) => {
            if (!udim) return 0;
            return (
                (udim.Scale || 0) *
                    Math.min(node.resolvedWidth, node.resolvedHeight) +
                (udim.Offset || 0)
            );
        };
        const tl = getRad(c.TopLeftRadius || c.CornerRadius);
        const tr = getRad(c.TopRightRadius || c.CornerRadius);
        const br = getRad(c.BottomRightRadius || c.CornerRadius);
        const bl = getRad(c.BottomLeftRadius || c.CornerRadius);
        el.style.borderRadius = `${tl}px ${tr}px ${br}px ${bl}px`;
    }

    if (props.ClipsDescendants === true) {
        el.style.overflow = 'hidden';
    }

    // --- ScrollingFrame DOM Render Logic ---
    const isScrollingFrame = instance.ClassName === 'ScrollingFrame';
    let childContainer = el;

    if (isScrollingFrame) {
        const scrollDir = props.ScrollingDirection ?? 1; // 0: X, 1: Y, 2: XY
        if (scrollDir === 1) {
            el.style.overflowX = 'auto';
            el.style.overflowY = 'hidden';

            // Custom smooth scrolling to prevent stutter on rapid wheel events
            let targetScroll = el.scrollLeft;
            let isAnimating = false;

            const animateScroll = () => {
                const current = el.scrollLeft;
                const diff = targetScroll - current;

                // If we are close enough to the target, snap to it and stop animating
                if (Math.abs(diff) < 0.5) {
                    el.scrollLeft = targetScroll;
                    isAnimating = false;
                    return;
                }

                // Lerp (move 20% of the remaining distance per frame for a smooth glide)
                el.scrollLeft += diff * 0.2;
                requestAnimationFrame(animateScroll);
            };

            el.addEventListener(
                'wheel',
                (e) => {
                    // Translate vertical wheel movement to horizontal scrolling
                    if (e.deltaY !== 0 && e.deltaX === 0) {
                        e.preventDefault();
                        targetScroll += e.deltaY;

                        // Clamp the target so it doesn't scroll past the bounds
                        const maxScroll = el.scrollWidth - el.clientWidth;
                        targetScroll = Math.max(
                            0,
                            Math.min(targetScroll, maxScroll),
                        );

                        // Start the animation loop if it isn't already running
                        if (!isAnimating) {
                            isAnimating = true;
                            requestAnimationFrame(animateScroll);
                        }
                    } else {
                        // Sync target if the user scrolls natively (e.g. trackpad horizontal swipe)
                        targetScroll = el.scrollLeft;
                    }
                },
                { passive: false },
            );

            // Sync target if the user drags the scrollbar manually
            el.addEventListener('scroll', () => {
                if (!isAnimating) {
                    targetScroll = el.scrollLeft;
                }
            });
        } else if (scrollDir === 2) {
            el.style.overflowX = 'hidden';
            el.style.overflowY = 'auto';
        } else {
            el.style.overflow = 'auto';
        }

        // Apply scrollbar thickness logic
        if (props.ScrollBarThickness === 0) {
            el.style.scrollbarWidth = 'none'; // Firefox
            el.classList.add('rovalra-no-scrollbar');
        } else {
            el.style.scrollbarWidth = 'thin';
            el.classList.add('rovalra-explorer-scrolling-frame');
        }

        // Create an inner canvas wrapper to handle scrolling properly
        const canvasEl = document.createElement('div');
        canvasEl.style.position = 'absolute';
        canvasEl.style.top = '0';
        canvasEl.style.left = '0';
        canvasEl.style.width = `${node.canvasWidth || node.resolvedWidth}px`;
        canvasEl.style.height = `${node.canvasHeight || node.resolvedHeight}px`;
        canvasEl.style.pointerEvents = 'none'; // Let children handle clicks, but allow wheel events to pass to el
        el.appendChild(canvasEl);
        childContainer = canvasEl;
    }

    if (isText) {
        el.style.display = 'flex';
        const textXAlignment = resolveTextXAlignment(props.TextXAlignment);
        const textYAlignment = resolveTextYAlignment(props.TextYAlignment);
        el.style.alignItems =
            textYAlignment === 'top'
                ? 'flex-start'
                : textYAlignment === 'bottom'
                  ? 'flex-end'
                  : 'center';
        el.style.justifyContent =
            textXAlignment === 'left'
                ? 'flex-start'
                : textXAlignment === 'right'
                  ? 'flex-end'
                  : 'center';
        el.style.padding = `${ROBLOX_TEXT_PADDING}px`;
        el.style.overflow = 'hidden';

        const textSpan = document.createElement('span');
        textSpan.style.display = 'inline-block';
        textSpan.style.boxSizing = 'border-box';
        textSpan.style.maxWidth = '100%';
        textSpan.style.maxHeight = '100%';
        textSpan.style.textAlign = textXAlignment;

        let textContent = typeof props.Text === 'string' ? props.Text : '';

        if (
            props.RichText !== true &&
            typeof props.MaxVisibleGraphemes === 'number' &&
            props.MaxVisibleGraphemes >= 0
        ) {
            textContent = Array.from(textContent)
                .slice(0, props.MaxVisibleGraphemes)
                .join('');
        }

        const isRich = props.RichText === true;
        if (isRich) {
            appendRichText(textSpan, textContent);
        } else {
            textSpan.textContent = textContent;
        }

        const textTransparency =
            typeof props.TextTransparency === 'number'
                ? props.TextTransparency
                : 0;
        const textColor = props.TextColor3 || { r: 1, g: 1, b: 1 };
        textSpan.style.color = robloxColorToCss(
            textColor,
            1 - textTransparency,
        );

        const fontFace = props.FontFace;
        let fontFamily = 'sans-serif';
        let fontWeight = 'normal';
        let fontStyle = 'normal';

        if (fontFace && fontFace.Family) {
            fontFamily = fontFamilyMap.get(fontFace.Family) || 'sans-serif';
            if (typeof fontFace.Weight === 'number')
                fontWeight = fontFace.Weight;
            if (typeof fontFace.Style === 'number') {
                const styles = ['normal', 'italic', 'oblique'];
                if (styles[fontFace.Style]) fontStyle = styles[fontFace.Style];
            }
        } else if (typeof props.Font === 'number') {
            fontFamily = ROBLOX_FONT_ENUM_MAP[props.Font] || 'sans-serif';
        }
        textSpan.style.fontFamily = fontFamily;
        textSpan.style.fontWeight = fontWeight;
        textSpan.style.fontStyle = fontStyle;

        const otf = parseOpenTypeFeatures(props.OpenTypeFeatures);
        if (otf) textSpan.style.fontFeatureSettings = otf;

        let fontSize = props.TextSize || 14;
        const lineHeight =
            typeof props.LineHeight === 'number' ? props.LineHeight : 1;
        if (decorators.UITextSizeConstraint && props.TextScaled !== true) {
            const minT = decorators.UITextSizeConstraint.MinTextSize || 1;
            const maxT = decorators.UITextSizeConstraint.MaxTextSize || 1000;
            fontSize = Math.max(minT, Math.min(maxT, fontSize));
        }

        if (props.TextScaled === true) {
            textSpan.style.whiteSpace = 'pre-wrap';
            textSpan.style.wordBreak = 'break-word';
            textSpan.style.width = '100%';
            textSpan.style.flex = '0 0 100%';
            textSpan.style.display = 'block';

            let maxT = 100;
            let minT = 1;
            if (decorators.UITextSizeConstraint) {
                maxT = Math.min(
                    100,
                    decorators.UITextSizeConstraint.MaxTextSize || 100,
                );
                minT = decorators.UITextSizeConstraint.MinTextSize || 1;
            }

            const textPadding = ROBLOX_TEXT_PADDING * 2;
            const innerWidth =
                node.resolvedWidth - textPadding > 0
                    ? node.resolvedWidth - textPadding
                    : 0;
            const innerHeight =
                node.resolvedHeight - textPadding > 0
                    ? node.resolvedHeight - textPadding
                    : 0;

            const measureText = isRich
                ? textSpan.textContent || textContent
                : textContent;

            fontSize = calculateOptimalFontSize(
                innerWidth,
                innerHeight,
                measureText,
                fontFamily,
                fontWeight,
                fontStyle,
                maxT,
                minT,
            );
        } else {
            if (props.TextWrapped === true) {
                if (automaticSize === 2 || automaticSize === 3) {
                    textSpan.style.whiteSpace = 'pre-wrap';
                    textSpan.style.wordBreak = 'break-word';
                    textSpan.style.width = '100%';
                } else {
                    textSpan.style.whiteSpace = 'pre';
                    textSpan.style.overflow = 'visible';
                }
            } else {
                textSpan.style.whiteSpace = 'pre';
                if (automaticSize > 0 && props.TextTruncate === 0) {
                    textSpan.style.overflow = 'visible';
                } else if (props.TextTruncate === 1) {
                    textSpan.style.width = '100%';
                    textSpan.style.overflow = 'hidden';
                    textSpan.style.textOverflow = 'ellipsis';
                } else if (props.TextTruncate === 2) {
                    textSpan.style.width = '100%';
                    textSpan.style.overflow = 'hidden';
                }
            }
        }
        textSpan.style.fontSize = `${fontSize}px`;
        textSpan.style.lineHeight = String(lineHeight);

        if (typeof props.TextDirection === 'number') {
            if (props.TextDirection === 2) textSpan.style.direction = 'rtl';
            else textSpan.style.direction = 'ltr';
        }

        if (
            typeof props.TextStrokeTransparency === 'number' &&
            props.TextStrokeTransparency < 1 &&
            !textStrokeWidth
        ) {
            const strokeColor = props.TextStrokeColor3 || { r: 0, g: 0, b: 0 };
            const strokeAlpha = 1 - props.TextStrokeTransparency;
            const cssColor = robloxColorToCss(strokeColor, strokeAlpha);
            const w = 1;
            textSpan.style.textShadow = `${w}px ${w}px 0 ${cssColor}, ${-w}px ${-w}px 0 ${cssColor}, ${w}px ${-w}px 0 ${cssColor}, ${-w}px ${w}px 0 ${cssColor}`;
        }

        if (hasUIGradient) {
            const g = decorators.UIGradient;
            textSpan.style.backgroundColor = robloxColorToCss(
                textColor,
                1 - textTransparency,
            );
            textSpan.style.color = 'transparent';
            textSpan.style.webkitTextFillColor = 'transparent';
            textSpan.style.backgroundImage = buildUIGradient(g);
            textSpan.style.webkitBackgroundClip = 'text';
            textSpan.style.backgroundClip = 'text';
            textSpan.style.backgroundBlendMode = 'multiply';
            const posX = 50 + (g.Offset?.x || 0) * 100;
            const posY = 50 + (g.Offset?.y || 0) * 100;
            textSpan.style.backgroundPosition = `${posX}% ${posY}%`;
        }

        if (textStrokeWidth) {
            const textWrapper = document.createElement('span');
            textWrapper.style.display = 'inline-block';
            textWrapper.style.position = 'relative';
            textWrapper.style.maxWidth = '100%';
            textWrapper.style.maxHeight = '100%';
            textWrapper.style.boxSizing = 'border-box';
            textWrapper.style.textAlign = textXAlignment;

            textSpan.style.display = 'block';
            textSpan.style.position = 'relative';
            textSpan.style.zIndex = '1';

            const strokeSpan = document.createElement('span');
            strokeSpan.style.display = 'block';
            strokeSpan.style.position = 'absolute';
            strokeSpan.style.top = '0';
            strokeSpan.style.left = '0';
            strokeSpan.style.width = '100%';
            strokeSpan.style.height = '100%';
            strokeSpan.style.pointerEvents = 'none';
            strokeSpan.style.boxSizing = 'border-box';
            strokeSpan.style.textAlign = textXAlignment;

            strokeSpan.style.fontFamily = textSpan.style.fontFamily;
            strokeSpan.style.fontWeight = textSpan.style.fontWeight;
            strokeSpan.style.fontStyle = textSpan.style.fontStyle;
            strokeSpan.style.fontSize = textSpan.style.fontSize;
            strokeSpan.style.lineHeight = textSpan.style.lineHeight;
            strokeSpan.style.whiteSpace = textSpan.style.whiteSpace;
            strokeSpan.style.wordBreak = textSpan.style.wordBreak;
            strokeSpan.style.width = textSpan.style.width;
            strokeSpan.style.flex = textSpan.style.flex;
            strokeSpan.style.direction = textSpan.style.direction;
            strokeSpan.style.fontFeatureSettings =
                textSpan.style.fontFeatureSettings;

            strokeSpan.style.color = 'transparent';
            strokeSpan.style.webkitTextFillColor = 'transparent';
            strokeSpan.style.webkitTextStroke = `${textStrokeWidth} ${textStrokeColor}`;

            if (isRich) {
                strokeSpan.replaceChildren(
                    ...Array.from(textSpan.childNodes, (child) =>
                        child.cloneNode(true),
                    ),
                );
            } else {
                strokeSpan.textContent = textContent;
            }

            textWrapper.appendChild(textSpan);
            textWrapper.appendChild(strokeSpan);
            el.appendChild(textWrapper);
        } else {
            el.appendChild(textSpan);
        }
    }

    if (['ImageLabel', 'ImageButton'].includes(instance.ClassName)) {
        let imgUri = props.Image;
        if (!imgUri && props.ImageContent) {
            if (typeof props.ImageContent === 'string')
                imgUri = props.ImageContent;
            else if (
                typeof props.ImageContent === 'object' &&
                props.ImageContent.id
            )
                imgUri = String(props.ImageContent.id);
        }

        if (typeof imgUri === 'string') {
            const m = imgUri.match(/(\d+)/);
            if (m) {
                const assetId = m[0];
                const imageUrl = imageMap.get(assetId);
                if (imageUrl) {
                    const imgTransparency =
                        typeof props.ImageTransparency === 'number'
                            ? props.ImageTransparency
                            : 0;
                    const imgColor = props.ImageColor3 || { r: 1, g: 1, b: 1 };
                    const scaleType = props.ScaleType ?? 0;
                    const resampleMode = props.ResampleMode ?? 0;
                    const rectOffset = props.ImageRectOffset;
                    const rectSize = props.ImageRectSize;

                    const isSpriteSheet =
                        rectOffset &&
                        rectSize &&
                        (rectSize.x !== 0 || rectSize.y !== 0);
                    const isSliced = scaleType === 1 && props.SliceCenter;
                    const isTiled = scaleType === 2;

                    const filter = getTintFilter(imgColor);
                    const imageRendering =
                        resampleMode === 1 ? 'pixelated' : 'auto';

                    const useSimpleImg =
                        !isSliced && !isSpriteSheet && !isTiled;

                    if (useSimpleImg) {
                        const img = document.createElement('img');
                        img.src = imageUrl;
                        img.style.width = '100%';
                        img.style.height = '100%';
                        if (scaleType === 3)
                            img.style.objectFit = 'contain'; // Fit
                        else if (scaleType === 4)
                            img.style.objectFit = 'cover'; // Crop
                        else img.style.objectFit = 'fill'; // 0 = Stretch
                        img.style.pointerEvents = 'none';
                        img.style.position = 'absolute';
                        img.style.top = '0';
                        img.style.left = '0';
                        img.style.opacity = 1 - imgTransparency;
                        img.style.imageRendering = imageRendering;
                        img.style.borderRadius = el.style.borderRadius;
                        if (filter) img.style.filter = filter;
                        el.appendChild(img);

                        if (hasUIGradient) {
                            const g = decorators.UIGradient;
                            const gradDiv = document.createElement('div');
                            gradDiv.style.position = 'absolute';
                            gradDiv.style.top = '0';
                            gradDiv.style.left = '0';
                            gradDiv.style.width = '100%';
                            gradDiv.style.height = '100%';
                            gradDiv.style.backgroundImage = buildUIGradient(g);
                            gradDiv.style.mixBlendMode = 'multiply';
                            gradDiv.style.webkitMaskImage = `url("${imageUrl}")`;
                            gradDiv.style.maskImage = `url("${imageUrl}")`;
                            gradDiv.style.maskSize = img.style.objectFit;
                            gradDiv.style.webkitMaskSize = img.style.objectFit;
                            gradDiv.style.maskRepeat = 'no-repeat';
                            gradDiv.style.webkitMaskRepeat = 'no-repeat';
                            gradDiv.style.pointerEvents = 'none';
                            gradDiv.style.borderRadius = el.style.borderRadius;
                            const posX = 50 + (g.Offset?.x || 0) * 100;
                            const posY = 50 + (g.Offset?.y || 0) * 100;
                            gradDiv.style.backgroundPosition = `${posX}% ${posY}%`;
                            el.appendChild(gradDiv);
                        }
                    } else {
                        const bgDiv = document.createElement('div');
                        bgDiv.style.position = 'absolute';
                        bgDiv.style.top = '0';
                        bgDiv.style.left = '0';
                        bgDiv.style.width = '100%';
                        bgDiv.style.height = '100%';
                        bgDiv.style.pointerEvents = 'none';
                        bgDiv.style.opacity = 1 - imgTransparency;
                        bgDiv.style.imageRendering = imageRendering;
                        bgDiv.style.borderRadius = el.style.borderRadius;
                        bgDiv.style.transformOrigin = 'center center';
                        if (filter) bgDiv.style.filter = filter;

                        el.appendChild(bgDiv);

                        let gradDiv = null;
                        if (hasUIGradient) {
                            const g = decorators.UIGradient;
                            gradDiv = document.createElement('div');
                            gradDiv.style.position = 'absolute';
                            gradDiv.style.top = '0';
                            gradDiv.style.left = '0';
                            gradDiv.style.width = '100%';
                            gradDiv.style.height = '100%';
                            gradDiv.style.backgroundImage = buildUIGradient(g);
                            gradDiv.style.mixBlendMode = 'multiply';
                            gradDiv.style.pointerEvents = 'none';
                            gradDiv.style.borderRadius = el.style.borderRadius;
                            gradDiv.style.transformOrigin = 'center center';
                            const posX = 50 + (g.Offset?.x || 0) * 100;
                            const posY = 50 + (g.Offset?.y || 0) * 100;
                            gradDiv.style.backgroundPosition = `${posX}% ${posY}%`;
                            el.appendChild(gradDiv);
                        }

                        const applyBgStyles = (natW, natH) => {
                            if (isSliced) {
                                const slice = props.SliceCenter;
                                const sliceScale = props.SliceScale || 1;

                                let top = slice.Min.y;
                                let left = slice.Min.x;
                                let right = natW - slice.Max.x;
                                let bottom = natH - slice.Max.y;

                                const midW = natW - left - right;
                                const midH = natH - top - bottom;

                                if (midW <= 0) {
                                    if (left >= right)
                                        left = Math.max(0, left - 1);
                                    else right = Math.max(0, right - 1);
                                }
                                if (midH <= 0) {
                                    if (top >= bottom)
                                        top = Math.max(0, top - 1);
                                    else bottom = Math.max(0, bottom - 1);
                                }

                                bgDiv.style.borderStyle = 'solid';
                                bgDiv.style.borderImageSource = `url("${imageUrl}")`;
                                bgDiv.style.borderImageSlice = `${top} ${right} ${bottom} ${left} fill`;
                                bgDiv.style.borderImageWidth = `${top * sliceScale}px ${right * sliceScale}px ${bottom * sliceScale}px ${left * sliceScale}px`;
                                bgDiv.style.borderImageRepeat = 'stretch';
                                bgDiv.style.backgroundImage = 'none';
                                bgDiv.style.transform = 'none';

                                if (gradDiv) {
                                    gradDiv.style.webkitMaskImage = `url("${imageUrl}")`;
                                    gradDiv.style.maskImage = `url("${imageUrl}")`;
                                    gradDiv.style.webkitMaskSize = '100% 100%';
                                    gradDiv.style.maskSize = '100% 100%';
                                    gradDiv.style.webkitMaskPosition = '0 0';
                                    gradDiv.style.maskPosition = '0 0';
                                    gradDiv.style.webkitMaskRepeat =
                                        'no-repeat';
                                    gradDiv.style.maskRepeat = 'no-repeat';
                                    gradDiv.style.transform = 'none';
                                }
                                return;
                            }

                            let x1 = 0,
                                y1 = 0;
                            let absW = natW,
                                absH = natH;
                            let flipX = 1,
                                flipY = 1;

                            if (isSpriteSheet) {
                                x1 = rectOffset.x;
                                y1 = rectOffset.y;

                                absW = rectSize.x;
                                absH = rectSize.y;

                                if (absW < 0) {
                                    flipX = -1;
                                    absW = Math.abs(absW);
                                    x1 = rectOffset.x + rectSize.x;
                                }

                                if (absH < 0) {
                                    flipY = -1;
                                    absH = Math.abs(absH);
                                    y1 = rectOffset.y + rectSize.y;
                                }

                                flipX = rectSize.x < 0 ? -1 : 1;
                                flipY = rectSize.y < 0 ? -1 : 1;

                                const virtualW = Math.max(1024, natW);
                                const virtualH = Math.max(1024, natH);

                                if (absW === 0) {
                                    absW = virtualW;
                                    x1 = 0;
                                }

                                if (absH === 0) {
                                    absH = virtualH;
                                    y1 = 0;
                                }

                                natW = virtualW;
                                natH = virtualH;
                            }

                            let scaleX, scaleY;
                            let bgX, bgY;
                            let repeat = 'no-repeat';

                            if (scaleType === 3) {
                                const scale = Math.min(
                                    node.resolvedWidth / absW,
                                    node.resolvedHeight / absH,
                                );
                                scaleX = scale;
                                scaleY = scale;
                                const visW = absW * scale;
                                const visH = absH * scale;
                                bgX =
                                    (node.resolvedWidth - visW) / 2 -
                                    x1 * scale;
                                bgY =
                                    (node.resolvedHeight - visH) / 2 -
                                    y1 * scale;
                            } else if (scaleType === 4) {
                                const scale = Math.max(
                                    node.resolvedWidth / absW,
                                    node.resolvedHeight / absH,
                                );
                                scaleX = scale;
                                scaleY = scale;
                                const visW = absW * scale;
                                const visH = absH * scale;
                                bgX =
                                    (node.resolvedWidth - visW) / 2 -
                                    x1 * scale;
                                bgY =
                                    (node.resolvedHeight - visH) / 2 -
                                    y1 * scale;
                            } else if (isTiled) {
                                const tile = props.TileSize || {
                                    X: { Scale: 1, Offset: 0 },
                                    Y: { Scale: 1, Offset: 0 },
                                };
                                const tileW =
                                    node.resolvedWidth * (tile.X?.Scale || 0) +
                                    (tile.X?.Offset || 0);
                                const tileH =
                                    node.resolvedHeight * (tile.Y?.Scale || 0) +
                                    (tile.Y?.Offset || 0);
                                scaleX = tileW / absW;
                                scaleY = tileH / absH;
                                bgX = -(x1 * scaleX);
                                bgY = -(y1 * scaleY);
                                repeat = 'repeat';
                            } else {
                                scaleX = node.resolvedWidth / absW;
                                scaleY = node.resolvedHeight / absH;
                                bgX = -(x1 * scaleX);
                                bgY = -(y1 * scaleY);
                            }

                            const renderNatW =
                                isSpriteSheet && natW < 1024 ? 1024 : natW;
                            const renderNatH =
                                isSpriteSheet && natH < 1024 ? 1024 : natH;

                            const bgW = renderNatW * scaleX;
                            const bgH = renderNatH * scaleY;

                            bgDiv.style.borderImageSource = '';
                            bgDiv.style.borderStyle = 'none';
                            bgDiv.style.backgroundImage = `url("${imageUrl}")`;
                            bgDiv.style.backgroundSize = `${bgW}px ${bgH}px`;
                            bgDiv.style.backgroundPosition = `${bgX}px ${bgY}px`;
                            bgDiv.style.backgroundRepeat = repeat;

                            if (flipX === -1 || flipY === -1) {
                                bgDiv.style.transform = `scale(${flipX}, ${flipY})`;
                            } else {
                                bgDiv.style.transform = 'none';
                            }

                            if (gradDiv) {
                                gradDiv.style.webkitMaskImage = `url("${imageUrl}")`;
                                gradDiv.style.maskImage = `url("${imageUrl}")`;
                                gradDiv.style.webkitMaskSize = `${bgW}px ${bgH}px`;
                                gradDiv.style.maskSize = `${bgW}px ${bgH}px`;
                                gradDiv.style.webkitMaskPosition = `${bgX}px ${bgY}px`;
                                gradDiv.style.maskPosition = `${bgX}px ${bgY}px`;
                                gradDiv.style.webkitMaskRepeat = repeat;
                                gradDiv.style.maskRepeat = repeat;
                            }
                        };

                        const tempImg = new Image();
                        tempImg.onload = () => {
                            applyBgStyles(
                                tempImg.naturalWidth,
                                tempImg.naturalHeight,
                            );
                        };
                        tempImg.onerror = () => applyBgStyles(100, 100);
                        tempImg.src = imageUrl;
                    }
                }
            }
        }
    }

    if (node.children && node.children.length > 0) {
        for (const childNode of node.children) {
            const childEl = renderDom(
                childNode,
                imageMap,
                onSelectInstance,
                instanceToElMap,
            );
            if (childEl) childContainer.appendChild(childEl); // Changed from el.appendChild
        }
    }

    return el;
}

// ==========================================
// GUI Viewer Setup
// ==========================================

function collectImageIds(instance, ids = [], originalIds = []) {
    if (!instance) return { ids, originalIds };
    if (['ImageLabel', 'ImageButton'].includes(instance.ClassName)) {
        let imgUri = instance.Properties?.Image;
        if (!imgUri && instance.Properties?.ImageContent) {
            if (typeof instance.Properties.ImageContent === 'string')
                imgUri = instance.Properties.ImageContent;
            else if (
                typeof instance.Properties.ImageContent === 'object' &&
                instance.Properties.ImageContent.id
            )
                imgUri = String(instance.Properties.ImageContent.id);
        }

        if (typeof imgUri === 'string') {
            const m = imgUri.match(/(\d+)/);
            if (m) {
                const id = m[0];
                const rectOffset = instance.Properties?.ImageRectOffset;
                const rectSize = instance.Properties?.ImageRectSize;
                const sliceCenter = instance.Properties?.SliceCenter;
                const scaleType = instance.Properties?.ScaleType ?? 0;

                const needsOriginal =
                    (rectOffset &&
                        rectSize &&
                        (rectSize.x !== 0 || rectSize.y !== 0)) ||
                    (scaleType === 1 && sliceCenter);

                if (needsOriginal) {
                    if (!originalIds.includes(id)) originalIds.push(id);
                } else {
                    if (!ids.includes(id)) ids.push(id);
                }
            }
        }
    }
    if (instance.Children) {
        for (const child of instance.Children) {
            collectImageIds(child, ids, originalIds);
        }
    }
    return { ids, originalIds };
}

async function fetchImageUrls(assetIds, originalAssetIds) {
    const imageMap = new Map();

    if (assetIds.length > 0) {
        for (let i = 0; i < assetIds.length; i += 100) {
            const chunk = assetIds.slice(i, i + 100);
            const endpoint = `/v1/assets?assetIds=${chunk.join(',')}&size=420x420&format=Png`;
            try {
                const res = await callRobloxApiJson({
                    subdomain: 'thumbnails',
                    endpoint: endpoint,
                    method: 'GET',
                });
                if (res?.data) {
                    for (const item of res.data) {
                        if (item.state === 'Completed' && item.imageUrl) {
                            imageMap.set(String(item.targetId), item.imageUrl);
                        }
                    }
                }
            } catch (e) {
                console.warn(
                    '[RoValra Explorer] Failed to fetch image thumbnails batch:',
                    e,
                );
            }
        }
    }

    for (const id of originalAssetIds) {
        imageMap.set(id, `https://assetdelivery.roblox.com/v1/asset/?id=${id}`);
    }

    return imageMap;
}

async function openGuiViewer(
    instance,
    wrapper,
    previewPane,
    onSelectInstance,
    registerHighlightCallback,
    registerRerenderCallback,
) {
    previewPane.replaceChildren();
    previewPane.style.display = 'flex';
    previewPane.style.flexDirection = 'column';

    let parent = wrapper.parentElement;
    let originalModalWidth = '';
    let originalModalMaxWidth = '';
    while (parent && parent !== document.body) {
        const computedMaxWidth = getComputedStyle(parent).maxWidth;
        if (computedMaxWidth && computedMaxWidth !== 'none') {
            originalModalWidth = parent.style.width;
            originalModalMaxWidth = parent.style.maxWidth;
            parent.style.maxWidth = '95vw';
            parent.style.width = '1400px';
            break;
        }
        parent = parent.parentElement;
    }

    const toolbar = document.createElement('div');
    toolbar.className = 'rovalra-explorer-gui-toolbar';
    toolbar.style.display = 'flex';
    toolbar.style.gap = '8px';
    toolbar.style.padding = '8px';
    toolbar.style.borderBottom = '1px solid var(--rovalra-exp-border)';
    toolbar.style.flexShrink = '0';
    toolbar.style.alignItems = 'center';
    toolbar.style.background = 'var(--rovalra-exp-header)';
    toolbar.style.color = 'var(--rovalra-exp-text)';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'rovalra-explorer-source-btn';
    closeBtn.textContent = ts('createRoblox.explorer.closePreview');
    closeBtn.style.marginRight = 'auto';
    closeBtn.addEventListener('click', () => {
        previewPane.replaceChildren();
        previewPane.style.display = 'none';

        if (registerHighlightCallback) registerHighlightCallback(null);
        if (registerRerenderCallback) registerRerenderCallback(null);

        let p = wrapper.parentElement;
        while (p && p !== document.body) {
            if (p.style.width === '1400px') {
                p.style.width = originalModalWidth;
                p.style.maxWidth = originalModalMaxWidth;
                break;
            }
            p = p.parentElement;
        }
    });
    toolbar.appendChild(closeBtn);

    const select = document.createElement('select');
    select.className = 'rovalra-explorer-device-select';

    const defaultOpt = document.createElement('option');
    defaultOpt.value = 'default';
    defaultOpt.textContent = ts('createRoblox.explorer.defaultDevice');
    select.appendChild(defaultOpt);

    const grouped = {};
    DEFAULT_DEVICES.forEach((d, i) => {
        if (!grouped[d.Category]) grouped[d.Category] = [];
        grouped[d.Category].push({ d, i });
    });

    for (const category in grouped) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = category;
        grouped[category].forEach(({ d, i }) => {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = `${d.Name} (${d.Width}x${d.Height})`;
            optgroup.appendChild(opt);
        });
        select.appendChild(optgroup);
    }
    toolbar.appendChild(select);

    const scaleSelect = document.createElement('select');
    scaleSelect.className = 'rovalra-explorer-scale-select';

    const fitOpt = document.createElement('option');
    fitOpt.value = 'fit';
    fitOpt.textContent = ts('createRoblox.explorer.fitToWindow');
    scaleSelect.appendChild(fitOpt);

    const actualOpt = document.createElement('option');
    actualOpt.value = 'actual';
    actualOpt.textContent = ts('createRoblox.explorer.actualResolution');
    scaleSelect.appendChild(actualOpt);

    const physicalOpt = document.createElement('option');
    physicalOpt.value = 'physical';
    physicalOpt.textContent = ts('createRoblox.explorer.physicalSize');
    scaleSelect.appendChild(physicalOpt);

    toolbar.appendChild(scaleSelect);

    const rotateBtn = document.createElement('button');
    rotateBtn.type = 'button';
    rotateBtn.className = 'rovalra-explorer-source-btn';
    rotateBtn.textContent = ts('createRoblox.explorer.rotate');
    toolbar.appendChild(rotateBtn);

    const previewArea = document.createElement('div');
    previewArea.className = 'rovalra-explorer-gui-preview-area';

    previewArea.style.flex = '1';
    previewArea.style.position = 'relative';
    previewArea.style.overflow = 'hidden';
    previewArea.style.display = 'flex';
    previewArea.style.alignItems = 'center';
    previewArea.style.justifyContent = 'center';
    previewArea.style.backgroundColor = '#000';

    const viewportWrapper = document.createElement('div');
    viewportWrapper.className = 'rovalra-explorer-gui-viewport-wrapper';
    viewportWrapper.style.transformOrigin = 'center center';
    previewArea.appendChild(viewportWrapper);

    const viewport = document.createElement('div');
    viewport.className = 'rovalra-explorer-gui-viewport';
    viewport.style.position = 'relative';
    viewportWrapper.appendChild(viewport);

    const loadingText = document.createElement('div');
    loadingText.textContent = ts('createRoblox.explorer.loadingPreview');
    loadingText.style.color = 'var(--rovalra-exp-text)';
    loadingText.style.display = 'flex';
    loadingText.style.height = '100%';
    loadingText.style.alignItems = 'center';
    loadingText.style.justifyContent = 'center';
    viewport.appendChild(loadingText);

    previewPane.appendChild(toolbar);
    previewPane.appendChild(previewArea);

    const { ids, originalIds } = collectImageIds(instance);
    const imagePromise = fetchImageUrls(ids, originalIds);
    const fontPromise = preloadFonts(instance).catch((e) =>
        console.warn('Font preloading failed:', e),
    );

    const imageMap = await imagePromise;
    await fontPromise;

    let currentW = 1280;
    let currentH = 720;
    let currentPixelDensity = 96;
    let isRotated = false;
    let scaleMode = 'fit';

    let selectedPreviewInstance = null;
    const instanceToElMap = new Map();

    function highlightSelection(el) {
        instanceToElMap.forEach((e) => {
            e.style.outline = '';
            e.style.outlineOffset = '';
        });

        if (el) {
            el.style.outline = '2px solid #00a2ff';
            el.style.outlineOffset = '1px';
        }
    }

    const onSelectWithHighlight = (inst, el) => {
        selectedPreviewInstance = inst;
        highlightSelection(el);
        if (onSelectInstance) onSelectInstance(inst);
    };

    if (registerHighlightCallback) {
        registerHighlightCallback((inst) => {
            selectedPreviewInstance = inst;
            highlightSelection(instanceToElMap.get(inst));
        });
    }

    function renderGui() {
        const w = isRotated ? currentH : currentW;
        const h = isRotated ? currentW : currentH;

        viewport.style.width = `${w}px`;
        viewport.style.height = `${h}px`;

        viewport.replaceChildren();
        instanceToElMap.clear();

        const layoutTree = buildLayoutTree(instance, true);
        if (layoutTree) {
            resolveLayoutTree(layoutTree, w, h);
            const guiEl = renderDom(
                layoutTree,
                imageMap,
                onSelectWithHighlight,
                instanceToElMap,
            );
            viewport.appendChild(guiEl);
        }

        if (selectedPreviewInstance) {
            highlightSelection(instanceToElMap.get(selectedPreviewInstance));
        }

        updateScale();
    }

    if (registerRerenderCallback) {
        registerRerenderCallback(renderGui);
    }

    function updateScale() {
        const w = isRotated ? currentH : currentW;
        const h = isRotated ? currentW : currentH;

        let scale = 1;
        if (scaleMode === 'fit') {
            const areaW = previewArea.clientWidth - 20;
            const areaH = previewArea.clientHeight - 20;
            if (areaW <= 0 || areaH <= 0) return;
            scale = Math.min(areaW / w, areaH / h);

            previewArea.style.display = 'flex';
            previewArea.style.alignItems = 'center';
            previewArea.style.justifyContent = 'center';
            previewArea.style.overflow = 'hidden';
        } else if (scaleMode === 'physical') {
            scale = 96 / currentPixelDensity;

            previewArea.style.display = 'block';
            previewArea.style.overflow = 'auto';
        } else if (scaleMode === 'actual') {
            scale = 1;

            previewArea.style.display = 'block';
            previewArea.style.overflow = 'auto';
        }

        const safeScale = Math.max(0.05, scale);

        viewportWrapper.style.width = `${w * safeScale}px`;
        viewportWrapper.style.height = `${h * safeScale}px`;
        viewport.style.transform = `scale(${safeScale})`;
    }

    select.addEventListener('change', () => {
        if (select.value === 'default') {
            currentW = 1280;
            currentH = 720;
            currentPixelDensity = 96;
        } else {
            const d = DEFAULT_DEVICES[parseInt(select.value, 10)];
            currentW = d.Width;
            currentH = d.Height;
            currentPixelDensity = d.PixelDensity;
        }
        renderGui();
    });

    scaleSelect.addEventListener('change', () => {
        scaleMode = scaleSelect.value;
        updateScale();
    });

    rotateBtn.addEventListener('click', () => {
        isRotated = !isRotated;
        renderGui();
    });

    await new Promise((r) => requestAnimationFrame(r));
    renderGui();

    const resizeObserver = new ResizeObserver(() => updateScale());
    resizeObserver.observe(previewArea);
}

// --- END SCREENGUI VIEWER LOGIC ---

function buildExplorer(roots, expandAll) {
    const wrapper = document.createElement('div');
    wrapper.className = 'rovalra-explorer';
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'row';

    wrapper.style.height = '75vh';
    wrapper.style.maxHeight = '75vh';
    wrapper.style.minHeight = '400px';

    // --- TREE PANE (with search bar) ---
    const treePane = document.createElement('div');
    treePane.className = 'rovalra-explorer-tree';
    treePane.style.flex = '1 1 250px';
    treePane.style.height = '100%';
    treePane.style.display = 'flex';
    treePane.style.flexDirection = 'column';
    treePane.style.overflow = 'hidden';
    treePane.style.borderRight = '1px solid var(--rovalra-exp-border)';

    // Search bar container for the explorer tree
    const treeSearchContainer = document.createElement('div');
    treeSearchContainer.className = 'rovalra-explorer-search-container';

    const { container: treeSearchWrapper, input: treeSearchInput } =
        createStyledInput({
            id: 'rovalra-explorer-tree-search-input',
            label: ts('createRoblox.explorer.searchInstances'),
        });
    treeSearchInput.type = 'search';
    treeSearchWrapper.classList.add('rovalra-explorer-search-input');
    treeSearchContainer.appendChild(treeSearchWrapper);
    treePane.appendChild(treeSearchContainer);

    // Scrollable tree content area
    const treeContent = document.createElement('div');
    treeContent.className = 'rovalra-explorer-tree-content';
    treePane.appendChild(treeContent);

    const previewPane = document.createElement('div');
    previewPane.className = 'rovalra-explorer-preview';
    previewPane.style.display = 'none';
    previewPane.style.flexDirection = 'column';
    previewPane.style.flex = '2 1 50%';
    previewPane.style.minWidth = '300px';
    previewPane.style.height = '100%';
    previewPane.style.borderLeft = '1px solid var(--rovalra-exp-border)';
    previewPane.style.borderRight = '1px solid var(--rovalra-exp-border)';
    previewPane.style.overflow = 'hidden';

    const propsPane = document.createElement('div');
    propsPane.className = 'rovalra-explorer-props';
    propsPane.style.flex = '1 1 300px';
    propsPane.style.height = '100%';
    propsPane.style.overflowY = 'auto';

    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'rovalra-explorer-props-empty';
    emptyMsg.textContent = ts('createRoblox.explorer.selectInstance');
    propsPane.appendChild(emptyMsg);

    wrapper.appendChild(treePane);
    wrapper.appendChild(previewPane);
    wrapper.appendChild(propsPane);

    // --- STATE ---
    let selectedRow = null;
    let selectedInstance = null;
    let previewHighlightFn = null;
    let guiViewerRerender = null;

    let explorerSearchQuery = '';
    let propsSearchQuery = '';
    let isInitialRender = true;
    let isSearchActive = false;

    // Memory for expansion states
    const expandedInstancesSet = new Set(); // Long-term memory
    const searchCollapsedSet = new Set(); // Nodes manually collapsed during search

    const instanceToRowMap = new WeakMap();
    const instanceToExpandMap = new WeakMap();
    const parentMap = new WeakMap();

    function populateParents(instances, parent = null) {
        for (const inst of instances) {
            parentMap.set(inst, parent);
            if (inst.Children) {
                populateParents(inst.Children, inst);
            }
        }
    }
    populateParents(roots);

    // --- SEARCH HELPERS ---
    function instanceMatchesQuery(instance, query) {
        if (!query) return true;
        const name = getInstanceName(instance).toLowerCase();
        const className = (instance.ClassName || '').toLowerCase();
        return name.includes(query) || className.includes(query);
    }

    function hasMatchingDescendant(instance, query) {
        if (!instance.Children) return false;
        for (const child of instance.Children) {
            if (instanceMatchesQuery(child, query)) return true;
            if (hasMatchingDescendant(child, query)) return true;
        }
        return false;
    }

    function selectInstance(instance, rowEl) {
        selectedInstance = instance;
        if (selectedRow) selectedRow.classList.remove('selected');
        selectedRow = rowEl;
        if (rowEl) rowEl.classList.add('selected');
        renderProps(instance);

        if (previewHighlightFn) previewHighlightFn(instance);
    }

    function handlePreviewSelect(instance) {
        const path = [];
        let curr = instance;
        while (curr) {
            path.unshift(curr);
            curr = parentMap.get(curr);
        }

        for (let i = 0; i < path.length - 1; i++) {
            const parentInstance = path[i];
            const ensureExpanded = instanceToExpandMap.get(parentInstance);
            if (ensureExpanded) ensureExpanded();
        }

        const rowEl = instanceToRowMap.get(instance);
        if (rowEl) {
            selectInstance(instance, rowEl);
            rowEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } else {
            selectInstance(instance, null);
        }
    }

    function triggerGuiPreview(instance) {
        openGuiViewer(
            instance,
            wrapper,
            previewPane,
            handlePreviewSelect,
            (fn) => {
                previewHighlightFn = fn;
            },
            (fn) => {
                guiViewerRerender = fn;
            },
        );
    }

    // --- PROPERTIES PANEL (with search bar) ---
    function renderProps(instance) {
        propsPane.replaceChildren();

        const props = instance.Properties || {};
        const keys = Object.keys(props);

        const header = document.createElement('div');
        header.className = 'rovalra-explorer-props-header';
        const headerLabel = document.createElement('span');
        headerLabel.textContent = `${getInstanceName(instance)} (${instance.ClassName})`;
        header.appendChild(headerLabel);

        const headerActions = document.createElement('div');
        headerActions.className = 'rovalra-explorer-props-actions';
        header.appendChild(headerActions);

        if (
            typeof props.Source === 'string' &&
            props.Source.trim().length > 0
        ) {
            const sourceBtn = document.createElement('button');
            sourceBtn.type = 'button';
            sourceBtn.className = 'rovalra-explorer-source-btn';
            sourceBtn.textContent = ts('createRoblox.explorer.viewSource');
            sourceBtn.addEventListener('click', () => {
                openSource(`${getInstanceName(instance)}.Source`, props.Source);
            });
            headerActions.appendChild(sourceBtn);
        }

        if (VALID_GUI_CLASSES.has(instance.ClassName)) {
            const guiBtn = document.createElement('button');
            guiBtn.type = 'button';
            guiBtn.className = 'rovalra-explorer-source-btn';
            guiBtn.textContent = ts('createRoblox.explorer.previewGui');
            guiBtn.addEventListener('click', () => {
                triggerGuiPreview(instance);
            });
            headerActions.appendChild(guiBtn);
        }

        propsPane.appendChild(header);

        // --- PROPERTIES SEARCH BAR ---
        const propsSearchContainer = document.createElement('div');
        propsSearchContainer.className =
            'rovalra-explorer-search-container rovalra-explorer-props-search';

        const { container: propsSearchWrapper, input: propsSearchInput } =
            createStyledInput({
                id: 'rovalra-explorer-props-search-input',
                label: ts('createRoblox.explorer.searchProperties'),
                value: propsSearchQuery,
            });
        propsSearchInput.type = 'search';
        propsSearchWrapper.classList.add('rovalra-explorer-search-input');

        propsSearchContainer.appendChild(propsSearchWrapper);
        propsPane.appendChild(propsSearchContainer);

        if (keys.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'rovalra-explorer-props-empty';
            empty.textContent = ts('createRoblox.explorer.noProperties');
            propsPane.appendChild(empty);
            return;
        }

        const grouped = {};
        for (const key of keys) {
            if (key === 'Tags' || key === 'AttributesSerialize') continue;
            if (HIDDEN_PROPS.has(key)) continue;
            (grouped[propGroup(key)] ||= []).push({
                label: key,
                value: props[key],
            });
        }

        const attributes = parseAttributes(props.AttributesSerialize);
        for (const [name, value] of Object.entries(attributes)) {
            (grouped.Attributes ||= []).push({ label: name, value });
        }

        const tags = parseTags(props.Tags);
        for (const tag of tags) {
            (grouped.Tags ||= []).push({ label: tag, value: '' });
        }

        const table = document.createElement('div');
        table.className = 'rovalra-explorer-props-table';

        const makeRow = (label, rawValue) => {
            const row = document.createElement('div');
            row.className = 'rovalra-explorer-prop-row';
            row.dataset.propName = label.toLowerCase();

            const nameCell = document.createElement('div');
            nameCell.className = 'rovalra-explorer-prop-name';
            nameCell.textContent = label;
            nameCell.title = label;

            const valueCell = document.createElement('div');
            valueCell.className = 'rovalra-explorer-prop-value';

            // --- ColorSequence / NumberSequence visual rendering ---
            if (isColorSequence(rawValue) || isNumberSequence(rawValue)) {
                const seqWrapper = document.createElement('div');
                seqWrapper.className = 'rovalra-explorer-sequence';

                const seqBar = document.createElement('div');
                seqBar.className = 'rovalra-explorer-sequence-bar';

                if (isColorSequence(rawValue)) {
                    seqBar.style.background =
                        buildColorSequenceGradient(rawValue);
                } else {
                    seqBar.style.background = '#1a1a1a';
                    seqBar.appendChild(buildNumberSequenceSvg(rawValue));
                }

                const countLabel = document.createElement('span');
                countLabel.textContent = `${rawValue.length} pts`;
                countLabel.className = 'rovalra-explorer-sequence-count';

                seqWrapper.appendChild(seqBar);
                seqWrapper.appendChild(countLabel);
                valueCell.appendChild(seqWrapper);

                const tipLines = rawValue.map((kp) => {
                    const env =
                        kp.Envelope !== undefined
                            ? ` (±${fixNum(kp.Envelope)})`
                            : '';
                    if (isColorSequence(rawValue)) {
                        const to255 = (c) => Math.round(c <= 1 ? c * 255 : c);
                        return `t=${fixNum(kp.Time)}: ${to255(kp.Value.r)}, ${to255(kp.Value.g)}, ${to255(kp.Value.b)}${env}`;
                    }
                    return `t=${fixNum(kp.Time)}: ${fixNum(kp.Value)}${env}`;
                });
                valueCell.title = tipLines.join('\n');

                row.appendChild(nameCell);
                row.appendChild(valueCell);
                return row;
            }

            let swatch = asColorSwatch(rawValue);
            let displayText = formatValue(rawValue);

            if (
                !swatch &&
                typeof rawValue === 'number' &&
                /colou?r/i.test(label) &&
                !/brick/i.test(label)
            ) {
                const r = (rawValue >>> 16) & 255;
                const g = (rawValue >>> 8) & 255;
                const b = rawValue & 255;
                swatch = `rgb(${r}, ${g}, ${b})`;
                displayText = `${r}, ${g}, ${b}`;
            }

            if (swatch) {
                const dot = document.createElement('span');
                dot.className = 'rovalra-explorer-color-swatch';
                dot.style.background = swatch;
                valueCell.appendChild(dot);
            }

            const valueText = document.createElement('span');
            valueText.textContent = displayText;
            valueText.title = valueText.textContent;
            valueCell.appendChild(valueText);

            let assetLinkId = null;
            if (typeof rawValue === 'string') {
                const m = rawValue.match(
                    /(?:rbxassetid:\/\/|\/asset\/?\?id=|assetid=|[?&]id=)(\d+)/i,
                );
                if (m) {
                    assetLinkId = m[1];
                } else if (
                    /^\d{4,}$/.test(rawValue.trim()) &&
                    /(id|texture|mesh|image|sound|decal)$/i.test(label)
                ) {
                    assetLinkId = rawValue.trim();
                }
            }
            if (assetLinkId) {
                const link = document.createElement('a');
                link.className = 'rovalra-explorer-asset-link';
                link.href = `https://create.roblox.com/store/asset/${assetLinkId}`;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.title = `https://create.roblox.com/store/asset/${assetLinkId}`;
                const linkIcon = document.createElement('span');
                linkIcon.className = 'rovalra-explorer-asset-link-icon';
                applyMaskIcon(linkIcon, getAssets().launchIcon);
                link.appendChild(linkIcon);
                link.addEventListener('click', (e) => e.stopPropagation());
                valueCell.appendChild(link);
            }

            valueCell.classList.add('rovalra-explorer-copyable');
            valueCell.addEventListener('click', () => {
                const range = document.createRange();
                range.selectNodeContents(valueText);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
            });

            row.appendChild(nameCell);
            row.appendChild(valueCell);
            return row;
        };

        const groups = Object.keys(grouped).sort((a, b) => {
            const ka = groupSortKey(a);
            const kb = groupSortKey(b);
            return ka !== kb ? ka - kb : a.localeCompare(b);
        });

        for (const group of groups) {
            const groupKeys = grouped[group];
            groupKeys.sort((a, b) => a.label.localeCompare(b.label));

            const groupBody = document.createElement('div');
            groupBody.className = 'rovalra-explorer-prop-group-body';

            const groupHeader = document.createElement('div');
            groupHeader.className = 'rovalra-explorer-prop-group open';
            const arrow = document.createElement('span');
            arrow.className = 'rovalra-explorer-prop-group-arrow';
            arrow.textContent = '▾';
            const groupLabel = document.createElement('span');
            groupLabel.textContent = group;
            groupHeader.appendChild(arrow);
            groupHeader.appendChild(groupLabel);

            groupHeader.addEventListener('click', () => {
                const open = groupHeader.classList.toggle('open');
                arrow.textContent = open ? '▾' : '▸';
                groupBody.style.display = open ? '' : 'none';
            });

            for (const entry of groupKeys) {
                groupBody.appendChild(makeRow(entry.label, entry.value));
            }

            table.appendChild(groupHeader);
            table.appendChild(groupBody);
        }

        propsPane.appendChild(table);

        // --- PROPERTIES FILTER LOGIC ---
        function filterProps() {
            const query = propsSearchQuery.toLowerCase().trim();
            const groupHeaders = table.querySelectorAll(
                '.rovalra-explorer-prop-group',
            );

            groupHeaders.forEach((groupHeader) => {
                const body = groupHeader.nextElementSibling;
                if (!body) return;

                let anyVisible = false;
                body.querySelectorAll('.rovalra-explorer-prop-row').forEach(
                    (row) => {
                        const propName = row.dataset.propName || '';
                        const visible = !query || propName.includes(query);
                        row.style.display = visible ? '' : 'none';
                        if (visible) anyVisible = true;
                    },
                );

                if (query) {
                    if (anyVisible) {
                        groupHeader.style.display = '';
                        body.style.display = '';
                        if (!groupHeader.classList.contains('open')) {
                            groupHeader.classList.add('open');
                            groupHeader.querySelector(
                                '.rovalra-explorer-prop-group-arrow',
                            ).textContent = 'v';
                        }
                    } else {
                        groupHeader.style.display = 'none';
                        body.style.display = 'none';
                    }
                } else {
                    groupHeader.style.display = '';
                    const isOpen = groupHeader.classList.contains('open');
                    body.style.display = isOpen ? '' : 'none';
                }
            });
        }

        let propsSearchDebounce = null;
        propsSearchInput.addEventListener('input', () => {
            clearTimeout(propsSearchDebounce);
            propsSearchDebounce = setTimeout(() => {
                propsSearchQuery = propsSearchInput.value;
                filterProps();
            }, 100);
        });

        filterProps();
    }

    // --- TREE NODE CREATION ---
    function createNode(instance, depth, query = '') {
        const node = document.createElement('div');
        node.className = 'rovalra-explorer-node';

        const row = document.createElement('div');
        row.className = 'rovalra-explorer-row';
        row.style.paddingLeft = `${depth * 16 + 4}px`;

        instanceToRowMap.set(instance, row);

        const allChildren = instance.Children || [];
        let childrenToRender = allChildren;

        if (query) {
            childrenToRender = allChildren.filter(
                (child) =>
                    instanceMatchesQuery(child, query) ||
                    hasMatchingDescendant(child, query),
            );
        }

        const hasChildren = childrenToRender.length > 0;
        const hasAllChildren = allChildren.length > 0;

        const toggle = document.createElement('span');
        toggle.className = 'rovalra-explorer-toggle';
        toggle.textContent = hasChildren ? '▸' : '';

        const icon = document.createElement('img');
        icon.className = 'rovalra-explorer-icon';
        icon.src = classIconUrl(instance.ClassName);
        icon.onerror = () => {
            if (/Value$/.test(instance.ClassName)) {
                icon.onerror = () => {
                    icon.onerror = null;
                    icon.style.visibility = 'hidden';
                };
                icon.src = classIconUrl('Value');
            } else {
                icon.onerror = null;
                icon.style.visibility = 'hidden';
            }
        };

        const label = document.createElement('span');
        label.className = 'rovalra-explorer-label';
        label.textContent = getInstanceName(instance);
        label.title = `${getInstanceName(instance)} — ${instance.ClassName}`;

        if (query && instanceMatchesQuery(instance, query)) {
            label.style.color = '#5dbfff';
            label.style.fontWeight = '600';
        }

        row.appendChild(toggle);
        row.appendChild(icon);
        row.appendChild(label);

        if (hasAllChildren) {
            const count = document.createElement('span');
            count.className = 'rovalra-explorer-count';
            if (query && childrenToRender.length !== allChildren.length) {
                count.textContent = `${childrenToRender.length}/${allChildren.length}`;
            } else {
                count.textContent = allChildren.length;
            }
            row.appendChild(count);
        }

        if (
            VALID_GUI_CLASSES.has(instance.ClassName) &&
            instance.ClassName !== 'StarterGui'
        ) {
            const visToggle = document.createElement('span');
            visToggle.className = 'rovalra-explorer-vis-toggle';
            visToggle.textContent = 'View';
            visToggle.style.cursor = 'pointer';
            visToggle.style.marginLeft = 'auto';
            visToggle.style.fontSize = '14px';
            visToggle.style.padding = '0 4px';
            visToggle.style.userSelect = 'none';
            visToggle.title = ts(
                'createRoblox.explorer.togglePreviewVisibility',
            );

            const propToToggle = getVisibilityProp(instance.ClassName);
            const getVisibility = () => {
                const val = instance.Properties?.[propToToggle];
                return val !== false && val !== 'false' && val !== 0;
            };

            const updateToggleVisual = () => {
                const isVisible = getVisibility();
                visToggle.style.opacity = isVisible ? '1' : '0.3';
                visToggle.style.textDecoration = isVisible
                    ? 'none'
                    : 'line-through';
            };
            updateToggleVisual();

            visToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!instance.Properties) instance.Properties = {};
                instance.Properties[propToToggle] = !getVisibility();
                updateToggleVisual();

                if (guiViewerRerender) guiViewerRerender();
            });

            visToggle.addEventListener('dblclick', (e) => {
                e.stopPropagation();
            });

            row.appendChild(visToggle);
        }

        node.appendChild(row);

        const childContainer = document.createElement('div');
        childContainer.className = 'rovalra-explorer-children';
        childContainer.style.display = 'none';
        node.appendChild(childContainer);

        let expanded = false;
        let built = false;

        const expand = (force) => {
            if (!hasChildren) return;
            const shouldExpand = force !== undefined ? force : !expanded;
            if (shouldExpand === expanded) return;

            expanded = shouldExpand;
            toggle.textContent = expanded ? '▾' : '▸';
            childContainer.style.display = expanded ? 'block' : 'none';

            // Track expansion state based on context
            if (isSearchActive) {
                if (expanded) {
                    searchCollapsedSet.delete(instance);
                } else {
                    searchCollapsedSet.add(instance);
                }
            } else {
                if (expanded) {
                    expandedInstancesSet.add(instance);
                } else {
                    expandedInstancesSet.delete(instance);
                }
            }

            if (expanded && !built) {
                built = true;
                const frag = document.createDocumentFragment();
                for (const child of sortInstances(childrenToRender)) {
                    frag.appendChild(createNode(child, depth + 1, query));
                }
                childContainer.appendChild(frag);
            }
        };

        instanceToExpandMap.set(instance, () => expand(true));

        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            expand();
        });

        const source = instance.Properties?.Source;
        const isScript = typeof source === 'string' && source.trim().length > 0;

        row.addEventListener('click', () => {
            selectInstance(instance, row);
        });

        row.addEventListener('dblclick', () => {
            if (isScript) {
                openSource(`${getInstanceName(instance)}.Source`, source);
            } else if (VALID_GUI_CLASSES.has(instance.ClassName)) {
                triggerGuiPreview(instance);
            } else {
                expand();
            }
        });

        // --- DETERMINE EXPANSION STATE ---
        let shouldNodeBeExpanded = false;
        if (isSearchActive) {
            // Auto-expand all nodes with children during search, UNLESS explicitly collapsed
            shouldNodeBeExpanded =
                hasChildren && !searchCollapsedSet.has(instance);
        } else {
            // 1. Check long-term memory
            shouldNodeBeExpanded = expandedInstancesSet.has(instance);

            // 2. Ensure ancestors of the selected instance are expanded
            if (!shouldNodeBeExpanded && selectedInstance) {
                let curr = parentMap.get(selectedInstance);
                while (curr) {
                    if (curr === instance) {
                        shouldNodeBeExpanded = true;
                        expandedInstancesSet.add(instance); // persist so it stays open
                        break;
                    }
                    curr = parentMap.get(curr);
                }
            }

            // 3. Initial render expandAll flag
            if (isInitialRender && expandAll && hasChildren) {
                shouldNodeBeExpanded = true;
            }
        }

        if (shouldNodeBeExpanded) {
            expand(true);
        }

        // Restore selection visual state if this is the selected instance
        if (instance === selectedInstance) {
            row.classList.add('selected');
            selectedRow = row;
        }

        return node;
    }

    // --- BUILD VISIBLE ROOTS ---
    const sortedRoots = sortInstances(roots);
    let visibleRoots = sortedRoots.filter(
        (r) => CLASS_ORDER[r.ClassName] !== undefined,
    );
    if (visibleRoots.length === 0) visibleRoots = sortedRoots;

    // --- TREE RENDERING ---
    function renderTree() {
        treeContent.replaceChildren();
        const query = explorerSearchQuery.toLowerCase().trim();

        const frag = document.createDocumentFragment();
        let matchCount = 0;

        for (const root of visibleRoots) {
            if (query) {
                if (
                    !instanceMatchesQuery(root, query) &&
                    !hasMatchingDescendant(root, query)
                ) {
                    continue;
                }
            }
            matchCount++;
            frag.appendChild(createNode(root, 0, query));
        }

        if (query && matchCount === 0) {
            const empty = document.createElement('div');
            empty.className = 'rovalra-explorer-search-empty';
            empty.textContent = ts('createRoblox.explorer.noMatchingInstances');
            treeContent.appendChild(empty);
        } else {
            treeContent.appendChild(frag);
        }

        isInitialRender = false;
    }

    // --- SEARCH INPUT HANDLING ---
    let searchDebounce = null;
    treeSearchInput.addEventListener('input', () => {
        const val = treeSearchInput.value;
        clearTimeout(searchDebounce);

        if (val.length === 0) {
            // Instantly reset if cleared
            if (isSearchActive) {
                isSearchActive = false;
                searchCollapsedSet.clear();
            }
            explorerSearchQuery = '';
            renderTree();
        } else if (val.length >= 2) {
            // Debounce slightly just to prevent locking if typing incredibly fast
            searchDebounce = setTimeout(() => {
                if (!isSearchActive) {
                    isSearchActive = true;
                    searchCollapsedSet.clear();
                }
                explorerSearchQuery = val;
                renderTree();
            }, 150);
        } else {
            // val.length === 1
            if (isSearchActive) {
                // Reset because they went below 2 characters
                isSearchActive = false;
                searchCollapsedSet.clear();
                explorerSearchQuery = '';
                renderTree();
            }
        }
    });

    treeSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            clearTimeout(searchDebounce);
            const val = treeSearchInput.value;
            // Force search on Enter regardless of length
            if (val.length > 0) {
                if (!isSearchActive) {
                    isSearchActive = true;
                    searchCollapsedSet.clear();
                }
                explorerSearchQuery = val;
                renderTree();
            } else {
                if (isSearchActive) {
                    isSearchActive = false;
                    searchCollapsedSet.clear();
                }
                explorerSearchQuery = '';
                renderTree();
            }
        }
    });

    // Initial tree render
    renderTree();

    return wrapper;
}

function openSource(title, source) {
    const wrap = document.createElement('div');
    wrap.className = 'rovalra-explorer-source';

    const lineCount = source.split('\n').length;
    const gutter = document.createElement('div');
    gutter.className = 'rovalra-explorer-source-gutter';
    let nums = '';
    for (let i = 1; i <= lineCount; i++) nums += `${i}\n`;
    gutter.textContent = nums;

    wrap.appendChild(gutter);
    wrap.appendChild(highlightLuau(source));

    createOverlay({
        title,
        bodyContent: wrap,
        maxWidth: '900px',
        showLogo: true,
    });
}

async function openExplorer(assetId, name, expandAll) {
    const loading = document.createElement('div');
    loading.className = 'rovalra-explorer-loading';
    loading.textContent = ts('createRoblox.explorer.loading');

    createOverlay({
        title: `${ts('createRoblox.explorer.title')} — ${name || assetId}`,
        bodyContent: loading,
        maxWidth: '900px',
        showLogo: true,
    });

    try {
        const asset = await loadAssetTree(parseInt(assetId, 10));

        console.log('[RoValra Explorer] result', {
            assetId,
            isValid: asset?.isValid,
            format: asset?.format,
            roots: asset?.root?.length,
        });

        if (
            !asset ||
            !asset.isValid ||
            !asset.root ||
            asset.root.length === 0
        ) {
            loading.textContent = ts('createRoblox.explorer.loadError');
            return;
        }

        const explorer = buildExplorer(asset.root, expandAll);
        loading.replaceWith(explorer);
    } catch (e) {
        console.error('[RoValra Explorer] Failed:', e);
        loading.textContent = ts('createRoblox.explorer.loadError');
    }
}

async function addCatalogButton(rightToolbar) {
    const assetId = getPlaceIdFromUrl();
    if (
        !assetId ||
        rightToolbar.dataset.rovalraExplorerChecked ||
        document.getElementById('rovalra-explorer-btn')
    )
        return;
    rightToolbar.dataset.rovalraExplorerChecked = '1';

    if (await isClassicClothingItem(assetId)) return;

    const assets = getAssets();

    const container = document.createElement('div');
    container.className = 'rovalra-explorer-buttons';

    const button = document.createElement('button');
    button.id = 'rovalra-explorer-btn';
    button.type = 'button';
    button.className =
        'rbx-menu-item btn-generic-more-sm rovalra-explorer-header-btn';
    button.title = ts('createRoblox.explorer.button');
    button.setAttribute('aria-label', ts('createRoblox.explorer.button'));

    const icon = document.createElement('span');
    icon.className = 'rovalra-explorer-header-icon';
    applyMaskIcon(icon, assets.explorerTreeIcon);
    button.appendChild(icon);

    button.addEventListener('click', (e) => {
        e.preventDefault();
        const name = document
            .querySelector('.item-details-name-row h1')
            ?.textContent?.trim();
        openExplorer(assetId, name, true);
    });

    container.appendChild(button);
    rightToolbar.parentElement.insertBefore(container, rightToolbar);
    console.log('%cRoValra Explorer: button added (catalog)', 'color:#FF4500');
}

function addGameButton(contextMenu) {
    const placeId = getPlaceIdFromUrl();
    if (!placeId || contextMenu.dataset.rovalraExplorerChecked) return;
    contextMenu.dataset.rovalraExplorerChecked = '1';

    canAccessAsset(parseInt(placeId, 10)).then((ok) => {
        if (!ok || document.getElementById('rovalra-explorer-btn')) return;

        const assets = getAssets();

        const button = document.createElement('button');
        button.id = 'rovalra-explorer-btn';
        button.type = 'button';
        button.className =
            'rbx-menu-item btn-generic-more-sm rovalra-explorer-game-btn';
        button.setAttribute('aria-label', ts('createRoblox.explorer.button'));
        addTooltip(button, ts('createRoblox.explorer.button'));

        const icon = document.createElement('span');
        icon.className = 'rovalra-explorer-game-icon';
        applyMaskIcon(icon, assets.explorerTreeIcon);

        button.appendChild(icon);

        button.addEventListener('click', (e) => {
            e.preventDefault();
            const title = document.querySelector('h1.game-name');
            const name =
                title?.getAttribute('title') || title?.textContent?.trim();
            openExplorer(placeId, name);
        });

        contextMenu.insertBefore(button, contextMenu.firstElementChild);
        console.log('%cRoValra Explorer: button added (game)', 'color:#FF4500');
    });
}

export async function init() {
    const path = window.location.pathname;
    const onCatalog = /\/catalog\//.test(path);
    const onGame = /\/games\//.test(path);

    if (!onCatalog && !onGame) return;
    if (!(await settings.ExplorerEnabled)) return;

    if (onCatalog) {
        observeElement('.item-details-info-header .right', (el) =>
            addCatalogButton(el),
        );
    }
    if (onGame) {
        observeElement('#game-context-menu', (el) => addGameButton(el));
    }
}
