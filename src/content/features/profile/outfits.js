import { showReviewPopup } from '../../core/review/review.js';
import { observeElement } from '../../core/observer.js';
import { callRobloxApi } from '../../core/api.js';
import { getUserIdFromUrl } from '../../core/idExtractor.js';
import {
    fetchThumbnails as fetchThumbnailsBatch,
    createThumbnailElement,
} from '../../core/thumbnail/thumbnails.js';
import { createSquareButton } from '../../core/ui/profile/header/squarebutton.js';
import { createScrollButtons } from '../../core/ui/general/scrollButtons.js';
import { createButton } from '../../core/ui/buttons.js';
import DOMPurify from 'dompurify';
import { safeHtml } from '../../core/packages/dompurify';
import { createOverlay } from '../../core/ui/overlay.js';
import { createItemCard } from '../../core/ui/items/items.js';

export function init() {
    chrome.storage.local.get('useroutfitsEnabled', function (data) {
        if (data.useroutfitsEnabled !== true) {
            return;
        }

        ('use strict');


        async function fetchAllOutfits(userId, onChunkFetched, loadingControl) {
            let paginationToken = null;
            let hasMore = true;

            while (hasMore) {
                if (loadingControl && loadingControl.cancelled) {
                    break;
                }

                let url = `https://avatar.roblox.com/v2/avatar/users/${userId}/outfits?outfitType=1&page=1&itemsPerPage=50&isEditable=true`;
                if (paginationToken) {
                    url = `https://avatar.roblox.com/v2/avatar/users/${userId}/outfits?paginationToken=${paginationToken}&outfitType=1&page=1&itemsPerPage=50&isEditable=true`;
                }

                const response = await callRobloxApi({
                    subdomain: 'avatar',
                    endpoint: url.replace('https://avatar.roblox.com', ''),
                });
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const result = await response.json();

                if (loadingControl && loadingControl.cancelled) {
                    break;
                }

                if (onChunkFetched && result.data.length > 0) {
                    await onChunkFetched(result.data);
                }

                paginationToken = result.paginationToken;
                hasMore = !!paginationToken;
            }
        }

        async function checkCanViewInventory(userId) {
            try {
                const response = await callRobloxApi({
                    subdomain: 'inventory',
                    endpoint: `/v1/users/${userId}/can-view-inventory`,
                });

                if (!response.ok) {
                    return false;
                }

                const data = await response.json();
                return !!data.canView;
            } catch (error) {
                return false;
            }
        }

        async function fetchOutfitThumbnails(outfitIds) {
            if (outfitIds.length === 0) return new Map();

            const items = outfitIds.map((id) => ({ id }));
            return await fetchThumbnailsBatch(items, 'UserOutfit', '150x150');
        }

        function createOutfitsOverlay(
            initialOutfits,
            initialThumbnails,
            loadingControl,
            displayName,
        ) {
            let selectedOutfitId = null;
            let selectedListItem = null;
            let isFirstLoad = true;
            const outfitDetailsCache = new Map();


            const panelsWrapper = document.createElement('div');
            Object.assign(panelsWrapper.style, {
                display: 'flex',
                flexDirection: 'row',
                height: '70vh',
                width: '100%',
            });

            const mainPanel = document.createElement('div');
            Object.assign(mainPanel.style, {
                display: 'flex',
                flexDirection: 'column',
                width: '350px',
                flexShrink: '0',
                borderRight: `1px solid var(--rovalra-border-color)`,
            });
            const listContainer = document.createElement('div');
            Object.assign(listContainer.style, {
                overflowY: 'auto',
                flexGrow: '1',
                padding: '8px',
            });
            const list = document.createElement('ul');
            Object.assign(list.style, {
                listStyle: 'none',
                padding: '0',
                margin: '0',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
            });

            const detailsPanel = document.createElement('div');
            detailsPanel.className = 'rovalra-outfit-details-panel';
            Object.assign(detailsPanel.style, {
                paddingLeft: '20px',
                flexGrow: '1',
                display: 'none',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
            });
            const detailsContentWrapper = document.createElement('div');
            Object.assign(detailsContentWrapper.style, {
                padding: '20px 20px 0 20px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
            });
            const detailsImageContainer = document.createElement('div');
            Object.assign(detailsImageContainer.style, {
                width: '200px',
                height: '200px',
                maxWidth: '200px',
                maxHeight: '200px',
                position: 'relative',
                marginBottom: '0px',
                flexShrink: '0',
            });
            const detailsName = document.createElement('h3');
            Object.assign(detailsName.style, {
                fontSize: '22px',
                marginBottom: '0px',
                wordBreak: 'break-word',
                textAlign: 'center',
                color: 'var(--rovalra-main-text-color)',
            });
            const separator = document.createElement('div');
            const totalPriceElement = document.createElement('div');
            totalPriceElement.id = 'rovalra-outfit-total-price';
            Object.assign(totalPriceElement.style, {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: '0px',
                fontSize: '16px',
                fontWeight: '600',
                color: 'var(--rovalra-secondary-text-color)',
            });
            Object.assign(separator.style, {
                height: '1px',
                width: '90%',
                backgroundColor: 'var(--rovalra-border-color)',
                margin: '10px auto',
            });
            const itemsContainer = document.createElement('div');
            itemsContainer.className = 'rovalra-outfit-items-container';
            Object.assign(itemsContainer.style, {
                width: '100%',
                flexGrow: '0',
                padding: '0px 0px 20px',
                overflowY: 'hidden',
                height: '100%',
            });
            const paginationContainer = document.createElement('div');
            paginationContainer.className =
                'rovalra-outfit-pagination-container';
            Object.assign(paginationContainer.style, {
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                padding: '10px 0',
                visibility: 'hidden',
                flexShrink: '0',
            });
            detailsContentWrapper.appendChild(detailsImageContainer);
            detailsContentWrapper.appendChild(detailsName);
            detailsContentWrapper.appendChild(totalPriceElement);
            detailsPanel.appendChild(detailsContentWrapper);
            detailsPanel.appendChild(separator);

            detailsPanel.appendChild(itemsContainer);
            detailsPanel.appendChild(paginationContainer);
            const noOutfitsMessage = document.createElement('li');
            noOutfitsMessage.textContent = 'Loading outfits...';
            Object.assign(noOutfitsMessage.style, {
                padding: '20px',
                fontSize: '16px',
                textAlign: 'center',
                color: 'var(--rovalra-secondary-text-color)',
            });
            list.appendChild(noOutfitsMessage);

            const handleKeydown = (e) => {
                if (e.key === 'Escape') close();
            };

            const { close } = createOverlay({
                title: displayName ? `${displayName}'s Outfits` : 'User Outfits',
                bodyContent: panelsWrapper,
                maxWidth: '1000px',
                maxHeight: '85vh',
                showLogo: true,
                onClose: () => {
                    if (loadingControl) loadingControl.cancelled = true;
                    window.removeEventListener('keydown', handleKeydown);
                },
            });

            window.addEventListener('keydown', handleKeydown);

            let resizeObserver = null;
            const selectOutfit = async (outfit, listItem) => {
                if (selectedOutfitId === outfit.id) {
                    return;
                }

                if (selectedListItem) {
                    selectedListItem.style.backgroundColor = 'transparent';
                }

                listItem.style.backgroundColor = 'var(--rovalra-button-background-color)';
                selectedListItem = listItem;
                selectedOutfitId = outfit.id;

                if (resizeObserver) {
                    resizeObserver.disconnect();
                }

                detailsPanel.style.display = 'flex';
                detailsName.textContent = outfit.name;

                const totalPriceDisplay = document.getElementById(
                    'rovalra-outfit-total-price',
                );
                if (totalPriceDisplay) {
                    totalPriceDisplay.innerHTML = '';
                }

                while (detailsImageContainer.firstChild) {
                    detailsImageContainer.firstChild.remove();
                }

                const shimmerPlaceholder = document.createElement('div');
                shimmerPlaceholder.className = 'thumbnail-2d-container shimmer';
                Object.assign(shimmerPlaceholder.style, {
                    width: '100%',
                    height: '100%',
                    position: 'absolute',
                    borderRadius: '8px',
                    backgroundColor: 'var(--rovalra-button-background-color)',
                });
                detailsImageContainer.prepend(shimmerPlaceholder);

                const calculatePlaceholders = () => {
                    const containerWidth = itemsContainer.clientWidth;
                    const containerHeight = itemsContainer.clientHeight;
                    const itemWidth = 150;
                    const itemHeight = 220;
                    const gap = 20;

                    if (containerWidth <= 0 || containerHeight <= 0) return 8;

                    const scrollbarTolerance = 1;
                    const itemsPerRow = Math.floor(
                        (containerWidth - scrollbarTolerance + gap) /
                            (itemWidth + gap),
                    );
                    const rowsPerPage = Math.floor(
                        (containerHeight - scrollbarTolerance + gap) /
                            (itemHeight + gap),
                    );

                    return Math.max(1, itemsPerRow * rowsPerPage);
                };

                itemsContainer.innerHTML = safeHtml(`<p style="color: var(--rovalra-secondary-text-color); font-style: italic; text-align: center;">Loading items...</p>`,);
                itemsContainer.style.display = 'flex';
                itemsContainer.style.flexWrap = 'wrap';
                itemsContainer.style.justifyContent = 'center';
                itemsContainer.style.alignContent = 'flex-start';
                itemsContainer.style.gap = '20px';
                paginationContainer.style.visibility = 'hidden';

                const createItemPlaceholder = () => {
                    const itemCardContainer = document.createElement('div');
                    itemCardContainer.className = 'item-card-container';
                    Object.assign(itemCardContainer.style, {
                        width: '150px',
                        height: 'auto',
                        maxHeight: '220px',
                        display: 'flex',
                        flexDirection: 'column',
                    });

                    const thumbContainer = document.createElement('div');
                    Object.assign(thumbContainer.style, {
                        width: '150px',
                        height: '150px',
                        backgroundColor: 'var(--rovalra-button-background-color)',
                        borderRadius: '8px',
                        overflow: 'hidden',
                    });

                    const shimmerEffect = document.createElement('div');
                    shimmerEffect.className = 'thumbnail-2d-container shimmer';
                    Object.assign(shimmerEffect.style, {
                        width: '100%',
                        height: '100%',
                    });
                    thumbContainer.appendChild(shimmerEffect);

                    const namePlaceholder = document.createElement('div');
                    Object.assign(namePlaceholder.style, {
                        width: '90%',
                        height: '14px',
                        backgroundColor: 'var(--rovalra-button-background-color)',
                        marginTop: '8px',
                        borderRadius: '4px',
                    });

                    itemCardContainer.appendChild(thumbContainer);
                    itemCardContainer.appendChild(namePlaceholder);
                    return itemCardContainer;
                };

                itemsContainer.innerHTML = '';
                const placeholderCount = calculatePlaceholders();
                for (let i = 0; i < placeholderCount; i++) {
                    itemsContainer.appendChild(createItemPlaceholder());
                }

                const renderOutfitDetails = (outfitData) => {
                    if (selectedOutfitId !== outfit.id) return;

                    const {
                        largeThumbData,
                        assets,
                        thumbnailMap,
                        catalogDetailsMap,
                    } = outfitData;

                    let totalOutfitPrice = 0;
                    const processedBundleIds = new Set();
                    if (assets && catalogDetailsMap) {
                        assets.forEach((asset) => {
                            const details = catalogDetailsMap[asset.id];
                            if (
                                details &&
                                details.isPurchasable &&
                                details.priceInRobux > 0
                            ) {
                                if (details.itemType === 'Bundle') {
                                    if (!processedBundleIds.has(details.id)) {
                                        totalOutfitPrice +=
                                            details.priceInRobux;
                                        processedBundleIds.add(details.id);
                                    }
                                } else {
                                    totalOutfitPrice += details.priceInRobux;
                                }
                            }
                        });
                    }

                    const totalPriceDisplay = document.getElementById(
                        'rovalra-outfit-total-price',
                    );
                    if (totalPriceDisplay) {
                        totalPriceDisplay.innerHTML = '';
                        const robuxIcon = document.createElement('span');
                        robuxIcon.className = 'icon-robux-16x16';
                        robuxIcon.style.margin = '0 4px 0 8px';
                        totalPriceDisplay.append(
                            'Total Price:',
                            robuxIcon,
                            totalOutfitPrice.toLocaleString(),
                        );
                    }

                    if (largeThumbData) {
                        detailsImageContainer.innerHTML = '';
                        const largeThumbEl = createThumbnailElement(
                            largeThumbData,
                            outfit.name,
                            '',
                            {
                                width: '100%',
                                height: '100%',
                                borderRadius: '8px',
                                objectFit: 'cover',
                            },
                        );
                        detailsImageContainer.appendChild(largeThumbEl);
                    }

                    if (!assets || assets.length === 0) {
                        itemsContainer.innerHTML = safeHtml(
                            '<p style="font-style: italic; text-align: center;">This outfit has no items.</p>',
                        );
                        itemsContainer.style.display = 'block';
                        paginationContainer.style.visibility = 'hidden';
                        return;
                    }

                    const calculateItemsPerPage = () => {
                        const containerWidth = itemsContainer.clientWidth;
                        const containerHeight = itemsContainer.clientHeight;
                        const itemWidth = 150;
                        const itemHeight = 220;
                        const gap = 20;

                        if (containerWidth <= 0 || containerHeight <= 0) {
                            return 8;
                        }

                        const itemsPerRow = Math.floor(
                            (containerWidth + gap) / (itemWidth + gap),
                        );
                        const rowsPerPage = Math.floor(
                            (containerHeight + gap) / (itemHeight + gap),
                        );

                        return Math.max(1, itemsPerRow * rowsPerPage);
                    };

                    let currentPage = 0;
                    let itemsPerPage = calculateItemsPerPage();
                    let totalPages =
                        assets.length > 0
                            ? Math.ceil(assets.length / itemsPerPage)
                            : 0;

                    let resizeTimeout;
                    const handleResize = () => {
                        clearTimeout(resizeTimeout);
                        resizeTimeout = setTimeout(() => {
                            const newItemsPerPage = calculateItemsPerPage();
                            if (newItemsPerPage !== itemsPerPage) {
                                const firstItemIndex =
                                    currentPage * itemsPerPage;
                                itemsPerPage = newItemsPerPage;
                                totalPages =
                                    assets.length > 0
                                        ? Math.ceil(
                                              assets.length / itemsPerPage,
                                          )
                                        : 0;
                                currentPage = Math.floor(
                                    firstItemIndex / itemsPerPage,
                                );
                                renderItemsPage(currentPage);
                                updatePaginationControls();
                            }
                        }, 50);
                    };

                    resizeObserver = new ResizeObserver(handleResize);
                    resizeObserver.observe(itemsContainer);

                    const renderItemsPage = (page) => {
                        itemsContainer.innerHTML = '';
                        Object.assign(itemsContainer.style, {
                            display: 'flex',
                            flexWrap: 'wrap',
                            justifyContent: 'center',
                            alignContent: 'flex-start',
                            gap: '20px',
                        });
                        const startIndex = page * itemsPerPage;
                        const pageAssets = assets.slice(
                            startIndex,
                            startIndex + itemsPerPage,
                        );
                        pageAssets.forEach((asset) => {
                            const assetDetails = catalogDetailsMap[asset.id];
                            let priceText = '';
                            let itemRestrictions = [];

                            if (
                                assetDetails
                            ) {
                                itemRestrictions = assetDetails.itemRestrictions || [];
                                if (
                                    assetDetails.isPurchasable &&
                                    assetDetails.priceInRobux > 0
                                ) {
                                    priceText = `<span class="icon-robux-16x16" style="margin-right: 4px; vertical-align: middle;"></span>${assetDetails.priceInRobux.toLocaleString()}`;
                                } else if (!assetDetails.isPurchasable) {
                                    priceText = 'Off Sale';
                                } else {
                                    priceText = 'Free';
                                }
                            }

                            const itemData = {
                                assetId: asset.id,
                                name: asset.name,
                                itemType: assetDetails?.itemType || 'Asset',
                                priceText: priceText,
                                itemRestrictions: itemRestrictions
                            };

                            const card = createItemCard(itemData, thumbnailMap, { showSerial: false });
                            card.style.width = '150px';
                            itemsContainer.appendChild(card);
                        });
                    };

                    const updatePaginationControls = () => {
                        paginationContainer.innerHTML = '';
                        if (totalPages <= 1) {
                            paginationContainer.style.visibility = 'hidden';
                            return;
                        }

                        const { leftButton, rightButton } = createScrollButtons(
                            {
                                onLeftClick: () => {
                                    if (currentPage > 0) {
                                        currentPage--;
                                        renderItemsPage(currentPage);
                                        updatePaginationControls();
                                    }
                                },
                                onRightClick: () => {
                                    if (currentPage < totalPages - 1) {
                                        currentPage++;
                                        renderItemsPage(currentPage);
                                        updatePaginationControls();
                                    }
                                },
                            },
                        );

                        if (currentPage === 0) {
                            leftButton.classList.add('disabled');
                            leftButton.disabled = true;
                            leftButton.style.opacity = '0.5';
                        }
                        if (currentPage >= totalPages - 1) {
                            rightButton.classList.add('disabled');
                            rightButton.disabled = true;
                            rightButton.style.opacity = '0.5';
                        }

                        paginationContainer.append(leftButton, rightButton);
                        paginationContainer.style.visibility = 'visible';
                    };
                    renderItemsPage(0);
                    updatePaginationControls();
                };

                if (outfitDetailsCache.has(outfit.id)) {
                    renderOutfitDetails(outfitDetailsCache.get(outfit.id));
                } else {
                    try {
                        const largeThumbMap = await fetchThumbnailsBatch(
                            [{ id: outfit.id }],
                            'UserOutfit',
                            '420x420',
                        );
                        const largeThumbData = largeThumbMap.get(outfit.id);

                        const detailsResponse = await callRobloxApi({
                            subdomain: 'avatar',
                            endpoint: `/v1/outfits/${outfit.id}/details`,
                        });
                        if (!detailsResponse.ok)
                            throw new Error(
                                `HTTP Error: ${detailsResponse.status}`,
                            );
                        const detailsData = await detailsResponse.json();
                        const assets = detailsData.assets;

                        let thumbnailMap = new Map(),
                            catalogDetailsMap = {};
                        if (assets && assets.length > 0) {
                            const assetIds = assets.map((asset) => asset.id);

                            const fetchPromises = [];

                            fetchPromises.push(
                                (async () => {
                                    const items = assetIds.map((id) => ({
                                        id,
                                    }));
                                    thumbnailMap = await fetchThumbnailsBatch(
                                        items,
                                        'Asset',
                                        '150x150',
                                    );
                                })(),
                            );

                            const BATCH_SIZE = 50;
                            for (
                                let i = 0;
                                i < assetIds.length;
                                i += BATCH_SIZE
                            ) {
                                const batchIds = assetIds.slice(
                                    i,
                                    i + BATCH_SIZE,
                                );
                                const payload = {
                                    assets: batchIds.map((id) => ({ id })),
                                };
                                fetchPromises.push(
                                    (async () => {
                                        const catalogResponse =
                                            await callRobloxApi({
                                                subdomain: 'apis',
                                                endpoint:
                                                    '/look-api/v1/looks/purchase-details',
                                                method: 'POST',
                                                body: payload,
                                            });
                                        if (!catalogResponse.ok)
                                            throw new Error(
                                                `HTTP Error fetching catalog details: ${catalogResponse.status}`,
                                            );
                                        const catalogData =
                                            await catalogResponse.json();
                                        if (
                                            catalogData.look &&
                                            catalogData.look.items
                                        ) {
                                            catalogData.look.items.forEach(
                                                (item) => {
                                                    if (
                                                        item.itemType ===
                                                            'Bundle' &&
                                                        item.assetsInBundle
                                                    ) {
                                                        item.assetsInBundle.forEach(
                                                            (bundleAsset) => {
                                                                catalogDetailsMap[
                                                                    bundleAsset.id
                                                                ] = item;
                                                            },
                                                        );
                                                    } else {
                                                        catalogDetailsMap[
                                                            item.id
                                                        ] = item;
                                                    }
                                                },
                                            );
                                        }
                                    })(),
                                );
                            }

                            await Promise.all(fetchPromises);
                        }
                        const newOutfitData = {
                            largeThumbData,
                            assets,
                            thumbnailMap,
                            catalogDetailsMap,
                        };
                        outfitDetailsCache.set(outfit.id, newOutfitData);

                        if (selectedOutfitId !== outfit.id) return;
                        renderOutfitDetails(newOutfitData);
                    } catch (error) {
                        itemsContainer.innerHTML = DOMPurify.sanitize(
                            `<p style="color: var(--rovalra-secondary-text-color); font-style: italic; text-align: center; margin-right: auto; margin-left: auto;">Could not load items.</p>`,
                        );
                    }
                }
                if (shimmerPlaceholder.parentNode) {
                    shimmerPlaceholder.remove();
                }
            };

            const renderOutfitListItem = (outfit, thumbnails) => {
                const listItem = document.createElement('li');
                Object.assign(listItem.style, {
                    display: 'flex',
                    alignItems: 'center',
                    padding: '8px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s ease',
                });
                listItem.addEventListener('mouseenter', () => {
                    if (listItem !== selectedListItem) {
                        listItem.style.backgroundColor = 'var(--rovalra-container-background-color)';
                    }
                });
                listItem.addEventListener('mouseleave', () => {
                    if (listItem !== selectedListItem) {
                        listItem.style.backgroundColor = 'transparent';
                    }
                });
                listItem.addEventListener('click', () =>
                    selectOutfit(outfit, listItem),
                );

                const thumbnailData = thumbnails.get(outfit.id);
                const thumbnailContainer = document.createElement('div');
                Object.assign(thumbnailContainer.style, {
                    width: '60px',
                    height: '60px',
                    marginRight: '16px',
                    borderRadius: '6px',
                    flexShrink: '0',
                    backgroundColor: 'var(--rovalra-button-background-color)',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    overflow: 'hidden',
                });
                const thumbnailElement = createThumbnailElement(
                    thumbnailData,
                    outfit.name,
                    '',
                    { width: '100%', height: '100%' },
                );
                thumbnailContainer.appendChild(thumbnailElement);
                listItem.appendChild(thumbnailContainer);

                const nameSpan = document.createElement('span');
                nameSpan.textContent = outfit.name;
                Object.assign(nameSpan.style, {
                    fontSize: '16px',
                    fontWeight: '500',
                });
                listItem.appendChild(nameSpan);

                return listItem;
            };

            mainPanel.appendChild(listContainer);
            listContainer.appendChild(list);
            panelsWrapper.appendChild(mainPanel);
            panelsWrapper.appendChild(detailsPanel);

            let outfitsLoaded = false;
            return {
                addOutfits: (outfits, thumbnails) => {
                    if (!outfitsLoaded) {
                        list.innerHTML = '';
                        outfitsLoaded = true;
                    }
                    let firstListItemToSelect = null;
                    outfits.forEach((outfit, index) => {
                        const listItem = renderOutfitListItem(
                            outfit,
                            thumbnails,
                        );
                        list.appendChild(listItem);
                        if (isFirstLoad && index === 0) {
                            firstListItemToSelect = {
                                outfit,
                                element: listItem,
                            };
                        }
                    });
                    if (isFirstLoad && firstListItemToSelect) {
                        isFirstLoad = false;
                        setTimeout(
                            () =>
                                selectOutfit(
                                    firstListItemToSelect.outfit,
                                    firstListItemToSelect.element,
                                ),
                            0,
                        );
                    }
                },
                setNoOutfits: (message) => {
                    if (!outfitsLoaded) {
                        noOutfitsMessage.textContent =
                            message || 'This user has no outfits.';
                        outfitsLoaded = true;
                    }
                },
            };
        }

        function addShowOutfitsButton(element) {
            let container = null;
            let buttonStyle = null;

            const avatarToggleButton = element.classList.contains(
                'avatar-toggle-button',
            )
                ? element
                : element.querySelector('.avatar-toggle-button');

            if (avatarToggleButton) {
                container = avatarToggleButton;
                buttonStyle = 'toggle';
            }

            if (
                !container ||
                container.querySelector('.rovalra-show-outfits-btn')
            ) {
                return;
            }

            const style = window.getComputedStyle(container);
            if (style.position === 'static') {
                container.style.position = 'relative';
            }

            const clickHandler = async (event) => {
                showReviewPopup('outfits');
                const displayNameElement = document.querySelector(
                    '#profile-header-title-container-name',
                );
                const displayName = displayNameElement
                    ? displayNameElement.textContent.trim()
                    : 'User';
                const loadingControl = { cancelled: false };
                const outfitsOverlay = createOutfitsOverlay(
                    [],
                    new Map(),
                    loadingControl,
                    displayName,
                );

                try {
                    const userId = getUserIdFromUrl();
                    if (userId) {
                        let outfitsFound = false;
                        await fetchAllOutfits(
                            userId,
                            async (outfitsChunk) => {
                                if (loadingControl.cancelled) return;
                                outfitsFound = true;
                                const outfitIds = outfitsChunk.map((o) => o.id);
                                const thumbnails =
                                    await fetchOutfitThumbnails(outfitIds);
                                outfitsOverlay.addOutfits(
                                    outfitsChunk,
                                    thumbnails,
                                );
                            },
                            loadingControl,
                        );

                        if (!outfitsFound && !loadingControl.cancelled) {
                            const canView = await checkCanViewInventory(userId);
                            if (loadingControl.cancelled) return;
                            outfitsOverlay.setNoOutfits(
                                canView
                                    ? 'This user has no outfits.'
                                    : "User's inventory is private.",
                            );
                        }
                    } else {
                        alert('Could not determine the User ID from the page.');
                    }
                } catch (error) {
                    if (!loadingControl.cancelled)
                        alert('Could not fetch outfits.');
                }
            };

            let button;
            if (buttonStyle === 'square') {
                button = createSquareButton({
                    content: 'Show Outfits',
                    onClick: clickHandler,
                    width: 'auto',
                    paddingX: 'padding-x-medium',
                    disableTextTruncation: true,
                    fontSize: '16px',
                });
                Object.assign(button.style, {
                    position: 'absolute',
                    height: '48px',
                    top: '12px',
                    left: '5px',
                    zIndex: '10',
                });
            } else if (buttonStyle === 'toggle') {
                button = createSquareButton({
                    content: 'Show Outfits',
                    onClick: clickHandler,
                    width: 'auto',
                    height: 'height-1200',
                    paddingX: 'padding-x-medium',
                    disableTextTruncation: true,
                });
                button.classList.replace(
                    'text-label-medium',
                    'text-label-large',
                );
                container.style.display = 'flex';
                container.style.gap = '10px';
            } else {
                button = createButton('Show Outfits', 'secondary', {
                    onClick: clickHandler,
                });
                Object.assign(button.style, {
                    position: 'absolute',
                    bottom: '5px',
                    left: '5px',
                    zIndex: '10',
                });
            }

            button.classList.add('rovalra-show-outfits-btn');
            if (buttonStyle === 'toggle') {
                container.prepend(button);
            } else {
                container.appendChild(button);
            }
        }

        observeElement(
            '.btn-open-outfits',
            (button) => {
                button.style.display = 'none';
            },
            { multiple: true },
        );

        observeElement(
            '.avatar-toggle-button',
            addShowOutfitsButton,
            {
                multiple: true,
            },
        );
    });
}
