import { observeElement } from '../../core/observer.js';
import { callRobloxApiJson } from '../../core/api.js';
import { getAssets } from '../../core/assets.js';
import { fetchThumbnails } from '../../core/thumbnail/thumbnails.js';
import DOMPurify from 'dompurify';

let currentMode = 'dark';

function removeHomeElement() {
    const homeElementToRemove = document.querySelector('li.cursor-pointer.btr-nav-node-header_home.btr-nav-header_home');
    if (homeElementToRemove) homeElementToRemove.remove();
}

function applyTheme(mode) {
    currentMode = mode;
    localStorage.setItem('hiddenCatalogMode', mode);
    document.documentElement.setAttribute('data-theme', mode);

    const contentDiv = document.querySelector('.content#content');
    if (contentDiv) {
        contentDiv.classList.toggle('light-mode', mode === 'light');
        contentDiv.classList.toggle('dark-mode', mode !== 'light');
    }

    const selectors = [
        '.hidden-catalog-header h1', 
        '.hidden-catalog-header img', 
        '#hidden-catalog-description', 
        '.item-name', 
        '.item-container', 
        '.shimmer', 
        '.icon-in-review'
    ];

    document.querySelectorAll(selectors.join(', ')).forEach(el => {
        el.classList.toggle('light-mode', mode === 'light');
        el.classList.toggle('dark-mode', mode !== 'light');
    });
}

async function fetchItemDetails(itemId) {
    try {
        const data = await callRobloxApiJson({ subdomain: 'economy', endpoint: `/v2/assets/${itemId}/details` });
        return data || null;
    } catch (err) {
        console.error('Failed to fetch item details for', itemId, err);
        return null;
    }
}

function displayApiError(message) {
    const contentDiv = document.querySelector('.content#content');
    if (!contentDiv) return;
    
    const existing = contentDiv.querySelector('.hidden-catalog-api-error');
    if (existing) existing.remove();

    const p = document.createElement('p');
    p.className = 'hidden-catalog-api-error';
    p.style.color = 'var(--danger, red)';
    p.style.padding = '16px';
    p.style.textAlign = 'center';
    p.textContent = message;
    
    const desc = document.getElementById('hidden-catalog-description');
    if (desc) {
        contentDiv.insertBefore(p, desc.nextSibling);
    } else {
        contentDiv.appendChild(p);
    }
}

