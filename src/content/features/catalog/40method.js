

import { observeElement } from '../../core/observer.js';
import { callRobloxApiJson, callRobloxApi } from '../../core/api.js';
import { launchMultiplayerGame, launchStudioForGame } from '../../core/utils/launcher.js';

import { createOverlay } from '../../core/ui/overlay.js';
import { createDropdown } from '../../core/ui/dropdown.js';
import { createScrollButtons } from '../../core/ui/general/scrollButtons.js';
import { createSpinner } from '../../core/ui/spinner.js';
import { createStyledInput } from '../../core/ui/catalog/input.js';

import { fetchThumbnails } from '../../core/thumbnail/thumbnails.js';
import DOMPurify from 'dompurify';
import { getPlaceIdFromUrl } from '../../core/idExtractor.js';



const ROVALRA_PLACE_ID = '107845747621646';
let assetToSubcategoryMap = null;
let classicClothingSubcategories = null;
let metadataPromise = null;
const itemDetailsCache = new Map();

function getItemDetails(itemId, itemType = 'Asset') {
    const key = `${itemId}_${itemType}`;
    if (itemDetailsCache.has(key)) return itemDetailsCache.get(key);

    const promise = callRobloxApiJson({
        subdomain: 'catalog',
        endpoint: '/v1/catalog/items/details',
        method: 'POST',
        body: { items: [{ id: parseInt(itemId), itemType: itemType }] }
    }).catch(err => {
        itemDetailsCache.delete(key);
        return null;
    });

    itemDetailsCache.set(key, promise);
    return promise;
}

async function fetchCatalogMetadata() {
    if (assetToSubcategoryMap && classicClothingSubcategories) return;
    if (metadataPromise) return metadataPromise;

    metadataPromise = (async () => {
        try {
            const [assetToSubResponse, subcategoriesResponse] = await Promise.all([
                callRobloxApiJson({
                    subdomain: 'catalog',
                    endpoint: '/v1/asset-to-subcategory',
                    method: 'GET'
                }),
                callRobloxApiJson({
                    subdomain: 'catalog',
                    endpoint: '/v1/subcategories',
                    method: 'GET'
                })
            ]);

            assetToSubcategoryMap = assetToSubResponse;
            
            const classicKeys = ['ClassicShirts', 'ClassicPants', 'ClassicTShirts'];
            classicClothingSubcategories = [];
            
            if (subcategoriesResponse) {
                for (const key of classicKeys) {
                    if (subcategoriesResponse[key] !== undefined) {
                        classicClothingSubcategories.push(subcategoriesResponse[key]);
                    }
                }
            }
        } catch (error) {
            console.warn('RoValra: Failed to fetch catalog metadata', error);
        } finally {
            metadataPromise = null;
        }
    })();
    return metadataPromise;
}

async function fetchGamesForGroup(groupId) {
    let allGames = [];
    let nextCursor = null;
    do {
        const url = `/universes/v1/search?CreatorType=Group&CreatorTargetId=${groupId}&IsArchived=false&Surface=CreatorHubCreations&PageSize=100&SortParam=LastUpdated&SortOrder=Desc` + (nextCursor ? `&cursor=${nextCursor}` : '');
        const response = await callRobloxApiJson({
            subdomain: 'apis',
            endpoint: url,
        });
        if (response.data) {
            allGames = allGames.concat(response.data);
        }
        nextCursor = response.nextPageCursor;
    } while (nextCursor);
    return allGames;
}

async function updateGameDescription(universeId, sourcePlaceId) {
    try {
        const versionResponse = await callRobloxApiJson({
            subdomain: 'develop',
            endpoint: '/v1/assets/latest-versions',
            method: 'POST',
            body: {
                assetIds: [parseInt(sourcePlaceId)],
                versionStatus: 'Published'
            }
        });

        let versionNumber = 'Unknown';
        if (versionResponse && versionResponse.results && versionResponse.results.length > 0) {
            versionNumber = versionResponse.results[0].versionNumber;
        }

        const configResponse = await callRobloxApiJson({
            subdomain: 'develop',
            endpoint: `/v1/universes/${universeId}/configuration`,
            method: 'GET'
        });

        if (!configResponse) return;

        const newDescription = `SourcePlaceId: ${sourcePlaceId} Version: ${versionNumber}`;
        
        const patchBody = {
            name: configResponse.name,
            description: newDescription,
            isFriendsOnly: configResponse.isFriendsOnly,
            studioAccessToApisAllowed: configResponse.isStudioAccessToApisAllowed
        };

        await callRobloxApiJson({
            subdomain: 'develop',
            endpoint: `/v2/universes/${universeId}/configuration`,
            method: 'PATCH',
            body: patchBody
        });

    } catch (e) {
        console.warn('RoValra: Failed to update game description', e);
    }
}

