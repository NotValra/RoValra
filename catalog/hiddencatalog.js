let checkInterval;
let currentMode = localStorage.getItem('hiddenCatalogMode') || 'dark';

const initHiddenCatalog = () => {
    applyTheme(currentMode);

    checkInterval = setInterval(function() {
        const robuxButtonContainer = document.getElementById('navigation-robux-container');

        if (robuxButtonContainer) {
            if (robuxButtonContainer.style.display === 'none') {
                robuxButtonContainer.style.display = 'block';
            }

            const robuxButtonLink = robuxButtonContainer.querySelector('a.robux-menu-btn');

            if (robuxButtonLink) {
                robuxButtonLink.textContent = 'Hidden Catalog';
                robuxButtonLink.href = '/hidden-catalog';
                robuxButtonLink.target = "_self";
                clearInterval(checkInterval);
                removeHiddenCatalogContent();
                removeHomeElement();
            }
        }
    }, 20);
};

function removeHomeElement() {
    const homeElementToRemove = document.querySelector('li.cursor-pointer.btr-nav-node-header_home.btr-nav-header_home');
    if (homeElementToRemove) {
        homeElementToRemove.remove();
    }
}

function applyTheme(mode) {
    currentMode = mode;
    localStorage.setItem('hiddenCatalogMode', mode);
    document.documentElement.setAttribute('data-theme', mode);

    const contentDiv = document.querySelector('.content#content');
    if (contentDiv) {
        if (mode === 'light') {
            contentDiv.classList.add('light-mode');
            contentDiv.classList.remove('dark-mode');
        } else {
            contentDiv.classList.add('dark-mode');
            contentDiv.classList.remove('light-mode');
        }
    }

    const header = document.querySelector('.hidden-catalog-header h1');
    const headerIcon = document.querySelector('.hidden-catalog-header img');
    if (header) {
        if (mode === 'light') {
            header.classList.add('light-mode');
            header.classList.remove('dark-mode');
        } else {
            header.classList.add('dark-mode');
            header.classList.remove('light-mode');
        }
    }
    if (headerIcon) {
        if (mode === 'light') {
            headerIcon.classList.add('light-mode');
            headerIcon.classList.remove('dark-mode');
        } else {
            headerIcon.classList.add('dark-mode');
            headerIcon.classList.remove('light-mode');
        }
    }

    const descriptionElement = document.getElementById('hidden-catalog-description');
    if (descriptionElement) {
        if (mode === 'light') {
            descriptionElement.classList.add('light-mode');
            descriptionElement.classList.remove('dark-mode');
        } else {
            descriptionElement.classList.add('dark-mode');
            descriptionElement.classList.remove('light-mode');
        }
    }

    const itemNames = document.querySelectorAll('.item-name');
    itemNames.forEach(itemName => {
        if (mode === 'light') {
            itemName.classList.add('light-mode');
            itemName.classList.remove('dark-mode');
        } else {
            itemName.classList.add('dark-mode');
            itemName.classList.remove('light-mode');
        }
    });
    const itemContainers = document.querySelectorAll('.item-container');
    itemContainers.forEach(itemContainer => {
        if (mode === 'light') {
            itemContainer.classList.add('light-mode');
            itemContainer.classList.remove('dark-mode');
        } else {
            itemContainer.classList.add('dark-mode');
            itemContainer.classList.remove('light-mode');
        }
    });
    const shimmerElements = document.querySelectorAll('.shimmer');
    shimmerElements.forEach(shimmerElement => {
        if (mode === 'light') {
            shimmerElement.classList.add('light-mode');
            shimmerElement.classList.remove('dark-mode');
        } else {
            shimmerElement.classList.add('dark-mode');
            shimmerElement.classList.remove('light-mode');
        }
    });
     const iconInReviewElements = document.querySelectorAll('.icon-in-review');
    iconInReviewElements.forEach(iconInReviewElement => {
        if (mode === 'light') {
            iconInReviewElement.classList.add('light-mode');
            iconInReviewElement.classList.remove('dark-mode');
        } else {
            iconInReviewElement.classList.add('dark-mode');
            iconInReviewElement.classList.remove('light-mode');
        }
    });
}

