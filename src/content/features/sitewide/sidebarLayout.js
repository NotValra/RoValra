import DOMPurify from 'dompurify';
import { getAssets } from '../../core/assets.js';
import { t } from '../../core/locale/i18n.js';
import { observeElement } from '../../core/observer.js';
import { settings } from '../../core/settings/getSettings.js';
import { createButton } from '../../core/ui/buttons.js';
import { createOverlay } from '../../core/ui/overlay.js';
import { createSquareButton } from '../../core/ui/profile/header/squarebutton.js';
import { addTooltip } from '../../core/ui/tooltip.js';

const ORDER_STORAGE_KEY = 'rovalra_sidebar_layout_order';
const HIDDEN_STORAGE_KEY = 'rovalra_sidebar_layout_hidden';
const BUTTON_ID = 'rovalra-sidebar-layout-button';
const HOLD_THRESHOLD = 200;
const MOVE_THRESHOLD = 5;
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
let dropIndicator = null;
let dragState = {
    active: false,
    element: null,
    list: null,
    clone: null,
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0,
    holdTimer: null,
};

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

function decodeSvgAsset(assetName) {
    const svgData = getAssets()[assetName];
    if (!svgData?.startsWith('data:image/svg+xml,')) return '';
    return decodeURIComponent(svgData.split(',')[1]);
}

function createSidebarIcon(assetName) {
    const icon = document.createElement('span');
    icon.className = 'rovalra-sidebar-layout-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = DOMPurify.sanitize(decodeSvgAsset(assetName));
    return icon;
}

function updateVisibilityButton(button, item, nextHiddenKeys) {
    const key = item.dataset.sidebarKey;
    const hidden = nextHiddenKeys.has(key);
    const label = hidden ? locale.show : locale.hide;

    button.replaceChildren(
        createSidebarIcon(hidden ? 'visibilityOff' : 'visibility'),
    );
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', String(!hidden));
    button.title = label;
    item.classList.toggle('rovalra-sidebar-layout-item-hidden', hidden);
}

function createVisibilityButton(item, nextHiddenKeys) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'rovalra-sidebar-layout-visibility-button';
    button.addEventListener('mousedown', (event) => event.stopPropagation());
    button.addEventListener('click', () => {
        const key = item.dataset.sidebarKey;
        if (nextHiddenKeys.has(key)) {
            nextHiddenKeys.delete(key);
        } else {
            nextHiddenKeys.add(key);
        }
        updateVisibilityButton(button, item, nextHiddenKeys);
    });
    updateVisibilityButton(button, item, nextHiddenKeys);
    return button;
}

function createDisabledStatus() {
    const status = document.createElement('span');
    status.className = 'rovalra-sidebar-layout-disabled-status';
    status.textContent = locale.disabled;
    return status;
}

function createSidebarLayoutItem(sidebarItem, nextHiddenKeys) {
    const item = document.createElement('li');
    item.className = 'rovalra-sidebar-layout-item';
    item.dataset.sidebarKey = sidebarItem.key;

    const handle = document.createElement('span');
    handle.className = 'rovalra-sidebar-layout-drag-handle';
    handle.setAttribute('aria-hidden', 'true');
    handle.appendChild(createSidebarIcon('dragHandle'));

    const label = document.createElement('span');
    label.className = 'rovalra-sidebar-layout-label';
    label.textContent = sidebarItem.label;

    if (sidebarItem.disabled) {
        item.classList.add('rovalra-sidebar-layout-item-disabled');
        item.append(handle, label, createDisabledStatus());
    } else {
        item.append(
            handle,
            label,
            createVisibilityButton(item, nextHiddenKeys),
        );
    }
    return item;
}

function createDropIndicator() {
    if (dropIndicator) dropIndicator.remove();
    dropIndicator = document.createElement('div');
    dropIndicator.className = 'rovalra-sidebar-layout-drop-indicator';
    document.body.appendChild(dropIndicator);
}

