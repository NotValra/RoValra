import { callRobloxApi, callRobloxApiJson } from '../../core/api.js';
import { getUserProfileData } from '../../core/apis/users.js';
import { settings } from '../../core/settings/getSettings.js';
import { createOverlay } from '../../core/ui/overlay.js';
import { createButton } from '../../core/ui/buttons.js';

const OPEN_EVENT = 'rovalra:openBulkUnblock';
const BLOCK_API = '/user-blocking-api/v1/users/get-blocked-users';
const BUTTON_ID = 'rovalra-native-bulk-unblock';

let managerOpen = false;
let initialized = false;
let cachedBlockedIds = null;
let cacheTime = 0;
let renderTimer = null;

const selectedUsers = new Set();

function getIdsFromResponse(data) {
    const possibleLists = [
        data?.blockedUserIds,
        data?.blockedUsers,
        data?.data?.blockedUserIds,
        data?.data?.blockedUsers,
        Array.isArray(data?.data) ? data.data : null,
        Array.isArray(data) ? data : null,
    ];

    for (const list of possibleLists) {
        if (!Array.isArray(list)) continue;

        return [
            ...new Set(
                list
                    .map((user) => {
                        if (typeof user === 'object' && user) {
                            return Number(
                                user.userId ??
                                    user.id ??
                                    user.targetUserId,
                            );
                        }

                        return Number(user);
                    })
                    .filter((id) => Number.isSafeInteger(id) && id > 0),
            ),
        ];
    }

    return null;
}

async function fetchBlockedIds() {
    const ids = [];
    const added = new Set();

    let cursor = '';

    for (let page = 0; page < 10; page++) {
        const params = new URLSearchParams();

        params.set('count', '50');

        if (cursor) {
            params.set('cursor', cursor);
        }

        const response = await callRobloxApi({
            subdomain: 'apis',
            endpoint: `${BLOCK_API}?${params.toString()}`,
            method: 'GET',
            noCache: true,
        });

        if (!response.ok) {
            throw new Error(`Blocked users request failed: ${response.status}`);
        }

        const data = await response.json();
        const pageIds = getIdsFromResponse(data);

        if (pageIds === null) {
            console.error('RoValra Bulk Unblock: Unknown response', data);
            throw new Error('Unknown blocked users response');
        }

        for (const id of pageIds) {
            if (added.has(id)) continue;

            added.add(id);
            ids.push(id);
        }

        const nextCursor =
            data?.nextPageCursor ??
            data?.nextCursor ??
            data?.data?.nextPageCursor ??
            data?.data?.nextCursor;

        if (!nextCursor || nextCursor === cursor) {
            break;
        }

        cursor = String(nextCursor);
    }

    return ids;
}

async function getBlockedIds(force = false) {
    if (
        !force &&
        cachedBlockedIds &&
        Date.now() - cacheTime < 10000
    ) {
        return [...cachedBlockedIds];
    }

    const ids = await fetchBlockedIds();

    cachedBlockedIds = ids;
    cacheTime = Date.now();

    return [...ids];
}

function clearCache() {
    cachedBlockedIds = null;
    cacheTime = 0;
}

async function getBlockedUsers() {
    const ids = await getBlockedIds(true);

    if (!ids.length) {
        return [];
    }

    let profiles = [];

    try {
        const result = await getUserProfileData(ids);

        if (Array.isArray(result?.profileDetails)) {
            profiles = result.profileDetails;
        }
    } catch (error) {
        console.warn('RoValra Bulk Unblock: Profile lookup failed', error);
    }

    if (!profiles.length) {
        try {
            const result = await callRobloxApiJson({
                subdomain: 'users',
                endpoint: '/v1/users',
                method: 'POST',
                body: {
                    userIds: ids,
                    excludeBannedUsers: false,
                },
            });

            if (Array.isArray(result?.data)) {
                profiles = result.data;
            }
        } catch (error) {
            console.warn(
                'RoValra Bulk Unblock: Fallback profile lookup failed',
                error,
            );
        }
    }

    return ids.map((id) => {
        const profile = profiles.find(
            (user) => Number(user?.userId ?? user?.id) === id,
        );

        const username =
            profile?.names?.username ??
            profile?.username ??
            profile?.name ??
            `User ${id}`;

        const displayName =
            profile?.names?.displayName ??
            profile?.displayName ??
            username;

        return {
            id,
            username,
            displayName,
        };
    });
}

