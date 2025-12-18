
import { checkAssetsInBatch } from '../../core/utils/assetStreamer.js';
import { createDropdown } from '../../core/ui/dropdown.js';
import { observeElement, startObserving } from '../../core/observer.js';
import { callRobloxApi } from '../../core/api.js';
import { fetchThumbnails, createThumbnailElement } from '../../core/thumbnail/thumbnails.js';
import { getAssets } from '../../core/assets.js'; 


const THUMBNAIL_SIZE = '150x150';

const DEPENDENCY_CSS = `

    .rovalra-dep-panel-content {
        width: 100%; 
        height: 100%;
        box-sizing: border-box;
        padding: 12px;
    }

    .rovalra-dep-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(126px, 1fr)); 
        gap: 12px;
    }

    .rovalra-dep-grid .item-card-container {
        width: 100% !important;
        float: none !important;
        margin: 0 !important;
        height: auto !important;
    }
    
    .rovalra-dep-grid .item-card-link {
        display: block;
        width: 100%;
        cursor: pointer;
    }

    .rovalra-dep-grid .item-card-thumb-container {
        width: 100%;
        height: 100%;
        position: relative;
    }

    .rovalra-dep-grid .thumbnail-2d-container {
        display: block;
        width: 100%;
        padding-top: 100%; 
        position: relative;
        overflow: hidden;
        border-radius: 4px;
    }

    .rovalra-dep-grid .item-card-name {
        font-size: 14px;
        margin-top: 4px;
        font-weight: 600;
        color: var(--rovalra-main-text-color);
    }

    .rovalra-dep-grid .item-card-creator {
        margin-top: 2px;
    }

    #rovalra-dep-container {
        margin-top: 8px;
        width: 100%;
        clear: both;
    }
`;

function injectStyles() {
    if (document.getElementById('rovalra-dep-styles')) return;
    const target = document.head || document.documentElement;
    if (!target) return;
    const style = document.createElement('style');
    style.id = 'rovalra-dep-styles';
    style.textContent = DEPENDENCY_CSS;
    target.appendChild(style);
}

function findDependencies(roots) {
    const dependencies = [];
    const idRegex = /(?:rbxassetid:\/\/|id=)(\d+)/i;
    
    const ignoredProperties = ['ShirtTemplate', 'PantsTemplate', 'Graphic'];

    const extractId = (str) => {
        if (!str || typeof str !== 'string') return null;
        const match = str.match(idRegex);
        return match ? match[1] : null;
    };

    function traverse(instance) {
        if (!instance) return;
        if (instance.Properties) {
            for (const [propName, propValue] of Object.entries(instance.Properties)) {
                if (ignoredProperties.includes(propName)) continue;

                const id = extractId(propValue);
                if (id && id !== '0') {
                    let typeName = propName.replace('Id', '');
                    if (typeName === 'Texture') typeName = 'Image';
                    if (typeName === 'Mesh') typeName = 'Mesh';
                    
                    dependencies.push({ assetId: id, type: typeName, source: instance.ClassName });
                }
            }
        }
        if (instance.Children) instance.Children.forEach(child => traverse(child));
    }

    roots.forEach(root => traverse(root));
    return Array.from(new Map(dependencies.map(item => [item.assetId, item])).values());
}

async function fetchAssetDetails(assetIds) {
    if (!assetIds || assetIds.length === 0) return new Map();

    const promises = assetIds.map(async (id) => {
        try {
            const response = await callRobloxApi({
                subdomain: 'economy',
                endpoint: `/v2/assets/${id}/details`,
                method: 'GET'
            });
            if (!response.ok) return null;
            return await response.json();
        } catch (e) { return null; }
    });

    const results = await Promise.all(promises);
    
    const detailsMap = new Map();
    results.forEach(data => {
        if (data && data.AssetId) {
            detailsMap.set(data.AssetId.toString(), {
                name: data.Name,
                creatorName: data.Creator?.Name || 'Unknown',
                creatorId: data.Creator?.CreatorTargetId || data.Creator?.Id,
                creatorType: data.Creator?.CreatorType || 'User',
                isVerified: data.Creator?.HasVerifiedBadge || false,
                productType: data.AssetTypeId 
            });
        }
    });
    return detailsMap;
}

