import { observeElement } from '../../core/observer.js';
import { settings } from '../../core/settings/getSettings.js';
import { handleSaveSettings } from '../../core/settings/handlesettings.js';

const LOGO_IMAGE_ID = 'rovalra-custom-roblox-banner-image';
const LOGO_READY_ATTR = 'data-rovalra-custom-roblox-banner-ready';
const LOGO_HIDDEN_CLASS = 'rovalra-custom-roblox-banner-hidden';
const STYLE_ID = 'rovalra-custom-roblox-banner-style';
const ORIGINAL_WIDTH_ATTR = 'data-rovalra-custom-roblox-banner-width';
const ORIGINAL_HEIGHT_ATTR = 'data-rovalra-custom-roblox-banner-height';
const ORIGINAL_OVERFLOW_ATTR = 'data-rovalra-custom-roblox-banner-overflow';
const ORIGINAL_POSITION_ATTR = 'data-rovalra-custom-roblox-banner-position';
const ORIGINAL_DISPLAY_ATTR = 'data-rovalra-custom-roblox-banner-display';
const TOPBAR_ROOT_SELECTOR = '#header > .container-fluid';
const TOPBAR_MAX_Y = 96;
const TOPBAR_MAX_X = 220;

let initialized = false;
let currentEnabled = false;
let currentImageData = null;
let currentFitMode = 'contain';
let currentPositionX = 50;
let currentPositionY = 50;
let currentZoom = 100;

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

function getLogoSize(host, visuals) {
    const storedWidth = Number(host.getAttribute(ORIGINAL_WIDTH_ATTR));
    const storedHeight = Number(host.getAttribute(ORIGINAL_HEIGHT_ATTR));
    if (storedWidth > 0 && storedHeight > 0) {
        return {
            width: storedWidth,
            height: storedHeight,
        };
    }

    const hostRect = host.getBoundingClientRect();
    const visualRects = visuals
        .map((element) => element.getBoundingClientRect())
        .filter((rect) => rect.width > 0 && rect.height > 0);

    const maxVisualWidth = Math.max(
        0,
        ...visualRects.map((rect) => rect.width),
    );
    const maxVisualHeight = Math.max(
        0,
        ...visualRects.map((rect) => rect.height),
    );

    return {
        width: Math.max(maxVisualWidth, hostRect.width, 28),
        height: Math.max(maxVisualHeight, hostRect.height, 28),
    };
}

function storeLogoSize(host, size) {
    if (Number(host.getAttribute(ORIGINAL_WIDTH_ATTR)) <= 0) {
        host.setAttribute(ORIGINAL_WIDTH_ATTR, String(Math.round(size.width)));
    }
    if (Number(host.getAttribute(ORIGINAL_HEIGHT_ATTR)) <= 0) {
        host.setAttribute(
            ORIGINAL_HEIGHT_ATTR,
            String(Math.round(size.height)),
        );
    }
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
    host.style.overflow = 'hidden';
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

function applyImageFit(image, size) {
    const fitMode =
        currentFitMode === 'stretch' || currentFitMode === 'cover'
            ? currentFitMode
            : 'contain';

    image.style.width = `${Math.round(size.width)}px`;
    image.style.height = `${Math.round(size.height)}px`;
    image.style.maxWidth = '100%';
    image.style.maxHeight = '100%';
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

function clearLogo(host) {
    if (!host) return;

    host.removeAttribute(LOGO_READY_ATTR);
    host.removeAttribute(ORIGINAL_WIDTH_ATTR);
    host.removeAttribute(ORIGINAL_HEIGHT_ATTR);
    restoreHostStyles(host);
    host.querySelector(`#${LOGO_IMAGE_ID}`)?.remove();
    getLogoVisuals(host).forEach((element) => {
        element.classList.remove(LOGO_HIDDEN_CLASS);
    });
}

function applyLogo(host) {
    if (!host) return;

    if (!currentEnabled || !currentImageData) {
        clearLogo(host);
        return;
    }

    injectStyles();

    const visuals = getLogoVisuals(host);
    const size = getLogoSize(host, visuals);
    storeLogoSize(host, size);
    applyHostStyles(host);
    visuals.forEach((element) => {
        element.classList.add(LOGO_HIDDEN_CLASS);
    });

    let image = host.querySelector(`#${LOGO_IMAGE_ID}`);
    if (!image) {
        image = document.createElement('img');
        image.id = LOGO_IMAGE_ID;
        image.alt = 'Roblox';
        host.appendChild(image);
    }

    image.src = currentImageData;
    applyImageFit(image, size);
    host.setAttribute(LOGO_READY_ATTR, 'true');
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
    currentImageData = await settings.customRobloxBannerImage;
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
        !changes.customRobloxBannerImage &&
        !changes.customRobloxBannerFitMode &&
        !changes.customRobloxBannerPositionX &&
        !changes.customRobloxBannerPositionY &&
        !changes.customRobloxBannerZoom
    )
        return;

    loadCustomLogoSettings()
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
