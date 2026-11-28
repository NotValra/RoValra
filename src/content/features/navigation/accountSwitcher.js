import { t } from '../../core/locale/i18n.js';
import { settings } from '../../core/settings/getSettings.js';
import { observeElement } from '../../core/observer.js';
import { getAssets } from '../../core/assets.js';
import { createNavbarButton } from '../../core/ui/navbarButton.js';
import { createDropdownMenu } from '../../core/ui/dropdown.js';
import { addTooltip } from '../../core/ui/tooltip.js';
import { createSpinner } from '../../core/ui/spinner.js';
import { Icon } from '../../core/ui/buildericon.ts';
import { getUserProfileData } from '../../core/apis/users.js';
import {
    getBatchThumbnails,
    createThumbnailElement,
} from '../../core/thumbnail/thumbnails.js';
import { getAuthenticatedUserId } from '../../core/user.js';
import { callRobloxApiJson } from '../../core/api.js';
import {
    createFoundationButton,
    createFoundationIconButton,
} from '../../core/ui/buttons.js';

const SETTING_NAME = 'accountSwitcherEnabled';
const NAV_ID = 'rovalra-account-switcher-navbtn';
const PANEL_MAX_HEIGHT = 350;
const LOADING_CLASS = 'rovalra-account-switcher-loading';

const PLACEMENTS = [
    {
        anchor: '#navbar-settings',
        navbar: 'ul.navbar-right.rbx-navbar-icon-group',
    },
    {
        anchor: 'li.signup-button-container',
        navbar: 'ul.navbar-right.rbx-navbar-right-nav',
    },
];

let navButton = null;
let menu = null;
let settingsObserver = null;
let isLoading = false;

const profileCache = new Map();
const thumbnailCache = new Map();

function sendMessage(message) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage(message, (response) => {
            if (chrome.runtime.lastError) {
                resolve({
                    success: false,
                    error: chrome.runtime.lastError.message,
                });
                return;
            }
            resolve(response || { success: false });
        });
    });
}

async function fetchAuthenticatedUserId() {
    try {
        const data = await callRobloxApiJson({
            subdomain: 'users',
            endpoint: '/v1/users/authenticated',
            noCache: true,
        });
        return data?.id ? Number(data.id) : null;
    } catch {
        return null;
    }
}

async function getPageUserId() {
    if (!document.querySelector('meta[name="user-data"]')) return 0;
    return Number(await getAuthenticatedUserId()) || 0;
}

async function syncCurrentAccount(userId) {
    if (userId) {
        const res = await sendMessage({
            action: 'accountSwitcher:syncCurrent',
            userId,
        });
        if (!res.needsVerify) return;
    }

    const verifiedUserId = await fetchAuthenticatedUserId();
    if (!verifiedUserId) return;
    await sendMessage({
        action: 'accountSwitcher:syncCurrent',
        userId: verifiedUserId,
        verified: true,
    });
}

function storedToProfile(account) {
    return {
        names: {
            combinedName: account.displayName || account.username,
            username: account.username,
        },
        isVerified: !!account.isVerified,
        hasRobloxSubscription: !!account.hasRobloxSubscription,
    };
}

function createRow({ onClick, disabled = false } = {}) {
    const row = document.createElement('div');
    row.className = 'rovalra-dropdown-item flex items-center gap-small';
    Object.assign(row.style, {
        padding: '8px 12px',
        cursor: disabled ? 'default' : 'pointer',
        gap: '10px',
        display: 'flex',
        alignItems: 'center',
    });
    if (onClick && !disabled) row.addEventListener('click', onClick);
    return row;
}

function createIconRow(iconName, labelText, onClick) {
    const row = createRow({ onClick });

    const iconWrap = document.createElement('span');
    Object.assign(iconWrap.style, {
        width: '32px',
        height: '32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: '0',
        color: 'var(--rovalra-main-text-color)',
    });
    iconWrap.appendChild(Icon({ icon: iconName, size: 'medium' }));

    const label = document.createElement('span');
    label.className = 'text-body-emphasis';
    Object.assign(label.style, {
        fontWeight: '600',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
    });
    label.textContent = labelText;

    row.append(iconWrap, label);
    return row;
}

