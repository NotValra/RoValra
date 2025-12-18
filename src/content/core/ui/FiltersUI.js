// Creates a filter ui dropdown, it works but kinda meh
import { createCloseButton } from './closeButton.js';
import { createDropdown } from './dropdown.js';
import { createRadioButton } from './general/radio.js';
import { createStyledInput } from './catalog/input.js';


export function createAvatarFilterUI({ avatarFiltersEnabled, searchbarEnabled, onApply, onSearch, filterConfig = [] }) {
    const container = document.createElement('div');
    container.id = 'rovalra-fx-container';
    Object.assign(container.style, {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        marginBottom: '12px',
        flexWrap: 'nowrap'
    });

    if (avatarFiltersEnabled) {
        const buttonWrapper = document.createElement('div');
        buttonWrapper.style.position = 'relative';

        const toggleButton = document.createElement('button');
        toggleButton.id = 'rovalra-fx-toggle-btn';
        toggleButton.type = 'button';
        toggleButton.className = 'rovalra-dropdown-trigger relative clip group/interactable focus-visible:outline-focus disabled:outline-none flex items-center justify-between width-full bg-none stroke-standard radius-medium height-1000 padding-x-medium text-body-medium stroke-default content-default';

        const triggerPresentationDiv = document.createElement('div');
        triggerPresentationDiv.setAttribute('role', 'presentation');
        triggerPresentationDiv.className = 'absolute inset-[0] transition-colors group-hover/interactable:bg-[var(--color-state-hover)] group-active/interactable:bg-[var(--color-state-press)] group-disabled/interactable:bg-none';

        const triggerValue = document.createElement('span');
        triggerValue.className = 'text-no-wrap text-truncate-split content-default';
        triggerValue.textContent = 'Filter Items';

        const chevron = document.createElement('span');
        chevron.className = 'rovalra-dropdown-chevron size-500 icon icon-regular-chevron-large-down content-default';

        const dropdown = document.createElement('div');
        dropdown.id = 'rovalra-fx-dropdown';
        dropdown.className = 'rovalra-dropdown-content foundation-web-menu bg-surface-100 stroke-standard stroke-default shadow-transient-high radius-large';
        dropdown.style.minWidth = '340px';
        dropdown.style.maxHeight = 'none'; 
        dropdown.style.zIndex = '10010';


        dropdown.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        const headerContainer = document.createElement('div');
        headerContainer.className = 'padding-x-large padding-bottom-medium flex items-center justify-between';

        const headerTitle = document.createElement('h3');
        headerTitle.className = 'text-heading-medium';
        headerTitle.textContent = 'Filter Items';

        const closeButton = createCloseButton({ onClick: () => {
            dropdown.setAttribute('data-state', 'closed');
            toggleButton.setAttribute('data-state', 'closed');
            toggleButton.classList.remove('filter-button-active');
        }});


        headerContainer.appendChild(headerTitle);
        headerContainer.appendChild(closeButton);

        const filterOptionsContainer = document.createElement('div');
        filterOptionsContainer.className = 'padding-x-large padding-bottom-large flex flex-col gap-medium';
        filterOptionsContainer.style.maxHeight = '60vh'; 
        filterOptionsContainer.style.overflowY = 'visible'; 

        filterConfig.forEach(config => {
            if (config.type === 'wrapper') {
                const wrapper = document.createElement('div');
                wrapper.id = config.id;
                wrapper.style.display = 'none'; 
                wrapper.className = 'flex flex-col gap-medium pl-large mt-medium border-l-2 border-l-neutral-200';
                config.children.forEach(childConfig => {
                    const childRow = createFilterRow(childConfig);
                    if (childRow) wrapper.appendChild(childRow);
                });
                filterOptionsContainer.appendChild(wrapper);
                return;
            }

            const row = createFilterRow(config);
            if (row) filterOptionsContainer.appendChild(row);
        });

        function createFilterRow(config) {
            const row = document.createElement('div');
            row.className = 'flex items-center justify-between';

            const label = document.createElement('label');
            label.className = 'text-body';
            label.textContent = config.label;
            row.appendChild(label);

            let inputControl;
            switch (config.type) {
                case 'text':
                case 'number': {
                    const { container: styledInputContainer, input: styledInput } = createStyledInput({
                        id: config.id,
                        label: config.label,
                        placeholder: config.placeholder || ' '
                    });
                    styledInput.type = config.type;
                    if (config.min !== undefined) styledInput.min = config.min;

                    label.remove();
                    styledInputContainer.style.width = '100%'; 
                    inputControl = styledInputContainer;
                    break;
                }
                case 'toggle':
                    inputControl = createRadioButton({ 
                        id: config.id,
                        onChange: config.isMaster ? (isChecked) => {
                            config.controls?.forEach(controlledId => {
                                const controlledElement = document.getElementById(controlledId);
                                if (controlledElement) {
                                    controlledElement.style.display = isChecked ? 'flex' : 'none';
                                }
                            });
                        } : null
                    });
                    break;
                case 'dropdown':
                    const { element: dropdownElement, setValue } = createDropdown({
                        items: config.options,
                        initialValue: config.initialValue,
                        onValueChange: (value) => {
                            const hiddenSelect = document.getElementById(config.id);
                            if (hiddenSelect) {
                                hiddenSelect.value = value;
                                hiddenSelect.dispatchEvent(new Event('change', { bubbles: true }));
                            }
                        }
                    });
                    const hiddenSelect = document.createElement('select');
                    hiddenSelect.id = config.id;
                    hiddenSelect.style.display = 'none';
                    config.options.forEach(opt => {
                        const option = document.createElement('option');
                        option.value = opt.value;
                        hiddenSelect.appendChild(option);
                    });
                    dropdownElement.appendChild(hiddenSelect);
                    inputControl = dropdownElement;
                    inputControl.style.flexShrink = '0'; 
                    break;
                case 'color':
                    const controlsContainer = document.createElement('div');
                    controlsContainer.className = 'flex items-center gap-small';

                    const colorPicker = document.createElement('input');
                    colorPicker.type = 'color';
                    colorPicker.id = config.colorPickerId;
                    colorPicker.value = config.defaultValue || '#000000';
                    colorPicker.className = 'input-field'; 
                    Object.assign(colorPicker.style, { width: '40px', height: '30px', padding: '2px', minWidth: '40px', border: 'none', background: 'none' });

                    const colorToggle = createRadioButton({ id: config.id });

                    colorPicker.addEventListener('input', () => {
                        if (colorToggle.getAttribute('aria-checked') !== 'true') {
                            colorToggle.setChecked(true);
                        }
                    });

                    controlsContainer.append(colorPicker, colorToggle);
                    inputControl = controlsContainer;
                    break;
            }

            if (inputControl) row.appendChild(inputControl);
            return row;
        }

        const applyBtn = document.createElement('button');
        applyBtn.id = 'rovalra-price-apply-btn';
        applyBtn.textContent = 'Apply Filter';
        applyBtn.className = 'apply-button btn-primary-md btn-full-width';
        applyBtn.style.marginTop = '20px';
        applyBtn.style.backgroundColor = 'rgb(51, 95, 255)';
        applyBtn.style.borderWidth = '0px';
        applyBtn.style.color = 'white';
        
        applyBtn.onclick = () => {
            if (onApply) onApply();
            dropdown.setAttribute('data-state', 'closed');
            toggleButton.setAttribute('data-state', 'closed');
        };
        filterOptionsContainer.appendChild(applyBtn);

        dropdown.appendChild(headerContainer);
        dropdown.appendChild(filterOptionsContainer);
        buttonWrapper.appendChild(toggleButton);
        toggleButton.append(triggerPresentationDiv, triggerValue, chevron);

        buttonWrapper.appendChild(dropdown);
        container.appendChild(buttonWrapper);

        toggleButton.addEventListener('click', (e) => {
            e.stopPropagation();
            const isScanning = toggleButton.textContent.includes('Scanning');
            if (isScanning) return;
            const isOpen = dropdown.getAttribute('data-state') === 'open';
            dropdown.setAttribute('data-state', isOpen ? 'closed' : 'open');
            toggleButton.setAttribute('data-state', isOpen ? 'closed' : 'open'); 
            toggleButton.classList.toggle('filter-button-active', !isOpen);
        });
        
        document.addEventListener('click', (e) => {
            if (!container.contains(e.target) && dropdown.getAttribute('data-state') === 'open') {
                dropdown.setAttribute('data-state', 'closed');
                toggleButton.setAttribute('data-state', 'closed');
                toggleButton.classList.remove('filter-button-active');
            }
        });
    }

    if (searchbarEnabled) {
        const searchInput = document.createElement('input');
        searchInput.id = 'rovalra-fx-search-bar';
        searchInput.className = 'form-control input-field';
        searchInput.type = 'text';
        searchInput.placeholder = 'Search';
        Object.assign(searchInput.style, {
            flexGrow: '1',
            width: 'auto'
        });
        searchInput.addEventListener('input', onSearch);
        container.appendChild(searchInput);
    }

    return container;
}