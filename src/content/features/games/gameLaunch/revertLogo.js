import { observeElement } from '../../../core/observer.js';
import { settings } from '../../../core/settings/getSettings.js';

const CUSTOM_LOGO_ID = 'rovalra-custom-logo';
const ROBLOX_LAUNCH_ICON_SELECTORS = [
    'span.app-icon-bluebg.app-icon-windows.app-icon-size-96',
    'div.MuiGrid-root div.app-icon-bluebg.app-icon-windows',
    '.app-icon-windows.app-icon-bluebg',
];
const DIALOG_ICON_SIZE = '64px';
const PAGE_ICON_SIZE = '96px';

export async function getCustomLaunchLogo() {
    if (!(await settings.revertLogo)) return null;
    return (await settings.customLogoData) || null;
}

function applyCustomLogo(element, imageData) {
    if (!element) return;

    const isInDialog =
        element.closest("div[role='dialog']") ||
        element.closest('.MuiDialog-paper');
    const size = isInDialog ? DIALOG_ICON_SIZE : PAGE_ICON_SIZE;

    if (element.id === CUSTOM_LOGO_ID) {
        Object.assign(element.style, { width: size, height: size });
        return;
    }

    const img = document.createElement('img');
    img.id = CUSTOM_LOGO_ID;
    img.src = imageData;
    img.alt = '';
    Object.assign(img.style, {
        width: size,
        height: size,
        objectFit: 'contain',
    });
    element.replaceWith(img);
}

export async function init() {
    const logo = await getCustomLaunchLogo();
    if (!logo) return;

    for (const selector of ROBLOX_LAUNCH_ICON_SELECTORS) {
        observeElement(selector, (element) => applyCustomLogo(element, logo));
    }
}