async function displayItems(itemsWithDetails) {
    const contentDiv = document.querySelector('.content#content');
    if (!contentDiv) return;

    let wrapper = contentDiv.querySelector('.hidden-catalog.items-wrapper');
    if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.className = 'hidden-catalog items-wrapper';
        wrapper.style.display = 'grid';
        wrapper.style.gridTemplateColumns = 'repeat(auto-fill, minmax(221.75px, 1fr))';
        wrapper.style.gap = '5px';
        wrapper.style.width = '100%';
        wrapper.style.marginLeft = '30px';
        contentDiv.appendChild(wrapper);
    } else {
        wrapper.innerHTML = '';
    }

    itemsWithDetails.forEach(item => {
        const link = document.createElement('a');
        link.className = 'item-container';
        link.classList.add(currentMode === 'light' ? 'light-mode' : 'dark-mode');
        link.href = `https://www.roblox.com/catalog/${item.item_id}/${encodeURIComponent(item.name || 'Item')}`;
        link.style.display = 'flex';
        link.style.flexDirection = 'column';
        link.style.justifyContent = 'space-between';
        link.style.borderRadius = '8px';
        link.style.overflow = 'hidden';
        link.style.minHeight = '221.75px';
        link.style.width = '221.75px';
        link.style.cursor = 'pointer';

        const thumbWrap = document.createElement('div');
        thumbWrap.className = 'thumbnail-container';
        thumbWrap.style.position = 'relative';
        thumbWrap.style.height = '221.75px'; 
        thumbWrap.style.width = '100%';
        thumbWrap.style.borderRadius = '8px';
        thumbWrap.style.display = 'flex';
        thumbWrap.style.justifyContent = 'center';
        thumbWrap.style.alignItems = 'center';


        const shimmer = document.createElement('div');
        shimmer.className = 'thumbnail-2d-container shimmer';
        shimmer.classList.add(currentMode === 'light' ? 'light-mode' : 'dark-mode');
        shimmer.style.height = '221.75px'; 
        shimmer.style.width = '100%';
        shimmer.style.borderRadius = '8px';
        thumbWrap.appendChild(shimmer);

        if (item.details && item.details.ProductId !== 0) {
            const released = document.createElement('div');
            released.className = 'released-label';
            released.textContent = 'Released';
            released.style.position = 'absolute';
            released.style.left = '5px';
            released.style.top = '5px';
            released.style.background = '#e57b00';
            released.style.color = '#fff';
            released.style.padding = '5px';
            released.style.borderRadius = '5px';
            released.style.fontSize = '12px';
            released.style.fontWeight = 'bold';
            released.style.zIndex = '2';
            thumbWrap.appendChild(released);
        }

        const meta = document.createElement('div');
        meta.className = 'item-details';
        meta.style.padding = '10px 0';
        meta.style.display = 'flex';
        meta.style.flexDirection = 'column';
        meta.style.justifyContent = 'space-between';
        meta.style.height = '100%';

        const nameContainer = document.createElement('div');
        nameContainer.style.display = 'flex';
        nameContainer.style.flexDirection = 'column';
        nameContainer.style.gap = '2px';
        nameContainer.style.position = 'relative';

        const title = document.createElement('p');
        title.className = 'item-name';
        title.classList.add(currentMode === 'light' ? 'light-mode' : 'dark-mode');
        
        const displayName = item.name || 'Name Unavailable';
        const originalName = (item.details && item.details.Name) ? item.details.Name : displayName;
        title.textContent = displayName;

        title.style.fontWeight = '600';
        title.style.fontSize = '18px';
        title.style.margin = '0';
        title.style.paddingRight = '25px';
        title.style.overflow = 'hidden';
        title.style.textOverflow = 'ellipsis';
        title.style.whiteSpace = 'nowrap';

        if (item.details && item.details.Name && item.details.Name !== item.name) {
            const toggleButton = document.createElement('button');
            toggleButton.style.position = 'absolute';
            toggleButton.style.right = '5px';
            toggleButton.style.top = '0';
            toggleButton.style.padding = '2px 5px';
            toggleButton.style.fontSize = '13px';
            toggleButton.style.cursor = 'pointer';
            toggleButton.style.backgroundColor = 'transparent';
            toggleButton.style.border = '0px solid #666';
            toggleButton.textContent = '↺';
            toggleButton.title = 'Toggle original name';
            toggleButton.style.color = '#666';

            let showingOriginal = false;
            toggleButton.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (showingOriginal) {
                    title.textContent = displayName;
                    toggleButton.style.color = '#666';
                } else {
                    title.textContent = originalName;
                    toggleButton.style.color = 'var(--rovalra-main-text-color)';
                }
                showingOriginal = !showingOriginal;
            };
            nameContainer.appendChild(toggleButton);
        }

        nameContainer.appendChild(title);
        meta.appendChild(nameContainer);
        link.appendChild(thumbWrap);
        link.appendChild(meta);
        wrapper.appendChild(link);
    });

    try {
        const itemsForThumb = itemsWithDetails.map(it => ({ id: it.item_id }));
        const thumbnailMap = await fetchThumbnails(itemsForThumb, 'Asset', '250x250', false);

        const itemLinks = wrapper.querySelectorAll('.item-container');
        itemLinks.forEach((linkEl, index) => {
            const item = itemsWithDetails[index];
            const thumbContainer = linkEl.querySelector('.thumbnail-container');
            if (!thumbContainer) return;

            const releasedLabel = thumbContainer.querySelector('.released-label');
            const idKey = Number(item.item_id);
            const thumbData = thumbnailMap.get(idKey) || thumbnailMap.get(String(idKey));

            if (thumbData && thumbData.state === "InReview") {
                thumbContainer.innerHTML = '';
                if (releasedLabel) thumbContainer.appendChild(releasedLabel);

                const shimmerDiv = document.createElement('div');
                shimmerDiv.className = 'thumbnail-2d-container shimmer';
                shimmerDiv.classList.add(currentMode === 'light' ? 'light-mode' : 'dark-mode');
                shimmerDiv.style.height = '221.75px';
                shimmerDiv.style.width = '100%';
                shimmerDiv.style.borderRadius = '8px';
                thumbContainer.appendChild(shimmerDiv);

                setTimeout(() => {
                    thumbContainer.innerHTML = '';
                    if (releasedLabel) thumbContainer.appendChild(releasedLabel);

                    const inReviewDiv = document.createElement('div');
                    inReviewDiv.className = 'thumbnail-2d-container icon-in-review';
                    inReviewDiv.classList.add(currentMode === 'light' ? 'light-mode' : 'dark-mode');
                    inReviewDiv.style.height = '221.75px';
                    inReviewDiv.style.width = '100%';
                    inReviewDiv.style.borderRadius = '8px';
                    thumbContainer.appendChild(inReviewDiv);
                }, 6000);

            } else if (thumbData && thumbData.imageUrl) {
                thumbContainer.style.backgroundColor = 'rgb(78 78 78 / 20%)';
                
                let tempShimmer = thumbContainer.querySelector('.shimmer');
                if (!tempShimmer) {
                     tempShimmer = document.createElement('div');
                     tempShimmer.className = 'thumbnail-2d-container shimmer';
                     tempShimmer.classList.add(currentMode === 'light' ? 'light-mode' : 'dark-mode');
                     tempShimmer.style.height = '221.75px'; 
                     tempShimmer.style.width = '100%';
                     tempShimmer.style.borderRadius = '8px';
                     thumbContainer.appendChild(tempShimmer);
                }

                const img = document.createElement('img');
                img.src = thumbData.imageUrl;
                img.alt = item.name;
                img.className = 'item-thumbnail';
                img.style.width = '100%';
                img.style.height = '100%';
                img.style.objectFit = 'contain';
                img.style.borderRadius = '8px';
                img.style.display = 'none';

                img.onload = () => {
                    if (tempShimmer) tempShimmer.remove();
                    img.style.display = 'block';
                };
                img.onerror = () => {
                    thumbContainer.style.backgroundColor = '';
                    if (tempShimmer) tempShimmer.remove();
                    
                    const errShimmer = document.createElement('div');
                    errShimmer.className = 'thumbnail-2d-container shimmer';
                    errShimmer.classList.add(currentMode === 'light' ? 'light-mode' : 'dark-mode');
                    errShimmer.style.height = '221.75px';
                    errShimmer.style.borderRadius = '8px';
                    thumbContainer.appendChild(errShimmer);
                };
                
                thumbContainer.appendChild(img);

            } else {
                thumbContainer.innerHTML = '';
                if (releasedLabel) thumbContainer.appendChild(releasedLabel);
                thumbContainer.style.backgroundColor = '';

                const fallbackShimmer = document.createElement('div');
                fallbackShimmer.className = 'thumbnail-2d-container shimmer';
                fallbackShimmer.classList.add(currentMode === 'light' ? 'light-mode' : 'dark-mode');
                fallbackShimmer.style.height = '221.75px';
                fallbackShimmer.style.borderRadius = '8px';
                thumbContainer.appendChild(fallbackShimmer);
            }
        });
    } catch (err) {
        console.error('Hidden Catalog thumbnails error', err);
    }
}

