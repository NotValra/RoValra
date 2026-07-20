import { observeElement } from '../../core/observer.js';
import { getAssets } from '../../core/assets.js';
import { t } from '../../core/locale/i18n.js';
import { settings } from '../../core/settings/getSettings.js';
import { handleSaveSettings } from '../../core/settings/handlesettings.js';
import { createButton } from '../../core/ui/buttons.js';
import { createOverlay } from '../../core/ui/overlay.js';

const ORDER_STORAGE_KEY = 'rovalra_home_layout_order';
const CATEGORIES_STORAGE_KEY = 'rovalra_home_layout_categories';
const HIDDEN_STORAGE_KEY = 'rovalra_home_layout_hidden';
const ORDER_SESSION_KEY = 'rovalra_homeLayoutOrder';
const HIDDEN_SESSION_KEY = 'rovalra_homeLayoutHidden';
const HOLD_THRESHOLD = 200;
const MOVE_THRESHOLD = 5;
const FRIEND_CAROUSEL_TOPIC_ID = 600000000;
const FRIEND_CAROUSEL_TREATMENT_TYPE = 'FriendCarousel';
const CONTINUE_TOPIC_ID = 100000003;
const ACCURATE_CONTINUE_STORAGE_KEY = 'AccurateContinueEnabled';
const DEFAULT_LOCALE = {
    untitled: 'Untitled',
    empty: 'Open or refresh Home once so RoValra can learn the current categories.',
    reset: 'Reset',
    save: 'Save',
    overlayTitle: 'Home Layout',
    button: 'Layout',
    edit: 'Edit',
    settingsTitle: 'Category Settings',
    visibility: 'Visibility',
    visibilityDescription: 'Choose whether this category appears on Home.',
    accurateContinue: 'Accurate Continue',
    accurateContinueDescription:
        'Sort Continue by when you last played each game.',
    enable: 'Enable',
    disable: 'Disable',
    show: 'Show',
    hide: 'Hide',
};

let categories = [];
let savedOrder = [];
let hiddenCategoryKeys = [];
let initialized = false;
let observersInitialized = false;
let homeLayoutButtonEnabled = true;
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

function publishHomeLayoutState(
    order = savedOrder,
    hiddenKeys = hiddenCategoryKeys,
) {
    const normalizedOrder = Array.isArray(order) ? order.map(String) : [];
    const normalizedHiddenKeys = Array.isArray(hiddenKeys)
        ? hiddenKeys.map(String)
        : [];
    savedOrder = normalizedOrder;
    hiddenCategoryKeys = normalizedHiddenKeys;

    try {
        sessionStorage.setItem(
            ORDER_SESSION_KEY,
            JSON.stringify(normalizedOrder),
        );
        sessionStorage.setItem(
            HIDDEN_SESSION_KEY,
            JSON.stringify(normalizedHiddenKeys),
        );
    } catch {}

    document.dispatchEvent(
        new CustomEvent('rovalra-home-layout', {
            detail: {
                order: normalizedOrder,
                hidden: normalizedHiddenKeys,
            },
        }),
    );
}

async function loadLocale() {
    try {
        const translateOrDefault = async (key, fallback) => {
            const value = await t(key);
            return value === key ? fallback : value;
        };

        locale = {
            untitled: await t('homeLayout.untitled'),
            empty: await t('homeLayout.empty'),
            reset: await t('homeLayout.reset'),
            save: await t('homeLayout.save'),
            overlayTitle: await t('homeLayout.overlayTitle'),
            button: await t('homeLayout.button'),
            edit: await t('homeLayout.edit'),
            settingsTitle: await t('homeLayout.settingsTitle'),
            visibility: await t('homeLayout.visibility'),
            visibilityDescription: await t('homeLayout.visibilityDescription'),
            accurateContinue: await translateOrDefault(
                'homeLayout.accurateContinue',
                DEFAULT_LOCALE.accurateContinue,
            ),
            accurateContinueDescription: await translateOrDefault(
                'homeLayout.accurateContinueDescription',
                DEFAULT_LOCALE.accurateContinueDescription,
            ),
            enable: await translateOrDefault(
                'homeLayout.enable',
                DEFAULT_LOCALE.enable,
            ),
            disable: await translateOrDefault(
                'homeLayout.disable',
                DEFAULT_LOCALE.disable,
            ),
            show: await t('homeLayout.show'),
            hide: await t('homeLayout.hide'),
        };
    } catch {
        locale = { ...DEFAULT_LOCALE };
    }
}

