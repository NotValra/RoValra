import { observeElement } from '../../../core/observer.js';
import { createButton } from '../../../core/ui/buttons.js';
import { getAuthenticatedUserId } from '../../../core/user.js';
import { createOverlay } from '../../../core/ui/overlay.js';
import { callRobloxApi } from '../../../core/api.js';
import { fetchThumbnails, createThumbnailElement } from '../../../core/thumbnail/thumbnails.js';
import { createScrollButtons } from '../../../core/ui/general/scrollButtons.js';
import { addTooltip } from '../../../core/ui/tooltip.js';
import DOMPurify from 'dompurify';
import { showSystemAlert } from '../../../core/ui/roblox/alert.js';

async function fetchAllOutfits(userId) {
    let outfits = [];
    let paginationToken = null;
    let hasMore = true;

    while (hasMore) {
        let url = `https://avatar.roblox.com/v2/avatar/users/${userId}/outfits?outfitType=1&page=1&itemsPerPage=50&isEditable=true`;
        if (paginationToken) {
            url += `&paginationToken=${paginationToken}`;
        }

        try {
            const response = await callRobloxApi({
                subdomain: 'avatar',
                endpoint: url.replace('https://avatar.roblox.com', '')
            });
            
            if (!response.ok) break;
            
            const result = await response.json();
            if (result.data) {
                outfits = outfits.concat(result.data);
            }
            
            paginationToken = result.paginationToken;
            hasMore = !!paginationToken;
        } catch (e) {
            console.warn("Error fetching outfits", e);
            break;
        }
    }
    return outfits;
}

async function wearOutfit(outfitId) {
    const callWithRetry = async (options) => {
        let retries500 = 0;
        while (true) {
            const response = await callRobloxApi(options);
            
            if (response.ok) return response;

            if (response.status === 429) {
                await new Promise(r => setTimeout(r, 1000));
                continue;
            }

            if (response.status >= 500) {
                if (retries500 < 3) {
                    retries500++;
                    await new Promise(r => setTimeout(r, 1000));
                    continue;
                }
            }
            return response;
        }
    };

    try {
        const detailsRes = await callWithRetry({
            subdomain: 'avatar',
            endpoint: `/v1/outfits/${outfitId}/details`
        });

        if (!detailsRes.ok) return detailsRes;

        const details = await detailsRes.json();
        const promises = [];

        if (details.bodyColors) {
            promises.push(callWithRetry({
                subdomain: 'avatar',
                endpoint: '/v1/avatar/set-body-colors',
                method: 'POST',
                body: details.bodyColors
            }));
        }

        if (details.assets) {
            promises.push(callWithRetry({
                subdomain: 'avatar',
                endpoint: '/v2/avatar/set-wearing-assets',
                method: 'POST',
                body: { assets: details.assets }
            }));
        }

        if (details.playerAvatarType) {
            promises.push(callWithRetry({
                subdomain: 'avatar',
                endpoint: '/v1/avatar/set-player-avatar-type',
                method: 'POST',
                body: { playerAvatarType: details.playerAvatarType }
            }));
        }

        if (details.scale) {
            promises.push(callWithRetry({
                subdomain: 'avatar',
                endpoint: '/v1/avatar/set-scales',
                method: 'POST',
                body: details.scale
            }));
        }

        const results = await Promise.all(promises);
        return { ok: results.every(r => r.ok) };
    } catch (e) {
        console.error(e);
        return { ok: false };
    }
}

