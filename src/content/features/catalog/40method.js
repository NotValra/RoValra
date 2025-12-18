

import { observeElement } from '../../core/observer.js';
import { callRobloxApiJson, callRobloxApi } from '../../core/api.js';
import { corsFetch } from '../../core/utils/corsProxy.js';
import { getCsrfToken } from '../../core/utils.js';
import { launchGame } from '../../core/utils/launcher.js';

import { createOverlay } from '../../core/ui/overlay.js';
import { createDropdown } from '../../core/ui/dropdown.js';
import { createScrollButtons } from '../../core/ui/general/scrollButtons.js';
import { createSpinner } from '../../core/ui/spinner.js';
import { createStyledInput } from '../../core/ui/catalog/input.js';

import { fetchThumbnails } from '../../core/thumbnail/thumbnails.js';



const DEBUG_SKIP_ROBLOX_LAUNCH = false;

const ROVALRA_PLACE_ID = '17222553211';




const isGamePassPage = () => {
    return window.location.pathname.startsWith('/game-pass/');
};


const getGamePassId = () => {
    const match = window.location.pathname.match(/\/game-pass\/(\d+)/);
    return match ? match[1] : null;
};


const getCurrentUserId = () => {
    const meta = document.querySelector('meta[name="user-data"]');
    return meta ? meta.getAttribute('data-userid') : null;
};


