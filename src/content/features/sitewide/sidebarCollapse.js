import DOMPurify from 'dompurify';
import { observeAttributes, observeElement } from '../../core/observer.js';
import { getAssets } from '../../core/assets.js';
import { ts } from '../../core/locale/i18n.js';
import { addTooltip } from '../../core/ui/tooltip.js';
import { createSquareButton } from '../../core/ui/profile/header/squarebutton.js';
import { settings } from '../../core/settings/getSettings.js';

const COLLAPSED_KEY = 'rovalraSidebarCollapsed';
const BUTTON_ID = 'rovalra-sidebar-collapse-button';
const ROBLOX_LEFT_NAV_BREAKPOINT = 768;
const ROBLOX_NAV_MENU_SELECTOR =
    'button.menu-button.btn-navigation-nav-menu-md, .icon-nav-menu';
const CONTENT_ROOT_SELECTOR = 'main.container-main';
let currentLeftNav = null;
let currentContentRoot = null;
let currentRobloxNavButton = null;
let robloxNavButtonAttributeObserver = null;
let responsiveSyncQueued = false;
let layoutResizeQueued = false;
let dispatchingLayoutResize = false;
let initialized = false;
let savedCollapsedState = false;

function getToggleLabel(collapsed) {
    return collapsed
        ? ts('sidebarCollapse.expandSidebar')
        : ts('sidebarCollapse.collapseSidebar');
}

function isCollapsed(leftNav) {
    return leftNav?.dataset.rovalraSidebarCollapsed === 'true';
}

function isVisible(element) {
    if (!element) return false;

    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') {
        return false;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
}

function getRobloxNavMenuButton() {
    const menuElement = document.querySelector(ROBLOX_NAV_MENU_SELECTOR);

    return menuElement?.closest('button') || menuElement;
}

function isRobloxResponsiveNavActive() {
    const menuButton = getRobloxNavMenuButton();
    return isVisible(menuButton);
}

function isCustomSidebarLayoutActive() {
    return (
        window.innerWidth >= ROBLOX_LEFT_NAV_BREAKPOINT &&
        !isRobloxResponsiveNavActive()
    );
}

function getSidebarState(leftNav, collapsed = isCollapsed(leftNav)) {
    return {
        collapsed,
        layoutActive: isCustomSidebarLayoutActive(),
    };
}

function updateSidebarState(leftNav, state) {
    const { collapsed, layoutActive } = state;
    const contentRoot = currentContentRoot?.isConnected
        ? currentContentRoot
        : null;
    const layoutChanged = contentRoot
        ? contentRoot.dataset.rovalraSidebarCollapsed !== String(collapsed) ||
          contentRoot.dataset.rovalraSidebarLayoutActive !==
              String(layoutActive)
        : leftNav.dataset.rovalraSidebarLayoutActive !== String(layoutActive);

    leftNav.dataset.rovalraSidebarLayoutActive = String(layoutActive);

    if (contentRoot) {
        contentRoot.dataset.rovalraSidebarCollapseReady = 'true';
        contentRoot.dataset.rovalraSidebarCollapsed = String(collapsed);
        contentRoot.dataset.rovalraSidebarLayoutActive = String(layoutActive);
    }

    return layoutChanged;
}

function notifyLayoutResize() {
    if (layoutResizeQueued) return;

    layoutResizeQueued = true;
    // Wait for the new content width to apply before Roblox measures it in resize handlers.
    requestAnimationFrame(() => {
        layoutResizeQueued = false;
        dispatchingLayoutResize = true;
        try {
            window.dispatchEvent(new Event('resize'));
        } finally {
            dispatchingLayoutResize = false;
        }
    });
}

function syncSidebarLayout(leftNav, state = getSidebarState(leftNav)) {
    const layoutChanged = updateSidebarState(leftNav, state);

    if (layoutChanged) notifyLayoutResize();
}

function syncResponsiveSidebarState() {
    if (!currentLeftNav) return;

    syncSidebarLayout(currentLeftNav);
}

function scheduleResponsiveSidebarStateSync() {
    if (responsiveSyncQueued) return;

    responsiveSyncQueued = true;
    requestAnimationFrame(() => {
        responsiveSyncQueued = false;
        syncResponsiveSidebarState();
    });
}

function handleWindowResize() {
    if (!dispatchingLayoutResize) scheduleResponsiveSidebarStateSync();
}

function observeRobloxResponsiveNavButton(menuElement) {
    const menuButton = menuElement.closest('button') || menuElement;
    if (currentRobloxNavButton === menuButton) return;

    robloxNavButtonAttributeObserver?.disconnect();
    currentRobloxNavButton?.removeEventListener(
        'click',
        scheduleResponsiveSidebarStateSync,
    );

    currentRobloxNavButton = menuButton;
    robloxNavButtonAttributeObserver = observeAttributes(
        menuButton,
        scheduleResponsiveSidebarStateSync,
        ['aria-expanded', 'aria-hidden', 'class', 'style'],
    );
    menuButton.addEventListener('click', scheduleResponsiveSidebarStateSync, {
        passive: true,
    });
    scheduleResponsiveSidebarStateSync();
}