function mergeMissingKeysIntoSavedOrder(newCategories) {
    if (!savedOrder.length || !Array.isArray(newCategories)) return false;

    const incomingKeys = [];
    const seenKeys = new Set();

    for (const category of newCategories) {
        if (!category?.key) continue;

        const key = String(category.key);
        if (seenKeys.has(key)) continue;

        incomingKeys.push(key);
        seenKeys.add(key);
    }

    const nextOrder = [...savedOrder];
    let changed = false;

    incomingKeys.forEach((key, index) => {
        if (nextOrder.includes(key)) return;

        const nextKnownKey = incomingKeys
            .slice(index + 1)
            .find((incomingKey) => nextOrder.includes(incomingKey));
        const insertionIndex = nextKnownKey
            ? nextOrder.indexOf(nextKnownKey)
            : -1;

        if (insertionIndex === -1) {
            nextOrder.push(key);
        } else {
            nextOrder.splice(insertionIndex, 0, key);
        }

        changed = true;
    });

    if (!changed) return false;

    publishHomeLayoutState(nextOrder);
    return true;
}

function syncCategoryOrder(newCategories) {
    const incomingOrder = new Map();

    newCategories.forEach((category) => {
        if (!category?.key) return;

        const key = String(category.key);
        if (!incomingOrder.has(key)) {
            incomingOrder.set(key, incomingOrder.size);
        }
    });

    if (!incomingOrder.size) return false;

    const previousOrder = categories.map((category) => category.key).join('\n');
    const originalOrder = new Map(
        categories.map((category, index) => [category.key, index]),
    );

    categories.sort((a, b) => {
        const aIndex = incomingOrder.get(a.key);
        const bIndex = incomingOrder.get(b.key);
        const aHasIncomingOrder = aIndex !== undefined;
        const bHasIncomingOrder = bIndex !== undefined;

        if (aHasIncomingOrder && bHasIncomingOrder) return aIndex - bIndex;
        if (aHasIncomingOrder) return -1;
        if (bHasIncomingOrder) return 1;

        return originalOrder.get(a.key) - originalOrder.get(b.key);
    });

    return (
        previousOrder !== categories.map((category) => category.key).join('\n')
    );
}

function createNormalizedCategory(category) {
    if (!category?.key) return null;

    return {
        key: String(category.key),
        topic: category.topic || locale.untitled,
        topicId: category.topicId ?? null,
        treatmentType: category.treatmentType || '',
    };
}

function isFriendCarouselCategory(category) {
    return (
        category?.topicId === FRIEND_CAROUSEL_TOPIC_ID &&
        category?.treatmentType === FRIEND_CAROUSEL_TREATMENT_TYPE
    );
}

function isContinueCategory(category) {
    return category?.topicId === CONTINUE_TOPIC_ID;
}

function getStoredValue(key, defaultValue) {
    return new Promise((resolve) => {
        chrome.storage.local.get({ [key]: defaultValue }, (data) => {
            resolve(data[key]);
        });
    });
}

function compactCategoriesByKey(categoryList) {
    if (!Array.isArray(categoryList)) {
        return { categories: [], changed: false };
    }

    const categoryMap = new Map();
    let changed = false;

    categoryList.forEach((category) => {
        const normalizedCategory = createNormalizedCategory(category);
        if (!normalizedCategory) {
            changed = true;
            return;
        }

        if (categoryMap.has(normalizedCategory.key)) {
            changed = true;
        }

        categoryMap.set(normalizedCategory.key, normalizedCategory);
    });

    const compactedCategories = [...categoryMap.values()];
    changed = changed || compactedCategories.length !== categoryList.length;

    return { categories: compactedCategories, changed };
}

function pruneLayoutStateToCategories(nextCategories) {
    const activeKeys = new Set(nextCategories.map((category) => category.key));
    const nextOrder = savedOrder.filter((key) => activeKeys.has(String(key)));
    const nextHiddenKeys = hiddenCategoryKeys.filter((key) =>
        activeKeys.has(String(key)),
    );
    const orderChanged = nextOrder.length !== savedOrder.length;
    const hiddenChanged = nextHiddenKeys.length !== hiddenCategoryKeys.length;

    if (!orderChanged && !hiddenChanged) return false;

    publishHomeLayoutState(nextOrder, nextHiddenKeys);

    const updates = {};
    if (orderChanged) updates[ORDER_STORAGE_KEY] = nextOrder;
    if (hiddenChanged) updates[HIDDEN_STORAGE_KEY] = nextHiddenKeys;
    chrome.storage.local.set(updates);
    return true;
}