const getCartItems = () => {
    const cartModal = document.querySelector('.shopping-cart-modal');
    if (!cartModal) return [];
    
    const cartItems = [];
    const itemContainers = cartModal.querySelectorAll('.cart-item-container');
    
    itemContainers.forEach(container => {
        const link = container.querySelector('.item-details-container a.item-name');
        const priceText = container.querySelector('.item-price .price-text');
        
        if (link && priceText) {
            const href = link.getAttribute('href');
            const match = href.match(/\/catalog\/(\d+)\//); 
            if (match) {
                cartItems.push({
                    id: match[1],
                    name: link.textContent.trim(),
                    price: parseInt(priceText.textContent.replace(/,/g, ''), 10),
                    thumbnail: null 
                });
            }
        }
    });
    
    return cartItems;
};


const getBatchPurchaseItems = (modal) => {
    const thumbnails = modal.querySelectorAll('.modal-multi-item-image-container img');
    const items = [];
    
    thumbnails.forEach(img => {
        const alt = img.getAttribute('alt');
        if (alt) {
            items.push({
                name: alt.trim()
            });
        }
    });
    
    return items;
};


const validateCartMatch = (modalItems, cartItems) => {
    if (modalItems.length !== cartItems.length) return false;
    
    const modalNames = new Set(modalItems.map(item => item.name));
    const cartNames = new Set(cartItems.map(item => item.name));
    
    for (const name of modalNames) {
        if (!cartNames.has(name)) return false;
    }
    
    return true;
};


const checkItemOwnership = async (userId, itemId, itemType) => {
    try {
        const typeMap = {
            'Asset': 'asset',
            'Bundle': 'bundle',
            'GamePass': 'gamepass'
        };
        const type = typeMap[itemType] || 'asset';
        
        const response = await callRobloxApi({
            subdomain: 'inventory',
            endpoint: `/v1/users/${userId}/items/${type}/${itemId}/is-owned`,
            method: 'GET'
        });
        
        if (response.ok) {
            const owned = await response.json();
            return owned === true;
        }
        return false;
    } catch (error) {
        console.warn('RoValra: Could not check item ownership:', error);
        return false; 
    }
};




const detectAndAddSaveButton = () => {
    console.log("Starting to detect the purchase modal.");
    

    observeElement('.modal-dialog .modal-content[role="document"], .modal-dialog .modal-content', (modal) => {
        if (!modal.querySelector('.btn-save-robux')) {
            console.log("Purchase modal found. Adding 'Save Robux' button.");
            addSaveButton(modal);
        }
    }, { multiple: true });
};



const createAndShowPopup = (onSave) => {
    const currentUserId = getCurrentUserId();
    if (!currentUserId) {
        alert("Could not identify your user ID. Please make sure you are logged in.");
        return;
    }

    const bodyContent = document.createElement('div');
    bodyContent.innerHTML = `
        <div id="sr-view-main">
            <h4 class="text font-header-2" style="margin:0 0 12px 0;">Set Up an Experience</h4>
            <p class="text font-body" style="margin: 0 0 10px 0; line-height:1.4;">
                <strong>Any experience works</strong> even a brand new baseplate.
            </p>
            <p class="text font-body" style="margin: 0 0 8px 0;">Select a group you can manage experiences in:</p>
            <div id="sr-group-dropdown-container" style="margin-bottom: 16px;"></div>
            <div style="display:flex;align-items:center;gap:8px;margin:12px 0 8px 0;">
                <hr style="flex:1;border:none;border-top:1px solid rgba(255,255,255,0.15);" />
                <span class="text font-body" style="font-size:12px;opacity:.7;">OR</span>
                <hr style="flex:1;border:none;border-top:1px solid rgba(255,255,255,0.15);" />
            </div>
            <p class="text font-body" style="margin: 0 0 8px 0;">Manually enter a Place ID:</p>
            <div id="sr-game-id-input-container" style="width: 100%;"></div>
            <div style="display:flex;align-items:center;gap:8px;margin:12px 0 8px 0;">
                <hr style="flex:1;border:none;border-top:1px solid rgba(255,255,255,0.15);" />
                <span class="text font-body" style="font-size:12px;opacity:.7;">OR</span>
                <hr style="flex:1;border:none;border-top:1px solid rgba(255,255,255,0.15);" />
            </div>
            <button id="sr-use-rovalra-group-btn" class="btn-secondary-md btn-min-width" style="width: 100%;">Donate Saved Robux to RoValra</button>
            <p class="text font-body" style="margin:12px 0 0 0;font-size:12px;opacity:.65;">Estimated savings shown later are approximate and may be inaccurate.</p>
        </div>
        
        <div id="sr-view-non-owner-ack" class="sr-hidden">
            <h4 class="text font-header-2" style="margin: 0 0 10px 0;">Important Information</h4>
            <p class="text font-body" style="margin: 5px 0 10px 0; line-height: 1.5;"><strong>Owner Account:</strong> The group owner CANNOT be the same account you are buying items with. The owner should be a secured alt account with 2FA enabled and a strong, unique password.</p>
            <p class="text font-body" style="margin: 5px 0 10px 0; line-height: 1.5;"><strong>Payouts:</strong> Only the group's owner account can pay out the saved Robux from the group's funds.</p>
            <p class="text font-body" style="margin: 5px 0 10px 0; line-height: 1.5;"><strong>Pending Robux:</strong> Be aware that after using this feature, the Robux will be pending for approximately one month before they can be paid out.</p>
            <button class="btn-cta-md btn-min-width" id="sr-acknowledge-btn" style="width: 100%; margin-top: 10px;">I Acknowledge</button>
        </div>

        <div id="sr-view-owner-warning" class="sr-hidden">
            <h4 class="text font-header-2" style="margin: 0 0 10px 0;">Ownership Detected</h4>
            <p class="text font-body" style="margin: 5px 0 10px 0; line-height: 1.5;">The 40% method will not work if you are the owner of this group. Please select a different group or transfer ownership to a secured alt account.</p>
        </div>

        <div id="sr-view-manual-ack" class="sr-hidden">
            <h4 class="text font-header-2" style="margin: 0 0 10px 0;">Experience Accepted</h4>
            <p class="text font-body" style="margin: 5px 0 10px 0; line-height:1.5;">
                <strong>Any place works</strong> even a brand new baseplate. Make sure the experience belongs to a group <strong>you control, but is not owned by this account</strong> preferably the group should be owned by an alt, if you own the group the 40% method will not work.
            </p>
            <p class="text font-body" style="margin: 5px 0 10px 0; line-height:1.5;">
                The saved Robux will be pending for roughly one month before payout. Use a secure alt as group owner for payouts.
            </p>
            <button id="sr-manual-ack-btn" class="btn-cta-md btn-min-width" style="width:100%;">I Understand & Continue</button>
        </div>
        
        <div id="sr-view-wip" class="sr-hidden">
            <h4 class="text font-header-2" style="margin: 0 0 10px 0;">Choose Experience Setup</h4>
            <p class="text font-body" style="margin: 5px 0 16px 0; line-height: 1.5;">Select how you want to set up your experience for this group.</p>
            <button class="btn-secondary-md btn-min-width" id="sr-use-existing-game-btn" style="width: 100%; margin-bottom: 12px;">Use Existing Experiences</button>
            <button class="btn-cta-md btn-min-width" id="sr-create-new-game-btn" style="width: 100%;">Create New Experience</button>
        </div>

        <div id="sr-view-creating-game" class="sr-hidden">
            <div style="text-align: center; padding: 20px 0;">
                <div id="sr-creating-game-spinner" style="margin: 0 auto 16px;"></div>
                <h4 class="text font-header-2" style="margin: 0 0 8px 0;">Creating Your Experience</h4>
                <p class="text font-body" style="margin: 0;">Please wait while we set up your experience...</p>
            </div>
        </div>

        <div id="sr-view-existing-games" class="sr-hidden">
            <h4 class="text font-header-2" style="margin: 0 0 10px 0;">Select an Experience</h4>
            <div id="sr-loading-games" style="text-align: center; padding: 20px 0;">
                <div id="sr-loading-games-spinner" style="margin: 0 auto 16px;"></div>
                <p class="text font-body" style="margin: 0;">Loading experiences...</p>
            </div>
            <div id="sr-games-container" class="sr-hidden">
                <div style="position: relative; margin-bottom: 16px;">
                    <div id="sr-games-carousel" style="overflow: hidden;">
                        <div id="sr-games-list" style="display: flex; gap: 0px; transition: transform 0.3s ease;"></div>
                    </div>
                    <div id="sr-scroll-buttons" style="position: absolute; top: 50%; transform: translateY(-50%); width: 100%; pointer-events: none; display: flex; justify-content: space-between; padding: 0 8px;"></div>
                </div>
                <div style="text-align: center; margin-top: 8px;">
                    <span class="text font-body" id="sr-page-indicator">1 / 1</span>
                </div>
            </div>
            <div style="display: flex; gap: 8px; margin-top: 16px;">
                <button class="btn-secondary-md btn-min-width" id="sr-existing-back-btn" style="flex: 1;">Back</button>
                <button class="btn-cta-md btn-min-width" id="sr-existing-select-btn" style="flex: 1;" disabled>Select Game</button>
            </div>
        </div>

        <div id="sr-view-rovalra-group" class="sr-hidden">
            <h4 class="text font-header-2" style="margin: 0 0 10px 0;">Donate to RoValra</h4>
            <p class="text font-body" style="margin: 5px 0 10px 0; line-height: 1.5;"><strong>How it works:</strong> Your purchase will go through a game owned by RoValra, and RoValra will earn a commission on your purchase which will help support RoValra's development.</p>
            <p class="text font-body" style="margin: 5px 0 10px 0; line-height: 1.5;"><strong>No Setup Required:</strong> Perfect if you don't have your own group or want to support the extension!</p>
            <p class="text font-body" style="margin: 5px 0 10px 0; line-height: 1.5;"><strong>Requirements:</strong></p>
            <ul class="text font-body" style="margin: 0 0 10px 0; padding-left: 20px; line-height: 1.5;">
                <li>The saved Robux will go to RoValra to help fund development</li>
                <li>You still get the item you're purchasing</li>
                <li>And you will support RoValra at no extra cost for you.</li>
            </ul>
            <div style="display: flex; gap: 8px; margin-top: 16px;">
                <button class="btn-secondary-md btn-min-width" id="sr-rovalra-back-btn" style="flex: 1;">Back</button>
                <button class="btn-cta-md btn-min-width" id="sr-rovalra-confirm-btn" style="flex: 1;">I Understand & Continue</button>
            </div>
        </div>

        <div id="sr-view-permission-error" class="sr-hidden">
            <h4 class="text font-header-2" style="margin: 0 0 10px 0;">Permission Required</h4>
            <p class="text font-body" style="margin: 5px 0 12px 0; line-height: 1.5;">You don't have permission to manage experiences for this group. You need a role with creation/management rights. You can pick a different group or choose the donate option instead.</p>
            <div style="display: flex; gap: 8px;">
                <button class="btn-secondary-md btn-min-width" id="sr-permission-error-back-btn" style="flex: 1;">Back to Group Selection</button>
            </div>
        </div>
    `;

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save & Continue';
    saveBtn.className = 'btn-cta-md btn-min-width';
    saveBtn.id = 'sr-save-btn';

    const { overlay, close } = createOverlay({
        title: 'Set Up Your Game',
        bodyContent: bodyContent,
        actions: [saveBtn],
        maxWidth: '500px',
        showLogo: true
    });

    const style = document.createElement('style');
    style.textContent = '.sr-hidden { display: none !important; }';
    document.head.appendChild(style);

    const gameIdInputContainer = bodyContent.querySelector('#sr-game-id-input-container');
    const { container: gameIdInputWrapper, input: gameIdInput } = createStyledInput({
        id: 'sr-game-id-input',
        label: 'Place ID',
        placeholder: ' '
    });
    gameIdInputContainer.appendChild(gameIdInputWrapper);
    const gameIdErrorEl = document.createElement('div');
    gameIdErrorEl.id = 'sr-game-id-error';
    gameIdErrorEl.className = 'text font-body';
    gameIdErrorEl.style.cssText = 'margin-top:6px;font-size:12px;color:#d32f2f;display:none;';
    gameIdInputContainer.appendChild(gameIdErrorEl);

    const creatingGameSpinner = bodyContent.querySelector('#sr-creating-game-spinner');
    if (creatingGameSpinner) {
        creatingGameSpinner.appendChild(createSpinner({ size: '48px', color: 'currentColor' }));
    }
    
    const loadingGamesSpinner = bodyContent.querySelector('#sr-loading-games-spinner');
    if (loadingGamesSpinner) {
        loadingGamesSpinner.appendChild(createSpinner({ size: '48px', color: 'currentColor' }));
    }

    const groupDropdownContainer = bodyContent.querySelector('#sr-group-dropdown-container');
    const viewMain = bodyContent.querySelector('#sr-view-main');
    const viewNonOwnerAck = bodyContent.querySelector('#sr-view-non-owner-ack');
    const viewOwnerWarning = bodyContent.querySelector('#sr-view-owner-warning');
    const viewWIP = bodyContent.querySelector('#sr-view-wip');
    const viewCreatingGame = bodyContent.querySelector('#sr-view-creating-game');
    const viewExistingGames = bodyContent.querySelector('#sr-view-existing-games');
    const viewRoValraGroup = bodyContent.querySelector('#sr-view-rovalra-group');
    const viewPermissionError = bodyContent.querySelector('#sr-view-permission-error');
    const permissionErrorBackBtn = bodyContent.querySelector('#sr-permission-error-back-btn');
    const acknowledgeBtn = bodyContent.querySelector('#sr-acknowledge-btn');
    const useRoValraGroupBtn = bodyContent.querySelector('#sr-use-rovalra-group-btn');
    const rovalraBackBtn = bodyContent.querySelector('#sr-rovalra-back-btn');
    const rovalraConfirmBtn = bodyContent.querySelector('#sr-rovalra-confirm-btn');
    const useExistingGameBtn = bodyContent.querySelector('#sr-use-existing-game-btn');
    const createNewGameBtn = bodyContent.querySelector('#sr-create-new-game-btn');
    const existingBackBtn = bodyContent.querySelector('#sr-existing-back-btn');
    const existingSelectBtn = bodyContent.querySelector('#sr-existing-select-btn');
    const manualAckView = bodyContent.querySelector('#sr-view-manual-ack');
    const manualAckBtn = bodyContent.querySelector('#sr-manual-ack-btn');
    let manualPlaceIdCandidate = null;

    let groupDropdown = null;
    let selectedGroupId = null;
    let existingGames = [];
    let currentPage = 0;
    let selectedGameIndex = null;
    const gamesPerPage = 4;

    const handleGroupSelection = async (groupId) => {
        if (!groupId) return;

        selectedGroupId = groupId; 
        viewMain.classList.add('sr-hidden');
        saveBtn.style.display = 'none';

        try {
            const data = await callRobloxApiJson({
                subdomain: 'groups',
                endpoint: `/v1/groups/${groupId}`
            });

            if (data.owner && String(data.owner.userId) === currentUserId) {
                viewOwnerWarning.classList.remove('sr-hidden');
            } else {
                viewNonOwnerAck.classList.remove('sr-hidden');
            }
        } catch (error) {
            console.error("Failed to fetch group details:", error);
            close();
            alert("Could not check group ownership. Please try again.");
        }
    };

    const loadGroups = async () => {
        try {
            const data = await callRobloxApiJson({
                subdomain: 'apis',
                endpoint: '/creator-home-api/v1/groups'
            });
            
            const groupItems = [
                { value: '', label: '-- Please choose a group --' },
                ...data.groups.map(group => ({
                    value: String(group.id),
                    label: group.name
                }))
            ];

            groupDropdown = createDropdown({
                items: groupItems,
                initialValue: '',
                onValueChange: handleGroupSelection,
                showFlags: false
            });

            groupDropdownContainer.appendChild(groupDropdown.element);
            try {
                groupDropdown.element.style.width = '100%';
                const selectEl = groupDropdown.element.querySelector('select');
                if (selectEl) {
                    selectEl.style.height = '40px';
                    selectEl.style.borderRadius = '8px';
                    selectEl.style.padding = '0 14px';
                    selectEl.style.boxSizing = 'border-box';
                    selectEl.style.width = '100%';
                }
            } catch {}
        } catch (error) {
            console.error('RoValra: Failed to fetch groups:', error);
            groupDropdownContainer.innerHTML = '<div class="text font-body" style="color: var(--rovalra-overlay-text-secondary);">Failed to load groups. Please refresh and try again.</div>';
        }
    };
    
    acknowledgeBtn.addEventListener('click', () => {
        if (manualPlaceIdCandidate !== null) {
            const placeIdToSave = manualPlaceIdCandidate;
            manualPlaceIdCandidate = null; 
            viewNonOwnerAck.classList.add('sr-hidden');
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.set({
                    RobuxPlaceId: placeIdToSave,
                    useRoValraGroup: false
                }, async () => {
                    close();
                    await showInitialConfirmation(placeIdToSave, false);
                    onSave();
                });
            } else {
                console.error('Chrome storage API not available for manual Place ID save.');
                alert('Failed to save Place ID. Storage unavailable.');
            }
        } else {
            viewNonOwnerAck.classList.add('sr-hidden');
            viewWIP.classList.remove('sr-hidden');
        }
    });

    useExistingGameBtn.addEventListener('click', async () => {
        if (!selectedGroupId) {
            alert('No group selected. Please try again.');
            return;
        }

        viewWIP.classList.add('sr-hidden');
        viewExistingGames.classList.remove('sr-hidden');

        const loadingGames = bodyContent.querySelector('#sr-loading-games');
        const gamesContainer = bodyContent.querySelector('#sr-games-container');

        try {
            const response = await callRobloxApi({
                subdomain: 'apis',
                endpoint: `/universes/v1/search?CreatorType=Group&CreatorTargetId=${selectedGroupId}&IsArchived=false&Surface=CreatorHubCreations&PageSize=100&SortParam=LastUpdated&SortOrder=Desc`,
                method: 'GET'
            });

            if (!response.ok) {
                let errorJson = null;
                try { errorJson = await response.json(); } catch {}
                if (response.status === 401 && errorJson && errorJson.code === 'Unauthorized' && /unable to manage group/i.test(errorJson.message || '')) {
                    viewExistingGames.classList.add('sr-hidden');
                    viewPermissionError.classList.remove('sr-hidden');
                    return;
                }
                throw new Error(errorJson?.message || `Fetch games failed (${response.status})`);
            }

            const data = await response.json();
            existingGames = data.data || [];

            if (existingGames.length === 0) {
                loadingGames.innerHTML = '<p class="text font-body">No experiences found for this group.</p>';
                return;
            }

            const universeIds = existingGames.map(game => ({ id: game.id }));
            const thumbnailMap = await fetchThumbnails(universeIds, 'GameIcon', '150x150');
            
            existingGames.forEach(game => {
                const thumbnailData = thumbnailMap.get(game.id);
                game.thumbnailUrl = (thumbnailData && thumbnailData.state === 'Completed') 
                    ? thumbnailData.imageUrl 
                    : '';
            });

            loadingGames.classList.add('sr-hidden');
            gamesContainer.classList.remove('sr-hidden');
            renderGamesPage();
        } catch (error) {
            console.error('Failed to load games:', error);
            if (!viewPermissionError.classList.contains('sr-hidden')) return;
            loadingGames.innerHTML = '<p class="text font-body">Failed to load games. Please try again.</p>';
        }
    });

    const renderGamesPage = () => {
        const gamesList = bodyContent.querySelector('#sr-games-list');
        const pageIndicator = bodyContent.querySelector('#sr-page-indicator');
        const scrollButtonsContainer = bodyContent.querySelector('#sr-scroll-buttons');
        
        gamesList.innerHTML = '';
        
        const start = currentPage * gamesPerPage;
        const end = Math.min(start + gamesPerPage, existingGames.length);
        const totalPages = Math.ceil(existingGames.length / gamesPerPage);

        for (let i = start; i < end; i++) {
            const game = existingGames[i];
            const gameCard = document.createElement('div');
            gameCard.className = 'game-card';
            gameCard.style.cssText = `
                flex: 0 0 calc(25% - 9px);
                cursor: pointer;
                border: 2px solid transparent;
                border-radius: 8px;
                padding: 4px;
                transition: border-color 0.2s;
            `;

            if (selectedGameIndex === i) {
                gameCard.style.borderColor = '#00a76f';
                gameCard.style.backgroundColor = 'rgba(0, 167, 111, 0.1)';
            }

            gameCard.innerHTML = `
                <div style="width: 100px; height: 100px; background: #bdbebe; border-radius: 4px; overflow: hidden; position: relative;">
                    ${game.thumbnailUrl ? `
                        <img src="${game.thumbnailUrl}" alt="${game.name}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover;">
                    ` : ''}
                </div>
                <div class="text font-body" style="margin-top: 8px; font-weight: 600; font-size: 14px; width: 100px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis; word-break: break-word;" title="${game.name}">${game.name}</div>
                <div class="text font-body" style="font-size: 12px; opacity: 0.7; width: 100px;">ID: ${game.rootPlaceId}</div>
            `;

            gameCard.addEventListener('click', () => {
                selectedGameIndex = i;
                existingSelectBtn.disabled = false;
                renderGamesPage();
            });

            gamesList.appendChild(gameCard);
        }

        pageIndicator.textContent = `${currentPage + 1} / ${totalPages}`;

        scrollButtonsContainer.innerHTML = '';
        if (totalPages > 1) {
            const { leftButton, rightButton } = createScrollButtons({
                onLeftClick: () => {
                    if (currentPage > 0) {
                        currentPage--;
                        renderGamesPage();
                    }
                },
                onRightClick: () => {
                    if (currentPage < totalPages - 1) {
                        currentPage++;
                        renderGamesPage();
                    }
                }
            });

            leftButton.style.pointerEvents = currentPage > 0 ? 'auto' : 'none';
            leftButton.style.opacity = currentPage > 0 ? '1' : '0.3';
            leftButton.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
            leftButton.style.borderRadius = '50%';
            leftButton.style.width = '40px';
            leftButton.style.height = '40px';
            leftButton.style.display = 'flex';
            leftButton.style.alignItems = 'center';
            leftButton.style.justifyContent = 'center';
            
            rightButton.style.pointerEvents = currentPage < totalPages - 1 ? 'auto' : 'none';
            rightButton.style.opacity = currentPage < totalPages - 1 ? '1' : '0.3';
            rightButton.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
            rightButton.style.borderRadius = '50%';
            rightButton.style.width = '40px';
            rightButton.style.height = '40px';
            rightButton.style.display = 'flex';
            rightButton.style.alignItems = 'center';
            rightButton.style.justifyContent = 'center';

            scrollButtonsContainer.appendChild(leftButton);
            scrollButtonsContainer.appendChild(rightButton);
        }
    };

    existingBackBtn.addEventListener('click', () => {
        viewExistingGames.classList.add('sr-hidden');
        viewWIP.classList.remove('sr-hidden');
        currentPage = 0;
        selectedGameIndex = null;
        existingSelectBtn.disabled = true;
    });

    existingSelectBtn.addEventListener('click', async () => {
        if (selectedGameIndex === null) return;

        const selectedGame = existingGames[selectedGameIndex];
        const rootPlaceId = selectedGame.rootPlaceId;

        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({ 
                RobuxPlaceId: rootPlaceId,
                useRoValraGroup: false 
            }, async () => {
                close();
                await showInitialConfirmation(rootPlaceId, false);
                onSave();
            });
        } else {
            alert('Chrome storage API not available.');
        }
    });

    createNewGameBtn.addEventListener('click', async () => {
        if (!selectedGroupId) {
            alert('No group selected. Please try again.');
            return;
        }

        viewWIP.classList.add('sr-hidden');
        viewCreatingGame.classList.remove('sr-hidden');

        setTimeout(async () => {
            try {
                const csrfToken = await getCsrfToken();
                if (!csrfToken) {
                    throw new Error('Failed to obtain CSRF token');
                }

                const response = await callRobloxApi({
                    subdomain: 'apis',
                    endpoint: `/universes/v1/universes/create?groupId=${selectedGroupId}`,
                    method: 'POST',
                    body: {
                        templatePlaceId: 95206881,
                        isPublish: true
                    }
                });

                if (!response.ok) {
                    let errorJson = null;
                    try { errorJson = await response.json(); } catch {}
                    if (response.status === 400 && errorJson && errorJson.code === 'InvalidRequest' && /not authorized/i.test(errorJson.message || '')) {
                        viewCreatingGame.classList.add('sr-hidden');
                        viewPermissionError.classList.remove('sr-hidden');
                        return; 
                    }
                    throw new Error(errorJson?.message || `Create game failed (${response.status})`);
                }

                const data = await response.json();
                const rootPlaceId = data.rootPlaceId;

                if (!rootPlaceId) {
                    throw new Error('No rootPlaceId returned from API');
                }

                if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                    chrome.storage.local.set({ 
                        RobuxPlaceId: rootPlaceId,
                        useRoValraGroup: false 
                    }, async () => {
                        close();
                        await showInitialConfirmation(rootPlaceId, false);
                        onSave();
                    });
                } else {
                    throw new Error('Chrome storage API not available');
                }
            } catch (error) {
                console.error("Failed to create game:", error);
                if (!viewPermissionError.classList.contains('sr-hidden')) return;
                viewCreatingGame.classList.add('sr-hidden');
                viewWIP.classList.remove('sr-hidden');
                alert(`Failed to create game: ${error.message}`);
            }
        }, 0);
    });

    useRoValraGroupBtn.addEventListener('click', () => {
        viewMain.classList.add('sr-hidden');
        saveBtn.style.display = 'none';
        viewRoValraGroup.classList.remove('sr-hidden');
    });

    rovalraBackBtn.addEventListener('click', () => {
        viewRoValraGroup.classList.add('sr-hidden');
        viewMain.classList.remove('sr-hidden');
        saveBtn.style.display = '';
    });

    if (permissionErrorBackBtn) {
        permissionErrorBackBtn.addEventListener('click', () => {
            viewPermissionError.classList.add('sr-hidden');
            viewMain.classList.remove('sr-hidden');
            saveBtn.style.display = '';
            selectedGroupId = null;
            if (groupDropdown && groupDropdown.element) {
                const selectEl = groupDropdown.element.querySelector('select');
                if (selectEl) selectEl.value = '';
            }
        });
    }

    rovalraConfirmBtn.addEventListener('click', async () => {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({ 
                RobuxPlaceId: 'ROVALRA_GROUP',
                useRoValraGroup: true 
            }, async () => {
                close();
                await showInitialConfirmation('ROVALRA_GROUP', true);
                onSave();
            });
        }
    });
    
    saveBtn.addEventListener('click', async () => {
        gameIdErrorEl.style.display = 'none';
        gameIdErrorEl.textContent = '';

        const gameId = gameIdInput.value.trim();
        const parsedId = parseInt(gameId, 10);
        if (!gameId || isNaN(parsedId) || String(parsedId) !== gameId) {
            gameIdErrorEl.textContent = 'Please enter a valid numeric Experience / Place ID.';
            gameIdErrorEl.style.display = 'block';
            return;
        }

        try {
            const data = await callRobloxApiJson({
                subdomain: 'games',
                endpoint: `/v1/games/multiget-place-details?placeIds=${parsedId}`,
                method: 'GET'
            });
            if (!Array.isArray(data) || data.length === 0) {
                gameIdErrorEl.textContent = 'That Experience / Place ID does not exist. Double-check the number.';
                gameIdErrorEl.style.display = 'block';
                return;
            }
        } catch (e) {
            console.error('Failed to validate place ID:', e);
            gameIdErrorEl.textContent = 'Could not validate the ID. Please try again.';
            gameIdErrorEl.style.display = 'block';
            return;
        }

        manualPlaceIdCandidate = parsedId;
        viewMain.classList.add('sr-hidden');
        saveBtn.style.display = 'none';
        viewNonOwnerAck.classList.remove('sr-hidden');
    });

    loadGroups();
};



