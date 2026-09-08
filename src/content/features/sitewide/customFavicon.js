import { settings } from '../../core/settings/getSettings.js';

const FAVICON_LINK_ID = 'rovalra-custom-favicon';
const ICON_LINK_SELECTOR =
    'link[rel~="icon" i], link[rel="shortcut icon" i], link[rel="mask-icon" i], link[rel="apple-touch-icon" i], link[rel="apple-touch-icon-precomposed" i]';

let enabled = false;
let faviconUrl = null;
let originalIconLinks = null;

function getHead() {
    return document.head || document.documentElement;
}

function getForeignIconLinks() {
    return Array.from(document.querySelectorAll(ICON_LINK_SELECTOR)).filter(
        (link) => link.id !== FAVICON_LINK_ID,
    );
}

function stashOriginalIconLinks() {
    if (originalIconLinks !== null) return;
    originalIconLinks = getForeignIconLinks().map((link) => ({
        rel: link.getAttribute('rel') || 'icon',
        href: link.getAttribute('href') || '',
        type: link.getAttribute('type') || '',
        sizes: link.getAttribute('sizes') || '',
        color: link.getAttribute('color') || '',
    }));
}

function guessMimeType(url) {
    const clean = url.split(/[?#]/)[0].toLowerCase().replace(/\/+$/, '');
    if (clean.endsWith('.svg')) return 'image/svg+xml';
    if (clean.endsWith('.png')) return 'image/png';
    if (clean.endsWith('.webp')) return 'image/webp';
    if (clean.endsWith('.gif')) return 'image/gif';
    if (clean.endsWith('.jpg') || clean.endsWith('.jpeg')) return 'image/jpeg';
    if (clean.endsWith('.ico')) return 'image/x-icon';
    return '';
}

function applyFavicon() {
    if (!enabled || !faviconUrl) return;

    try {
        stashOriginalIconLinks();

        getForeignIconLinks().forEach((link) => link.remove());

        let link = document.getElementById(FAVICON_LINK_ID);
        if (!link) {
            link = document.createElement('link');
            link.id = FAVICON_LINK_ID;
            link.rel = 'icon';
        }

        const mime = guessMimeType(faviconUrl);
        if (mime) {
            link.setAttribute('type', mime);
        } else {
            link.removeAttribute('type');
        }

        if (link.getAttribute('href') !== faviconUrl) {
            link.setAttribute('href', faviconUrl);
        }

        getHead().appendChild(link);
    } catch (error) {
        console.warn('RoValra: Failed to apply custom favicon', error);
    }
}

function restoreOriginalFavicon() {
    try {
        const custom = document.getElementById(FAVICON_LINK_ID);
        if (custom) custom.remove();

        if (Array.isArray(originalIconLinks) && originalIconLinks.length > 0) {
            const head = getHead();
            const hasIcon = document.querySelector(ICON_LINK_SELECTOR);
            if (!hasIcon) {
                originalIconLinks.forEach((data) => {
                    const link = document.createElement('link');
                    link.setAttribute('rel', data.rel);
                    if (data.href) link.setAttribute('href', data.href);
                    if (data.type) link.setAttribute('type', data.type);
                    if (data.sizes) link.setAttribute('sizes', data.sizes);
                    if (data.color) link.setAttribute('color', data.color);
                    head.appendChild(link);
                });
            }
        }
    } catch (error) {
        console.warn('RoValra: Failed to restore favicon', error);
    } finally {
        originalIconLinks = null;
    }
}

async function refresh() {
    const isEnabled = (await settings.customFaviconEnabled) === true;
    const rawUrl = await settings.customFaviconUrl;
    const url =
        typeof rawUrl === 'string' && rawUrl.trim() !== ''
            ? rawUrl.trim()
            : null;

    if (!isEnabled || !url) {
        if (enabled) {
            enabled = false;
            faviconUrl = null;
            restoreOriginalFavicon();
        }
        return;
    }

    enabled = true;
    faviconUrl = url;
    applyFavicon();
}

export function init() {
    refresh();

    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== 'local') return;
            if (changes.customFaviconEnabled || changes.customFaviconUrl) {
                refresh();
            }
        });
    }

    document.addEventListener('rovalra:urlChanged', () => {
        if (enabled && faviconUrl) applyFavicon();
    });
}
