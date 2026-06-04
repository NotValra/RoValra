import { observeElement } from '../../core/observer.js';
import { getAssets } from '../../core/assets.js';
import { createButton } from '../../core/ui/buttons.js';
import { createOverlay } from '../../core/ui/overlay.js';

const ORDER_STORAGE_KEY = 'rovalra_home_layout_order';
const CATEGORIES_STORAGE_KEY = 'rovalra_home_layout_categories';
const ORDER_SESSION_KEY = 'rovalra_homeLayoutOrder';
const HOLD_THRESHOLD = 200;
const MOVE_THRESHOLD = 5;

let categories = [];
let savedOrder = [];
let initialized = false;
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

function publishHomeLayoutOrder(order) {
    const normalizedOrder = Array.isArray(order) ? order.map(String) : [];
    savedOrder = normalizedOrder;

    try {
        sessionStorage.setItem(
            ORDER_SESSION_KEY,
            JSON.stringify(normalizedOrder),
        );
    } catch (error) {}

    document.dispatchEvent(
        new CustomEvent('rovalra-home-layout', {
            detail: { order: normalizedOrder },
        }),
    );
}

function categoryExists(category) {
    return (
        category?.key && categories.some((item) => item.key === category.key)
    );
}

function mergeCategories(newCategories) {
    if (!Array.isArray(newCategories)) return false;

    let changed = false;
    for (const category of newCategories) {
        if (!category?.key || categoryExists(category)) continue;

        categories.push({
            key: String(category.key),
            topic: category.topic || 'Untitled',
            topicId: category.topicId ?? null,
            treatmentType: category.treatmentType || '',
        });
        changed = true;
    }

    if (changed) {
        chrome.storage.local.set({ [CATEGORIES_STORAGE_KEY]: categories });
    }

    return changed;
}

function getOrderedCategories() {
    const categoryMap = new Map(
        categories.map((category) => [category.key, category]),
    );
    const ordered = [];
    const usedKeys = new Set();

    for (const key of savedOrder) {
        const category = categoryMap.get(key);
        if (!category || usedKeys.has(key)) continue;

        ordered.push(category);
        usedKeys.add(key);
    }

    for (const category of categories) {
        if (!usedKeys.has(category.key)) ordered.push(category);
    }

    return ordered;
}

function saveOrderFromList(listElement) {
    const order = Array.from(
        listElement.querySelectorAll('.rovalra-home-layout-item'),
    ).map((item) => item.dataset.categoryKey);

    chrome.storage.local.set({ [ORDER_STORAGE_KEY]: order }, () => {
        publishHomeLayoutOrder(order);
    });
}

function createHomeLayoutItem(category) {
    const item = document.createElement('li');
    item.className = 'rovalra-home-layout-item';
    item.dataset.categoryKey = category.key;

    const handle = document.createElement('span');
    handle.className = 'rovalra-home-layout-drag-handle';
    handle.setAttribute('aria-hidden', 'true');
    const svgData = getAssets().dragHandle;
    if (svgData.startsWith('data:image/svg+xml,')) {
        handle.innerHTML = decodeURIComponent(svgData.split(',')[1]); // verified
    }

    const label = document.createElement('span');
    label.className = 'rovalra-home-layout-label';
    label.textContent = category.topic;

    const text = document.createElement('span');
    text.className = 'rovalra-home-layout-text';
    text.append(label);

    item.append(handle, text);
    return item;
}

function createDropIndicator() {
    if (dropIndicator) dropIndicator.remove();

    dropIndicator = document.createElement('div');
    dropIndicator.className = 'rovalra-home-layout-drop-indicator';
    document.body.appendChild(dropIndicator);
}

function setupDragList(listElement) {
    listElement.addEventListener('mousedown', onMouseDown);
}

function onMouseDown(event) {
    if (event.button !== 0) return;

    const handle = event.target.closest('.rovalra-home-layout-drag-handle');
    if (!handle) return;

    const item = handle.closest('.rovalra-home-layout-item');
    const list = item?.closest('.rovalra-home-layout-list');
    if (!item || !list) return;

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

    clone.classList.add('rovalra-home-layout-drag-clone');
    clone.style.position = 'fixed';
    clone.style.left = rect.left + 'px';
    clone.style.top = rect.top + 'px';
    clone.style.width = rect.width + 'px';
    clone.style.height = rect.height + 'px';
    clone.style.margin = '0';

    document.body.appendChild(clone);
    dragState.clone = clone;

    original.classList.add('rovalra-home-layout-drag-source');
    createDropIndicator();

    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
    event.preventDefault();
}

function onMouseMove(event) {
    if (!dragState.element) return;

    const deltaX = Math.abs(event.clientX - dragState.startX);
    const deltaY = Math.abs(event.clientY - dragState.startY);

    if (!dragState.active) {
        if (deltaX > MOVE_THRESHOLD || deltaY > MOVE_THRESHOLD) {
            clearTimeout(dragState.holdTimer);
            beginDrag(event);
        } else {
            return;
        }
    }

    event.preventDefault();

    if (dragState.clone) {
        dragState.clone.style.left = event.clientX - dragState.offsetX + 'px';
        dragState.clone.style.top = event.clientY - dragState.offsetY + 'px';
    }

    updateDropPosition(event.clientY);
    moveDragElement(event.clientY);
}