async function unblockUser(id) {
    const response = await callRobloxApi({
        subdomain: 'apis',
        endpoint: `/user-blocking-api/v1/users/${id}/unblock-user`,
        method: 'POST',
        noCache: true,
    });

    return response.ok;
}

function createUserRow(user, updateCount) {
    const row = document.createElement('button');
    const circle = document.createElement('span');
    const dot = document.createElement('span');
    const info = document.createElement('div');
    const displayName = document.createElement('span');
    const username = document.createElement('span');

    row.type = 'button';
    row.dataset.userId = String(user.id);

    row.classList.add('rovalra-bulk-unblock-user-row');
    circle.classList.add('rovalra-bulk-unblock-selection-circle');
    dot.classList.add('rovalra-bulk-unblock-selection-dot');
    info.classList.add('rovalra-bulk-unblock-user-info');
    displayName.classList.add('rovalra-bulk-unblock-display-name');
    username.classList.add('rovalra-bulk-unblock-username');

    displayName.textContent = user.displayName;

    username.textContent = user.username.startsWith('User ')
        ? `User ID: ${user.id}`
        : `@${user.username}`;

    circle.appendChild(dot);
    info.append(displayName, username);
    row.append(circle, info);

    function update() {
        dot.style.display = selectedUsers.has(user.id) ? 'block' : 'none';
    }

    row.addEventListener('click', () => {
        if (selectedUsers.has(user.id)) {
            selectedUsers.delete(user.id);
        } else {
            selectedUsers.add(user.id);
        }

        update();
        updateCount();
    });

    return {
        element: row,
        update,
    };
}

function showResult(success, failed) {
    const body = document.createElement('div');

    body.classList.add('rovalra-bulk-unblock-result-body');

    const successText = document.createElement('div');

    successText.textContent =
        success === 1
            ? '1 user was unblocked.'
            : `${success} users were unblocked.`;

    body.appendChild(successText);

    if (failed > 0) {
        const failedText = document.createElement('div');

        failedText.textContent =
            failed === 1
                ? '1 user could not be unblocked.'
                : `${failed} users could not be unblocked.`;

        body.appendChild(failedText);
    }

    let overlay;

    const okayButton = createButton('Okay', 'primary', {
        onClick: () => overlay.close(),
    });

    overlay = createOverlay({
        title: 'Bulk Unblock Complete',
        bodyContent: body,
        actions: [okayButton],
        showLogo: true,
        maxWidth: '420px',
    });
}

function confirmUnblock(users, managerOverlay) {
    const usersToUnblock = users.filter((user) =>
        selectedUsers.has(user.id),
    );

    if (!usersToUnblock.length) {
        return;
    }

    const body = document.createElement('div');
    const text = document.createElement('p');
    const progress = document.createElement('div');

    text.textContent =
        usersToUnblock.length === 1
            ? 'Are you sure you want to unblock this user?'
            : `Are you sure you want to unblock these ${usersToUnblock.length} users?`;

    progress.classList.add('rovalra-bulk-unblock-progress');
    body.append(text, progress);

    let overlay;

    const cancelButton = createButton('Cancel', 'secondary', {
        onClick: () => overlay.close(),
    });

    const unblockButton = createButton(
        usersToUnblock.length === 1
            ? 'Unblock User'
            : `Unblock ${usersToUnblock.length} Users`,
        'alert',
    );

    overlay = createOverlay({
        title: 'Confirm Bulk Unblock',
        bodyContent: body,
        actions: [cancelButton, unblockButton],
        showLogo: true,
        maxWidth: '450px',
    });

    unblockButton.addEventListener('click', async () => {
        unblockButton.disabled = true;
        cancelButton.disabled = true;
        progress.style.display = 'block';

        let success = 0;
        let failed = 0;

        for (let i = 0; i < usersToUnblock.length; i++) {
            const user = usersToUnblock[i];

            progress.textContent = `Unblocking ${i + 1}/${usersToUnblock.length}...`;

            try {
                if (await unblockUser(user.id)) {
                    success++;
                } else {
                    failed++;
                }
            } catch (error) {
                console.warn(
                    `RoValra Bulk Unblock: Failed to unblock ${user.id}`,
                    error,
                );

                failed++;
            }

            if (i < usersToUnblock.length - 1) {
                await new Promise((resolve) => setTimeout(resolve, 250));
            }
        }

        clearCache();
        selectedUsers.clear();

        overlay.close();
        managerOverlay.close();

        scheduleNativeButton();
        showResult(success, failed);
    });
}

