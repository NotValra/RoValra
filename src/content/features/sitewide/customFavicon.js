const FAVICON_LINK_ID = 'rovalra-custom-favicon';
const ICON_LINK_SELECTOR =
    'link[rel~="icon" i], link[rel="shortcut icon" i], link[rel="mask-icon" i], link[rel="apple-touch-icon" i], link[rel="apple-touch-icon-precomposed" i]';

let enabled = false;
let targetUrl = null;
let resolvedHref = null;
let headObserver = null;
let suppressObserver = false;
let reapplyQueued = false;
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
    if (typeof href !== 'string') return '';
    if (href.startsWith('data:')) {
        const match = href.match(/^data:([^;,]+)/);
        return match ? match[1] : '';
    }
    const clean = href
        .split(/[?#]/)[0]
        .toLowerCase()
        .replace(/\/+$/, '');
    if (clean.endsWith('.svg')) return 'image/svg+xml';
    if (clean.endsWith('.png')) return 'image/png';
    if (clean.endsWith('.webp')) return 'image/webp';
    if (clean.endsWith('.gif')) return 'image/gif';
    if (clean.endsWith('.jpg') || clean.endsWith('.jpeg')) return 'image/jpeg';
    if (clean.endsWith('.ico')) return 'image/x-icon';
    return '';
}

function applyFavicon() {
    if (!enabled || !resolvedHref) return;

    suppressObserver = true;
    try {
        stashOriginalIconLinks();

        getForeignIconLinks().forEach((link) => link.remove());

        let link = document.getElementById(FAVICON_LINK_ID);
        if (!link) {
            link = document.createElement('link');
            link.id = FAVICON_LINK_ID;
            link.rel = 'icon';
        }

        const mime = guessMimeType(resolvedHref);
        if (mime) {
            link.setAttribute('type', mime);
        } else {
            link.removeAttribute('type');
        }

        if (link.getAttribute('href') !== resolvedHref) {
            link.setAttribute('href', resolvedHref);
        }

        getHead().appendChild(link);
    } catch (error) {
        console.warn('RoValra: Failed to apply custom favicon', error);
    } finally {
        suppressObserver = false;
    }
}

function restoreOriginalFavicon() {
    suppressObserver = true;
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
        suppressObserver = false;
        originalIconLinks = null;
    }
}

function queueReapply() {
    if (reapplyQueued) return;
    reapplyQueued = true;
    setTimeout(() => {
        reapplyQueued = false;
        if (enabled && resolvedHref) applyFavicon();
    }, 50);
}

function startObserver() {
    if (headObserver) return;

    headObserver = new MutationObserver((mutations) => {
        if (suppressObserver || !enabled || !resolvedHref) return;

        let needsReapply = false;
        for (const mutation of mutations) {
            if (mutation.type === 'childList') {
                for (const node of mutation.addedNodes) {
                    if (
                        node.nodeType === 1 &&
                        node.tagName === 'LINK' &&
                        node.id !== FAVICON_LINK_ID &&
                        node.matches(ICON_LINK_SELECTOR)
                    ) {
                        needsReapply = true;
                    }
                }
                for (const node of mutation.removedNodes) {
                    if (node.nodeType === 1 && node.id === FAVICON_LINK_ID) {
                        needsReapply = true;
                    }
                }
            } else if (mutation.type === 'attributes') {
                const el = mutation.target;
                if (
                    el.tagName === 'LINK' &&
                    el.id === FAVICON_LINK_ID &&
                    el.getAttribute('href') !== resolvedHref
                ) {
                    needsReapply = true;
                } else if (
                    el.tagName === 'LINK' &&
                    el.id !== FAVICON_LINK_ID &&
                    el.matches(ICON_LINK_SELECTOR)
                ) {
                    needsReapply = true;
                }
            }
            if (needsReapply) break;
        }

        if (needsReapply) queueReapply();
    });

    headObserver.observe(getHead(), {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['rel', 'href'],
    });
}

function stopObserver() {
    if (headObserver) {
        headObserver.disconnect();
        headObserver = null;
    }
}

async function resolveHref(url) {
    try {
        const cachedRaw = await chrome.storage.local.get('customFaviconImage');
        const cached = cachedRaw.customFaviconImage;
        if (
            cached &&
            typeof cached === 'object' &&
            cached.url === url &&
            typeof cached.data === 'string' &&
            cached.data.startsWith('data:')
        ) {
            return cached.data;
        }
    } catch (error) {
        console.warn('RoValra: Failed to read cached favicon', error);
    }

    try {
        const response = await fetch(url, { cache: 'force-cache' });
        if (response.ok) {
            const blob = await response.blob();
            if (blob.size > 0 && blob.size <= 1024 * 1024) {
                const dataUri = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = () => reject(reader.error);
                    reader.readAsDataURL(blob);
                });
                if (
                    typeof dataUri === 'string' &&
                    dataUri.startsWith('data:')
                ) {
                    chrome.storage.local
                        .set({
                            customFaviconImage: { url, data: dataUri },
                        })
                        .catch(() => {});
                    return dataUri;
                }
            }
        }
    } catch (error) {
       
    }

    return url;
}

async function refresh() {
    let stored;
    try {
        stored = await chrome.storage.local.get({
            customFaviconEnabled: false,
            customFaviconUrl: null,
        });
    } catch (error) {
        console.warn('RoValra: Failed to load favicon settings', error);
        return;
    }

    const nextEnabled =
        stored.customFaviconEnabled === true &&
        typeof stored.customFaviconUrl === 'string' &&
        stored.customFaviconUrl.trim() !== '';
    const nextUrl = nextEnabled ? stored.customFaviconUrl.trim() : null;

    if (!nextEnabled) {
        if (enabled) {
            enabled = false;
            targetUrl = null;
            resolvedHref = null;
            stopObserver();
            restoreOriginalFavicon();
        }
        return;
    }

    if (enabled && nextUrl === targetUrl && resolvedHref) {
        applyFavicon();
        return;
    }

    enabled = true;
    targetUrl = nextUrl;
    resolvedHref = null;

    const href = await resolveHref(nextUrl);

    if (!enabled || targetUrl !== nextUrl) return;

    resolvedHref = href;
    applyFavicon();
    startObserver();
}

export function init() {
    refresh();

    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== 'local') return;
            if (
                changes.customFaviconEnabled ||
                changes.customFaviconUrl ||
                changes.customFaviconImage
            ) {
                refresh();
            }
        });
    }

    document.addEventListener('rovalra:urlChanged', () => {
        if (enabled && resolvedHref) queueReapply();
    });
}