async function fetchDataFromAPI(page = 1, limit = 24) {
    const apiUrl = `https://catalog.rovalra.com/items`;
    try {
        const requestHeaders = new Headers();
        requestHeaders.append('Accept', 'application/json, text/plain, */*');
        requestHeaders.append('Accept-Language', 'en-US,en-UK,en;q=0.9');
        requestHeaders.append('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

        const resp = await fetch(apiUrl, {
            method: 'GET',
            headers: requestHeaders,
            redirect: 'manual',
            cache: 'no-store'
        });

        if (!resp.ok) throw new Error(`Catalog responded ${resp.status}`);
        const json = await resp.json();
        
        const items = Array.isArray(json.items) ? json.items : [];
        if (items.length === 0) return [];

        const detailsPromises = items.map(it => fetchItemDetails(it.item_id));
        const details = await Promise.all(detailsPromises);
        const itemsWithDetails = items.map((it, idx) => ({ ...it, details: details[idx] }));
        return itemsWithDetails;
    } catch (err) {
        console.error('Hidden Catalog fetch failed', err);
        displayApiError('Failed to fetch hidden catalog items.');
        return [];
    }
}

export async function removeHiddenCatalogContent() {
    const contentDiv = document.querySelector('.content#content');
    if (!contentDiv) return;

    contentDiv.innerHTML = '';
    contentDiv.style.position = 'relative';

    const headerContainer = document.createElement('div');
    headerContainer.className = 'hidden-catalog-header';
    headerContainer.style.position = 'relative'; 
    headerContainer.style.display = 'flex';
    headerContainer.style.alignItems = 'center';
    headerContainer.style.marginBottom = '20px';

    const h1 = document.createElement('h1');
    h1.textContent = 'Hidden Catalog';
    h1.style.fontWeight = '800';
    h1.style.fontSize = '2em';
    h1.style.margin = '0';
    h1.style.padding = '10px 0'; 

    const img = document.createElement('img');
    img.src = getAssets().rovalraIcon
    img.alt = 'Hidden Catalog Icon';
    img.style.width = '32px';
    img.style.height = '32px';
    img.style.verticalAlign = 'middle';
    img.style.marginLeft = '10px';

    headerContainer.appendChild(h1);
    headerContainer.appendChild(img);
    contentDiv.appendChild(headerContainer);

    const desc = document.createElement('div');
    desc.id = 'hidden-catalog-description';
    desc.style.paddingTop = '10px';
    desc.style.paddingBottom = '20px';
    desc.innerHTML = DOMPurify.sanitize(`
        <p>The Hidden Catalog shows items uploaded by Roblox which are not yet on the marketplace.</p>
        <p><b>Roblox has patched this...</p>
        <p>Keep in mind that some of these items may never be released, as they could have been test uploads by Roblox.</p>
        <p>Most items will not have a thumbnail / mesh while being on the hidden catalog.</p>
        <p><b>To open the item page you will need <a href="https://www.roseal.live/" target="_blank" style="text-decoration: underline; color: inherit;">RoSeal</a></b></p>
    `);
    contentDiv.appendChild(desc);

    const items = await fetchDataFromAPI(1, 24);
    if (items.length > 0) {
        await displayItems(items);
    }
    
    applyTheme(currentMode);
}

export function init() {
    chrome.storage.local.get({ hiddenCatalogEnabled: false }, function(result) {
        if (!result.hiddenCatalogEnabled) return;

        window.addEventListener('themeDetected', (event) => {
            applyTheme(event.detail.theme);
        });
        
        const storedTheme = localStorage.getItem('hiddenCatalogMode') || document.documentElement.getAttribute('data-theme') || 'dark';
        applyTheme(storedTheme);

        observeElement('#navigation-robux-container a.robux-menu-btn', (robuxButtonLink) => {
            const container = document.getElementById('navigation-robux-container');
            if (container && container.style.display === 'none') {
                container.style.display = 'block';
            }

            robuxButtonLink.textContent = 'Hidden Catalog';
            robuxButtonLink.href = '/hidden-catalog';
            robuxButtonLink.target = '_self';
        });

        if (window.location.pathname.endsWith('/hidden-catalog')) {
            removeHiddenCatalogContent();
            removeHomeElement();
        }
    });
}