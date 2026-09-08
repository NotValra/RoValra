import { settings } from '../../core/settings/getSettings.js';

const FAVICON_LINK_ID = 'rovalra-custom-favicon';
const ICON_LINK_SELECTOR =
    'link[rel~="icon" i], link[rel="shortcut icon" i], link[rel="mask-icon" i], link[rel="apple-touch-icon" i], link[rel="apple-touch-icon-precomposed" i]';
const MAX_IMAGE_BYTES = 1024 * 1024;

const CSP_SAFE_HOST = /(^|\.)(roblox\.com|rbxcdn\.com)$/i;

let enabled = false;
let requestedUrl = null;
let faviconHref = null;
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

function guessMimeType(href) {
    if (href.startsWith('data:')) {
        return href.slice(5).split(/[;,]/)[0] || '';
    }
    const clean = href.split(/[?#]/)[0].toLowerCase().replace(/\/+$/, '');
    if (clean.endsWith('.svg')) return 'image/svg+xml';
    if (clean.endsWith('.png')) return 'image/png';
    if (clean.endsWith('.webp')) return 'image/webp';
    if (clean.endsWith('.gif')) return 'image/gif';
    if (clean.endsWith('.jpg') || clean.endsWith('.jpeg')) return 'image/jpeg';
    if (clean.endsWith('.ico')) return 'image/x-icon';
    return '';
}

function blobToDataUri(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

async function resolveHref(url) {
    let host = '';
    try {
        host = new URL(url).hostname;
    } catch {
        return url;
    }
    if (url.startsWith('data:') || CSP_SAFE_HOST.test(host)) {
        return url;
    }

    try {
        const response = await fetch(url, { cache: 'force-cache' });
        if (!response.ok) return url;

        const blob = await response.blob();
        if (
            blob.size === 0 ||
            blob.size > MAX_IMAGE_BYTES ||
            !blob.type.startsWith('image/')
        ) {
            return url;
        }

        const dataUri = await blobToDataUri(blob);
        if (typeof dataUri === 'string' && dataUri.startsWith('data:')) {
            return dataUri;
        }
    } catch {}

    return url;
}

function applyFavicon() {
    if (!enabled || !faviconHref) return;

    try {
        stashOriginalIconLinks();

        getForeignIconLinks().forEach((link) => link.remove());

        let link = document.getElementById(FAVICON_LINK_ID);
        if (!link) {
            link = document.createElement('link');
            link.id = FAVICON_LINK_ID;
            link.rel = 'icon';
        }

        const mime = guessMimeType(faviconHref);
        if (mime) {
            link.setAttribute('type', mime);
        } else {
            link.removeAttribute('type');
        }

        if (link.getAttribute('href') !== faviconHref) {
            link.setAttribute('href', faviconHref);
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
            if (!document.querySelector(ICON_LINK_SELECTOR)) {
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
            requestedUrl = null;
            faviconHref = null;
            restoreOriginalFavicon();
        }
        return;
    }

    enabled = true;

    if (url !== requestedUrl || !faviconHref) {
        requestedUrl = url;
        faviconHref = null;
        const href = await resolveHref(url);
        if (!enabled || requestedUrl !== url) return;
        faviconHref = href;
    }

    applyFavicon();
}

function handleStorageChange(changes, areaName) {
    if (areaName !== 'local') return;
    if (changes.customFaviconEnabled || changes.customFaviconUrl) {
        refresh();
    }
}

export function init() {
    refresh();

    chrome.storage.onChanged.addListener(handleStorageChange);

    document.addEventListener('rovalra:urlChanged', () => {
        if (enabled && faviconHref) applyFavicon();
    });
}