async function validateGameSync(universeId, placeId) {
    try {
        const versionResponse = await callRobloxApiJson({
            subdomain: 'develop',
            endpoint: '/v1/assets/latest-versions',
            method: 'POST',
            body: {
                assetIds: [parseInt(ROVALRA_PLACE_ID)],
                versionStatus: 'Published'
            }
        });
        
        let latestVersion = 0;
        if (versionResponse && versionResponse.results && versionResponse.results.length > 0) {
            latestVersion = versionResponse.results[0].versionNumber;
        }

        let description = '';
        if (placeId) {
            const gameDetails = await callRobloxApiJson({
                subdomain: 'games',
                endpoint: `/v1/games/multiget-place-details?placeIds=${placeId}`,
                method: 'GET'
            });
            if (gameDetails && gameDetails.length > 0) {
                description = gameDetails[0].description || '';
            }
        } else {
            const configResponse = await callRobloxApiJson({
                subdomain: 'develop',
                endpoint: `/v1/universes/${universeId}/configuration`,
                method: 'GET'
            });
            if (configResponse) description = configResponse.description || '';
        }
        
        const match = description.match(/SourcePlaceId:\s*(\d+)\s*Version:\s*(\d+)/);
        
        if (!match) return { valid: false, reason: 'missing_metadata' };
        
        const sourceId = match[1];
        const currentVersion = parseInt(match[2], 10);
        
        if (sourceId !== ROVALRA_PLACE_ID || currentVersion < latestVersion) {
            return { valid: false, reason: 'outdated', current: currentVersion, latest: latestVersion };
        }

        return { valid: true };
    } catch (e) {
        return { valid: true }; 
    }
}

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
            const match = href.match(/\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?catalog\/(\d+)\//i); 
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


const getUniverseId = () => {
    const meta = document.getElementById('game-detail-meta-data');
    return meta ? meta.getAttribute('data-universe-id') : null;
};

async function fetchGamePassesForUniverse(universeId) {
    let gamePasses = [];
    let cursor = '';
    const limit = 50;

    try {
        do {
            const url = `/game-passes/v1/universes/${universeId}/game-passes?pageSize=${limit}&passView=Full` + (cursor ? `&cursor=${cursor}` : '');
            const response = await callRobloxApiJson({
                subdomain: 'apis',
                endpoint: url,
                method: 'GET'
            });

            if (response.gamePasses) {
                gamePasses = gamePasses.concat(response.gamePasses);
            }
            cursor = response.nextPageToken;
        } while (cursor);
    } catch (error) {
        console.warn('RoValra: Failed to fetch game passes via API', error);
    }
    return gamePasses;
}

const detectAndAddSaveButton = () => {
    

    observeElement('.modal-dialog .modal-content[role="document"], .modal-dialog .modal-content', (modal) => {
        const handleUpdate = () => {
            if (!modal.querySelector('.btn-save-robux')) {
                addSaveButton(modal);
            }
        };

        handleUpdate();

        const observer = new MutationObserver(handleUpdate);
        observer.observe(modal, { childList: true, subtree: true });
        modal._rovalraSaveBtnObserver = observer;
    }, { 
        multiple: true,
        onRemove: (modal) => {
            if (modal._rovalraSaveBtnObserver) {
                modal._rovalraSaveBtnObserver.disconnect();
                delete modal._rovalraSaveBtnObserver;
            }
        }
    });
};



const createAndShowPopup = (onSave, initialState = null) => {
    const currentUserId = getCurrentUserId();
    if (!currentUserId) {
        alert("Could not identify your user ID. Please make sure you are logged in.");
        return;
    }

    const bodyContent = document.createElement('div');
    bodyContent.innerHTML = DOMPurify.sanitize(`
        <div id="sr-view-main">
            <h4 class="text font-header-2" style="margin:0 0 12px 0;">Set Up an Experience</h4>
            <p class="text font-body" style="margin: 0 0 10px 0; line-height:1.4;">
                <strong>Only a specific template works</strong>
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
            <div style="display: flex; gap: 8px; margin-top: 16px;">
                <button class="btn-secondary-md btn-min-width" id="sr-owner-warning-back-btn" style="flex: 1;">Go Back</button>
            </div>
        </div>
        <div id="sr-view-manual-ack" class="sr-hidden">
            <h4 class="text font-header-2" style="margin: 0 0 10px 0;">Experience Accepted</h4>
            <p class="text font-body" style="margin: 5px 0 10px 0; line-height:1.5;">
                <strong>Only specific experiences work.</strong> Ensure this experience is set up with the required scripts to handle in-game purchases.
            </p>
            <p class="text font-body" style="margin: 5px 0 10px 0; line-height:1.5;">
                Make sure the experience belongs to a group <strong>you control, but is not owned by this account</strong>. Preferably the group should be owned by an alt. If you own the group, the 40% method will not work.
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

        <div id="sr-view-manual-create-instructions" class="sr-hidden">
            <h4 class="text font-header-2" style="margin: 0 0 10px 0;">Create New Experience</h4>
            <p class="text font-body" style="margin: 5px 0 10px 0; line-height: 1.5;">To create a new experience for this method:</p>
            <div style="margin-bottom: 16px; border-radius: 8px; overflow: hidden;">
                <iframe width="100%" height="250" src="https://www.youtube.com/embed/-kUAWWmmkaQ" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
            </div>
            <ol class="text font-body" style="margin: 0 0 16px 0; padding-left: 20px; line-height: 1.5;">
                <li>Open the uncopylocked experience in Studio: <a href="#" id="sr-edit-game-link" style="text-decoration: underline;">Open Studio</a></li>
                <li>In Studio, go to <strong>File > Game Settings > Security > Turn on "Allow Third Party Sales" > File > Publish to Roblox As...</strong></li>
                <li>Select this group from the Creator list.</li>
                <li>Click <strong>Create</strong> and the experience will be published</li>
            </ol>
            <p class="text font-body" style="margin: 0 0 16px 0; line-height: 1.5;">Once published, click the button below and we'll automatically find and select it for you.</p>
            <div style="display: flex; gap: 8px; margin-top: 16px;">
                <button class="btn-secondary-md btn-min-width" id="sr-manual-create-back-btn" style="flex: 1;">Back</button>
                <button class="btn-cta-md btn-min-width" id="sr-manual-create-done-btn" style="flex: 1;">I've Published the Game</button>
            </div>
        </div>

        <div id="sr-view-finding-game" class="sr-hidden">
            <div style="text-align: center; padding: 20px 0;">
                <div id="sr-finding-game-spinner" style="margin: 0 auto 16px;"></div>
                <h4 class="text font-header-2" style="margin: 0 0 8px 0;">Finding Your Experience</h4>
                <p class="text font-body" style="margin: 0;">Please wait while we look for your newly published experience...</p>
            </div>
        </div>
        <div id="sr-view-game-not-found" class="sr-hidden">
            <h4 class="text font-header-2" style="margin: 0 0 10px 0;">Experience Not Found</h4>
            <p class="text font-body" style="margin: 5px 0 16px 0; line-height: 1.5;">We couldn't find the new experience. Please check the following:</p>
            <ul class="text font-body" style="margin: 0 0 16px 0; padding-left: 20px; line-height: 1.5;">
                <li>Did you publish the experience?</li>
                <li>Did you publish it under the correct group?</li>
            </ul>
            <div style="display: flex; gap: 8px; margin-top: 16px;">
                <button class="btn-secondary-md btn-min-width" id="sr-not-found-back-btn" style="flex: 1;">Back</button>
                <button class="btn-cta-md btn-min-width" id="sr-not-found-retry-btn" style="flex: 1;">Retry Scan</button>
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
                <button class="btn-cta-md btn-min-width" id="sr-existing-select-btn" style="flex: 1;" disabled>Select Experience</button>
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

        <div id="sr-view-validation-warning" class="sr-hidden">
            <h4 class="text font-header-2" style="margin: 0 0 10px 0;">Validation Warning</h4>
            <div id="sr-validation-message-container"></div>
            <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 16px;">
                <button class="btn-cta-md btn-min-width" id="sr-validation-create-btn" style="display: none;">Create New Experience</button>
                <button class="btn-cta-md btn-min-width" id="sr-validation-update-btn" style="display: none;">Update Experience</button>
                <button class="btn-secondary-md btn-min-width" id="sr-validation-use-anyway-btn">Use Anyway</button>
            </div>
        </div>

        <div id="sr-view-permission-error" class="sr-hidden">
            <h4 class="text font-header-2" style="margin: 0 0 10px 0;">Permission Required</h4>
            <p class="text font-body" style="margin: 5px 0 12px 0; line-height: 1.5;">You don't have permission to manage experiences for this group. You need a role with creation/management rights. You can pick a different group or choose the donate option instead.</p>
            <div style="display: flex; gap: 8px;">
                <button class="btn-secondary-md btn-min-width" id="sr-permission-error-back-btn" style="flex: 1;">Back to Group Selection</button>
            </div>
        </div>

        <div id="sr-view-update-instructions" class="sr-hidden">
            <h4 class="text font-header-2" style="margin: 0 0 10px 0;">Update Experience</h4>
            <p class="text font-body" style="margin: 5px 0 10px 0; line-height: 1.5;">
                Experience: <strong id="sr-update-game-name">Loading...</strong>
            </p>
            <p class="text font-body" style="margin: 5px 0 10px 0; line-height: 1.5;">Your experience is outdated. To ensure it works correctly, please update it. Updates to the 40% method experience is normally important bug fixes.</p>
            <div style="margin-bottom: 16px; border-radius: 8px; overflow: hidden;">
                <iframe width="100%" height="250" src="https://www.youtube.com/embed/P-Njqsr9-Ok" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
            </div>
            <ol class="text font-body" style="margin: 0 0 16px 0; padding-left: 20px; line-height: 1.5;">
                <li>Open the template in Roblox Studio: <a href="#" id="sr-update-open-studio-link" style="text-decoration: underline;">Open Studio</a></li>
                <li>To update the game, you just need to open the template through the "Open Studio"</li>
                <li>Then file > Publish To Roblox As > the experience you currently use > Overwrite. </li>
            </ol>
            <div style="display: flex; gap: 8px; margin-top: 16px;">
                <button class="btn-secondary-md btn-min-width" id="sr-update-use-anyway-btn" style="flex: 1;">Use Anyway</button>
                <button class="btn-cta-md btn-min-width" id="sr-update-confirm-btn" style="flex: 1;">I've Updated It</button>
            </div>
        </div>

        <div id="sr-view-update-failed" class="sr-hidden">
            <h4 class="text font-header-2" style="margin: 0 0 10px 0;">Update Not Detected</h4>
            <p class="text font-body" style="margin: 5px 0 16px 0; line-height: 1.5;">We didn't detect a new version. Please make sure you published the game to Roblox (File > Publish to Roblox).</p>
            <div style="display: flex; gap: 8px; margin-top: 16px;">
                <button class="btn-secondary-md btn-min-width" id="sr-update-failed-back-btn" style="flex: 1;">Back</button>
                <button class="btn-cta-md btn-min-width" id="sr-update-failed-retry-btn" style="flex: 1;">Retry Verification</button>
            </div>
        </div>
    `, { ADD_ATTR: ['target', 'allow', 'allowfullscreen', 'frameborder'], ADD_TAGS: ['iframe'] });

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

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            e.stopPropagation();
            e.stopImmediatePropagation();
        }
    }, true);

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

    const loadingGamesSpinner = bodyContent.querySelector('#sr-loading-games-spinner');
    if (loadingGamesSpinner) {
        loadingGamesSpinner.appendChild(createSpinner({ size: '48px', color: 'currentColor' }));
    }

    const findingGameSpinner = bodyContent.querySelector('#sr-finding-game-spinner');
    if (findingGameSpinner) {
        findingGameSpinner.appendChild(createSpinner({ size: '48px', color: 'currentColor' }));
    }

    const groupDropdownContainer = bodyContent.querySelector('#sr-group-dropdown-container');
    const viewMain = bodyContent.querySelector('#sr-view-main');
    const viewNonOwnerAck = bodyContent.querySelector('#sr-view-non-owner-ack');
    const viewOwnerWarning = bodyContent.querySelector('#sr-view-owner-warning');
    const ownerWarningBackBtn = bodyContent.querySelector('#sr-owner-warning-back-btn');
    const viewWIP = bodyContent.querySelector('#sr-view-wip');
    const viewManualCreateInstructions = bodyContent.querySelector('#sr-view-manual-create-instructions');
    const viewExistingGames = bodyContent.querySelector('#sr-view-existing-games');
    const viewGameNotFound = bodyContent.querySelector('#sr-view-game-not-found');
    const viewFindingGame = bodyContent.querySelector('#sr-view-finding-game');
    const viewRoValraGroup = bodyContent.querySelector('#sr-view-rovalra-group');
    const viewPermissionError = bodyContent.querySelector('#sr-view-permission-error');
    const viewValidationWarning = bodyContent.querySelector('#sr-view-validation-warning');
    const viewUpdateInstructions = bodyContent.querySelector('#sr-view-update-instructions');
    const viewUpdateFailed = bodyContent.querySelector('#sr-view-update-failed');
    const updateUseAnywayBtn = bodyContent.querySelector('#sr-update-use-anyway-btn');
    const updateFailedBackBtn = bodyContent.querySelector('#sr-update-failed-back-btn');
    const updateFailedRetryBtn = bodyContent.querySelector('#sr-update-failed-retry-btn');
    const updateGameNameEl = bodyContent.querySelector('#sr-update-game-name');
    const updateOpenStudioLink = bodyContent.querySelector('#sr-update-open-studio-link');
    const updateConfirmBtn = bodyContent.querySelector('#sr-update-confirm-btn');
    const validationUseAnywayBtn = bodyContent.querySelector('#sr-validation-use-anyway-btn');
    const validationCreateBtn = bodyContent.querySelector('#sr-validation-create-btn');
    const validationUpdateBtn = bodyContent.querySelector('#sr-validation-update-btn');
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
    const manualCreateBackBtn = bodyContent.querySelector('#sr-manual-create-back-btn');
    const manualCreateDoneBtn = bodyContent.querySelector('#sr-manual-create-done-btn');
    const notFoundBackBtn = bodyContent.querySelector('#sr-not-found-back-btn');
    const notFoundRetryBtn = bodyContent.querySelector('#sr-not-found-retry-btn');
    const editGameLink = bodyContent.querySelector('#sr-edit-game-link');
    let manualPlaceIdCandidate = null;
    let manualUniverseIdCandidate = null;
    let lastValidationReason = null;
    let initialUserPlaceVersion = 0;

    const safeSaveSettings = (placeId, useGroup, onSuccess) => {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({
                RobuxPlaceId: placeId,
                useRoValraGroup: useGroup
            }, () => {
                if (chrome.runtime.lastError) {
                    console.error('RoValra: Storage save error:', chrome.runtime.lastError);
                    alert('Failed to save settings: ' + chrome.runtime.lastError.message);
                } else {
                    if (onSuccess) onSuccess();
                }
            });
        } else {
            console.error('RoValra: Storage API unavailable.');
            alert('Failed to save settings. Storage API unavailable.');
        }
    };

    let groupDropdown = null;
    let selectedGroupId = null;
    let existingGames = [];
    let currentPage = 0;
    let selectedGameIndex = null;
    const gamesPerPage = 4;
    let initialGroupGames = [];

    const showValidationWarning = async (reason, placeId, universeId, gameName = null) => {
        lastValidationReason = reason;
        if (gameName && updateGameNameEl) updateGameNameEl.textContent = gameName;
        const container = bodyContent.querySelector('#sr-validation-message-container');
        
        validationUpdateBtn.style.display = 'none';
        validationCreateBtn.style.display = 'none';

        if (reason === 'missing_metadata' || reason === 'wrong_source') {
            container.innerHTML = DOMPurify.sanitize(`
                <p class="text font-body" style="margin-bottom: 10px;">This experience does not appear to support the 40% method (missing or invalid metadata).</p>
                <p class="text font-body" style="margin-bottom: 10px;">You can update the experience to fix this, or create a new one.</p>
            `);
            validationCreateBtn.style.display = 'block';
            validationUpdateBtn.style.display = 'block';
        } else if (reason === 'outdated') {
            container.innerHTML = DOMPurify.sanitize(`
                <p class="text font-body" style="margin-bottom: 10px;">Your game version is out of sync with the latest template.</p>
                <p class="text font-body" style="margin-bottom: 10px;">Please update your game to avoid issues with purchases.</p>
            `);
            validationUpdateBtn.style.display = 'block';
        } else {
             container.innerHTML = '<p class="text font-body">Validation failed. Please check your game settings.</p>';
        }

        manualPlaceIdCandidate = placeId;
        manualUniverseIdCandidate = universeId;

        viewMain.classList.add('sr-hidden');
        viewExistingGames.classList.add('sr-hidden');
        saveBtn.style.display = 'none';

        if (reason === 'outdated') {
            try {
                const vResp = await callRobloxApiJson({
                    subdomain: 'develop',
                    endpoint: '/v1/assets/latest-versions',
                    method: 'POST',
                    body: { assetIds: [placeId], versionStatus: 'Published' }
                });
                if (vResp && vResp.results && vResp.results.length > 0) {
                    initialUserPlaceVersion = vResp.results[0].versionNumber;
                }
            } catch (e) { console.error("RoValra: Failed to fetch initial place version", e); }
            viewUpdateInstructions.classList.remove('sr-hidden');
            return;
        }
        
        if (initialState && initialState.view === 'validation-warning') {

        }
        
        viewValidationWarning.classList.remove('sr-hidden');
    };

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
            groupDropdownContainer.innerHTML = DOMPurify.sanitize('<div class="text font-body" style="color: var(--rovalra-secondary-text-color);">Failed to load groups. Please refresh and try again.</div>');
        }
    };
    
    acknowledgeBtn.addEventListener('click', () => {
        if (manualPlaceIdCandidate !== null) {
            const placeIdToSave = manualPlaceIdCandidate;
            manualPlaceIdCandidate = null; 
            viewNonOwnerAck.classList.add('sr-hidden');
            safeSaveSettings(placeIdToSave, false, async () => {
                close();
                await showInitialConfirmation(placeIdToSave, false);
                onSave();
            });
        } else {
            viewNonOwnerAck.classList.add('sr-hidden');
            viewWIP.classList.remove('sr-hidden');
        }
    });

    manualAckBtn.addEventListener('click', () => {
        manualAckView.classList.add('sr-hidden');
        
        if (manualPlaceIdCandidate !== null) {
            const placeIdToSave = manualPlaceIdCandidate;
            manualPlaceIdCandidate = null; 

            safeSaveSettings(placeIdToSave, false, async () => {
                close();
                await showInitialConfirmation(placeIdToSave, false);
                onSave();
            });
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
                method: 'GET',
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
                loadingGames.innerHTML = DOMPurify.sanitize('<p class="text font-body">No experiences found for this group.</p>');
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
            loadingGames.innerHTML = DOMPurify.sanitize('<p class="text font-body">Failed to load games. Please try again.</p>');
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

            gameCard.innerHTML = DOMPurify.sanitize(`
                <div style="width: 100px; height: 100px; background: #bdbebe; border-radius: 4px; overflow: hidden; position: relative;">
                    ${game.thumbnailUrl ? `
                        <img src="${game.thumbnailUrl}" alt="${game.name}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover;">
                    ` : ''}
                </div>
                <div class="text font-body" style="margin-top: 8px; font-weight: 600; font-size: 14px; width: 100px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis; word-break: break-word;" title="${game.name}">${game.name}</div>
                <div class="text font-body" style="font-size: 12px; opacity: 0.7; width: 100px;">ID: ${game.rootPlaceId}</div>
            `);

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
        
        const validation = await validateGameSync(selectedGame.id, selectedGame.rootPlaceId);
        if (!validation.valid) {
            showValidationWarning(validation.reason, selectedGame.rootPlaceId, selectedGame.id, selectedGame.name);
            return;
        }

        manualPlaceIdCandidate = selectedGame.rootPlaceId;
        viewExistingGames.classList.add('sr-hidden');
        manualAckView.classList.remove('sr-hidden');
    });

    createNewGameBtn.addEventListener('click', async () => {
        if (!selectedGroupId) {
            alert('No group selected. Please try again.');
            return;
        }

        createNewGameBtn.disabled = true;
        createNewGameBtn.textContent = 'Preparing...';

        try {
            initialGroupGames = await fetchGamesForGroup(selectedGroupId);
            viewWIP.classList.add('sr-hidden');
            viewManualCreateInstructions.classList.remove('sr-hidden');
        } catch (e) {
            alert('Failed to fetch initial group games. Please try again.');
        } finally {
            createNewGameBtn.disabled = false;
            createNewGameBtn.textContent = 'Create New Experience';
        }
    });

    manualCreateBackBtn.addEventListener('click', () => {
        viewManualCreateInstructions.classList.add('sr-hidden');
        viewWIP.classList.remove('sr-hidden');
    });

    if (editGameLink) {
        editGameLink.addEventListener('click', async (e) => {
            e.preventDefault();
            await launchStudioForGame(ROVALRA_PLACE_ID);
        });
    }

    notFoundBackBtn.addEventListener('click', () => {
        viewGameNotFound.classList.add('sr-hidden');
        viewManualCreateInstructions.classList.remove('sr-hidden');
    });

    notFoundRetryBtn.addEventListener('click', () => {
        manualCreateDoneBtn.click();
    });

    manualCreateDoneBtn.addEventListener('click', async () => {
        viewManualCreateInstructions.classList.add('sr-hidden');
        viewGameNotFound.classList.add('sr-hidden');
        viewFindingGame.classList.remove('sr-hidden');
    
        try {
            await new Promise(resolve => setTimeout(resolve, 3000)); 
    
            const newGroupGames = await fetchGamesForGroup(selectedGroupId);
    
            const initialGameIds = new Set(initialGroupGames.map(g => g.rootPlaceId));
            const newGames = newGroupGames.filter(g => !initialGameIds.has(g.rootPlaceId));
    
            if (newGames.length === 1) {
                const newGame = newGames[0];
                const rootPlaceId = newGame.rootPlaceId;

                await updateGameDescription(newGame.id, ROVALRA_PLACE_ID);
    
                safeSaveSettings(rootPlaceId, false, async () => {
                    close();
                    await showInitialConfirmation(rootPlaceId, false);
                    onSave();
                });
            } else {
                viewFindingGame.classList.add('sr-hidden');
                viewGameNotFound.classList.remove('sr-hidden');
            }
        } catch (error) {
            console.error("Failed to find new experience:", error);
            viewFindingGame.classList.add('sr-hidden');
            viewGameNotFound.classList.remove('sr-hidden');
        }
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

    if (ownerWarningBackBtn) {
        ownerWarningBackBtn.addEventListener('click', () => {
            viewOwnerWarning.classList.add('sr-hidden');
            viewMain.classList.remove('sr-hidden');
            saveBtn.style.display = '';
            selectedGroupId = null;
            if (groupDropdown && groupDropdown.element) {
                const selectEl = groupDropdown.element.querySelector('select');
                if (selectEl) selectEl.value = '';
            }
        });
    }

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

    const handleUseAnyway = () => {
        if (manualPlaceIdCandidate !== null) {
            const placeIdToSave = manualPlaceIdCandidate;
            safeSaveSettings(placeIdToSave, false, () => {
                close();
                onSave();
            });
        } else { close(); onSave(); }
    };

    validationUseAnywayBtn.addEventListener('click', handleUseAnyway);

    validationCreateBtn.addEventListener('click', () => {
        viewValidationWarning.classList.add('sr-hidden');
        createNewGameBtn.click();
    });

    validationUpdateBtn.addEventListener('click', () => {
        viewValidationWarning.classList.add('sr-hidden');
        viewUpdateInstructions.classList.remove('sr-hidden');
    });

    updateUseAnywayBtn.addEventListener('click', handleUseAnyway);

    if (updateOpenStudioLink) {
        updateOpenStudioLink.addEventListener('click', async (e) => {
            e.preventDefault();
            await launchStudioForGame(ROVALRA_PLACE_ID);
        });
    }

    const verifyUpdate = async () => {
        const originalText = updateConfirmBtn.textContent;
        updateConfirmBtn.textContent = 'Verifying...';
        updateConfirmBtn.disabled = true;
        updateFailedRetryBtn.disabled = true;

        try {
            const vResp = await callRobloxApiJson({
                subdomain: 'develop',
                endpoint: '/v1/assets/latest-versions',
                method: 'POST',
                body: { assetIds: [manualPlaceIdCandidate], versionStatus: 'Published' },
            });

            let currentVersion = 0;
            if (vResp && vResp.results && vResp.results.length > 0) {
                currentVersion = vResp.results[0].versionNumber;
            }

            if (currentVersion > initialUserPlaceVersion) {
                if (manualUniverseIdCandidate)
                    await updateGameDescription(manualUniverseIdCandidate, ROVALRA_PLACE_ID);
                viewUpdateInstructions.classList.add('sr-hidden');
                manualAckView.classList.remove('sr-hidden');
            } else {
                viewUpdateInstructions.classList.add('sr-hidden');
                viewUpdateFailed.classList.remove('sr-hidden');
            }
        } catch (e) {
            console.error('RoValra: Update verification failed', e);
            viewUpdateInstructions.classList.add('sr-hidden');
            const p = viewUpdateFailed.querySelector('p');
            if (p) p.textContent = 'An error occurred while verifying the update. Please try again.';
            viewUpdateFailed.classList.remove('sr-hidden');
        } finally {
            updateConfirmBtn.textContent = originalText;
            updateConfirmBtn.disabled = false;
            updateFailedRetryBtn.disabled = false;
        }
    };

    updateConfirmBtn.addEventListener('click', verifyUpdate);

    updateFailedBackBtn.addEventListener('click', () => {
        viewUpdateFailed.classList.add('sr-hidden');
        viewUpdateInstructions.classList.remove('sr-hidden');
        const p = viewUpdateFailed.querySelector('p');
        if (p) p.textContent = "We didn't detect a new version. Please make sure you published the game to Roblox (File > Publish to Roblox As).";
    });

    updateFailedRetryBtn.addEventListener('click', () => {
        viewUpdateFailed.classList.add('sr-hidden');
        const p = viewUpdateFailed.querySelector('p');
        if (p) p.textContent = "We didn't detect a new version. Please make sure you published the game to Roblox (File > Publish to Roblox As).";
        verifyUpdate();
    });

    rovalraConfirmBtn.addEventListener('click', async () => {
        safeSaveSettings('ROVALRA_GROUP', true, async () => {
            close();
            await showInitialConfirmation('ROVALRA_GROUP', true);
            onSave();
        });
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
            
            const universeId = data[0].universeId;
            const gameName = data[0].name;
            const validation = await validateGameSync(universeId, parsedId);
            if (!validation.valid) {
                showValidationWarning(validation.reason, parsedId, universeId, gameName);
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
        manualAckView.classList.remove('sr-hidden');
    });

    if (initialState && initialState.view === 'validation-warning') {
        showValidationWarning(initialState.reason, initialState.placeId, initialState.universeId, initialState.gameName);
    } else {
        loadGroups();
    }
};



let joinDialogObserverInitialized = false;




const showFailureNotification = (errorDetails) => {
    let reason = errorDetails.errorMessage || errorDetails.purchaseResult || errorDetails.errorMsg || 'Unknown error';
    const purchased = errorDetails.purchased !== undefined ? errorDetails.purchased : 'Unknown';

    if (reason === 'NotForSale') {
        reason = `NotForSale – The item appears to be offsale or only available via resellers.
        The 40% method only works on items sold directly by the original seller (not resale listings).
        If it's a limited item being sold by resellers or temporarily offsale, this method will not work.`;
    }
    
    const bodyContent = document.createElement('div');
    bodyContent.innerHTML = DOMPurify.sanitize(`
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
    `);

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
    let universeId = null;

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
    confirmBody.innerHTML = DOMPurify.sanitize(`
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
                <li>Once you're in-game, the purchase prompt will show and you just buy the item using that.</li>
                <li>The item goes to you, ${(useRoValraGroup || savedPlaceId === 'ROVALRA_GROUP') ? 'and RoValra will earn a commission on your purchase which will help support the extension, at no extra cost for you.' : 'but 40% of the Robux goes to your group'}</li>
                ${(useRoValraGroup || savedPlaceId === 'ROVALRA_GROUP') ? '' : '<li>Robux will be pending for ~1 month</li>'}
            </ol>
        </div>
        
    `);

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

    confirmOverlay.addEventListener('click', (e) => {
        if (e.target === confirmOverlay) {
            e.stopPropagation();
            e.stopImmediatePropagation();
        }
    }, true);

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


const executeCartPurchase = async (cartItems, prefetchData = null, bypassValidation = false) => {
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
        let thumbnailMap;
        if (prefetchData && prefetchData.cartThumbnails) {
            thumbnailMap = await prefetchData.cartThumbnails;
        } else {
            thumbnailMap = await fetchThumbnails(itemIds, 'Asset', '150x150');
        }
        
        cartItems.forEach(item => {
            const thumbnailData = thumbnailMap.get(parseInt(item.id));
            if (thumbnailData && thumbnailData.state === 'Completed') {
                item.thumbnail = thumbnailData.imageUrl;
            }
        });
    } catch (error) {
        console.warn('RoValra: Could not fetch cart item thumbnails:', error);
    }

    let result;
    if (prefetchData && prefetchData.storage) {
        result = await prefetchData.storage;
    } else {
        result = await new Promise((resolve) => {
            chrome.storage.local.get(['RobuxPlaceId', 'useRoValraGroup'], resolve);
        });
    }

    const savedPlaceId = result.RobuxPlaceId;
    const useRoValraGroup = result.useRoValraGroup === true;
    
    if (!savedPlaceId) {
        alert('No saved Place ID. Please set one up first using the "Save Robux" button.');
        return;
    }

    let gameName = 'Unknown Experience';
    let gameThumbnailUrl = '';
    let actualPlaceId = savedPlaceId;
    let universeId = null;

    if (useRoValraGroup || savedPlaceId === 'ROVALRA_GROUP') {
        actualPlaceId = ROVALRA_PLACE_ID;
        gameName = 'RoValra Group Experience';
    }
    
    if (prefetchData && prefetchData.gameInfo) {
        try {
            const info = await prefetchData.gameInfo;
            if (info && info.data && info.data.length > 0) {
                gameName = info.data[0].name || 'Unknown Experience';
                universeId = info.data[0].universeId;
            }
            if (prefetchData.gameThumb) {
                gameThumbnailUrl = (await prefetchData.gameThumb) || '';
            }
        } catch (e) { console.warn('RoValra: Prefetch game info error', e); }
    } else {
        try {
            const gameData = await callRobloxApiJson({
                subdomain: 'games',
                endpoint: `/v1/games/multiget-place-details?placeIds=${actualPlaceId}`,
                method: 'GET'
            });
            
            if (gameData && gameData.length > 0) {
                gameName = gameData[0].name || 'Unknown Experience';
                universeId = gameData[0].universeId;
                
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
    }

    if (!useRoValraGroup && savedPlaceId !== 'ROVALRA_GROUP' && universeId && !bypassValidation) {
        const validation = await validateGameSync(universeId, actualPlaceId);
        if (!validation.valid) {
            let reason = validation.reason;
            if (reason === 'missing_metadata') {
                reason = 'outdated';
            }
            createAndShowPopup(() => {
                const freshPrefetch = prefetchData ? { ...prefetchData, storage: null, gameInfo: null, gameThumb: null } : null;
                executeCartPurchase(cartItems, freshPrefetch, true);
            }, { view: 'validation-warning', reason: reason, placeId: actualPlaceId, universeId: universeId, gameName: gameName });
            return;
        }
    }

    let userRobux = 0;
    if (prefetchData && prefetchData.balance) {
        try {
            const bal = await prefetchData.balance;
            userRobux = bal.robux || 0;
        } catch (e) {}
    } else {
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
    }
    
    ensureNotCancelled();
    
    let ownershipChecks;
    if (prefetchData && prefetchData.cartOwnership) {
        ownershipChecks = await prefetchData.cartOwnership;
    } else {
        ownershipChecks = await Promise.all(
            cartItems.map(item => checkItemOwnership(currentUserId, item.id, 'Asset'))
        );
    }
    
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
        errorBody.innerHTML = DOMPurify.sanitize(`
            <div style="padding: 20px; text-align: center;">
                <div style="font-size: 48px; margin-bottom: 16px;">✓</div>
                <h3 class="text font-header-2" style="margin: 0 0 12px 0;">All Items Already Owned</h3>
                <p class="text font-body" style="margin: 0;">You already own all ${cartItems.length} items in your cart. No purchase needed!</p>
            </div>
        `);
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
    finalConfirmBody.innerHTML = DOMPurify.sanitize(`
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
                <span class="text font-body" style="font-weight: 600; font-size: 13px;">${isDonating ? 'RoValra gets:' : 'You Save:'}</span>
                <span class="text font-body" style="font-size: 18px; font-weight: 700; display: flex; align-items: center; gap: 4px;"><span class="icon-robux-16x16"></span>${totalSavings.toLocaleString()}</span>
            </div>
        </div>
        ${robuxAfterPurchase < 0 ? '<div style="padding: 8px; border-radius: 4px; background: rgba(211, 47, 47, 0.1); margin-bottom: 8px; border: 1px solid rgba(211, 47, 47, 0.3);"><span class="text font-body" style="color: #d32f2f; font-weight: 600; font-size: 13px;">⚠️ Insufficient Balance</span></div>' : ''}
    `);

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

    finalConfirmOverlay.addEventListener('click', (e) => {
        if (e.target === finalConfirmOverlay) {
            e.stopPropagation();
            e.stopImmediatePropagation();
        }
    }, true);

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

    const placeIdToUse = (useRoValraGroup || savedPlaceId === 'ROVALRA_GROUP') ? actualPlaceId : savedPlaceId;
    
    const launchDataParts = itemsToPurchase.map(item => `asset:${item.id}`);
    const launchData = launchDataParts.join(',');

    launchMultiplayerGame(placeIdToUse, launchData);




};


const execute40MethodPurchase = async (itemId, robuxPrice, isGamePass = false, isBundle = false, itemDetails = null, prefetchData = null, bypassValidation = false) => {
    activePurchaseContext = { cancelled: false };
    const ctx = activePurchaseContext || { cancelled: false };
    const ensureNotCancelled = () => { if (ctx.cancelled) throw new Error('Purchase cancelled'); };
    const currentUserId = getCurrentUserId();
    if (!currentUserId) {
        alert("Could not identify your user ID. Please make sure you are logged in.");
        return;
    }

    let result;
    if (prefetchData && prefetchData.storage) {
        result = await prefetchData.storage;
    } else {
        result = await new Promise((resolve) => {
            chrome.storage.local.get(['RobuxPlaceId', 'useRoValraGroup'], resolve);
        });
    }

    const savedPlaceId = result.RobuxPlaceId;
    const useRoValraGroup = result.useRoValraGroup === true;
    
    if (!savedPlaceId) {
        alert('No saved Place ID. Please set one up first using the "Save Robux" button.');
        return;
    }

    
    let itemName = itemDetails?.name || 'Unknown Item';
    let itemThumbnail = itemDetails?.thumbnail || '';
    let assetType = null;

    if (prefetchData && prefetchData.itemDetails) {
        try {
            const details = await prefetchData.itemDetails;
            if (details && details.data && details.data[0]) {
                const item = details.data[0];
                if (!itemName || itemName === 'Unknown Item') itemName = item.name;
                assetType = item.assetType;
            }
        } catch (e) {}
    }

    if (itemId && ((!itemDetails || !itemDetails.thumbnail) || (!isGamePass && !isBundle))) {
        if (isGamePass) {
            try {
                const thumbnailMap = await fetchThumbnails(
                    [{ id: parseInt(itemId) }],
                    'GamePass',
                    '150x150'
                );
                const thumbnailData = thumbnailMap.get(parseInt(itemId));
                if (thumbnailData && thumbnailData.state === 'Completed') {
                    itemThumbnail = thumbnailData.imageUrl;
                }
            } catch (error) {
                console.warn('RoValra: Could not fetch game pass thumbnail:', error);
            }
        } else {
            try {
                const catalogData = await getItemDetails(itemId, isBundle ? 'Bundle' : 'Asset');
                
                if (catalogData && catalogData.data && catalogData.data.length > 0) {
                    const item = catalogData.data[0];
                    itemName = item.name || 'Unknown Item';
                    assetType = item.assetType;
                    
                    const itemIdForThumbnail = item.collectibleItemId || itemId;
                    let thumbnailType = 'Asset';
                    if (isBundle) thumbnailType = 'BundleThumbnail';
    
                    const thumbnailMap = await fetchThumbnails(
                        [{ id: parseInt(itemIdForThumbnail) }], 
                        thumbnailType,
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
    }

    let gameName = 'Unknown Experience';
    let gameThumbnailUrl = '';
    let actualPlaceId = savedPlaceId;
    let universeId = null;

    if (useRoValraGroup || savedPlaceId === 'ROVALRA_GROUP') {
        actualPlaceId = ROVALRA_PLACE_ID;
        gameName = 'RoValra Group Experience';
    }
    
    if (prefetchData && prefetchData.gameInfo) {
        try {
            const info = await prefetchData.gameInfo;
            if (info && info.data && info.data.length > 0) {
                universeId = info.data[0].universeId;
                gameName = info.data[0].name || 'Unknown Experience';
            }
            if (prefetchData.gameThumb) {
                gameThumbnailUrl = (await prefetchData.gameThumb) || '';
            }
        } catch (e) { console.warn('RoValra: Prefetch game info error', e); }
    } else {
        try {
            const gameData = await callRobloxApiJson({
                subdomain: 'games',
                endpoint: `/v1/games/multiget-place-details?placeIds=${actualPlaceId}`,
                method: 'GET'
            });
            
            if (gameData && gameData.length > 0) {
                gameName = gameData[0].name || 'Unknown Experience';
                universeId = gameData[0].universeId;
                
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
    }

    if (!useRoValraGroup && savedPlaceId !== 'ROVALRA_GROUP' && universeId && !bypassValidation) {
        const validation = await validateGameSync(universeId, actualPlaceId);
        if (!validation.valid) {
            let reason = validation.reason;
            if (reason === 'missing_metadata') {
                reason = 'outdated';
            }
            createAndShowPopup(() => {
                const freshPrefetch = prefetchData ? { ...prefetchData, storage: null, gameInfo: null, gameThumb: null } : null;
                execute40MethodPurchase(itemId, robuxPrice, isGamePass, isBundle, itemDetails, freshPrefetch, true);
            }, { view: 'validation-warning', reason: reason, placeId: actualPlaceId, universeId: universeId, gameName: gameName });
            return;
        }
    }
    

    ensureNotCancelled();
    
    let userRobux = 0;
    if (prefetchData && prefetchData.balance) {
        try {
            const bal = await prefetchData.balance;
            userRobux = bal.robux || 0;
        } catch (e) {}
    } else {
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
    }
    
    ensureNotCancelled();
    const robuxAfterPurchase = userRobux - robuxPrice;
    const isDonating = (useRoValraGroup || savedPlaceId === 'ROVALRA_GROUP');
    let savingsPercentage = isGamePass ? 0.10 : 0.40;

    await fetchCatalogMetadata();

    if (assetType && !isGamePass && !isBundle && assetToSubcategoryMap && classicClothingSubcategories) {
        const subcategoryId = assetToSubcategoryMap[String(assetType)];
        if (classicClothingSubcategories.includes(subcategoryId)) {
            if (robuxPrice < 10) {
                savingsPercentage = 0;
            } else {
                savingsPercentage = 0.10;
            }
        }
    }
    const robuxSaved = Math.floor(robuxPrice * savingsPercentage);
    
    const itemType = isGamePass ? 'GamePass' : (isBundle ? 'Bundle' : 'Asset');
    const alreadyOwned = (prefetchData && prefetchData.ownership) 
        ? await prefetchData.ownership 
        : await checkItemOwnership(currentUserId, itemId, itemType);
    
    if (alreadyOwned) {
        const ownedBody = document.createElement('div');
        ownedBody.innerHTML = DOMPurify.sanitize(`
            <div style="padding: 20px; text-align: center;">
                <div style="font-size: 48px; margin-bottom: 16px;">✓</div>
                <h3 class="text font-header-2" style="margin: 0 0 12px 0;">Already Owned</h3>
                <p class="text font-body" style="margin: 0 0 12px 0;">You already own this ${isGamePass ? 'game pass' : (isBundle ? 'bundle' : 'item')}:</p>
                <p class="text font-body" style="margin: 0; font-weight: 600;">${itemName}</p>
                <p class="text font-body" style="margin: 12px 0 0 0; opacity: 0.7;">No purchase needed!</p>
            </div>
        `);
        const { overlay, close } = createOverlay({
            title: 'Already Owned',
            bodyContent: ownedBody,
            actions: [],
            maxWidth: '400px',
            showLogo: true
        });
        return;
    }
    
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
        finalConfirmBody.innerHTML = DOMPurify.sanitize(`
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
                    <span class="text font-body" style="font-weight: 600; font-size: 13px;">${isDonating ? 'RoValra gets:' : 'You Save:'}</span>
                    <span class="text font-body" style="font-size: 18px; font-weight: 700; display: flex; align-items: center; gap: 4px;"><span class="icon-robux-16x16"></span>${robuxSaved.toLocaleString()}</span>
                </div>
            </div>
            ${robuxAfterPurchase < 0 ? '<div style="padding: 8px; border-radius: 4px; background: rgba(211, 47, 47, 0.1); margin-bottom: 8px; border: 1px solid rgba(211, 47, 47, 0.3);"><span class="text font-body" style="color: #d32f2f; font-weight: 600; font-size: 13px;">⚠️ Insufficient Balance</span></div>' : ''}
        `);

        const finalConfirmBtn = document.createElement('button');
        finalConfirmBtn.textContent = 'Join game to purchase';
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

        finalConfirmOverlay.addEventListener('click', (e) => {
            if (e.target === finalConfirmOverlay) {
                e.stopPropagation();
                e.stopImmediatePropagation();
            }
        }, true);

        const closeFinalConfirm = () => {
            if (!ctx.cancelled) ctx.cancelled = true;
            origCloseFinalConfirm();
        };

        const changeExperienceBtn = finalConfirmBody.querySelector('#change-experience-btn');
        if (changeExperienceBtn) {
            changeExperienceBtn.addEventListener('click', () => {
                closeFinalConfirm();
                createAndShowPopup(() => {
                    execute40MethodPurchase(itemId, robuxPrice, isGamePass, isBundle, itemDetails);
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

    ensureNotCancelled();
    let typePrefix = 'asset';
    if (isGamePass) typePrefix = 'gamepass';
    else if (isBundle) typePrefix = 'bundle';
    
    const launchData = `${typePrefix}:${itemId}`;
    
    const placeIdToUse = (useRoValraGroup || savedPlaceId === 'ROVALRA_GROUP') ? actualPlaceId : savedPlaceId;

    launchMultiplayerGame(placeIdToUse, launchData);


};

const addSaveButton = (modal) => {

    const modalWindow = modal.closest('.modal-window') || modal.closest('.simplemodal-wrap') || modal;
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

    async function addButtonWithElements({ buyNowButton, robuxPriceElement, buttonContainer, closeButton }) {
   
        const currentUserId = getCurrentUserId();
        const prefetchData = {
            storage: null,
            balance: null,
            gameInfo: null,
            gameThumb: null,
            ownership: null,
            itemDetails: null,
            cartOwnership: null,
            cartThumbnails: null
        };

        if (currentUserId) {
            prefetchData.storage = new Promise(resolve => chrome.storage.local.get(['RobuxPlaceId', 'useRoValraGroup'], resolve));
            
            prefetchData.balance = callRobloxApiJson({
                subdomain: 'economy',
                endpoint: `/v1/users/${currentUserId}/currency`,
                method: 'GET'
            }).catch(() => ({ robux: 0 }));

            prefetchData.gameInfo = prefetchData.storage.then(async (res) => {
                const savedPlaceId = res.RobuxPlaceId;
                const useRoValraGroup = res.useRoValraGroup === true;
                if (!savedPlaceId) return null;
                
                let actualPlaceId = savedPlaceId;
                if (useRoValraGroup || savedPlaceId === 'ROVALRA_GROUP') {
                    actualPlaceId = ROVALRA_PLACE_ID;
                }
                
                try {
                    const data = await callRobloxApiJson({
                        subdomain: 'games',
                        endpoint: `/v1/games/multiget-place-details?placeIds=${actualPlaceId}`,
                        method: 'GET'
                    });
                    return { data, actualPlaceId, useRoValraGroup, savedPlaceId };
                } catch (e) { return null; }
            });

            prefetchData.gameThumb = prefetchData.gameInfo.then(async (info) => {
                if (!info || !info.data || !info.data.length) return null;
                const universeId = info.data[0].universeId;
                if (!universeId) return null;
                try {
                    const map = await fetchThumbnails([{ id: universeId }], 'GameIcon', '150x150');
                    const d = map.get(universeId);
                    return (d && d.state === 'Completed') ? d.imageUrl : null;
                } catch (e) { return null; }
            });
        }

        const cartItems = getCartItems();
        const isMultiItemPurchase = cartItems.length >= 2;
        const isOnGamePage = /^\/([a-z]{2}(-[a-z]{2})?\/)?games\//i.test(window.location.pathname);
        
        let itemId = null;
        let isGamePassOnGamePage = false;
        let isMismatch = false;
        let capturedItemName = null;
        
        if (isMultiItemPurchase) {
            const batchItemsInModal = getBatchPurchaseItems(modalWindow);
            if (batchItemsInModal.length > 0) {
                isMismatch = !validateCartMatch(batchItemsInModal, cartItems);
                if (isMismatch) {
                    console.warn('Cart mismatch detected!');
                }
            }
        } else if (isOnGamePage) {
            const modalMessage = modalWindow.querySelector('.modal-message');
            const modalItemNameEl = modalMessage?.querySelector('.font-bold, strong');
            const modalItemPriceEl = modalMessage?.querySelector('.text-robux, .robux-text');
            
            if (modalItemNameEl && modalItemPriceEl) {
                const modalItemName = modalItemNameEl.textContent.trim();
                const modalItemPrice = parseInt(modalItemPriceEl.textContent.replace(/\D/g, ''), 10);
                capturedItemName = modalItemName;

                const universeId = getUniverseId();
                if (universeId) {
                    const gamePasses = await fetchGamePassesForUniverse(universeId);
                    const match = gamePasses.find(gp => (
                        (gp.name && gp.name.trim() === modalItemName) || 
                        (gp.displayName && gp.displayName.trim() === modalItemName)
                    ) && gp.price === modalItemPrice);
                    if (match) {
                        itemId = match.id;
                        isGamePassOnGamePage = true;
                    }
                }

                if (!itemId) {
                    const storeItems = document.querySelectorAll('#store-tab .list-item .store-card, .game-passes-list .list-item');
                    for (const itemCard of storeItems) {
                        const cardNameEl = itemCard.querySelector('.store-card-name, .item-card-name');
                        const cardPriceEl = itemCard.querySelector('.store-card-price .text-robux, .item-card-price .text-robux');
                        const cardLinkEl = itemCard.querySelector('a.store-card-link, a.item-card-link');

                        if (cardNameEl && cardPriceEl && cardLinkEl) {
                            const cardItemName = (cardNameEl.getAttribute('title') || cardNameEl.textContent).trim();
                            const cardItemPrice = parseInt(cardPriceEl.textContent.replace(/\D/g, ''), 10);

                            if (modalItemName === cardItemName && modalItemPrice === cardItemPrice) {
                                const href = cardLinkEl.getAttribute('href');
                                const match = href.match(/\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?game-pass\/(\d+)/i);
                                if (match) {
                                    itemId = match[1];
                                    isGamePassOnGamePage = true;
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }

        const isGamePass = /^\/([a-z]{2}(-[a-z]{2})?\/)?game-pass\//i.test(window.location.pathname) || isGamePassOnGamePage;
        const isBundle = /^\/([a-z]{2}(-[a-z]{2})?\/)?bundles\//i.test(window.location.pathname);

        if (!itemId) {
            if (cartItems.length === 1) {
                itemId = cartItems[0].id;
            } else if (!isOnGamePage) {
                itemId = getPlaceIdFromUrl(window.location.href);
            }
        }

        if (!itemId) return;

        if (currentUserId) {
            if (!isMultiItemPurchase && itemId) {
                const itemType = isGamePass ? 'GamePass' : (isBundle ? 'Bundle' : 'Asset');
                prefetchData.ownership = checkItemOwnership(currentUserId, itemId, itemType);
                if (!isGamePass && !isBundle) {
                    prefetchData.itemDetails = getItemDetails(itemId, 'Asset');
                }
            } else if (isMultiItemPurchase) {
                prefetchData.cartOwnership = Promise.all(cartItems.map(item => checkItemOwnership(currentUserId, item.id, 'Asset')));
                prefetchData.cartThumbnails = fetchThumbnails(cartItems.map(i => ({id: parseInt(i.id)})), 'Asset', '150x150');
            }
        }

        const robuxPrice = parseInt(robuxPriceElement.textContent.replace(/,/g, ''), 10);
        if (isNaN(robuxPrice)) return;

        await fetchCatalogMetadata();

        let assetType = null;
        if (!isGamePass && !isBundle && !isMultiItemPurchase && itemId) {
            try {
                const details = await getItemDetails(itemId, 'Asset');
                if (details && details.data && details.data[0]) {
                    assetType = details.data[0].assetType;
                }
            } catch (e) {
                console.warn('RoValra: Failed to fetch asset type for button text', e);
            }
        }

        let savingsPercentage = isGamePass ? 0.10 : 0.40;

        if (assetType && !isGamePass && !isBundle && assetToSubcategoryMap && classicClothingSubcategories) {
            const subcategoryId = assetToSubcategoryMap[String(assetType)];
            if (classicClothingSubcategories.includes(subcategoryId)) {
                if (robuxPrice < 10) {
                    savingsPercentage = 0;
                } else {
                    savingsPercentage = 0.10;
                }
            }
        }

        const savings = Math.floor(robuxPrice * savingsPercentage);
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
                errorBody.innerHTML = DOMPurify.sanitize(`
                    <div style="padding: 20px; text-align: center;">
                        <div style="font-size: 48px; margin-bottom: 16px; color: #d32f2f;">⚠️</div>
                        <h3 class="text font-header-2" style="margin: 0 0 12px 0; color: #d32f2f;">Cart Mismatch Detected</h3>
                        <p class="text font-body" style="margin: 0 0 12px 0;">The items in your purchase modal don't match what's in your cart.</p>
                        <p class="text font-body" style="margin: 0;">Please refresh the page and try again. If this issue persists, please report it in the RoValra Discord server.</p>
                    </div>
                `);
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
            if (isGamePassOnGamePage) {
                const modalImage = modalWindow.querySelector('.modal-image-container img, .modal-thumb');
                itemDetails = {
                    name: capturedItemName || 'Game Pass',
                    thumbnail: modalImage ? modalImage.src : null
                };
            } else if (!isMultiItemPurchase && itemId) {
                try {
                    const nameElement = document.querySelector('.item-details-name-row h1, .item-name-container h1');
                    const itemName = nameElement ? nameElement.textContent.trim() : 'Unknown Item';
                    
                    let itemThumbnail = null;
                    try {
                        let thumbnailType = 'Asset';
                        if (isGamePass) thumbnailType = 'GamePass';
                        else if (isBundle) thumbnailType = 'BundleThumbnail';

                        const thumbnailMap = await fetchThumbnails(
                            [{ id: parseInt(itemId) }], 
                            thumbnailType, 
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
                    
                } catch (error) {
                    console.warn('RoValra: Could not extract item details from page:', error);
                }
            }
            
            const result = await new Promise((resolve) => {
                chrome.storage.local.get('RobuxPlaceId', resolve);
            });

            if (!result.RobuxPlaceId) {
                createAndShowPopup(() => {
                    const freshPrefetch = prefetchData ? { ...prefetchData, storage: null, gameInfo: null, gameThumb: null } : null;
                    if (isMultiItemPurchase) {
                        executeCartPurchase(cartItems, freshPrefetch, true);
                    } else {
                        execute40MethodPurchase(itemId, robuxPrice, isGamePass, isBundle, itemDetails, freshPrefetch, true);
                    }
                });
            } else {
                if (isMultiItemPurchase) {
                    executeCartPurchase(cartItems, prefetchData);
                } else {
                    execute40MethodPurchase(itemId, robuxPrice, isGamePass, isBundle, itemDetails, prefetchData);
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
        }
    }
};



export function init() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get('SaveLotsRobuxEnabled', (result) => {
            if (result.SaveLotsRobuxEnabled === true) {
                fetchCatalogMetadata();
                detectAndAddSaveButton();
            }
        });
    } else {
        console.error('RoValra: Chrome storage API not available.');
    }
}
