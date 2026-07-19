import { getAssetIdFromUrl } from '../../core/idExtractor.js';
import { checkAssetsInBatch } from '../../core/utils/assetStreamer.js';
import { observeElement } from '../../core/observer.js';
import { callRobloxApi } from '../../core/api.js';
import { getAssets } from '../../core/assets.js';
import { ts } from '../../core/locale/i18n.js';
import { createDropdownContent } from '../../core/ui/selects.js';
import { API, fileMeshToTHREEGeometry } from 'roavatar-renderer';
import * as THREE from 'three';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';

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

async function downloadObj(meshAssetId) {
    const fileMesh = await API.Asset.GetMesh(meshAssetId.toString());
    if (!fileMesh || fileMesh instanceof Response) {
        throw new Error('RoAvatar could not load the mesh');
    }

    const geometry = fileMeshToTHREEGeometry(fileMesh, false);
    const mesh = new THREE.Mesh(geometry);
    mesh.name = meshAssetId.toString();
    mesh.updateMatrixWorld(true);

    try {
        const obj = new OBJExporter().parse(mesh);
        saveAsFile(obj, `${meshAssetId}.obj`, 'text/plain');
    } finally {
        geometry.dispose();
    }
}

async function getAssetDeliveryInfo(assetId) {
    try {
        const response = await callRobloxApi({
            subdomain: 'assetdelivery',
            endpoint: '/v2/assets/batch',
            method: 'POST',
            body: [
                {
                    requestId: assetId.toString(),
                    assetId: assetId,
                },
            ],
            sanitize: false,
        });

        if (response.ok) {
            const data = await response.json();
            if (data && data.length > 0) {
                const item = data[0];
                if (item.locations && item.locations.length > 0) {
                    return {
                        location: item.locations[0].location,
                        assetTypeId: item.assetTypeId,
                    };
                }
                return { location: null, assetTypeId: item.assetTypeId };
            }
        }
    } catch (e) {
        console.error('[RoValra DL] Failed to fetch asset location:', e);
    }

    return null;
}

async function downloadAsset(assetId, format, deliveryInfo = null) {
    const assetDelivery = deliveryInfo || (await getAssetDeliveryInfo(assetId));
    const assetLocation = assetDelivery?.location;
    const assetTypeId = assetDelivery?.assetTypeId;

    if (format === 'obj' && (assetTypeId === 4 || assetTypeId === 40)) {
        try {
            await downloadObj(assetId);
        } catch (e) {
            console.error(`[RoValra DL] Failed to export OBJ:`, e);
        }
        return;
    }

    if (assetLocation) {
        try {
            const response = await fetch(assetLocation); // Verified
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const arrayBuffer = await response.arrayBuffer();

            const typeMap = {
                1: 'png',
                3: 'ogg',
                4: 'mesh',
                9: 'rbxl',
                10: 'rbxm',
                11: 'png',
                12: 'png',
                13: 'png',
                24: 'rbxm',
                38: 'rbxm',
                40: 'mesh',
            };
            const ext = typeMap[assetTypeId] || 'bin';

            saveAsFile(
                arrayBuffer,
                `${assetId}.${ext}`,
                'application/octet-stream',
            );

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

    saveAsFile(
        serializedData,
        `${assetId}.${fileExtension}`,
        'application/octet-stream',
    );
}

async function addButton(buttonContainer) {
    let assetId = getAssetIdFromUrl();
    if (!assetId) {
        const match = window.location.pathname.match(/\/store\/asset\/(\d+)/);
        if (match) assetId = match[1];
    }

    if (
        !assetId ||
        document.getElementById('rovalra-download-asset-btn') ||
        buttonContainer.dataset.rovalraDownloadButtonPending === 'true'
    ) {
        return;
    }

    buttonContainer.dataset.rovalraDownloadButtonPending = 'true';

    const targetContainer =
        buttonContainer.firstElementChild || buttonContainer;
    const assets = getAssets();
    const deliveryInfo = await getAssetDeliveryInfo(assetId);
    if (document.getElementById('rovalra-download-asset-btn')) {
        delete buttonContainer.dataset.rovalraDownloadButtonPending;
        return;
    }
    const isMesh =
        deliveryInfo?.assetTypeId === 4 || deliveryInfo?.assetTypeId === 40;

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
        fontFamily: 'inherit',
    });

    const icon = document.createElement('div');
    Object.assign(icon.style, {
        width: '24px',
        height: '24px',
        marginRight: '4px',
        backgroundColor: 'currentColor',
        webkitMask: `url("${assets.downloadIcon}") no-repeat center / contain`,
        mask: `url("${assets.downloadIcon}") no-repeat center / contain`,
    });

    const text = document.createElement('span');
    text.textContent = ts('createRoblox.download');

    downloadButton.appendChild(icon);
    downloadButton.appendChild(text);

    downloadButton.addEventListener('mouseenter', () => {
        text.style.textDecoration = 'underline';
    });
    downloadButton.addEventListener('mouseleave', () => {
        text.style.textDecoration = 'none';
    });

    if (isMesh) {
        downloadButton.setAttribute('role', 'combobox');
        downloadButton.setAttribute('aria-haspopup', 'listbox');
        downloadButton.setAttribute('aria-expanded', 'false');

        const { element: dropdownPanel, toggleVisibility } =
            createDropdownContent(
                downloadButton,
                [
                    { value: 'mesh', label: ts('createRoblox.downloadMesh') },
                    { value: 'obj', label: ts('createRoblox.downloadObj') },
                ],
                null,
                (format) => downloadAsset(assetId, format, deliveryInfo),
                () => {},
            );

        downloadButton.onclick = (event) => {
            event.stopPropagation();
            toggleVisibility();
        };
        dropdownPanel.addEventListener('click', (event) => {
            event.stopPropagation();
        });
        document.addEventListener('click', (event) => {
            if (
                !dropdownPanel.contains(event.target) &&
                !downloadButton.contains(event.target) &&
                dropdownPanel.getAttribute('data-state') === 'open'
            ) {
                toggleVisibility(false);
            }
        });
    } else {
        downloadButton.onclick = () => {
            downloadAsset(assetId, null, deliveryInfo);
        };
    }

    targetContainer.prepend(downloadButton);
    delete buttonContainer.dataset.rovalraDownloadButtonPending;
}

export function init() {
    if (!window.location.href.includes('/store/asset/')) {
        return;
    }

    chrome.storage.local.get({ DownloadCreateEnabled: true }, (result) => {
        if (result.DownloadCreateEnabled) {
            observeElement(
                '[data-testid="assetButtonsDeprecatedTestId"]',
                (buttonContainer) => {
                    addButton(buttonContainer);
                },
            );

            observeElement(
                '[data-testid="assetButtonsTestId"]',
                (buttonContainer) => {
                    addButton(buttonContainer);
                },
            );
        }
    });
}
