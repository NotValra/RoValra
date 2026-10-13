// Makes Chrome-style content script code work on Firefox, so features can be written
// for Chrome only. Must be the first import of the content script.
//
// Firefox content scripts live in a sandbox that sees page objects through "Xray"
// wrappers and are subject to the page's CSP. Each function below smooths over one
// of those differences. They run at the bottom of this file.

import { convertWebkitScrollbarCss } from '../../firefox/scrollbarCss.mjs';

const CSP_ALLOWED_HOST =
    /(^|\.)(roblox\.com|rbxcdn\.com|rblx\.org|robloxlabs\.com|rbx\.com)$/i;

function getCspBlockedUrl(url) {
    if (!url) return null;
    try {
        const parsed = new URL(url, location.href);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
            return null;
        }
        return CSP_ALLOWED_HOST.test(parsed.hostname) ? null : parsed.href;
    } catch {
        return null;
    }
}

function getHttpUrl(url) {
    if (!url) return null;
    try {
        const parsed = new URL(url, location.href);
        return parsed.protocol === 'https:' || parsed.protocol === 'http:'
            ? parsed.href
            : null;
    } catch {
        return null;
    }
}

function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
}

function sendBackgroundMessage(message) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(message, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                resolve(response);
            }
        });
    });
}

// Chrome updates :hover before dispatching pointerout/mouseout, Firefox after. So in
// Firefox, element.matches(':hover') inside a pointerout handler still reports the
// element being left as hovered, and "did the pointer really leave?" checks never
// see the unhover. Track the hovered element from capture listeners on window (which
// run before any feature's listener) and answer matches(':hover') from that.
function patchHoverState() {
    let hoveredElement = null;
    let isTracking = false;

    const onOver = (event) => {
        isTracking = true;
        hoveredElement = event.target;
    };
    const onOut = (event) => {
        isTracking = true;
        hoveredElement = event.relatedTarget;
    };
    for (const [type, handler] of [
        ['pointerover', onOver],
        ['mouseover', onOver],
        ['pointerout', onOut],
        ['mouseout', onOut],
    ]) {
        window.addEventListener(type, handler, {
            capture: true,
            passive: true,
        });
    }

    const nativeMatches = Element.prototype.matches;
    Element.prototype.matches = function matches(selector) {
        if (
            isTracking &&
            typeof selector === 'string' &&
            selector.trim() === ':hover'
        ) {
            return (
                !!hoveredElement?.isConnected &&
                (this === hoveredElement || this.contains(hoveredElement))
            );
        }
        return nativeMatches.call(this, selector);
    };
}

// `const ric = window.requestIdleCallback; ric(cb)` throws in Firefox content scripts
// ("called on an object that does not implement interface Window"), so pre-bind them.
function bindWindowFunctions() {
    [
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'requestIdleCallback',
        'cancelIdleCallback',
        'queueMicrotask',
        'getComputedStyle',
        'matchMedia',
        'getSelection',
        'atob',
        'btoa',
    ].forEach((name) => {
        if (typeof window[name] === 'function') {
            window[name] = window[name].bind(window);
        }
    });
}

function patchCustomEventDetail() {
    const NativeCustomEvent = window.CustomEvent;

    const PatchedCustomEvent = function CustomEvent(type, init) {
        if (init && init.detail !== null && typeof init.detail === 'object') {
            try {
                init = { ...init, detail: cloneInto(init.detail, window) };
            } catch {}
        }
        return new NativeCustomEvent(type, init);
    };
    PatchedCustomEvent.prototype = NativeCustomEvent.prototype;
    window.CustomEvent = PatchedCustomEvent;
    globalThis.CustomEvent = PatchedCustomEvent;

    const nativeDetailGetter = Object.getOwnPropertyDescriptor(
        NativeCustomEvent.prototype,
        'detail',
    ).get;
    const detailCopies = new WeakMap();
    Object.defineProperty(NativeCustomEvent.prototype, 'detail', {
        configurable: true,
        enumerable: true,
        get() {
            const detail = nativeDetailGetter.call(this);
            if (detail === null || typeof detail !== 'object') return detail;
            if (detailCopies.has(this)) return detailCopies.get(this);
            let copy = detail;
            try {
                copy = structuredClone(detail);
            } catch {
                try {
                    copy = JSON.parse(JSON.stringify(detail));
                } catch {}
            }
            detailCopies.set(this, copy);
            return copy;
        },
    });
}