let joinDialogObserverInitialized = false;


const removeRobloxJoinDialog = () => {
    if (!document.getElementById('rovalra-hide-launch-dialog-style')) {
        const style = document.createElement('style');
        style.id = 'rovalra-hide-launch-dialog-style';
        style.textContent = `
            .MuiDialog-root.MuiModal-root[role="presentation"],
            .foundation-web-dialog-overlay, 
            .foundation-web-dialog-content.download-dialog { 
                display: none !important;
                opacity: 0 !important;
                pointer-events: none !important;
            }
        `;
        document.head.appendChild(style);
    }

    if (!joinDialogObserverInitialized) {
        joinDialogObserverInitialized = true;

        observeElement('.MuiDialog-root.MuiModal-root[role="presentation"]', (el) => {
            console.log('RoValra: (Observer) Removing Roblox launch dialog (old variant)');
            el.remove();
        }, { multiple: true });

        observeElement('.foundation-web-dialog-content.download-dialog', (el) => {
            console.log('RoValra: (Observer) Removing Roblox download dialog (new variant)');
            const overlay = el.closest('.foundation-web-dialog-overlay') || el;
            overlay.remove();
        }, { multiple: true });

        observeElement('.foundation-web-dialog-overlay', (el) => {
            if (el.querySelector('.download-dialog')) {
                console.log('RoValra: (Observer) Removing Roblox download overlay (new variant wrapper)');
                el.remove();
            }
        }, { multiple: true });
    }

    const intervalId = setInterval(() => {
        const oldDialog = document.querySelector('.MuiDialog-root.MuiModal-root[role="presentation"]');
        if (oldDialog) {
            console.log('RoValra: (Interval) Removing Roblox launch dialog (old variant)');
            oldDialog.remove();
        }
        const newDialogInner = document.querySelector('.foundation-web-dialog-content.download-dialog');
        if (newDialogInner) {
            console.log('RoValra: (Interval) Removing Roblox download dialog (new variant)');
            const overlay = newDialogInner.closest('.foundation-web-dialog-overlay') || newDialogInner;
            overlay.remove();
        }
    }, 50);
    setTimeout(() => clearInterval(intervalId), 5000);
};



const showSuccessNotification = (robuxSaved, gameName, isDonating = false) => {
    const bodyContent = document.createElement('div');
    bodyContent.innerHTML = `
        <div style="padding: 20px; text-align: center;">
            <div style="font-size: 48px; margin-bottom: 16px;">✓</div>
            <h3 class="text font-header-2" style="margin: 0 0 12px 0;">Purchase Successful!</h3>
            ${isDonating ? `
                <p class="text font-body" style="margin: 0 0 8px 0; font-size: 16px;">❤️ Thank you for donating to RoValra! ❤️</p>
                <p class="text font-body" style="margin: 0 0 8px 0;">Your support helps us continue developing amazing features.</p>
                <div style="margin: 0 0 16px 0; font-size: 32px; font-weight: bold; display: flex; align-items: center; justify-content: center; gap: 6px;"><span class="icon-robux-28x28"></span><span>${robuxSaved.toLocaleString()}</span></div>
                <p class="text font-body" style="margin: 0 0 12px 0;">donated to RoValra</p>
            ` : `
                <p class="text font-body" style="margin: 0 0 8px 0;">You saved approximately</p>
                <div style="margin: 0 0 16px 0; font-size: 32px; font-weight: bold; display: flex; align-items: center; justify-content: center; gap: 6px;"><span class="icon-robux-28x28"></span><span>${robuxSaved.toLocaleString()}</span></div>
            `}
            ${gameName ? `<p class="text font-body" style="margin: 0 0 12px 0;">
                Using experience: <strong>${gameName}</strong>
            </p>` : ''}
            ${!isDonating ? `<p class="text font-body" style="margin: 0;">
                The Robux will be pending in your group for approximately 1 month.
            </p>` : ''}
            <p class="text font-body" style="margin: 12px 0 0 0;">
                You can close the Roblox client now.
            </p>
        </div>
    `;

    const { overlay, close } = createOverlay({
        title: 'Purchase Successful',
        bodyContent: bodyContent,
        actions: [],
        maxWidth: '400px',
        showLogo: true
    });
};


const showFailureNotification = (errorDetails) => {
    let reason = errorDetails.errorMessage || errorDetails.purchaseResult || errorDetails.errorMsg || 'Unknown error';
    const purchased = errorDetails.purchased !== undefined ? errorDetails.purchased : 'Unknown';

    if (reason === 'NotForSale') {
        reason = `NotForSale – The item appears to be offsale or only available via resellers.
        The 40% method only works on items sold directly by the original seller (not resale listings).
        If it's a limited item being sold by resellers or temporarily offsale, this method will not work.`;
    }
    
    const bodyContent = document.createElement('div');
    bodyContent.innerHTML = `
        <div style="padding: 20px; text-align: center;">
            <div style="font-size: 48px; margin-bottom: 16px; color: #d32f2f;">✗</div>
            <h3 class="text font-header-2" style="margin: 0 0 12px 0; color: #d32f2f;">Purchase Failed</h3>
            <div style="padding: 16px; background: rgba(211, 47, 47, 0.1); border: 1px solid rgba(211, 47, 47, 0.3); border-radius: 8px; margin-bottom: 16px;">
                <p class="text font-body" style="margin: 0 0 8px 0; font-weight: 600;">Error Details:</p>
                <p class="text font-body" style="margin: 0 0 12px 0;">${reason}</p>
                <div style="display: flex; justify-content: space-between; padding-top: 12px; border-top: 1px solid rgba(211, 47, 47, 0.2);">
                    <span class="text font-body" style="font-weight: 600;">Purchased:</span>
                    <span class="text font-body" style="color: ${purchased ? '#28a745' : '#d32f2f'};">${purchased}</span>
                </div>
            </div>
            <p class="text font-body" style="margin: 0; color: #666;">
                Please try again or report it in the RoValra Discord server if the issue persists.
            </p>
        </div>
    `;

    const { overlay, close } = createOverlay({
        title: 'Purchase Failed',
        bodyContent: bodyContent,
        actions: [],
        maxWidth: '450px',
        showLogo: true
    });
};