function removeRobloxResponsiveNavButton() {
    robloxNavButtonAttributeObserver?.disconnect();
    robloxNavButtonAttributeObserver = null;
    currentRobloxNavButton?.removeEventListener(
        'click',
        scheduleResponsiveSidebarStateSync,
    );
    currentRobloxNavButton = null;
    scheduleResponsiveSidebarStateSync();
}

function attachContentRoot(contentRoot) {
    currentContentRoot = contentRoot;
    if (currentLeftNav) syncSidebarLayout(currentLeftNav);
}

function removeContentRoot() {
    currentContentRoot = null;
}

function applyCollapsedState(leftNav, collapsed) {
    const state = getSidebarState(leftNav, collapsed);
    leftNav.dataset.rovalraSidebarCollapsed = String(collapsed);
    syncSidebarLayout(leftNav, state);

    const button = leftNav.querySelector(`#${BUTTON_ID}`);
    if (button) {
        button.setAttribute('aria-pressed', String(collapsed));
        button.setAttribute('aria-label', getToggleLabel(collapsed));
    }
}

function setCollapsed(leftNav, collapsed) {
    savedCollapsedState = collapsed;
    applyCollapsedState(leftNav, collapsed);
    chrome.storage.local.set({ [COLLAPSED_KEY]: collapsed });
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

const storedCollapsedPromise = getStoredCollapsed().catch((error) => {
    console.error('RoValra: Failed to load sidebar collapsed state', error);
    return false;
});

function createCollapseIcon() {
    const icon = document.createElement('span');
    icon.className = 'rovalra-sidebar-collapse-icon';
    icon.setAttribute('aria-hidden', 'true');

    const svgData = getAssets().sidebarCollapseIcon;
    if (svgData.startsWith('data:image/svg+xml,')) {
        icon.innerHTML = DOMPurify.sanitize(
            decodeURIComponent(svgData.split(',')[1]),
        );
    }

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
    const collapsed = leftNav.dataset.rovalraSidebarCollapseReady
        ? isCollapsed(leftNav)
        : savedCollapsedState;
    const state = getSidebarState(leftNav, collapsed);

    if (leftNav.dataset.rovalraSidebarCollapseReady) {
        syncSidebarLayout(leftNav, state);
        return;
    }

    leftNav.dataset.rovalraSidebarCollapsed = String(collapsed);
    leftNav.dataset.rovalraSidebarCollapseReady = 'true';

    const button = createSquareButton({
        content: createCollapseIcon(),
        id: BUTTON_ID,
        width: '40px',
        height: 'height-1000',
        paddingX: 'padding-x-none',
        radius: 'radius-medium',
        disableTextTruncation: true,
        onClick: () => {
            setCollapsed(leftNav, !isCollapsed(leftNav));
        },
    });

    button.classList.add('rovalra-sidebar-collapse-button');
    button.classList.remove('bg-action-standard', 'content-action-standard');
    button.classList.add('bg-none', 'content-emphasis');
    button.setAttribute('aria-label', getToggleLabel(collapsed));
    button.setAttribute('aria-pressed', String(collapsed));

    addTooltip(button, () => getToggleLabel(isCollapsed(leftNav)), {
        position: () =>
            leftNav.dataset.rovalraSidebarCollapsed === 'true'
                ? 'right'
                : 'top',
        showArrow: false,
    });
    leftNav.appendChild(button);

    syncSidebarLayout(leftNav, state);
}

function removeLeftNav() {
    currentLeftNav = null;

    if (currentContentRoot?.dataset.rovalraSidebarLayoutActive === 'true') {
        currentContentRoot.dataset.rovalraSidebarLayoutActive = 'false';
        notifyLayoutResize();
    }
}

async function initSidebarCollapse() {
    const [enabled, collapsed] = await Promise.all([
        settings.sidebarCollapseEnabled,
        storedCollapsedPromise,
    ]);
    if (!enabled) return;

    savedCollapsedState = collapsed;
    window.addEventListener('resize', handleWindowResize, { passive: true });

    observeElement('.left-nav', attachCollapseButton, {
        onRemove: removeLeftNav,
    });
    observeElement(ROBLOX_NAV_MENU_SELECTOR, observeRobloxResponsiveNavButton, {
        onRemove: removeRobloxResponsiveNavButton,
    });
    observeElement(CONTENT_ROOT_SELECTOR, attachContentRoot, {
        onRemove: removeContentRoot,
    });
    observeElement(
        '.left-nav nav li > a, .left-nav nav li > button, .left-nav .roseal-left-nav-item .nav-item-link',
        addCollapsedNavTooltip,
        { multiple: true },
    );
}

export function init() {
    if (initialized) return;
    initialized = true;

    initSidebarCollapse().catch((error) =>
        console.error('RoValra: Sidebar collapse initialization failed', error),
    );
}
