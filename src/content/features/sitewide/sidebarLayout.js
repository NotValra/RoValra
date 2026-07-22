import { t } from '../../core/locale/i18n.js';
import { observeElement } from '../../core/observer.js';
import { settings } from '../../core/settings/getSettings.js';
import { createButton } from '../../core/ui/buttons.js';
import {
    createLayoutEditorBody,
    createLayoutIcon,
} from '../../core/ui/layoutEditor.js';
import { createOverlay } from '../../core/ui/overlay.js';
import { createSquareButton } from '../../core/ui/profile/header/squarebutton.js';
import { addTooltip } from '../../core/ui/tooltip.js';

const ORDER_STORAGE_KEY = 'rovalra_sidebar_layout_order';
const HIDDEN_STORAGE_KEY = 'rovalra_sidebar_layout_hidden';
const BUTTON_ID = 'rovalra-sidebar-layout-button';
const SIDEBAR_ITEM_SELECTOR = [
    '.left-nav nav a[href]',
    '.left-nav nav button',
    '.left-nav nav .roseal-left-nav-item .nav-item-link',
].join(', ');
const DEFAULT_LOCALE = {
    untitled: 'Untitled',
    empty: 'RoValra was unable to find any sidebar buttons.',
    reset: 'Reset',
    save: 'Save',
    overlayTitle: 'Sidebar Layout',
    button: 'Customize Layout',
    myProfile: 'My Profile',
    disabled: 'Disabled',
    show: 'Show',
    hide: 'Hide',
};

let savedOrder = [];
let hiddenSidebarKeys = [];
let originalOrder = [];
let profileItemKey = null;
let currentSidebar = null;
let initialized = false;
let observersInitialized = false;
let sidebarLayoutEnabled = false;
let sidebarUpdateFrame = 0;
let sidebarItemObserver = null;
let locale = { ...DEFAULT_LOCALE };

async function loadLocale() {
    try {
        locale = {
            untitled: await t('sidebarLayout.untitled'),
            empty: await t('sidebarLayout.empty'),
            reset: await t('sidebarLayout.reset'),
            save: await t('sidebarLayout.save'),
            overlayTitle: await t('sidebarLayout.overlayTitle'),
            button: await t('sidebarLayout.button'),
            myProfile: await t('sidebarLayout.myProfile'),
            disabled: await t('sidebarLayout.disabled'),
            show: await t('sidebarLayout.show'),
            hide: await t('sidebarLayout.hide'),
        };
    } catch {
        locale = { ...DEFAULT_LOCALE };
    }
}