// Firefox starts content scripts later than Chrome, so a listener for an event that a
// MAIN world script dispatches early (e.g. rovalra-profile-platform-response) can be
// added after the event already fired. src/firefox/eventReplay.js remembers recent
// events of each type; when a listener is added late, it gets them delivered in order.
function replayMissedPageEvents() {
    const REPLAY_PREFIX = 'rovalra-firefox-replay';
    const proto = EventTarget.prototype;
    const nativeAddEventListener = proto.addEventListener;
    const nativeRemoveEventListener = proto.removeEventListener;

    let replayResponse = null;
    nativeAddEventListener.call(
        document,
        `${REPLAY_PREFIX}-response`,
        (event) => {
            replayResponse = event.detail;
        },
    );

    proto.addEventListener = function addEventListener(
        type,
        listener,
        options,
    ) {
        nativeAddEventListener.call(this, type, listener, options);

        const targetName =
            this === window ? 'window' : this === document ? 'document' : null;
        if (
            !listener ||
            !targetName ||
            typeof type !== 'string' ||
            !/^rovalra[-:_]/i.test(type) ||
            type.startsWith(REPLAY_PREFIX)
        ) {
            return;
        }

        replayResponse = null;
        document.dispatchEvent(
            new CustomEvent(`${REPLAY_PREFIX}-request`, {
                detail: { type, target: targetName },
            }),
        );
        const missedDetails = replayResponse?.details || [];
        replayResponse = null;
        if (!missedDetails.length) return;

        let newerEventArrived = false;
        const markNewerEvent = () => {
            newerEventArrived = true;
        };
        nativeAddEventListener.call(this, type, markNewerEvent, { once: true });
        Promise.resolve().then(() => {
            nativeRemoveEventListener.call(this, type, markNewerEvent);
            if (newerEventArrived) return;
            const once = typeof options === 'object' && options?.once;
            if (once) {
                nativeRemoveEventListener.call(this, type, listener, options);
            }
            for (const detail of once
                ? missedDetails.slice(-1)
                : missedDetails) {
                const event = new CustomEvent(type, { detail });
                try {
                    if (typeof listener === 'function')
                        listener.call(this, event);
                    else listener.handleEvent?.(event);
                } catch (error) {
                    console.error(error);
                }
            }
        });
    };
}

// Response/Blob/XHR bodies are page objects in Firefox content scripts:
// - response.json() objects can't hold content script objects (e.g.
//   `data.finalUpdate = promise` throws), so parse the text here instead
// - arrayBuffer() buffers throw on subarray()/slice() of a Uint8Array over them
//   ("Permission denied to access property constructor"), which breaks binary
//   decoding (fflate, fzstd, meshes), so return a copy owned by the content script
function patchResponseBodies() {
    const toOwnBuffer = (buffer) => structuredClone(buffer);

    Response.prototype.json = async function json() {
        return JSON.parse(await this.text());
    };

    const nativeResponseArrayBuffer = Response.prototype.arrayBuffer;
    Response.prototype.arrayBuffer = async function arrayBuffer() {
        return toOwnBuffer(await nativeResponseArrayBuffer.call(this));
    };
    if (typeof Response.prototype.bytes === 'function') {
        Response.prototype.bytes = async function bytes() {
            return new Uint8Array(await this.arrayBuffer());
        };
    }

    const nativeBlobArrayBuffer = Blob.prototype.arrayBuffer;
    Blob.prototype.arrayBuffer = async function arrayBuffer() {
        return toOwnBuffer(await nativeBlobArrayBuffer.call(this));
    };
    if (typeof Blob.prototype.bytes === 'function') {
        Blob.prototype.bytes = async function bytes() {
            return new Uint8Array(await this.arrayBuffer());
        };
    }

    const nativeXhrResponse = Object.getOwnPropertyDescriptor(
        XMLHttpRequest.prototype,
        'response',
    );
    Object.defineProperty(XMLHttpRequest.prototype, 'response', {
        configurable: true,
        enumerable: true,
        get() {
            const response = nativeXhrResponse.get.call(this);
            if (
                response &&
                typeof response === 'object' &&
                (this.responseType === 'arraybuffer' ||
                    this.responseType === 'json')
            ) {
                try {
                    return structuredClone(response);
                } catch {
                    return response;
                }
            }
            return response;
        },
    });
}