function replaceCategories(newCategories) {
    if (!Array.isArray(newCategories)) return false;

    const compacted = compactCategoriesByKey(newCategories);
    const previousCategories = JSON.stringify(categories);
    categories = compacted.categories;

    mergeMissingKeysIntoSavedOrder(newCategories);
    syncCategoryOrder(newCategories);
    pruneLayoutStateToCategories(categories);

    const changed =
        compacted.changed || previousCategories !== JSON.stringify(categories);

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

function saveOrderFromList(listElement, onSaved) {
    const order = Array.from(
        listElement.querySelectorAll('.rovalra-home-layout-item'),
    ).map((item) => item.dataset.categoryKey);

    chrome.storage.local.set({ [ORDER_STORAGE_KEY]: order }, () => {
        publishHomeLayoutState(order);
        if (typeof onSaved === 'function') onSaved();
    });
}

function saveHiddenCategoryKeys(nextHiddenKeys, onSaved) {
    const normalizedHiddenKeys = Array.isArray(nextHiddenKeys)
        ? nextHiddenKeys
              .map(String)
              .filter(
                  (key) =>
                      !categories.some(
                          (category) =>
                              category.key === key &&
                              isFriendCarouselCategory(category),
                      ),
              )
        : [];

    chrome.storage.local.set(
        { [HIDDEN_STORAGE_KEY]: normalizedHiddenKeys },
        () => {
            publishHomeLayoutState(savedOrder, normalizedHiddenKeys);
            if (typeof onSaved === 'function') onSaved();
        },
    );
}

function decodeSvgAsset(assetName) {
    const svgData = getAssets()[assetName];
    if (!svgData?.startsWith('data:image/svg+xml,')) return '';

    return decodeURIComponent(svgData.split(',')[1]);
}

function createIconButton({ assetName, label, onClick }) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'rovalra-home-layout-icon-button';
    button.setAttribute('aria-label', label);
    button.title = label;

    const icon = document.createElement('span');
    icon.className = 'rovalra-home-layout-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = decodeSvgAsset(assetName); // verified

    button.appendChild(icon);
    button.addEventListener('mousedown', (event) => event.stopPropagation());
    button.addEventListener('click', onClick);

    return button;
}

function isCategoryHidden(categoryKey) {
    return hiddenCategoryKeys.includes(String(categoryKey));
}

function createCategorySettingRow({ title, description, control }) {
    const row = document.createElement('div');
    row.className = 'rovalra-home-layout-setting-row';

    const text = document.createElement('div');
    text.className = 'rovalra-home-layout-setting-text';

    const titleElement = document.createElement('div');
    titleElement.className = 'rovalra-home-layout-setting-title';
    titleElement.textContent = title;

    const descriptionElement = document.createElement('div');
    descriptionElement.className = 'rovalra-home-layout-setting-description';
    descriptionElement.textContent = description;

    text.append(titleElement, descriptionElement);
    row.append(text, control);

    return row;
}