function createNameLine(profile, fallbackName) {
    const line = document.createElement('span');
    Object.assign(line.style, {
        display: 'flex',
        alignItems: 'center',
        gap: '2px',
        minWidth: '0',
    });

    const name = document.createElement('span');
    name.className = 'text-body-emphasis';
    Object.assign(name.style, {
        fontWeight: '600',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
    });
    name.textContent = profile?.names?.combinedName || fallbackName;
    line.appendChild(name);

    if (profile?.isVerified) {
        const verified = document.createElement('span');
        verified.className = 'relative flex items-center justify-center';
        verified.style.flexShrink = '0';
        const backplate = Icon({
            icon: 'verified-backplate',
            filled: true,
            size: 'x-small',
            classes: ['content-system-emphasis'],
        });
        const check = Icon({
            icon: 'verified-check',
            filled: true,
            size: 'x-small',
            classes: ['absolute'],
        });
        check.style.color = 'white';
        verified.append(backplate, check);
        line.appendChild(verified);
    }

    if (profile?.hasRobloxSubscription) {
        const plus = Icon({
            icon: 'roblox-plus',
            size: 'x-small',
            classes: ['content-system-contrast'],
        });
        plus.style.flexShrink = '0';
        line.appendChild(plus);
    }

    return line;
}

async function createAccountRow(account, currentUserId) {
    const { userId } = account;
    const profile = profileCache.get(userId) || storedToProfile(account);
    const fallbackName = String(userId);
    const isCurrent = userId === currentUserId;

    const row = createRow({
        disabled: isCurrent,
        onClick: () => switchTo(userId, currentUserId, row),
    });

    const avatar = createThumbnailElement(
        thumbnailCache.get(userId) || { state: 'Error' },
        profile.names.username || fallbackName,
        'rovalra-account-switcher-avatar',
        { width: '32px', height: '32px' },
    );
    Object.assign(avatar.style, {
        width: '32px',
        height: '32px',
        borderRadius: '50%',
        overflow: 'hidden',
        flexShrink: '0',
        background: 'var(--rovalra-container-background-color)',
    });

    const text = document.createElement('div');
    text.className = 'flex flex-col';
    Object.assign(text.style, { flex: '1', minWidth: '0' });
    text.appendChild(createNameLine(profile, fallbackName));

    const username = document.createElement('span');
    username.className = 'text-caption-subtle';
    Object.assign(username.style, {
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
    });
    username.textContent = profile.names.username
        ? `@${profile.names.username}`
        : fallbackName;
    text.appendChild(username);

    row.append(avatar, text);

    if (isCurrent) {
        const check = Icon({
            icon: 'circle-check',
            filled: true,
            size: 'medium',
        });
        Object.assign(check.style, {
            color: 'var(--rovalra-main-text-color)',
            flexShrink: '0',
        });
        addTooltip(check, await t('accountSwitcher.currentAccount'), {
            position: 'bottom',
        });
        row.appendChild(check);
    }

    const removeLabel = await t('accountSwitcher.remove');
    const removeBtn = createFoundationIconButton(
        Icon({ icon: 'trash-can', size: 'small' }),
        {
            ariaLabel: removeLabel,
            onClick: async (e) => {
                e.stopPropagation();
                await sendMessage({ action: 'accountSwitcher:remove', userId });
                renderMenu();
            },
        },
    );
    removeBtn.style.flexShrink = '0';
    addTooltip(removeBtn, removeLabel, { position: 'bottom' });
    row.appendChild(removeBtn);

    return row;
}

function showStatus(text) {
    if (!menu) return;
    let status = menu.panel.querySelector('.rovalra-account-switcher-status');
    if (!status) {
        status = document.createElement('div');
        status.className =
            'rovalra-account-switcher-status rovalra-account-switcher-footer text-caption-subtle';
        Object.assign(status.style, {
            padding: '6px 12px 10px',
            textAlign: 'center',
        });
        menu.panel.appendChild(status);
    }
    status.textContent = text;
    menu.reposition();
}

async function switchTo(userId, currentUserId, row) {
    if (isLoading) return;
    isLoading = true;
    row.style.opacity = '0.6';

    const res = await sendMessage({
        action: 'accountSwitcher:switch',
        userId,
        currentUserId,
    });

    if (res.success) {
        if ((await fetchAuthenticatedUserId()) === userId) {
            window.location.reload();
            return;
        }
        await sendMessage({ action: 'accountSwitcher:restore' });
    }

    isLoading = false;
    row.style.opacity = '';
    showStatus(
        await t(
            res.success
                ? 'accountSwitcher.expired'
                : 'accountSwitcher.switchFailed',
        ),
    );
}

