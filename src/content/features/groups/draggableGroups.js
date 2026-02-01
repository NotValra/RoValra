import { observeElement, startObserving } from '../../core/observer.js';

const STORAGE_KEY = 'rovalra_groups_order';
const HOLD_THRESHOLD = 75;

let dragState = {
    active: false,
    element: null,
    clone: null,
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0,
    holdTimer: null,
    preventClick: false
};

let dropIndicator = null;
let isEnabled = false;

export function init() {
    chrome.storage.local.get(['draggableGroupsEnabled'], (result) => {
        isEnabled = result.draggableGroupsEnabled !== false;
        if (!isEnabled) return;

        startObserving();
        initializeDragSystem();
    });

    chrome.storage.onChanged.addListener((changes) => {
        if (changes.draggableGroupsEnabled) {
            isEnabled = changes.draggableGroupsEnabled.newValue !== false;
            if (isEnabled) {
                initializeDragSystem();
            } else {
                destroyDragSystem();
            }
        }
    });
}

function initializeDragSystem() {
    observeElement('a.groups-list-item', (link) => {
        const container = link.closest('.groups-list-items-container');
        if (!container || container.hasAttribute('data-rovalra-drag')) return;
        
        container.setAttribute('data-rovalra-drag', 'true');
        
        setTimeout(() => {
            restoreSavedOrder(container);
            setupDragHandlers(container);
        }, 100);
    });
}

function setupDragHandlers(container) {
    const links = container.querySelectorAll('a.groups-list-item');
    
    links.forEach(link => {
        link.addEventListener('mousedown', onMouseDown);
        link.addEventListener('click', onClick, true);
        link.setAttribute('draggable', 'false');
    });
}

function onClick(e) {
    if (dragState.preventClick) {
        e.preventDefault();
        e.stopPropagation();
        dragState.preventClick = false;
        return false;
    }
}

function onMouseDown(e) {
    if (!isEnabled || e.button !== 0) return;
    
    const link = e.currentTarget;
    const rect = link.getBoundingClientRect();
    
    dragState.element = link;
    dragState.startX = e.clientX;
    dragState.startY = e.clientY;
    dragState.offsetX = e.clientX - rect.left;
    dragState.offsetY = e.clientY - rect.top;
    dragState.preventClick = false;
    
    dragState.holdTimer = setTimeout(() => {
        const moved = Math.abs(e.clientX - dragState.startX) > 3 || Math.abs(e.clientY - dragState.startY) > 3;
        if (!moved) {
            beginDrag(e);
        }
    }, HOLD_THRESHOLD);
    
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
}

function beginDrag(e) {
    if (!dragState.element) return;
    
    dragState.active = true;
    dragState.preventClick = true;
    
    const original = dragState.element;
    const rect = original.getBoundingClientRect();
    
    const clone = original.cloneNode(true);
    clone.style.position = 'fixed';
    clone.style.left = rect.left + 'px';
    clone.style.top = rect.top + 'px';
    clone.style.width = rect.width + 'px';
    clone.style.height = rect.height + 'px';
    clone.style.margin = '0';
    clone.style.zIndex = '99999';
    clone.style.pointerEvents = 'none';
    clone.style.opacity = '0.8';
    clone.style.transition = 'none';
    clone.style.boxShadow = '0 8px 24px rgba(0,0,0,0.3)';
    
    document.body.appendChild(clone);
    dragState.clone = clone;
    
    original.style.opacity = '0.3';
    original.style.transform = 'scale(0.95)';
    original.style.transition = 'all 0.15s ease';
    
    createDropIndicator();
    
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
}

function createDropIndicator() {
    dropIndicator = document.createElement('div');
    dropIndicator.style.position = 'absolute';
    dropIndicator.style.height = '2px';
    dropIndicator.style.backgroundColor = '#0066ff';
    dropIndicator.style.borderRadius = '1px';
    dropIndicator.style.pointerEvents = 'none';
    dropIndicator.style.zIndex = '99998';
    dropIndicator.style.display = 'none';
    dropIndicator.style.transition = 'all 0.15s ease';
    document.body.appendChild(dropIndicator);
}

function onMouseMove(e) {
    if (dragState.holdTimer) {
        const moved = Math.abs(e.clientX - dragState.startX) > 3 || Math.abs(e.clientY - dragState.startY) > 3;
        if (moved) {
            clearTimeout(dragState.holdTimer);
            dragState.holdTimer = null;
        }
    }
    
    if (!dragState.active || !dragState.clone) return;
    
    e.preventDefault();
    dragState.preventClick = true;
    
    const x = e.clientX - dragState.offsetX;
    const y = e.clientY - dragState.offsetY;
    
    dragState.clone.style.left = x + 'px';
    dragState.clone.style.top = y + 'px';
    
    updateDropPosition(e.clientY);
}

