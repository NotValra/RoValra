import { getAssetIdFromUrl } from '../../core/idExtractor.js';
import { checkAssetsInBatch } from '../../core/utils/assetStreamer.js';
import { observeElement } from '../../core/observer.js';
import { callRobloxApi } from '../../core/api.js';
import { getAssets } from '../../core/assets.js';


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
            const response = await fetch(assetLocation); // Verified
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const arrayBuffer = await response.arrayBuffer();
            
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

    const assetData = await checkAssetsInBatch([assetId]);
    const asset = assetData[0];

    if (!asset || !asset.isValid || !asset.root) {
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
    const assets = getAssets();

    const downloadButton = document.createElement('button');
    downloadButton.id = 'rovalra-download-asset-btn';
    Object.assign(downloadButton.style, {
        display: 'flex',
        alignItems: 'center',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        padding: '0',
        marginRight: '10px',
        color: 'inherit',
        fontWeight: 'bold',
        fontSize: '14px',
        fontFamily: 'inherit'
    });

    const icon = document.createElement('div');
    Object.assign(icon.style, {
        width: '24px',
        height: '24px',
        marginRight: '4px',
        backgroundColor: 'currentColor',
        webkitMask: `url("${assets.downloadIcon}") no-repeat center / contain`,
        mask: `url("${assets.downloadIcon}") no-repeat center / contain`
    });

    const text = document.createElement('span');
    text.textContent = 'Download';

    downloadButton.appendChild(icon);
    downloadButton.appendChild(text);

    downloadButton.addEventListener('mouseenter', () => {
        text.style.textDecoration = 'underline';
    });
    downloadButton.addEventListener('mouseleave', () => {
        text.style.textDecoration = 'none';
    });

    downloadButton.onclick = () => {
        downloadAsset(assetId);
    };

    targetContainer.prepend(downloadButton);
}

export function init() {
    if (!window.location.href.includes('/store/asset/')) {
        return;
    }

    chrome.storage.local.get({ DownloadCreateEnabled: true }, (result) => {
        if (result.DownloadCreateEnabled) {
            observeElement('[data-testid="assetButtonsTestId"]', (buttonContainer) => {
                addButton(buttonContainer);
            });
        }
    });
}