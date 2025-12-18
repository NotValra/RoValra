
// Creates and returns a generic icon element from the asset list.
import { getAssets } from '../../assets.js';


export function createAssetIcon({ assetName = 'rovalraIcon', altText = 'Icon', width = '24px', height = '24px' } = {}) {
    const assets = getAssets();
    if (!assets[assetName]) return null;

    const icon = document.createElement('img');
    icon.src = assets[assetName];
    icon.alt = altText;
    icon.style.width = width;
    icon.style.height = height;
    return icon;
}

