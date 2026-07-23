import { observeElement } from '../../core/observer.js';
import { settings } from '../../core/settings/getSettings.js';
import { handleSaveSettings } from '../../core/settings/handlesettings.js';

const LOGO_IMAGE_ID = 'rovalra-custom-roblox-banner-image';
const LOGO_WRAPPER_ID = 'rovalra-custom-roblox-banner-wrapper';
const LOGO_READY_ATTR = 'data-rovalra-custom-roblox-banner-ready';
const LOGO_HIDDEN_CLASS = 'rovalra-custom-roblox-banner-hidden';
const STYLE_ID = 'rovalra-custom-roblox-banner-style';
const ORIGINAL_WIDTH_ATTR = 'data-rovalra-custom-roblox-banner-width';
const ORIGINAL_HEIGHT_ATTR = 'data-rovalra-custom-roblox-banner-height';
const ORIGINAL_OVERFLOW_ATTR = 'data-rovalra-custom-roblox-banner-overflow';
const ORIGINAL_POSITION_ATTR = 'data-rovalra-custom-roblox-banner-position';
const ORIGINAL_DISPLAY_ATTR = 'data-rovalra-custom-roblox-banner-display';
const TOPBAR_ROOT_SELECTOR = '#header > .container-fluid';
const IMAGE_URL_SETTING = 'customRobloxBannerImageUrl';
const LEGACY_IMAGE_SETTING = 'customRobloxBannerImage';
const TOPBAR_MAX_Y = 96;
const TOPBAR_MAX_X = 220;
const DEFAULT_LOGO_SIZE = 28;

let initialized = false;
let currentEnabled = false;
let currentImageUrl = null;
let currentFitMode = 'contain';
let currentPositionX = 50;
let currentPositionY = 50;
let currentZoom = 100;
const failedImageUrls = new Set();

const logoSelectors = [
    `${TOPBAR_ROOT_SELECTOR} > .rbx-navbar-header`,
    `${TOPBAR_ROOT_SELECTOR} > .rbx-navbar-header #nav-logo-link[href]`,
    `${TOPBAR_ROOT_SELECTOR} > .rbx-navbar-header a[href="/home"]`,
    '[data-rovalra-topbar-layout-key="logo"]',
    '[data-rovalra-topbar-layout-key="logo"] #nav-logo-link[href]',
    '#header a[href="/home"]',
    '#navigation-container a[href="/home"]',
    'a.navbar-brand[href="/home"]',
    'a[href="/home"] .icon-logo-r',
    'a[href="/home"] .icon-logo',
    '.navbar-brand .icon-logo-r',
    '.navbar-brand .icon-logo',
];