function createDivider() {
    const divider = document.createElement('div');
    Object.assign(divider.style, {
        flexShrink: '0',
        height: '1px',
        margin: '6px 0',
        background: 'var(--color-stroke-default, rgba(128,128,128,0.3))',
    });
    return divider;
}

async function createHeader() {
    const header = document.createElement('div');
    header.className =
        'rovalra-account-switcher-header text-label-medium content-emphasis';
    Object.assign(header.style, {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '10px 12px 6px',
        fontWeight: '700',
    });

    const logo = document.createElement('img');
    logo.src = getAssets().rovalraIcon;
    logo.dataset.rovalraAsset = 'rovalraIcon';
    logo.alt = '';
    Object.assign(logo.style, {
        width: '20px',
        height: '20px',
        flexShrink: '0',
    });

    const title = document.createElement('span');
    title.textContent = await t('accountSwitcher.title');

    header.append(logo, title);
    return header;
}

async function loadAccountData(userIds) {
    const missingProfiles = userIds.filter((id) => !profileCache.has(id));
    const missingThumbs = userIds.filter((id) => !thumbnailCache.has(id));

    await Promise.all([
        missingProfiles.length > 0 &&
            getUserProfileData(missingProfiles).then((res) => {
                for (const profile of res?.profileDetails || []) {
                    profileCache.set(Number(profile.userId), profile);
                }
            }),
        missingThumbs.length > 0 &&
            getBatchThumbnails(missingThumbs, 'AvatarHeadshot', '150x150').then(
                (thumbs) => {
                    for (const thumb of thumbs) {
                        if (thumb && thumb.state !== 'Pending') {
                            thumbnailCache.set(Number(thumb.targetId), thumb);
                        }
                    }
                },
            ),
    ]);
}

function syncStoredProfiles(accounts) {
    const updates = [];

    for (const account of accounts) {
        const profile = profileCache.get(account.userId);
        if (!profile?.names?.username) continue;

        const latest = {
            username: profile.names.username,
            displayName: profile.names.combinedName || profile.names.username,
            isVerified: !!profile.isVerified,
            hasRobloxSubscription: !!profile.hasRobloxSubscription,
        };
        const changed = Object.keys(latest).some(
            (field) => account[field] !== latest[field],
        );
        if (!changed) continue;

        Object.assign(account, latest);
        updates.push({ userId: account.userId, ...latest });
    }

    if (updates.length > 0) {
        sendMessage({
            action: 'accountSwitcher:updateProfiles',
            profiles: updates,
        });
    }
}

async function renderNoPermission() {
    const msg = document.createElement('div');
    msg.className = 'text-caption-subtle';
    Object.assign(msg.style, { padding: '4px 12px 8px' });
    msg.textContent = await t('accountSwitcher.permissionNeeded');
    menu.panel.appendChild(msg);

    const grantWrap = document.createElement('div');
    Object.assign(grantWrap.style, {
        display: 'flex',
        justifyContent: 'center',
        padding: '4px 12px 10px',
    });
    grantWrap.appendChild(
        createFoundationButton(await t('accountSwitcher.grantPermission'), {
            variant: 'emphasis',
            onClick: async () => {
                const res = await sendMessage({
                    action: 'requestPermission',
                    permission: 'cookies',
                });
                if (res.granted) renderMenu();
            },
        }),
    );
    menu.panel.appendChild(grantWrap);
}

async function buildMenu(listRes, currentUserId) {
    const header = await createHeader();

    if (!listRes.success) {
        menu.panel.classList.remove(LOADING_CLASS);
        menu.panel.replaceChildren(header);
        if (listRes.error === 'noPermission') {
            await renderNoPermission();
        } else {
            showStatus(await t('accountSwitcher.switchFailed'));
        }
        return;
    }

    const accounts = listRes.accounts || [];
    const currentAccount = accounts.find((a) => a.userId === currentUserId);
    const otherAccounts = accounts.filter((a) => a !== currentAccount);

    const list = document.createElement('div');
    list.className = 'rovalra-account-switcher-list';

    if (currentAccount) {
        list.appendChild(await createAccountRow(currentAccount, currentUserId));
        if (otherAccounts.length > 0) list.appendChild(createDivider());
    }
    for (const account of otherAccounts) {
        list.appendChild(await createAccountRow(account, currentUserId));
    }
    if (accounts.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'text-caption-subtle';
        Object.assign(empty.style, { padding: '4px 12px 8px' });
        empty.textContent = await t('accountSwitcher.noAccounts');
        list.appendChild(empty);
    }

    const footer = document.createElement('div');
    footer.className = 'rovalra-account-switcher-footer';
    footer.appendChild(createDivider());

    if (currentUserId && !currentAccount) {
        footer.appendChild(
            createIconRow(
                'person-plus',
                await t('accountSwitcher.addCurrent'),
                async () => {
                    const res = await sendMessage({
                        action: 'accountSwitcher:addCurrent',
                        userId: currentUserId,
                    });
                    if (res.success) renderMenu();
                    else showStatus(await t('accountSwitcher.switchFailed'));
                },
            ),
        );
    }

    footer.appendChild(
        createIconRow(
            'person-plus',
            await t('accountSwitcher.addAnother'),
            async () => {
                const res = await sendMessage({
                    action: 'accountSwitcher:addAnother',
                    currentUserId,
                });
                if (res.success) {
                    window.location.href = 'https://www.roblox.com/login';
                } else {
                    showStatus(await t('accountSwitcher.switchFailed'));
                }
            },
        ),
    );

    menu.panel.classList.remove(LOADING_CLASS);
    menu.panel.replaceChildren(header, list, footer);
    menu.reposition();
}