function createOutfitCard(outfit, thumbnailData, onSuccess) {
    const container = document.createElement('div');
    Object.assign(container.style, {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        width: '140px',
        height: '190px',
        cursor: 'pointer',
        padding: '8px',
        borderRadius: '8px',
        transition: 'background-color 0.2s'
    });
    


    const thumbContainer = document.createElement('div');
    Object.assign(thumbContainer.style, {
        width: '130px',
        height: '130px',
        borderRadius: '8px',
        overflow: 'hidden',
        marginBottom: '8px',
        backgroundColor: 'var(--rovalra-container-background-color)',
        position: 'relative'
    });
    
    const thumb = createThumbnailElement(thumbnailData, outfit.name, '', { width: '100%', height: '100%', objectFit: 'cover' });
    thumbContainer.appendChild(thumb);
    
    const hoverOverlay = document.createElement('div');
    Object.assign(hoverOverlay.style, {
        position: 'absolute',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        transition: 'box-shadow 0.5s ease',
        borderRadius: '8px',
        boxShadow: 'inset 0 0 0 rgba(0, 0, 0, 0)'
    });
    thumbContainer.appendChild(hoverOverlay);

    const name = document.createElement('div');
    name.textContent = outfit.name;
    Object.assign(name.style, {
        fontSize: '14px',
        textAlign: 'left',
        wordBreak: 'break-word',
        lineHeight: '1.2',
        maxHeight: '2.4em',
        overflow: 'hidden',
        color: 'var(--rovalra-main-text-color)',
        width: '100%'
    });

    container.appendChild(thumbContainer);
    container.appendChild(name);
    
    container.addEventListener('mouseenter', () => {
        hoverOverlay.style.boxShadow = 'inset 0 0 30px rgba(0, 0, 0, 0.3)';
        container.style.backgroundColor = 'var(rgba(0,0,0,0.05))';
    });
    container.addEventListener('mouseleave', () => {
        hoverOverlay.style.boxShadow = 'inset 0 0 0 rgba(0,0,0,0)';
        container.style.backgroundColor = '';
    });

    container.onclick = async () => {
        const originalText = name.textContent;
        name.textContent = "Equipping...";
        name.style.opacity = "0.7";
        
        try {
            const res = await wearOutfit(outfit.id);
            if (res.ok) {
                name.textContent = "Equipped!";
                name.style.color = "#00b06f"; 
                if (onSuccess) onSuccess();
            } else {
                name.textContent = "Failed";
                name.style.color = "#ff4444";
            }
        } catch (e) {
            name.textContent = "Error:", console.error(e);
            name.style.color = "#ff4444";
        }
        
        setTimeout(() => {
            name.textContent = originalText;
            name.style.color = "";
            name.style.opacity = "";
        }, 2000);
    };

    return container;
}