function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        .${LOGO_HIDDEN_CLASS} {
            display: none !important;
        }

        #${LOGO_IMAGE_ID} {
            display: block;
            pointer-events: none;
        }

        #${LOGO_WRAPPER_ID} {
            display: block;
            line-height: 0;
            overflow: hidden;
            pointer-events: none;
        }
    `;
    document.documentElement.appendChild(style);
}

function isTopLeftElement(element) {
    if (!(element instanceof Element)) return false;

    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    if (rect.top < -1 || rect.left < -1) return false;

    return rect.top <= TOPBAR_MAX_Y && rect.left <= TOPBAR_MAX_X;
}

function isVisibleLogoElement(element) {
    if (!(element instanceof Element)) return false;

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
}

function getTopbarLogoHost(element) {
    const topbarRoot = element.closest?.(TOPBAR_ROOT_SELECTOR);
    const logoContainer = element.closest?.('.rbx-navbar-header');
    if (!topbarRoot || logoContainer?.parentElement !== topbarRoot) return null;

    const logoLink = logoContainer.querySelector(
        '#nav-logo-link[href], a.navbar-brand[href="/home"], a[href="/home"]',
    );
    if (!logoLink || !isVisibleLogoElement(logoContainer)) return null;

    return logoLink;
}

function getLogoHost(element) {
    const topbarHost = getTopbarLogoHost(element);
    if (topbarHost) return topbarHost;

    const anchor = element.closest?.('a[href="/home"]');
    if (anchor && isTopLeftElement(anchor)) return anchor;

    const brand = element.closest?.('.navbar-brand');
    if (brand && isTopLeftElement(brand)) return brand;

    if (isTopLeftElement(element)) return element;

    return null;
}

function getLogoVisuals(host) {
    return [
        ...host.querySelectorAll(
            '.icon-logo-r, .icon-logo, [class*="logo"]:not(img)',
        ),
    ].filter((element) => element.id !== LOGO_IMAGE_ID);
}

function getElementSize(element) {
    const hadHiddenClass = element.classList.contains(LOGO_HIDDEN_CLASS);
    if (hadHiddenClass) element.classList.remove(LOGO_HIDDEN_CLASS);

    const rect = element.getBoundingClientRect();
    const computedStyle = getComputedStyle(element);
    const width = parseFloat(computedStyle.width) || rect.width || 0;
    const height = parseFloat(computedStyle.height) || rect.height || 0;

    if (hadHiddenClass) element.classList.add(LOGO_HIDDEN_CLASS);

    return { width, height };
}

function getUsableLogoSize(element) {
    const size = getElementSize(element);
    if (size.width <= 0 || size.height <= 0) return null;

    return {
        width: Math.max(size.width, DEFAULT_LOGO_SIZE),
        height: Math.max(size.height, DEFAULT_LOGO_SIZE),
    };
}

function getPreferredVisualSize(visuals) {
    const fullLogo = visuals.find((element) =>
        element.classList.contains('icon-logo'),
    );
    const compactLogo = visuals.find((element) =>
        element.classList.contains('icon-logo-r'),
    );
    const otherLogos = visuals.filter(
        (element) => element !== fullLogo && element !== compactLogo,
    );
    const candidates = [fullLogo, ...otherLogos, compactLogo].filter(Boolean);

    for (const element of candidates) {
        const size = getUsableLogoSize(element);
        if (size) return size;
    }

    return null;
}

function getStoredLogoSize(host) {
    const storedWidth = Number(host.getAttribute(ORIGINAL_WIDTH_ATTR));
    const storedHeight = Number(host.getAttribute(ORIGINAL_HEIGHT_ATTR));
    if (storedWidth > 0 && storedHeight > 0) {
        return {
            width: storedWidth,
            height: storedHeight,
        };
    }

    return null;
}

function getHostSize(host) {
    const hostRect = host.getBoundingClientRect();
    if (hostRect.width > 0 && hostRect.height > 0) {
        return {
            width: Math.max(hostRect.width, DEFAULT_LOGO_SIZE),
            height: Math.max(hostRect.height, DEFAULT_LOGO_SIZE),
        };
    }

    return {
        width: DEFAULT_LOGO_SIZE,
        height: DEFAULT_LOGO_SIZE,
    };
}

function getLogoSize(host, visuals) {
    return (
        getPreferredVisualSize(visuals) ||
        getStoredLogoSize(host) ||
        getHostSize(host)
    );
}

function storeLogoSize(host, size) {
    host.setAttribute(ORIGINAL_WIDTH_ATTR, String(Math.round(size.width)));
    host.setAttribute(ORIGINAL_HEIGHT_ATTR, String(Math.round(size.height)));
}

function storeHostStyles(host) {
    if (!host.hasAttribute(ORIGINAL_OVERFLOW_ATTR)) {
        host.setAttribute(ORIGINAL_OVERFLOW_ATTR, host.style.overflow || '');
    }
    if (!host.hasAttribute(ORIGINAL_POSITION_ATTR)) {
        host.setAttribute(ORIGINAL_POSITION_ATTR, host.style.position || '');
    }
    if (!host.hasAttribute(ORIGINAL_DISPLAY_ATTR)) {
        host.setAttribute(ORIGINAL_DISPLAY_ATTR, host.style.display || '');
    }
}

function applyHostStyles(host) {
    storeHostStyles(host);

    const computedStyle = getComputedStyle(host);
    if (computedStyle.position === 'static') {
        host.style.position = 'relative';
    }
    if (computedStyle.display === 'inline') {
        host.style.display = 'inline-flex';
    }
}

function restoreHostStyles(host) {
    if (host.hasAttribute(ORIGINAL_OVERFLOW_ATTR)) {
        host.style.overflow = host.getAttribute(ORIGINAL_OVERFLOW_ATTR) || '';
        host.removeAttribute(ORIGINAL_OVERFLOW_ATTR);
    }
    if (host.hasAttribute(ORIGINAL_POSITION_ATTR)) {
        host.style.position = host.getAttribute(ORIGINAL_POSITION_ATTR) || '';
        host.removeAttribute(ORIGINAL_POSITION_ATTR);
    }
    if (host.hasAttribute(ORIGINAL_DISPLAY_ATTR)) {
        host.style.display = host.getAttribute(ORIGINAL_DISPLAY_ATTR) || '';
        host.removeAttribute(ORIGINAL_DISPLAY_ATTR);
    }
}

function applyLogoFrame(frame, size) {
    frame.style.width = `${Math.round(size.width)}px`;
    frame.style.height = `${Math.round(size.height)}px`;
    frame.style.maxWidth = `${Math.round(size.width)}px`;
    frame.style.maxHeight = `${Math.round(size.height)}px`;
    frame.style.overflow = 'hidden';
    frame.style.flexShrink = '0';
}

function applyImageFit(image, size) {
    const fitMode =
        currentFitMode === 'stretch' || currentFitMode === 'cover'
            ? currentFitMode
            : 'contain';

    image.style.setProperty(
        'width',
        `${Math.round(size.width)}px`,
        'important',
    );
    image.style.setProperty(
        'height',
        `${Math.round(size.height)}px`,
        'important',
    );
    image.style.setProperty('max-width', 'none', 'important');
    image.style.setProperty('max-height', 'none', 'important');
    image.style.objectFit = fitMode === 'stretch' ? 'fill' : fitMode;
    image.style.objectPosition = `${currentPositionX}% ${currentPositionY}%`;
    image.style.transform = `scale(${currentZoom / 100})`;
    image.style.transformOrigin = `${currentPositionX}% ${currentPositionY}%`;
    image.style.flexShrink = '0';
}

function normalizePosition(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 50;

    return Math.max(0, Math.min(100, number));
}

function normalizeZoom(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 100;

    return Math.max(25, Math.min(300, number));
}

function normalizeImageUrl(value) {
    if (typeof value !== 'string') return null;

    const trimmedValue = value.trim();
    if (!trimmedValue) return null;

    try {
        const url = new URL(trimmedValue);
        return url.protocol === 'http:' || url.protocol === 'https:'
            ? trimmedValue
            : null;
    } catch {
        return null;
    }
}

function isLegacyImageValue(value) {
    if (typeof value !== 'string') return false;

    return (
        value.startsWith('data:') ||
        value.startsWith('blob:') ||
        value.startsWith('filesystem:')
    );
}

async function clearIncompatibleStoredValues() {
    const stored = await chrome.storage.local.get([
        IMAGE_URL_SETTING,
        LEGACY_IMAGE_SETTING,
        'rovalra_settings',
    ]);
    const updates = {};
    const removals = [];
    let settingsDataChanged = false;
    const settingsData =
        stored.rovalra_settings && typeof stored.rovalra_settings === 'object'
            ? { ...stored.rovalra_settings }
            : null;

    if (
        isLegacyImageValue(stored[LEGACY_IMAGE_SETTING]) ||
        isLegacyImageValue(settingsData?.[LEGACY_IMAGE_SETTING])
    ) {
        removals.push(LEGACY_IMAGE_SETTING);
        if (settingsData) {
            delete settingsData[LEGACY_IMAGE_SETTING];
            settingsDataChanged = true;
        }
    }

    const storedUrl = stored[IMAGE_URL_SETTING];
    const settingsUrl = settingsData?.[IMAGE_URL_SETTING];
    const hasInvalidStoredUrl =
        typeof storedUrl === 'string' &&
        storedUrl.trim() &&
        !normalizeImageUrl(storedUrl);
    const hasInvalidSettingsUrl =
        typeof settingsUrl === 'string' &&
        settingsUrl.trim() &&
        !normalizeImageUrl(settingsUrl);

    if (hasInvalidStoredUrl || hasInvalidSettingsUrl) {
        removals.push(IMAGE_URL_SETTING);
        if (settingsData) {
            delete settingsData[IMAGE_URL_SETTING];
            settingsDataChanged = true;
        }
    }

    if (settingsDataChanged) updates.rovalra_settings = settingsData;
    if (removals.length) await chrome.storage.local.remove(removals);
    if (Object.keys(updates).length) await chrome.storage.local.set(updates);
}

function clearLogo(host) {
    if (!host) return;

    host.removeAttribute(LOGO_READY_ATTR);
    host.removeAttribute(ORIGINAL_WIDTH_ATTR);
    host.removeAttribute(ORIGINAL_HEIGHT_ATTR);
    restoreHostStyles(host);
    host.querySelector(`#${LOGO_WRAPPER_ID}`)?.remove();
    host.querySelector(`#${LOGO_IMAGE_ID}`)?.remove();
    getLogoVisuals(host).forEach((element) => {
        element.classList.remove(LOGO_HIDDEN_CLASS);
    });
}

