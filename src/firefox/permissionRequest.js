// Firefox only. Opened by src/firefox/backgroundCompat.js so that
// chrome.permissions.request() runs from a real click, which Firefox requires.
const params = new URLSearchParams(location.search);
const id = params.get('id');
let permissions = { permissions: [], origins: [] };
try {
    permissions = { ...permissions, ...JSON.parse(params.get('permissions')) };
} catch {}

const PERMISSION_LABELS = {
    webNavigation: 'Detect page navigation',
    webRequest: 'Watch network requests',
    contextMenus: 'Add items to the right-click menu',
    menus: 'Add items to the right-click menu',
};

const list = document.getElementById('permissions');
[...permissions.permissions, ...permissions.origins].forEach((permission) => {
    const item = document.createElement('li');
    item.textContent = PERMISSION_LABELS[permission] || permission;
    list.append(item);
});

const finish = (granted) => {
    chrome.runtime
        .sendMessage({ action: 'firefoxPermissionResult', id, granted })
        .finally(() => window.close());
};

document.getElementById('allow').addEventListener('click', () => {
    chrome.permissions
        .request(permissions)
        .then((granted) => finish(granted))
        .catch(() => finish(false));
});
document
    .getElementById('cancel')
    .addEventListener('click', () => finish(false));