const showInitialConfirmation = async (savedPlaceId, useRoValraGroup) => {
    const currentUserId = getCurrentUserId();
    if (!currentUserId) return false;

    let gameName = 'Unknown Experience';
    let gameThumbnailUrl = '';
    let actualPlaceId = savedPlaceId;

    if (useRoValraGroup || savedPlaceId === 'ROVALRA_GROUP') {
        actualPlaceId = ROVALRA_PLACE_ID;
        gameName = 'RoValra Group Experience';
    }
    
    try {
        const gameData = await callRobloxApiJson({
            subdomain: 'games',
            endpoint: `/v1/games/multiget-place-details?placeIds=${actualPlaceId}`,
            method: 'GET'
        });
        
        if (gameData && gameData.length > 0) {
            gameName = gameData[0].name || 'Unknown Experience';
            const universeId = gameData[0].universeId;
            
            if (universeId) {
                const thumbnailMap = await fetchThumbnails([{ id: universeId }], 'GameIcon', '150x150');
                const thumbnailData = thumbnailMap.get(universeId);
                if (thumbnailData && thumbnailData.state === 'Completed') {
                    gameThumbnailUrl = thumbnailData.imageUrl;
                }
            }
        }
    } catch (error) {
        console.warn('RoValra: Could not fetch game details:', error);
    }

    const isDonating = (useRoValraGroup || savedPlaceId === 'ROVALRA_GROUP');
    
    const confirmBody = document.createElement('div');
    confirmBody.style.cssText = 'padding: 10px 0;';
    confirmBody.innerHTML = `
        <div style="padding: 16px 0; margin-bottom: 16px; text-align: center; border-bottom: 1px solid rgb(73, 77, 90);">
            <div class="text font-body" style="margin-bottom: 4px; font-weight: 600;">${isDonating ? 'ESTIMATED COMMISSION' : 'ESTIMATED SAVINGS'}</div>
            <div class="text font-body" style="font-size: 14px; opacity: .85;">Catalog items: 40% • Game passes: 10%</div>
            ${isDonating ? '<div class="text font-body" style="margin-top: 4px;">❤️ Donating to RoValra ❤️</div>' : ''}
        </div>
        <div style="padding: 12px 0; margin-bottom: 16px; border-bottom: 1px solid rgb(73, 77, 90);">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                <span class="text font-body" style="font-weight: 600;">USING EXPERIENCE</span>
                <button id="change-game-btn" class="btn-secondary-sm text font-body" style="padding: 6px 12px;">
                    Change
                </button>
            </div>
            <div style="display: flex; gap: 12px; align-items: center;">
                ${gameThumbnailUrl ? `
                    <img src="${gameThumbnailUrl}" alt="${gameName}" style="width: 60px; height: 60px; border-radius: 4px; flex-shrink: 0;">
                ` : `
                    <div style="width: 60px; height: 60px; background: #bdbebe; border-radius: 4px; flex-shrink: 0;"></div>
                `}
                <div style="flex: 1; min-width: 0;">
                    <div class="text font-body" style="font-weight: 600; margin-bottom: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${gameName}</div>
                    <div class="text font-body" style="font-size: 12px;">Place ID: ${actualPlaceId}</div>
                    ${(useRoValraGroup || savedPlaceId === 'ROVALRA_GROUP') ? '<div class="text font-body" style="font-size: 12px;">Donating to RoValra ❤️</div>' : ''}
                </div>
            </div>
        </div>
        <div style="padding: 12px 0; margin-bottom: 16px; border-bottom: 1px solid rgb(73, 77, 90);">
            <div class="text font-body" style="font-weight: 600; margin-bottom: 8px;">HOW THIS WORKS</div>
            <ol class="text font-body" style="margin: 0; padding-left: 20px;">
                <li>Roblox will launch and join the server automatically</li>
                <li>Once you're in-game, the purchase will be completed</li>
                <li>The item goes to you, ${(useRoValraGroup || savedPlaceId === 'ROVALRA_GROUP') ? 'and RoValra will earn a commission on your purchase which will help support the extension, at no extra cost for you.' : 'but 40% of the Robux goes to your group'}</li>
                ${(useRoValraGroup || savedPlaceId === 'ROVALRA_GROUP') ? '' : '<li>Robux will be pending for ~1 month</li>'}
            </ol>
        </div>
        <div style="padding: 10px 12px; border-radius: 4px; display: flex; gap: 8px; align-items: start; background: rgba(0, 0, 0, 0.05);">
            <span style="font-size: 16px; flex-shrink: 0;">⚠️</span>
            <div class="text font-body">
                <strong>Important:</strong> Don't close Roblox until you see the success message.
            </div>
        </div>
    `;

    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = 'Got It';
    confirmBtn.className = 'btn-cta-md btn-min-width';

    const { overlay: confirmOverlay, close: closeConfirm } = createOverlay({
        title: 'Confirm 40% Method Purchase',
        bodyContent: confirmBody,
        actions: [confirmBtn],
        maxWidth: '500px',
        showLogo: true
    });

    const changeGameBtn = confirmBody.querySelector('#change-game-btn');
    changeGameBtn.addEventListener('click', () => {
        closeConfirm();
        createAndShowPopup(() => {
        });
    });

    return new Promise((resolve) => {
        confirmBtn.addEventListener('click', () => { 
            closeConfirm(); 
            resolve(true); 
        });
        const closeBtn = confirmOverlay.querySelector('.foundation-web-dialog-close-container button');
        if (closeBtn) closeBtn.addEventListener('click', () => { 
            closeConfirm(); 
            resolve(false); 
        });
    });
};



let activePurchaseContext = null;


