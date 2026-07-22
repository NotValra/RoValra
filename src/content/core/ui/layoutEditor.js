import DOMPurify from 'dompurify';
import { getAssets } from '../assets.js';

const HOLD_THRESHOLD = 200;
const MOVE_THRESHOLD = 5;

function decodeSvgAsset(assetName) {
    const svgData = getAssets()[assetName];
    if (!svgData?.startsWith('data:image/svg+xml,')) return '';
    return decodeURIComponent(svgData.split(',')[1]);
}

export function createLayoutIcon(assetName, classNamePrefix) {
    const icon = document.createElement('span');
    icon.className = `${classNamePrefix}-icon`;
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = DOMPurify.sanitize(decodeSvgAsset(assetName));
    return icon;
}

function updateVisibilityButton(
    button,
    item,
    nextHiddenKeys,
    locale,
    classNamePrefix,
    datasetKey,
) {
    const key = item.dataset[datasetKey];
    const hidden = nextHiddenKeys.has(key);
    const label = hidden ? locale.show : locale.hide;

    button.replaceChildren(
        createLayoutIcon(
            hidden ? 'visibilityOff' : 'visibility',
            classNamePrefix,
        ),
    );
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', String(!hidden));
    button.title = label;
    item.classList.toggle(`${classNamePrefix}-item-hidden`, hidden);
}

function createVisibilityButton(
    item,
    nextHiddenKeys,
    locale,
    classNamePrefix,
    datasetKey,
) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `${classNamePrefix}-visibility-button`;
    button.addEventListener('mousedown', (event) => event.stopPropagation());
    button.addEventListener('click', () => {
        const key = item.dataset[datasetKey];
        if (nextHiddenKeys.has(key)) {
            nextHiddenKeys.delete(key);
        } else {
            nextHiddenKeys.add(key);
        }
        updateVisibilityButton(
            button,
            item,
            nextHiddenKeys,
            locale,
            classNamePrefix,
            datasetKey,
        );
    });
    updateVisibilityButton(
        button,
        item,
        nextHiddenKeys,
        locale,
        classNamePrefix,
        datasetKey,
    );
    return button;
}

function createDisabledStatus(locale, classNamePrefix) {
    const status = document.createElement('span');
    status.className = `${classNamePrefix}-disabled-status`;
    status.textContent = locale.disabled;
    return status;
}

function createLayoutEditorItem({
    item: layoutItem,
    nextHiddenKeys,
    locale,
    classNamePrefix,
    datasetKey,
}) {
    const item = document.createElement('li');
    item.className = `${classNamePrefix}-item`;
    item.dataset[datasetKey] = layoutItem.key;

    const handle = document.createElement('span');
    handle.className = `${classNamePrefix}-drag-handle`;
    handle.setAttribute('aria-hidden', 'true');
    handle.appendChild(createLayoutIcon('dragHandle', classNamePrefix));

    const label = document.createElement('span');
    label.className = `${classNamePrefix}-label`;
    label.textContent = layoutItem.label;

    if (layoutItem.disabled) {
        item.classList.add(`${classNamePrefix}-item-disabled`);
        item.append(handle, label, createDisabledStatus(locale, classNamePrefix));
    } else {
        item.append(
            handle,
            label,
            createVisibilityButton(
                item,
                nextHiddenKeys,
                locale,
                classNamePrefix,
                datasetKey,
            ),
        );
    }

    return item;
}

function createInitialDragState() {
    return {
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
}

function setupDragList(listElement, classNamePrefix) {
    let dragState = createInitialDragState();
    let dropIndicator = null;

    function createDropIndicator() {
        if (dropIndicator) dropIndicator.remove();
        dropIndicator = document.createElement('div');
        dropIndicator.className = `${classNamePrefix}-drop-indicator`;
        document.body.appendChild(dropIndicator);
    }

    function getDropTarget(mouseY) {
        const items = Array.from(
            dragState.list.querySelectorAll(`.${classNamePrefix}-item`),
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
                dragState.list.querySelectorAll(`.${classNamePrefix}-item`),
            ).map((item) => [item, item.getBoundingClientRect()]),
        );
    }

    function animateListShift(previousRects) {
        if (!dragState.list) return;

        const items = Array.from(
            dragState.list.querySelectorAll(`.${classNamePrefix}-item`),
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
                item.style.transition =
                    'transform 0.16s ease, opacity 0.15s ease';
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

    function updateDropPosition(mouseY) {
        if (!dragState.list) return;

        const { targetElement, insertBefore } = getDropTarget(mouseY);
        if (targetElement) {
            showDropIndicator(targetElement, insertBefore);
        } else {
            hideDropIndicator();
        }
    }

    function beginDrag(event) {
        if (!dragState.element) return;

        dragState.active = true;

        const original = dragState.element;
        const rect = original.getBoundingClientRect();
        const clone = original.cloneNode(true);

        clone.classList.add(`${classNamePrefix}-drag-clone`);
        clone.style.position = 'fixed';
        clone.style.left = rect.left + 'px';
        clone.style.top = rect.top + 'px';
        clone.style.width = rect.width + 'px';
        clone.style.height = rect.height + 'px';
        clone.style.margin = '0';

        document.body.appendChild(clone);
        dragState.clone = clone;

        original.classList.add(`${classNamePrefix}-drag-source`);
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

    function finalizeDrop(mouseY) {
        if (!dragState.element || !dragState.list) return;

        moveDragElement(mouseY);
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
                `${classNamePrefix}-drag-source`,
            );
        }
        if (dropIndicator) {
            dropIndicator.remove();
            dropIndicator = null;
        }

        dragState = createInitialDragState();

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

    function onMouseDown(event) {
        if (event.button !== 0) return;
        if (event.target.closest(`.${classNamePrefix}-visibility-button`)) {
            return;
        }

        const item = event.target.closest(`.${classNamePrefix}-item`);
        const list = item?.closest(`.${classNamePrefix}-list`);
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

    listElement.addEventListener('mousedown', onMouseDown);

    return () => {
        listElement.removeEventListener('mousedown', onMouseDown);
        cleanupDragState();
    };
}

export function createLayoutEditorBody({
    items,
    nextHiddenKeys,
    locale,
    classNamePrefix,
    datasetKey = 'layoutKey',
}) {
    const container = document.createElement('div');
    container.className = `${classNamePrefix}-editor`;

    if (!items.length) {
        const empty = document.createElement('p');
        empty.className = `${classNamePrefix}-empty`;
        empty.textContent = locale.empty;
        container.appendChild(empty);
        return { container, list: null, cleanup: () => {} };
    }

    const list = document.createElement('ul');
    list.className = `${classNamePrefix}-list`;
    items.forEach((item) => {
        list.appendChild(
            createLayoutEditorItem({
                item,
                nextHiddenKeys,
                locale,
                classNamePrefix,
                datasetKey,
            }),
        );
    });
    const cleanup = setupDragList(list, classNamePrefix);

    container.appendChild(list);
    return { container, list, cleanup };
}
