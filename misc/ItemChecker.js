(function() {
    function isOnSupportedPage() {
        const url = window.location.href;
        return url.includes("/users/") && (url.includes("/profile") || url.includes("/inventory"));
    }
    
    const checkStorageAndRun = async () => {
        if (!isOnSupportedPage()) {
            return;
        }
        
        try {
            if (typeof chrome !== 'undefined' && chrome.storage) {
                chrome.storage.local.get(['privateInventoryEnabled'], function(result) {
                    if (result.privateInventoryEnabled === true) {
                        initializeScript();
                    }
                });
            } else {
                const setting = localStorage.getItem('privateInventoryEnabled');
                if (setting === 'true') {
                    initializeScript();
                }
            }
        } catch (error) {
            console.error("Error checking storage settings:", error);
        }
    };

    const initializeScript = () => {
        // thats a lot of stuff
        let inventoryCheckRunning = false;
        let isInitialized = false
        let uiAdded = false;
        let currentUserId = null;
        let currentDisplayName = null;
        let inventoryHiddenParentElement = null;
        let filterContainerSimple = null;
        let creatorNameInput = null;
        let minPriceInput = null;
        let applyButton = null;
        let currentFilter = "Creator Name";
        let limitedsToggle = null;
        let limitDropdown = null;
        let currentLimit = 120;
        let recentlyPublishedToggle = null;
        let includeOffsaleToggle = null;

        let filterButtonElement = null;
        let filterModalContainer = null;
        let creatorItemsData = null;
        let resultParentElement = null;
        let ownershipTextElement = null;
        let ownedItemsResultContainer = null;
        let unownedItemsResultContainer = null;
        let ownedTabButton = null;
        let unownedTabButton = null;
        let tabButtonsContainer = null;

        const checkApplyButtonState = () => {
            if (!applyButton) return;
            if (recentlyPublishedToggle.checked) {
                applyButton.removeAttribute('disabled');
                applyButton.style.backgroundColor = document.documentElement.style.getPropertyValue('--button-primary-background');
                applyButton.style.color = document.documentElement.style.getPropertyValue('--button-primary-text');
            } else if (currentFilter === "Creator Name" && creatorNameInput && creatorNameInput.value.trim() !== "") {
                applyButton.removeAttribute('disabled');
                applyButton.style.backgroundColor = document.documentElement.style.getPropertyValue('--button-primary-background');
                applyButton.style.color = document.documentElement.style.getPropertyValue('--button-primary-text');
            } else {
                applyButton.setAttribute('disabled', '');
                applyButton.style.backgroundColor = document.documentElement.style.getPropertyValue('--button-disabled-background');
                applyButton.style.color = document.documentElement.style.getPropertyValue('--button-disabled-text');
            }
        };

        const applyFilters = async () => {
            if (ownershipTextElement) ownershipTextElement.style.display = 'none';
            if (ownedItemsResultContainer) {
                ownedItemsResultContainer.style.display = 'none';
                clearNoItemsMessage(ownedItemsResultContainer);
            }
            if (unownedItemsResultContainer) {
                unownedItemsResultContainer.style.display = 'none';
                clearNoItemsMessage(unownedItemsResultContainer);
            }
            if (tabButtonsContainer) tabButtonsContainer.style.display = 'none';

            const creatorName = creatorNameInput.value.trim();
            const minPrice = minPriceInput.value.trim();
            const includeLimiteds = limitedsToggle.checked;
            currentLimit = parseInt(limitDropdown.value);
            const includeRecentlyPublished = recentlyPublishedToggle.checked;
            const includeOffsale = includeOffsaleToggle.checked;

            filterModalContainer.style.display = 'none';
            filterButtonElement.classList.remove('filter-button-active');
            creatorItemsData = null;

            const button2 = document.querySelector('.item-ownership-button');
            let resultContainer = resultParentElement.querySelector('#item-ownership-result-container');

            if (!ownedItemsResultContainer) {
                ownedItemsResultContainer = document.createElement('div');
                ownedItemsResultContainer.id = 'item-ownership-result-container-owned';
                applyResultContainerStyles(ownedItemsResultContainer);
            }
            if (!unownedItemsResultContainer) {
                unownedItemsResultContainer = document.createElement('div');
                unownedItemsResultContainer.id = 'item-ownership-result-container-unowned';
                applyResultContainerStyles(unownedItemsResultContainer);
                unownedItemsResultContainer.style.display = 'none';
            }

            if (currentFilter === "Creator Name" && (creatorName || includeRecentlyPublished)) {
                let returnValue = 1;
                let sortTypeParam = '';
                let categoryFilterParam = `&CategoryFilter=${returnValue}`;
                let includeNotForSaleParam = includeOffsale ? '&IncludeNotForSale=True' : '&IncludeNotForSale=False';

                if (includeRecentlyPublished) {
                    returnValue = 3;
                    sortTypeParam = '&SortType=3';
                    categoryFilterParam = '';
                } else if (includeLimiteds) {
                    categoryFilterParam = `&CategoryFilter=2`;
                }

                let allCreatorItemsData = [];
                let nextPageCursor = null;
                let pageCount = 0;
                let totalItemsFetched = 0;

                if (button2) {
                    button2.disabled = true;
                    button2.textContent = 'Checking Ownership...';
                }
                if (ownedItemsResultContainer) {
                    ownedItemsResultContainer.innerHTML = '';
                }
                if (unownedItemsResultContainer) {
                    unownedItemsResultContainer.innerHTML = '';
                }

                if (ownershipTextElement && currentDisplayName) {
                    ownershipTextElement.textContent = `Checking items it might take a bit.`;
                    ownershipTextElement.style.display = 'block';
                    ownershipTextElement.style.padding = '5px';
                }

                do {
                    pageCount++;
                    let apiUrl = `https://catalog.roblox.com/v2/search/items/details?creatorName=${encodeURIComponent(creatorName)}&minprice=${minPrice}&limit=120${sortTypeParam}${categoryFilterParam}${includeNotForSaleParam}`;
                    if (nextPageCursor) {
                        apiUrl += `&cursor=${nextPageCursor}`;
                    }

                    try {
                        const response = await fetch(apiUrl, {credentials: 'include',});
                        if (!response.ok) {
                            throw new Error(`HTTP error! Status: ${response.status} on page ${pageCount}`);
                        }
                        const apiResponse = await response.json();
                        if (apiResponse && apiResponse.data) {
                            const itemsThisPage = apiResponse.data;
                            allCreatorItemsData = allCreatorItemsData.concat(itemsThisPage);
                            totalItemsFetched += itemsThisPage.length;
                        }
                        nextPageCursor = apiResponse.nextPageCursor;

                        if (currentLimit && totalItemsFetched >= currentLimit) {
                            nextPageCursor = null;
                            break;
                        }

                    } catch (error) {
                        if (button2) {
                            button2.textContent = 'Check Ownership';
                            button2.disabled = false;
                        }
                        return;
                    }
                } while (nextPageCursor);

                creatorItemsData = { data: allCreatorItemsData };

                if (creatorItemsData && creatorItemsData.data) {
                    if (ownershipTextElement && currentDisplayName) {
                        ownershipTextElement.textContent = `Checking ${creatorItemsData.data.length} items it might take a bit.`;
                    }

                    const ownershipPromises = creatorItemsData.data.map(item => checkItemOwnership(item, true));
                    const ownershipResults = await Promise.all(ownershipPromises);

                    const itemsWithOwnerShip = creatorItemsData.data.map((item, index) => ({
                        item: item,
                        owned: ownershipResults[index].owned,
                        apiResponse: ownershipResults[index].apiResponse
                    }));

                    await displayBatchOwnershipResults(itemsWithOwnerShip, resultParentElement);

                    if (button2) {
                        button2.disabled = false;
                        button2.textContent = 'Check Single Item';
                    }
                    if (ownershipTextElement && currentDisplayName) {
                        ownershipTextElement.textContent = `${currentDisplayName} owns these items`;
                        ownershipTextElement.style.display = 'block';
                        ownershipTextElement.style.display = 'none';
                    }

                    if (tabButtonsContainer) tabButtonsContainer.style.display = 'flex';
                    if (ownedTabButton) ownedTabButton.click();
                }
            } else {
                if (button2) {
                    button2.textContent = 'Check Ownership';
                }
            }
        };

        const delay = (ms) => new Promise(res => setTimeout(res, ms));

        function applyCopiedFilterModalStyles(modal, theme) {
            if (!modal) return;
            const isDark = theme === 'dark';
            const modalBackgroundColor = document.documentElement.style.getPropertyValue('--modal-background');
            const modalBorderColor = document.documentElement.style.getPropertyValue('--modal-border-color');
            const modalBoxShadow = document.documentElement.style.getPropertyValue('--modal-box-shadow');
            const modalTextColor = document.documentElement.style.getPropertyValue('--modal-text-color');

            const styles = {
                'webkitTextSizeAdjust': '100%',
                'backgroundImage': '',
                'backgroundRepeat': 'no-repeat',
                'backgroundBlendMode': 'normal',
                'backgroundSize': 'auto',
                'backgroundColor': modalBackgroundColor,
                'color': modalTextColor,
                'fontFamily': 'Builder Sans,Helvetica Neue,Helvetica,Arial,Lucida Grande,sans-serif',
                'textRendering': 'auto',
                'webkitFontSmoothing': 'antialiased',
                'fontSize': '16px',
                'fontWeight': '400',
                'lineHeight': '1.4em',
                'display': 'flex',
                'flexDirection': 'column',
                'borderRadius': '12px',
                'border': `1px solid ${modalBorderColor}`,
                'boxShadow': modalBoxShadow,
                'overflow': 'hidden',
                'position': 'absolute',
                'zIndex': '1000',
                'top': '45px',
                'left': '50%',
                'transform': 'translateX(-50%)',
                'minWidth': '320px',
                'maxWidth': '400px',
                'boxSizing': 'border-box',
                'padding': '0px'
            };
            for (const styleProp in styles) { modal.style[styleProp] = styles[styleProp]; }
        }

        function applyCopiedFilterHeaderStyles(header, theme) {
            if (!header) return;
            const isDark = theme === 'dark';
            const headerTextColor = document.documentElement.style.getPropertyValue('--modal-header-text-color');
            const headerBackgroundColor = document.documentElement.style.getPropertyValue('--modal-header-background');

            const styles = {
                'webkitTextSizeAdjust': '100%',
                'backgroundImage': '',
                'backgroundRepeat': 'no-repeat',
                'backgroundBlendMode': 'normal',
                'backgroundSize': 'auto',
                'color': headerTextColor,
                'fontFamily': 'Builder Sans,Helvetica Neue,Helvetica,Arial,Lucida Grande,sans-serif',
                'textRendering': 'auto',
                'webkitFontSmoothing': 'antialiased',
                'fontSize': '16px',
                'fontWeight': '400',
                'lineHeight': '1.4em',
                'display': 'flex',
                'flexDirection': 'row',
                'justifyContent': 'space-between',
                'alignItems': 'center',
                'padding': '0 24px',
                'marginTop': '12px',
                'marginBottom': '12px',
                'gap': '24px',
                'backgroundColor': headerBackgroundColor,
                'boxSizing': 'border-box',
                'min-height': '40px',
                'position': 'relative'
            };

            for (const styleProp in styles) {
                header.style[styleProp] = styles[styleProp];
            }
        }

        function applyHeaderCloseButtonContainerStyles(container) {
            if (!container) return;

            const styles = {
                'display': 'flex',
                'alignItems': 'center',
                'height': '100%',
                'position': 'absolute',
                'top': '0',
                'right': '0'
            };
            for (const styleProp in styles) {
                container.style[styleProp] = styles[styleProp];
            }
        }

        function applyCopiedFilterOptionsStyles(optionsContainer, theme) {
            if (!optionsContainer) return;
            const isDark = theme === 'dark';
            const optionsTextColor = document.documentElement.style.getPropertyValue('--modal-options-text-color');
            const optionsBackgroundColor = document.documentElement.style.getPropertyValue('--modal-options-background');

            const styles = {
                'webkitTextSizeAdjust': '100%',
                'backgroundImage': '',
                'backgroundRepeat': 'no-repeat',
                'backgroundBlendMode': 'normal',
                'backgroundSize': 'auto',
                'fontFamily': 'Builder Sans,Helvetica Neue,Helvetica,Arial,Lucida Grande,sans-serif',
                'textRendering': 'auto',
                'webkitFontSmoothing': 'antialiased',
                'fontSize': '16px',
                'fontWeight': '400',
                'lineHeight': '1.4em',
                'display': 'flex',
                'flexDirection': 'column',
                'maxHeight': '60vh',
                'overflowY': 'auto',
                'msOverflowStyle': 'none',
                'scrollbarWidth': 'none',
                'marginBottom': '22px',
                'backgroundColor': optionsBackgroundColor,
                'color': optionsTextColor,
                'padding': '0 0px',
                'boxSizing': 'border-box',
                'border': 'none'
            };

            for (const styleProp in styles) {
                optionsContainer.style[styleProp] = styles[styleProp];
            }
            optionsContainer.style.setProperty('::-webkit-scrollbar', 'none');
        }

        function applyFilterOptionButtonStyles(button, theme) {
            if (!button) return;
            const isDark = theme === 'dark';
            const buttonTextColor = document.documentElement.style.getPropertyValue('--filter-option-button-text-color');
            const buttonHoverBackgroundColor = document.documentElement.style.getPropertyValue('--filter-option-button-hover-background');

            const styles = {
                'webkitTextSizeAdjust': '100%',
                'backgroundImage': '',
                'backgroundRepeat': 'no-repeat',
                'backgroundBlendMode': 'normal',
                'backgroundSize': 'auto',
                'color': buttonTextColor,
                'fontFamily': 'Builder Sans,Helvetica Neue,Helvetica,Arial,Lucida Grande,sans-serif',
                'textRendering': 'auto',
                'webkitFontSmoothing': 'antialiased',
                'fontSize': '16px',
                'fontWeight': '400',
                'lineHeight': '1.4em',
                'display': 'flex',
                'flexDirection': 'row',
                'justifyContent': 'space-between',
                'alignItems': 'center',
                'borderColor': 'transparent',
                'backgroundColor': 'transparent',
                'gap': '24px',
                'padding': '12px 24px',
                'marginBottom': '12px',
                'boxSizing': 'border-box',
                'border': 'none',
                'cursor': 'pointer',
                '-webkit-appearance': 'button',
                'text-transform': 'none',
                'overflow': 'visible',
                'margin': '5px',
                'padding': '24px',
                'margin': '5px',
                'borderRadius': '0px',
                'min-width': '300px',
                'transition': 'background-color 0.15s ease-in-out'
            };

            for (const styleProp in styles) {
                button.style[styleProp] = styles[styleProp];
            }

            button.addEventListener('mouseover', () => {
                button.style.backgroundColor = buttonHoverBackgroundColor;
            });

            button.addEventListener('mouseout', () => {
                button.style.backgroundColor = 'transparent';
            });
        }

        function applyActionButtonsContainerStyles(container) {
            if (!container) return;

            container.style.padding = '0 24px';
        }

        function applyCopiedCreatorNameOptionStyles(creatorNameOption, theme) {
            if (!creatorNameOption) return;

            applyFilterOptionButtonStyles(creatorNameOption, theme);
        }

        function applyFilterButtonStyle(button, theme) {
            const isDark = theme === 'dark';
            button.style.backgroundColor = document.documentElement.style.getPropertyValue('--filter-button-background');
            button.style.color = document.documentElement.style.getPropertyValue('--filter-button-text');
            button.style.border = '0px solid ' + document.documentElement.style.getPropertyValue('--filter-button-border-color');
        }

        function applySpecificFilterButtonStyles(button) {
            if (!button) return;

            button.style.borderRadius = '8px';
            button.style.height = '36px'
            button.style.fontFamily ='Builder Sans,Helvetica Neue,Helvetica,Arial,Lucida Grande,sans-serif';

            const styleSheet = document.createElement('style');
            styleSheet.textContent = `
                .filter-select.btn-primary-md.btn-min-width:active,
                .filter-select.btn-primary-md.btn-min-width.filter-button-active,
                .filter-select.btn-primary-md.btn-min-width.filter-button-active.filter-select.btn-primary-md.btn-min-width {
                    background-color: ${document.documentElement.style.getPropertyValue('--filter-button-active-background')} !important;
                    color: ${document.documentElement.style.getPropertyValue('--filter-button-active-text')} !important;
                }
            `;
            document.head.appendChild(styleSheet);
        }

        function applyButtonStyles(button, theme) {
            const isDark = theme === 'dark';
            button.style.backgroundColor = document.documentElement.style.getPropertyValue('--item-ownership-button-background') + ' !important';
            button.style.color = document.documentElement.style.getPropertyValue('--item-ownership-button-color') + ' !important';
        }

        function applyResultContainerStyles(container) {
            if (!container) return;

            container.style.display = 'flex';
            container.style.flexDirection = 'row';
            container.style.flexWrap = 'wrap';
            container.style.marginLeft = '0px';
            container.style.gap = '10px';
            container.style.width = '100%';
            container.style.minHeight = '0';
            container.style.overflow = 'visible';
        }

        function isInventoryPage() {
            return window.location.href.includes("/users/") && window.location.href.includes("/inventory");
        }

        function isProfilePage() {
            return window.location.href.includes("/users/") && window.location.href.includes("/profile");
        }

        function extractAndLogUserId() {
            if (window.location.href.includes("/users/")) {
                const regex = /^\/(?:[a-z]{2}\/)?users\/(\d+)/;
                const match = window.location.pathname.match(regex);

                if (match) {
                    currentUserId = match[1];
                    fetchDisplayName(currentUserId);
                } else {
                    currentUserId = null;
                    currentDisplayName = null;
                }
            } else {
                currentUserId = null;
                currentDisplayName = null;
            }
        }

        function fetchDisplayName(userId) {
            const userApiUrl = `https://users.roblox.com/v1/users/${userId}`;
            fetch(userApiUrl)
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP error! Status: ${response.status}`);
                    }
                    return response.json();
                })
                .then(userData => {
                    currentDisplayName = userData.displayName || userData.name || "User";
                    updateExplanationText();
                })
                .catch(error => {
                    console.error("fetchDisplayName: Error fetching display name:", error);
                    currentDisplayName = "User";
                    updateExplanationText();
                });
        }

        function updateExplanationText() {
            const explanationElement = document.getElementById('item-ownership-explanation-container')?.querySelector('p');
            if (explanationElement) {
                explanationElement.textContent = `Enter an item ID to check if ${currentDisplayName} owns it`;
            }
        }

        function checkInventoryHidden(retryCount = 0) {
             if (isInitialized || inventoryCheckRunning) {
                return;
            }
            isInitialized = true; 

            inventoryCheckRunning = true;

            const maxRetries = 60;
            const retryDelay = 600;

            let inventoryHiddenSpan = null;
            let sectionContentOffElement = null;

            sectionContentOffElement = document.querySelector('div.section-content-off:not(.btr-section-content-off)');
            
            if (!sectionContentOffElement && isProfilePage()) {
                const profileInventoryContainer = document.querySelector('.profile-inventory-container');
                if (profileInventoryContainer) {
                    sectionContentOffElement = profileInventoryContainer.querySelector('.section-content-off:not(.btr-section-content-off)');
                }
            }
            
            if (!sectionContentOffElement) {
                const iframe = document.getElementById('btr-injected-inventory');
                if (iframe) {
                    try {
                        let iframeDocument = iframe.contentDocument || iframe.contentWindow.document;
                        if (iframeDocument) {
                            sectionContentOffElement = iframeDocument.querySelector('div.section-content-off:not(.btr-section-content-off)');
                        }
                    } catch (error) {
                        console.warn("checkInventoryHidden: Error accessing iframe content for section-content-off:", error);
                    }
                }
            }

            if (sectionContentOffElement) {
                resultParentElement = sectionContentOffElement;

                if (resultParentElement) {
                    resultParentElement.style.display = 'block';
                }

                if (!ownedItemsResultContainer) {
                    ownedItemsResultContainer = document.createElement('div');
                    ownedItemsResultContainer.id = 'item-ownership-result-container-owned';
                    applyResultContainerStyles(ownedItemsResultContainer);
                }
                if (!unownedItemsResultContainer) {
                    unownedItemsResultContainer = document.createElement('div');
                    unownedItemsResultContainer.id = 'item-ownership-result-container-unowned';
                    applyResultContainerStyles(unownedItemsResultContainer);
                    unownedItemsResultContainer.style.display = 'none';
                }

                if (!document.getElementById('item-ownership-checker-container')) {
                    let container = document.createElement('div');
                    container.id = 'item-ownership-checker-container';
                    container.style.marginTop = "10px";
                    container.style.display = 'flex';
                    container.style.flexDirection = 'column';
                    container.style.maxWidth = "340px";
                    container.style.margin = '0 auto';

                    tabButtonsContainer = document.createElement('div');
                    tabButtonsContainer.className = 'tab-buttons-container';
                    tabButtonsContainer.style.display = 'none';
                    tabButtonsContainer.style.marginBottom = '10px';
                    tabButtonsContainer.style.justifyContent = 'center';
                    tabButtonsContainer.style.width = '100%';
                    tabButtonsContainer.style.gap = '10px';

                    ownedTabButton = document.createElement('button');
                    ownedTabButton.type = 'button';
                    ownedTabButton.textContent = 'Owned';
                    ownedTabButton.className = 'tab-button tab-button-active';
                    applyTabButtonStyles(ownedTabButton, true, detectTheme());
                    ownedTabButton.addEventListener('click', () => {
                        if (ownedItemsResultContainer) {
                            ownedItemsResultContainer.style.display = 'flex';
                        }
                        if (unownedItemsResultContainer) {
                            unownedItemsResultContainer.style.display = 'none';
                        }

                        if (resultParentElement && ownedItemsResultContainer && unownedItemsResultContainer) {
                            resultParentElement.insertBefore(ownedItemsResultContainer, unownedItemsResultContainer);
                        }

                        if (ownedTabButton) applyTabButtonStyles(ownedTabButton, true, detectTheme());
                        if (unownedTabButton) applyTabButtonStyles(unownedTabButton, false, detectTheme());
                    });
                    tabButtonsContainer.appendChild(ownedTabButton);

                    unownedTabButton = document.createElement('button');
                    unownedTabButton.type = 'button';
                    unownedTabButton.textContent = 'Unowned';
                    unownedTabButton.className = 'tab-button';
                    applyTabButtonStyles(unownedTabButton, false, detectTheme());
                    unownedTabButton.addEventListener('click', () => {
                        if (ownedItemsResultContainer) {
                            ownedItemsResultContainer.style.display = 'none';
                        }
                        if (unownedItemsResultContainer) {
                            unownedItemsResultContainer.style.display = 'flex';
                        }

                        if (resultParentElement && ownedItemsResultContainer && unownedItemsResultContainer) {
                            resultParentElement.insertBefore(unownedItemsResultContainer, ownedItemsResultContainer);
                        }

                        if (ownedTabButton) applyTabButtonStyles(ownedTabButton, false, detectTheme());
                        if (unownedTabButton) applyTabButtonStyles(unownedTabButton, true, detectTheme());
                    });
                    tabButtonsContainer.appendChild(unownedTabButton);

                    let filterDropdownContainer = document.createElement('div');
                    filterDropdownContainer.style.marginBottom = '0px';
                    filterDropdownContainer.style.position = 'relative';

                    filterButtonElement = document.createElement('button');
                    filterButtonElement.type = 'button';
                    filterButtonElement.style.marginBottom = '0px'
                    filterButtonElement.style.marginTop = '7px'
                    filterButtonElement.style.borderWidth = '0px'
                    filterButtonElement.className = 'filter-select btn-primary-md';
                    applyFilterButtonStyle(filterButtonElement, detectTheme());
                    applySpecificFilterButtonStyles(filterButtonElement);
                    let filterDisplayText = document.createElement('span');
                    filterDisplayText.className = 'filter-display-text';
                    filterDisplayText.textContent = '';

                    const svgIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                    svgIcon.setAttribute("viewBox", "0 0 24 24");
                    svgIcon.setAttribute("width", "20");
                    svgIcon.setAttribute("height", "20");

                    const svgPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
                    svgPath.setAttribute("d", "M14 17a1 1 0 0 1-.707-.293l-4-4a1 1 0 0 1 0-1.414l4-4a1 1 0 1 1 1.414 1.414L11.414 12l3.293 3.293A1 1 0 0 1 14 17z");
                    svgPath.setAttribute("style", "fill:#ffffff");

                    const pathScaleFactor = 1.5;
                    const translateX = -4;
                    const translateY = -4;

                    svgPath.setAttribute("transform", `scale(${pathScaleFactor}) translate(${translateX}, ${translateY})`);

                    svgIcon.appendChild(svgPath);

                    svgIcon.style.display = 'inline-block';
                    svgIcon.style.transform = 'rotate(270deg)';
                    svgIcon.style.verticalAlign = 'middle';

                    filterButtonElement.appendChild(filterDisplayText);
                    filterButtonElement.appendChild(svgIcon);
                    filterDropdownContainer.appendChild(filterButtonElement);

                    filterModalContainer = document.createElement('div');
                    filterModalContainer.className = 'filters-modal-container';
                    applyCopiedFilterModalStyles(filterModalContainer, detectTheme());
                    filterModalContainer.style.display = 'none';
                    filterModalContainer.style.left = '50%';
                    filterModalContainer.style.transform = 'translateX(-50%)';
                    filterModalContainer.style.top = '100%';

                    let headerContainer = document.createElement('div');
                    headerContainer.className = 'header-container';
                    applyCopiedFilterHeaderStyles(headerContainer, detectTheme());
                    let headerTitle = document.createElement('h3');
                    headerTitle.textContent = 'Filter Items';
                    headerContainer.appendChild(headerTitle);
                    let headerCloseButtonContainer = document.createElement('div');
                    headerCloseButtonContainer.className = 'header-close-button-container';
                    applyHeaderCloseButtonContainerStyles(headerCloseButtonContainer);
                    let headerCloseButton = document.createElement('button');
                    headerCloseButton.type = 'button';
                    headerCloseButton.className = 'header-close-button';
                    headerCloseButton.innerHTML = '<span class="icon-close"></span>';
                    headerCloseButton.style.background = 'transparent';
                    headerCloseButton.style.borderWidth = '0px'
                    headerCloseButton.style.paddingRight = '22px'
                    headerCloseButton.style.marginTop = '22px'
                    headerCloseButtonContainer.appendChild(headerCloseButton);
                    headerContainer.appendChild(headerCloseButtonContainer);
                    filterModalContainer.appendChild(headerContainer);

                    let filterOptionsContainer = document.createElement('div');
                    filterOptionsContainer.className = 'filter-options-container';
                    applyCopiedFilterOptionsStyles(filterOptionsContainer, detectTheme());

                    filterContainerSimple = document.createElement('div');
                    filterContainerSimple.id = 'simplified-filter-container-v7';
                    filterContainerSimple.style.marginTop = '0px';
                    filterContainerSimple.style.padding = '0px 24px';
                    filterContainerSimple.style.backgroundColor = 'transparent';

                    let inputContainerSimple = document.createElement('div');
                    inputContainerSimple.style.display = 'flex';
                    inputContainerSimple.style.flexDirection = 'column';
                    inputContainerSimple.style.gap = '8px';
                    inputContainerSimple.style.alignItems = 'stretch';
                    inputContainerSimple.style.padding = '12px 0px';

                    let creatorNameInputContainer = document.createElement('div');
                    creatorNameInputContainer.style.display = 'flex';
                    creatorNameInputContainer.style.flexDirection = 'row';
                    creatorNameInputContainer.style.alignItems = 'center';
                    creatorNameInputContainer.style.gap = '8px';

                    creatorNameLabelSimple = document.createElement('label');
                    creatorNameLabelSimple.textContent = 'Creator Name';
                    creatorNameLabelSimple.style.color = document.documentElement.style.getPropertyValue('--filter-input-label-color');
                    creatorNameLabelSimple.style.marginRight = 'auto';
                    creatorNameLabelSimple.style.fontSize = '1rem';
                    creatorNameLabelSimple.style.whiteSpace = 'nowrap';

                    creatorNameInput = document.createElement('input');
                    creatorNameInput.type = 'text';
                    creatorNameInput.id = 'simplified-creator-name-input-v7';
                    creatorNameInput.className = 'MuiInputBase-input MuiOutlinedInput-input MuiInputBase-inputSizeSmall css-vojnal filter-creator-name-input';
                    creatorNameInput.placeholder = 'Creator Name';
                    applyInputStyles(creatorNameInput, detectTheme());
                    creatorNameInput.style.maxWidth = '150px';

                    creatorNameInput.addEventListener('input', function(event) {
                        checkApplyButtonState();
                    });

                    creatorNameInputContainer.appendChild(creatorNameLabelSimple);
                    creatorNameInputContainer.appendChild(creatorNameInput);
                    inputContainerSimple.appendChild(creatorNameInputContainer);

                    let minPriceInputContainer = document.createElement('div');
                    minPriceInputContainer.style.display = 'flex';
                    minPriceInputContainer.style.flexDirection = 'row';
                    minPriceInputContainer.style.alignItems = 'center';
                    minPriceInputContainer.style.gap = '8px';

                    let minPriceLabelSimple = document.createElement('label');
                    minPriceLabelSimple.textContent = 'Min Price';
                    minPriceLabelSimple.style.color = document.documentElement.style.getPropertyValue('--filter-input-label-color');
                    minPriceLabelSimple.style.marginRight = 'auto';
                    minPriceLabelSimple.style.fontSize = '1rem';
                    minPriceLabelSimple.style.whiteSpace = 'nowrap';

                    minPriceInput = document.createElement('input');
                    minPriceInput.type = 'number';
                    minPriceInput.id = 'simplified-min-price-input-v7';
                    minPriceInput.className = 'MuiInputBase-input MuiOutlinedInput-input MuiInputBase-inputSizeSmall css-vojnal filter-min-price-input';
                    minPriceInput.placeholder = 'Min Price';
                    applyInputStyles(minPriceInput, detectTheme());
                    minPriceInput.style.maxWidth = '150px';

                    minPriceInputContainer.appendChild(minPriceLabelSimple);
                    minPriceInputContainer.appendChild(minPriceInput);
                    inputContainerSimple.appendChild(minPriceInputContainer);

                    let limitedsToggleContainer = document.createElement('div');
                    limitedsToggleContainer.style.display = 'flex';
                    limitedsToggleContainer.style.flexDirection = 'row';
                    limitedsToggleContainer.style.alignItems = 'center';
                    limitedsToggleContainer.style.gap = '8px';
                    limitedsToggleContainer.style.marginTop = '12px';

                    let limitedsLabelSimple = document.createElement('label');
                    limitedsLabelSimple.textContent = 'Limiteds';
                    limitedsLabelSimple.style.color = document.documentElement.style.getPropertyValue('--filter-input-label-color');
                    limitedsLabelSimple.style.marginRight = '0px';
                    limitedsLabelSimple.style.fontSize = '1rem';

                    limitedsToggle = document.createElement('input');
                    limitedsToggle.type = 'checkbox';
                    limitedsToggle.id = 'simplified-limiteds-toggle-v7';
                    limitedsToggle.className = 'filter-limiteds-toggle';
                    limitedsToggle.style.appearance = 'none';
                    limitedsToggle.style.width = '20px';
                    limitedsToggle.style.height = '20px';
                    limitedsToggle.style.marginLeft = 'auto'
                    limitedsToggle.style.backgroundColor = document.documentElement.style.getPropertyValue('--filter-toggle-background');
                    limitedsToggle.style.border = '1px solid ' + document.documentElement.style.getPropertyValue('--filter-toggle-border-color');
                    limitedsToggle.style.borderRadius = '4px';
                    limitedsToggle.style.cursor = 'pointer';
                    limitedsToggle.style.position = 'relative';

                    limitedsToggle.insertAdjacentHTML('afterbegin', `
                        <style>
                            #simplified-limiteds-toggle-v7::before {
                                content: '';
                                position: absolute;
                                top: 50%;
                                left: 50%;
                                transform: translate(-50%, -50%) scale(0);
                                width: 10px;
                                height: 10px;
                                background-color: ${document.documentElement.style.getPropertyValue('--filter-toggle-indicator-color')};
                                border-radius: 2px;
                                transition: transform 0.2s ease-in-out;
                            }
                            #simplified-limiteds-toggle-v7:checked::before {
                                transform: translate(-50%, -50%) scale(1);
                            }
                            #simplified-limiteds-toggle-v7:focus {
                                outline: none;
                                box-shadow: 0 0 0 2px rgba(51, 95, 255, 0.5);
                            }
                        </style>
                    `);

                    limitedsToggle.addEventListener('change', function() {});

                    limitedsToggleContainer.appendChild(limitedsLabelSimple);
                    limitedsToggleContainer.appendChild(limitedsToggle);
                    inputContainerSimple.appendChild(limitedsToggleContainer);

                    let recentlyPublishedToggleContainer = document.createElement('div');
                    recentlyPublishedToggleContainer.style.display = 'flex';
                    recentlyPublishedToggleContainer.style.flexDirection = 'row';
                    recentlyPublishedToggleContainer.style.alignItems = 'center';
                    recentlyPublishedToggleContainer.style.gap = '8px';
                    recentlyPublishedToggleContainer.style.marginTop = '12px';

                    let recentlyPublishedLabelSimple = document.createElement('label');
                    recentlyPublishedLabelSimple.textContent = 'Recently Published';
                    recentlyPublishedLabelSimple.style.color = document.documentElement.style.getPropertyValue('--filter-input-label-color');
                    recentlyPublishedLabelSimple.style.marginRight = '60px';
                    recentlyPublishedLabelSimple.style.fontSize = '1rem';

                    recentlyPublishedToggle = document.createElement('input');
                    recentlyPublishedToggle.type = 'checkbox';
                    recentlyPublishedToggle.id = 'simplified-recently-published-toggle-v7';
                    recentlyPublishedToggle.className = 'filter-recently-published-toggle';
                    recentlyPublishedToggle.style.appearance = 'none';
                    recentlyPublishedToggle.style.width = '20px';
                    recentlyPublishedToggle.style.height = '20px';
                    recentlyPublishedToggle.style.marginLeft = 'auto'
                    recentlyPublishedToggle.style.backgroundColor = document.documentElement.style.getPropertyValue('--filter-toggle-background');
                    recentlyPublishedToggle.style.border = '1px solid ' + document.documentElement.style.getPropertyValue('--filter-toggle-border-color');
                    recentlyPublishedToggle.style.borderRadius = '4px';
                    recentlyPublishedToggle.style.cursor = 'pointer';
                    recentlyPublishedToggle.style.position = 'relative';

                    recentlyPublishedToggle.insertAdjacentHTML('afterbegin', `
                        <style>
                            #simplified-recently-published-toggle-v7::before {
                                content: '';
                                position: absolute;
                                top: 50%;
                                left: 50%;
                                transform: translate(-50%, -50%) scale(0);
                                width: 10px;
                                height: 10px;
                                background-color: ${document.documentElement.style.getPropertyValue('--filter-toggle-indicator-color')};
                                border-radius: 2px;
                                transition: transform 0.2s ease-in-out;
                            }
                            #simplified-recently-published-toggle-v7:checked::before {
                                transform: translate(-50%, -50%) scale(1);
                            }
                            #simplified-recently-published-toggle-v7:focus {
                                outline: none;
                                box-shadow: 0 0 0 2px rgba(51, 95, 255, 0.5);
                            }
                        </style>
                    `);

                    recentlyPublishedToggle.addEventListener('change', function() {
                        checkApplyButtonState();
                    });

                    recentlyPublishedToggleContainer.appendChild(recentlyPublishedLabelSimple);
                    recentlyPublishedToggleContainer.appendChild(recentlyPublishedToggle);
                    inputContainerSimple.appendChild(recentlyPublishedToggleContainer);

                    let includeOffsaleToggleContainer = document.createElement('div');
                    includeOffsaleToggleContainer.style.display = 'flex';
                    includeOffsaleToggleContainer.style.flexDirection = 'row';
                    includeOffsaleToggleContainer.style.alignItems = 'center';
                    includeOffsaleToggleContainer.style.gap = '8px';
                    includeOffsaleToggleContainer.style.marginTop = '12px';

                    let includeOffsaleLabelSimple = document.createElement('label');
                    includeOffsaleLabelSimple.textContent = 'Include Offsale';
                    includeOffsaleLabelSimple.style.color = document.documentElement.style.getPropertyValue('--filter-input-label-color');
                    includeOffsaleLabelSimple.style.marginRight = '70px';
                    includeOffsaleLabelSimple.style.fontSize = '1rem';

                    includeOffsaleToggle = document.createElement('input');
                    includeOffsaleToggle.type = 'checkbox';
                    includeOffsaleToggle.id = 'simplified-include-offsale-toggle-v7';
                    includeOffsaleToggle.className = 'filter-include-offsale-toggle';
                    includeOffsaleToggle.style.appearance = 'none';
                    includeOffsaleToggle.style.width = '20px';
                    includeOffsaleToggle.style.height = '20px';
                    includeOffsaleToggle.style.marginLeft = 'auto'
                    includeOffsaleToggle.style.backgroundColor = document.documentElement.style.getPropertyValue('--filter-toggle-background');
                    includeOffsaleToggle.style.border = '1px solid ' + document.documentElement.style.getPropertyValue('--filter-toggle-border-color');
                    includeOffsaleToggle.style.borderRadius = '4px';
                    includeOffsaleToggle.style.cursor = 'pointer';
                    includeOffsaleToggle.style.position = 'relative';
                    includeOffsaleToggle.checked = true;

                    includeOffsaleToggle.insertAdjacentHTML('afterbegin', `
                        <style>
                            #simplified-include-offsale-toggle-v7::before {
                                content: '';
                                position: absolute;
                                top: 50%;
                                left: 50%;
                                transform: translate(-50%, -50%) scale(0);
                                width: 10px;
                                height: 10px;
                                background-color: ${document.documentElement.style.getPropertyValue('--filter-toggle-indicator-color')};
                                border-radius: 2px;
                                transition: transform 0.2s ease-in-out;
                            }
                            #simplified-include-offsale-toggle-v7:checked::before {
                                transform: translate(-50%, -50%) scale(1);
                            }
                            #simplified-include-offsale-toggle-v7:focus {
                                outline: none;
                                box-shadow: 0 0 0 2px rgba(51, 95, 255, 0.5);
                            }
                        </style>
                    `);

                    includeOffsaleToggle.addEventListener('change', function() {});

                    includeOffsaleToggleContainer.appendChild(includeOffsaleLabelSimple);
                    includeOffsaleToggleContainer.appendChild(includeOffsaleToggle);
                    inputContainerSimple.appendChild(includeOffsaleToggleContainer);

                    let limitDropdownContainer = document.createElement('div');
                    limitDropdownContainer.style.display = 'flex';
                    limitDropdownContainer.style.flexDirection = 'row';
                    limitDropdownContainer.style.alignItems = 'center';
                    limitDropdownContainer.style.gap = '8px';
                    limitDropdownContainer.style.marginTop = '12px';

                    let limitLabelSimple = document.createElement('label');
                    limitLabelSimple.textContent = 'Limit';
                    limitLabelSimple.style.color = document.documentElement.style.getPropertyValue('--filter-input-label-color');
                    limitLabelSimple.style.marginRight = '175px';
                    limitLabelSimple.style.fontSize = '1rem';
                    limitLabelSimple.style.whiteSpace = 'nowrap';

                    limitDropdown = document.createElement('select');
                    limitDropdown.id = 'simplified-limit-dropdown-v7';
                    limitDropdown.className = 'filter-limit-dropdown';
                    applyInputStyles(limitDropdown, detectTheme());
                    limitDropdown.style.maxWidth = '80px';
                    limitDropdown.style.width = 'auto'
                    limitDropdown.style.backgroundimage = '';
                    limitDropdown.style.padding = '6px 10px';
                    limitDropdown.style.appearance = 'none';
                    limitDropdown.style.border = `1px solid ${document.documentElement.style.getPropertyValue('--filter-input-border-color')}`;

                    const limitValues = [120, 240, 360, 480, 600, 720];
                    limitValues.forEach(value => {
                        const option = document.createElement('option');
                        option.value = value;
                        option.textContent = value;
                        limitDropdown.appendChild(option);
                    });
                    limitDropdown.value = currentLimit;

                    limitDropdownContainer.appendChild(limitLabelSimple);
                    limitDropdownContainer.appendChild(limitDropdown);
                    inputContainerSimple.appendChild(limitDropdownContainer);

                    filterContainerSimple.appendChild(inputContainerSimple);

                    applyButton = document.createElement('button');
                    applyButton.type = 'button';
                    applyButton.textContent = 'Apply Filter';
                    applyButton.className = 'apply-button btn-primary-md btn-full-width';
                    applyButton.setAttribute('disabled', '');
                    applyButton.style.backgroundColor = document.documentElement.style.getPropertyValue('--button-disabled-background');
                    applyButton.style.color = document.documentElement.style.getPropertyValue('--button-disabled-text');
                    applyButton.style.borderWidth = '0px';
                    applyButton.style.padding = '12px 40px';
                    applyButton.style.borderRadius = '8px';
                    applyButton.style.marginTop = '0px';

                    applyButton.addEventListener('click', applyFilters);

                    filterContainerSimple.appendChild(applyButton);
                    filterOptionsContainer.appendChild(filterContainerSimple);

                    filterModalContainer.appendChild(filterOptionsContainer);
                    filterDropdownContainer.appendChild(filterModalContainer);

                    let explanation = document.createElement('p');
                    explanation.textContent = `Enter an item ID to check if ${currentDisplayName || 'this user'} owns it`;
                    explanation.id = 'item-ownership-explanation-text';
                    explanation.style.cssText = `
                        color: ${document.documentElement.style.getPropertyValue('--text-color')} !important;
                        font-size: 15px;
                        font-weight: 500;
                        font-family: "HCo Gotham SSm", "Helvetica Neue", Helvetica, Arial, "Lucida Grande";
                        margin-bottom: 0px;
                    `;

                    let inputGroup = document.createElement('div');
                    inputGroup.className = 'input-group';
                    inputGroup.style.width = '100%';
                    inputGroup.style.borderRadius = '4px';
                    inputGroup.style.overflow = 'hidden';

                    let buttonsContainer = document.createElement('div');
                    buttonsContainer.style.display = 'flex';
                    buttonsContainer.style.flexDirection = 'row';
                    buttonsContainer.style.gap = '10px';
                    buttonsContainer.style.alignItems = 'flex-start';
                    buttonsContainer.style.position = 'relative';

                    let form = document.createElement('form');
                    form.name = 'search-form';
                    form.action = 'javascript:void(0);';
                    form.style.width = '100%';

                    let formHasFeedback = document.createElement('div');
                    formHasFeedback.className = 'form-has-feedback';
                    formHasFeedback.style.width = '100%';

                    let input = document.createElement('input');
                    input.id = 'item-ownership-input';
                    input.type = 'search';
                    input.name = 'search-bar';
                    input.dataset.testid = 'item-ownership-input-field';
                    input.className = 'form-control input-field new-input-field';
                    input.placeholder = 'Item ID';
                    input.maxLength = 120;
                    input.autocomplete = 'off';
                    input.autocorrect = 'off';
                    input.autocapitalize = 'off';
                    input.spellcheck = false;
                    input.value = '';
                    input.style.width = '100%';
                    input.style.padding = '5px'
                    input.style.borderRadius = '4px';
                    input.style.boxSizing = 'border-box';
                    input.style.padding = '5px !important';

                    formHasFeedback.appendChild(input);
                    form.appendChild(formHasFeedback);
                    inputGroup.appendChild(form);

                    let buttonListItem = document.createElement('li');
                    buttonListItem.className = 'btn-friends';
                    buttonListItem.style.flexGrow = '1';

                    let button2 = document.createElement('button');
                    button2.type = 'button';
                    button2.style.marginTop = '7px';
                    button2.style.paddingLeft = '12px';
                    button2.style.paddingRight = '12px';
                    button2.style.width = '100%';
                    button2.style.boxSizing = 'box-sizing';
                    button2.style.marginBottom = '10px';
                    button2.className = 'btn-control-md item-ownership-button';

                    const buttonText = document.createTextNode('Check Ownership');
                    button2.appendChild(buttonText);
                    button2.disabled = true;

                    buttonListItem.appendChild(button2);

                    let fakeCheckButton = document.createElement('button');
                    fakeCheckButton.type = 'button';
                    fakeCheckButton.className = 'btn-control-md item-ownership-button';
                    fakeCheckButton.textContent = 'Check Inventory';
                    fakeCheckButton.style.position = 'absolute';
                    fakeCheckButton.style.left = '-9999px';
                    fakeCheckButton.style.top = '-9999px';
                    buttonListItem.insertBefore(fakeCheckButton, button2);

                    input.addEventListener('input', function() {
                        button2.disabled = !input.value.trim();
                        if (!creatorItemsData) {
                            button2.textContent = 'Check Ownership';
                        } else {
                            button2.textContent = 'Check Single Item';
                        }
                    });

                    input.addEventListener('keydown', function(event) {
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            if (!button2.disabled) {
                                const itemId = input.value;
                                if (itemId) {
                                    if (ownershipTextElement && currentDisplayName) {
                                        ownershipTextElement.textContent = `Checking ownership for item ID: ${itemId}...`;
                                        ownershipTextElement.style.display = 'block';
                                        ownershipTextElement.style.padding = '5px';
                                    }
                                    checkItemOwnership({id: itemId}).then(ownershipResult => {
                                        displayOwnershipResult({id: itemId}, ownershipResult, inventoryHiddenParentElement);
                                    })
                                    .catch(error => {
                                        ownershipTextElement.textContent = "Invalid Item ID";
                                        ownershipTextElement.style.display = 'block';
                                        ownershipTextElement.style.color = document.documentElement.style.getPropertyValue('--text-color');
                                    });
                                }
                            }
                        }
                    });

                    button2.addEventListener('click', function() {
                        const itemId = input.value;
                        const itemIdInput = itemId
                        const singleItemId = itemIdInput.trim();

                        if (ownershipTextElement && currentDisplayName) {
                            ownershipTextElement.textContent = `Checking ownership for item ID: ${singleItemId}...`;
                            ownershipTextElement.style.display = 'block';
                            ownershipTextElement.style.padding = '5px';
                        }

                        if (creatorItemsData && creatorItemsData.data) {
                            if (singleItemId) {
                                checkItemOwnership({id: singleItemId}).then(ownershipResult => {
                                    displayOwnershipResult({id: singleItemId}, ownershipResult, inventoryHiddenParentElement);
                                })
                                .catch(error => {
                                    ownershipTextElement.textContent = "Invalid Item ID";
                                    ownershipTextElement.style.display = 'block';
                                    ownershipTextElement.style.color = document.documentElement.style.getPropertyValue('--text-color');
                                });
                                button2.textContent = 'Check Single Item';
                            } else {
                                button2.textContent = 'Check Single Item';
                            }
                            button2.disabled = false;
                        } else if (singleItemId) {
                            checkItemOwnership({id: singleItemId}).then(ownershipResult => {
                                displayOwnershipResult({id: singleItemId}, ownershipResult, inventoryHiddenParentElement);
                            })
                            .catch(error => {
                                ownershipTextElement.textContent = "Invalid Item ID";
                                ownershipTextElement.style.display = 'block';
                                ownershipTextElement.style.color = document.documentElement.style.getPropertyValue('--text-color');
                            });
                            button2.textContent = 'Check Ownership';
                        } else {
                            button2.textContent = 'Check Ownership';
                        }
                        button2.disabled = !singleItemId;
                    });

                    ownershipTextElement = document.createElement('p');
                    ownershipTextElement.id = 'item-ownership-result-text';
                    ownershipTextElement.style.cssText = `
                        color: ${document.documentElement.style.getPropertyValue('--text-success-color')} !important;
                        font-size: 15px;
                        font-weight: 500;
                        font-family: "HCo Gotham SSm", "Helvetica Neue", Helvetica, Arial, "Lucida Grande";
                        margin-top: 0px;
                        display: none;
                        text-align: center;
                        box-sizing: border-box;
                        width: 100%;
                    `;

                    buttonsContainer.appendChild(buttonListItem);
                    buttonsContainer.appendChild(filterDropdownContainer);

                    container.appendChild(explanation);
                    container.appendChild(inputGroup);
                    container.appendChild(buttonsContainer);
                    container.appendChild(tabButtonsContainer);
                    container.appendChild(ownershipTextElement);

                    if (sectionContentOffElement) {
                        let explanationContainer = document.createElement('div');
                        explanationContainer.appendChild(explanation);
                        explanationContainer.id = 'item-ownership-explanation-container';

                        sectionContentOffElement.appendChild(explanationContainer);
                        sectionContentOffElement.appendChild(container);
                        resultParentElement.appendChild(ownedItemsResultContainer);
                        resultParentElement.appendChild(unownedItemsResultContainer);
                    } else {
                        console.warn("checkInventoryHidden: sectionContentOffElement not found. Appending to body as fallback.");
                        document.body.appendChild(explanation);
                        document.body.appendChild(container);
                        document.body.appendChild(ownedItemsResultContainer);
                        document.body.appendChild(unownedItemsResultContainer);
                    }
                    applyFilterButtonStyle(filterButtonElement, detectTheme());
                    applySpecificFilterButtonStyles(filterButtonElement);
                    addFilterButtonEvents();
                    addDropdownCloseEvents();
                    addFilterOptionEvents();

                    checkApplyButtonState();
                } else {
                }
            } else {
                if (retryCount < maxRetries) {
                    setTimeout(() => checkInventoryHidden(retryCount + 1), retryDelay);
                } else {
                    console.error("checkInventoryHidden: Max retries reached, sectionContentOffElement not found. Script may not function correctly.");
                }
            }
            inventoryCheckRunning = false;
        }

        function updateDropdownBorders() {
            const dropdowns = document.querySelectorAll('select.filter-limit-dropdown');
            const borderColor = document.documentElement.style.getPropertyValue('--filter-input-border-color');
            
            dropdowns.forEach(dropdown => {
                dropdown.style.border = `1px solid ${borderColor}`;
            });
        }

        function applyTabButtonStyles(button, isActive, theme) {
            const isDark = theme === 'dark';
            const activeColor = 'rgb(51, 95, 255)';
            const buttonBackgroundColor = isActive ? activeColor : document.documentElement.style.getPropertyValue('--tab-button-background');
            const buttonTextColor = document.documentElement.style.getPropertyValue('--tab-button-text-color');
            const buttonBorderColor = document.documentElement.style.getPropertyValue('--tab-button-border-color');

            button.style.backgroundColor = buttonBackgroundColor;
            button.style.color = buttonTextColor;
            button.style.border = '0px solid ' + buttonBorderColor;
            button.style.padding = '8px 15px';
            button.style.cursor = 'pointer';
            button.style.borderRadius = '8px';
            button.style.marginRight = '0px';
            button.style.marginLeft = '0px';
            button.style.fontWeight = 'bold';
            button.style.height = '36px';
            button.style.fontFamily = 'Builder Sans,Helvetica Neue,Helvetica,Arial,Lucida Grande,sans-serif';
            button.style.flexGrow = '1';
            button.style.textAlign = 'center';
            button.style.flexBasis = '0';
        }

        function applyInputStyles(inputElement, theme) {
            const isDark = theme === 'dark';
            const inputBackgroundColor = document.documentElement.style.getPropertyValue('--filter-input-background');
            const inputBorderColor = document.documentElement.style.getPropertyValue('--filter-input-border-color');
            const inputTextColor = document.documentElement.style.getPropertyValue('--filter-input-text-color');
            const inputPlaceholderColor = document.documentElement.style.getPropertyValue('--filter-input-placeholder-color');

            inputElement.style.webkitTextSizeAdjust = '100%';
            inputElement.style.backgroundImage = '';
            inputElement.style.backgroundRepeat = 'no-repeat';
            inputElement.style.backgroundBlendMode = 'normal';
            inputElement.style.backgroundSize = 'auto';
            inputElement.style.color = inputTextColor;
            inputElement.style.fontFamily = 'Builder Sans, Helvetica Neue, Helvetica, Arial, Lucida Grande, sans-serif';
            inputElement.style.textRendering = 'auto';
            inputElement.style.webkitFontSmoothing = 'antialiased';
            inputElement.style.ariaInvalid = 'false';
            inputElement.style.name = 'search-bar';
            inputElement.style.padding = '8.5px 14px';
            inputElement.style.borderRadius = '8px';
            inputElement.style.backgroundColor = inputBackgroundColor;
            inputElement.style.border = `1px solid ${inputBorderColor}`;
            inputElement.style.borderColor = inputBorderColor;
            inputElement.style.fontSize = '1rem';
            inputElement.style.boxSizing = 'border-box';
            inputElement.style.width = '100%';
            inputElement.style.minWidth = '0';
            inputElement.style.marginLeft = '0px';

            inputElement.style.setProperty('--placeholder-color', inputPlaceholderColor);
            inputElement.style.setProperty('color-scheme', theme === 'dark' ? 'dark' : 'light');

            const styleSheet = document.createElement('style');
            styleSheet.textContent = `
                input::placeholder {
                    color: ${inputPlaceholderColor};
                    opacity: 1;
                }
                select {
                    -webkit-appearance: none;
                    -moz-appearance: none;
                    appearance: none;
                    text-indent: 0.01px;
                    text-overflow: '';
                }
            `;
            document.head.appendChild(styleSheet);
        }

        function addFilterButtonEvents() {
            if (!filterButtonElement || !filterModalContainer) return;

            filterButtonElement.addEventListener('click', function() {
                filterModalContainer.style.display = filterModalContainer.style.display === 'none' ? 'flex' : 'none';
                if (filterModalContainer.style.display === 'flex') {
                    filterButtonElement.classList.add('filter-button-active');
                    checkApplyButtonState();
                } else {
                    filterButtonElement.classList.remove('filter-button-active');
                }
            });
        }

        function addDropdownCloseEvents() {
            if (!filterModalContainer || !filterButtonElement) return;

            const closeButton = filterModalContainer.querySelector('.header-close-button');
            if (closeButton) {
                closeButton.addEventListener('click', function() {
                    filterModalContainer.style.display = 'none';
                    filterButtonElement.classList.remove('filter-button-active');
                });
            }

            window.addEventListener('click', function(event) {
                if (filterModalContainer.style.display === 'flex' && !filterButtonElement.contains(event.target) && !filterModalContainer.contains(event.target)) {
                    filterModalContainer.style.display = 'none';
                    filterButtonElement.classList.remove('filter-button-active');
                }
            });
        }

        function addFilterOptionEvents() {}

        function checkItemOwnership(item, silentError = false) {
            const itemId = item.id;
            if (!currentUserId) {
                return Promise.reject("No User ID");
            }

            let apiUrl;
            let itemTypeForDetail = 'Asset';
            if (item && item.itemType === "Bundle") {
                apiUrl = `https://inventory.roblox.com/v1/users/${currentUserId}/items/bundle/${item.id}`;
                itemTypeForDetail = 'Bundle';
            } else {
                apiUrl = `https://inventory.roblox.com/v1/users/${currentUserId}/items/Asset/${item.id}`;
            }

            const button = document.querySelector('.item-ownership-button');

            return fetch(apiUrl, {credentials: 'include',})
                .then(response => {
                    if (!response.ok) {
                        if (response.status === 404) {
                            return { owned: false, itemId: item.id, itemType: itemTypeForDetail };
                        }
                        if (response.status === 429) {
                            return Promise.reject('RateLimited');
                        }
                        if (!silentError) {
                            throw new Error(`HTTP error! Status: ${response.status}`);
                        } else {
                            return { owned: false, itemId: item.id, itemType: itemTypeForDetail };
                        }
                    }
                    return response.json();
                })
                .then(apiResponse => {
                    if (apiResponse && apiResponse.data && Array.isArray(apiResponse.data) && apiResponse.data.length === 0) {
                        return { owned: false, itemId: item.id, itemType: itemTypeForDetail };
                    }
                    return { owned: true, apiResponse: apiResponse, itemId: item.id, itemType: itemTypeForDetail };
                })
                .catch(error => {
                    if (error === 'RateLimited') {
                        return Promise.reject('RateLimited');
                    }
                    if (!silentError) {
                    } else {
                        return { owned: false, itemId: item.id, itemType: itemTypeForDetail };
                    }
                    throw error;
                });
        }

        async function fetchItemDetails(itemId, itemType) {
            let detailApiUrl;
            if (itemType === 'Bundle') {
                detailApiUrl = `https://catalog.roblox.com/v1/bundles/${itemId}/details`;
            } else {
                detailApiUrl = `https://catalog.roblox.com/v1/catalog/items/details?itemIds=${itemId}&itemType=Asset`;
            }

            try {
                const response = await fetch(detailApiUrl, {credentials: 'include'});
                if (!response.ok) {
                    return { name: 'Item' };
                }
                const details = await response.json();
                if (itemType === 'Bundle') {
                    return { name: details.name };
                } else {
                    return { name: details.data && details.data[0] ? details.data[0].name : 'Item' };
                }
            } catch (error) {
                return { name: 'Item' };
            }
        }

        async function displayOwnershipResult(itemIdentifier, ownershipResult, resultParentElement) {
            ownershipTextElement.style.display = 'block';

            const itemDetails = await fetchItemDetails(ownershipResult.itemId, ownershipResult.itemType);
            const itemName = itemDetails.name;

            if (ownershipResult.owned) {
                ownershipTextElement.textContent = `${currentDisplayName || 'User'} owns the item`;
                ownershipTextElement.style.color = document.documentElement.style.getPropertyValue('--text-success-color');
            } else {
                ownershipTextElement.textContent = `${currentDisplayName || 'User'} does not own this item`;
                ownershipTextElement.style.color = document.documentElement.style.getPropertyValue('--text-color');
            }
        }

        async function fetchItemDetailsAndThumbnails(itemsWithOwnerShip) {
            const bundleItemIds = [];
            const assetItemIds = [];
            const allItemIds = [];

            itemsWithOwnerShip.forEach(({item}) => {
                if (item.itemType === "Bundle") {
                    bundleItemIds.push(item.id);
                } else {
                    assetItemIds.push(item.id);
                }
                allItemIds.push(item.id);
            });

            const allThumbnailData = {};
            const allItemDetails = {};

            for (let i = 0; i < bundleItemIds.length; i += 50) {
                const batchIds = bundleItemIds.slice(i, i + 50).join(',');
                const thumbnailUrl = `https://thumbnails.roblox.com/v1/bundles/thumbnails?bundleIds=${batchIds}&size=150x150&format=Png&isCircular=false`;
                try {
                    const response = await fetch(thumbnailUrl, {credentials: 'include',});
                    if (!response.ok) {
                        continue;
                    }
                    const thumbnailResponse = await response.json();
                    if (thumbnailResponse && thumbnailResponse.data) {
                        thumbnailResponse.data.forEach(thumbData => {
                            if (thumbData.imageUrl) {
                                allThumbnailData[thumbData.targetId] = thumbData.imageUrl;
                            }
                        });
                    }
                } catch (error) {}
            }

            for (let i = 0; i < assetItemIds.length; i += 50) {
                const batchIds = assetItemIds.slice(i, i + 50).join(',');
                const thumbnailUrl = `https://thumbnails.roblox.com/v1/assets?assetIds=${batchIds}&returnPolicy=PlaceHolder&size=250x250&format=Png&isCircular=false`;
                try {
                    const response = await fetch(thumbnailUrl, {credentials: 'include',});
                    if (!response.ok) {
                        continue;
                    }
                    const thumbnailResponse = await response.json();
                    if (thumbnailResponse && thumbnailResponse.data) {
                        thumbnailResponse.data.forEach(thumbData => {
                            if (thumbData.imageUrl) {
                                allThumbnailData[thumbData.targetId] = thumbData.imageUrl;
                            }
                        });
                    }
                } catch (error) {}
            }

            return {thumbnailData: allThumbnailData, itemDetails: allItemDetails};
        }

        function createNoItemsMessageElement(theme) {
            const messageElement = document.createElement('p');
            messageElement.textContent = `${currentDisplayName || 'This user'} doesn't own any of the searched items.`;
            messageElement.style.color = document.documentElement.style.getPropertyValue('--text-color');
            messageElement.style.textAlign = 'center';
            messageElement.style.marginRight = 'auto'
            messageElement.style.marginLeft = 'auto'
            messageElement.style.padding = '10px 0';
            return messageElement;
        }

        function clearNoItemsMessage(container) {
            const noItemsMessage = container.querySelector('.no-items-message');
            if (noItemsMessage) {
                container.removeChild(noItemsMessage);
            }
        }

        async function displayBatchOwnershipResults(itemsWithOwnerShip, resultParentElement) {
            if (!ownedItemsResultContainer || !unownedItemsResultContainer) {
                return;
            }

            ownedItemsResultContainer.innerHTML = '';
            unownedItemsResultContainer.innerHTML = '';

            const fetchedData = await fetchItemDetailsAndThumbnails(itemsWithOwnerShip);
            const thumbnailData = fetchedData.thumbnailData;
            const itemDetails = fetchedData.itemDetails;

            if (!thumbnailData || !itemDetails) {}

            let hasOwnedItems = false;
            let hasUnownedItems = false;
            const currentTheme = detectTheme();

            itemsWithOwnerShip.forEach(({item, owned, apiResponse}) => {
                let itemName = item.name;
                const isOwned = owned;
                const itemId = item.id;
                const itemType = item.itemType;
                const ownedCopiesCount = isOwned && apiResponse && apiResponse.data ? apiResponse.data.length : 0;
                const itemDetail = itemDetails[itemId];
                let itemPrice = item.lowestPrice;

                if (itemDetail) {
                    let priceToUse = null;

                    const isLimitedItem = item.itemRestrictions && (item.itemRestrictions.includes("LimitedUnique") || item.itemRestrictions.includes("Collectible") || item.itemRestrictions.includes("Limited"));

                    if (isLimitedItem) {
                        if (itemDetail.lowestPrice !== null && itemDetail.lowestPrice !== undefined) {
                            priceToUse = itemDetail.lowestPrice;
                        } else if (itemDetail.lowestPrice !== null && itemDetail.lowestPrice !== undefined) {
                            priceToUse = itemDetail.lowestPrice;
                        } else {
                            priceToUse = 0;
                        }
                    } else {
                        if (itemDetail.lowestPrice !== null && itemDetail.lowestPrice !== undefined) {
                            priceToUse = itemDetail.lowestPrice;
                        } else if (itemDetail.lowestPrice !== null && itemDetail.lowestPrice !== undefined) {
                            priceToUse = itemDetail.lowestPrice;
                        } else {
                            priceToUse = 0;
                        }
                    }
                    itemPrice = priceToUse;
                } else {}

                const itemCard = document.createElement('div');
                itemCard.className = 'item-card-container';
                itemCard.style.width = '120px';
                itemCard.style.marginBottom = '10px';
                itemCard.style.marginRight = '10px';
                itemCard.style.minHeight = '202px'
                itemCard.style.position = 'relative';

                const itemLink = document.createElement('a');
                itemLink.className = 'item-card-link';
                const catalogBaseUrl = itemType === "Bundle" ? 'https://www.roblox.com/bundles' : 'https://www.roblox.com/catalog';
                itemLink.href = `${catalogBaseUrl}/${itemId}/${encodeURIComponent(itemName)}`;
                itemLink.target = '_blank';
                itemLink.style.display = 'flex';
                itemLink.style.maxHeight = '202px'
                itemLink.style.verticalAlign = 'top';
                itemLink.style.flexDirection = 'column';
                itemLink.style.alignItems= 'center';
                const limitedBadgeContainer = document.createElement('div');
                limitedBadgeContainer.className = 'item-limited-badge-container';
                limitedBadgeContainer.style.position = 'absolute';
                limitedBadgeContainer.style.top = 'auto';
                limitedBadgeContainer.style.marginTop = 'auto';
                limitedBadgeContainer.style.bottom = '76px';
                limitedBadgeContainer.style.left = '-3px';
                limitedBadgeContainer.style.zIndex = '3';
                itemLink.appendChild(limitedBadgeContainer);

                if (item.itemRestrictions && (item.itemRestrictions.includes("LimitedUnique") || item.itemRestrictions.includes("Collectible"))) {
                    const limitedBadge = document.createElement('span');
                    limitedBadge.className = 'restriction-icon icon-limited-unique-label';
                    limitedBadgeContainer.appendChild(limitedBadge);
                } else if (item.itemRestrictions && item.itemRestrictions.includes("Limited")) {
                    const limitedBadge = document.createElement('span');
                    limitedBadge.className = 'restriction-icon icon-limited-label';
                    limitedBadgeContainer.appendChild(limitedBadge);
                }
                let thumbContainer;
                const imageUrl = thumbnailData[itemId];

                if (imageUrl) {
                    thumbContainer = document.createElement('img');
                    thumbContainer.src = imageUrl;
                    thumbContainer.className = 'item-card-thumb-container';
                    thumbContainer.style.width = '126px';
                    thumbContainer.style.top = '0px'
                    thumbContainer.style.verticalAlign = 'top';
                    thumbContainer.style.height = '126px';
                    thumbContainer.style.objectFit = 'cover';
                    thumbContainer.style.marginBottom = '5px';

                    thumbContainer.onerror = () => {
                        const placeholderDiv = document.createElement('div');
                        placeholderDiv.className = 'item-card-thumb-container';
                        placeholderDiv.style.width = '126px';
                        placeholderDiv.style.height = '126px';
                        placeholderDiv.style.backgroundColor = '#444';
                        placeholderDiv.style.marginBottom = '5px';

                        itemLink.replaceChild(placeholderDiv, thumbContainer);
                        thumbContainer = placeholderDiv;
                    };
                } else {
                    thumbContainer = document.createElement('div');
                    thumbContainer.className = 'item-card-thumb-container';
                    thumbContainer.style.width = '100%';
                    thumbContainer.style.height = '150px';
                    thumbContainer.style.backgroundColor = '#444';
                    thumbContainer.style.marginBottom = '5px';
                }

                itemLink.appendChild(thumbContainer);
                const iconContainer = document.createElement('div');
                iconContainer.className = 'item-ownership-icon-container';
                iconContainer.style.position = 'absolute';
                iconContainer.style.top = '7px';
                iconContainer.style.left = '5px';
                iconContainer.style.zIndex = '1';
                iconContainer.style.width = '22px';
                iconContainer.style.height = '22px';
                iconContainer.style.borderRadius = '30%';
                iconContainer.style.display = 'flex';
                iconContainer.style.justifyContent = 'center';
                iconContainer.style.alignItems = 'center';
                iconContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';

                const icon = document.createElement('img');
                icon.style.width = '100%';
                icon.style.height = '100%';

                if (isOwned) {
                    icon.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="'+ document.documentElement.style.getPropertyValue('--item-owned-icon-color') +'"><path d="M0 0h24v24H0z" fill="none"/><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
                    hasOwnedItems = true;
                } else {
                    icon.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="'+ document.documentElement.style.getPropertyValue('--item-unowned-icon-color') +'"><path d="M0 0h24v24H0z" fill="none"/><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
                    hasUnownedItems = true;
                }
                iconContainer.appendChild(icon);
                itemCard.appendChild(iconContainer);

                if (isOwned && ownedCopiesCount > 1) {
                    const copiesBadge = document.createElement('div');
                    copiesBadge.className = 'item-copies-badge';
                    copiesBadge.textContent = `x${ownedCopiesCount}`;
                    copiesBadge.style.position = 'absolute';
                    copiesBadge.style.top = '7px';
                    copiesBadge.style.right = '5px';
                    copiesBadge.style.backgroundColor = 'rgba(0, 180, 39, 0.5)';
                    copiesBadge.style.color = 'white';
                    copiesBadge.style.borderRadius = '30%';
                    copiesBadge.style.width = '22px';
                    copiesBadge.style.height = '22px';
                    copiesBadge.style.display = 'flex';
                    copiesBadge.style.justifyContent = 'center';
                    copiesBadge.style.alignItems = 'center';
                    copiesBadge.style.fontSize = '12px';
                    copiesBadge.style.fontWeight = 'bold';
                    copiesBadge.style.zIndex = '2';
                    itemCard.appendChild(copiesBadge);
                }

                const itemNameDiv = document.createElement('div');
                itemNameDiv.className = 'item-card-name';
                itemNameDiv.title = itemName;
                itemNameDiv.style.textAlign = 'left';
                itemNameDiv.style.marginRight = 'auto';
                itemNameDiv.style.fontSize = '15px';
                itemNameDiv.style.fontWeight = '500';
                itemNameDiv.style.marginTop = '0px';
                itemNameDiv.style.fontFamily = 'Builder Sans';
                itemNameDiv.style.color = document.documentElement.style.getPropertyValue('--text-color');
                const itemNameSpan = document.createElement('span');
                itemNameSpan.className = 'ng-binding';
                itemNameSpan.textContent = itemName;
                itemNameSpan.style.overflowWrap = 'break-word';
                itemNameSpan.style.wordBreak = 'break-word';
                itemNameSpan.style.overflow = 'hidden';
                itemNameSpan.style.textOverflow = 'ellipsis';
                itemNameSpan.style.display = '-webkit-box';
                itemNameSpan.style.webkitLineClamp = '2';
                itemNameSpan.style.webkitBoxOrient = 'vertical';
                itemNameSpan.style.maxHeight = '2.8em';

                itemNameDiv.appendChild(itemNameSpan);
                itemLink.appendChild(itemNameDiv);

                if (item.priceStatus === "Off Sale") {
                    const priceDiv = document.createElement('div');
                    priceDiv.className = 'item-card-price ng-scope';
                    priceDiv.style.position = 'relative';
                    priceDiv.style.marginRight = 'auto';
                    priceDiv.style.textAlign = 'left';

                    const priceSpan = document.createElement('span');
                    priceSpan.style.fontSize = '12px';
                    priceSpan.style.fontWeight = '400';
                    priceSpan.style.textAlign = 'left';
                    priceSpan.style.fontFamily = 'HCo Gotham SSm, Helvetica Neue, Helvetica, Arial, Lucida Grande, sans-serif';
                    priceSpan.className = 'text-robux-tile ng-binding';
                    priceSpan.textContent = "Off Sale";
                    priceSpan.style.color = document.documentElement.style.getPropertyValue('--text-color');

                    priceDiv.appendChild(priceSpan);
                    itemLink.appendChild(priceDiv);
                } else if (itemPrice > 0) {
                    const priceDiv = document.createElement('div');
                    priceDiv.className = 'item-card-price ng-scope';
                    priceDiv.style.position = 'relative';
                    priceDiv.style.marginRight = 'auto';
                    priceDiv.style.textAlign = 'left';

                    const iconSpan = document.createElement('span');
                    iconSpan.className = 'icon-robux-16x16 ng-scope';
                    const priceSpan = document.createElement('span');
                    priceSpan.style.marginLeft = '0px'
                    priceSpan.className = 'text-robux-tile ng-binding';
                    priceSpan.style.fontFamily = 'HCo Gotham SSm, Helvetica Neue, Helvetica, Arial, Lucida Grande, sans-serif';
                    priceSpan.textContent = abbreviateNumber(itemPrice);
                    priceSpan.style.color = document.documentElement.style.getPropertyValue('--text-color');

                    priceDiv.appendChild(iconSpan);
                    priceDiv.appendChild(priceSpan);
                    itemLink.appendChild(priceDiv);
                } else if (itemPrice === 0) {
                    const priceDiv = document.createElement('div');
                    priceDiv.className = 'item-card-price ng-scope';
                    priceDiv.style.position = 'relative';
                    priceDiv.style.marginRight = 'auto';
                    priceDiv.style.textAlign = 'left';

                    const priceSpan = document.createElement('span');
                    priceSpan.style.fontSize = '12px'
                    priceSpan.style.fontWeight = '400';
                    priceSpan.style.textAlign = 'left'
                    priceSpan.style.fontFamily = 'HCo Gotham SSm, Helvetica Neue, Helvetica, Arial, Lucida Grande, sans-serif';
                    priceSpan.className = 'text-robux-tile ng-binding';
                    priceSpan.textContent = "Free";
                    priceSpan.style.color = document.documentElement.style.getPropertyValue('--text-color');

                    priceDiv.appendChild(priceSpan);
                    itemLink.appendChild(priceDiv)
                }

                itemCard.appendChild(itemLink);

                if (isOwned) {
                    ownedItemsResultContainer.appendChild(itemCard);
                    hasOwnedItems = true;
                } else {
                    unownedItemsResultContainer.appendChild(itemCard);
                    hasUnownedItems = true;
                }
            });

            if (!hasOwnedItems) {
                ownedItemsResultContainer.appendChild(createNoItemsMessageElement(currentTheme));
            }
            if (!hasUnownedItems) {
                unownedItemsResultContainer.appendChild(createNoItemsMessageElement(currentTheme));
            }
        }

        updateThemeStyles(detectTheme());

        function updateThemeStyles(theme) {
            let borderColor;
            if (theme === 'dark') {
                borderColor = '#666';
                document.documentElement.style.setProperty('--text-color', 'rgb(255, 255, 255) !important');
                document.documentElement.style.setProperty('--light-text-color', 'rgb(96, 97, 98) !important');
                document.documentElement.style.setProperty('--overlay-background', 'rgb(39, 41, 48) !important');
                document.documentElement.style.setProperty('--light-overlay-background', 'rgb(245, 245, 245) !important');
                document.documentElement.style.setProperty('--button-background', 'rgb(36, 41, 46) !important');
                document.documentElement.style.setProperty('--light-button-background', 'rgb(240, 240, 240) !important');
                document.documentElement.style.setProperty('--button-hover-background', 'rgb(0, 176, 111) !important');
                document.documentElement.style.setProperty('--border-color', '#444 !important');
                document.documentElement.style.setProperty('--light-border-color', '#ccc !important');
                document.documentElement.style.setProperty('--border-color-hover', '#24292e !important');
                document.documentElement.style.setProperty('--input-background', 'rgb(36, 41, 46) !important');
                document.documentElement.style.setProperty('--join-button-background', 'rgb(0, 176, 111) !important');
                document.documentElement.style.setProperty('--item-ownership-button-background', 'rgb(36, 41, 46) !important');
                document.documentElement.style.setProperty('--light-item-ownership-button-background', 'rgb(240, 240, 240) !important');
                document.documentElement.style.setProperty('--item-ownership-button-color', 'white !important');
                document.documentElement.style.setProperty('--light-item-ownership-button-light-color', 'black !important');

                document.documentElement.style.setProperty('--modal-background', 'rgb(39, 41, 48)');
                document.documentElement.style.setProperty('--modal-border-color', 'rgb(73, 77, 90)');
                document.documentElement.style.setProperty('--modal-box-shadow', 'rgba(0, 0, 0, 0.14) 0px 16px 64px 0px, rgba(0, 0, 0, 0.14) 0px 32px 64px 0px');
                document.documentElement.style.setProperty('--modal-text-color', 'rgb(247, 247, 248)');
                document.documentElement.style.setProperty('--modal-header-text-color', 'rgb(247, 247, 248)');
                document.documentElement.style.setProperty('--modal-header-background', 'rgb(39, 41, 48)');
                document.documentElement.style.setProperty('--modal-options-text-color', 'rgb(213, 215, 221)');
                document.documentElement.style.setProperty('--modal-options-background', 'rgb(39, 41, 48)');
                document.documentElement.style.setProperty('--filter-option-button-text-color', 'white');
                document.documentElement.style.setProperty('--filter-option-button-hover-background', 'rgba(255, 255, 255, 0.08)');
                document.documentElement.style.setProperty('--filter-button-background', 'rgb(36, 41, 46)');
                document.documentElement.style.setProperty('--filter-button-text', 'rgb(255, 255, 255)');
                document.documentElement.style.setProperty('--filter-button-border-color', '#444');
                document.documentElement.style.setProperty('--filter-button-active-background', 'white');
                document.documentElement.style.setProperty('--filter-button-active-text', 'rgba(208, 217, 251, 0.12)');
                document.documentElement.style.setProperty('--filter-input-label-color', 'rgb(255, 255, 255)');
                document.documentElement.style.setProperty('--filter-input-background', 'rgba(18, 18, 21, 0.8)');
                document.documentElement.style.setProperty('--filter-input-border-color', 'rgb(73, 77, 90)');
                document.documentElement.style.setProperty('--filter-input-text-color', 'rgb(213, 215, 221)');
                document.documentElement.style.setProperty('--filter-toggle-background', 'rgb(73, 77, 90)');
                document.documentElement.style.setProperty('--filter-toggle-border-color', 'rgb(68, 68, 68)');
                document.documentElement.style.setProperty('--filter-toggle-indicator-color', 'white');
                document.documentElement.style.setProperty('--tab-button-background', 'rgb(36, 41, 46)');
                document.documentElement.style.setProperty('--tab-button-text-color', 'rgb(255, 255, 255)');
                document.documentElement.style.setProperty('--tab-button-border-color', '#444');
                document.documentElement.style.setProperty('--button-primary-background', 'rgb(51, 95, 255)');
                document.documentElement.style.setProperty('--button-primary-text', 'white');
                document.documentElement.style.setProperty('--button-disabled-background', '#e1e1e1');
                document.documentElement.style.setProperty('--button-disabled-text', '#999');
                document.documentElement.style.setProperty('--text-success-color', 'green');
                document.documentElement.style.setProperty('--item-offsale-color', '#6c757d');
                document.documentElement.style.setProperty('--item-owned-icon-color', 'green');
                document.documentElement.style.setProperty('--item-unowned-icon-color', 'red');
                document.documentElement.style.setProperty('--filter-input-placeholder-color', 'rgba(0, 0, 0, 0.4)');
            } else {
                borderColor = '#ddd';
                document.documentElement.style.setProperty('--text-color', 'rgb(96, 97, 98) !important');
                document.documentElement.style.setProperty('--light-text-color', 'rgb(96, 97, 98) !important');
                document.documentElement.style.setProperty('--overlay-background', 'rgb(245, 245, 245) !important');
                document.documentElement.style.setProperty('--light-overlay-background', 'rgb(245, 245, 245) !important');
                document.documentElement.style.setProperty('--button-background', 'rgb(240, 240, 240) !important');
                document.documentElement.style.setProperty('--light-button-background', 'rgb(240, 240, 240) !important');
                document.documentElement.style.setProperty('--button-hover-background', 'rgb(220, 220, 220) !important');
                document.documentElement.style.setProperty('--border-color', '#ccc !important');
                document.documentElement.style.setProperty('--light-border-color', '#ccc !important');
                document.documentElement.style.setProperty('--border-color-hover', '#999 !important');
                document.documentElement.style.setProperty('--input-background', 'white !important');
                document.documentElement.style.setProperty('--join-button-background', 'rgb(0, 176, 111) !important');
                document.documentElement.style.setProperty('--item-ownership-button-background', 'rgb(240, 240, 240) !important');
                document.documentElement.style.setProperty('--light-item-ownership-button-background', 'rgb(240, 240, 240) !important');
                document.documentElement.style.setProperty('--item-ownership-button-color', 'black !important');
                document.documentElement.style.setProperty('--light-item-ownership-button-light-color', 'black !important');

                document.documentElement.style.setProperty('--modal-background', 'rgb(255, 255, 255)');
                document.documentElement.style.setProperty('--modal-border-color', 'rgb(204, 204, 204)');
                document.documentElement.style.setProperty('--modal-box-shadow', '0 2px 8px 0 rgba(0,0,0,.14),0 4px 8px 0 rgba(0,0,0,.14)');
                document.documentElement.style.setProperty('--modal-text-color', '#333');
                document.documentElement.style.setProperty('--modal-header-text-color', '#333');
                document.documentElement.style.setProperty('--modal-header-background', 'rgb(255, 255, 255)');
                document.documentElement.style.setProperty('--modal-options-text-color', '#666');
                document.documentElement.style.setProperty('--modal-options-background', 'rgb(255, 255, 255)');
                document.documentElement.style.setProperty('--filter-option-button-text-color', '#333');
                document.documentElement.style.setProperty('--filter-option-button-hover-background', 'rgba(0, 0, 0, 0.05)');
                document.documentElement.style.setProperty('--filter-button-background', 'rgba(27,37,75,.12)');
                document.documentElement.style.setProperty('--filter-button-text', '#333');
                document.documentElement.style.setProperty('--filter-button-border-color', '#ccc');
                document.documentElement.style.setProperty('--filter-button-active-background', 'rgb(51, 95, 255)');
                document.documentElement.style.setProperty('--filter-button-active-text', 'white');
                document.documentElement.style.setProperty('--filter-input-label-color', '#333');
                document.documentElement.style.setProperty('--filter-input-background', '#fff');
                document.documentElement.style.setProperty('--filter-input-border-color', '#ccc');
                document.documentElement.style.setProperty('--filter-input-text-color', '#333');
                document.documentElement.style.setProperty('--filter-toggle-background', '#fff');
                document.documentElement.style.setProperty('--filter-toggle-border-color', '#ccc');
                document.documentElement.style.setProperty('--filter-toggle-indicator-color', 'rgb(51, 95, 255)');
                document.documentElement.style.setProperty('--tab-button-background', 'rgb(240, 240, 240)');
                document.documentElement.style.setProperty('--tab-button-text-color', '#333');
                document.documentElement.style.setProperty('--tab-button-border-color', '#ccc');
                document.documentElement.style.setProperty('--button-primary-background', 'rgb(51, 95, 255)');
                document.documentElement.style.setProperty('--button-primary-text', 'white');
                document.documentElement.style.setProperty('--button-disabled-background', '#d3d3d3');
                document.documentElement.style.setProperty('--button-disabled-text', '#777');
                document.documentElement.style.setProperty('--text-success-color', 'green');
                document.documentElement.style.setProperty('--item-offsale-color', 'rgb(128, 128, 128)');
                document.documentElement.style.setProperty('--item-owned-icon-color', 'green');
                document.documentElement.style.setProperty('--item-unowned-icon-color', 'red');
                document.documentElement.style.setProperty('--filter-input-placeholder-color', 'rgba(96, 97, 98, 0.7)');
            }
            document.documentElement.style.setProperty('--input-border-color', borderColor + ' !important');
            
            setTimeout(updateDropdownBorders, 0);
        }

        function detectTheme() {
            const bodyElement = document.body;
            if (bodyElement) {
                const bodyBgColor = window.getComputedStyle(bodyElement).backgroundColor;
                if (bodyBgColor) {
                    const rgb = bodyBgColor.match(/\d+/g);
                    if (rgb && rgb.length >= 3) {
                        const brightness = (parseInt(rgb[0]) * 299 + parseInt(rgb[1]) * 587 + parseInt(rgb[2]) * 114) / 1000;
                        if (brightness < 128) {
                            return 'dark';
                        } else {
                            return 'light';
                        }
                    }
                }
                
                if (bodyElement.classList.contains('dark-theme') || 
                    document.documentElement.classList.contains('dark-theme')) {
                    return 'dark';
                }
                
                if (bodyElement.classList.contains('light-theme') || 
                    document.documentElement.classList.contains('light-theme')) {
                    return 'light';
                }
            }
            
            return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }

        function observeAndApplyStyles() {
            const targetNode = document.body;
            const config = {
                attributes: true,
                childList: true,
                subtree: true
            };

            const callback = function(mutationsList, observer) {
                for (const mutation of mutationsList) {
                    if (mutation.type === 'childList' | mutation.type === 'attributes') {
                        const button = document.querySelector('.item-ownership-button');
                        if (button) {
                            const currentTheme = detectTheme();
                            applyButtonStyles(button, currentTheme);
                        }
                        const filterButton = document.querySelector('.filter-select.btn-primary-md');
                        if (filterButton) {
                            const currentTheme = detectTheme();
                            applyFilterButtonStyle(filterButton, currentTheme);
                        }
                    }
                }
            };

            const observer = new MutationObserver(callback);
            observer.observe(targetNode, config);
        }

        function updateDropdownBorders() {
            const dropdowns = document.querySelectorAll('select.filter-limit-dropdown');
            const borderColor = document.documentElement.style.getPropertyValue('--filter-input-border-color');
            
            dropdowns.forEach(dropdown => {
                dropdown.style.border = `1px solid ${borderColor}`;
            });
        }

        function abbreviateNumber(number) {
            if (number === 0) return "Free";
            if (number < 999) return number.toString();
            if (number >= 1000 && number <= 9999) return number.toLocaleString('en-US');
            if (number < 999999) return (number / 1000).toFixed(0) + "K+";
            if (number < 1000000000) return (number / 1000000).toFixed(0) + "M+";
            return (number / 1000000000).toFixed(1) + "B+";
        }

        extractAndLogUserId();

        let currentTheme = detectTheme();
        updateThemeStyles(currentTheme);

        const initialButton = document.querySelector('.item-ownership-button');
        if (initialButton) {
            applyButtonStyles(initialButton, currentTheme);
        }
        const initialFilterButton = document.querySelector('.filter-select.btn-primary-md');
        if (initialFilterButton) {
            applyFilterButtonStyle(initialFilterButton, currentTheme);
        }

        setTimeout(() => {
            currentTheme = detectTheme();
            updateThemeStyles(currentTheme);
            if (initialButton) {
                applyButtonStyles(initialButton, currentTheme);
            }
            if (initialFilterButton) {
                applyFilterButtonStyle(initialFilterButton, currentTheme);
            }
            
            updateDropdownBorders();

            observeAndApplyStyles()
        }, 100);

        function waitForInventorySection() {
            const observer = new MutationObserver((mutationsList, observerInstance) => {
               
                if (uiAdded) {
                    observerInstance.disconnect();
                    return;
                }

                const targetElement = document.querySelector('div.section-content-off:not(.btr-section-content-off)');

                if (targetElement) {
                    
                    uiAdded = true;
                    observerInstance.disconnect();
                    checkInventoryHidden();
                }
            });

            observer.observe(document.body, { childList: true, subtree: true });
        }

        if (isInventoryPage() || isProfilePage()) {
            waitForInventorySection();
        }
    };

    checkStorageAndRun();
})();