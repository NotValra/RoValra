const wallpaper = document.getElementById('wallpaper');
const VALID_SIZES = new Set(['cover', 'contain', 'auto']);
const VALID_REPEATS = new Set(['no-repeat', 'repeat', 'repeat-x', 'repeat-y']);
const VALID_POSITIONS = new Set([
    'center',
    'top',
    'bottom',
    'left',
    'right',
    'top left',
    'top right',
    'bottom left',
    'bottom right',
]);
let currentSource = '';

function isRobloxOrigin(origin) {
    try {
        const { hostname, protocol } = new URL(origin);
        return (
            protocol === 'https:' &&
            (hostname === 'roblox.com' || hostname.endsWith('.roblox.com'))
        );
    } catch {
        return false;
    }
}

function normalizeSource(source) {
    if (typeof source !== 'string') return '';

    try {
        const url = new URL(source.trim());
        return url.protocol === 'https:' ? url.href : '';
    } catch {
        return '';
    }
}

function normalizeSize(size) {
    if (VALID_SIZES.has(size)) return size;
    if (/^\d+%$/.test(size)) return size;
    return 'cover';
}

window.addEventListener('message', (event) => {
    if (!isRobloxOrigin(event.origin)) return;

    const data = event.data;
    if (!data || data.type !== 'rovalra:set-background') return;

    const source = normalizeSource(data.source);
    if (!source) {
        if (currentSource) {
            currentSource = '';
            wallpaper.style.backgroundImage = '';
        }
        return;
    }

    const size = normalizeSize(String(data.size || 'cover'));
    const position = VALID_POSITIONS.has(data.position)
        ? data.position
        : 'center';
    const repeat = VALID_REPEATS.has(data.repeat)
        ? data.repeat
        : 'no-repeat';
    const attachment =
        data.attachment === 'scroll' || data.attachment === 'fixed'
            ? data.attachment
            : 'fixed';

    if (source !== currentSource) {
        currentSource = source;
        wallpaper.style.backgroundImage = `url(${JSON.stringify(source)})`;
    }
    wallpaper.style.backgroundSize = size;
    wallpaper.style.backgroundPosition = position;
    wallpaper.style.backgroundRepeat = repeat;
    wallpaper.style.backgroundAttachment = attachment;
});