async function showQuickOutfitsOverlay() {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
        console.error("authed user id not found :C for quick outfits")
        return;
    }

    const mainContainer = document.createElement('div');
    Object.assign(mainContainer.style, {
        display: 'flex',
        flexDirection: 'column'
    });

    const gridContainer = document.createElement('div');
    Object.assign(gridContainer.style, {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px',
        justifyContent: 'center',
        padding: '10px',
        alignContent: 'flex-start',
        minHeight: '410px',
        maxWidth: '630px',
        width: '100%'
    });
    
    const paginationContainer = document.createElement('div');
    Object.assign(paginationContainer.style, {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '10px',
        gap: '15px',
        minHeight: '40px'
    });

    mainContainer.appendChild(gridContainer);
    mainContainer.appendChild(paginationContainer);

    gridContainer.innerHTML = DOMPurify.sanitize('<div style="padding: 20px;">Loading outfits...</div>');

    let resizeObserver;
    const { close } = createOverlay({
        title: 'Quick Outfits',
        bodyContent: mainContainer,
        maxWidth: 'fit-content',
        maxHeight: '60vh',
        showLogo: true,
        onClose: () => {
            if (resizeObserver) resizeObserver.disconnect();
        }
    });

    try {
        const outfits = await fetchAllOutfits(userId);
        
        if (outfits.length === 0) {
            gridContainer.innerHTML = DOMPurify.sanitize('<div style="padding: 20px;">No outfits found.</div>');
            return;
        }

        let itemsPerPage = 8;
        let currentPage = 0;
        let totalPages = Math.ceil(outfits.length / itemsPerPage);
        let thumbnailMap = new Map();
        let isFetchingThumbnails = true;

        const updatePagination = () => {
            paginationContainer.innerHTML = '';
            if (totalPages <= 1) return;

            const { leftButton, rightButton } = createScrollButtons({
                onLeftClick: () => {
                    if (currentPage > 0) {
                        currentPage--;
                        renderPage();
                    }
                },
                onRightClick: () => {
                    if (currentPage < totalPages - 1) {
                        currentPage++;
                        renderPage();
                    }
                }
            });

            if (currentPage === 0) {
                leftButton.style.opacity = '0.5';
                leftButton.style.cursor = 'default';
            }
            if (currentPage === totalPages - 1) {
                rightButton.style.opacity = '0.5';
                rightButton.style.cursor = 'default';
            }

            const pageInfo = document.createElement('span');
            pageInfo.textContent = `${currentPage + 1} / ${totalPages}`;
            pageInfo.style.color = 'var(--rovalra-secondary-text-color)';
            pageInfo.style.fontWeight = '500';

            paginationContainer.append(leftButton, pageInfo, rightButton);
        };

        const renderPage = () => {
            gridContainer.innerHTML = '';
            const start = currentPage * itemsPerPage;
            const end = start + itemsPerPage;
            const pageOutfits = outfits.slice(start, end);

            pageOutfits.forEach(outfit => {
                let thumbData = thumbnailMap.get(outfit.id);
                if (!thumbData && isFetchingThumbnails) {
                    thumbData = { state: 'Pending' };
                }
                const card = createOutfitCard(outfit, thumbData, () => {
                    close();
                    showSystemAlert("Successfully equipped outfit.");
                });
                gridContainer.appendChild(card);
            });
            
            updatePagination();
        };

        const calculateItemsPerPage = () => {
            const containerWidth = gridContainer.clientWidth;
            if (containerWidth <= 0) return 8;
            
            const cardWidth = 140;
            const gap = 8;
            const padding = 20; 
            
            const availableWidth = containerWidth - padding;
            const itemsPerRow = Math.floor((availableWidth + gap) / (cardWidth + gap));
            const rows = 2;
            
            return Math.max(1, itemsPerRow * rows);
        };

        resizeObserver = new ResizeObserver(() => {
            const newItemsPerPage = calculateItemsPerPage();
            if (newItemsPerPage !== itemsPerPage) {
                const firstVisibleItemIndex = currentPage * itemsPerPage;
                itemsPerPage = newItemsPerPage;
                totalPages = Math.ceil(outfits.length / itemsPerPage);
                currentPage = Math.floor(firstVisibleItemIndex / itemsPerPage);
                
                if (currentPage >= totalPages) currentPage = Math.max(0, totalPages - 1);
                
                renderPage();
            }
        });
        
        resizeObserver.observe(gridContainer);

        renderPage();

        const outfitIds = outfits.map(o => ({ id: o.id }));
        thumbnailMap = await fetchThumbnails(outfitIds, 'UserOutfit', '150x150');
        isFetchingThumbnails = false;
        
        renderPage();

    } catch (e) {
        console.error(e);
        gridContainer.innerHTML = DOMPurify.sanitize('<div style="padding: 20px; color: red;">Error loading outfits.</div>');
    }
}


function addQuickOutfitsButton(container) {
    if (container.querySelector('.rovalra-quick-outfits-btn-container')) {
        return;
    }

    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'rovalra-quick-outfits-btn-container';
    buttonContainer.style.marginTop = '12px';

    const button = createButton('', 'secondary', { onClick: showQuickOutfitsOverlay });
    button.style.width = '40px';
    button.style.height = '40px';
    button.style.minWidth = '40px';
    button.style.padding = '0';
    button.style.display = 'flex';
    button.style.alignItems = 'center';
    button.style.justifyContent = 'center';

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "24");
    svg.setAttribute("height", "24");
    svg.style.fill = "currentColor";
    
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M21.6 18.2 13 11.75v-.91c1.65-.49 2.8-2.17 2.43-4.05-.26-1.31-1.3-2.4-2.61-2.7C10.54 3.57 8.5 5.3 8.5 7.5h2c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5c0 .84-.69 1.52-1.53 1.5-.54-.01-.97.45-.97.99v1.76L2.4 18.2c-.77.58-.36 1.8.6 1.8h18c.96 0 1.37-1.22.6-1.8M6 18l6-4.5 6 4.5z");
    
    svg.appendChild(path);
    button.appendChild(svg);
    
    addTooltip(button, "Quick Outfits");
    
    buttonContainer.appendChild(button);

    const gameButtonsContainer = container.querySelector('.game-buttons-container');
    if (gameButtonsContainer) {
        container.insertBefore(buttonContainer, gameButtonsContainer);
    }
}

export function init() {
    chrome.storage.local.get('QuickOutfitsEnabled', (data) => {
        if (data.QuickOutfitsEnabled) {
            observeElement('.game-calls-to-action', addQuickOutfitsButton);
        }
    });
}