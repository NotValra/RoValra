import * as cache from '../../storage/cacheHandler.js';

const CACHE_SECTION = 'urlTracker';
const LAST_CLICKED_URL_KEY = 'lastClickedUrl';

let lastClickedUrl = null;

function handleClick(event) {
    let target = event.target;
    while (target && target.tagName !== 'A') {
        target = target.parentElement;
    }

    if (target && target.href) {
        const url = target.href;
        if (url.startsWith('http://') || url.startsWith('https://')) {
            cache.set(CACHE_SECTION, LAST_CLICKED_URL_KEY, url, 'session');
            lastClickedUrl = url;
        }
    }
}

export async function getLastClickedUrl() {
    if (lastClickedUrl !== null) return lastClickedUrl;
    lastClickedUrl = await cache.get(
        CACHE_SECTION,
        LAST_CLICKED_URL_KEY,
        'session',
    );
    return lastClickedUrl;
}

export function init() {
    document.addEventListener('click', handleClick, true);
    getLastClickedUrl();
}
