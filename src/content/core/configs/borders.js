// VALRA EDIT HERE: replace this URL with the RoValra API endpoint for the borders list.
const BORDERS_URL = 'https://aliceenight.space/frames/borders.json';

let cache = null;
let fetchPromise = null;

function fetchFromBackground(url) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'fetchJson', url }, (res) => {
            if (chrome.runtime.lastError || !res?.data) {
                resolve(null);
            } else {
                resolve(res.data);
            }
        });
    });
}

export async function getBorders() {
    if (cache) return cache;
    if (!fetchPromise) {
        fetchPromise = fetchFromBackground(BORDERS_URL)
            .then((data) => {
                cache = Array.isArray(data) ? data : [];
                return cache;
            })
            .catch(() => {
                cache = [];
                return cache;
            });
    }
    return fetchPromise;
}

export function getCachedBorders() {
    return cache || [];
}

getBorders();