async function showLoading() {
    const spinnerWrap = document.createElement('div');
    spinnerWrap.className = 'rovalra-account-switcher-spinner';
    spinnerWrap.appendChild(createSpinner({ size: '32px' }));

    menu.panel.classList.add(LOADING_CLASS);
    menu.panel.replaceChildren(await createHeader(), spinnerWrap);
    menu.reposition();
}

async function renderMenu() {
    const listRes = await sendMessage({ action: 'accountSwitcher:list' });
    const currentUserId = await getPageUserId();
    const accounts = listRes.accounts || [];
    const userIds = accounts.map((a) => a.userId);

    const needsFetch = userIds.some(
        (id) => !profileCache.has(id) || !thumbnailCache.has(id),
    );

    try {
        if (listRes.success && needsFetch) {
            await showLoading();
            await loadAccountData(userIds);
        }
        if (listRes.success && userIds.length > 0) {
            syncStoredProfiles(accounts);
        }
    } catch (error) {
        menu?.panel.classList.remove(LOADING_CLASS);
        throw error;
    }
    if (!menu) return;

    await buildMenu(listRes, currentUserId);
}

async function addNavButton(placement) {
    if (navButton || document.getElementById(NAV_ID)) return;

    navButton = await createNavbarButton({
        id: NAV_ID,
        iconData:
            '<icon size="x-large" style="color: var(--rovalra-main-text-color)">person-with-smaller-person</icon>',
        tooltipText: await t('accountSwitcher.title'),
        navbarSelector: placement.navbar,
        insertAfter: placement.anchor,
    });
    if (!navButton) return;

    menu = createDropdownMenu({
        trigger: navButton,
        items: [],
        onValueChange: () => {},
        position: 'center',
        maxHeight: PANEL_MAX_HEIGHT,
    });
    menu.panel.classList.add('rovalra-account-switcher-panel');

    navButton.addEventListener('click', async () => {
        if (menu.panel.getAttribute('data-state') !== 'open') return;
        try {
            await renderMenu();
        } catch (error) {
            console.error('RoValra: Failed to render account switcher', error);
        }
    });
}

function start() {
    settingsObserver?.disconnect?.();
    settingsObserver = observeElement(
        PLACEMENTS.map((p) => p.anchor).join(', '),
        (anchor) => {
            const placement = PLACEMENTS.find((p) => anchor.matches(p.anchor));
            if (!placement) return;
            settingsObserver?.disconnect?.();
            settingsObserver = null;
            addNavButton(placement);
        },
    );
}

function cleanup() {
    settingsObserver?.disconnect?.();
    settingsObserver = null;
    document.getElementById(NAV_ID)?.remove();
    menu?.panel?.remove();
    navButton = null;
    menu = null;
}

export async function init() {
    let enabled = !!(await settings[SETTING_NAME]);

    if (enabled) {
        start();
        getPageUserId()
            .then((userId) => userId && syncCurrentAccount(userId))
            .catch(() => {});
    }

    chrome.runtime.onMessage.addListener((message) => {
        if (!enabled || message?.action !== 'accountSwitcher:cookieChanged') {
            return;
        }
        syncCurrentAccount().catch(() => {});
    });

    document.addEventListener('rovalra:settingSaved', ({ detail }) => {
        if (detail?.name !== SETTING_NAME) return;
        enabled = !!detail.value;
        if (detail.value) start();
        else cleanup();
    });
}
