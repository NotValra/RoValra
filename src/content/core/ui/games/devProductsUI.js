import { createThumbnailElement } from '../../thumbnail/thumbnails.js';

export function createDevProductCard({ id, name, price, thumbnail, universeId }) {
    const card = document.createElement('li');
    card.className = 'list-item store-card';
    card.style.margin = '0 8.5px 20px 0';
    
    const container = document.createElement('div');
    container.className = 'store-card-container';
    
    const link = document.createElement('a');
    link.className = 'store-card-link';
    if (universeId) {
        link.href = `https://www.roblox.com/developer-product/${universeId}/product/${id}`;
    }
    
    // Thumbnail
    const thumbContainer = document.createElement('div');
    thumbContainer.className = 'store-card-thumb-container';
    thumbContainer.style.position = 'relative';
    thumbContainer.style.width = '100%';
    thumbContainer.style.paddingBottom = '100%';

    const thumb = createThumbnailElement(thumbnail, name, 'store-card-thumb');
    thumb.style.position = 'absolute';
    thumb.style.top = '0';
    thumb.style.left = '0';
    thumb.style.width = '100%';
    thumb.style.height = '100%';
    thumbContainer.appendChild(thumb);
    
    // Details
    const details = document.createElement('div');
    details.className = 'store-card-caption';
    details.style.textAlign = 'left';
    details.style.position = 'relative';
    details.style.zIndex = '1';
    
    const nameDiv = document.createElement('div');
    nameDiv.className = 'store-card-name';
    nameDiv.textContent = name || 'Unnamed Product';
    nameDiv.title = name || 'Unnamed Product';
    nameDiv.style.display = '-webkit-box';
    nameDiv.style.webkitLineClamp = '2';
    nameDiv.style.setProperty('-webkit-box-orient', 'vertical');
    nameDiv.style.overflow = 'hidden';
    nameDiv.style.textAlign = 'left';
    nameDiv.style.minHeight = '2.6em';
    nameDiv.style.lineHeight = '1.3em';
    
    const priceContainer = document.createElement('div');
    priceContainer.className = 'store-card-price';
    priceContainer.style.textAlign = 'left';
    priceContainer.style.justifyContent = 'flex-start';
    
    const icon = document.createElement('span');
    icon.className = 'icon-robux-16x16';
    
    const priceSpan = document.createElement('span');
    priceSpan.className = 'text-robux';
    priceSpan.textContent = price !== null ? price : 'Off Sale';

    priceContainer.appendChild(icon);
    priceContainer.appendChild(priceSpan);
    
    details.appendChild(nameDiv);
    details.appendChild(priceContainer);
    
    link.appendChild(thumbContainer);
    link.appendChild(details);
    container.appendChild(link);
    card.appendChild(container);
    
    return card;
}