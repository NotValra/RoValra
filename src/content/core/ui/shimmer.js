// Should not be used anymore as thumbnails.js does it well enough.
export function createShimmerGrid(count, itemStyle = { width: '150px', height: '240px' }) {
    const fragment = document.createDocumentFragment();

    for (let i = 0; i < count; i++) {
        const card = document.createElement('div');
        card.style.cssText = `display: flex; flex-direction: column; justify-self: center; width: ${itemStyle.width}; height: ${itemStyle.height};`;

        const thumb = document.createElement('div');
        thumb.className = 'thumbnail-2d-container shimmer';
        thumb.style.cssText = `width: 100%; height: ${itemStyle.width}; margin-bottom: 8px; border-radius: 8px;`;

        const nameBar = document.createElement('div');
        nameBar.className = 'thumbnail-2d-container shimmer'; 
        nameBar.style.cssText = 'width: 90%; height: 14px; margin-top: 8px; border-radius: 4px;';

        card.append(thumb, nameBar);
        fragment.appendChild(card);
    }
    return fragment;
}