async function openManager() {
    if (managerOpen) return;

    if (!(await settings.bulkUnblockEnabled)) return;

    managerOpen = true;
    selectedUsers.clear();

    const body = document.createElement('div');

    body.classList.add('rovalra-bulk-unblock-manager-body');

    const loading = document.createElement('div');

    loading.textContent = 'Loading blocked users...';

    loading.classList.add('rovalra-bulk-unblock-message');

    body.appendChild(loading);

    const closeButton = createButton('Close', 'secondary');
    const unblockButton = createButton('Unblock', 'alert');

    unblockButton.style.display = 'none';
    unblockButton.disabled = true;

    let overlay;

    overlay = createOverlay({
        title: 'Bulk Unblock',
        bodyContent: body,
        actions: [closeButton, unblockButton],
        showLogo: true,
        maxWidth: '600px',
        maxHeight: 'calc(100vh - 80px)',
        onClose: () => {
            managerOpen = false;
            selectedUsers.clear();
        },
    });

    closeButton.addEventListener('click', () => overlay.close());

    try {
        const users = await getBlockedUsers();

        body.replaceChildren();

        if (!users.length) {
            const empty = document.createElement('div');

            empty.textContent = 'You do not have any blocked users.';

            empty.classList.add('rovalra-bulk-unblock-message');
            body.appendChild(empty);
            return;
        }

        const toolbar = document.createElement('div');
        const search = document.createElement('input');
        const selectAllButton = createButton('Select All', 'secondary');
        const status = document.createElement('div');
        const list = document.createElement('div');


        search.type = 'text';
        search.placeholder = 'Search blocked users...';

        toolbar.classList.add('rovalra-bulk-unblock-toolbar');
        search.classList.add('rovalra-bulk-unblock-search');
        status.classList.add('rovalra-bulk-unblock-status');
        list.classList.add('rovalra-bulk-unblock-list');

        toolbar.append(search, selectAllButton);

        const rows = new Map();

        function updateCount() {
            const count = selectedUsers.size;

            status.textContent = count
                ? `${count} selected`
                : `${users.length} blocked users`;

            unblockButton.style.display = count ? 'inline-flex' : 'none';
            unblockButton.disabled = !count;

            unblockButton.textContent =
                count === 1 ? 'Unblock User' : `Unblock ${count} Users`;

            selectAllButton.textContent =
                count === users.length ? 'Clear All' : 'Select All';
        }

        for (const user of users) {
            const row = createUserRow(user, updateCount);

            rows.set(user.id, row);
            list.appendChild(row.element);
        }

        selectAllButton.addEventListener('click', () => {
            if (selectedUsers.size === users.length) {
                selectedUsers.clear();
            } else {
                selectedUsers.clear();

                for (const user of users) {
                    selectedUsers.add(user.id);
                }
            }

            for (const row of rows.values()) {
                row.update();
            }

            updateCount();
        });

        search.addEventListener('input', () => {
            const value = search.value.trim().toLowerCase();

            for (const user of users) {
                const row = rows.get(user.id);

                const visible =
                    !value ||
                    user.displayName.toLowerCase().includes(value) ||
                    user.username.toLowerCase().includes(value) ||
                    String(user.id).includes(value);

                row.element.style.display = visible ? 'flex' : 'none';
            }
        });

        unblockButton.addEventListener('click', () => {
            confirmUnblock(users, overlay);
        });

        body.append(toolbar, status, list);

        updateCount();
    } catch (error) {
        console.error('RoValra Bulk Unblock: Failed to load users', error);

        const errorText = document.createElement('div');

        errorText.textContent =
            'Failed to load your blocked users. Please try again.';

        errorText.classList.add('rovalra-bulk-unblock-message');

        body.replaceChildren(errorText);
    }
}

