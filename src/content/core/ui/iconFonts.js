import { callRobloxApi } from '../api.js';

const STRICT_CSP_HOSTS = new Set(['create.roblox.com']);

const ROVALRA_FONTS = [
    {
        family: 'Builder Icons Outlined',
        endpoint: '/static/fonts/BuilderIcons-Regular.woff2',
    },
    {
        family: 'Builder Icons Filled',
        endpoint: '/static/fonts/BuilderIcons-Filled.woff2',
    },
    {
        family: 'RoValra Icons',
        endpoint: '/static/fonts/RoValraIcons.woff2',
    },
];

const MATERIAL_ICONS_CSS =
    'https://fonts.googleapis.com/icon?family=Material+Icons+Outlined|Material+Icons&display=swap';

const FONT_FACE_REGEX = /@font-face\s*\{[^}]*\}/gi;

let loaded = false;

async function readBuffer(response) {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.arrayBuffer();
}

function fetchRovalraFont(endpoint) {
    return callRobloxApi({
        isRovalraApi: true,
        subdomain: 'www',
        endpoint,
        method: 'GET',
        credentials: 'omit',
    }).then(readBuffer);
}

function fetchExternalFont(url) {
    return fetch(url, { credentials: 'omit' }).then(readBuffer); // Verified
}

async function addFont(family, loadBuffer, descriptors = {}) {
    try {
        const face = new FontFace(family, await loadBuffer(), descriptors);
        await face.load();
        document.fonts.add(face);
    } catch (error) {
        console.warn('RoValra: Failed to load icon font', family, error);
    }
}

function getDescriptor(block, name) {
    return block
        .match(new RegExp(`(?:^|[{;\\s])${name}\\s*:\\s*([^;}]+)`, 'i'))?.[1]
        ?.trim()
        .replace(/^['"]|['"]$/g, '');
}

async function addMaterialIcons() {
    let css;
    try {
        const response = await fetch(MATERIAL_ICONS_CSS, {
            credentials: 'omit',
        }); // Verified
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        css = await response.text();
    } catch (error) {
        console.warn('RoValra: Failed to load Material Icons', error);
        return;
    }

    await Promise.all(
        (css.match(FONT_FACE_REGEX) || []).map((block) => {
            const family = getDescriptor(block, 'font-family');
            const url = block.match(/url\(\s*['"]?([^'")]+)['"]?\s*\)/i)?.[1];
            if (!family || !url) return null;

            const descriptors = {};
            const weight = getDescriptor(block, 'font-weight');
            const style = getDescriptor(block, 'font-style');
            if (weight) descriptors.weight = weight;
            if (style) descriptors.style = style;
            return addFont(family, () => fetchExternalFont(url), descriptors);
        }),
    );
}

function loadIconFonts() {
    if (loaded) return;
    loaded = true;
    for (const { family, endpoint } of ROVALRA_FONTS) {
        addFont(family, () => fetchRovalraFont(endpoint));
    }
    addMaterialIcons();
}

export function loadIconFontsForStrictCsp() {
    if (STRICT_CSP_HOSTS.has(window.location.hostname)) {
        loadIconFonts();
        return;
    }

    document.addEventListener('securitypolicyviolation', (event) => {
        if (event.effectiveDirective === 'font-src') loadIconFonts();
    });
}
