export const ROVALRA_API_ENABLED_KEY = 'rovalraApiEnabled';
export const ROVALRA_API_DISABLED_MESSAGE =
    'The RoValra API has been disabled in your RoValra settings.';

let cachedEnabled;
let pendingRead = null;

if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local' || !changes[ROVALRA_API_ENABLED_KEY]) return;
        cachedEnabled = changes[ROVALRA_API_ENABLED_KEY].newValue !== false;
    });
}

export async function isRovalraApiEnabled() {
    if (cachedEnabled !== undefined) return cachedEnabled;
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return true;

    pendingRead ??= new Promise((resolve) => {
        chrome.storage.local.get({ [ROVALRA_API_ENABLED_KEY]: true }, (r) => {
            cachedEnabled = r?.[ROVALRA_API_ENABLED_KEY] !== false;
            pendingRead = null;
            resolve(cachedEnabled);
        });
    });
    return pendingRead;
}

export async function setRovalraApiEnabled(enabled) {
    cachedEnabled = enabled !== false;
    await chrome.storage.local.set({
        [ROVALRA_API_ENABLED_KEY]: cachedEnabled,
    });
}

export function isRovalraApiRequest(options) {
    return (
        options?.isRovalraApi === true &&
        (options.subdomain ?? 'apis') === 'apis'
    );
}

export function createRovalraApiDisabledResponse() {
    return new Response(
        JSON.stringify({
            error: 'rovalra_api_disabled',
            message: ROVALRA_API_DISABLED_MESSAGE,
        }),
        {
            status: 403,
            statusText: 'RoValra API Disabled',
            headers: { 'Content-Type': 'application/json' },
        },
    );
}
