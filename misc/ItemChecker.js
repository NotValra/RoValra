(function() {

    let inventoryCheckRunning = false;
    let currentUserId = null;

    function extractAndLogUserId() {
        if (window.location.href.includes("/users/")) {
            const regex = /^\/(?:[a-z]{2}\/)?users\/(\d+)/;
            const match = window.location.pathname.match(regex);

            if (match) {
                currentUserId = match[1];
            } else {
                currentUserId = null;
            }
        } else {
            currentUserId = null;
        }
    }

    function checkInventoryHidden(retryCount = 0) {
        if (inventoryCheckRunning) {
            return;
        }

        inventoryCheckRunning = true;

        const maxRetries = 10;
        const retryDelay = 100;

        let inventoryHiddenSpan = null;

        const iframe = document.getElementById('btr-injected-inventory');

        if (iframe) {
            try {
                const iframeDocument = iframe.contentDocument || iframe.contentWindow.document;
                if (iframeDocument) {
                    inventoryHiddenSpan = iframeDocument.querySelector(
                        'div#inventory-container div.section-content-off span[ng-bind="\'Message.UserInventoryHidden\' | translate"].ng-binding'
                    );
                } else {
                }
            } catch (error) {
            }
        }
        if (!inventoryHiddenSpan) {
            inventoryHiddenSpan = document.querySelector(
                'div#content div#inventory-container div.section-content-off span[ng-bind="\'Message.UserInventoryHidden\' | translate"].ng-binding'
            );
        }
        if (!inventoryHiddenSpan) {
            inventoryHiddenSpan = document.querySelector('span[ng-bind="\'Message.UserInventoryHidden\' | translate"].ng-binding');
        }

        if (inventoryHiddenSpan) {

            if (!document.getElementById('item-ownership-checker-container')) {
                let container = document.createElement('div');
                container.id = 'item-ownership-checker-container';
                container.style.marginTop = "10px";
                container.style.display = 'flex';
                container.style.flexDirection = 'column';
                container.style.maxWidth = "300px";
                container.style.margin = '0 auto';

                let explanation = document.createElement('p');
                explanation.textContent = "Enter an item ID to check if this user owns it";
                explanation.style.cssText = `
                    color: var(--text-color) !important;
                    font-size: 14px;
                    font-family: 'Gotham Medium', sans-serif;
                    margin-bottom: 5px;
                `;


                let inputGroup = document.createElement('div');
                inputGroup.className = 'input-group';
                inputGroup.style.width = '100%';
                inputGroup.style.borderRadius = '4px';
                inputGroup.style.overflow = 'hidden';

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

                let button2 = document.createElement('button');
                button2.type = 'button';
                button2.style.marginTop = '7px'
                button2.className = 'btn-control-md item-ownership-button';

                const buttonText = document.createTextNode('Check Ownership');
                button2.appendChild(buttonText);

                buttonListItem.appendChild(button2);

                let fakeCheckButton = document.createElement('button');
                fakeCheckButton.type = 'button';

                fakeCheckButton.className = 'btn-control-md item-ownership-button';
                fakeCheckButton.textContent = 'Check Inventory';

                fakeCheckButton.style.position = 'absolute';
                fakeCheckButton.style.left = '-9999px';
                fakeCheckButton.style.top = '-9999px';

                buttonListItem.insertBefore(fakeCheckButton, button2);

                input.addEventListener('keydown', function(event) {
                    if (event.key === 'Enter') {
                        event.preventDefault(); 
                        const itemId = input.value;
                        if (itemId) {
                            checkItemOwnership(itemId);
                        }
                    }
                });


                button2.addEventListener('click', function() {
                    const itemId = input.value;
                    if (itemId) {
                        checkItemOwnership(itemId);
                    } else {
                    }
                });


                container.appendChild(inputGroup);
                container.appendChild(buttonListItem);

                if (inventoryHiddenSpan && inventoryHiddenSpan.parentNode) {

                    let explanationContainer = document.createElement('div');
                    explanationContainer.appendChild(explanation);
                    explanationContainer.id = 'item-ownership-explanation-container';

                    inventoryHiddenSpan.parentNode.insertBefore(explanationContainer, inventoryHiddenSpan.nextSibling);
                    inventoryHiddenSpan.parentNode.insertBefore(container, explanationContainer.nextSibling);
                } else {
                    document.body.appendChild(explanation);
                    document.body.appendChild(container);
                }
            }

        } else {
            if (retryCount < maxRetries) {
                setTimeout(() => checkInventoryHidden(retryCount + 1), retryDelay);
            } else {
            }
        }
        inventoryCheckRunning = false;
    }


    function checkItemOwnership(itemId) {
        if (!currentUserId) {
            alert("User ID not found. Idk you must have broken something somehow....");
            return;
        }

        const apiUrl = `https://inventory.roblox.com/v1/users/${currentUserId}/items/Asset/${itemId}`;
        const button = document.querySelector('.item-ownership-button');

        fetch(apiUrl)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                displayOwnershipResult(itemId, data);

            })
            .catch(error => {
                alert('Invalid Item ID.')

            });
    }

    function displayOwnershipResult(itemId, apiResponse) {
        let ownsItem = false;
        let itemCount = 0;

        if (apiResponse && apiResponse.data && Array.isArray(apiResponse.data) && apiResponse.data.length > 0) {
            ownsItem = true;
            itemCount = apiResponse.data.length;
        }

        let overlayContainer = document.getElementById('item-ownership-result-overlay');
        let backdrop = document.getElementById('item-ownership-backdrop');

        if (overlayContainer) {
            overlayContainer.remove();
        }

        if (backdrop) {
            backdrop.remove();
        }

        overlayContainer = document.createElement('div');
        overlayContainer.id = 'item-ownership-result-overlay';
        document.body.appendChild(overlayContainer);


        backdrop = document.createElement('div');
        backdrop.id = 'item-ownership-backdrop';
        backdrop.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.5); /* Semi-transparent black */
            z-index: 999; /* Place it behind the main overlay */
        `;
        document.body.appendChild(backdrop);

        document.body.style.overflow = 'hidden';



        backdrop.addEventListener('click', function() {
            closeOverlay(overlayContainer, backdrop);

        });

        overlayContainer.innerHTML = '';

        let title = document.createElement('h1');
        title.textContent = `Item Ownership Check`;
        title.style.marginBotton = '10px';
        title.style.color = 'var(--text-color) !important';

        let message = document.createElement('p');
        message.style.marginBottom = '7px';
        message.style.color = 'var(--text-color) !important';

        message.style.fontSize = '1.2em';
        message.style.fontWeight = 'bold';

        let ownershipText = ownsItem ? "User owns this item" : "User does NOT own this item.";
        if (ownsItem && itemCount > 1) {
            ownershipText += `. Count: ${itemCount}`;
        }

        message.textContent = ownershipText;

        if (ownsItem) {
            message.style.color = '#228B22';
        } else {
            message.style.color = 'red';
        }

        let itemIdDisplay = document.createElement('p');
        itemIdDisplay.textContent = `Item ID: ${itemId}`;
        itemIdDisplay.style.fontSize = '0.9em';
        itemIdDisplay.style.color = 'var(--text-color) !important';

        let closeButton = document.createElement('button');
        closeButton.textContent = 'Close';
        closeButton.className = 'btn-control-md item-ownership-button';
        closeButton.style.marginTop = '7px';

        closeButton.addEventListener('click', function() {
            closeOverlay(overlayContainer, backdrop);

        });

        overlayContainer.appendChild(title);
        overlayContainer.appendChild(message);
        overlayContainer.appendChild(itemIdDisplay);
        overlayContainer.appendChild(closeButton);

        overlayContainer.className = 'section-content';
        overlayContainer.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            padding: 10px;
            border-radius: 5px;
            z-index: 1000;
            font-family: Arial, sans-serif;
            text-align: center;
            width: 500px;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
            background-color: var(--overlay-background) !important; /* Use themed background */
            color: var(--text-color) !important; /* Use themed text color */
        `;
    }


    function closeOverlay(overlayContainer, backdrop) {
        if (overlayContainer) {
            overlayContainer.remove();
        }
        if (backdrop) {
            backdrop.remove();
        }
        document.body.style.overflow = 'auto';
    }

    function updateThemeStyles(theme) {
        let borderColor;
        if (theme === 'dark') {
            borderColor = '#666';
            document.documentElement.style.setProperty('--text-color', 'rgb(255, 255, 255) !important');
            document.documentElement.style.setProperty('--overlay-background', 'rgb(68, 72, 76) !important');
            document.documentElement.style.setProperty('--button-background', 'rgb(36, 41, 46) !important');
            document.documentElement.style.setProperty('--button-hover-background', 'rgb(0, 176, 111) !important');
            document.documentElement.style.setProperty('--border-color', '#444 !important');
            document.documentElement.style.setProperty('--border-color-hover', '#24292e !important');
            document.documentElement.style.setProperty('--input-background', 'rgb(36, 41, 46) !important');
            document.documentElement.style.setProperty('--join-button-background', 'rgb(0, 176, 111) !important');
            document.documentElement.style.setProperty('--item-ownership-button-background', 'rgb(36, 41, 46) !important');
            document.documentElement.style.setProperty('--item-ownership-button-color', 'white !important');

        } else {
            borderColor = '#ddd';
            document.documentElement.style.setProperty('--text-color', 'rgb(96, 97, 98) !important');
            document.documentElement.style.setProperty('--overlay-background', 'rgb(245, 245, 245) !important');
            document.documentElement.style.setProperty('--button-background', 'rgb(96, 97, 98) !important');
            document.documentElement.style.setProperty('--button-hover-background', 'rgb(0, 176, 111) !important');
            document.documentElement.style.setProperty('--border-color', '#ccc !important');
            document.documentElement.style.setProperty('--border-color-hover', '#999 !important');
            document.documentElement.style.setProperty('--input-background', 'white !important');
            document.documentElement.style.setProperty('--join-button-background', 'rgb(0, 176, 111) !important');
            document.documentElement.style.setProperty('--item-ownership-button-background', 'rgb(96, 97, 98) !important');
            document.documentElement.style.setProperty('--item-ownership-button-color', 'black !important');
        }
        document.documentElement.style.setProperty('--input-border-color', borderColor + ' !important');
    }

    function detectTheme() {
        return 'light';
    }

    function applyButtonStyles(button, theme) {
        const isDark = theme === 'dark';
        button.style.backgroundColor = document.documentElement.style.getPropertyValue(isDark ? '--item-ownership-button-background' : '--item-ownership-button-background') + ' !important';
        button.style.color = document.documentElement.style.getPropertyValue(isDark ? '--item-ownership-button-color' : '--item-ownership-button-color') + ' !important';
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
                if (mutation.type === 'childList' || mutation.type === 'attributes') {
                    const button = document.querySelector('.item-ownership-button');
                    if (button) {
                        const currentTheme = detectTheme();
                        applyButtonStyles(button, currentTheme);
                    }
                }
            }
        };

        const observer = new MutationObserver(callback);
        observer.observe(targetNode, config);
    }
    extractAndLogUserId();

    const initialTheme = detectTheme();
    updateThemeStyles(initialTheme);

    const initialButton = document.querySelector('.item-ownership-button');
    if (initialButton) {
        applyButtonStyles(initialButton, initialTheme);
    }
    setTimeout(() => {
        const initialTheme = detectTheme();
        updateThemeStyles(initialTheme);
        if (initialButton) {
            applyButtonStyles(initialButton, initialTheme);
        }
        observeAndApplyStyles()
    }, 100);

    setTimeout(() => checkInventoryHidden(), 500);

})();