function revealLoadedLogo(host, image) {
    if (
        !host ||
        !image ||
        !image.isConnected ||
        image.dataset.rovalraCustomRobloxBannerUrl !== currentImageUrl
    ) {
        return;
    }
    if (!image.complete || image.naturalWidth <= 0) return;

    const visuals = getLogoVisuals(host);
    const size = getLogoSize(host, visuals);
    const frame = image.closest(`#${LOGO_WRAPPER_ID}`);
    if (!frame) return;

    storeLogoSize(host, size);
    applyHostStyles(host);
    applyLogoFrame(frame, size);
    applyImageFit(image, size);
    visuals.forEach((element) => {
        element.classList.add(LOGO_HIDDEN_CLASS);
    });
    image.style.visibility = 'visible';
    host.setAttribute(LOGO_READY_ATTR, 'true');
}

function applyLogo(host) {
    if (!host) return;

    if (
        !currentEnabled ||
        !currentImageUrl ||
        failedImageUrls.has(currentImageUrl)
    ) {
        clearLogo(host);
        return;
    }

    injectStyles();

    let image = host.querySelector(`#${LOGO_IMAGE_ID}`);
    if (
        image?.dataset.rovalraCustomRobloxBannerUrl !== currentImageUrl ||
        (image && !image.closest(`#${LOGO_WRAPPER_ID}`))
    ) {
        clearLogo(host);
        const frame = document.createElement('span');
        frame.id = LOGO_WRAPPER_ID;
        image = document.createElement('img');
        image.id = LOGO_IMAGE_ID;
        image.alt = 'Roblox';
        image.dataset.rovalraCustomRobloxBannerUrl = currentImageUrl;
        image.style.visibility = 'hidden';
        frame.appendChild(image);
        host.appendChild(frame);
    }

    image.onload = () => {
        revealLoadedLogo(host, image);
    };
    image.onerror = () => {
        if (
            !image.isConnected ||
            image.dataset.rovalraCustomRobloxBannerUrl !== currentImageUrl
        )
            return;

        failedImageUrls.add(currentImageUrl);
        clearLogo(host);
    };

    if (image.src !== currentImageUrl) {
        image.src = currentImageUrl;
        revealLoadedLogo(host, image);
    } else {
        revealLoadedLogo(host, image);
    }
}