function getDropTarget(mouseY) {
    const items = Array.from(
        dragState.list.querySelectorAll('.rovalra-home-layout-item'),
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

function updateDropPosition(mouseY) {
    if (!dragState.list) return;

    const { targetElement, insertBefore } = getDropTarget(mouseY);
    if (targetElement) {
        showDropIndicator(targetElement, insertBefore);
    } else {
        hideDropIndicator();
    }
}

function getListItemRects() {
    if (!dragState.list) return new Map();

    return new Map(
        Array.from(
            dragState.list.querySelectorAll('.rovalra-home-layout-item'),
        ).map((item) => [item, item.getBoundingClientRect()]),
    );
}

function animateListShift(previousRects) {
    if (!dragState.list) return;

    const items = Array.from(
        dragState.list.querySelectorAll('.rovalra-home-layout-item'),
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

function onMouseUp(event) {
    const wasActive = dragState.active;

    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);

    if (dragState.holdTimer) {
        clearTimeout(dragState.holdTimer);
        dragState.holdTimer = null;
    }

    if (wasActive) {
        finalizeDrop(event.clientY);
    }

    cleanupDragState();
}

function cleanupDragState() {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);

    if (dragState.holdTimer) {
        clearTimeout(dragState.holdTimer);
    }

    if (dragState.clone) dragState.clone.remove();
    if (dragState.element) {
        dragState.element.classList.remove('rovalra-home-layout-drag-source');
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

function finalizeDrop(mouseY) {
    if (!dragState.element || !dragState.list) return;

    moveDragElement(mouseY);
}

function createHomeLayoutBody() {
    const container = document.createElement('div');
    container.className = 'rovalra-home-layout-editor';

    const list = document.createElement('ul');
    list.className = 'rovalra-home-layout-list';

    const orderedCategories = getOrderedCategories();
    if (!orderedCategories.length) {
        const empty = document.createElement('p');
        empty.className = 'rovalra-home-layout-empty';
        empty.textContent =
            'Open or refresh Home once so RoValra can learn the current categories.';
        container.appendChild(empty);
        return { container, list: null };
    }

    orderedCategories.forEach((category) => {
        list.appendChild(createHomeLayoutItem(category));
    });

    setupDragList(list);
    container.appendChild(list);
    return { container, list };
}

function openHomeLayoutOverlay() {
    const { container, list } = createHomeLayoutBody();
    let overlayHandle = null;

    const resetButton = createButton('Reset', 'secondary', {
        disabled: !savedOrder.length,
        onClick: () => {
            chrome.storage.local.remove(ORDER_STORAGE_KEY, () => {
                publishHomeLayoutOrder([]);
                overlayHandle?.close();
            });
        },
    });

    const saveButton = createButton('Save', 'primary', {
        disabled: !list,
        onClick: () => {
            if (!list) return;

            saveOrderFromList(list);
            overlayHandle?.close();
        },
    });

    overlayHandle = createOverlay({
        title: 'Home Layout',
        bodyContent: container,
        actions: [resetButton, saveButton],
        maxWidth: '620px',
        onClose: cleanupDragState,
    });
}

function attachHomeLayoutButton(header) {
    const normalizedPath = window.location.pathname
        .toLowerCase()
        .replace(/^\/[a-z]{2}(?:-[a-z]{2})?\//, '/');
    if (!normalizedPath.startsWith('/home')) return;

    if (header.dataset.rovalraHomeLayoutButton === 'true') return;

    const title = header.querySelector('h1');
    if (!title || title.textContent.trim() !== 'Home') return;

    header.dataset.rovalraHomeLayoutButton = 'true';
    header.classList.add('rovalra-home-layout-header');

    const button = createButton('Layout', 'secondary', {
        id: 'rovalra-home-layout-button',
        onClick: openHomeLayoutOverlay,
    });
    button.classList.add('rovalra-home-layout-button');

    header.appendChild(button);
}

function hydrateFromStorage() {
    chrome.storage.local.get(
        {
            [ORDER_STORAGE_KEY]: [],
            [CATEGORIES_STORAGE_KEY]: [],
        },
        (data) => {
            categories = Array.isArray(data[CATEGORIES_STORAGE_KEY])
                ? data[CATEGORIES_STORAGE_KEY]
                : [];
            publishHomeLayoutOrder(data[ORDER_STORAGE_KEY]);
        },
    );
}

export function init() {
    if (!initialized) {
        initialized = true;
        hydrateFromStorage();

        document.addEventListener('rovalra-home-layout-categories', (event) => {
            mergeCategories(event.detail?.categories);
        });

        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace !== 'local') return;

            if (changes[ORDER_STORAGE_KEY]) {
                publishHomeLayoutOrder(changes[ORDER_STORAGE_KEY].newValue);
            }

            if (changes[CATEGORIES_STORAGE_KEY]) {
                categories = Array.isArray(
                    changes[CATEGORIES_STORAGE_KEY].newValue,
                )
                    ? changes[CATEGORIES_STORAGE_KEY].newValue
                    : [];
            }
        });
    }

    observeElement(
        '.section .container-header',
        (header) => attachHomeLayoutButton(header),
        { multiple: true },
    );
}