const executeCartPurchase = async (cartItems, totalPrice) => {
    activePurchaseContext = { cancelled: false };
    const ctx = activePurchaseContext;
    const ensureNotCancelled = () => { if (ctx.cancelled) throw new Error('Purchase cancelled'); };
    const currentUserId = getCurrentUserId();
    if (!currentUserId) {
        alert("Could not identify your user ID. Please make sure you are logged in.");
        return;
    }

    try {
        const itemIds = cartItems.map(item => ({ id: parseInt(item.id) }));
        const thumbnailMap = await fetchThumbnails(itemIds, 'Asset', '150x150');
        
        cartItems.forEach(item => {
            const thumbnailData = thumbnailMap.get(parseInt(item.id));
            if (thumbnailData && thumbnailData.state === 'Completed') {
                item.thumbnail = thumbnailData.imageUrl;
            }
        });
    } catch (error) {
        console.warn('RoValra: Could not fetch cart item thumbnails:', error);
    }

    const result = await new Promise((resolve) => {
        chrome.storage.local.get(['RobuxPlaceId', 'useRoValraGroup'], resolve);
    });

    const savedPlaceId = result.RobuxPlaceId;
    const useRoValraGroup = result.useRoValraGroup === true;
    
    if (!savedPlaceId) {
        alert('No saved Place ID. Please set one up first using the "Save Robux" button.');
        return;
    }

    let gameName = 'Unknown Experience';
    let gameThumbnailUrl = '';
    let actualPlaceId = savedPlaceId;

    if (useRoValraGroup || savedPlaceId === 'ROVALRA_GROUP') {
        actualPlaceId = ROVALRA_PLACE_ID;
        gameName = 'RoValra Group Experience';
    }
    
    try {
        const gameData = await callRobloxApiJson({
            subdomain: 'games',
            endpoint: `/v1/games/multiget-place-details?placeIds=${actualPlaceId}`,
            method: 'GET'
        });
        
        if (gameData && gameData.length > 0) {
            gameName = gameData[0].name || 'Unknown Experience';
            const universeId = gameData[0].universeId;
            
            if (universeId) {
                const thumbnailMap = await fetchThumbnails([{ id: universeId }], 'GameIcon', '150x150');
                const thumbnailData = thumbnailMap.get(universeId);
                if (thumbnailData && thumbnailData.state === 'Completed') {
                    gameThumbnailUrl = thumbnailData.imageUrl;
                }
            }
        }
    } catch (error) {
        console.warn('RoValra: Could not fetch game details:', error);
    }

    let userRobux = 0;
    try {
        const balanceData = await callRobloxApiJson({
            subdomain: 'economy',
            endpoint: `/v1/users/${currentUserId}/currency`,
            method: 'GET'
        });
        userRobux = balanceData.robux || 0;
    } catch (error) {
        console.warn('Could not fetch user balance:', error);
    }
    
    ensureNotCancelled();
    
    const ownershipChecks = await Promise.all(
        cartItems.map(item => checkItemOwnership(currentUserId, item.id, 'Asset'))
    );
    
    const ownedItems = [];
    const itemsToPurchase = [];
    cartItems.forEach((item, index) => {
        if (ownershipChecks[index]) {
            ownedItems.push(item);
        } else {
            itemsToPurchase.push(item);
        }
    });
    
    if (itemsToPurchase.length === 0) {
        const errorBody = document.createElement('div');
        errorBody.innerHTML = `
            <div style="padding: 20px; text-align: center;">
                <div style="font-size: 48px; margin-bottom: 16px;">✓</div>
                <h3 class="text font-header-2" style="margin: 0 0 12px 0;">All Items Already Owned</h3>
                <p class="text font-body" style="margin: 0;">You already own all ${cartItems.length} items in your cart. No purchase needed!</p>
            </div>
        `;
        const { overlay, close } = createOverlay({
            title: 'Already Owned',
            bodyContent: errorBody,
            actions: [],
            maxWidth: '400px',
            showLogo: true
        });
        return;
    }
    
    const actualTotalPrice = itemsToPurchase.reduce((sum, item) => sum + item.price, 0);
    const robuxAfterPurchase = userRobux - actualTotalPrice;
    const isDonating = (useRoValraGroup || savedPlaceId === 'ROVALRA_GROUP');
    const totalSavings = Math.round(actualTotalPrice * 0.40);
    
    let itemsHtml = '';
    cartItems.forEach((item, index) => {
        const isOwned = ownershipChecks[index];
        itemsHtml += `
            <div style="display: flex; gap: 12px; align-items: center; padding: 8px 4px; ${isOwned ? 'opacity: 0.6;' : ''}">
                ${
                    item.thumbnail 
                    ? `<img src="${item.thumbnail}" alt="${item.name}" style="width: 60px; height: 60px; border-radius: 4px; flex-shrink: 0; object-fit: cover;">` 
                    : `<div style="width: 60px; height: 60px; background: #bdbebe; border-radius: 4px; flex-shrink: 0;"></div>`
                }
                <div style="flex: 1; min-width: 0;">
                    <div class="text font-body" style="font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-bottom: 4px;">${item.name}${isOwned ? ' <span style="color: #ffa500;">(Already Owned)</span>' : ''}</div>
                    <div class="text font-body" style="font-size: 13px; display: flex; align-items: center; gap: 4px;"><span class="icon-robux-16x16"></span>${item.price.toLocaleString()}</div>
                </div>
            </div>
        `;
    });
    
    const finalConfirmBody = document.createElement('div');
    finalConfirmBody.style.cssText = 'padding: 0;';
    finalConfirmBody.innerHTML = `
        <div style="padding: 12px 0 8px; text-align: center; border-bottom: 1px solid rgb(73, 77, 90);">
            <div class="text font-body" style="font-size: 16px; font-weight: 700;">Cart Purchase Summary</div>
            ${isDonating ? '<div class="text font-body" style="margin-top: 4px; font-size: 12px;">❤️ Donating to RoValra ❤️</div>' : ''}
        </div>
        <div style="padding: 8px 0; border-bottom: 1px solid rgb(73, 77, 90);">
            <div class="text font-body" style="font-weight: 600; margin-bottom: 6px; font-size: 13px;">PURCHASING ${itemsToPurchase.length} ITEM${itemsToPurchase.length !== 1 ? 'S' : ''}${ownedItems.length > 0 ? ` (${ownedItems.length} Already Owned)` : ''}</div>
            <div style="display: flex; flex-direction: column; gap: 4px; max-height: 180px; overflow-y: auto;">
                ${itemsHtml}
            </div>
        </div>
        <details style="border-bottom: 1px solid rgb(73, 77, 90); padding: 8px 0;">
            <summary style="cursor: pointer; list-style: none; display: flex; align-items: center; justify-content: space-between;">
                <span class="text font-body" style="font-weight: 600; font-size: 13px;">USING EXPERIENCE</span>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <button id="change-experience-btn" class="btn-secondary-sm text font-body" style="padding: 4px 10px; font-size: 12px;" onclick="event.stopPropagation();">
                        Change
                    </button>
                    <span style="font-size: 12px;">▼</span>
                </div>
            </summary>
            <div style="padding-top: 8px; display: flex; gap: 10px; align-items: center;">
                ${gameThumbnailUrl ? `
                    <img src="${gameThumbnailUrl}" alt="${gameName}" style="width: 40px; height: 40px; border-radius: 4px; flex-shrink: 0;">
                ` : `
                    <div style="width: 40px; height: 40px; background: #bdbebe; border-radius: 4px; flex-shrink: 0;"></div>
                `}
                <div style="flex: 1; min-width: 0;">
                    <div class="text font-body" style="font-weight: 600; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${gameName}</div>
                    <div class="text font-body" style="font-size: 11px; opacity: 0.7;">Place ID: ${actualPlaceId}</div>
                    ${isDonating ? '<div class="text font-body" style="font-size: 11px; opacity: 0.7;">Donating to RoValra ❤️</div>' : ''}
                </div>
            </div>
        </details>
        <div style="padding: 8px 0;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                <span class="text font-body" style="font-size: 13px;">Total:</span>
                <span class="text font-body" style="font-weight: 600; display: flex; align-items: center; gap: 4px;"><span class="icon-robux-16x16"></span>${actualTotalPrice.toLocaleString()}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                <span class="text font-body" style="font-size: 13px;">Balance:</span>
                <span class="text font-body" style="display: flex; align-items: center; gap: 4px;"><span class="icon-robux-16x16"></span>${userRobux.toLocaleString()}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid rgb(73, 77, 90);">
                <span class="text font-body" style="font-size: 13px;">After:</span>
                <span class="text font-body" style="font-weight: 600; ${robuxAfterPurchase < 0 ? 'color: #d32f2f;' : ''} display: flex; align-items: center; gap: 4px;"><span class="icon-robux-16x16"></span>${robuxAfterPurchase.toLocaleString()}</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 8px; background: rgba(0,128,0,0.05); border-radius: 4px;">
                <span class="text font-body" style="font-weight: 600; font-size: 13px;">${isDonating ? 'Commission:' : 'You Save:'}</span>
                <span class="text font-body" style="font-size: 18px; font-weight: 700; display: flex; align-items: center; gap: 4px;"><span class="icon-robux-16x16"></span>${totalSavings.toLocaleString()}</span>
            </div>
        </div>
        ${robuxAfterPurchase < 0 ? '<div style="padding: 8px; border-radius: 4px; background: rgba(211, 47, 47, 0.1); margin-bottom: 8px; border: 1px solid rgba(211, 47, 47, 0.3);"><span class="text font-body" style="color: #d32f2f; font-weight: 600; font-size: 13px;">⚠️ Insufficient Balance</span></div>' : ''}
    `;

    const finalConfirmBtn = document.createElement('button');
    finalConfirmBtn.textContent = 'Confirm Cart Purchase';
    finalConfirmBtn.className = 'btn-cta-md btn-min-width';
    finalConfirmBtn.disabled = robuxAfterPurchase < 0;

    const finalCancelBtn = document.createElement('button');
    finalCancelBtn.textContent = 'Cancel';
    finalCancelBtn.className = 'btn-secondary-md btn-min-width';

    const { overlay: finalConfirmOverlay, close: origCloseFinalConfirm } = createOverlay({
        title: 'Confirm Cart Purchase',
        bodyContent: finalConfirmBody,
        actions: [finalCancelBtn, finalConfirmBtn],
        maxWidth: '500px',
        showLogo: true
    });

    const closeFinalConfirm = () => {
        if (!ctx.cancelled) ctx.cancelled = true;
        origCloseFinalConfirm();
    };

    const changeExperienceBtn = finalConfirmBody.querySelector('#change-experience-btn');
    if (changeExperienceBtn) {
        changeExperienceBtn.addEventListener('click', () => {
            closeFinalConfirm();
            createAndShowPopup(() => {
                executeCartPurchase(cartItems, totalPrice);
            });
        });
    }

    const finalConfirmed = await new Promise((resolve) => {
        let settled = false;
        const finish = (val) => { if (!settled) { settled = true; resolve(val); } };
        finalConfirmBtn.addEventListener('click', () => { if (ctx.cancelled) return finish(false); ctx.cancelled = false; origCloseFinalConfirm(); finish(true); });
        finalCancelBtn.addEventListener('click', () => { ctx.cancelled = true; origCloseFinalConfirm(); finish(false); });
        const closeBtn = finalConfirmOverlay.querySelector('.foundation-web-dialog-close-container button');
        if (closeBtn) closeBtn.addEventListener('click', () => { ctx.cancelled = true; finish(false); });
    });

    if (!finalConfirmed || ctx.cancelled) {
        return;
    }

    const bodyContent = document.createElement('div');
    bodyContent.innerHTML = `
        <div style="padding: 20px; text-align: center;">
            <div id="progress-spinner" style="margin: 0 auto 16px;"></div>
            <h3 id="progress-title" class="text font-header-2" style="margin: 0 0 8px 0;">Processing Cart</h3>
            <p id="progress-text" class="text font-body" style="margin: 0;">Initializing...</p>
            <div id="progress-items" style="margin-top: 16px; text-align: left;"></div>
        </div>
    `;

    const progressSpinnerContainer = bodyContent.querySelector('#progress-spinner');
    if (progressSpinnerContainer) {
        progressSpinnerContainer.appendChild(createSpinner({ size: '48px', color: 'currentColor' }));
    }

    const { overlay, close: origCloseProcessing } = createOverlay({
        title: 'Cart Purchase - Processing',
        bodyContent: bodyContent,
        actions: [],
        maxWidth: '450px',
        showLogo: true,
        preventBackdropClose: true
    });

    const closeProcessing = () => {
        if (!ctx.cancelled) ctx.cancelled = true;
        origCloseProcessing();
    };

    const closeBtn = overlay.querySelector('.foundation-web-dialog-close-container button');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            ctx.cancelled = true;
            closeProcessing();
        });
    }

    const progressTitle = bodyContent.querySelector('#progress-title');
    const progressText = bodyContent.querySelector('#progress-text');
    const progressItems = bodyContent.querySelector('#progress-items');

    progressTitle.textContent = 'Setting Up Game Session';
    progressText.textContent = 'Creating server instance...';
    
    const placeIdToUse = (useRoValraGroup || savedPlaceId === 'ROVALRA_GROUP') ? actualPlaceId : savedPlaceId;
    
    let results = [];
    
    try {
        const gameData = await callRobloxApiJson({
            subdomain: 'games',
            endpoint: `/v1/games/multiget-place-details?placeIds=${placeIdToUse}`,
            method: 'GET'
        });
        if (!gameData || gameData.length === 0 || !gameData[0].universeId) {
            throw new Error('Failed to fetch Universe ID');
        }
        const universeId = gameData[0].universeId;
        
        let serverInstanceId = null;
        while (!serverInstanceId) {
            const joinGameResponse = await callRobloxApiJson({
                subdomain: 'gamejoin',
                endpoint: '/v1/join-game',
                method: 'POST',
                body: {
                    placeId: parseInt(placeIdToUse, 10),
                    gameJoinAttemptId: crypto.randomUUID()
                }
            });
            if (joinGameResponse && joinGameResponse.joinScript && joinGameResponse.jobId) {
                serverInstanceId = joinGameResponse.jobId;
                console.log('RoValra: Created server instance:', serverInstanceId);
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        progressTitle.textContent = 'Launching Roblox';
        progressText.textContent = 'Starting Roblox client...';
        if (DEBUG_SKIP_ROBLOX_LAUNCH) {
            console.log('RoValra: DEBUG MODE - Skipping Roblox launch');
        } else {
            launchGame(placeIdToUse, serverInstanceId);
            removeRobloxJoinDialog();
        }
        
        progressTitle.textContent = 'Waiting for Game';
        progressText.textContent = 'Please wait while Roblox loads...';
        await new Promise((resolve, reject) => {
            let inGameDetected = false;
            const checkCancel = () => { if (ctx.cancelled && !inGameDetected) { cleanup(); reject(new Error('Purchase cancelled')); } };
            const cleanup = () => clearInterval(pollInterval);

            const pollInterval = setInterval(async () => {
                if (inGameDetected) return;
                if (ctx.cancelled) { checkCancel(); return; }
                
                try {
                    const presenceData = await callRobloxApiJson({
                        subdomain: 'presence',
                        endpoint: '/v1/presence/users',
                        method: 'POST',
                        body: { userIds: [parseInt(currentUserId)] }
                    });
                    if (presenceData.userPresences && presenceData.userPresences.length > 0) {
                        const presence = presenceData.userPresences[0];
                        const userRootPlaceId = presence.rootPlaceId;
                        if (userRootPlaceId && userRootPlaceId.toString() === placeIdToUse.toString()) {
                            console.log('RoValra: User is in the correct game, proceeding with purchases');
                            inGameDetected = true;
                            cleanup();
                            resolve();
                        }
                    }
                } catch (pollError) {
                    console.error('RoValra: Error checking user presence:', pollError);
                }
            }, 1000);

            overlay.addEventListener('remove', () => { if (!inGameDetected) { ctx.cancelled = true; checkCancel(); } });
        });
        
        const sharedSession = { serverInstanceId, placeIdToUse, universeId };

        for (let i = 0; i < itemsToPurchase.length; i++) {
            if (ctx.cancelled) {
                console.log('RoValra: Cart purchase cancelled by user');
                break;
            }
            
            const item = itemsToPurchase[i];
            progressTitle.textContent = `Processing Item ${i + 1} of ${itemsToPurchase.length}`;
            progressText.textContent = item.name;
            
            try {
                await execute40MethodPurchase(item.id, item.price, false, false, { name: item.name, thumbnail: item.thumbnail }, true, sharedSession);
                results.push({ item: item.name, success: true });
                
                progressItems.innerHTML += `<div class="text font-body" style="padding: 4px 0; color: #28a745;">✓ ${item.name}</div>`;
            } catch (error) {
                const errorMsg = error.message === 'Purchase cancelled' ? 'Cancelled' : error.message;
                results.push({ item: item.name, success: false, error: errorMsg });
                progressItems.innerHTML += `<div class="text font-body" style="padding: 4px 0; color: #d32f2f;">✗ ${item.name} - ${errorMsg}</div>`;
            }
        }
    } catch (error) {
        closeProcessing();
        console.error('RoValra: Cart purchase session setup failed:', error);
        const errorBody = document.createElement('div');
        errorBody.innerHTML = `
            <div style="padding: 20px; text-align: center;">
                <div style="font-size: 48px; margin-bottom: 16px; color: #d32f2f;">✗</div>
                <h3 class="text font-header-2" style="margin: 0 0 12px 0; color: #d32f2f;">Setup Failed</h3>
                <p class="text font-body" style="margin: 0;">Failed to set up game session. Please try again.</p>
            </div>
        `;
        createOverlay({
            title: 'Error',
            bodyContent: errorBody,
            actions: [],
            maxWidth: '400px',
            showLogo: true
        });
        return;
    }
    
    closeProcessing();    
    const successCount = results.filter(r => r.success).length;
    const failCount = results.length - successCount;
    
    const resultsBody = document.createElement('div');
    resultsBody.innerHTML = `
        <div style="padding: 20px; text-align: center;">
            <div style="font-size: 48px; margin-bottom: 16px;">${failCount === 0 ? '✓' : '⚠️'}</div>
            <h3 class="text font-header-2" style="margin: 0 0 12px 0;">Cart Purchase ${failCount === 0 ? 'Complete' : 'Partially Complete'}</h3>
            <p class="text font-body" style="margin: 0 0 12px 0;">${successCount} of ${itemsToPurchase.length} items purchased successfully</p>
            ${ownedItems.length > 0 ? `<p class="text font-body" style="margin: 0 0 12px 0; opacity: 0.7;">${ownedItems.length} item${ownedItems.length !== 1 ? 's' : ''} skipped (already owned)</p>` : ''}
            ${failCount > 0 ? `<p class="text font-body" style="margin: 0 0 12px 0; color: #d32f2f;">${failCount} items failed</p>` : ''}
            <div style="margin: 16px 0; font-size: 28px; font-weight: bold; display: flex; align-items: center; justify-content: center; gap: 6px;">
                <span class="icon-robux-28x28"></span><span>~${totalSavings.toLocaleString()}</span>
            </div>
            <p class="text font-body" style="margin: 0;">${isDonating ? 'donated to RoValra' : 'saved (approximate)'}</p>
        </div>
    `;

    const { overlay: resultsOverlay, close: closeResults } = createOverlay({
        title: 'Purchase Complete',
        bodyContent: resultsBody,
        actions: [],
        maxWidth: '400px',
        showLogo: true
    });
};


const execute40MethodPurchase = async (itemId, robuxPrice, isGamePass = false, isBundle = false, itemDetails = null, isCartItem = false, sharedSession = null) => {
    if (!isCartItem) {
        activePurchaseContext = { cancelled: false };
    }
    const ctx = activePurchaseContext || { cancelled: false };
    const ensureNotCancelled = () => { if (ctx.cancelled) throw new Error('Purchase cancelled'); };
    const currentUserId = getCurrentUserId();
    if (!currentUserId) {
        alert("Could not identify your user ID. Please make sure you are logged in.");
        return;
    }

    const result = await new Promise((resolve) => {
        chrome.storage.local.get(['RobuxPlaceId', 'useRoValraGroup'], resolve);
    });

    const savedPlaceId = result.RobuxPlaceId;
    const useRoValraGroup = result.useRoValraGroup === true;
    
    if (!savedPlaceId) {
        alert('No saved Place ID. Please set one up first using the "Save Robux" button.');
        return;
    }

    
    let itemName = itemDetails?.name || 'Unknown Item';
    let itemThumbnail = itemDetails?.thumbnail || '';
    
    if (!itemDetails && itemId) {
        try {
            const catalogData = await callRobloxApiJson({
                subdomain: 'catalog',
                endpoint: '/v1/catalog/items/details',
                method: 'POST',
                body: {
                    items: [{ id: parseInt(itemId), itemType: isBundle ? 'Bundle' : 'Asset' }]
                }
            });
            
            if (catalogData.data && catalogData.data.length > 0) {
                const item = catalogData.data[0];
                itemName = item.name || 'Unknown Item';
                
                const itemIdForThumbnail = item.collectibleItemId || itemId;
                const thumbnailMap = await fetchThumbnails(
                    [{ id: parseInt(itemIdForThumbnail) }], 
                    'Asset', 
                    '150x150'
                );
                const thumbnailData = thumbnailMap.get(parseInt(itemIdForThumbnail));
                if (thumbnailData && thumbnailData.state === 'Completed') {
                    itemThumbnail = thumbnailData.imageUrl;
                }
            }
        } catch (error) {
            console.warn('RoValra: Could not fetch item details:', error);
        }
    }

    let gameName = 'Unknown Experience';
    let gameThumbnailUrl = '';
    let actualPlaceId = savedPlaceId;

    if (useRoValraGroup || savedPlaceId === 'ROVALRA_GROUP') {
        actualPlaceId = ROVALRA_PLACE_ID;
        gameName = 'RoValra Group Experience';
    }
    
    try {
        const gameData = await callRobloxApiJson({
            subdomain: 'games',
            endpoint: `/v1/games/multiget-place-details?placeIds=${actualPlaceId}`,
            method: 'GET'
        });
        
        if (gameData && gameData.length > 0) {
            gameName = gameData[0].name || 'Unknown Experience';
            const universeId = gameData[0].universeId;
            
            if (universeId) {
                const thumbnailMap = await fetchThumbnails([{ id: universeId }], 'GameIcon', '150x150');
                const thumbnailData = thumbnailMap.get(universeId);
                if (thumbnailData && thumbnailData.state === 'Completed') {
                    gameThumbnailUrl = thumbnailData.imageUrl;
                }
            }
        }
    } catch (error) {
        console.warn('RoValra: Could not fetch game details:', error);
    }
    

    ensureNotCancelled();
    
    let userRobux = 0;
    try {
        const balanceData = await callRobloxApiJson({
            subdomain: 'economy',
            endpoint: `/v1/users/${currentUserId}/currency`,
            method: 'GET'
        });
        userRobux = balanceData.robux || 0;
    } catch (error) {
        console.warn('Could not fetch user balance:', error);
    }
    
    ensureNotCancelled();
    const robuxAfterPurchase = userRobux - robuxPrice;
    const isDonating = (useRoValraGroup || savedPlaceId === 'ROVALRA_GROUP');
    const savingsPercentage = isGamePass ? 0.10 : 0.40;
    const robuxSaved = Math.round(robuxPrice * savingsPercentage);
    
    const itemType = isGamePass ? 'GamePass' : (isBundle ? 'Bundle' : 'Asset');
    const alreadyOwned = await checkItemOwnership(currentUserId, itemId, itemType);
    
    if (alreadyOwned && !isCartItem) {
        const ownedBody = document.createElement('div');
        ownedBody.innerHTML = `
            <div style="padding: 20px; text-align: center;">
                <div style="font-size: 48px; margin-bottom: 16px;">✓</div>
                <h3 class="text font-header-2" style="margin: 0 0 12px 0;">Already Owned</h3>
                <p class="text font-body" style="margin: 0 0 12px 0;">You already own this ${isGamePass ? 'game pass' : (isBundle ? 'bundle' : 'item')}:</p>
                <p class="text font-body" style="margin: 0; font-weight: 600;">${itemName}</p>
                <p class="text font-body" style="margin: 12px 0 0 0; opacity: 0.7;">No purchase needed!</p>
            </div>
        `;
        const { overlay, close } = createOverlay({
            title: 'Already Owned',
            bodyContent: ownedBody,
            actions: [],
            maxWidth: '400px',
            showLogo: true
        });
        return;
    }
    
    if (isCartItem && sharedSession) {
        const { serverInstanceId, placeIdToUse, universeId } = sharedSession;
        
        let collectibleItemId = null;
        let collectibleProductId = null;
        let gamePassProductId = null;
        
        if (isGamePass) {
            const gamePassData = await callRobloxApiJson({
                subdomain: 'apis',
                endpoint: `/game-passes/v1/game-passes/${itemId}/product-info`,
                method: 'GET'
            });
            if (!gamePassData || !gamePassData.ProductId) {
                throw new Error('Game pass not found');
            }
            gamePassProductId = gamePassData.ProductId;
        } else {
            const catalogData = await callRobloxApiJson({
                subdomain: 'catalog',
                endpoint: '/v1/catalog/items/details',
                method: 'POST',
                body: {
                    items: [{ id: parseInt(itemId), itemType: isBundle ? 'Bundle' : 'Asset' }]
                }
            });
            if (!catalogData.data || catalogData.data.length === 0) {
                throw new Error('Item not found in catalog');
            }
            const itemData = catalogData.data[0];
            collectibleItemId = itemData.collectibleItemId;
            if (!collectibleItemId) {
                throw new Error('This item is not a collectible');
            }
            const marketplaceData = await callRobloxApiJson({
                subdomain: 'apis',
                endpoint: '/marketplace-items/v1/items/details',
                method: 'POST',
                body: {
                    itemIds: [collectibleItemId]
                }
            });
            if (!marketplaceData || marketplaceData.length === 0) {
                throw new Error('Collectible product not found');
            }
            collectibleProductId = marketplaceData[0].collectibleProductId;
        }
        
        const csrfToken = await getCsrfToken();
        if (!csrfToken) {
            throw new Error('Failed to obtain CSRF token');
        }

        let requestBody, headers, purchaseUrl;
        
        if (isGamePass) {
            requestBody = {
                expectedCurrency: 1,
                expectedPrice: parseInt(robuxPrice),
                expectedSellerId: 0,
                expectedPromoId: 0,
                userAssetId: 0,
                saleLocationType: 'Game',
                saleLocationId: parseInt(placeIdToUse)
            };
            headers = {
                'Content-Type': 'application/json',
                'User-Agent': 'Roblox/WinInetRobloxApp/0.698.0.6980936 (GlobalDist; RobloxDirectDownload)',
                'X-CSRF-TOKEN': csrfToken,
                'Requester': 'Client',
                'Roblox-Game-Id': serverInstanceId,
                'Roblox-Place-Id': placeIdToUse.toString(),
                'Roblox-Universe-Id': universeId.toString()
            };
            purchaseUrl = `https://apis.roblox.com/game-passes/v1/game-passes/${gamePassProductId}/purchase`;
        } else {
            requestBody = {
                expectedCurrency: 1,
                expectedPrice: parseInt(robuxPrice),
                expectedPurchaserId: parseInt(currentUserId),
                expectedPurchaserType: 'User',
                collectibleProductId: collectibleProductId,
                idempotencyKey: crypto.randomUUID(),
                purchaseAuthToken: ''
            };
            headers = {
                'Content-Type': 'application/json',
                'User-Agent': 'Roblox/WinInetRobloxApp/0.698.0.6980936 (GlobalDist; RobloxDirectDownload)',
                'X-CSRF-TOKEN': csrfToken,
                'Requester': 'Client',
                'Roblox-Game-Id': serverInstanceId,
                'Roblox-Place-Id': placeIdToUse.toString(),
                'Roblox-Universe-Id': universeId.toString()
            };
            purchaseUrl = `https://apis.roblox.com/marketplace-sales/v1/item/${collectibleItemId}/purchase-item`;
        }

        const response = await corsFetch(purchaseUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(requestBody),
            credentials: 'include'
        });

        const responseData = await response.json();
        console.log('Purchase Response:', responseData);
        
        const isSuccess = isGamePass 
            ? (responseData.purchased === true && responseData.reason === "Success")
            : (responseData.purchaseResult === "Purchase transaction success" && responseData.purchased === true);
        
        if (!isSuccess) {
            throw new Error(JSON.stringify({
                message: 'Purchase failed',
                purchaseResult: responseData.purchaseResult,
                purchased: responseData.purchased,
                errorMessage: responseData.errorMessage,
                errorMsg: responseData.errorMsg
            }));
        }
        
        return;
    }
    
    if (!isCartItem) {
        const singleItemHtml = `
            <div style="display: flex; gap: 12px; align-items: center; padding: 8px 4px;">
                ${
                    itemThumbnail 
                    ? `<img src="${itemThumbnail}" alt="${itemName}" style="width: 60px; height: 60px; border-radius: 4px; flex-shrink: 0; object-fit: cover;">` 
                    : `<div style="width: 60px; height: 60px; background: #bdbebe; border-radius: 4px; flex-shrink: 0;"></div>`
                }
                <div style="flex: 1; min-width: 0;">
                    <div class="text font-body" style="font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-bottom: 4px;">${itemName}</div>
                    <div class="text font-body" style="font-size: 13px; display: flex; align-items: center; gap: 4px;"><span class="icon-robux-16x16"></span>${robuxPrice.toLocaleString()}</div>
                </div>
            </div>
        `;
        
        const finalConfirmBody = document.createElement('div');
        finalConfirmBody.style.cssText = 'padding: 0;';
        finalConfirmBody.innerHTML = `
            <div style="padding: 12px 0 8px; text-align: center; border-bottom: 1px solid rgb(73, 77, 90);">
                <div class="text font-body" style="font-size: 16px; font-weight: 700;">Purchase Summary</div>
                ${isDonating ? '<div class="text font-body" style="margin-top: 4px; font-size: 12px;">❤️ Donating to RoValra ❤️</div>' : ''}
            </div>
            <div style="padding: 8px 0; border-bottom: 1px solid rgb(73, 77, 90);">
                <div class="text font-body" style="font-weight: 600; margin-bottom: 6px; font-size: 13px;">PURCHASING ITEM</div>
                <div style="display: flex; flex-direction: column; gap: 4px;">
                    ${singleItemHtml}
                </div>
            </div>
            <details style="border-bottom: 1px solid rgb(73, 77, 90); padding: 8px 0;">
                <summary style="cursor: pointer; list-style: none; display: flex; align-items: center; justify-content: space-between;">
                    <span class="text font-body" style="font-weight: 600; font-size: 13px;">USING EXPERIENCE</span>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <button id="change-experience-btn" class="btn-secondary-sm text font-body" style="padding: 4px 10px; font-size: 12px;" onclick="event.stopPropagation();">
                            Change
                        </button>
                        <span style="font-size: 12px;">▼</span>
                    </div>
                </summary>
                <div style="padding-top: 8px; display: flex; gap: 10px; align-items: center;">
                    ${gameThumbnailUrl ? `
                        <img src="${gameThumbnailUrl}" alt="${gameName}" style="width: 40px; height: 40px; border-radius: 4px; flex-shrink: 0;">
                    ` : `
                        <div style="width: 40px; height: 40px; background: #bdbebe; border-radius: 4px; flex-shrink: 0;"></div>
                    `}
                    <div style="flex: 1; min-width: 0;">
                        <div class="text font-body" style="font-weight: 600; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${gameName}</div>
                        <div class="text font-body" style="font-size: 11px; opacity: 0.7;">Place ID: ${actualPlaceId}</div>
                        ${isDonating ? '<div class="text font-body" style="font-size: 11px; opacity: 0.7;">Donating to RoValra ❤️</div>' : ''}
                    </div>
                </div>
            </details>
            <div style="padding: 8px 0;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                    <span class="text font-body" style="font-size: 13px;">Total:</span>
                    <span class="text font-body" style="font-weight: 600; display: flex; align-items: center; gap: 4px;"><span class="icon-robux-16x16"></span>${robuxPrice.toLocaleString()}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                    <span class="text font-body" style="font-size: 13px;">Balance:</span>
                    <span class="text font-body" style="display: flex; align-items: center; gap: 4px;"><span class="icon-robux-16x16"></span>${userRobux.toLocaleString()}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid rgb(73, 77, 90);">
                    <span class="text font-body" style="font-size: 13px;">After:</span>
                    <span class="text font-body" style="font-weight: 600; ${robuxAfterPurchase < 0 ? 'color: #d32f2f;' : ''} display: flex; align-items: center; gap: 4px;"><span class="icon-robux-16x16"></span>${robuxAfterPurchase.toLocaleString()}</span>
                </div>
                <div style="display: flex; justify-content: space-between; padding: 8px; background: rgba(0,128,0,0.05); border-radius: 4px;">
                    <span class="text font-body" style="font-weight: 600; font-size: 13px;">${isDonating ? 'Commission:' : 'You Save:'}</span>
                    <span class="text font-body" style="font-size: 18px; font-weight: 700; display: flex; align-items: center; gap: 4px;"><span class="icon-robux-16x16"></span>${robuxSaved.toLocaleString()}</span>
                </div>
            </div>
            ${robuxAfterPurchase < 0 ? '<div style="padding: 8px; border-radius: 4px; background: rgba(211, 47, 47, 0.1); margin-bottom: 8px; border: 1px solid rgba(211, 47, 47, 0.3);"><span class="text font-body" style="color: #d32f2f; font-weight: 600; font-size: 13px;">⚠️ Insufficient Balance</span></div>' : ''}
        `;

        const finalConfirmBtn = document.createElement('button');
        finalConfirmBtn.textContent = 'Confirm Purchase';
        finalConfirmBtn.className = 'btn-cta-md btn-min-width';
        finalConfirmBtn.disabled = robuxAfterPurchase < 0;

        const finalCancelBtn = document.createElement('button');
        finalCancelBtn.textContent = 'Cancel';
        finalCancelBtn.className = 'btn-secondary-md btn-min-width';

        const { overlay: finalConfirmOverlay, close: origCloseFinalConfirm } = createOverlay({
            title: 'Confirm Purchase',
            bodyContent: finalConfirmBody,
            actions: [finalCancelBtn, finalConfirmBtn],
            maxWidth: '500px',
            showLogo: true
        });

        const closeFinalConfirm = () => {
            if (!ctx.cancelled) ctx.cancelled = true;
            origCloseFinalConfirm();
        };

        const changeExperienceBtn = finalConfirmBody.querySelector('#change-experience-btn');
        if (changeExperienceBtn) {
            changeExperienceBtn.addEventListener('click', () => {
                closeFinalConfirm();
                createAndShowPopup(() => {
                    execute40MethodPurchase(itemId, robuxPrice, isGamePass, isBundle, itemDetails, isCartItem);
                });
            });
        }

        const finalConfirmed = await new Promise((resolve) => {
            let settled = false;
            const finish = (val) => { if (!settled) { settled = true; resolve(val); } };
            finalConfirmBtn.addEventListener('click', () => { if (ctx.cancelled) ctx.cancelled = false; origCloseFinalConfirm(); finish(true); });
            finalCancelBtn.addEventListener('click', () => { ctx.cancelled = true; origCloseFinalConfirm(); finish(false); });
            const closeBtn = finalConfirmOverlay.querySelector('.foundation-web-dialog-close-container button');
            if (closeBtn) closeBtn.addEventListener('click', () => { ctx.cancelled = true; origCloseFinalConfirm(); finish(false); });
        });

        if (!finalConfirmed || ctx.cancelled) {
            return;
        }
    } 

    ensureNotCancelled();
    const bodyContent = document.createElement('div');
    bodyContent.innerHTML = `
        <div style="padding: 20px; text-align: center;">
            <div id="progress-spinner" style="margin: 0 auto 16px;"></div>
            <h3 id="progress-title" class="text font-header-2" style="margin: 0 0 8px 0;">Preparing Purchase</h3>
            <p id="progress-text" class="text font-body" style="margin: 0;">Initializing...</p>
            <div style="margin-top: 20px; padding: 10px; border-radius: 6px;">
                <div class="text font-body">This may take a bit...</div>
            </div>
        </div>
    `;

    const progressSpinnerContainer = bodyContent.querySelector('#progress-spinner');
    if (progressSpinnerContainer) {
        progressSpinnerContainer.appendChild(createSpinner({ size: '48px', color: 'currentColor' }));
    }

    const { overlay, close: origCloseProcessing } = createOverlay({
        title: '40% Method - Processing',
        bodyContent: bodyContent,
        actions: [],
        maxWidth: '450px',
        showLogo: true,
        preventBackdropClose: true
    });

    const closeProcessing = () => {
        if (!ctx.cancelled) ctx.cancelled = true;
        origCloseProcessing();
    };

    const closeBtn = overlay.querySelector('.foundation-web-dialog-close-container button');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            ctx.cancelled = true;
            closeProcessing();
        });
    }

    const progressTitle = bodyContent.querySelector('#progress-title');
    const progressText = bodyContent.querySelector('#progress-text');

    try {
        let collectibleItemId = null;
        let collectibleProductId = null;
        let gamePassProductId = null;
        
        if (isGamePass) {
            progressTitle.textContent = 'Fetching Game Pass Details';
            progressText.textContent = 'Retrieving game pass information...';
            
            ensureNotCancelled();
            const gamePassData = await callRobloxApiJson({
                subdomain: 'apis',
                endpoint: `/game-passes/v1/game-passes/${itemId}/product-info`,
                method: 'GET'
            });
            ensureNotCancelled();

            if (!gamePassData || !gamePassData.ProductId) {
                throw new Error('Game pass not found');
            }

            gamePassProductId = gamePassData.ProductId;
            console.log('RoValra: Game pass product ID:', gamePassProductId);
        } else {
            progressTitle.textContent = 'Fetching Item Details';
            progressText.textContent = 'Retrieving collectible information...';
            
            ensureNotCancelled();
            const catalogData = await callRobloxApiJson({
                subdomain: 'catalog',
                endpoint: '/v1/catalog/items/details',
                method: 'POST',
                body: {
                    items: [{ id: parseInt(itemId), itemType: isBundle ? 'Bundle' : 'Asset' }]
                }
            });
            ensureNotCancelled();

            if (!catalogData.data || catalogData.data.length === 0) {
                throw new Error('Item not found in catalog');
            }

            const itemData = catalogData.data[0];
            collectibleItemId = itemData.collectibleItemId;

            if (!collectibleItemId) {
                throw new Error('This item is not a collectible');
            }

            progressTitle.textContent = 'Getting Product Info';
            progressText.textContent = 'Retrieving marketplace details...';
            
            ensureNotCancelled();
            const marketplaceData = await callRobloxApiJson({
                subdomain: 'apis',
                endpoint: '/marketplace-items/v1/items/details',
                method: 'POST',
                body: {
                    itemIds: [collectibleItemId]
                }
            });
            ensureNotCancelled();

            if (!marketplaceData || marketplaceData.length === 0) {
                throw new Error('Collectible product not found');
            }

            collectibleProductId = marketplaceData[0].collectibleProductId;
        }

        progressTitle.textContent = 'Setting Up Experience';
        progressText.textContent = 'Preparing experience environment...';
        
        const placeIdToUse = (useRoValraGroup || savedPlaceId === 'ROVALRA_GROUP') ? actualPlaceId : savedPlaceId;
        
        ensureNotCancelled();
        const gameData = await callRobloxApiJson({
            subdomain: 'games',
            endpoint: `/v1/games/multiget-place-details?placeIds=${placeIdToUse}`,
            method: 'GET'
        });
        ensureNotCancelled();

        if (!gameData || gameData.length === 0 || !gameData[0].universeId) {
            throw new Error('Failed to fetch Universe ID');
        }

        const universeId = gameData[0].universeId;

        progressTitle.textContent = 'Creating Server';
        progressText.textContent = 'Requesting server instance...';
        
        let serverInstanceId = null;
        let analyticsSessionId = null;

        while (!serverInstanceId) {
            ensureNotCancelled();
            if (ctx.cancelled) {
                console.log('RoValra: Purchase cancelled during server creation');
                return;
            }
            const joinGameResponse = await callRobloxApiJson({
                subdomain: 'gamejoin',
                endpoint: '/v1/join-game',
                method: 'POST',
                body: {
                    placeId: parseInt(placeIdToUse, 10),
                    gameJoinAttemptId: crypto.randomUUID()
                }
            });
            ensureNotCancelled();

            if (joinGameResponse && joinGameResponse.joinScript && joinGameResponse.jobId) {
                serverInstanceId = joinGameResponse.jobId;
                
                if (joinGameResponse.joinScript.AnalyticsSessionId) {
                    analyticsSessionId = joinGameResponse.joinScript.AnalyticsSessionId;
                }
                
                console.log('RoValra: Created server instance:', serverInstanceId);
                break;
            }

            progressTitle.textContent = 'Retrying Server Creation';
            progressText.textContent = 'Waiting for server...';
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        if (!analyticsSessionId) {
            analyticsSessionId = crypto.randomUUID();
        }

        progressTitle.textContent = 'Launching Roblox';
        progressText.textContent = 'Starting Roblox client...';
        ensureNotCancelled();
        if (ctx.cancelled) {
            console.log('RoValra: Purchase cancelled before launching Roblox');
            return;
        }
        
        if (DEBUG_SKIP_ROBLOX_LAUNCH) {
            console.log('RoValra: DEBUG MODE - Skipping Roblox launch');
        } else {
            launchGame(placeIdToUse, serverInstanceId);
            removeRobloxJoinDialog(); 
        }

        progressTitle.textContent = 'Waiting for Game';
        progressText.textContent = 'Please wait while Roblox loads...';
        await new Promise((resolve, reject) => {
            let inGameDetected = false;
            const checkCancel = () => { if (ctx.cancelled && !inGameDetected) { cleanup(); reject(new Error('Purchase cancelled')); } };
            const cleanup = () => {
                clearInterval(pollInterval);
            };

            const pollInterval = setInterval(async () => {
                if (inGameDetected) return;
                if (ctx.cancelled) { checkCancel(); return; }
                
                try {
                    const presenceData = await callRobloxApiJson({
                        subdomain: 'presence',
                        endpoint: '/v1/presence/users',
                        method: 'POST',
                        body: {
                            userIds: [parseInt(currentUserId)]
                        }
                    });

                    if (presenceData.userPresences && presenceData.userPresences.length > 0) {
                        const presence = presenceData.userPresences[0];
                        const userRootPlaceId = presence.rootPlaceId;
                        
                        console.log('RoValra: User presence check - rootPlaceId:', userRootPlaceId, 'Expected:', placeIdToUse);
                        
                        if (userRootPlaceId && userRootPlaceId.toString() === placeIdToUse.toString()) {
                            console.log('RoValra: User is in the correct game, proceeding with purchase');
                            inGameDetected = true;
                            cleanup();
                            resolve();
                        }
                    }
                } catch (pollError) {
                    console.error('RoValra: Error checking user presence:', pollError);
                }
            }, 1000);

            overlay.addEventListener('remove', () => { if (!inGameDetected) { ctx.cancelled = true; checkCancel(); } });
        });
        ensureNotCancelled();

        progressTitle.textContent = 'Completing Purchase';
        progressText.textContent = 'Finalizing transaction...';
        
        ensureNotCancelled();
        const csrfToken = await getCsrfToken();
        if (!csrfToken) {
            throw new Error('Failed to obtain CSRF token');
        }

        let requestBody, headers, purchaseUrl;
        
        if (isGamePass) {
            requestBody = {
                expectedCurrency: 1,
                expectedPrice: parseInt(robuxPrice),
                expectedSellerId: 0,
                expectedPromoId: 0,
                userAssetId: 0,
                saleLocationType: 'Game',
                saleLocationId: parseInt(placeIdToUse)
            };

            headers = {
                'Content-Type': 'application/json',
                'User-Agent': 'Roblox/WinInetRobloxApp/0.698.0.6980936 (GlobalDist; RobloxDirectDownload)',
                'X-CSRF-TOKEN': csrfToken,
                'Requester': 'Client',
                'Roblox-Game-Id': serverInstanceId,
                'Roblox-Place-Id': placeIdToUse.toString(),
                'Roblox-Universe-Id': universeId.toString()
            };

            purchaseUrl = `https://apis.roblox.com/game-passes/v1/game-passes/${gamePassProductId}/purchase`;
        } else {
            requestBody = {
                expectedCurrency: 1,
                expectedPrice: parseInt(robuxPrice),
                expectedPurchaserId: parseInt(currentUserId),
                expectedPurchaserType: 'User',
                collectibleProductId: collectibleProductId,
                idempotencyKey: analyticsSessionId,
                purchaseAuthToken: ''
            };

            headers = {
                'Content-Type': 'application/json',
                'User-Agent': 'Roblox/WinInetRobloxApp/0.698.0.6980936 (GlobalDist; RobloxDirectDownload)',
                'X-CSRF-TOKEN': csrfToken,
                'Requester': 'Client',
                'Roblox-Game-Id': serverInstanceId,
                'Roblox-Place-Id': placeIdToUse.toString(),
                'Roblox-Universe-Id': universeId.toString()
            };

            purchaseUrl = `https://apis.roblox.com/marketplace-sales/v1/item/${collectibleItemId}/purchase-item`;
        }

        ensureNotCancelled();
        const response = await corsFetch(purchaseUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(requestBody),
            credentials: 'include'
        });
        ensureNotCancelled();

        const responseData = await response.json();
        console.log('Purchase Response:', responseData);
        
        const isSuccess = isGamePass 
            ? (responseData.purchased === true && responseData.reason === "Success")
            : (responseData.purchaseResult === "Purchase transaction success" && responseData.purchased === true);
        
        if (isSuccess) {
            if (!isCartItem) {
                closeProcessing();
                const savingsPercentage = isGamePass ? 0.10 : 0.40;
                const savings = Math.round(robuxPrice * savingsPercentage);
                const isDonating = (useRoValraGroup || savedPlaceId === 'ROVALRA_GROUP');
                showSuccessNotification(savings, gameName, isDonating);
            }
        } else {
            throw new Error(JSON.stringify({
                message: 'Purchase failed',
                purchaseResult: responseData.purchaseResult,
                purchased: responseData.purchased,
                errorMessage: responseData.errorMessage,
                errorMsg: responseData.errorMsg
            }));
        }

    } catch (error) {
        if (!isCartItem) {
            if (activePurchaseContext === ctx && !overlay.isConnected) {
                return;
            }
            closeProcessing();
            if (error.message === 'Purchase cancelled') {
                console.log('RoValra: Purchase flow cancelled by user.');
            } else {
                let errorDetails;
                try {
                    errorDetails = JSON.parse(error.message);
                } catch (e) {
                    errorDetails = { message: error.message };
                }

                showFailureNotification(errorDetails);
                console.error('40% Method Error:', error, errorDetails);
            }
        } else {
            throw error;
        }
    }
};

