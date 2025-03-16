let checkInterval = setInterval(function() {
    const robuxButtonContainer = document.getElementById('navigation-robux-container');

    if (robuxButtonContainer) {
        const robuxButtonLink = robuxButtonContainer.querySelector('a.robux-menu-btn');

        if (robuxButtonLink) {
            robuxButtonLink.textContent = 'Hidden Catalog';
            robuxButtonLink.href = '/hidden-catalog';
            robuxButtonLink.target = "_self";
            clearInterval(checkInterval);
            removeHiddenCatalogContent();
        }
    }
}, 1);

function removeHiddenCatalogContent() {
    const isOnHiddenCatalog = window.location.pathname.endsWith('/hidden-catalog');

    if (isOnHiddenCatalog) {
        const contentDiv = document.querySelector('.content#content');

        if (contentDiv) {
            contentDiv.innerHTML = '';
            contentDiv.style.height = '893.938px';
            contentDiv.style.position = 'relative';

            const headerContainer = document.createElement('div');
            headerContainer.style.position = 'absolute';
            headerContainer.style.top = '10px';
            headerContainer.style.left = '20px';
            headerContainer.style.zIndex = '100';
            headerContainer.style.display = 'flex';
            headerContainer.style.alignItems = 'center';

            const header = document.createElement('h1');
            header.textContent = 'Hidden Catalog';
            header.style.fontWeight = '800';
            header.style.padding = '20px 0px 20px 20px';
            header.style.fontSize = '2em';
            header.style.color = 'white';
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
            descriptionElement.style.padding = '20px'
            descriptionElement.style.color = 'rgb(255, 255, 255)';
            descriptionElement.style.marginBottom = '0px';
            descriptionElement.style.marginTop = '50px';
            descriptionElement.innerHTML = `
                <p>The Hidden Catalog shows items uploaded by Roblox which are not yet on the marketplace.</p>
                <p>Keep in mind that some of these items may never be released, as they could have been test uploads by Roblox.</p>
                <p>Some items might be on Marketplace already. To open the item page you will need RoSeal.</p>
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

function fetchDataFromAPI(retryCount = 0, maxRetries = 1, retryDelay = 1000) {
    fetch('https://valraiscool.duckdns.org:7777/items', {headers: {'Accept-Language': 'en-US,en-UK,en;q=0.9'}})
        .then(response => {
            if (!response.ok) {
                if (response.status >= 500 && response.status < 600) {
                    throw new Error(`Server error: ${response.status}`);
                } else if (response.status === 429) {
                    throw new Error(`Rate limit: ${response.status}`);
                } else {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
            }
            return response.json();
        })
        .then(data => {
            displayItems(data);
        })
        .catch(error => {
            if (error.message === 'Failed to fetch' || error.message.startsWith('Server error') || error.message.startsWith('Rate limit')) {
                if (retryCount < maxRetries) {
                    const delay = retryDelay * Math.pow(2, retryCount);
                    setTimeout(() => {
                        fetchDataFromAPI(retryCount + 1, maxRetries, retryDelay);
                    }, delay);
                } else {
                    const contentDiv = document.querySelector('.content#content');
                    if (contentDiv) {
                        const errorMessageElement = document.createElement('p');
                        errorMessageElement.style.color = 'red';
                        errorMessageElement.style.paddingLeft = '20px';
                        errorMessageElement.textContent = "API is rate limited, Please try again later.";
                        contentDiv.appendChild(errorMessageElement);
                    }
                }
            } else {
                const contentDiv = document.querySelector('.content#content');
                if (contentDiv) {
                    const errorMessageElement = document.createElement('p');
                    errorMessageElement.style.color = 'red';
                    errorMessageElement.textContent = "Error loading Hidden Catalog items.";
                    contentDiv.appendChild(errorMessageElement);
                }
            }
        });
}

async function fetchThumbnails(assetIds) {
    const baseUrl = 'https://thumbnails.roblox.com/v1/assets';
    const assetIdsString = assetIds.join(',');
    const url = `${baseUrl}?assetIds=${assetIdsString}&returnPolicy=PlaceHolder&size=256x144&format=Png&isCircular=false`;

    try {
        const response = await fetch(url, {
            credentials: 'include'
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} for thumbnail API`);
        }
        const data = await response.json();
        return data.data;
    } catch (error) {
        return [];
    }
}

