// for future features, will be expanded
export function getPlaceIdFromUrl(url = window.location.href) {
    try {
        const urlObj = new URL(url, window.location.origin);
        
        const queryPlaceId = urlObj.searchParams.get('PlaceId');
        if (queryPlaceId) {
            return queryPlaceId;
        }

 
        const match = urlObj.pathname.match(/^(?:\/[a-z]{2}(?:-[a-z]{2})?)?\/(?:games|catalog|bundles|library|game-pass)\/(\d+)/i);
        if (match && match[1]) {
            return match[1];
        }
    } catch (e) {
        console.warn("RoValra: URL parsing failed", e);
    }
    
    const match = url.match(/\/(?:games|catalog|bundles|library|game-pass)\/(\d+)/);
    if (match) {
        return match[1];
    }

    return null;
}