import { observeElement } from '../../core/observer.js';
import { getAssets } from '../../core/assets.js';
import { ts } from '../../core/locale/i18n.js';
import { addTooltip } from '../../core/ui/tooltip.js';
import { createSquareButton } from '../../core/ui/profile/header/squarebutton.js';
import { settings } from '../../core/settings/getSettings.js';

const COLLAPSED_KEY = 'rovalraSidebarCollapsed';
const BUTTON_ID = 'rovalra-sidebar-collapse-button';
const ICON_ID = 'rovalra-sidebar-collapse-icon';

function getToggleLabel(collapsed) {
    return collapsed
        ? ts('sidebarCollapse.expandSidebar')
        : ts('sidebarCollapse.collapseSidebar');
}

function isCollapsed(leftNav) {
    return leftNav.dataset.rovalraSidebarCollapsed === 'true';
}

function setCollapsed(leftNav, collapsed) {
    leftNav.dataset.rovalraSidebarCollapsed = String(collapsed);
    chrome.storage.local.set({ [COLLAPSED_KEY]: collapsed });

    const button = leftNav.querySelector(`#${BUTTON_ID}`);
    if (button) {
        button.setAttribute('aria-pressed', String(collapsed));
        button.setAttribute('aria-label', getToggleLabel(collapsed));
    }
}

async function getStoredCollapsed() {
    const result = await chrome.storage.local.get(COLLAPSED_KEY);
    if (result[COLLAPSED_KEY] !== undefined) {
        return (
            result[COLLAPSED_KEY] === true || result[COLLAPSED_KEY] === 'true'
        );
    }

    const legacyValue = localStorage.getItem(COLLAPSED_KEY);
    if (legacyValue === null) return false;

    const collapsed = legacyValue === 'true';
    await chrome.storage.local.set({ [COLLAPSED_KEY]: collapsed });
    localStorage.removeItem(COLLAPSED_KEY);

    return collapsed;
}

function createIconOverlay() {
    const icon = document.createElement('span');
    icon.id = ICON_ID;
    icon.className = 'rovalra-sidebar-collapse-icon-overlay';
    icon.setAttribute('aria-hidden', 'true');

    const svgData = getAssets().sidebarCollapseIcon;
    if (svgData.startsWith('data:image/svg+xml,')) {
        icon.innerHTML = decodeURIComponent(svgData.split(',')[1]); // verified
    }

    icon.querySelector('svg')?.classList.add('rovalra-sidebar-collapse-icon');

    return icon;
}

function getNavItemText(control) {
    const textElement = [
        ...control.querySelectorAll(
            '.nav-item-text, span.text-truncate-end, span:not([role="presentation"])',
        ),
    ].find((element) => element.textContent.trim());
    const text = textElement?.textContent?.trim() || control.textContent.trim();

    return text.replace(/\s+/g, ' ');
}

function addCollapsedNavTooltip(control) {
    if (control.dataset.rovalraSidebarTooltipReady) return;

    const leftNav = control.closest('.left-nav');
    if (!leftNav) return;

    const text = getNavItemText(control);
    if (!text) return;

    control.dataset.rovalraSidebarTooltipReady = 'true';
    control.dataset.rovalraSidebarTooltipText = text;

    addTooltip(control, () => control.dataset.rovalraSidebarTooltipText, {
        position: 'right',
        showArrow: false,
        shouldShow: () => isCollapsed(leftNav),
    });
}

function attachCollapseButton(leftNav) {
    if (leftNav.dataset.rovalraSidebarCollapseReady) return;
    leftNav.dataset.rovalraSidebarCollapseReady = 'true';

    const button = createSquareButton({
        content: '',
        id: BUTTON_ID,
        width: '40px',
        height: 'height-1000',
        paddingX: 'padding-x-none',
        radius: 'radius-medium',
        disableTextTruncation: true,
        contentClassName: 'rovalra-sidebar-collapse-button-content',
        onClick: () => {
            setCollapsed(leftNav, !isCollapsed(leftNav));
        },
    });

    button.classList.add('rovalra-sidebar-collapse-button');
    button.classList.remove('bg-action-standard', 'content-action-standard');
    button.classList.add('bg-none', 'content-emphasis');
    button.setAttribute('aria-label', getToggleLabel(false));
    button.setAttribute('aria-pressed', 'false');

    addTooltip(button, () => getToggleLabel(isCollapsed(leftNav)), {
        position: () =>
            leftNav.dataset.rovalraSidebarCollapsed === 'true'
                ? 'right'
                : 'top',
        showArrow: false,
    });
    leftNav.appendChild(button);
    leftNav.appendChild(createIconOverlay());

    getStoredCollapsed().then((collapsed) => setCollapsed(leftNav, collapsed));
}

async function initSidebarCollapse() {
    if (!(await settings.sidebarCollapseEnabled)) return;

    observeElement('.left-nav', attachCollapseButton);
    observeElement(
        '.left-nav nav li > a, .left-nav nav li > button, .left-nav .roseal-left-nav-item .nav-item-link',
        addCollapsedNavTooltip,
        { multiple: true },
    );
}

export function init() {
    initSidebarCollapse().catch((error) =>
        console.error('RoValra: Sidebar collapse initialization failed', error),
    );
}