function isAccountPage() {
    const path = window.location.pathname
        .toLowerCase()
        .replace(/^\/[a-z]{2}(?:-[a-z]{2})?\//, '/');

    return path === '/my/account' || path.startsWith('/my/account/');
}

function isVisible(element) {
    if (!element?.isConnected) return false;

    const style = getComputedStyle(element);

    return style.display !== 'none' && style.visibility !== 'hidden';
}

function findUserRow(link, root) {
    let element = link;

    for (let i = 0; i < 7; i++) {
        element = element.parentElement;

        if (!element || element === root) {
            return null;
        }

        if (element.closest('header, nav, [role="navigation"]')) {
            return null;
        }

        const links = element.querySelectorAll('a[href*="/users/"]');
        const buttons = element.querySelectorAll('button');

        if (links.length === 1 && buttons.length && isVisible(element)) {
            return element;
        }
    }

    return null;
}

function findBlockedList(userCount) {
    if (!isAccountPage()) return null;

    const root =
        document.querySelector('main') ||
        document.querySelector('#container-main') ||
        document.querySelector('#content');

    if (!root) return null;

    const links = [
        ...root.querySelectorAll('a[href*="/users/"]'),
    ].filter(
        (link) =>
            isVisible(link) &&
            !link.closest('header, nav, [role="navigation"]'),
    );

    const groups = new Map();

    for (const link of links) {
        const row = findUserRow(link, root);

        if (!row?.parentElement) continue;

        const parent = row.parentElement;

        if (!groups.has(parent)) {
            groups.set(parent, new Set());
        }

        groups.get(parent).add(row);
    }

    for (const [list, rowsSet] of groups) {
        const rows = [...rowsSet];

        if (rows.length === userCount) {
            return {
                list,
                rows,
                firstRow: rows[0],
            };
        }

        if (userCount > 50 && rows.length === 50) {
            return {
                list,
                rows,
                firstRow: rows[0],
            };
        }
    }

    return null;
}

async function updateNativeButton() {
    document.getElementById(BUTTON_ID)?.remove();

    if (!isAccountPage()) return;

    if (!(await settings.bulkUnblockEnabled)) return;

    let ids;

    try {
        ids = await getBlockedIds();
    } catch {
        return;
    }

    if (!ids.length) return;

    const area = findBlockedList(ids.length);

    if (!area) return;

    const holder = document.createElement('div');

    holder.id = BUTTON_ID;

    holder.classList.add('rovalra-bulk-unblock-native-holder');

    const button = createButton('Bulk Unblock', 'primary', {
        onClick: () => openManager(),
    });

    holder.appendChild(button);

    area.list.insertBefore(holder, area.firstRow);
}

function scheduleNativeButton() {
    clearTimeout(renderTimer);

    renderTimer = setTimeout(() => {
        updateNativeButton().catch((error) => {
            console.warn('RoValra Bulk Unblock: Button update failed', error);
        });
    }, 150);
}

function handleOpenManager() {
    openManager().catch((error) => {
        managerOpen = false;
        console.error('RoValra Bulk Unblock: Manager failed', error);
    });
}

export function init() {
    if (initialized) return;

    initialized = true;

    document.addEventListener(OPEN_EVENT, handleOpenManager);
    document.addEventListener('roblox-dom-changed', scheduleNativeButton);

    window.addEventListener('hashchange', scheduleNativeButton);
    window.addEventListener('popstate', scheduleNativeButton);
    window.addEventListener('rovalra:urlChanged', scheduleNativeButton);

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.bulkUnblockEnabled) {
            clearCache();
            scheduleNativeButton();
        }
    });

    scheduleNativeButton();
}