function setupDragList(listElement) {
    listElement.addEventListener('mousedown', onMouseDown);
}

function onMouseDown(event) {
    if (event.button !== 0) return;
    if (event.target.closest('.rovalra-sidebar-layout-visibility-button')) {
        return;
    }

    const item = event.target.closest('.rovalra-sidebar-layout-item');
    const list = item?.closest('.rovalra-sidebar-layout-list');
    if (!item || list !== event.currentTarget) return;

    const rect = item.getBoundingClientRect();
    dragState.element = item;
    dragState.list = list;
    dragState.startX = event.clientX;
    dragState.startY = event.clientY;
    dragState.offsetX = event.clientX - rect.left;
    dragState.offsetY = event.clientY - rect.top;
    dragState.active = false;

    if (dragState.holdTimer) clearTimeout(dragState.holdTimer);
    dragState.holdTimer = setTimeout(() => {
        if (!dragState.active) beginDrag(event);
    }, HOLD_THRESHOLD);

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    event.preventDefault();
}

function beginDrag(event) {
    if (!dragState.element) return;

    dragState.active = true;

    const original = dragState.element;
    const rect = original.getBoundingClientRect();
    const clone = original.cloneNode(true);

    clone.classList.add('rovalra-sidebar-layout-drag-clone');
    clone.style.position = 'fixed';
    clone.style.left = rect.left + 'px';
    clone.style.top = rect.top + 'px';
    clone.style.width = rect.width + 'px';
    clone.style.height = rect.height + 'px';
    clone.style.margin = '0';

    document.body.appendChild(clone);
    dragState.clone = clone;

    original.classList.add('rovalra-sidebar-layout-drag-source');
    createDropIndicator();

    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
    event.preventDefault();
}

function getDropTarget(mouseY) {
    const items = Array.from(
        dragState.list.querySelectorAll('.rovalra-sidebar-layout-item'),
    ).filter((item) => item !== dragState.element);

    let targetElement = null;
    let insertBefore = true;

    for (const item of items) {
        const rect = item.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;

        if (mouseY < midY) {
            targetElement = item;
            insertBefore = true;
            break;
        }
    }

    if (!targetElement && items.length > 0) {
        targetElement = items[items.length - 1];
        insertBefore = false;
    }

    return { targetElement, insertBefore };
}

function getListItemRects() {
    if (!dragState.list) return new Map();
    return new Map(
        Array.from(
            dragState.list.querySelectorAll('.rovalra-sidebar-layout-item'),
        ).map((item) => [item, item.getBoundingClientRect()]),
    );
}

function animateListShift(previousRects) {
    if (!dragState.list) return;

    const items = Array.from(
        dragState.list.querySelectorAll('.rovalra-sidebar-layout-item'),
    );

    for (const item of items) {
        if (item === dragState.element) continue;

        const previousRect = previousRects.get(item);
        if (!previousRect) continue;

        const currentRect = item.getBoundingClientRect();
        const deltaY = previousRect.top - currentRect.top;

        if (!deltaY) continue;

        item.style.transition = 'none';
        item.style.transform = `translateY(${deltaY}px)`;

        requestAnimationFrame(() => {
            item.style.transition = 'transform 0.16s ease, opacity 0.15s ease';
            item.style.transform = '';
        });
    }
}

function moveDragElement(mouseY) {
    if (!dragState.element || !dragState.list) return;

    const { targetElement, insertBefore } = getDropTarget(mouseY);
    const previousSibling = dragState.element.previousElementSibling;
    const nextSibling = dragState.element.nextElementSibling;
    const previousRects = getListItemRects();

    if (targetElement) {
        if (insertBefore) {
            if (nextSibling === targetElement) return;
            dragState.list.insertBefore(dragState.element, targetElement);
        } else if (targetElement.nextSibling) {
            if (previousSibling === targetElement) return;
            dragState.list.insertBefore(
                dragState.element,
                targetElement.nextSibling,
            );
        } else {
            if (previousSibling === targetElement) return;
            dragState.list.appendChild(dragState.element);
        }
    } else if (dragState.element.nextElementSibling) {
        dragState.list.appendChild(dragState.element);
    } else {
        return;
    }

    animateListShift(previousRects);
}

