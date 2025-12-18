import { observeElement } from '../../core/observer.js';
import { createAssetIcon } from '../../core/ui/general/toast.js';
import { createCloseButton } from '../../core/ui/closeButton.js';
import { callRobloxApi } from '../../core/api.js';
import { fetchThumbnails as fetchThumbnailsBatch } from '../../core/thumbnail/thumbnails.js';
import { createSquareButton } from '../../core/ui/profile/header/squarebutton.js';
import { createScrollButtons } from '../../core/ui/general/scrollButtons.js';
import { createButton } from '../../core/ui/buttons.js';

export function init() {
    chrome.storage.local.get('useroutfitsEnabled', function(data) {
        if (data.useroutfitsEnabled !== true) {
            return;
        }

        'use strict';

        const isDarkMode = () => document.body.classList.contains('dark-theme');

        const getUserIdFromPageData = () => {
            const profileHeader = document.getElementById('profile-header-container');
            if (profileHeader) {
                const userId = profileHeader.getAttribute('data-profileuserid');
                if (userId) {
                    return parseInt(userId, 10);
                }
            }
            return null;
        };

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
                    endpoint: url.replace('https://avatar.roblox.com', '')
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
                    endpoint: `/v1/users/${userId}/can-view-inventory`
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
            if (outfitIds.length === 0) return {};

            const items = outfitIds.map(id => ({ id }));
            const thumbnailMap = await fetchThumbnailsBatch(items, 'UserOutfit', '150x150');

            const result = {};
            thumbnailMap.forEach((data, id) => result[id] = data);
            return result;
        }

        function createOutfitsOverlay(initialOutfits, initialThumbnails, loadingControl, displayName) {
            let selectedOutfitId = null;
            let selectedListItem = null;
            let isFirstLoad = true;
            const outfitDetailsCache = new Map();

            const isDark = document.body.classList.contains('dark-theme');
            const theme = {
                bgPrimary: isDark ? 'rgb(25, 26, 31)' : '#FFFFFF',
                bgSecondary: isDark ? '#2F353A' : '#F2F4F5',
                bgSelected: isDark ? 'rgb(58, 64, 71)' : '#E8F0FE',
                textPrimary: isDark ? '#FFFFFF' : '#191B1D',
                textSecondary: isDark ? '#b8b8b8' : '#606264',
                borderPrimary: isDark ? 'rgba(255, 255, 255, 0.1)' : '#D9DADB',
                thumbBg: isDark ? 'rgba(208, 217, 251, .12)' : '#E3E5E7',
                shadow: isDark ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 0, 0.15)'
            };

            const overlay = document.createElement('div');
            overlay.id = 'rovalra-outfits-overlay';
            Object.assign(overlay.style, {
                position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
                backgroundColor: 'rgba(0, 0, 0, 0.7)', zIndex: '10001', display: 'flex',
                justifyContent: 'center', alignItems: 'center'
            });

            const content = document.createElement('div');
            Object.assign(content.style, {
                backgroundColor: theme.bgPrimary, color: theme.textPrimary, borderRadius: '8px',
                height: '85%', width: '80%', maxWidth: '1000px', display: 'flex',
                flexDirection: 'column', boxShadow: `0 8px 30px ${theme.shadow}`, overflow: 'hidden'
            });

            const header = document.createElement('div');
            Object.assign(header.style, {
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '16px 24px', borderBottom: `1px solid ${theme.borderPrimary}`, flexShrink: '0'
            });
            const headerTitle = document.createElement('h3');
            Object.assign(headerTitle.style, { fontSize: '18px', fontWeight: '600', margin: '0' });

            const panelsWrapper = document.createElement('div');
            Object.assign(panelsWrapper.style, { display: 'flex', flexDirection: 'row', flexGrow: '1', minHeight: '0' });

            const mainPanel = document.createElement('div');
            Object.assign(mainPanel.style, {
                display: 'flex', flexDirection: 'column', width: '400px',
                flexShrink: '0', borderRight: `1px solid ${theme.borderPrimary}`
            });
            const listContainer = document.createElement('div');
            Object.assign(listContainer.style, { overflowY: 'auto', flexGrow: '1', padding: '8px' });
            const list = document.createElement('ul');
            Object.assign(list.style, {
                listStyle: 'none', padding: '0', margin: '0',
                display: 'flex', flexDirection: 'column', gap: '8px'
            });

            const detailsPanel = document.createElement('div');
            Object.assign(detailsPanel.style, {
                flexGrow: '1', backgroundColor: theme.bgPrimary, display: 'none',
                flexDirection: 'column', alignItems: 'center'
            });
            const detailsContentWrapper = document.createElement('div');
            Object.assign(detailsContentWrapper.style, { padding: '20px 20px 0 20px', display: 'flex', flexDirection: 'column', alignItems: 'center' });
            const detailsImageContainer = document.createElement('div');
            Object.assign(detailsImageContainer.style, { width: '150px', height: '150px', position: 'relative', marginBottom: '10px', flexShrink: 0 });
            const detailsImage = document.createElement('img');
            Object.assign(detailsImage.style, { width: '100%', height: '100%', borderRadius: '8px', display: 'none', objectFit: 'cover' });
            detailsImageContainer.appendChild(detailsImage);
            const detailsName = document.createElement('h3');
            Object.assign(detailsName.style, { fontSize: '22px', margin: '10px 0', wordBreak: 'break-word', textAlign: 'center', color: theme.textPrimary });
            const separator = document.createElement('div');
            const totalPriceElement = document.createElement('div');
            totalPriceElement.id = 'rovalra-outfit-total-price';
            Object.assign(totalPriceElement.style, {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: '8px',
                fontSize: '16px',
                fontWeight: '600',
                color: theme.textSecondary
            });
            Object.assign(separator.style, { height: '1px', width: '90%', backgroundColor: theme.borderPrimary, margin: '10px auto' });
            const itemsContainer = document.createElement('div');
            itemsContainer.className = 'rovalra-outfit-items-container';
            Object.assign(itemsContainer.style, { width: '100%', flexGrow: '0', padding: '0px 0px 20px', overflowY: 'auto', height: '100%'});
            const paginationContainer = document.createElement('div');
            paginationContainer.className = 'rovalra-outfit-pagination-container';
            Object.assign(paginationContainer.style, { display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '10px 0', visibility: 'hidden', flexShrink: '0'});
            detailsContentWrapper.appendChild(detailsImageContainer);
            detailsContentWrapper.appendChild(detailsName);
            detailsContentWrapper.appendChild(totalPriceElement);
            detailsPanel.appendChild(detailsContentWrapper);
            detailsPanel.appendChild(separator);

            detailsPanel.appendChild(itemsContainer);
            detailsPanel.appendChild(paginationContainer);
            const noOutfitsMessage = document.createElement('li');
            noOutfitsMessage.textContent = 'Loading outfits...';
            Object.assign(noOutfitsMessage.style, { padding: '20px', fontSize: '16px', textAlign: 'center', color: theme.textSecondary });
            list.appendChild(noOutfitsMessage);

            const closeOverlay = () => {
                if (loadingControl) loadingControl.cancelled = true;
                document.body.style.overflow = '';
                overlay.remove();
            };

            const closeButton = createCloseButton({ onClick: closeOverlay });

            const titleText = displayName ? `${displayName}'s Outfits` : "User Outfits";
            const logoIcon = createAssetIcon({
                assetName: 'rovalraIcon',
                width: '24px',
                height: '24px'
            });
            logoIcon.style.marginRight = '8px';
            headerTitle.append(logoIcon, titleText);

            header.append(headerTitle, closeButton);


            let resizeObserver = null;
            const selectOutfit = async (outfit, listItem) => {
                if (selectedOutfitId === outfit.id) {
                    return;
                }

                if (selectedListItem) {
                    selectedListItem.style.backgroundColor = 'transparent';
                }

                listItem.style.backgroundColor = theme.bgSelected;
                selectedListItem = listItem;
                selectedOutfitId = outfit.id;

                if (resizeObserver) {
                    resizeObserver.disconnect();
                }

                detailsPanel.style.display = 'flex';
                detailsName.textContent = outfit.name;

                const totalPriceDisplay = document.getElementById('rovalra-outfit-total-price');
                if (totalPriceDisplay) {
                    totalPriceDisplay.innerHTML = ''; 
                }

                while (detailsImageContainer.firstChild) { detailsImageContainer.firstChild.remove(); }
                detailsImageContainer.appendChild(detailsImage);
                detailsImage.style.display = 'none';

                const shimmerPlaceholder = document.createElement('div');
                shimmerPlaceholder.className = 'thumbnail-2d-container shimmer';
                Object.assign(shimmerPlaceholder.style, { width: '100%', height: '100%', position: 'absolute', borderRadius: '8px', backgroundColor: theme.thumbBg });
                detailsImageContainer.prepend(shimmerPlaceholder);
                
                const calculatePlaceholders = () => {
                    const containerWidth = itemsContainer.clientWidth;
                    const containerHeight = itemsContainer.clientHeight;
                    const itemWidth = 120;
                    const itemHeight = 160; 
                    const gap = 20; 

                    if (containerWidth <= 0 || containerHeight <= 0) return 8; 

                    const scrollbarTolerance = 1;
                    const itemsPerRow = Math.floor((containerWidth - scrollbarTolerance + gap) / (itemWidth + gap));
                    const rowsPerPage = Math.floor((containerHeight - scrollbarTolerance + gap) / (itemHeight + gap));

                    return Math.max(1, itemsPerRow * rowsPerPage);
                };

                itemsContainer.innerHTML = `<p style="color: ${theme.textSecondary}; font-style: italic; text-align: center;">Loading items...</p>`;
                itemsContainer.style.display = 'flex';
                itemsContainer.style.flexWrap = 'wrap';
                itemsContainer.style.justifyContent = 'center'; 
                itemsContainer.style.gap = '20px';
                paginationContainer.style.visibility = 'hidden';

                const createItemPlaceholder = () => {
                    const itemCardContainer = document.createElement('div');
                    itemCardContainer.className = 'item-card-container';
                    Object.assign(itemCardContainer.style, {
                        width: '120px', height: 'auto', maxHeight: '160px',
                        display: 'flex', flexDirection: 'column'
                    });

                    const thumbContainer = document.createElement('div');
                    Object.assign(thumbContainer.style, {
                        width: '120px', height: '120px', backgroundColor: theme.thumbBg,
                        borderRadius: '8px', overflow: 'hidden'
                    });

                    const shimmerEffect = document.createElement('div');
                    shimmerEffect.className = 'thumbnail-2d-container shimmer';
                    Object.assign(shimmerEffect.style, { width: '100%', height: '100%' });
                    thumbContainer.appendChild(shimmerEffect);

                    const namePlaceholder = document.createElement('div');
                    Object.assign(namePlaceholder.style, {
                        width: '90%', height: '14px', backgroundColor: theme.thumbBg,
                        marginTop: '8px', borderRadius: '4px'
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
                        
                        const { largeThumbData, assets, thumbnailMap, catalogDetailsMap } = outfitData;
                        
                        let totalOutfitPrice = 0;
                        const processedBundleIds = new Set();
                        if (assets && catalogDetailsMap) {
                            assets.forEach(asset => {
                                const details = catalogDetailsMap[asset.id];
                                if (details && details.isPurchasable && details.priceInRobux > 0) {
                                    if (details.itemType === 'Bundle') {
                                        if (!processedBundleIds.has(details.id)) {
                                            totalOutfitPrice += details.priceInRobux;
                                            processedBundleIds.add(details.id);
                                        }
                                    } else {
                                        totalOutfitPrice += details.priceInRobux;
                                    }
                                }
                            });
                        }

                        const totalPriceDisplay = document.getElementById('rovalra-outfit-total-price');
                        if (totalPriceDisplay) {
                            totalPriceDisplay.innerHTML = '';
                            const robuxIcon = document.createElement('span');
                            robuxIcon.className = 'icon-robux-16x16';
                            robuxIcon.style.margin = '0 4px 0 8px';
                            totalPriceDisplay.append('Total Price:', robuxIcon, totalOutfitPrice.toLocaleString());
                        }

                        if (largeThumbData) {
                            if (largeThumbData.state === 'Completed') {
                                const img = new Image();
                                img.onload = () => {
                                    setTimeout(() => {
                                        detailsImage.src = img.src;
                                        detailsImage.style.display = 'block';
                                    }, 300);
                                };
                                img.src = largeThumbData.imageUrl;
                            } else if (largeThumbData.state === 'Blocked') {
                                const blockedIcon = document.createElement('div');
                                blockedIcon.className = 'thumbnail-2d-container icon-blocked';
                                Object.assign(blockedIcon.style, { width: '100%', height: '100%', position: 'absolute', borderRadius: '8px' });
                                detailsImageContainer.prepend(blockedIcon);
                            }
                        }

                        if (!assets || assets.length === 0) {
                            itemsContainer.innerHTML = '<p style="font-style: italic; text-align: center;">This outfit has no items.</p>';
                            itemsContainer.style.display = 'block';
                            paginationContainer.style.visibility = 'hidden';
                            return;
                        }

                        const calculateItemsPerPage = () => {
                            const containerWidth = itemsContainer.clientWidth;
                            const containerHeight = itemsContainer.clientHeight;
                            const itemWidth = 120;
                            const itemHeight = 160;
                            const gap = 20;
                            
                            if (containerWidth <= 0 || containerHeight <= 0) {
                                return 8; 
                            }

                            const itemsPerRow = Math.floor((containerWidth + gap) / (itemWidth + gap));
                            const rowsPerPage = Math.floor((containerHeight + gap) / (itemHeight + gap));
                            
                            return Math.max(1, itemsPerRow * rowsPerPage);
                        };

                        let currentPage = 0;
                        let itemsPerPage = calculateItemsPerPage();
                        let totalPages = assets.length > 0 ? Math.ceil(assets.length / itemsPerPage) : 0;

                        let resizeTimeout;
                        const handleResize = () => {
                            clearTimeout(resizeTimeout);
                            resizeTimeout = setTimeout(() => {
                            const newItemsPerPage = calculateItemsPerPage();
                            if (newItemsPerPage !== itemsPerPage) {
                                const firstItemIndex = currentPage * itemsPerPage;
                                itemsPerPage = newItemsPerPage;
                                totalPages = assets.length > 0 ? Math.ceil(assets.length / itemsPerPage) : 0;
                                currentPage = Math.floor(firstItemIndex / itemsPerPage);
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
                                gap: '20px',
                            });
                            const startIndex = page * itemsPerPage;
                            const pageAssets = assets.slice(startIndex, startIndex + itemsPerPage);
                            pageAssets.forEach(asset => {
                                const itemCardContainer = document.createElement('div');
                                itemCardContainer.className = 'item-card-container';
                                Object.assign(itemCardContainer.style, {
                                    width: '120px',
                                    height: 'auto',
                                    maxHeight: '160px',
                                    display: 'flex',
                                    flexDirection: 'column'
                                });

                                const itemCardLink = document.createElement('a');
                                itemCardLink.href = `https://www.roblox.com/catalog/${asset.id}/`;
                                itemCardLink.target = '_blank';
                                itemCardLink.rel = 'noopener noreferrer';
                                Object.assign(itemCardLink.style, {
                                    textDecoration: 'none', color: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center'
                                });
                                const thumbContainer = document.createElement('div');
                                Object.assign(thumbContainer.style, {
                                    width: '120px', 
                                    height: '120px', 
                                    backgroundColor: theme.thumbBg,
                                    borderRadius: '8px',
                                    overflow: 'hidden'
                                });

                                const assetThumbnailData = thumbnailMap[asset.id];
                                let itemThumbnailElement;
                                if (assetThumbnailData && assetThumbnailData.state === 'Blocked') {
                                    itemThumbnailElement = document.createElement('div');
                                    itemThumbnailElement.className = 'thumbnail-2d-container icon-blocked';
                                    Object.assign(itemThumbnailElement.style, { width: '100%', height: '100%' });
                                } else {
                                    itemThumbnailElement = document.createElement('img');
                                    itemThumbnailElement.src = assetThumbnailData ? assetThumbnailData.imageUrl : '';
                                    Object.assign(itemThumbnailElement.style, { width: '100%', height: '100%', objectFit: 'cover' });
                                }

                                const assetDetails = catalogDetailsMap[asset.id];
                                if (assetDetails && assetDetails.itemRestrictions && assetDetails.itemRestrictions.length > 0) {
                                    const limitedIcon = document.createElement('span');
                                    limitedIcon.className = 'icon-label'; 
                                    Object.assign(limitedIcon.style, {
                                        position: 'absolute',
                                        bottom: '38px',
                                        left: '-2px',
                                        zIndex: '2'
                                    });

                                    if (assetDetails.itemRestrictions.includes('Limited')) {
                                        limitedIcon.classList.add('icon-limited-label');
                                    } else if (assetDetails.itemRestrictions.includes('Collectible')) {
                                        limitedIcon.classList.add('icon-limited-unique-label');
                                    }
                                    thumbContainer.appendChild(limitedIcon);
                                }
                                thumbContainer.appendChild(itemThumbnailElement);

                                const nameElement = document.createElement('div');
                                nameElement.textContent = asset.name;
                                Object.assign(nameElement.style, {
                                    fontSize: '16px', 
                                    fontWeight: '500', 
                                    lineHeight: '18px', 
                                    textAlign: 'left', 
                                    marginTop: '4px',
                                    width: '120px',
                                    minHeight: '36px', 
                                    maxHeight: '36px', 
                                    wordBreak: 'break-word',
                                    overflow: 'hidden' 
                                });

                                const priceElement = document.createElement('div');
                                Object.assign(priceElement.style, {
                                    display: 'flex',
                                    alignItems: 'center',
                                    width: '120px', 
                                    marginTop: '4px',
                                    fontSize: '16px',
                                    fontWeight: '600',
                                    color: theme.textSecondary
                                });

                                if (assetDetails) {
                                    if (assetDetails.isPurchasable && assetDetails.priceInRobux > 0) { 
                                        priceElement.className = 'rovalra-outfit-item-price';
                                        const robuxIcon = document.createElement('span');
                                        robuxIcon.className = 'icon-robux-16x16';
                                        robuxIcon.style.marginRight = '4px';
                                        priceElement.appendChild(robuxIcon);
                                        priceElement.appendChild(document.createTextNode(assetDetails.priceInRobux.toLocaleString()));
                                    } else if (!assetDetails.isPurchasable) {
                                        priceElement.className = 'rovalra-outfit-item-offsale';
                                        priceElement.textContent = 'Off Sale';
                                    } else {
                                        priceElement.className = 'rovalra-outfit-item-free';
                                        priceElement.textContent = 'Free';
                                    }
                                }
                                itemCardLink.appendChild(thumbContainer);
                                itemCardLink.appendChild(nameElement);
                                itemCardLink.appendChild(priceElement);
                                itemCardContainer.appendChild(itemCardLink);
                                itemsContainer.appendChild(itemCardContainer);
                            });
                        };

                        const updatePaginationControls = () => { 
                            paginationContainer.innerHTML = '';
                            if (totalPages <= 1) {
                                paginationContainer.style.visibility = 'hidden';
                                return;
                            }

                            const { leftButton, rightButton } = createScrollButtons({
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
                                }
                            });

                            if (currentPage === 0) leftButton.classList.add('disabled');
                            if (currentPage >= totalPages - 1) rightButton.classList.add('disabled');

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
                        const largeThumbMap = await fetchThumbnailsBatch([{ id: outfit.id }], 'UserOutfit', '420x420');
                        const largeThumbData = largeThumbMap.get(outfit.id);

                        const detailsResponse = await callRobloxApi({
                            subdomain: 'avatar',
                            endpoint: `/v1/outfits/${outfit.id}/details`
                        });
                        if (!detailsResponse.ok) throw new Error(`HTTP Error: ${detailsResponse.status}`);
                        const detailsData = await detailsResponse.json();
                        const assets = detailsData.assets;
                        
                        let thumbnailMap = {}, catalogDetailsMap = {};
                        if (assets && assets.length > 0) {
                            const assetIds = assets.map(asset => asset.id);

                            const fetchPromises = [];

                            fetchPromises.push((async () => {
                                const items = assetIds.map(id => ({ id }));
                                const newThumbnails = await fetchThumbnailsBatch(items, 'Asset', '150x150');
                                thumbnailMap = Array.from(newThumbnails.entries()).reduce((acc, [id, thumb]) => {
                                    acc[thumb.targetId] = thumb;
                                    return acc;
                                }, {});
                            })());

                            const BATCH_SIZE = 50;
                            for (let i = 0; i < assetIds.length; i += BATCH_SIZE) {
                                const batchIds = assetIds.slice(i, i + BATCH_SIZE);
                                const payload = { assets: batchIds.map(id => ({ id })) };
                                fetchPromises.push((async () => {
                                    const catalogResponse = await callRobloxApi({
                                        subdomain: 'apis',
                                        endpoint: '/look-api/v1/looks/purchase-details',
                                        method: 'POST',
                                        body: payload
                                    });
                                    if (!catalogResponse.ok) throw new Error(`HTTP Error fetching catalog details: ${catalogResponse.status}`);
                                    const catalogData = await catalogResponse.json();
                                    if (catalogData.look && catalogData.look.items) {
                                        catalogData.look.items.forEach(item => {
                                            if (item.itemType === 'Bundle' && item.assetsInBundle) {
                                                item.assetsInBundle.forEach(bundleAsset => {
                                                    catalogDetailsMap[bundleAsset.id] = item; 
                                                });
                                            } else {
                                                catalogDetailsMap[item.id] = item; 
                                            }
                                        });
                                    }
                                })());
                            }

                            await Promise.all(fetchPromises);
                        }
                        const newOutfitData = { largeThumbData, assets, thumbnailMap, catalogDetailsMap };
                        outfitDetailsCache.set(outfit.id, newOutfitData);

                        if (selectedOutfitId !== outfit.id) return;
                        renderOutfitDetails(newOutfitData);
                    } catch (error) {
                        itemsContainer.innerHTML = `<p style="color: ${theme.textSecondary}; font-style: italic; text-align: center; margin-right: auto; margin-left: auto;">Could not load items.</p>`;
                    }
                }
                if (shimmerPlaceholder.parentNode) {
                    shimmerPlaceholder.remove();
                }
            };

            const renderOutfitListItem = (outfit, thumbnails) => {
                const listItem = document.createElement('li');
                Object.assign(listItem.style, {
                    display: 'flex', alignItems: 'center', padding: '8px',
                    borderRadius: '6px', cursor: 'pointer', transition: 'background-color 0.2s ease'
                });
                listItem.addEventListener('mouseenter', () => {
                    if (listItem !== selectedListItem) {
                        listItem.style.backgroundColor = theme.bgSecondary;
                    }
                });
                listItem.addEventListener('mouseleave', () => {
                    if (listItem !== selectedListItem) {
                        listItem.style.backgroundColor = 'transparent';
                    }
                });
                listItem.addEventListener('click', () => selectOutfit(outfit, listItem));

                const thumbnailData = thumbnails[outfit.id];
                const thumbnailContainer = document.createElement('div');
                Object.assign(thumbnailContainer.style, {
                    width: '60px', height: '60px', marginRight: '16px', borderRadius: '6px',
                    flexShrink: '0', backgroundColor: theme.thumbBg, display: 'flex',
                    justifyContent: 'center', alignItems: 'center', overflow: 'hidden'
                });
                let thumbnailElement;
                if (thumbnailData && thumbnailData.state === 'Completed') {
                    thumbnailElement = document.createElement('img');
                    thumbnailElement.src = thumbnailData.imageUrl;
                    Object.assign(thumbnailElement.style, { width: '100%', height: '100%' });
                } else {
                    thumbnailElement = document.createElement('div');
                    thumbnailElement.className = 'thumbnail-2d-container icon-broken';
                    Object.assign(thumbnailElement.style, { width: '100%', height: '100%' });
                }
                thumbnailContainer.appendChild(thumbnailElement);
                listItem.appendChild(thumbnailContainer);

                const nameSpan = document.createElement('span');
                nameSpan.textContent = outfit.name;
                Object.assign(nameSpan.style, { fontSize: '16px', fontWeight: '500' });
                listItem.appendChild(nameSpan);

                return listItem;
            };

            mainPanel.appendChild(listContainer);
            listContainer.appendChild(list);
            panelsWrapper.appendChild(mainPanel);
            panelsWrapper.appendChild(detailsPanel);
            content.appendChild(header);
            content.appendChild(panelsWrapper);
            overlay.appendChild(content);

            document.body.style.overflow = 'hidden';
            document.body.appendChild(overlay);

            overlay.addEventListener('click', (e) => { if (e.target === overlay) closeOverlay(); });
            window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeOverlay(); });

            let outfitsLoaded = false;
            return {
                addOutfits: (outfits, thumbnails) => {
                    if (!outfitsLoaded) {
                        list.innerHTML = '';
                        outfitsLoaded = true;
                    }
                    let firstListItemToSelect = null;
                    outfits.forEach((outfit, index) => {
                        const listItem = renderOutfitListItem(outfit, thumbnails);
                        list.appendChild(listItem);
                        if (isFirstLoad && index === 0) {
                            firstListItemToSelect = { outfit, element: listItem };
                        }
                    });
                    if (isFirstLoad && firstListItemToSelect) {
                        isFirstLoad = false;
                        setTimeout(() => selectOutfit(firstListItemToSelect.outfit, firstListItemToSelect.element), 0);
                    }
                },
                setNoOutfits: (message) => {
                    if (!outfitsLoaded) {
                        noOutfitsMessage.textContent = message || 'This user has no outfits.';
                        outfitsLoaded = true;
                    }
                }
            };
        }

        function addShowOutfitsButton(element) {
            let container = null;
            let buttonStyle = null;

            const parent = element.parentElement;
            if (parent && 
                parent.classList.contains('relative') && 
                parent.querySelector('.thumbnail-holder')) {
                
                container = parent;
                buttonStyle = 'square';
            } 
            else if (element.closest('.btr-avatar-redesign-container')) {
                container = element.closest('.btr-avatar-redesign-container');
                buttonStyle = 'square';
            }
            else {
                const childHolder = element.querySelector('.thumbnail-holder');
                if (childHolder) {
                    container = childHolder;
                    buttonStyle = 'standard';
                }
            }

            if (!container || container.querySelector('.rovalra-show-outfits-btn')) {
                return;
            }

            const style = window.getComputedStyle(container);
            if (style.position === 'static') {
                container.style.position = 'relative';
            }

            const clickHandler = async (event) => {
                const displayNameElement = document.querySelector('#profile-header-title-container-name');
                const displayName = displayNameElement ? displayNameElement.textContent.trim() : 'User';
                const loadingControl = { cancelled: false };
                const outfitsOverlay = createOutfitsOverlay([], {}, loadingControl, displayName);

                try {
                    const userId = getUserIdFromPageData();
                    if (userId) {
                        let outfitsFound = false;
                        await fetchAllOutfits(userId, async (outfitsChunk) => {
                            if (loadingControl.cancelled) return;
                            outfitsFound = true;
                            const outfitIds = outfitsChunk.map(o => o.id);
                            const thumbnails = await fetchOutfitThumbnails(outfitIds);
                            outfitsOverlay.addOutfits(outfitsChunk, thumbnails);
                        }, loadingControl);

                        if (!outfitsFound && !loadingControl.cancelled) {
                            const canView = await checkCanViewInventory(userId);
                            if (loadingControl.cancelled) return;
                            outfitsOverlay.setNoOutfits(canView ? "This user has no outfits." : "User's inventory is private.");
                        }
                    } else { alert('Could not determine the User ID from the page.'); }
                } catch (error) {
                    if (!loadingControl.cancelled) alert('Could not fetch outfits.');
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
                    fontSize: '16px'
                });
                Object.assign(button.style, {
                    position: 'absolute',
                    height: '48px',
                    top: '12px',
                    left: '5px',
                    zIndex: '10'
                });
            } else {
                button = createButton('Show Outfits', 'secondary', { onClick: clickHandler });
                Object.assign(button.style, {
                    position: 'absolute',
                    bottom: '5px',
                    left: '5px',
                    zIndex: '10'
                });
            }

            button.classList.add('rovalra-show-outfits-btn');
            container.appendChild(button);
        }

        observeElement('.btn-open-outfits', (button) => {
            button.style.display = 'none';
        }, { multiple: true });

        observeElement('.profile-avatar-left', addShowOutfitsButton, {
            multiple: true
        });
    });
}