// Iterators of page objects (headers.entries(), for...of over URLSearchParams) can't
// be consumed by content script code, e.g. Object.fromEntries(headers.entries())
// throws "not iterable". Rebuild them from forEach, which works.
function patchIterables() {
    [window.Headers, window.URLSearchParams, window.FormData].forEach(
        (Ctor) => {
            if (!Ctor?.prototype?.forEach) return;
            const proto = Ctor.prototype;
            const nativeForEach = proto.forEach;
            const getPairs = (target) => {
                const pairs = [];
                nativeForEach.call(target, (value, key) =>
                    pairs.push([key, value]),
                );
                return pairs;
            };

            proto.entries = function entries() {
                return getPairs(this)[Symbol.iterator]();
            };
            proto.keys = function keys() {
                return getPairs(this)
                    .map(([key]) => key)
                    [Symbol.iterator]();
            };
            proto.values = function values() {
                return getPairs(this)
                    .map(([, value]) => value)
                    [Symbol.iterator]();
            };
            proto[Symbol.iterator] = proto.entries;
        },
    );
}

// Roblox's CSP (connect-src) blocks content script requests to other hosts like
// rovalra.com in Firefox. Those are made by the background script instead and
// returned as a normal Response, so callers don't notice.
function patchFetch() {
    const nativeFetch = globalThis.fetch.bind(globalThis);
    const NULL_BODY_STATUSES = [101, 204, 205, 304];

    const headersToObject = (headers) => {
        const result = {};
        new Headers(headers || {}).forEach((value, key) => {
            result[key] = value;
        });
        return result;
    };

    const proxiedFetch = async function fetch(input, init = {}) {
        const isRequest = input instanceof Request;
        const url = getCspBlockedUrl(isRequest ? input.url : String(input));
        if (!url) return nativeFetch(input, init);

        let { method, headers, body, credentials, cache, redirect, signal } =
            init;
        if (isRequest) {
            method ??= input.method;
            headers ??= input.headers;
            credentials ??= input.credentials;
            cache ??= input.cache;
            redirect ??= input.redirect;
            signal ??= input.signal;
            if (body === undefined && !['GET', 'HEAD'].includes(input.method)) {
                body = await input.clone().arrayBuffer();
            }
        }

        if (
            typeof ReadableStream !== 'undefined' &&
            body instanceof ReadableStream
        ) {
            return nativeFetch(input, init);
        }
        if (body instanceof URLSearchParams) body = body.toString();
        if (body instanceof Blob) body = await body.arrayBuffer();
        if (body instanceof FormData) {
            body = await new Response(body).arrayBuffer();
        }

        signal?.throwIfAborted();
        const response = await sendBackgroundMessage({
            action: 'proxyFetch',
            url,
            options: {
                method,
                headers: headersToObject(headers),
                body,
                credentials,
                cache,
                redirect,
            },
        }).catch(() => null);
        signal?.throwIfAborted();

        if (!response || response.error) {
            throw new TypeError(
                response?.error ||
                    'NetworkError when attempting to fetch resource.',
            );
        }

        const { body: responseBody, ...responseInit } = response;
        return new Response(
            NULL_BODY_STATUSES.includes(responseInit.status)
                ? null
                : responseBody,
            responseInit,
        );
    };

    window.fetch = proxiedFetch;
    globalThis.fetch = proxiedFetch;
}

