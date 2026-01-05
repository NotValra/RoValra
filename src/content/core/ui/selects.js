export function createDropdownContent(triggerElement, items, initialValue, onValueChange, updateTriggerTextCallback, showFlags = false) {
    const contentPanel = document.createElement('div');
    contentPanel.className = 'rovalra-dropdown-content-panel foundation-web-menu bg-surface-100 stroke-standard stroke-default shadow-transient-high radius-large';
    contentPanel.setAttribute('role', 'listbox');
    contentPanel.style.minWidth = `${triggerElement.offsetWidth}px`; 

    const dropdownContentInner = document.createElement('div');
    dropdownContentInner.className = 'flex-dropdown-menu';
    contentPanel.appendChild(dropdownContentInner);

    let currentSelectedValue = initialValue;

    const updateSelectedState = (newValue) => {
        currentSelectedValue = newValue;
        contentPanel.querySelectorAll('.rovalra-dropdown-item').forEach(el => {
            const isSelected = el.dataset.value === newValue;
            el.setAttribute('data-selected', isSelected);
        });
    };

    const hasGroups = items.some(item => item.group);

    if (hasGroups) {
        const grouped = {};
        items.forEach(item => {
            const group = item.group || 'Other';
            if (!grouped[group]) grouped[group] = [];
            grouped[group].push(item);
        });

        const continentOrder = ['North America', 'South America', 'Europe', 'Asia', 'Africa', 'Oceania', 'Other'];
        
        continentOrder.forEach(groupName => {
            if (grouped[groupName]) {
                const headerEl = document.createElement('div');
                headerEl.className = 'rovalra-dropdown-section-header';
                headerEl.textContent = groupName;
                dropdownContentInner.appendChild(headerEl);

                grouped[groupName].forEach(item => {
                    dropdownContentInner.appendChild(createDropdownItem(item));
                });
            }
        });
    } else {
        items.forEach(item => {
            dropdownContentInner.appendChild(createDropdownItem(item));
        });
    }

    function createDropdownItem(item) {
        const itemEl = document.createElement('button');
        itemEl.className = 'rovalra-dropdown-item relative clip group/interactable focus-visible:outline-focus disabled:outline-none foundation-web-menu-item flex items-center content-default text-truncate-split focus-visible:hover:outline-none cursor-pointer stroke-none bg-none text-align-x-left width-full text-body-medium padding-x-medium padding-y-small gap-x-medium radius-medium';
        itemEl.type = 'button';
        itemEl.dataset.value = item.value;
        itemEl.setAttribute('role', 'option');
        itemEl.setAttribute('aria-selected', item.value === currentSelectedValue);

        const itemPresentationDiv = document.createElement('div');
        itemPresentationDiv.setAttribute('role', 'presentation');
        itemPresentationDiv.className = 'absolute inset-[0] transition-colors group-hover/interactable:bg-[var(--color-state-hover)] group-active/interactable:bg-[var(--color-state-press)] group-disabled/interactable:bg-none';

        const getCountryCode = (regionCode) => {
            if (regionCode === 'AUTO') return null;
            const parts = regionCode.split('-');
            return parts[0].toLowerCase();
        };

        const countryCode = getCountryCode(item.value);

        const itemTextWrapper = document.createElement('div');
        itemTextWrapper.className = 'grow-1 text-truncate-split flex flex-col gap-y-xsmall';
        itemTextWrapper.style.display = 'flex';
        itemTextWrapper.style.flexDirection = 'row';
        itemTextWrapper.style.alignItems = 'center';
        itemTextWrapper.style.gap = '8px';

        if (showFlags) {
            if (countryCode) {
                const flagImg = document.createElement('img');
                flagImg.src = `https://flagcdn.com/h20/${countryCode}.png`;
                flagImg.srcset = `https://flagcdn.com/h40/${countryCode}.png 2x`;
                flagImg.alt = `${countryCode} flag`;
                flagImg.style.width = '20px';
                flagImg.style.height = '15px';
                flagImg.style.objectFit = 'cover';
                flagImg.style.borderRadius = '3px';
                flagImg.style.flexShrink = '0';
                itemTextWrapper.appendChild(flagImg);
            }
        }

        const itemText = document.createElement('span');
        itemText.className = 'foundation-web-menu-item-title text-no-wrap text-truncate-split content-emphasis';
        itemText.textContent = item.label;
        itemText.style.flex = '1';
        itemTextWrapper.appendChild(itemText);
        itemEl.append(itemPresentationDiv, itemTextWrapper);

        itemEl.addEventListener('click', () => {
            updateSelectedState(item.value);
            updateTriggerTextCallback(item.value); 
            onValueChange(item.value); 
            toggleContentVisibility(false); 
        });
        return itemEl;
    }

    const positionContent = () => {
        const triggerRect = triggerElement.getBoundingClientRect();
        contentPanel.style.top = `${triggerRect.bottom + window.scrollY + 4}px`;
        contentPanel.style.left = `${triggerRect.left + window.scrollX}px`;
        contentPanel.style.minWidth = `${triggerRect.width}px`;
    };

    const toggleContentVisibility = (forceOpen) => {
        const isOpen = forceOpen ?? contentPanel.getAttribute('data-state') !== 'open';
        contentPanel.setAttribute('data-state', isOpen ? 'open' : 'closed');
        triggerElement.setAttribute('aria-expanded', String(isOpen));

        if (isOpen) {
            document.body.appendChild(contentPanel);
            positionContent();
            window.addEventListener('scroll', positionContent, { passive: true });
            window.addEventListener('resize', positionContent, { passive: true });
        } else {
            if (contentPanel.parentNode === document.body) {
                document.body.removeChild(contentPanel);
            }
            window.removeEventListener('scroll', positionContent);
            window.removeEventListener('resize', positionContent);
        }
    };

    updateSelectedState(initialValue);

    return {
        element: contentPanel,
        toggleVisibility: toggleContentVisibility,
        updateSelectedState: updateSelectedState 
    };
}