const addSaveButton = (modal) => {

    const modalWindow = modal.closest('.modal-window') || modal.closest('.simplemodal-wrap') || modal;
    console.log('Modal window found:', modalWindow);
    if (!modalWindow) return;

    const checkElements = () => {
        const buyNowButton = modalWindow.querySelector('.modal-button.btn-primary-md, #confirm-btn.btn-primary-md, a#confirm-btn');
        const robuxPriceElement = modalWindow.querySelector('.text-robux, .text-robux-lg');
        const buttonContainer = modalWindow.querySelector('.modal-footer .modal-buttons, .modal-btns');
        const closeButton = modalWindow.querySelector('.modal-header .close, .modal-header .modal-close-btn, .modal-header button.close');

        if (!buyNowButton || !robuxPriceElement || !buttonContainer || !closeButton) {
            return null;
        }

        return { buyNowButton, robuxPriceElement, buttonContainer, closeButton };
    };

    let elements = checkElements();
    if (elements) {
        addButtonWithElements(elements);
    } else {
        const observer = new MutationObserver(() => {
            elements = checkElements();
            if (elements) {
                observer.disconnect();
                addButtonWithElements(elements);
            }
        });
        observer.observe(modalWindow, { childList: true, subtree: true });
    }

    function addButtonWithElements({ buyNowButton, robuxPriceElement, buttonContainer, closeButton }) {
        console.log('All elements found, adding button');

        const cartItems = getCartItems();
        console.log('Cart items found:', cartItems.length);

        const isMultiItemPurchase = cartItems.length >= 2;
        
        const isGamePass = isGamePassPage();
        console.log('Is gamepass:', isGamePass);
        const isBundle = window.location.pathname.startsWith('/bundles/');
        
        let itemId = null;
        let isMismatch = false;
        
        if (isMultiItemPurchase) {
            console.log('RoValra: Multi-item cart purchase detected with', cartItems.length, 'items');
            
            const batchItemsInModal = getBatchPurchaseItems(modalWindow);
            if (batchItemsInModal.length > 0) {
                isMismatch = !validateCartMatch(batchItemsInModal, cartItems);
                if (isMismatch) {
                    console.warn('Cart mismatch detected!');
                }
            }
        } else {
            if (isGamePass) {
                itemId = getGamePassId();
                console.log('RoValra: Using gamepass ID:', itemId);
            } else if (cartItems.length === 1) {
                itemId = cartItems[0].id;
                console.log('RoValra: Using item ID from single-item cart:', itemId);
            } else {
                itemId = (window.location.href.match(/(?:catalog|bundles|library)\/(\d+)/) || [])[1];
                console.log('RoValra: No cart items - using item ID from URL:', itemId);
            }
            
            console.log('Item ID:', itemId);
            if (!itemId) return;
        }

        const robuxPrice = parseInt(robuxPriceElement.textContent.replace(/,/g, ''), 10);
        console.log('Robux price:', robuxPrice);
        if (isNaN(robuxPrice)) return;

        const savingsPercentage = isGamePass ? 0.10 : 0.40;
        const savings = Math.round(robuxPrice * savingsPercentage);
        const saveButton = document.createElement('button');
        saveButton.textContent = `Save ${savings} Robux`;
        saveButton.type = 'button';
        
        if (isGamePass) {
            saveButton.className = 'btn-control-md btn-save-robux';
        } else {
            saveButton.className = 'modal-button btn-control-md btn-min-width btn-save-robux';
        }

        saveButton.addEventListener('click', async () => {
            closeButton.click();
            
            if (isMismatch) {
                const errorBody = document.createElement('div');
                errorBody.innerHTML = `
                    <div style="padding: 20px; text-align: center;">
                        <div style="font-size: 48px; margin-bottom: 16px; color: #d32f2f;">⚠️</div>
                        <h3 class="text font-header-2" style="margin: 0 0 12px 0; color: #d32f2f;">Cart Mismatch Detected</h3>
                        <p class="text font-body" style="margin: 0 0 12px 0;">The items in your purchase modal don't match what's in your cart.</p>
                        <p class="text font-body" style="margin: 0;">Please refresh the page and try again. If this issue persists, please report it in the RoValra Discord server.</p>
                    </div>
                `;
                const { overlay, close } = createOverlay({
                    title: 'Purchase Error',
                    bodyContent: errorBody,
                    actions: [],
                    maxWidth: '450px',
                    showLogo: true
                });
                return;
            }
            
            let itemDetails = null;
            if (!isMultiItemPurchase && itemId) {
                try {
                    const nameElement = document.querySelector('.item-details-name-row h1');
                    const itemName = nameElement ? nameElement.textContent.trim() : 'Unknown Item';
                    
                    let itemThumbnail = null;
                    try {
                        const thumbnailMap = await fetchThumbnails(
                            [{ id: parseInt(itemId) }], 
                            'Asset', 
                            '150x150'
                        );
                        const thumbData = thumbnailMap.get(parseInt(itemId));
                        if (thumbData && thumbData.state === 'Completed') {
                            itemThumbnail = thumbData.imageUrl;
                        }
                    } catch (thumbError) {
                        console.warn('RoValra: Could not fetch item thumbnail:', thumbError);
                    }
                    
                    itemDetails = {
                        name: itemName,
                        thumbnail: itemThumbnail
                    };
                    
                    console.log('RoValra: Extracted item details from page:', itemDetails);
                } catch (error) {
                    console.warn('RoValra: Could not extract item details from page:', error);
                }
            }
            
            const result = await new Promise((resolve) => {
                chrome.storage.local.get('RobuxPlaceId', resolve);
            });

            if (!result.RobuxPlaceId) {
                createAndShowPopup(() => {
                    if (isMultiItemPurchase) {
                        executeCartPurchase(cartItems, robuxPrice);
                    } else {
                        execute40MethodPurchase(itemId, robuxPrice, isGamePass, isBundle, itemDetails);
                    }
                });
            } else {
                if (isMultiItemPurchase) {
                    executeCartPurchase(cartItems, robuxPrice);
                } else {
                    execute40MethodPurchase(itemId, robuxPrice, isGamePass, isBundle, itemDetails);
                }
            }
        });

        if (!modalWindow.querySelector('.rovalra-save-wrapper')) {
            const wrapper = document.createElement('div');
            wrapper.className = 'rovalra-save-wrapper';
            wrapper.style.cssText = `
                margin-top: 8px;
                display: flex;
                justify-content: center;
                width: 100%;
            `;
            wrapper.appendChild(saveButton);

            const footer = modalWindow.querySelector('.modal-footer') || buttonContainer.parentElement || modalWindow;
            footer.appendChild(wrapper);
        } else {
            console.log('RoValra: Save wrapper already exists; not duplicating');
        }
    }
};



export function init() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get('SaveLotsRobuxEnabled', (result) => {
            if (result.SaveLotsRobuxEnabled === true) {
                console.log('RoValra: 40% method feature enabled, initializing...');
                detectAndAddSaveButton();
            }
        });
    } else {
        console.error('RoValra: Chrome storage API not available.');
    }
}