async function mountDependencyScanner(favButton) {
    if (favButton.dataset.rovalraScanning === 'true') return;

    if (favButton.nextSibling?.id === 'rovalra-dep-container' || document.getElementById('rovalra-dep-container')) return;
    const parent = favButton.parentNode;
    if (!parent) return;

    favButton.dataset.rovalraScanning = 'true';

    const urlMatch = window.location.pathname.match(/\/(?:catalog|bundles|hidden-catalog)\/(\d+)/);
    if (!urlMatch) return; 
    const mainAssetId = parseInt(urlMatch[1], 10);

    try {
        const results = await checkAssetsInBatch([mainAssetId]);
        const assetData = results[0];

        if (!assetData?.isValid || !assetData?.root) {
            return; 
        }

        const deps = findDependencies(assetData.root);
        if (deps.length === 0) {
            return; 
        }

        injectStyles();

        if (document.getElementById('rovalra-dep-container')) return;

        const uiContainer = document.createElement('div');
        uiContainer.id = 'rovalra-dep-container';
        parent.insertBefore(uiContainer, favButton.nextSibling);

        const dropdown = createDropdown({ items: [], placeholder: 'Scan Dependencies', onValueChange: () => {} });
        dropdown.trigger.style.width = '100%';
        dropdown.trigger.style.justifyContent = 'space-between';
        dropdown.trigger.style.height = '32px';
        uiContainer.appendChild(dropdown.element);

        dropdown.trigger.querySelector('span').textContent = `Loading Info (${deps.length})...`;
        
        const thumbnailItems = deps.map(d => ({ id: d.assetId }));
        const rawIds = deps.map(d => d.assetId);

        const [thumbMap, detailsMap] = await Promise.all([
            fetchThumbnails(thumbnailItems, 'Asset', THUMBNAIL_SIZE),
            fetchAssetDetails(rawIds)
        ]);

        dropdown.trigger.querySelector('span').textContent = `Dependencies`;

        const panel = dropdown.panel;
        
        const columns = Math.min(Math.max(deps.length, 1), 6);
        const dynamicWidth = (columns * 138) + 24 + 30;
        
        panel.style.width = `${dynamicWidth}px`;
        panel.style.maxWidth = '90vw'; 
        panel.style.maxHeight = '600px';
        panel.style.overflowY = 'auto';

        panel.innerHTML = '';
        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'rovalra-dep-panel-content';
        const grid = document.createElement('div');
        grid.className = 'rovalra-dep-grid';
        
        const assets = getAssets();

        deps.forEach(dep => {
            const details = detailsMap.get(dep.assetId) || { name: `Asset ${dep.assetId}`, creatorName: 'Unknown', isVerified: false };
            const assetLinkUrl = `https://create.roblox.com/store/asset/${dep.assetId}`;
            const thumbData = thumbMap.get(parseInt(dep.assetId));

            const creatorUrl = details.creatorType === 'Group' 
                ? `/groups/${details.creatorId}/about`
                : `/users/${details.creatorId}/profile`;

            const container = document.createElement('div');
            container.className = 'item-card-container';

            const mainLink = document.createElement('a'); 
            mainLink.className = 'item-card-link';
            mainLink.href = assetLinkUrl;
            mainLink.onclick = (e) => { 
                if (!e.target.closest('.creator-name')) {
                    return true; 
                }
                e.preventDefault(); 
            };

            const linkInnerDiv = document.createElement('div');
            linkInnerDiv.className = 'item-card-link';

            const thumbContainer = document.createElement('div');
            thumbContainer.className = 'item-card-thumb-container';

            const thumb2d = document.createElement('span');
            thumb2d.className = 'thumbnail-2d-container';

            const thumbEl = createThumbnailElement(
                thumbData, 
                details.name, 
                '', 
                { position: 'absolute', top: '0', left: '0', width: '100%', height: '100%', objectFit: 'contain' }
            );

            thumb2d.appendChild(thumbEl);
            thumbContainer.appendChild(thumb2d);
            linkInnerDiv.appendChild(thumbContainer);
            mainLink.appendChild(linkInnerDiv);

            const caption = document.createElement('div');
            caption.className = 'item-card-caption';

            const nameLink = document.createElement('div');
            nameLink.className = 'item-card-name-link';
            
            const nameDiv = document.createElement('div');
            nameDiv.className = 'item-card-name';
            nameDiv.title = details.name;
            nameDiv.textContent = details.name;

            nameLink.appendChild(nameDiv);
            caption.appendChild(nameLink);

            const secondary = document.createElement('div');
            secondary.className = 'item-card-secondary-info text-secondary';

            const creatorDiv = document.createElement('div');
            creatorDiv.className = 'text-overflow item-card-creator';
            
            const creatorText = document.createElement('span');
            creatorText.className = 'item-card-creator-text';
            
            let badgeHtml = '';
            if (details.isVerified) {
                badgeHtml = `<img src="${assets.verifiedBadge}" title="Verified Badge" alt="Verified Badge" class="verified-badge-container">`;
            }
            
            creatorText.innerHTML = `By <a href="${creatorUrl}" class="creator-name text-link">${details.creatorName} ${badgeHtml}</a>`;
            
            creatorDiv.appendChild(creatorText);
            secondary.appendChild(creatorDiv);

            const typeDiv = document.createElement('div');
            typeDiv.className = 'text-overflow item-card-type';
            
            const typeText = document.createElement('span');
            typeText.className = 'item-card-type-text';
            typeText.textContent = dep.type;

            typeDiv.appendChild(typeText);
            secondary.appendChild(typeDiv);

            caption.appendChild(secondary);
            mainLink.appendChild(caption);
            
            container.appendChild(mainLink);
            grid.appendChild(container);
        });

        contentWrapper.appendChild(grid);
        panel.appendChild(contentWrapper);

    } catch (error) {
        console.warn('[Rovalra Scanner] Silent failure:', error);
    }
}

export function init() {
    chrome.storage.local.get('EnableItemDependencies', (data) => {
        if (data.EnableItemDependencies === true) {
            startObserving();
            observeElement('#favorites-button', (el) => mountDependencyScanner(el));
        }
    });
}