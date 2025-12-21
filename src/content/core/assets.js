

const assetPaths = {
    rovalraIcon: 'public/Assets/icon-128.png',
    ratBadgeIcon: 'public/Assets/return_request.png',
    fishConfetti: 'public/Assets/fishstrap.png',
    rolimonsIcon: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1094 1466.2"><path fill="#0084dd" d="M1094 521.6 0 0v469.5l141-67.4 250 119.2L0 707.8v369.7l815.6 388.7L315 893l779-371.4z"></path></svg>')}`,
    onboarding: 'public/Assets/onboarding.png',
    serverListJson: 'public/Assets/data/ServerList.json',
    itemsJson: 'public/Assets/data/items.json',
    globeInitializer: 'public/Assets/data/globe_initializer.js',
    mapDark: 'public/Assets/data/map_dark.png',
    mapLight: 'public/Assets/data/map_light.png',
   // countriesJson: 'public/Assets/data/countries.json',
    verifiedBadge: "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 28 28' fill='none'%3E%3Cg clip-path='url(%23clip0_8_46)'%3E%3Crect x='5.88818' width='22.89' height='22.89' transform='rotate(15 5.88818 0)' fill='%230066FF'/%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M20.543 8.7508L20.549 8.7568C21.15 9.3578 21.15 10.3318 20.549 10.9328L11.817 19.6648L7.45 15.2968C6.85 14.6958 6.85 13.7218 7.45 13.1218L7.457 13.1148C8.058 12.5138 9.031 12.5138 9.633 13.1148L11.817 15.2998L18.367 8.7508C18.968 8.1498 19.942 8.1498 20.543 8.7508Z' fill='white'/%3E%3C/g%3E%3Cdefs%3E%3CclipPath id='clip0_8_46'%3E%3Crect width='28' height='28' fill='white'/%3E%3C/clipPath%3E%3C/defs%3E%3C/svg%3E"
};

let resolvedAssets = null;

export function getAssets() {
    if (resolvedAssets) {
        return resolvedAssets;
    }

    resolvedAssets = {};
    for (const key in assetPaths) {
        const path = assetPaths[key];
        if (path.startsWith('data:')) {
            resolvedAssets[key] = path;
        } else {
            resolvedAssets[key] = chrome.runtime.getURL(path);
        }
    }
    return resolvedAssets;
}