function syncLogoElement(element) {
    const host = getLogoHost(element);
    if (!host) return;

    applyLogo(host);
}

function syncAllLogoElements() {
    const hosts = new Set();

    for (const selector of logoSelectors) {
        document.querySelectorAll(selector).forEach((element) => {
            const host = getLogoHost(element);
            if (host) hosts.add(host);
        });
    }

    hosts.forEach(applyLogo);
}

async function loadCustomLogoSettings() {
    currentEnabled = (await settings.customRobloxBannerEnabled) === true;
    currentImageUrl = normalizeImageUrl(await settings[IMAGE_URL_SETTING]);
    currentFitMode = (await settings.customRobloxBannerFitMode) || 'contain';
    currentPositionX = normalizePosition(
        await settings.customRobloxBannerPositionX,
    );
    currentPositionY = normalizePosition(
        await settings.customRobloxBannerPositionY,
    );
    currentZoom = normalizeZoom(await settings.customRobloxBannerZoom);
}

function handleStorageChange(changes, areaName) {
    if (areaName !== 'local') return;
    if (
        !changes.customRobloxBannerEnabled &&
        !changes[IMAGE_URL_SETTING] &&
        !changes[LEGACY_IMAGE_SETTING] &&
        !changes.customRobloxBannerFitMode &&
        !changes.customRobloxBannerPositionX &&
        !changes.customRobloxBannerPositionY &&
        !changes.customRobloxBannerZoom
    )
        return;

    clearIncompatibleStoredValues()
        .then(loadCustomLogoSettings)
        .then(syncAllLogoElements)
        .catch((error) =>
            console.error(
                'RoValra: Failed to update custom Roblox banner.',
                error,
            ),
        );
}