function updateDropPosition(mouseY) {
    const container = dragState.element.closest('.groups-list-items-container');
    if (!container) return;
    
    const section = dragState.element.parentElement?.closest('div.padding-bottom-small');
    if (!section) return;
    
    const links = Array.from(section.querySelectorAll('a.groups-list-item')).filter(l => l !== dragState.element);
    
    let targetElement = null;
    let insertBefore = true;
    
    for (const link of links) {
        const rect = link.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        
        if (mouseY < midY) {
            targetElement = link;
            insertBefore = true;
            break;
        }
    }
    
    if (!targetElement && links.length > 0) {
        targetElement = links[links.length - 1];
        insertBefore = false;
    }
    
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
    dropIndicator.style.top = (y - 1) + 'px';
    dropIndicator.style.width = rect.width + 'px';
    dropIndicator.style.display = 'block';
}

function hideDropIndicator() {
    if (dropIndicator) {
        dropIndicator.style.display = 'none';
    }
}

function onMouseUp(e) {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    
    if (dragState.holdTimer) {
        clearTimeout(dragState.holdTimer);
        dragState.holdTimer = null;
    }
    
    if (dragState.active) {
        finalizeDrop(e.clientY);
    }
    
    if (dragState.clone) {
        dragState.clone.remove();
        dragState.clone = null;
    }
    
    if (dragState.element) {
        dragState.element.style.opacity = '';
        dragState.element.style.transform = '';
        dragState.element.style.transition = '';
    }
    
    hideDropIndicator();
    if (dropIndicator) {
        dropIndicator.remove();
        dropIndicator = null;
    }
    
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    
    setTimeout(() => {
        dragState.active = false;
        dragState.element = null;
        dragState.preventClick = false;
    }, 10);
}

function finalizeDrop(mouseY) {
    const container = dragState.element.closest('.groups-list-items-container');
    if (!container) return;
    
    const section = dragState.element.parentElement?.closest('div.padding-bottom-small');
    if (!section) return;
    
    const links = Array.from(section.querySelectorAll('a.groups-list-item')).filter(l => l !== dragState.element);
    
    let targetElement = null;
    let insertBefore = true;
    
    for (const link of links) {
        const rect = link.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        
        if (mouseY < midY) {
            targetElement = link;
            insertBefore = true;
            break;
        }
    }
    
    if (targetElement) {
        const parent = targetElement.parentElement;
        if (insertBefore) {
            parent.insertBefore(dragState.element, targetElement);
        } else {
            if (targetElement.nextSibling) {
                parent.insertBefore(dragState.element, targetElement.nextSibling);
            } else {
                parent.appendChild(dragState.element);
            }
        }
    } else if (links.length > 0) {
        const parent = links[links.length - 1].parentElement;
        parent.appendChild(dragState.element);
    }
    
    persistOrder(container);
}

function persistOrder(container) {
    const links = container.querySelectorAll('a.groups-list-item');
    const order = [];
    
    links.forEach((link, idx) => {
        const href = link.getAttribute('href');
        const match = href?.match(/\/communities\/(\d+)/);
        if (match) {
            order.push({ groupId: match[1], position: idx });
        }
    });
    
    chrome.storage.local.set({ [STORAGE_KEY]: order });
}

function restoreSavedOrder(container) {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
        const savedOrder = result[STORAGE_KEY];
        if (!savedOrder || !savedOrder.length) return;
        
        const orderMap = new Map(savedOrder.map(o => [o.groupId, o.position]));
        const sections = container.querySelectorAll('div.padding-bottom-small');
        
        sections.forEach(section => {
            const wrapper = section.querySelector('div');
            if (!wrapper) return;
            
            const links = Array.from(section.querySelectorAll('a.groups-list-item'));
            
            links.sort((a, b) => {
                const aHref = a.getAttribute('href');
                const bHref = b.getAttribute('href');
                const aMatch = aHref?.match(/\/communities\/(\d+)/);
                const bMatch = bHref?.match(/\/communities\/(\d+)/);
                
                if (!aMatch || !bMatch) return 0;
                
                const aPos = orderMap.get(aMatch[1]) ?? 999;
                const bPos = orderMap.get(bMatch[1]) ?? 999;
                
                return aPos - bPos;
            });
            
            links.forEach(link => wrapper.appendChild(link));
        });
    });
}

function destroyDragSystem() {
    const containers = document.querySelectorAll('.groups-list-items-container[data-rovalra-drag]');
    containers.forEach(container => {
        container.removeAttribute('data-rovalra-drag');
        const links = container.querySelectorAll('a.groups-list-item');
        links.forEach(link => {
            link.removeEventListener('mousedown', onMouseDown);
            link.removeEventListener('click', onClick, true);
        });
    });
}
