// Creates a dropdown in the new Roblox dropdown style

import { createDropdownContent } from './selects.js'; 

let isCssInjected = false;

function injectDropdownCss() {
    if (isCssInjected) return;
    isCssInjected = true;

    const style = document.createElement('style');
    style.id = 'rovalra-global-dropdown-style';
    style.textContent = `
        .rovalra-dropdown-container {
            position: relative;
            display: inline-block;
            vertical-align: middle; 
            margin: 0; 
        }
        .rovalra-dropdown-trigger .rovalra-dropdown-chevron {
            transition: transform 0.2s ease !important;
        }
        .rovalra-dropdown-trigger[data-state="open"] .rovalra-dropdown-chevron {
            transform: rotate(180deg);
        }
        .rovalra-dropdown-panel {
            cursor: default;
        }
    `;
    document.head.appendChild(style);
}


export function createDropdown({ items = [], initialValue, placeholder = 'Select...', onValueChange, showFlags = false }) {
    injectDropdownCss();

    const container = document.createElement('div');
    container.className = 'rovalra-dropdown-container';

    const trigger = document.createElement('button');

    trigger.className = 'rovalra-dropdown-trigger relative clip group/interactable focus-visible:outline-focus disabled:outline-none flex items-center justify-between width-full bg-none stroke-standard radius-medium height-1000 padding-x-medium text-body-medium stroke-default content-default';
    trigger.type = 'button';
    trigger.setAttribute('role', 'combobox');
    trigger.setAttribute('aria-haspopup', 'listbox');
    
    trigger.style.minHeight = '38px'; 

    const triggerPresentationDiv = document.createElement('div');
    triggerPresentationDiv.setAttribute('role', 'presentation');
    triggerPresentationDiv.className = 'absolute inset-[0] transition-colors group-hover/interactable:bg-[var(--color-state-hover)] group-active/interactable:bg-[var(--color-state-press)] group-disabled/interactable:bg-none';
    
    const textWrapper = document.createElement('div');
    textWrapper.className = 'grow-1 text-truncate-split text-align-x-left';
    
    const triggerValueSpan = document.createElement('span'); 
    triggerValueSpan.className = 'text-no-wrap text-truncate-split content-emphasis';
    triggerValueSpan.style.pointerEvents = 'none';

    textWrapper.innerHTML = `<span style="pointer-events: none;"></span>`;
    textWrapper.firstElementChild.appendChild(triggerValueSpan);
    
    const chevron = document.createElement('span');
    chevron.setAttribute('aria-hidden', 'true');
    chevron.className = 'rovalra-dropdown-chevron size-500 icon icon-regular-chevron-large-down content-default';
    
    if (items && items.length > 0) {
        const widestItem = items.reduce((prev, current) => (current.label.length > prev.label.length) ? current : prev, { label: '' });
        triggerValueSpan.textContent = widestItem.label || placeholder;

        Object.assign(trigger.style, { visibility: 'hidden', position: 'absolute' });
        container.appendChild(trigger);
        document.body.appendChild(container);
        
        const widestWidth = trigger.scrollWidth + 16;
        trigger.style.minWidth = `${widestWidth}px`;

        document.body.removeChild(container);
        Object.assign(trigger.style, { visibility: '', position: '' });
    } else {
        triggerValueSpan.textContent = placeholder;
    }

    trigger.append(triggerPresentationDiv, textWrapper, chevron);

    const updateTriggerText = (value) => {
        const selectedItem = items ? items.find(item => item.value === value) : null;
        
        while (triggerValueSpan.firstChild) {
            triggerValueSpan.removeChild(triggerValueSpan.firstChild);
        }
        
        if (selectedItem) {
            if (showFlags) {
                const getCountryCode = (regionCode) => {
                    if (regionCode === 'AUTO') return null;
                    const parts = regionCode.split('-');
                    return parts[0].toLowerCase();
                };

                const countryCode = getCountryCode(selectedItem.value);

                if (countryCode) {
                    const flagImg = document.createElement('img');
                    flagImg.src = `https://flagcdn.com/h20/${countryCode}.png`;
                    flagImg.srcset = `https://flagcdn.com/h40/${countryCode}.png 2x`;
                    flagImg.alt = `${countryCode} flag`;
                    flagImg.style.width = '20px';
                    flagImg.style.height = '15px';
                    flagImg.style.objectFit = 'cover';
                    flagImg.style.borderRadius = '3px';
                    flagImg.style.marginRight = '8px';
                    flagImg.style.flexShrink = '0';
                    flagImg.style.verticalAlign = 'middle';
                    triggerValueSpan.appendChild(flagImg);
                }
            }

            const textNode = document.createTextNode(selectedItem.label);
            triggerValueSpan.appendChild(textNode);
            trigger.removeAttribute('data-placeholder');
        } else {
            triggerValueSpan.textContent = placeholder;
            trigger.setAttribute('data-placeholder', 'true');
        }
    };

    const { element: contentPanel, toggleVisibility: toggleContentVisibility, updateSelectedState: updateContentSelectedState } = createDropdownContent(
        trigger, items || [], initialValue, onValueChange, updateTriggerText, showFlags
    );

    const toggleDropdown = (forceOpen) => { 
        const isOpen = forceOpen ?? contentPanel.getAttribute('data-state') !== 'open';
        toggleContentVisibility(isOpen);
        trigger.setAttribute('data-state', isOpen ? 'open' : 'closed');
        trigger.setAttribute('aria-expanded', String(isOpen));

        if (isOpen) {
            requestAnimationFrame(() => {
                const rect = contentPanel.getBoundingClientRect();
                const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
                if (rect.right > viewportWidth) {
                    const currentLeft = parseFloat(contentPanel.style.left);
                    if (!isNaN(currentLeft)) {
                        contentPanel.style.left = `${currentLeft - (rect.right - viewportWidth) - 20}px`;
                    }
                }
            });
        }
    };

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDropdown();
    });


    contentPanel.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    document.addEventListener('click', (e) => { 

        if (contentPanel.contains(e.target)) return;

        if (!container.contains(e.target) && contentPanel.getAttribute('data-state') === 'open') {
            toggleDropdown(false);
        }
    });

    if (initialValue) updateTriggerText(initialValue);
    container.append(trigger);

    return {
        element: container,
        panel: contentPanel,
        trigger: trigger,    
        setValue: (value) => {
            updateTriggerText(value);
            updateContentSelectedState(value);
            const parentWrapper = container.parentElement;
            if (parentWrapper) {
                const hiddenSelect = parentWrapper.querySelector('select[style*="display: none"]');
                if (hiddenSelect) {
                    hiddenSelect.value = value;
                    hiddenSelect.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
        }
    };
}

export function createDropdownMenu({ trigger, items, onValueChange, position }) {
    injectDropdownCss();

    const updateTriggerText = () => {};

    const { element: contentPanel, toggleVisibility } = createDropdownContent(
        trigger, items, null, onValueChange, updateTriggerText, false
    );

    const toggle = (forceOpen) => {
        const isOpen = forceOpen ?? contentPanel.getAttribute('data-state') !== 'open';
        toggleVisibility(isOpen);
        trigger.setAttribute('data-state', isOpen ? 'open' : 'closed');
        trigger.setAttribute('aria-expanded', String(isOpen));
        
        if (isOpen) {
            contentPanel.style.minWidth = '200px';
            if (position !== 'center') {
                const rect = trigger.getBoundingClientRect();
                if (rect.left + 200 > window.innerWidth) {
                    contentPanel.style.left = `${rect.right - 200 + window.scrollX}px`;
                }
            }
        }
    };

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        toggle();
    });

    contentPanel.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    document.addEventListener('click', (e) => {
        if (contentPanel.contains(e.target)) return;
        if (!trigger.contains(e.target) && contentPanel.getAttribute('data-state') === 'open') {
            toggle(false);
        }
    });

    return { panel: contentPanel, toggle };
}