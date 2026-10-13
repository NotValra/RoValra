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
const CUSTOM_STORAGE_KEY = 'rovalra_sidebar_layout_custom';
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
    add: 'Add',
    button: 'Customize Layout',
    myProfile: 'My Profile',
    disabled: 'Disabled',
    show: 'Show',
    hide: 'Hide',
    addButton: "Add button",
    buttonPlaceholder1: "Name",
    buttonPlaceholder2: "URL",
};

let savedOrder = [];
let hiddenSidebarKeys = [];
let customButtons = [];
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
            add: await t('sidebarLayout.add'),
            overlayTitle: await t('sidebarLayout.overlayTitle'),
            button: await t('sidebarLayout.button'),
            myProfile: await t('sidebarLayout.myProfile'),
            disabled: await t('sidebarLayout.disabled'),
            show: await t('sidebarLayout.show'),
            hide: await t('sidebarLayout.hide'),
            addButton: await t('sidebarLayout.addButton'),
            buttonPlaceholder1: await t('sidebarLayout.buttonPlaceholder1'),
            buttonPlaceholder2: await t('sidebarLayout.buttonPlaceholder2'),
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

function addCustomButton(buttonName, buttonLink) {
    if (buttonName) {
        const name = String(buttonName).trim();
        const href = String(buttonLink || '').trim();
        if (!name || !href) return;
        if (!customButtons.some((item) => item.name === name)) {
            customButtons.push({ name, href });
            const key = `custom:${name}`;
            if (savedOrder.length && !savedOrder.includes(key)) savedOrder.push(key);
            chrome.storage.local.set({
                [CUSTOM_STORAGE_KEY]: customButtons,
                [ORDER_STORAGE_KEY]: savedOrder,
            });
        }
    }

    if (!currentSidebar || !customButtons.length) return;

    const nav = currentSidebar.querySelector('nav') || currentSidebar;
    const list = nav.querySelector('ul') || nav;

    customButtons.forEach(({ name, href }) => {
        const key = `custom:${name}`;
        if (list.querySelector(`[data-rovalra-sidebar-layout-key="${key}"]`)) return;

        const li = document.createElement('li');
        li.dataset.rovalraSidebarLayoutKey = key;
        const a = document.createElement('a');
        a.href = href;
        a.className =
            'content-emphasis text-title-large flex items-center gap-small padding-left-xsmall padding-right-xxsmall radius-medium relative clip group/interactable focus-visible:outline-focus disabled:outline-none';
        a.setAttribute('aria-label', name);
        a.innerHTML = `
        <div role="presentation" class="absolute inset-[0] transition-colors group-hover/interactable:bg-[var(--color-state-hover)] group-active/interactable:bg-[var(--color-state-press)] group-disabled/interactable:bg-none"></div>
        <span class="size-1000 grow-0 shrink-0 basis-auto flex justify-center items-center">
            <span aria-hidden="true" data-testid="foundation-web-icon" class="grow-0 shrink-0 basis-auto icon icon-regular-paint-brush size-[var(--icon-size-large)]"></span>
        </span>
        <span class="min-width-0 text-truncate-end text-no-wrap"></span>
    `;
        a.querySelector('.text-truncate-end').textContent = name;
        li.appendChild(a);
        list.appendChild(li);
    });

    if (buttonName) applySidebarLayout();
}

function addCustomButtonPopup() {
    const buttonNameInput = document.createElement('input');
    buttonNameInput.type = 'text';
    buttonNameInput.placeholder = locale.buttonPlaceholder1;
    Object.assign(buttonNameInput.style, {
        width: '100%',
        height: '40px',
        padding: '10px',
        border: '1px solid #ccc',
        borderRadius: '5px',
        boxSizing: 'border-box',
    });
    const buttonUrlInput = document.createElement('input');
    buttonUrlInput.type = 'text';
    buttonUrlInput.placeholder = locale.buttonPlaceholder2;
    Object.assign(buttonUrlInput.style, {
        width: '100%',
        height: '40px',
        padding: '10px',
        border: '1px solid #ccc',
        borderRadius: '5px',
        boxSizing: 'border-box',
    });
    const body = document.createElement('div');
    body.appendChild(buttonNameInput);
    body.appendChild(document.createElement('br'));
    body.appendChild(document.createElement('br'));
    body.appendChild(buttonUrlInput);
    body.appendChild(document.createElement('br'));
    body.appendChild(document.createElement('br'));
    let popup = null;
    const addButton = createButton(locale.add, 'primary', {
        onClick: () => {
            addCustomButton(buttonNameInput.value, buttonUrlInput.value);
            popup?.close();
        },
    });
    popup = createOverlay({
        title: locale.addButton,
        bodyContent: body,
        actions: [addButton],
        maxWidth: '620px',
        showLogo: true,
    });
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
    currentSidebar = sidebar;
    addCustomButton();

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
    const addButton = createButton(locale.add, 'primary', {
        onClick: () => {
            addCustomButtonPopup();
            overlayHandle?.close();
        },
    });
    addButton.style.marginRight = 'auto';

    const resetButton = createButton(locale.reset, 'secondary', {
        disabled:
            !savedOrder.length &&
            !hiddenSidebarKeys.length &&
            !customButtons.length,
        onClick: () => {
            chrome.storage.local.remove(
                [ORDER_STORAGE_KEY, HIDDEN_STORAGE_KEY, CUSTOM_STORAGE_KEY],
                () => {
                    savedOrder = [];
                    hiddenSidebarKeys = [];
                    customButtons = [];
                    currentSidebar
                        ?.querySelectorAll(
                            '[data-rovalra-sidebar-layout-key^="custom:"]',
                        )
                        .forEach((item) => item.remove());
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
        actions: [addButton, resetButton, saveButton],
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
        [CUSTOM_STORAGE_KEY]: [],
    });
    savedOrder = Array.isArray(data[ORDER_STORAGE_KEY])
        ? data[ORDER_STORAGE_KEY].map(String)
        : [];
    hiddenSidebarKeys = Array.isArray(data[HIDDEN_STORAGE_KEY])
        ? data[HIDDEN_STORAGE_KEY].map(String)
        : [];
    customButtons = Array.isArray(data[CUSTOM_STORAGE_KEY])
        ? data[CUSTOM_STORAGE_KEY]
              .filter((item) => item && item.name)
              .map((item) => ({
                  name: String(item.name),
                  href: String(item.href || ''),
              }))
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