function removeHiddenCatalogContent() {
    const isOnHiddenCatalog = window.location.pathname.endsWith('/hidden-catalog');

    if (isOnHiddenCatalog) {
        const contentDiv = document.querySelector('.content#content');

        if (contentDiv) {
            contentDiv.innerHTML = '';
            contentDiv.style.position = 'relative';

            const headerContainer = document.createElement('div');
            headerContainer.className = 'hidden-catalog-header';
            headerContainer.style.position = 'absolute';
            headerContainer.style.top = '10px';
            headerContainer.style.left = '20px';
            headerContainer.style.zIndex = '100';
            headerContainer.style.display = 'flex';
            headerContainer.style.alignItems = 'center';

            const header = document.createElement('h1');
            header.textContent = 'Hidden Catalog';
            header.style.fontWeight = '800';
            header.style.padding = '20px 0px 20px 10px';
            header.style.fontSize = '2em';
            header.style.margin = '0';

            headerContainer.appendChild(header);

            const headerIcon = document.createElement('img');
            headerIcon.src =  chrome.runtime.getURL("Assets/icon-128.png");
            headerIcon.alt = 'Hidden Catalog Icon';
            headerIcon.style.width = '32px';
            headerIcon.style.height = '32px';
            headerIcon.style.verticalAlign = 'middle';
            headerIcon.style.marginLeft = '5px';
            headerIcon.style.zIndex = '100';
            headerContainer.appendChild(headerIcon);

            contentDiv.appendChild(headerContainer);

            const descriptionElement = document.createElement('div');
            descriptionElement.id = 'hidden-catalog-description';
            descriptionElement.style.paddingTop = '20px'
            descriptionElement.style.paddingBottom = '20px'
            descriptionElement.style.paddingLeft = '0px'
            descriptionElement.style.marginBottom = '0px';
            descriptionElement.style.marginTop = '50px';
            descriptionElement.style.marginRight = 'auto';
            descriptionElement.innerHTML = `
                <p>The Hidden Catalog shows items uploaded by Roblox which are not yet on the marketplace.</p>
                <p>Keep in mind that some of these items may never be released, as they could have been test uploads by Roblox.</p>
                <p>Most items will not have a thumbnail / mesh while being on the hidden catalog.</p>
                <p><b>To open the item page you will need <a href="https://www.roseal.live/" target="_blank" style="text-decoration: underline;">RoSeal</a>
            `;
            contentDiv.appendChild(descriptionElement);

            fetchDataFromAPI();
        }
    }
}