// Fonts from other hosts can fail in Firefox: elements and stylesheets added by a
// content script can't make CORS requests ("CORS header 'Origin' cannot be added"),
// and web fonts always need CORS. This affects the @font-face rules in the
// extension's own CSS (Builder/RoValra icons on rovalra.com) and stylesheets
// content scripts add with <link> (Google Material Icons). The fonts are fetched by
// the background script and registered with the FontFace API instead, which doesn't
// need CORS; FontFace API fonts take precedence over the failing CSS ones.
function loadRemoteFonts() {
    const FONT_FACE_REGEX = /@font-face\s*\{[^}]*\}/gi;
    const SRC_URL_REGEX =
        /url\(\s*(['"]?)([^'")]+)\1\s*\)\s*(?:format\(\s*(['"]?)([^'")]+)\3\s*\))?/gi;
    const fontDataUrls = new Map();
    const handledFonts = new Set();
    const handledLinks = new WeakSet();

    const getDescriptor = (block, name) =>
        block
            .match(
                new RegExp(`(?:^|[{;\\s])${name}\\s*:\\s*([^;}]+)`, 'i'),
            )?.[1]
            ?.trim()
            .replace(/^['"]|['"]$/g, '');

    const fetchAsDataUrl = (url) => {
        if (!fontDataUrls.has(url)) {
            fontDataUrls.set(
                url,
                /* Verified */ fetch(url)
                    .then(async (response) => {
                        if (!response.ok) throw new Error(response.status);
                        const type =
                            response.headers
                                .get('content-type')
                                ?.split(';')[0] || 'font/woff2';
                        const base64 = arrayBufferToBase64(
                            await response.arrayBuffer(),
                        );
                        return `data:${type};base64,${base64}`;
                    })
                    .catch(() => null),
            );
        }
        return fontDataUrls.get(url);
    };

    const loadFontFace = async (block, baseUrl) => {
        const family = getDescriptor(block, 'font-family');
        if (!family) return;

        const sources = [...block.matchAll(SRC_URL_REGEX)]
            .map((match) => {
                try {
                    return {
                        url: getHttpUrl(new URL(match[2], baseUrl).href),
                        format: match[4],
                    };
                } catch {
                    return { url: null };
                }
            })
            .filter((source) => source.url);
        const source =
            sources.find((s) => /woff2/i.test(s.format || s.url)) || sources[0];
        if (!source) return;

        const descriptors = {};
        for (const [property, key] of [
            ['font-weight', 'weight'],
            ['font-style', 'style'],
            ['font-stretch', 'stretch'],
            ['font-display', 'display'],
            ['unicode-range', 'unicodeRange'],
        ]) {
            const value = getDescriptor(block, property);
            if (value) descriptors[key] = value;
        }

        const fontKey = `${family}|${JSON.stringify(descriptors)}|${source.url}`;
        if (handledFonts.has(fontKey)) return;
        handledFonts.add(fontKey);

        const dataUrl = await fetchAsDataUrl(source.url);
        if (!dataUrl) return;
        const format = source.format ? ` format("${source.format}")` : '';
        try {
            const face = new FontFace(
                family,
                `url("${dataUrl}")${format}`,
                cloneInto(descriptors, window),
            );
            document.fonts.add(face);
            await face.load();
        } catch (error) {
            console.warn('RoValra: Failed to load font', family, error);
        }
    };

    const loadFontsFromCss = (cssText, baseUrl) =>
        Promise.all(
            (cssText.match(FONT_FACE_REGEX) || []).map((block) =>
                loadFontFace(block, baseUrl),
            ),
        );

    const cssFiles = [
        ...new Set(
            chrome.runtime
                .getManifest()
                .content_scripts.flatMap((script) => script.css || []),
        ),
    ];
    cssFiles.forEach((file) => {
        const url = chrome.runtime.getURL(file);
        /* Verified */ fetch(url)
            .then((response) => response.text())
            .then((css) => loadFontsFromCss(css, url))
            .catch(() => {});
    });

    const handleLink = (link) => {
        if (handledLinks.has(link)) return;
        if (!/\bstylesheet\b/i.test(link.rel || '')) return;
        const url = getCspBlockedUrl(link.href);
        if (!url) return;
        handledLinks.add(link);

        /* Verified */ fetch(url)
            .then((response) => {
                if (!response.ok) throw new Error(response.status);
                return response.text();
            })
            .then((css) => {
                const rules = css.replace(FONT_FACE_REGEX, '').trim();
                if (rules) {
                    const style =
                        /* Verified */ document.createElement('style');
                    style.dataset.rovalraFirefoxStylesheet = url;
                    style.textContent = rules;
                    link.after(style);
                }
                return loadFontsFromCss(css, url);
            })
            .catch(() => {});
    };

    const handleTree = (node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        if (node.tagName === 'LINK') handleLink(node);
        else
            node.querySelectorAll('link[rel~="stylesheet"]').forEach(
                handleLink,
            );
    };

    // Needs <link> elements anywhere in the document from document_start, which
    // observeElement doesn't cover
    //Verified
    new MutationObserver((mutations) => {
        for (const mutation of mutations)
            mutation.addedNodes.forEach(handleTree);
    }).observe(document, { childList: true, subtree: true });

    if (document.documentElement) handleTree(document.documentElement);
}

// builder_icons.scss sizes <icon size="18px"> with typed attr()
// (`--icon-size: attr(size type(<length>))`), which Firefox doesn't support, so
// those icons fall back to 1em (e.g. tiny icons on game cards). Set the same custom
// property inline instead. Preset sizes (small, large, ...) are handled by the CSS.
function patchIconSizeAttribute() {
    if (CSS.supports('width: attr(size type(<length>))')) return;

    const PRESET_SIZES = new Set([
        'xsmall',
        'x-small',
        'xs',
        'small',
        's',
        'medium',
        'med',
        'm',
        'large',
        'l',
        'xl',
        'x-large',
        'xlarge',
        'xxl',
        'xxlarge',
        'xx-large',
    ]);

    const syncIconSize = (icon) => {
        const size = icon.getAttribute('size')?.trim();
        if (size && !PRESET_SIZES.has(size) && CSS.supports('width', size)) {
            if (icon.style.getPropertyValue('--icon-size') !== size) {
                icon.style.setProperty('--icon-size', size);
            }
        } else if (icon.style.getPropertyValue('--icon-size')) {
            icon.style.removeProperty('--icon-size');
        }
    };

    const syncTree = (node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        if (node.tagName === 'ICON') syncIconSize(node);
        node.querySelectorAll('icon[size]').forEach(syncIconSize);
    };

    //Verified
    new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'attributes') syncIconSize(mutation.target);
            else mutation.addedNodes.forEach(syncTree);
        }
    }).observe(document, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['size'],
    });

    if (document.documentElement) syncTree(document.documentElement);
}

