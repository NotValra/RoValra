import { createShimmerBlock } from './shimmer.js';

const injectScrollbarStyles = () => {
    if (document.getElementById('rovalra-dropdown-styles')) return;
    const style = document.createElement('style');
    style.id = 'rovalra-dropdown-styles';
    style.textContent = `
        .rovalra-no-scrollbar::-webkit-scrollbar { display: none; }
        .rovalra-no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .rovalra-dropdown-item[data-selected="true"].highlight-enabled {
            background-color: rgba(255, 255, 255, 0.1) !important;
            border-left: 3px solid var(--rovalra-play-button-color); 
        }
        .rovalra-text-clamp-2 {
            display: -webkit-box !important;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: normal !important; 
            word-break: break-word;
        }
    `;
    document.head.appendChild(style);
};

const DEFAULT_PANEL_MAX_HEIGHT = 300;
const VIEWPORT_EDGE_MARGIN = 8;
const PANEL_GAP = 4;

function getCssPixelValue(element, propertyName) {
    const value = Number.parseFloat(getComputedStyle(element)[propertyName]);
    return Number.isFinite(value) ? value : 0;
}

export function createDropdownContent(
    triggerElement,
    items,
    initialValue,
    onValueChange,
    updateTriggerTextCallback,
    showFlags = false,
    showScrollbar = true,
    highlightSelected = false,
    maxHeight = DEFAULT_PANEL_MAX_HEIGHT,
) {
    injectScrollbarStyles();

    const contentPanel = document.createElement('div');
    contentPanel.className =
        'rovalra-dropdown-content-panel foundation-web-menu bg-surface-100 stroke-standard stroke-default shadow-transient-high radius-large';
    contentPanel.setAttribute('role', 'listbox');
    contentPanel.style.minWidth = `${triggerElement.offsetWidth}px`;
    contentPanel.style.maxHeight = `${maxHeight}px`;
    contentPanel.style.overflow = 'hidden';

    const dropdownContentInner = document.createElement('div');
    dropdownContentInner.className = 'flex-dropdown-menu';
    dropdownContentInner.style.overflowY = 'auto';
    dropdownContentInner.style.maxHeight = `${maxHeight}px`;

    // Handle visual scrollbar toggle
    if (!showScrollbar) {
        dropdownContentInner.classList.add('rovalra-no-scrollbar');
    }

    contentPanel.appendChild(dropdownContentInner);

    let currentSelectedValue = initialValue;

    const updateSelectedState = (newValue) => {
        currentSelectedValue = newValue;
        contentPanel
            .querySelectorAll('.rovalra-dropdown-item')
            .forEach((el) => {
                const isSelected = el.dataset.value === String(newValue);
                el.setAttribute('data-selected', isSelected);
                el.setAttribute('aria-selected', isSelected);

                // Apply highlight class if requested
                if (highlightSelected) {
                    el.classList.add('highlight-enabled');
                }
            });
    };

    const renderItems = () => {
        dropdownContentInner.replaceChildren();
        const hasGroups = items.some((item) => item.group);

        if (hasGroups) {
            const grouped = {};
            items.forEach((item) => {
                const group = item.group || 'Other';
                if (!grouped[group]) grouped[group] = [];
                grouped[group].push(item);
            });

            const continentOrder = [
                'North America',
                'South America',
                'Europe',
                'Asia',
                'Africa',
                'Oceania',
                'Other',
            ];

            continentOrder.forEach((groupName) => {
                if (grouped[groupName]) {
                    const headerEl = document.createElement('div');
                    headerEl.className = 'rovalra-dropdown-section-header';
                    headerEl.textContent = groupName;
                    dropdownContentInner.appendChild(headerEl);

                    grouped[groupName].forEach((item) => {
                        dropdownContentInner.appendChild(
                            createDropdownItem(item),
                        );
                    });
                }
            });
        } else {
            items.forEach((item) => {
                dropdownContentInner.appendChild(createDropdownItem(item));
            });
        }

        updateSelectedState(currentSelectedValue);
    };

    function createDropdownItem(item) {
        const itemEl = document.createElement('button');
        itemEl.className =
            'rovalra-dropdown-item relative clip group/interactable focus-visible:outline-focus disabled:outline-none foundation-web-menu-item flex items-center content-default text-truncate-split focus-visible:hover:outline-none cursor-pointer stroke-none bg-none text-align-x-left width-full text-body-medium padding-x-medium padding-y-small gap-x-medium radius-medium';
        itemEl.type = 'button';
        itemEl.dataset.value = String(item.value);
        itemEl.setAttribute('role', 'option');

        const itemPresentationDiv = document.createElement('div');
        itemPresentationDiv.setAttribute('role', 'presentation');
        itemPresentationDiv.className =
            'absolute inset-[0] transition-colors group-hover/interactable:bg-[var(--color-state-hover)] group-active/interactable:bg-[var(--color-state-press)] group-disabled/interactable:bg-none';

        const getCountryCode = (regionCode) => {
            if (typeof regionCode !== 'string' || regionCode === 'AUTO')
                return null;
            const parts = regionCode.split('-');
            return parts[0].toLowerCase();
        };

        const countryCode = getCountryCode(item.value);

        const itemTextWrapper = document.createElement('div');
        itemTextWrapper.className =
            'grow-1 text-truncate-split flex flex-col gap-y-xsmall';

        if (item.loading) {
            itemEl.appendChild(
                createShimmerBlock({
                    width: '48px',
                    height: '48px',
                    borderRadius: '8px',
                    className: 'shrink-0',
                }),
            );

            itemTextWrapper.append(
                createShimmerBlock({
                    width: '65%',
                    height: '14px',
                }),
                createShimmerBlock({
                    width: '42%',
                    height: '12px',
                }),
            );
            itemEl.append(itemPresentationDiv, itemTextWrapper);

            itemEl.addEventListener('click', () => {
                updateSelectedState(item.value);
                updateTriggerTextCallback(item.value);
                onValueChange(item.value);
                toggleContentVisibility(false);
            });
            return itemEl;
        }

        if (showFlags && countryCode) {
            const flagImg = document.createElement('img');
            flagImg.src = `https://flagcdn.com/h20/${countryCode}.png`;
            flagImg.srcset = `https://flagcdn.com/h40/${countryCode}.png 2x`;
            flagImg.alt = `${countryCode} flag`;
            flagImg.style.width = '20px';
            flagImg.style.height = '15px';
            flagImg.style.objectFit = 'cover';
            flagImg.style.borderRadius = '3px';
            flagImg.style.flexShrink = '0';
            itemEl.appendChild(flagImg);
        }

        if (item.imageUrl) {
            const thumbnail = document.createElement('img');
            thumbnail.src = item.imageUrl;
            thumbnail.alt = '';
            thumbnail.className = 'shrink-0 clip radius-medium';
            Object.assign(thumbnail.style, {
                width: '48px',
                height: '48px',
                maxWidth: '48px',
                maxHeight: '48px',
                objectFit: 'cover',
                flex: '0 0 48px',
            });
            itemEl.appendChild(thumbnail);
        }

        const itemText = document.createElement('span');
        itemText.className =
            'foundation-web-menu-item-title text-no-wrap text-truncate-split content-emphasis';
        itemText.textContent = item.label;
        itemText.style.flex = '1';
        itemTextWrapper.appendChild(itemText);

        if (item.description) {
            const itemDescription = document.createElement('span');
            itemDescription.className =
                'text-body-small content-secondary text-truncate-split';
            itemDescription.textContent = item.description;
            itemTextWrapper.appendChild(itemDescription);
        }

        itemEl.append(itemPresentationDiv, itemTextWrapper);

        itemEl.addEventListener('click', () => {
            updateSelectedState(item.value);
            updateTriggerTextCallback(item.value);
            onValueChange(item.value);
            toggleContentVisibility(false);
        });
        return itemEl;
    }

    renderItems();

    const positionContent = () => {
        const triggerRect = triggerElement.getBoundingClientRect();
        const viewportWidth =
            document.documentElement.clientWidth || window.innerWidth;
        const viewportHeight =
            document.documentElement.clientHeight || window.innerHeight;
        const desiredMinWidth = Math.max(
            triggerRect.width,
            triggerElement.offsetWidth,
        );
        const maxWidth = Math.max(
            160,
            viewportWidth - VIEWPORT_EDGE_MARGIN * 2,
        );
        const minWidth = Math.min(desiredMinWidth, maxWidth);
        const spaceBelow =
            viewportHeight -
            triggerRect.bottom -
            PANEL_GAP -
            VIEWPORT_EDGE_MARGIN;
        const spaceAbove = triggerRect.top - PANEL_GAP - VIEWPORT_EDGE_MARGIN;

        contentPanel.style.minWidth = `${minWidth}px`;
        contentPanel.style.maxWidth = `${maxWidth}px`;
        contentPanel.style.maxHeight = 'none';
        dropdownContentInner.style.maxHeight = 'none';
        const naturalPanelHeight = contentPanel.offsetHeight;
        const requiredPanelHeight = Math.min(naturalPanelHeight, maxHeight);
        const openAbove =
            spaceBelow < requiredPanelHeight && spaceAbove > spaceBelow;
        const availableHeight = Math.max(
            96,
            Math.floor(openAbove ? spaceAbove : spaceBelow),
        );
        const panelMaxHeight = Math.min(maxHeight, availableHeight);

        contentPanel.style.maxHeight = `${panelMaxHeight}px`;

        const verticalPadding =
            getCssPixelValue(contentPanel, 'paddingTop') +
            getCssPixelValue(contentPanel, 'paddingBottom');
        dropdownContentInner.style.maxHeight = `${Math.max(
            64,
            panelMaxHeight - verticalPadding,
        )}px`;

        const panelWidth = Math.min(
            Math.max(contentPanel.offsetWidth || minWidth, minWidth),
            maxWidth,
        );
        const maxLeft = Math.max(
            VIEWPORT_EDGE_MARGIN,
            viewportWidth - panelWidth - VIEWPORT_EDGE_MARGIN,
        );
        const left = Math.min(
            Math.max(triggerRect.left, VIEWPORT_EDGE_MARGIN),
            maxLeft,
        );
        const panelHeight = contentPanel.offsetHeight;
        const top = openAbove
            ? triggerRect.top - panelHeight - PANEL_GAP
            : triggerRect.bottom + PANEL_GAP;

        contentPanel.style.left = `${left + window.scrollX}px`;
        contentPanel.style.top = `${
            Math.max(VIEWPORT_EDGE_MARGIN, top) + window.scrollY
        }px`;
    };

    const toggleContentVisibility = (forceOpen) => {
        const isOpen =
            forceOpen ?? contentPanel.getAttribute('data-state') !== 'open';
        contentPanel.setAttribute('data-state', isOpen ? 'open' : 'closed');
        triggerElement.setAttribute('aria-expanded', String(isOpen));

        if (isOpen) {
            document.body.appendChild(contentPanel);
            positionContent();
            window.addEventListener('scroll', positionContent, {
                passive: true,
            });
            window.addEventListener('resize', positionContent, {
                passive: true,
            });
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
        updateSelectedState: updateSelectedState,
        refresh: renderItems,
    };
}