function savePosition(nextX, nextY) {
    currentPositionX = normalizePosition(nextX);
    currentPositionY = normalizePosition(nextY);

    Promise.all([
        handleSaveSettings('customRobloxBannerPositionX', currentPositionX),
        handleSaveSettings('customRobloxBannerPositionY', currentPositionY),
    ]).catch((error) =>
        console.error('RoValra: Failed to save custom banner position.', error),
    );

    syncAllLogoElements();
}

function saveZoom(nextZoom) {
    currentZoom = normalizeZoom(nextZoom);

    handleSaveSettings('customRobloxBannerZoom', currentZoom).catch((error) =>
        console.error('RoValra: Failed to save custom banner zoom.', error),
    );

    syncAllLogoElements();
}

function initializePositionControls() {
    document.addEventListener('rovalra:customRobloxBannerMoveUp', () => {
        savePosition(currentPositionX, currentPositionY - 5);
    });
    document.addEventListener('rovalra:customRobloxBannerMoveDown', () => {
        savePosition(currentPositionX, currentPositionY + 5);
    });
    document.addEventListener('rovalra:customRobloxBannerMoveLeft', () => {
        savePosition(currentPositionX - 5, currentPositionY);
    });
    document.addEventListener('rovalra:customRobloxBannerMoveRight', () => {
        savePosition(currentPositionX + 5, currentPositionY);
    });
    document.addEventListener('rovalra:customRobloxBannerCenter', () => {
        savePosition(50, 50);
    });
    document.addEventListener('rovalra:customRobloxBannerZoomIn', () => {
        saveZoom(currentZoom + 10);
    });
    document.addEventListener('rovalra:customRobloxBannerZoomOut', () => {
        saveZoom(currentZoom - 10);
    });
}

async function initialize() {
    await clearIncompatibleStoredValues();
    await loadCustomLogoSettings();

    logoSelectors.forEach((selector) => {
        observeElement(selector, syncLogoElement, { multiple: true });
    });

    syncAllLogoElements();
    initializePositionControls();

    chrome.storage.onChanged.addListener(handleStorageChange);
}

export function init() {
    if (initialized) return;
    initialized = true;

    initialize().catch((error) =>
        console.error(
            'RoValra: Custom Roblox banner initialization failed.',
            error,
        ),
    );
}
