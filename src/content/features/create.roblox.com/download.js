import { getAssetIdFromUrl } from '../../core/idExtractor.js';
import { checkAssetsInBatch } from '../../core/utils/assetStreamer.js';
import { createButton } from '../../core/ui/buttons.js';
import { observeElement } from '../../core/observer.js';
import { callRobloxApi } from '../../core/api.js';
import { MeshConverter } from '../../core/utils/meshConverter.js';


function saveAsFile(data, fileName, mimeType) {
    const blob = new Blob([data], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

async function downloadAsset(assetId) {
    console.log(`[RoValra DL] Starting download for asset: ${assetId}`);
    
    let assetLocation = null;
    let assetTypeId = null;

    try {
        const response = await callRobloxApi({
            subdomain: 'assetdelivery',
            endpoint: '/v2/assets/batch',
            method: 'POST',
            body: [{
                requestId: assetId.toString(),
                assetId: assetId,
            }],
            sanitize: false
        });

        if (response.ok) {
            const data = await response.json();
            if (data && data.length > 0) {
                const item = data[0];
                if (item.locations && item.locations.length > 0) {
                    assetLocation = item.locations[0].location;
                }
                assetTypeId = item.assetTypeId;
            }
        }
    } catch (e) {
        console.error('[RoValra DL] Failed to fetch asset location:', e);
    }

    if (assetLocation) {
        try {
            console.log(`[RoValra DL] Fetching raw asset from: ${assetLocation}`);
            const response = await fetch(assetLocation);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const arrayBuffer = await response.arrayBuffer();
            

            if (assetTypeId === 4 || assetTypeId === 40) {
                try {
                    console.log('[RoValra DL] Mesh detected. Attempting OBJ conversion...');
                    const objData = await MeshConverter.convertToObj(arrayBuffer);
                    saveAsFile(objData, `${assetId}.obj`, 'text/plain');
                    return; 
                } catch (convErr) {
                    console.error('[RoValra DL] Mesh conversion failed, downloading raw .mesh instead.', convErr);
                }
            }

            const typeMap = {
                1: 'png', 3: 'ogg', 4: 'mesh', 9: 'rbxl', 10: 'rbxm', 
                11: 'png', 12: 'png', 13: 'png', 24: 'rbxm', 38: 'rbxm', 40: 'mesh'
            };
            const ext = typeMap[assetTypeId] || 'bin';
            
            saveAsFile(arrayBuffer, `${assetId}.${ext}`, 'application/octet-stream');
            return;

        } catch (e) {
            console.error(`[RoValra DL] Failed to process raw asset:`, e);
        }
    }

    console.log('[RoValra DL] Falling back to AssetStreamer...');
    const assetData = await checkAssetsInBatch([assetId]);
    const asset = assetData[0];

    if (!asset || !asset.isValid || !asset.root) {
        console.error(`Failed to download or parse asset: ${assetId}`);
        return;
    }

    let serializedData;
    let fileExtension;

    if (asset.format === 'RBXM') {
        serializedData = asset.root;
        fileExtension = 'rbxm';
    } else if (asset.format === 'XML') {
        serializedData = JSON.stringify(asset.root, null, 2);
        fileExtension = 'rbxmx';
    } else {
        console.error(`Unknown asset format: ${asset.format}`);
        return;
    }

    saveAsFile(serializedData, `${assetId}.${fileExtension}`, 'application/octet-stream');
}

function addButton(buttonContainer) {
    let assetId = getAssetIdFromUrl();
    if (!assetId) {
        const match = window.location.pathname.match(/\/store\/asset\/(\d+)/);
        if (match) assetId = match[1];
    }

    if (!assetId || document.getElementById('rovalra-download-asset-btn')) {
        return;
    }

    const targetContainer = buttonContainer.firstElementChild || buttonContainer;

    const downloadButton = createButton('Download', 'secondary', {
        id: 'rovalra-download-asset-btn',
        onClick: () => {
            downloadAsset(assetId);
        }
    });

    downloadButton.style.marginLeft = '10px';
    targetContainer.appendChild(downloadButton);
}

export function init() {
    if (!window.location.href.includes('/store/asset/')) {
        return;
    }

    observeElement('[data-testid="assetButtonsTestId"]', (buttonContainer) => {
        addButton(buttonContainer);
    });
}