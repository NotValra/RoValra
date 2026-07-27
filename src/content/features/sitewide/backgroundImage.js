import { settings } from '../../core/settings/getSettings';
import {
    BACKGROUND_IMAGE_ENABLED_SETTING,
    BACKGROUND_IMAGE_SETTING,
    DEFAULT_BACKGROUND_IMAGE,
    sanitizeBackgroundImage,
} from '../../core/backgroundImage.js';

const BG_LAYER_ID = 'rovalra-custom-background-layer';
const BG_ACTIVE_CLASS = 'rovalra-custom-background-image-active';
const BG_NAV_OVERRIDE_CLASS = 'rovalra-custom-background-nav-override';
const BG_CSS_PROPERTIES = [
    '--rovalra-background-image-opacity',
    '--rovalra-background-image-size',
    '--rovalra-background-image-position',
    '--rovalra-background-image-repeat',
    '--rovalra-background-image-blur',
    '--rovalra-background-overlay-color',
    '--rovalra-background-overlay-opacity',
];
const BG_OVERLAY_CLASS = 'rovalra-custom-background-overlay';
const BG_FRAME_CLASS = 'rovalra-custom-background-frame';
const BG_FRAME_PATH = 'public/Assets/background-wallpaper.html';
const BG_SUPPORTED_HOSTS = new Set(['www.roblox.com', 'roblox.com']);
const EXTENSION_ORIGIN = new URL(chrome.runtime.getURL('/')).origin;

function clearBackgroundImage() {
    const root = document.body || document.documentElement;
    const classTargets = new Set([root, document.documentElement]);
    if (document.body) classTargets.add(document.body);

    for (const target of classTargets) {
        target.classList.remove(BG_ACTIVE_CLASS, BG_NAV_OVERRIDE_CLASS);
        for (const property of BG_CSS_PROPERTIES) {
            target.style.removeProperty(property);
        }
    }

    document.querySelectorAll(`#${BG_LAYER_ID}`).forEach((layer) => layer.remove());
}

function getBgParts() {
    const root = document.body || document.documentElement;
    let layer = document.getElementById(BG_LAYER_ID);
    if (layer && layer.parentElement !== root) {
        layer.remove();
        layer = null;
    }
    if (!layer) {
        layer = document.createElement('div');
        layer.id = BG_LAYER_ID;
        layer.setAttribute('aria-hidden', 'true');
        layer.tabIndex = -1;
        root.appendChild(layer);
    }

    let frame = layer.querySelector(`.${BG_FRAME_CLASS}`);
    let overlay = layer.querySelector(`.${BG_OVERLAY_CLASS}`);
    if (!frame) {
        frame = document.createElement('iframe');
        frame.className = BG_FRAME_CLASS;
        frame.src = chrome.runtime.getURL(BG_FRAME_PATH);
        frame.setAttribute('aria-hidden', 'true');
        frame.tabIndex = -1;
        layer.prepend(frame);
    }
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = BG_OVERLAY_CLASS;
        layer.appendChild(overlay);
    }
    document.querySelectorAll(`#${BG_LAYER_ID}`).forEach((candidate) => {
        if (candidate !== layer) candidate.remove();
    });
    return { root, frame, overlay };
}

function applyBackground(value) {
    const bg = sanitizeBackgroundImage(value);
    if (!bg.source) {
        clearBackgroundImage();
        return;
    }

    const { root, frame, overlay } = getBgParts();
    const state = {
        source: bg.source,
        size: bg.size === 'custom' ? `${bg.customSize}%` : bg.size,
        position: bg.position,
        repeat: bg.repeat,
        attachment: 'fixed',
        opacity: String(bg.opacity),
        filter: `blur(${bg.blur}px)`,
    };
    root.classList.add(BG_ACTIVE_CLASS);
    document.body?.classList.add(BG_ACTIVE_CLASS);
    root.classList.toggle(BG_NAV_OVERRIDE_CLASS, bg.overrideTopbarSidebar);
    document.body?.classList.toggle(BG_NAV_OVERRIDE_CLASS, bg.overrideTopbarSidebar);

    const vars = {
        '--rovalra-background-image-opacity': state.opacity,
        '--rovalra-background-image-size': state.size,
        '--rovalra-background-image-position': state.position,
        '--rovalra-background-image-repeat': state.repeat,
        '--rovalra-background-image-blur': `${bg.blur}px`,
        '--rovalra-background-overlay-color': bg.overlayColor,
        '--rovalra-background-overlay-opacity': String(bg.overlayOpacity),
    };
    Object.entries(vars).forEach(([property, value]) => root.style.setProperty(property, value));
    frame.style.opacity = state.opacity;
    frame.style.filter = state.filter;
    overlay.style.backgroundColor = bg.overlayColor;
    overlay.style.opacity = String(bg.overlayOpacity);

    const postState = () => frame.contentWindow?.postMessage(
        { type: 'rovalra:set-background', ...state },
        EXTENSION_ORIGIN,
    );
    postState();
    frame.onload = postState;
}

export function applyBackgroundImage(config, enabled) {
    if (enabled !== true || !BG_SUPPORTED_HOSTS.has(window.location.hostname)) {
        clearBackgroundImage();
        return;
    }
    applyBackground(config);
}

async function applyStoredBackgroundImage(changes = null) {
    const enabled = changes?.[BACKGROUND_IMAGE_ENABLED_SETTING]
        ? changes[BACKGROUND_IMAGE_ENABLED_SETTING].newValue === true
        : (await settings[BACKGROUND_IMAGE_ENABLED_SETTING]) === true;
    const config = changes?.[BACKGROUND_IMAGE_SETTING]
        ? changes[BACKGROUND_IMAGE_SETTING].newValue
        : await settings[BACKGROUND_IMAGE_SETTING];
    applyBackgroundImage(sanitizeBackgroundImage(config || DEFAULT_BACKGROUND_IMAGE), enabled);
}

let initialized = false;
export function init() {
    if (initialized) return;
    initialized = true;
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local') return;
        if (changes[BACKGROUND_IMAGE_SETTING] || changes[BACKGROUND_IMAGE_ENABLED_SETTING]) {
            applyStoredBackgroundImage(changes).catch((error) =>
                console.error('RoValra: Failed to refresh the custom background.', error),
            );
        }
    });
    applyStoredBackgroundImage().catch((error) =>
        console.error('RoValra: Failed to apply the custom background.', error),
    );
}
