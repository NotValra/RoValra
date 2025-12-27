import { createOverlay } from '../../core/ui/overlay.js';
import { createButton } from '../../core/ui/buttons.js';
import { callRobloxApiJson, callRobloxApi } from '../../core/api.js';
import dompurify from 'dompurify';

export const init = async () => {
    // Check if the feature is enabled via settings
    const settings = await new Promise(resolve => {
        chrome.storage.local.get(['EnableVersionDownloader'], resolve);
    });

    if (!settings.EnableVersionDownloader) {
        return; 
    }

    const path = window.location.pathname;
    const match = path.match(/\/games\/(\d+)\//);
    
    if (match && match[1]) {
        const placeId = match[1];
        
        // Find the game title container to inject the button
        const buttonsContainer = document.querySelector('#game-details-carousel-container'); 
        if (buttonsContainer) {
            checkDownloadAvailability(placeId);
        } else {
             // Fallback: Use observer to wait for the container
             const observer = new MutationObserver((mutations) => {
                const container = document.querySelector('#game-details-carousel-container');
                if (container) {
                    observer.disconnect();
                    checkDownloadAvailability(placeId);
                }
             });
             observer.observe(document.body, { childList: true, subtree: true });
        }
    }
};

async function getAuthenticatedUser() {
    try {
        const response = await callRobloxApiJson({
            subdomain: 'users',
            endpoint: '/v1/users/authenticated'
        });
        return response.id;
    } catch (error) {
        console.error("RoValra: Failed to get authenticated user", error);
        return null;
    }
}

async function getPlaceMaxVersion(universeId) {
    try {
        const response = await callRobloxApiJson({
            subdomain: 'develop',
            endpoint: `/v2/universes/${universeId}/places?limit=50&extendedSettings=true`
        });
        
        const rootPlace = response.data.find(place => place.isRootPlace);
        if (rootPlace) {
            return rootPlace.currentSavedVersion;
        }
        return null;
    } catch (error) {
        console.error("RoValra: Failed to get place max version", error);
        return null;
    }
}

async function checkDownloadAvailability(placeId) {
    try {
        // 1. Get Universe ID from Place ID
        const universeData = await callRobloxApiJson({
            subdomain: 'apis',
            endpoint: `/universes/v1/places/${placeId}/universe`
        });
        
        const universeId = universeData.universeId;

        // 2. Check if copying is allowed (uncopylocked) OR if user is creator
        const gamesData = await callRobloxApiJson({
            subdomain: 'games',
            endpoint: `/v1/games?universeIds=${universeId}`
        });

        if (gamesData && gamesData.data && gamesData.data.length > 0) {
            const gameInfo = gamesData.data[0];
            const authenticatedUserId = await getAuthenticatedUser();
            
            const isCreator = gameInfo.creator && gameInfo.creator.type === "User" && gameInfo.creator.id === authenticatedUserId;

            if (gameInfo.copyingAllowed || isCreator) {
                injectDownloadButton(placeId, universeId);
            }
        }

    } catch (error) {
        console.error("RoValra: Failed to check download availability", error);
    }
}

function injectDownloadButton(placeId, universeId) {
    // Target the outer container which is less likely to be re-rendered by React
    const container = document.querySelector('#game-details-carousel-container');
    if (!container) return;

    // Ensure the container handles absolute positioning
    if (getComputedStyle(container).position === 'static') {
        container.style.position = 'relative';
    }

    const inject = () => {
        if (!container.querySelector('#rovalra-download-version-container')) {
             // Create wrapper for ALT style
             const wrapper = document.createElement('span');
             wrapper.id = 'rovalra-download-version-container';
             wrapper.className = 'tooltip-container btn-alt-text-container';
             
             // Absolute positioning for the wrapper
             Object.assign(wrapper.style, {
                 position: 'absolute',
                 top: '42px',  // User requested 42px
                 left: '10px',
                 zIndex: '10'
             });

            const downloadButton = document.createElement('button');
            downloadButton.type = 'button';
            // ALT button styling
            downloadButton.className = 'carousel-controls btn-alt-text';
            downloadButton.id = 'rovalra-download-version-btn';
            downloadButton.textContent = 'Download Version';
            
            // Custom styling for "extended" and "bigger" look
            Object.assign(downloadButton.style, {
                fontSize: '16px',      // Larger text as requested
                padding: '8px 20px',   // User requested 8px 25px
                height: 'auto',        // Ensure height fits content/padding
                whiteSpace: 'nowrap'   // Ensure text stays on one line
            });
            
            downloadButton.addEventListener('click', () => {
                 showVersionPicker(placeId, universeId);
            });
            
            wrapper.appendChild(downloadButton);
            container.appendChild(wrapper);
        }
    };

    // Initial injection
    inject();

    // Persistent observer to prevent disappearances
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            // Watch for childList changes to re-inject if removed
            if (mutation.type === 'childList') {
                inject();
            }
        }
    });
    
    observer.observe(container, { childList: true });
}