async function openCategorySettingsOverlay(category) {
    const categoryKey = String(category.key);
    let isHidden = isCategoryHidden(categoryKey);
    let accurateContinueEnabled = await getStoredValue(
        ACCURATE_CONTINUE_STORAGE_KEY,
        false,
    );
    let overlayHandle = null;

    const container = document.createElement('div');
    container.className = 'rovalra-home-layout-settings-editor';

    const title = document.createElement('div');
    title.className = 'rovalra-home-layout-settings-category';
    title.textContent = category.topic;

    const toggleButton = createButton('', 'secondary', {
        onClick: () => {
            isHidden = !isHidden;
            updateState();
        },
    });
    toggleButton.classList.add('rovalra-home-layout-setting-control');

    const accurateContinueToggleButton = createButton('', 'secondary', {
        onClick: () => {
            accurateContinueEnabled = !accurateContinueEnabled;
            updateState();
        },
    });
    accurateContinueToggleButton.classList.add(
        'rovalra-home-layout-setting-control',
    );

    const updateState = () => {
        toggleButton.textContent = isHidden ? locale.show : locale.hide;
        toggleButton.setAttribute('aria-pressed', String(!isHidden));
        accurateContinueToggleButton.textContent = accurateContinueEnabled
            ? locale.disable
            : locale.enable;
        accurateContinueToggleButton.setAttribute(
            'aria-pressed',
            String(accurateContinueEnabled),
        );
        container.classList.toggle('is-hidden-category', isHidden);
    };

    const settingsList = document.createElement('div');
    settingsList.className = 'rovalra-home-layout-settings-list';
    settingsList.appendChild(
        createCategorySettingRow({
            title: locale.visibility,
            description: locale.visibilityDescription,
            control: toggleButton,
        }),
    );
    if (isContinueCategory(category)) {
        settingsList.appendChild(
            createCategorySettingRow({
                title: locale.accurateContinue,
                description: locale.accurateContinueDescription,
                control: accurateContinueToggleButton,
            }),
        );
    }

    updateState();
    container.append(title, settingsList);

    const saveButton = createButton(locale.save, 'primary', {
        onClick: () => {
            const nextHiddenKeys = new Set(hiddenCategoryKeys.map(String));
            if (isHidden) {
                nextHiddenKeys.add(categoryKey);
            } else {
                nextHiddenKeys.delete(categoryKey);
            }

            const saveVisibility = () =>
                new Promise((resolve) =>
                    saveHiddenCategoryKeys([...nextHiddenKeys], resolve),
                );

            const saveAccurateContinue = isContinueCategory(category)
                ? handleSaveSettings(
                      ACCURATE_CONTINUE_STORAGE_KEY,
                      accurateContinueEnabled === true,
                  )
                : Promise.resolve();

            Promise.all([saveVisibility(), saveAccurateContinue]).then(() => {
                overlayHandle?.close();
                window.location.reload();
            });
        },
    });

    overlayHandle = createOverlay({
        title: locale.settingsTitle,
        bodyContent: container,
        actions: [saveButton],
        maxWidth: '500px',
    });
}

