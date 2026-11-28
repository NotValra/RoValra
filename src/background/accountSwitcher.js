export const ACCOUNT_SWITCHER_STORAGE_KEY = 'rovalra_account_switcher_accounts';

const COOKIE_NAME = '.ROBLOSECURITY';
const COOKIE_URL = 'https://www.roblox.com';
const COOKIE_DOMAIN = '.roblox.com';
const FALLBACK_COOKIE_LIFETIME_SECONDS = 60 * 60 * 24 * 365;

let cookieBeforeSwitch = null;

function hasCookiesPermission() {
    return chrome.permissions.contains({ permissions: ['cookies'] });
}

async function getStoredAccounts() {
    const result = await chrome.storage.local.get({
        [ACCOUNT_SWITCHER_STORAGE_KEY]: [],
    });
    const accounts = result[ACCOUNT_SWITCHER_STORAGE_KEY];
    return Array.isArray(accounts) ? accounts : [];
}

function setStoredAccounts(accounts) {
    return chrome.storage.local.set({
        [ACCOUNT_SWITCHER_STORAGE_KEY]: accounts,
    });
}

function getRobloxCookie() {
    return chrome.cookies.get({ url: COOKIE_URL, name: COOKIE_NAME });
}

function setRobloxCookie(value, expirationDate) {
    return chrome.cookies.set({
        url: COOKIE_URL,
        name: COOKIE_NAME,
        value,
        domain: COOKIE_DOMAIN,
        path: '/',
        secure: true,
        httpOnly: true,
        sameSite: 'lax',
        expirationDate:
            expirationDate ||
            Math.floor(Date.now() / 1000) + FALLBACK_COOKIE_LIFETIME_SECONDS,
    });
}

function removeRobloxCookie() {
    return chrome.cookies.remove({ url: COOKIE_URL, name: COOKIE_NAME });
}

async function saveCurrentAccount(userId, { onlyIfSaved = false } = {}) {
    userId = Number(userId);
    if (!userId) return { success: false, error: 'notLoggedIn' };

    const cookie = await getRobloxCookie();
    if (!cookie?.value) return { success: false, error: 'notLoggedIn' };

    const accounts = await getStoredAccounts();
    const existing = accounts.find((a) => a.userId === userId);

    if (existing) {
        existing.cookie = cookie.value;
        existing.expirationDate = cookie.expirationDate ?? null;
    } else if (onlyIfSaved) {
        return { success: true };
    } else {
        accounts.push({
            userId,
            cookie: cookie.value,
            expirationDate: cookie.expirationDate ?? null,
            addedAt: Date.now(),
        });
    }

    await setStoredAccounts(accounts);
    return { success: true };
}

const PUBLIC_FIELDS = [
    'userId',
    'username',
    'displayName',
    'isVerified',
    'hasRobloxSubscription',
    'addedAt',
];
const PROFILE_FIELDS = [
    'username',
    'displayName',
    'isVerified',
    'hasRobloxSubscription',
];

async function listAccounts() {
    const accounts = await getStoredAccounts();
    return {
        success: true,
        accounts: accounts.map((account) =>
            Object.fromEntries(
                PUBLIC_FIELDS.map((field) => [field, account[field] ?? null]),
            ),
        ),
    };
}

async function updateProfiles(profiles) {
    if (!Array.isArray(profiles) || profiles.length === 0) {
        return { success: true };
    }

    const accounts = await getStoredAccounts();
    let changed = false;

    for (const profile of profiles) {
        const account = accounts.find(
            (a) => a.userId === Number(profile?.userId),
        );
        if (!account) continue;

        for (const field of PROFILE_FIELDS) {
            if (profile[field] === undefined) continue;
            if (account[field] !== profile[field]) {
                account[field] = profile[field];
                changed = true;
            }
        }
    }

    if (changed) await setStoredAccounts(accounts);
    return { success: true, changed };
}