async function showVersionPicker(placeId, universeId) {
    const overlay = createOverlay({
        title: 'Select Version to Download',
        bodyContent: `
            <div style="padding: 10px; display: flex; flex-direction: column; gap: 10px;">
                <p>Loading version info...</p>
            </div>
        `,
        id: 'rovalra-version-picker-overlay'
    });
    
    const maxVersion = await getPlaceMaxVersion(universeId);
    updateOverlayContent(overlay, placeId, universeId, maxVersion);
}

function updateOverlayContent(overlay, placeId, universeId, maxVersion) {
    const rangeText = maxVersion !== null ? `(${1}-${maxVersion})` : '';
    const content = `
        <div style="padding: 10px; display: flex; flex-direction: column; gap: 10px; color: var(--text-color);">
            <p>Enter the version number you want to download.</p>
            <input type="number" id="rovalra-version-input" placeholder="Version Number ${rangeText}" min="1" ${maxVersion !== null ? `max="${maxVersion}"` : ''} style="padding: 8px; border-radius: 4px; border: 1px solid var(--divider-color); background: var(--background-color); color: var(--text-color);" />
            <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 10px;">
                <button id="rovalra-dl-confirm-btn" class="btn-primary-md">Download</button>
            </div>
            <p style="font-size: 12px; color: var(--text-secondary);">Note: File will be downloaded as Place_${placeId}_v{Version}.rbxl</p>
        </div>
    `;
    
    overlay.setContent(dompurify.sanitize(content, { ADD_ATTR: ['target', 'min', 'max'] })); 
    
    const confirmBtn = document.getElementById('rovalra-dl-confirm-btn');
    const input = document.getElementById('rovalra-version-input');
    
    // Focus input
    if (input) {
        input.focus();
        
        // Enforce max value while typing
        if (maxVersion !== null) {
            input.addEventListener('input', () => {
                const val = parseInt(input.value, 10);
                if (!isNaN(val)) {
                    if (val > maxVersion) {
                        input.value = maxVersion;
                    } else if (val < 1) {
                         input.value = 1;
                    }
                }
            });
        }
    }

    confirmBtn.addEventListener('click', () => {
        const version = parseInt(input.value, 10);
        
        if (isNaN(version) || version < 1) {
             alert('Please enter a valid version number (1 or higher).');
             return;
        }

        if (maxVersion !== null && version > maxVersion) {
            alert(`Version cannot be higher than the current saved version (${maxVersion}).`);
            return;
        }

        handleDownloadClick(placeId, version, overlay);
    });
}

async function handleDownloadClick(placeId, version, overlay) {
    const confirmBtn = document.getElementById('rovalra-dl-confirm-btn');
    if (confirmBtn) {
        confirmBtn.innerText = 'Downloading...';
        confirmBtn.disabled = true;
    }

    try {
        const endpoint = `https://assetdelivery.roblox.com/v1/asset/?id=${placeId}&version=${version}`;
        const filename = `Place_${placeId}_v${version}.rbxl`;

        chrome.runtime.sendMessage({
            action: 'downloadVersion',
            url: endpoint,
            filename: filename
        }, (response) => {
            if (response && response.success) {
                overlay.close();
            } else {
                console.error("Download Error:", response ? response.error : chrome.runtime.lastError);
                alert(`Failed to download version ${version}. Ensure it exists and you have permissions.`);
            }
            
            if (confirmBtn) {
                confirmBtn.innerText = 'Download';
                confirmBtn.disabled = false;
            }
        });

    } catch (error) {
        console.error("Download Error:", error);
        alert(`Failed to download version ${version}. Ensure it exists and you have permissions.`);
        if (confirmBtn) {
            confirmBtn.innerText = 'Download';
            confirmBtn.disabled = false;
        }
    }
}