// <style> elements injected from JS use ::-webkit-scrollbar too, which Firefox ignores.
// Each gets a companion <style> with the Firefox equivalents (the extension's CSS
// files are converted at build time by scripts/build-firefox.js).
function patchScrollbarStyles() {
    const companions = new WeakMap();

    const syncStyle = (style) => {
        if (style.dataset.rovalraFirefoxScrollbars) return;
        const firefoxCss = convertWebkitScrollbarCss(style.textContent);
        let companion = companions.get(style);
        if (!firefoxCss) {
            companion?.remove();
            return;
        }
        if (!companion) {
            companion = /* Verified */ document.createElement('style');
            companion.dataset.rovalraFirefoxScrollbars = 'true';
            companions.set(style, companion);
        }
        if (companion.textContent !== firefoxCss)
            companion.textContent = firefoxCss;
        if (companion.previousSibling !== style) style.after(companion);
    };

    const syncTree = (node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        if (node.tagName === 'STYLE') syncStyle(node);
        else node.querySelectorAll('style').forEach(syncStyle);
    };

    //Verified
    new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            const target =
                mutation.target.nodeType === Node.ELEMENT_NODE
                    ? mutation.target
                    : mutation.target.parentElement;
            if (target?.tagName === 'STYLE') syncStyle(target);
            mutation.addedNodes.forEach(syncTree);
        }
    }).observe(document, {
        childList: true,
        subtree: true,
        characterData: true,
    });

    if (document.documentElement) syncTree(document.documentElement);
}