async function switchAccount(targetUserId, currentUserId) {
    const accounts = await getStoredAccounts();
    const target = accounts.find((a) => a.userId === Number(targetUserId));
    if (!target) return { success: false, error: 'notFound' };

    await saveCurrentAccount(currentUserId, { onlyIfSaved: true });
    cookieBeforeSwitch = await getRobloxCookie();

    await setRobloxCookie(target.cookie, target.expirationDate);
    return { success: true };
}

async function restoreAccount() {
    if (cookieBeforeSwitch?.value) {
        await setRobloxCookie(
            cookieBeforeSwitch.value,
            cookieBeforeSwitch.expirationDate,
        );
    } else {
        await removeRobloxCookie();
    }
    cookieBeforeSwitch = null;
    return { success: true };
}

async function removeAccount(userId) {
    const accounts = await getStoredAccounts();
    await setStoredAccounts(
        accounts.filter((a) => a.userId !== Number(userId)),
    );
    return { success: true };
}

async function addAnotherAccount(currentUserId) {
    if (currentUserId) await saveCurrentAccount(currentUserId);
    await removeRobloxCookie();
    return { success: true };
}

async function syncCurrentAccount(userId, verified) {
    userId = Number(userId);
    if (!userId) return { success: true, updated: false };

    const accounts = await getStoredAccounts();
    const account = accounts.find((a) => a.userId === userId);
    if (!account) return { success: true, updated: false };

    const cookie = await getRobloxCookie();
    if (!cookie?.value || cookie.value === account.cookie) {
        return { success: true, updated: false };
    }
    if (!verified) return { success: true, needsVerify: true };

    account.cookie = cookie.value;
    account.expirationDate = cookie.expirationDate ?? null;
    await setStoredAccounts(accounts);
    return { success: true, updated: true };
}

let cookieChangeTimeout = null;

async function notifyRobloxTab() {
    const accounts = await getStoredAccounts();
    if (accounts.length === 0) return;

    const tabs = await chrome.tabs.query({ url: '*://*.roblox.com/*' });
    const tab = tabs.find((t) => t.active) || tabs[0];
    if (!tab?.id) return;

    chrome.tabs
        .sendMessage(tab.id, { action: 'accountSwitcher:cookieChanged' })
        .catch(() => {});
}

function onCookieChanged({ cookie, removed }) {
    if (removed || cookie?.name !== COOKIE_NAME) return;
    if (!cookie.domain?.endsWith('roblox.com')) return;

    clearTimeout(cookieChangeTimeout);
    cookieChangeTimeout = setTimeout(() => {
        notifyRobloxTab().catch(() => {});
    }, 1000);
}

let cookieListenerAdded = false;

function addCookieListener() {
    if (cookieListenerAdded || !chrome.cookies?.onChanged) return;
    chrome.cookies.onChanged.addListener(onCookieChanged);
    cookieListenerAdded = true;
}

addCookieListener();
chrome.permissions.onAdded.addListener((permissions) => {
    if (permissions?.permissions?.includes('cookies')) addCookieListener();
});

const HANDLERS = {
    'accountSwitcher:list': () => listAccounts(),
    'accountSwitcher:addCurrent': (request) =>
        saveCurrentAccount(request.userId),
    'accountSwitcher:addAnother': (request) =>
        addAnotherAccount(request.currentUserId),
    'accountSwitcher:switch': (request) =>
        switchAccount(request.userId, request.currentUserId),
    'accountSwitcher:restore': () => restoreAccount(),
    'accountSwitcher:remove': (request) => removeAccount(request.userId),
    'accountSwitcher:updateProfiles': (request) =>
        updateProfiles(request.profiles),
    'accountSwitcher:syncCurrent': (request) =>
        syncCurrentAccount(request.userId, request.verified === true),
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const handler = HANDLERS[request?.action];
    if (!handler) return false;

    (async () => {
        if (!chrome.cookies || !(await hasCookiesPermission())) {
            return { success: false, error: 'noPermission' };
        }
        return handler(request);
    })()
        .then(sendResponse)
        .catch((error) => {
            console.error('RoValra: Account switcher error', error);
            sendResponse({ success: false, error: error?.message });
        });
    return true;
});