async function fetchItemDetails(itemId) {
    const url = `https://economy.roblox.com/v2/assets/${itemId}/details`;
    try {
        const response = await fetch(url, {
            credentials: 'include'
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} for item details API for item ${itemId}`);
        }
        return await response.json();
    } catch (error) {
        return null;
    }
}

async function fetchDataFromAPI(retryCount = 0, maxRetries = 1, retryDelay = 100) {
    // You are allowed to use this API for personal projects only which is limited to open source projects on GitHub, they must be free and you must credit the RoValra repo.
    // You are not allowed to use the API for projects on the chrome web store or any other extension store. If you want to use the API for a website dm be on discord: Valra and we can figure something out.
    // If you want to use the API for something thats specifically said isnt allowed or you might be unsure if its allowed, please dm me on discord: Valra, Ill be happy to check out your stuff and maybe allow you to use it for your project.
    const apiUrl = 'https://catalog.rovalra.com/items';

    const requestHeaders = new Headers();
    requestHeaders.append('Accept', 'application/json, text/plain, */*');
    requestHeaders.append('Accept-Language', 'en-US,en-UK,en;q=0.9');
    requestHeaders.append('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

    try {
        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: requestHeaders,
            redirect: 'manual',
            cache: 'no-store'
        });

        if (response.status >= 300 && response.status < 400) {
            const locationHeader = response.headers.get('Location');
            displayApiError(`API request error`);
            return;
        } else if (response.type === 'opaqueredirect') {
             displayApiError("Api error");
             return;
        } else if (!response.ok) {
            const error = new Error(`HTTP error! status: ${response.status}`);
            error.status = response.status;
             try { error.responseText = await response.text(); } catch (e) { /* Ignore */ }
            throw error;
        }

        const data = await response.json();

        if (!data || !Array.isArray(data.items)) {
            displayApiError("API returned invalid data format (expected 'items' array). Please try again later.");
            return;
        }

        const existingError = document.querySelector('.content#content .api-error-message');
        if (existingError) existingError.remove();

        const items = data.items;
        const batchSize = 20;
        const itemsWithDetails = [];

        for (let i = 0; i < items.length; i += batchSize) {
            const batch = items.slice(i, i + batchSize);
            const batchResults = await Promise.all(
                batch.map(async item => {
                    if (!item || typeof item.item_id === 'undefined') {
                        return { ...item, details: null, name: item?.name || 'Invalid Item Data' };
                    }
                    const details = await fetchItemDetails(item.item_id);
                    item.name = item.name || (details ? details.Name : 'Unnamed Item');
                    return { ...item, details };
                })
            );
            itemsWithDetails.push(...batchResults);

            if (i + batchSize < items.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        displayItems(itemsWithDetails);

    } catch (error) {
        if (error instanceof TypeError && (error.message.includes('redirect') || error.message.includes('Failed to fetch'))) {
             displayApiError("Error: The API request errored, please try again later");
        } else {
            const status = error.status;

             if (status === 429 || (status && status >= 500 && status < 600) || (error instanceof TypeError && error.message === 'Failed to fetch')) {
                if (retryCount < maxRetries) {
                    const delay = retryDelay * Math.pow(2, retryCount);
                    setTimeout(() => {
                         fetchDataFromAPI(retryCount + 1, maxRetries, retryDelay);
                    }, delay);
                } else {
                    let errorMsg = "API error";
                    displayApiError(errorMsg);
                }
            } else {
                 let errorMsg = `Error loading Hidden Catalog items (Status: ${status || 'N/A'}).`;
                 displayApiError(errorMsg);
            }
        }
    }
}

function displayApiError(message) {
    const contentDiv = document.querySelector('.content#content');
    if (contentDiv) {
        const itemsContainer = contentDiv.querySelector('div[style*="grid"]');
        if(itemsContainer) itemsContainer.innerHTML = '';

        const existingError = contentDiv.querySelector('.api-error-message');
        if (existingError) existingError.remove();

        const errorMessageElement = document.createElement('p');
        errorMessageElement.style.color = 'red';
        errorMessageElement.style.padding = '20px';
        errorMessageElement.style.width = '100%';
        errorMessageElement.style.textAlign = 'center';
        errorMessageElement.className = 'api-error-message';
        errorMessageElement.textContent = message;

        const descriptionElement = document.getElementById('hidden-catalog-description');
         if (descriptionElement) {
             contentDiv.insertBefore(errorMessageElement, descriptionElement.nextSibling);
         } else {
             contentDiv.appendChild(errorMessageElement);
         }
    }
}

function batchArray(array, batchSize) {
    const batchedArray = [];
    for (let i = 0; i < array.length; i += batchSize) {
        batchedArray.push(array.slice(i, i + batchSize));
    }
    return batchedArray;
}

async function displayItems(itemsWithDetails) {
    if (!Array.isArray(itemsWithDetails)) {
        return;
    }

    const contentDiv = document.querySelector('.content#content');
    if (!contentDiv) {
        return;
    }

    contentDiv.style.display = 'flex';
    contentDiv.style.flexWrap = 'wrap';
    contentDiv.style.justifyContent = 'center';
    contentDiv.style.alignItems = 'flex-start';
    contentDiv.style.gap = '10px';
    contentDiv.style.padding = '20px';
    contentDiv.style.marginTop = '20px';
    contentDiv.style.alignContent = 'flex-start';

    const itemsContainer = document.createElement('div');
    itemsContainer.style.display = 'grid';
    itemsContainer.style.gridTemplateColumns = 'repeat(auto-fill, minmax(221.75px, 1fr))';
    itemsContainer.style.gap = '5px';
    itemsContainer.style.width = '100%';
    itemsContainer.style.marginLeft = '30px';
    contentDiv.appendChild(itemsContainer);

    const assetIdsForThumbnails = itemsWithDetails.map(item => item.item_id);

    if (assetIdsForThumbnails.length === 0) {
        return;
    }

    itemsWithDetails.forEach(item => {

        const itemLink = document.createElement('a');
        itemLink.className = 'item-container';
        if (currentMode === 'light') {
            itemLink.classList.add('light-mode');
        } else {
            itemLink.classList.add('dark-mode');
        }
        itemLink.style.borderRadius = '8px';
        itemLink.style.overflow = 'hidden';
        itemLink.style.display = 'flex';
        itemLink.style.flexDirection = 'column';
        itemLink.style.justifyContent = 'space-between';
        itemLink.style.minHeight = '221.75px';
        itemLink.style.width = '221.75px';
        itemLink.style.cursor = 'pointer';
        itemLink.href = `https://www.roblox.com/catalog/${item.item_id}/${encodeURIComponent(item.name || 'Item')}`;

        const thumbnailContainer = document.createElement('div');
        thumbnailContainer.className = 'thumbnail-container';
        thumbnailContainer.style.borderRadius = '8px';
        thumbnailContainer.style.width = '100%';
        thumbnailContainer.style.height = '100%';
        thumbnailContainer.style.display = 'flex';
        thumbnailContainer.style.justifyContent = 'center';
        thumbnailContainer.style.alignItems = 'center';
        thumbnailContainer.style.position = 'relative';

        const initialShimmer = document.createElement('div');
        initialShimmer.className = 'thumbnail-2d-container shimmer';
        if (currentMode === 'light') {
            initialShimmer.classList.add('light-mode');
        } else {
            initialShimmer.classList.add('dark-mode');
        }
        initialShimmer.style.height = '221.75px';
        initialShimmer.style.borderRadius = '8px';
        initialShimmer.style.width = '100%';
        thumbnailContainer.appendChild(initialShimmer);

        if (item.details && item.details.ProductId !== 0) {
            const releasedLabel = document.createElement('div');
            releasedLabel.textContent = 'Released';
            releasedLabel.className = 'released-label';
            releasedLabel.style.position = 'absolute';
            releasedLabel.style.color = 'white';
            releasedLabel.style.backgroundColor = '#e57b00';
            releasedLabel.style.top = '5px';
            releasedLabel.style.left = '5px';
            releasedLabel.style.padding = '5px';
            releasedLabel.style.borderRadius = '5px';
            releasedLabel.style.fontSize = '12px';
            releasedLabel.style.fontWeight = 'bold';
            releasedLabel.style.zIndex = '1';
            thumbnailContainer.appendChild(releasedLabel);
        }

        const itemDetailsDiv = document.createElement('div');
        itemDetailsDiv.className = 'item-details';
        itemDetailsDiv.style.paddingTop = '10px';
        itemDetailsDiv.style.paddingBottom = '10px';
        itemDetailsDiv.style.display = 'flex';
        itemDetailsDiv.style.flexDirection = 'column';
        itemDetailsDiv.style.justifyContent = 'space-between';
        itemDetailsDiv.style.height = '100%';

        const itemName = document.createElement('p');
        itemName.className = 'item-name';
        if (currentMode === 'light') {
            itemName.classList.add('light-mode');
        } else {
            itemName.classList.add('dark-mode');
        }

        const nameContainer = document.createElement('div');
        nameContainer.style.display = 'flex';
        nameContainer.style.flexDirection = 'column';
        nameContainer.style.gap = '2px';
        nameContainer.style.position = 'relative';

        const displayName = item.name || 'Name Unavailable';
        itemName.textContent = displayName;

        const toggleButton = document.createElement('button');
        toggleButton.style.position = 'absolute';
        toggleButton.style.right = '5px';
        toggleButton.style.top = '0';
        toggleButton.style.padding = '2px 5px';
        toggleButton.style.fontSize = '13px';
        toggleButton.style.cursor = 'pointer';
        toggleButton.style.backgroundColor = 'transparent';
        toggleButton.style.border = '0px solid #666';
        toggleButton.style.borderRadius = '0px';
        toggleButton.style.color = '#666';
        toggleButton.textContent = '↺';
        toggleButton.title = 'Toggle original name';

        if (item.details && item.details.Name && item.details.Name !== item.name) {
            itemName.textContent = item.details.Name;
            
            let showingUpdated = true;
            toggleButton.onclick = (e) => {
                e.preventDefault(); 
                e.stopPropagation(); 
                if (showingUpdated) {
                    itemName.textContent = displayName;
                    toggleButton.style.backgroundColor = 'transparent';
                    toggleButton.style.color = '#fff';
                } else {
                    itemName.textContent = item.details.Name;
                    toggleButton.style.backgroundColor = 'transparent';
                    toggleButton.style.color = '#666';
                }
                showingUpdated = !showingUpdated;
            };
            
            nameContainer.appendChild(toggleButton);
        } 

        nameContainer.appendChild(itemName);

        itemName.style.fontWeight = '600';
        itemName.style.fontSize = '18px';
        itemName.style.marginBottom = '0px';
        itemName.style.paddingRight = '25px'; 
        itemName.style.overflow = 'hidden';
        itemName.style.textOverflow = 'ellipsis';
        itemName.style.whiteSpace = 'nowrap';

        itemDetailsDiv.appendChild(nameContainer);
        itemLink.appendChild(thumbnailContainer);
        itemLink.appendChild(itemDetailsDiv);
        itemsContainer.appendChild(itemLink);
    });

    const thumbnailBatches = batchArray(assetIdsForThumbnails, 25);

    let thumbnailData = [];
    const fetchThumbnails = async () => {
        try {
            for (const batch of thumbnailBatches) {
                const assetIdsString = batch.join(',');
                const thumbnailUrl = `https://thumbnails.roblox.com/v1/assets?assetIds=${assetIdsString}&returnPolicy=PlaceHolder&size=250x250&format=Png&isCircular=false`;

                try {
                    const response = await fetch(thumbnailUrl, {
                        credentials: 'include'
                    });

                    if (!response.ok) {
                        thumbnailData = thumbnailData.concat(batch.map(() => null));
                        continue;
                    }

                    const data = await response.json();

                    if (data && data.data) {
                        thumbnailData = thumbnailData.concat(data.data);
                    } else {
                        thumbnailData = thumbnailData.concat(batch.map(() => null));
                    }

                } catch (fetchError) {
                    thumbnailData = thumbnailData.concat(batch.map(() => null));
                }
            }
        } catch (error) {
            return;
        }

        const itemContainers = document.querySelectorAll('.item-container');
        itemContainers.forEach((itemLink, index) => {
            const thumbnailResponse = thumbnailData[index];
            const thumbnailContainer = itemLink.querySelector('.thumbnail-container');
            thumbnailContainer.innerHTML = '';

            const item = itemsWithDetails[index];

            if (item.details && item.details.ProductId !== 0) {
                const releasedLabel = document.createElement('div');
                releasedLabel.textContent = 'Released';
                releasedLabel.className = 'released-label';
                releasedLabel.style.position = 'absolute';
                releasedLabel.style.color = 'white';
                releasedLabel.style.backgroundColor = '#e57b00';
                releasedLabel.style.top = '5px';
                releasedLabel.style.left = '5px';
                releasedLabel.style.padding = '5px';
                releasedLabel.style.borderRadius = '5px';
                releasedLabel.style.fontSize = '12px';
                releasedLabel.style.fontWeight = 'bold';
                releasedLabel.style.zIndex = '1';
                thumbnailContainer.appendChild(releasedLabel);
            }

            if (thumbnailResponse && thumbnailResponse.state === "InReview") {
                thumbnailContainer.style.backgroundColor = '';
                const shimmerDivInReview = document.createElement('div');
                shimmerDivInReview.className = 'thumbnail-2d-container shimmer';
                if (currentMode === 'light') {
                    shimmerDivInReview.classList.add('light-mode');
                } else {
                    shimmerDivInReview.classList.add('dark-mode');
                }
                shimmerDivInReview.style.height = '221.75px';
                shimmerDivInReview.style.borderRadius = '8px';
                thumbnailContainer.appendChild(shimmerDivInReview);

                setTimeout(() => {
                    thumbnailContainer.innerHTML = '';
                    if (item.details && item.details.ProductId !== 0) {
                        const releasedLabel = document.createElement('div');
                        releasedLabel.textContent = 'Released';
                        releasedLabel.className = 'released-label';
                        releasedLabel.style.position = 'absolute';
                        releasedLabel.style.color = 'white';
                        releasedLabel.style.backgroundColor = '#e57b00';
                        releasedLabel.style.top = '5px';
                        releasedLabel.style.left = '5px';
                        releasedLabel.style.padding = '5px';
                        releasedLabel.style.borderRadius = '5px';
                        releasedLabel.style.fontSize = '12px';
                        releasedLabel.style.fontWeight = 'bold';
                        releasedLabel.style.zIndex = '1';
                        thumbnailContainer.appendChild(releasedLabel);
                    }

                    const inReviewDiv = document.createElement('div');
                    inReviewDiv.className = 'thumbnail-2d-container icon-in-review';
                    if (currentMode === 'light') {
                        inReviewDiv.classList.add('light-mode');
                    } else {
                        inReviewDiv.classList.add('dark-mode');
                    }
                    inReviewDiv.style.borderRadius = '8px';
                    thumbnailContainer.appendChild(inReviewDiv);
                }, 6000);

            } else if (thumbnailResponse && thumbnailResponse.imageUrl) {
                thumbnailContainer.style.backgroundColor = 'rgb(78 78 78 / 20%)';
                const thumbnailUrl = thumbnailResponse.imageUrl;
                const thumbnailImage = document.createElement('img');
                thumbnailImage.src = thumbnailUrl;
                thumbnailImage.alt = item.name;
                thumbnailImage.className = 'item-thumbnail';
                thumbnailImage.style.width = '100%';
                thumbnailImage.style.height = '100%';
                thumbnailImage.style.display = 'none';
                thumbnailImage.style.objectFit = 'contain';
                thumbnailImage.style.borderRadius = '8px';

                const shimmerDivLoading = document.createElement('div');
                shimmerDivLoading.className = 'thumbnail-2d-container shimmer';
                if (currentMode === 'light') {
                    shimmerDivLoading.classList.add('light-mode');
                } else {
                    shimmerDivLoading.classList.add('dark-mode');
                }
                shimmerDivLoading.style.height = '221.75px';
                shimmerDivLoading.style.borderRadius = '8px';
                thumbnailContainer.appendChild(shimmerDivLoading);

                thumbnailImage.onload = () => {
                    shimmerDivLoading.style.display = 'none';
                    thumbnailImage.style.display = 'block';
                    if (item.details && item.details.ProductId !== 0) {
                        const releasedLabel = document.createElement('div');
                        releasedLabel.textContent = 'Released';
                        releasedLabel.className = 'released-label';
                        releasedLabel.style.backgroundColor = '#e57b00';
                        releasedLabel.style.position = 'absolute';
                        releasedLabel.style.color = 'white';
                        releasedLabel.style.top = '5px';
                        releasedLabel.style.left = '5px';
                        releasedLabel.style.padding = '5px';
                        releasedLabel.style.borderRadius = '5px';
                        releasedLabel.style.fontSize = '12px';
                        releasedLabel.style.fontWeight = 'bold';
                        releasedLabel.style.zIndex = '1';
                        thumbnailContainer.appendChild(releasedLabel);
                    }
                };
                thumbnailImage.onerror = () => {
                    thumbnailContainer.innerHTML = '';
                    thumbnailContainer.style.backgroundColor = '';
                    if (item.details && item.details.ProductId !== 0) {
                        const releasedLabel = document.createElement('div');
                        releasedLabel.textContent = 'Released';
                        releasedLabel.className = 'released-label';
                        releasedLabel.style.position = 'absolute';
                        releasedLabel.style.top = '5px';
                        releasedLabel.style.left = '5px';
                        releasedLabel.style.color = 'white';
                        releasedLabel.style.backgroundColor = '#e57b00';
                        releasedLabel.style.padding = '5px';
                        releasedLabel.style.borderRadius = '5px';
                        releasedLabel.style.fontSize = '12px';
                        releasedLabel.style.fontWeight = 'bold';
                        releasedLabel.style.zIndex = '1';
                        thumbnailContainer.appendChild(releasedLabel);
                    }
                    const shimmerDivFallback = document.createElement('div');
                    shimmerDivFallback.className = 'thumbnail-2d-container shimmer';
                    if (currentMode === 'light') {
                        shimmerDivFallback.classList.add('light-mode');
                    } else {
                        shimmerDivFallback.classList.add('dark-mode');
                    }
                    shimmerDivFallback.style.height = '221.75px';
                    shimmerDivFallback.style.borderRadius = '8px';
                    thumbnailContainer.appendChild(shimmerDivFallback);
                };
                thumbnailContainer.appendChild(thumbnailImage);

            } else {
                thumbnailContainer.innerHTML = '';
                thumbnailContainer.style.backgroundColor = '';
                if (item.details && item.details.ProductId !== 0) {
                    const releasedLabel = document.createElement('div');
                    releasedLabel.textContent = 'Released';
                    releasedLabel.className = 'released-label';
                    releasedLabel.style.position = 'absolute';
                    releasedLabel.style.top = '5px';
                    releasedLabel.style.left = '5px';
                    releasedLabel.style.backgroundColor = '#e57b00';
                    releasedLabel.style.padding = '5px';
                    releasedLabel.style.borderRadius = '5px';
                    releasedLabel.style.fontSize = '12px';
                    releasedLabel.style.fontWeight = 'bold';
                    releasedLabel.style.color = 'white';
                    releasedLabel.style.zIndex = '1';
                    thumbnailContainer.appendChild(releasedLabel);
                }
                const shimmerDivFallbackNoThumb = document.createElement('div');
                shimmerDivFallbackNoThumb.className = 'thumbnail-2d-container shimmer';
                if (currentMode === 'light') {
                    shimmerDivFallbackNoThumb.classList.add('light-mode');
                } else {
                    shimmerDivFallbackNoThumb.classList.add('dark-mode');
                }
                shimmerDivFallbackNoThumb.style.height = '221.75px';
                shimmerDivFallbackNoThumb.style.borderRadius = '8px';
                thumbnailContainer.appendChild(shimmerDivFallbackNoThumb);
            }
        });
        applyTheme(currentMode);
    };

    fetchThumbnails();
}

chrome.storage.local.get({ hiddenCatalogEnabled: false }, function(result) {
    if (result.hiddenCatalogEnabled) {
        initHiddenCatalog();
    }
});