function updateDropPosition(mouseY) {
    if (!dragState.list) return;

    const { targetElement, insertBefore } = getDropTarget(mouseY);
    if (targetElement) {
        showDropIndicator(targetElement, insertBefore);
    } else {
        hideDropIndicator();
    }
}

function showDropIndicator(targetElement, before) {
    if (!dropIndicator) return;

    const rect = targetElement.getBoundingClientRect();
    const y = before ? rect.top : rect.bottom;

    dropIndicator.style.left = rect.left + 'px';
    dropIndicator.style.top = y - 1 + 'px';
    dropIndicator.style.width = rect.width + 'px';
    dropIndicator.style.display = 'block';
}

function hideDropIndicator() {
    if (dropIndicator) {
        dropIndicator.style.display = 'none';
    }
}

function onMouseMove(event) {
    if (!dragState.element) return;

    const deltaX = Math.abs(event.clientX - dragState.startX);
    const deltaY = Math.abs(event.clientY - dragState.startY);
    if (!dragState.active) {
        if (deltaX <= MOVE_THRESHOLD && deltaY <= MOVE_THRESHOLD) return;
        clearTimeout(dragState.holdTimer);
        beginDrag(event);
    }

    event.preventDefault();
    if (dragState.clone) {
        dragState.clone.style.left = `${event.clientX - dragState.offsetX}px`;
        dragState.clone.style.top = `${event.clientY - dragState.offsetY}px`;
    }
    updateDropPosition(event.clientY);
    moveDragElement(event.clientY);
}

function cleanupDragState() {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);

    if (dragState.holdTimer) {
        clearTimeout(dragState.holdTimer);
    }

    if (dragState.clone) dragState.clone.remove();
    if (dragState.element) {
        dragState.element.classList.remove(
            'rovalra-sidebar-layout-drag-source',
        );
    }
    if (dropIndicator) {
        dropIndicator.remove();
        dropIndicator = null;
    }

    dragState = {
        active: false,
        element: null,
        list: null,
        clone: null,
        startX: 0,
        startY: 0,
        offsetX: 0,
        offsetY: 0,
        holdTimer: null,
    };

    document.body.style.cursor = '';
    document.body.style.userSelect = '';
}

function onMouseUp(event) {
    const wasActive = dragState.active;

    if (wasActive) {
        finalizeDrop(event.clientY);
    }

    cleanupDragState();
}

function finalizeDrop(mouseY) {
    if (!dragState.element || !dragState.list) return;

    moveDragElement(mouseY);
}

function createSidebarLayoutBody(sidebarItems, nextHiddenKeys) {
    const container = document.createElement('div');
    container.className = 'rovalra-sidebar-layout-editor';

    if (!sidebarItems.length) {
        const empty = document.createElement('p');
        empty.className = 'rovalra-sidebar-layout-empty';
        empty.textContent = locale.empty;
        container.appendChild(empty);
        return { container, list: null };
    }

    const list = document.createElement('ul');
    list.className = 'rovalra-sidebar-layout-list';
    getOrderedSidebarItems(sidebarItems).forEach((sidebarItem) => {
        list.appendChild(createSidebarLayoutItem(sidebarItem, nextHiddenKeys));
    });
    setupDragList(list);
    container.appendChild(list);
    return { container, list };
}

function openSidebarLayoutOverlay() {
    const sidebarItems = getSidebarItems(currentSidebar);
    const nextHiddenKeys = new Set(hiddenSidebarKeys);
    const { container, list } = createSidebarLayoutBody(
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
        onClose: cleanupDragState,
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