function batchArray(array, batchSize) {
    const batchedArray = [];
    for (let i = 0; i < array.length; i += batchSize) {
        batchedArray.push(array.slice(i, i + batchSize));
    }
    return batchedArray;
}

async function displayItems(data) {
    if (!window.location.pathname.endsWith('/hidden-catalog')) {
        return;
    }

    const contentDiv = document.querySelector('.content#content');
    if (!contentDiv) {
        return;
    }

    const loadingBar = document.createElement('img');
    loadingBar.src = 'https://images.rbxcdn.com/fab3a9d08d254fef4aea4408d4db1dfe-loading_dark.gif';
    loadingBar.alt = 'Loading Thumbnails...';
    loadingBar.id = 'thumbnail-loading-bar';
    loadingBar.style.display = 'block';
    loadingBar.style.margin = '20px auto';
    loadingBar.style.width = '100px';
    contentDiv.appendChild(loadingBar);

    const itemsContainer = document.createElement('div');
    itemsContainer.id = 'hidden-catalog-items-container';
    itemsContainer.style.display = 'grid';
    itemsContainer.style.gridTemplateColumns = 'repeat(auto-fill, minmax(250px, 1fr))';
    itemsContainer.style.gap = '0px';
    itemsContainer.style.padding = '20px';

    if (data && data.items) {
        const itemIds = data.items.map(item => item.item_id);
        const batchedItemIds = batchArray(itemIds, 50);

        let thumbnailResults = [];
        for (const batch of batchedItemIds) {
            const thumbnails = await fetchThumbnails(batch);
            thumbnailResults = thumbnailResults.concat(thumbnails);
        }

        const loadingBarElement = document.getElementById('thumbnail-loading-bar');
        if (loadingBarElement) {
            const minDisplayTime = 500;
            const startTime = Date.now();

            const removeLoadingBar = () => {
                if (loadingBarElement) {
                    loadingBarElement.remove();
                }
            };

            const elapsedTime = Date.now() - startTime;
            const remainingTime = minDisplayTime - elapsedTime;

            if (remainingTime > 0) {
                setTimeout(removeLoadingBar, remainingTime);
            } else {
                removeLoadingBar();
            }
        }


        for (const item of data.items) {
            const itemDetails = await fetchItemDetails(item.item_id);
            let uploadedDate = 'N/A';
            let updatedDate = 'N/A';

            if (itemDetails) {
                const dateOptions = { month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true };
                uploadedDate = new Date(itemDetails.Created).toLocaleString(undefined, dateOptions);
                updatedDate = new Date(itemDetails.Updated).toLocaleString(undefined, dateOptions);
            }


            const itemCardContainer = document.createElement('div');
            itemCardContainer.style.maxWidth = '242.75px';
            itemCardContainer.classList.add('catalog-item-container');

            const itemCard = document.createElement('div');
            itemCard.classList.add('item-card-container');

            const itemLink = document.createElement('a');
            itemLink.href = item.item_url;
            itemLink.target = '_self';
            itemLink.classList.add('item-card-link');

            const itemCardLinkDiv1 = document.createElement('div');
            itemCardLinkDiv1.classList.add('item-card-link');

            const itemCardThumbContainer = document.createElement('div');
            itemCardThumbContainer.classList.add('item-card-thumb-container');
            itemCardThumbContainer.style.width = '221.75px';
            itemCardThumbContainer.style.height = '221.75px';
            itemCardThumbContainer.dataset.btrOwnedId = item.item_id;
            itemCardThumbContainer.style.borderRadius = '10px';

            const itemCardThumbContainerInner = document.createElement('div');
            itemCardThumbContainerInner.classList.add('item-card-thumb-container-inner');

            const thumbnailSpan = document.createElement('span');
            thumbnailSpan.style.borderRadius = '5px'
            thumbnailSpan.classList.add('thumbnail-2d-container');
            const thumbnailIndex = data.items.findIndex(i => i.item_id === item.item_id);
            const imgElement = document.createElement('img');
            imgElement.src = thumbnailResults[thumbnailIndex]?.imageUrl || 'https://t6.rbxcdn.com/180DAY-cd1aaca8a8720fbc7192ac1dcdeb00ae';
            imgElement.alt = item.name;
            imgElement.title = item.name;
            imgElement.crossOrigin = 'anonymous';

            thumbnailSpan.appendChild(imgElement);
            itemCardThumbContainerInner.appendChild(thumbnailSpan);
            itemCardThumbContainer.appendChild(itemCardThumbContainerInner);
            itemCardLinkDiv1.appendChild(itemCardThumbContainer);

            const itemCardCaption = document.createElement('div');
            itemCardCaption.classList.add('item-card-caption');

            const itemCardNameLink = document.createElement('div');
            itemCardNameLink.classList.add('item-card-name-link');

            const itemCardName = document.createElement('div');
            itemCardName.classList.add('item-card-name');
            itemCardName.title = item.name;
            itemCardName.textContent = item.name;
            itemCardNameLink.appendChild(itemCardName);
            itemCardCaption.appendChild(itemCardNameLink);

            const itemCardDates = document.createElement('div');
            itemCardDates.classList.add('item-card-dates');

            const uploadedDateDiv = document.createElement('div');
            uploadedDateDiv.classList.add('item-card-date', 'uploaded-date');
            uploadedDateDiv.style.whiteSpace = 'nowrap';
            const uploadedDateLabel = document.createElement('span');
            uploadedDateLabel.textContent = 'Created: ';
            uploadedDateLabel.style.color = 'rgb(188, 190, 200)';
            const uploadedDateValue = document.createElement('span');
            uploadedDateValue.classList.add('date-value');
            uploadedDateValue.textContent = uploadedDate;
            uploadedDateValue.style.color = 'rgb(188, 190, 200)';
            uploadedDateDiv.appendChild(uploadedDateLabel);
            uploadedDateDiv.appendChild(uploadedDateValue);
            itemCardDates.appendChild(uploadedDateDiv);

            const updatedDateDiv = document.createElement('div');
            updatedDateDiv.classList.add('item-card-date', 'updated-date');
            updatedDateDiv.style.whiteSpace = 'nowrap';
            const updatedDateLabel = document.createElement('span');
            updatedDateLabel.textContent = 'Updated: ';
            updatedDateLabel.style.color = 'rgb(188, 190, 200)';
            const updatedDateValue = document.createElement('span');
            updatedDateValue.classList.add('date-value');
            updatedDateValue.textContent = updatedDate;
            updatedDateValue.style.color = 'rgb(188, 190, 200)';
            updatedDateDiv.appendChild(updatedDateLabel);
            updatedDateDiv.appendChild(updatedDateValue);
            itemCardDates.appendChild(updatedDateDiv);


            itemCardCaption.appendChild(itemCardDates);


            itemCardLinkDiv1.appendChild(itemCardCaption);
            itemLink.appendChild(itemCardLinkDiv1);
            itemCard.appendChild(itemLink);
            itemCardContainer.appendChild(itemCard);
            itemsContainer.appendChild(itemCardContainer);
        }
    } else {
        const noItemsMessage = document.createElement('p');
        noItemsMessage.textContent = "No items found.";
        itemsContainer.appendChild(noItemsMessage);
    }

    contentDiv.appendChild(itemsContainer);
}