function createHomeLayoutItem(category) {
    const item = document.createElement('li');
    item.className = 'rovalra-home-layout-item';
    item.dataset.categoryKey = category.key;
    item.classList.toggle(
        'rovalra-home-layout-item-hidden',
        !isFriendCarouselCategory(category) && isCategoryHidden(category.key),
    );

    const handle = document.createElement('span');
    handle.className = 'rovalra-home-layout-drag-handle';
    handle.setAttribute('aria-hidden', 'true');
    handle.innerHTML = decodeSvgAsset('dragHandle'); // verified

    const label = document.createElement('span');
    label.className = 'rovalra-home-layout-label';
    label.textContent = category.topic;

    const text = document.createElement('span');
    text.className = 'rovalra-home-layout-text';
    text.append(label);

    const actions = document.createElement('span');
    actions.className = 'rovalra-home-layout-actions';
    if (!isFriendCarouselCategory(category)) {
        actions.appendChild(
            createIconButton({
                assetName: 'edit',
                label: locale.edit,
                onClick: () => openCategorySettingsOverlay(category),
            }),
        );
    }

    item.append(handle, text, actions);
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

    const item = event.target.closest('.rovalra-home-layout-item');
    if (event.target.closest('.rovalra-home-layout-icon-button')) return;
    const list = item?.closest('.rovalra-home-layout-list');
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
        empty.textContent = locale.empty;
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

    const resetButton = createButton(locale.reset, 'secondary', {
        disabled: !savedOrder.length && !hiddenCategoryKeys.length,
        onClick: () => {
            chrome.storage.local.remove(
                [ORDER_STORAGE_KEY, HIDDEN_STORAGE_KEY],
                () => {
                    publishHomeLayoutState([], []);
                    overlayHandle?.close();
                    window.location.reload();
                },
            );
        },
    });

    const saveButton = createButton(locale.save, 'primary', {
        disabled: !list,
        onClick: () => {
            if (!list) return;

            saveOrderFromList(list, () => {
                overlayHandle?.close();
                window.location.reload();
            });
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

function getOrCreateHomeLayoutButton() {
    const existingButton = document.getElementById(
        'rovalra-home-layout-button',
    );
    if (existingButton) return existingButton;

    const button = createButton(locale.button, 'secondary', {
        id: 'rovalra-home-layout-button',
        onClick: openHomeLayoutOverlay,
    });
    button.classList.add('rovalra-home-layout-button');
    return button;
}

function hasNativeCustomizeHomeLayoutButton() {
    return Boolean(
        document.querySelector(
            '.customize-home-layout-btn, #customize-home-layout-btn',
        ),
    );
}

function removeHomeLayoutButton() {
    const button = document.getElementById('rovalra-home-layout-button');
    const buttonRow = button?.closest('.rovalra-home-layout-button-row');

    if (buttonRow) {
        buttonRow.remove();
    } else {
        button?.remove();
    }
}

function attachHomeLayoutButton(homeContainer) {
    const normalizedPath = window.location.pathname
        .toLowerCase()
        .replace(/^\/[a-z]{2}(?:-[a-z]{2})?\//, '/');
    if (!normalizedPath.startsWith('/home')) return;

    if (!homeLayoutButtonEnabled || hasNativeCustomizeHomeLayoutButton()) {
        removeHomeLayoutButton();
        return;
    }

    const button = getOrCreateHomeLayoutButton();
    const buttonRow =
        button.closest('.rovalra-home-layout-button-row') ??
        document.createElement('div');
    buttonRow.className = 'rovalra-home-layout-button-row';
    buttonRow.appendChild(button);

    const section = homeContainer.querySelector(':scope > .section, .section');
    const placeListContainer = homeContainer.querySelector(
        '.place-list-container',
    );
    homeContainer.dataset.rovalraHomeLayoutButton = 'true';
    homeContainer.classList.add('rovalra-home-layout-container');

    if (placeListContainer) {
        placeListContainer.before(buttonRow);
    } else if (section) {
        section.after(buttonRow);
    } else {
        homeContainer.appendChild(buttonRow);
    }
}

function hydrateFromStorage() {
    chrome.storage.local.get(
        {
            [ORDER_STORAGE_KEY]: [],
            [CATEGORIES_STORAGE_KEY]: [],
            [HIDDEN_STORAGE_KEY]: [],
        },
        (data) => {
            const compacted = compactCategoriesByKey(
                data[CATEGORIES_STORAGE_KEY],
            );
            categories = compacted.categories;
            if (compacted.changed) {
                chrome.storage.local.set({
                    [CATEGORIES_STORAGE_KEY]: categories,
                });
            }
            publishHomeLayoutState(
                data[ORDER_STORAGE_KEY],
                data[HIDDEN_STORAGE_KEY],
            );
        },
    );
}

export async function init() {
    if (!initialized) {
        if ((await settings.homeLayoutEnabled) === false) {
            initialized = true;
            publishHomeLayoutState([], []);
            return;
        }

        initialized = true;
        await loadLocale();
        homeLayoutButtonEnabled =
            (await settings.homeLayoutButtonEnabled) !== false;
        hydrateFromStorage();

        document.addEventListener('rovalra-home-layout-categories', (event) => {
            replaceCategories(event.detail?.categories);
        });

        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace !== 'local') return;

            if (changes[ORDER_STORAGE_KEY]) {
                publishHomeLayoutState(changes[ORDER_STORAGE_KEY].newValue);
            }

            if (changes[HIDDEN_STORAGE_KEY]) {
                publishHomeLayoutState(
                    savedOrder,
                    changes[HIDDEN_STORAGE_KEY].newValue,
                );
            }

            if (changes[CATEGORIES_STORAGE_KEY]) {
                const compacted = compactCategoriesByKey(
                    changes[CATEGORIES_STORAGE_KEY].newValue,
                );
                categories = compacted.categories;
            }
        });
    }

    if (!observersInitialized) {
        observersInitialized = true;
        observeElement('#HomeContainer', attachHomeLayoutButton, {
            multiple: true,
        });
        observeElement(
            '#HomeContainer .section',
            (section) => {
                const homeContainer = section.closest('#HomeContainer');
                if (homeContainer) attachHomeLayoutButton(homeContainer);
            },
            { multiple: true },
        );
        observeElement(
            '#HomeContainer .place-list-container',
            (placeListContainer) => {
                const homeContainer =
                    placeListContainer.closest('#HomeContainer');
                if (homeContainer) attachHomeLayoutButton(homeContainer);
            },
            { multiple: true },
        );
        observeElement(
            '.customize-home-layout-btn, #customize-home-layout-btn',
            removeHomeLayoutButton,
            { multiple: true },
        );
    }
}