function normalizeSidebarPath(pathname) {
    const normalized = pathname
        .toLowerCase()
        .replace(/^\/[a-z]{2}(?:-[a-z]{2})?\//, '/');

    return normalized.length > 1 ? normalized.replace(/\/$/, '') : normalized;
}

function getSidebarItemKey(control, item) {
    if (item.dataset.rovalraSidebarLayoutKey) {
        return item.dataset.rovalraSidebarLayoutKey;
    }

    const href = control.getAttribute('href');
    if (href) {
        try {
            const url = new URL(href, window.location.origin);
            return `href:${normalizeSidebarPath(url.pathname)}${url.search}`;
        } catch {}
    }

    const iconClass = Array.from(
        control.querySelector('[class*="icon-regular-"]')?.classList || [],
    ).find((className) => className.startsWith('icon-regular-'));
    if (iconClass) return `icon:${iconClass}`;

    return null;
}

function getSidebarItemLabel(control) {
    const textElement = [
        ...control.querySelectorAll(
            '.nav-item-text, .foundation-web-menu-item-title, span.text-truncate-end, span:not([role="presentation"])',
        ),
    ].find((element) => element.textContent.trim());

    return (
        textElement?.textContent?.trim() ||
        control.getAttribute('aria-label') ||
        control.getAttribute('title') ||
        control.textContent.trim() ||
        locale.untitled
    ).replace(/\s+/g, ' ');
}

function getSidebarItems(sidebar) {
    if (!sidebar) return [];

    const sidebarItems = [];
    const usedItems = new Set();
    const usedKeys = new Set();

    sidebar.querySelectorAll(SIDEBAR_ITEM_SELECTOR).forEach((control) => {
        const item =
            control.closest(
                'li, .roseal-left-nav-item, [role="menuitem"], [role="listitem"]',
            ) || control;
        let key = item ? getSidebarItemKey(control, item) : null;
        if (!item || !key || usedItems.has(item)) return;
        if (!sidebar.contains(item) || !item.parentElement) return;
        if (item.dataset.rovalraLessPlusNote === 'true') return;

        const baseKey = key;
        let occurrence = 2;
        while (usedKeys.has(key)) {
            key = `${baseKey}:occurrence-${occurrence}`;
            occurrence += 1;
        }

        usedItems.add(item);
        usedKeys.add(key);
        if (item.dataset.rovalraSidebarLayoutKey !== key) {
            item.dataset.rovalraSidebarLayoutKey = key;
        }
        sidebarItems.push({
            key,
            label: getSidebarItemLabel(control),
            element: item,
            disabled: item.dataset.rovalraLessPlusDisabled === 'true',
        });
    });

    if (!profileItemKey && sidebarItems.length) {
        profileItemKey = sidebarItems[0].key;
    }
    sidebarItems.forEach((item) => {
        if (item.key === profileItemKey) item.label = locale.myProfile;
    });

    return sidebarItems;
}

function saveOriginalOrder(sidebarItems) {
    sidebarItems.forEach((item) => {
        if (!originalOrder.includes(item.key)) {
            originalOrder.push(item.key);
        }
    });
}

function getOrderedSidebarItems(sidebarItems) {
    const order = savedOrder.length ? savedOrder : originalOrder;
    const orderIndex = new Map(order.map((key, index) => [key, index]));
    const originalIndex = new Map(
        sidebarItems.map((item, index) => [item.key, index]),
    );

    return [...sidebarItems].sort((left, right) => {
        const leftIndex = orderIndex.get(left.key);
        const rightIndex = orderIndex.get(right.key);

        if (leftIndex !== undefined && rightIndex !== undefined) {
            return leftIndex - rightIndex;
        }
        if (leftIndex !== undefined) return -1;
        if (rightIndex !== undefined) return 1;
        return originalIndex.get(left.key) - originalIndex.get(right.key);
    });
}

function applySidebarOrder(sidebarItems) {
    const list = sidebarItems[0]?.element.parentElement;
    if (!list) return;

    const listItems = sidebarItems.filter(
        (item) => item.element.parentElement === list,
    );
    const orderedItems = getOrderedSidebarItems(listItems);
    const currentOrder = listItems.map((item) => item.key);
    const newOrder = orderedItems.map((item) => item.key);

    if (currentOrder.join('\n') === newOrder.join('\n')) return;
    orderedItems.forEach((item) => list.appendChild(item.element));
}

function applySidebarLayout(sidebar = currentSidebar) {
    if (!sidebar?.isConnected) return;

    const sidebarItems = getSidebarItems(sidebar);
    const hiddenItems = new Set(hiddenSidebarKeys);
    saveOriginalOrder(sidebarItems);

    sidebarItems.forEach((item) => {
        item.element.classList.toggle(
            'rovalra-sidebar-layout-hidden',
            hiddenItems.has(item.key),
        );
    });
    applySidebarOrder(sidebarItems);
}

function scheduleSidebarLayoutUpdate(sidebar = currentSidebar) {
    if (sidebar) currentSidebar = sidebar;
    if (sidebarUpdateFrame) return;

    sidebarUpdateFrame = requestAnimationFrame(() => {
        sidebarUpdateFrame = 0;
        if (!currentSidebar?.isConnected) return;
        addSidebarLayoutButton(currentSidebar);
        applySidebarLayout(currentSidebar);
    });
}

function createSidebarIcon(assetName) {
    return createLayoutIcon(assetName, 'rovalra-sidebar-layout');
}

function createSidebarLayoutBody(sidebarItems, nextHiddenKeys) {
    return createLayoutEditorBody({
        items: getOrderedSidebarItems(sidebarItems),
        nextHiddenKeys,
        locale,
        classNamePrefix: 'rovalra-sidebar-layout',
        datasetKey: 'sidebarKey',
    });
}

function openSidebarLayoutOverlay() {
    const sidebarItems = getSidebarItems(currentSidebar);
    const nextHiddenKeys = new Set(hiddenSidebarKeys);
    const { container, list, cleanup } = createSidebarLayoutBody(
        sidebarItems,
        nextHiddenKeys,
    );
    let overlayHandle = null;

    const resetButton = createButton(locale.reset, 'secondary', {
        disabled: !savedOrder.length && !hiddenSidebarKeys.length,
        onClick: () => {
            chrome.storage.local.remove(
                [ORDER_STORAGE_KEY, HIDDEN_STORAGE_KEY],
                () => {
                    savedOrder = [];
                    hiddenSidebarKeys = [];
                    applySidebarLayout();
                    overlayHandle?.close();
                },
            );
        },
    });

    const saveButton = createButton(locale.save, 'primary', {
        disabled: !list,
        onClick: () => {
            if (!list) return;

            savedOrder = Array.from(
                list.querySelectorAll('.rovalra-sidebar-layout-item'),
            ).map((item) => item.dataset.sidebarKey);
            hiddenSidebarKeys = Array.from(nextHiddenKeys);
            chrome.storage.local.set(
                {
                    [ORDER_STORAGE_KEY]: savedOrder,
                    [HIDDEN_STORAGE_KEY]: hiddenSidebarKeys,
                },
                () => {
                    applySidebarLayout();
                    overlayHandle?.close();
                },
            );
        },
    });

    overlayHandle = createOverlay({
        title: locale.overlayTitle,
        bodyContent: container,
        actions: [resetButton, saveButton],
        maxWidth: '620px',
        showLogo: true,
        onClose: cleanup,
    });
}

function getOrCreateSidebarLayoutButton(sidebar) {
    const existingButton = sidebar.querySelector(`#${BUTTON_ID}`);
    if (existingButton) return existingButton;

    const button = createSquareButton({
        content: createSidebarIcon('edit'),
        id: BUTTON_ID,
        width: '40px',
        height: 'height-1000',
        paddingX: 'padding-x-none',
        radius: 'radius-medium',
        disableTextTruncation: true,
        onClick: openSidebarLayoutOverlay,
    });
    button.classList.add('rovalra-sidebar-layout-button');
    button.classList.remove('bg-action-standard', 'content-action-standard');
    button.classList.add('bg-none', 'content-emphasis');
    button.setAttribute('aria-label', locale.button);
    addTooltip(button, () => locale.button, {
        position: 'top',
        showArrow: false,
    });

    return button;
}

function addSidebarLayoutButton(sidebar) {
    const button = getOrCreateSidebarLayoutButton(sidebar);
    if (button.parentElement !== sidebar) sidebar.appendChild(button);
    sidebar.dataset.rovalraSidebarLayoutReady = 'true';
}

function attachSidebarLayout(sidebar) {
    currentSidebar = sidebar;
    addSidebarLayoutButton(sidebar);
    sidebarItemObserver?.disconnect();
    sidebarItemObserver = observeElement(
        SIDEBAR_ITEM_SELECTOR,
        () => scheduleSidebarLayoutUpdate(sidebar),
        { multiple: true, root: sidebar },
    );
    scheduleSidebarLayoutUpdate(sidebar);
}

async function loadSavedLayout() {
    const data = await chrome.storage.local.get({
        [ORDER_STORAGE_KEY]: [],
        [HIDDEN_STORAGE_KEY]: [],
    });
    savedOrder = Array.isArray(data[ORDER_STORAGE_KEY])
        ? data[ORDER_STORAGE_KEY].map(String)
        : [];
    hiddenSidebarKeys = Array.isArray(data[HIDDEN_STORAGE_KEY])
        ? data[HIDDEN_STORAGE_KEY].map(String)
        : [];
}

export async function init() {
    if (!initialized) {
        initialized = true;
        sidebarLayoutEnabled = (await settings.sidebarLayoutEnabled) !== false;
        if (!sidebarLayoutEnabled) return;

        await loadLocale();
        await loadSavedLayout();
        document.addEventListener('rovalra-less-plus-change', () =>
            scheduleSidebarLayoutUpdate(),
        );
    }

    if (!sidebarLayoutEnabled || observersInitialized) return;
    observersInitialized = true;
    observeElement('.left-nav', attachSidebarLayout);
}