// Roblox's CSP (img-src) also blocks images from other hosts, like rovalra.com,
// flagcdn.com and GitHub. data: URLs are allowed, so blocked images are fetched by the
// background script and swapped in as data URLs. Images set from code are handled when
// src is set; the MutationObserver catches images from HTML (innerHTML, templates).
function initExternalImageProxy() {
    const CSS_URL_REGEX = /url\(\s*(['"]?)(.*?)\1\s*\)/g;
    const dataUrlCache = new Map();

    const toDataUrl = (url) => {
        if (!dataUrlCache.has(url)) {
            dataUrlCache.set(
                url,
                sendBackgroundMessage({ action: 'fetchImageAsDataUrl', url })
                    .then((response) => {
                        if (!response?.dataUrl) throw new Error('No image');
                        return response.dataUrl;
                    })
                    .catch(() => {
                        dataUrlCache.delete(url);
                        return null;
                    }),
            );
        }
        return dataUrlCache.get(url);
    };

    // Proxy at the moment src is set rather than when the image is attached, so
    // detached images work too (e.g. new Image() or an <img> only appended in its
    // onload, which with crossOrigin set fails in Firefox with "CORS header 'Origin'
    // cannot be added"). The blocked request is never made. img.src still returns
    // the original URL so code comparing URLs keeps working.
    const imgProto = HTMLImageElement.prototype;
    const nativeSrc = Object.getOwnPropertyDescriptor(imgProto, 'src');
    const nativeSrcset = Object.getOwnPropertyDescriptor(imgProto, 'srcset');
    const nativeSetAttribute = Element.prototype.setAttribute;
    const nativeRemoveAttribute = Element.prototype.removeAttribute;
    const proxiedSources = new WeakMap();

    // Blocked hosts, and any image with crossOrigin set: content script created
    // elements can't make CORS requests in Firefox ("CORS header 'Origin' cannot be
    // added"), even to Roblox's CDN
    const getProxiedImageUrl = (img, url) =>
        getCspBlockedUrl(url) ||
        (img.hasAttribute('crossorigin') ? getHttpUrl(url) : null);

    const setImageSrc = (img, value) => {
        const blockedUrl = getProxiedImageUrl(img, String(value));
        if (!blockedUrl) {
            proxiedSources.delete(img);
            nativeSrc.set.call(img, value);
            return;
        }
        proxiedSources.set(img, blockedUrl);
        toDataUrl(blockedUrl).then((dataUrl) => {
            if (proxiedSources.get(img) !== blockedUrl) return;
            nativeSrc.set.call(img, dataUrl || blockedUrl);
        });
    };

    const setImageSrcset = (img, value) => {
        const candidates = String(value)
            .split(',')
            .map((part) => part.trim().split(/\s+/)[0])
            .filter(Boolean);
        if (!candidates.some((candidate) => getCspBlockedUrl(candidate))) {
            nativeSrcset.set.call(img, value);
            return;
        }
        if (!img.getAttribute('src') && candidates[0]) {
            setImageSrc(img, candidates[0]);
        }
    };

    Object.defineProperty(imgProto, 'src', {
        configurable: true,
        enumerable: true,
        get() {
            const current = nativeSrc.get.call(this);
            const original = proxiedSources.get(this);
            return original && (!current || current.startsWith('data:'))
                ? original
                : current;
        },
        set(value) {
            setImageSrc(this, value);
        },
    });
    Object.defineProperty(imgProto, 'srcset', {
        configurable: true,
        enumerable: true,
        get() {
            return nativeSrcset.get.call(this);
        },
        set(value) {
            setImageSrcset(this, value);
        },
    });
    Element.prototype.setAttribute = function setAttribute(name, value) {
        if (this.tagName === 'IMG') {
            const attribute = String(name).toLowerCase();
            if (attribute === 'src') return setImageSrc(this, value);
            if (attribute === 'srcset') return setImageSrcset(this, value);
        }
        return nativeSetAttribute.call(this, name, value);
    };
    Element.prototype.removeAttribute = function removeAttribute(name) {
        if (this.tagName === 'IMG' && String(name).toLowerCase() === 'src') {
            proxiedSources.delete(this);
        }
        return nativeRemoveAttribute.call(this, name);
    };

    const fixImage = (img) => {
        const srcset = img.getAttribute('srcset');
        if (
            srcset &&
            srcset
                .split(',')
                .some((part) => getCspBlockedUrl(part.trim().split(/\s+/)[0]))
        ) {
            img.removeAttribute('srcset');
            if (!img.getAttribute('src')) {
                img.setAttribute('src', srcset.trim().split(/\s+/)[0]);
            }
        }

        const src = img.getAttribute('src');
        const blockedUrl = getProxiedImageUrl(img, src);
        if (!blockedUrl) return;

        toDataUrl(blockedUrl).then((dataUrl) => {
            if (dataUrl && img.getAttribute('src') === src) {
                img.dataset.rovalraOriginalSrc = blockedUrl;
                img.setAttribute('src', dataUrl);
            }
        });
    };

    const fixInlineBackground = (el) => {
        const style = el.getAttribute('style');
        if (!style || !style.includes('url(')) return;

        const backgroundImage = el.style.backgroundImage;
        const blockedUrls = [...backgroundImage.matchAll(CSS_URL_REGEX)]
            .map((match) => [match[2], getCspBlockedUrl(match[2])])
            .filter(([, blockedUrl]) => blockedUrl);
        if (!blockedUrls.length) return;

        Promise.all(
            blockedUrls.map(([, blockedUrl]) => toDataUrl(blockedUrl)),
        ).then((dataUrls) => {
            if (el.style.backgroundImage !== backgroundImage) return;
            let updated = backgroundImage;
            blockedUrls.forEach(([original], i) => {
                if (dataUrls[i])
                    updated = updated.split(original).join(dataUrls[i]);
            });
            if (updated !== backgroundImage) el.style.backgroundImage = updated;
        });
    };

    const fixElement = (el) => {
        if (el.tagName === 'IMG') fixImage(el);
        fixInlineBackground(el);
    };

    const fixTree = (root) => {
        if (root.nodeType !== Node.ELEMENT_NODE) return;
        fixElement(root);
        root.querySelectorAll('img, [style*="url("]').forEach(fixElement);
    };

    //Verified
    new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'attributes') {
                fixElement(mutation.target);
            } else {
                mutation.addedNodes.forEach(fixTree);
            }
        }
    }).observe(document, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['src', 'srcset', 'style'],
    });

    if (document.documentElement) fixTree(document.documentElement);
}

if (typeof cloneInto === 'function') {
    bindWindowFunctions();
    patchHoverState();
    patchCustomEventDetail();
    replayMissedPageEvents();
    patchResponseBodies();
    patchIterables();
    patchFetch();
    patchScrollbarStyles();
    patchIconSizeAttribute();
    loadRemoteFonts();
    initExternalImageProxy();
}
