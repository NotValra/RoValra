import { observeElement } from '../../core/observer.js';
import { getAssets } from '../../core/assets.js';
import { ts } from '../../core/locale/i18n.js';
import { addTooltip } from '../../core/ui/tooltip.js';
import { createSquareButton } from '../../core/ui/profile/header/squarebutton.js';
import { settings } from '../../core/settings/getSettings.js';

const COLLAPSED_KEY = 'rovalraSidebarCollapsed';
const BUTTON_ID = 'rovalra-sidebar-collapse-button';
const ICON_ID = 'rovalra-sidebar-collapse-icon';
const EXPANDED_SIDEBAR_WIDTH = 289;
const COLLAPSED_SIDEBAR_WIDTH = 72;
const CONTENT_SIDEBAR_SELECTOR = [
    '.container-main aside',
    '.container-main [class*="sidebar" i]',
    '.container-main [class*="side-nav" i]',
    '.container-main [class*="sidenav" i]',
    '.content aside',
    '.content [class*="sidebar" i]',
    '.content [class*="side-nav" i]',
    '.content [class*="sidenav" i]',
].join(', ');
const ANCHORED_POSITIONS = new Set(['fixed', 'sticky', 'absolute']);
let moveContentWithSidebar = true;
let currentLeftNav = null;

function getCurrentSidebarWidth(leftNav = currentLeftNav) {
    return isCollapsed(leftNav)
        ? COLLAPSED_SIDEBAR_WIDTH
        : EXPANDED_SIDEBAR_WIDTH;
}

function getToggleLabel(collapsed) {
    return collapsed
        ? ts('sidebarCollapse.expandSidebar')
        : ts('sidebarCollapse.collapseSidebar');
}

function isCollapsed(leftNav) {
    return leftNav?.dataset.rovalraSidebarCollapsed === 'true';
}

function updateDocumentSidebarState(leftNav) {
    if (!document.body) return;

    const collapsed = isCollapsed(leftNav);
    const sidebarWidth = getCurrentSidebarWidth(leftNav);

    document.body.dataset.rovalraSidebarCollapseReady = 'true';
    document.body.dataset.rovalraSidebarCollapsed = String(collapsed);
    document.body.dataset.rovalraSidebarMoveContent = String(
        moveContentWithSidebar,
    );
    document.body.style.setProperty(
        '--rovalra-sidebar-width',
        `${sidebarWidth}px`,
    );
    document.body.style.setProperty(
        '--rovalra-sidebar-offset-delta',
        `${sidebarWidth - EXPANDED_SIDEBAR_WIDTH}px`,
    );
}

function isContentSidebarCandidate(element) {
    if (!moveContentWithSidebar || !currentLeftNav) return false;
    if (currentLeftNav.contains(element)) return false;

    const style = getComputedStyle(element);
    if (!ANCHORED_POSITIONS.has(style.position)) return false;
    if (style.display === 'none' || style.visibility === 'hidden') return false;

    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    if (rect.width > Math.min(420, window.innerWidth * 0.45)) return false;

    const left = Number.parseFloat(style.left);
    if (!Number.isFinite(left)) return false;

    const expandedOffset = left - EXPANDED_SIDEBAR_WIDTH;
    const currentOffset = left - getCurrentSidebarWidth();

    return (
        (expandedOffset >= -8 && expandedOffset <= 160) ||
        (currentOffset >= -8 && currentOffset <= 160)
    );
}

function getContentSidebarOffset(element) {
    const style = getComputedStyle(element);
    const left = Number.parseFloat(style.left);
    const expandedOffset = left - EXPANDED_SIDEBAR_WIDTH;
    const currentOffset = left - getCurrentSidebarWidth();
    const offset =
        expandedOffset >= -8 && expandedOffset <= 160
            ? expandedOffset
            : currentOffset;

    return Math.max(-8, Math.min(160, offset));
}

function syncContentSidebar(element) {
    if (!isContentSidebarCandidate(element)) return;

    if (!element.dataset.rovalraContentSidebarOriginalLeft) {
        element.dataset.rovalraContentSidebarOriginalLeft =
            element.style.left || '';
    }

    const offset = getContentSidebarOffset(element);

    element.dataset.rovalraContentSidebarAdjusted = 'true';
    element.style.left = `calc(var(--rovalra-sidebar-width, ${EXPANDED_SIDEBAR_WIDTH}px) + ${offset}px)`;
}

function syncContentSidebars() {
    if (!document.body) return;

    document
        .querySelectorAll('[data-rovalra-content-sidebar-adjusted="true"]')
        .forEach((element) => {
            if (moveContentWithSidebar) {
                syncContentSidebar(element);
                return;
            }

            element.style.left =
                element.dataset.rovalraContentSidebarOriginalLeft || '';
            delete element.dataset.rovalraContentSidebarAdjusted;
            delete element.dataset.rovalraContentSidebarOriginalLeft;
        });

    if (!moveContentWithSidebar) return;

    document.querySelectorAll(CONTENT_SIDEBAR_SELECTOR).forEach((element) => {
        syncContentSidebar(element);
    });
}

function setCollapsed(leftNav, collapsed) {
    leftNav.dataset.rovalraSidebarCollapsed = String(collapsed);
    updateDocumentSidebarState(leftNav);
    syncContentSidebars();
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
    currentLeftNav = leftNav;

    if (leftNav.dataset.rovalraSidebarCollapseReady) {
        leftNav.dataset.rovalraSidebarMoveContent = String(
            moveContentWithSidebar,
        );
        updateDocumentSidebarState(leftNav);
        syncContentSidebars();
        return;
    }

    leftNav.dataset.rovalraSidebarCollapseReady = 'true';
    leftNav.dataset.rovalraSidebarMoveContent = String(moveContentWithSidebar);

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
    updateDocumentSidebarState(leftNav);
    syncContentSidebars();
}

async function initSidebarCollapse() {
    if (!(await settings.sidebarCollapseEnabled)) return;

    moveContentWithSidebar =
        (await settings.sidebarCollapseMoveContentEnabled) !== false;

    observeElement('.left-nav', attachCollapseButton);
    observeElement(CONTENT_SIDEBAR_SELECTOR, syncContentSidebar, {
        multiple: true,
    });
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
