import { getAssets } from '../../assets.js';
import { settings } from '../getSettings.js';
import { ts } from '../../locale/i18n.js';

let rovalraButtonAdded = false;
const NAVBAR_DROPDOWN_SETTING_NAME = 'hideRoValraSettingsNavbarDropdown';
const POPOVER_SETTINGS_LINK_SELECTOR = 'a[href*="?rovalra=info"]';
const FOUNDATION_MENU_SELECTOR =
    '.foundation-web-menu.nav-foundation-menu[role="menu"]';
export const SETTINGS_POPOVER_MENU_SELECTOR = `#settings-popover-menu, ${FOUNDATION_MENU_SELECTOR}`;

export function addCustomButton(debouncedAddPopoverButton) {
    if (
        !window.location.href.includes('/my/account') ||
        window.location.href.includes('?rovalra=')
    ) {
        return;
    }

    const menuList = document.querySelector('ul.menu-vertical[role="tablist"]');
    if (!menuList) {
        if (debouncedAddPopoverButton) debouncedAddPopoverButton();
        return;
    }

    let divider = menuList.querySelector('li.rbx-divider.thick-height');
    if (!divider) {
        const lastMenuItem = menuList.querySelector(
            'li.menu-option[role="tab"]:last-of-type',
        );
        if (!lastMenuItem) {
            if (debouncedAddPopoverButton) debouncedAddPopoverButton();
            return;
        }
        const newDivider = document.createElement('li');
        newDivider.classList.add('rbx-divider', 'thick-height');
        newDivider.style.width = '100%';
        newDivider.style.height = '2px';
        lastMenuItem.insertAdjacentElement('afterend', newDivider);
        divider = newDivider;
    } else {
        divider.style.width = '100%';
    }

    if (rovalraButtonAdded) return;

    const existingButton = menuList.querySelector(
        `li.menu-option > a > span.font-caption-header[textContent="${ts('common.rovalraSettings')}"]`,
    );
    if (existingButton) {
        rovalraButtonAdded = true;
        return;
    }

    const assets = getAssets();
    const newButtonListItem = document.createElement('li');
    newButtonListItem.classList.add('menu-option');
    newButtonListItem.setAttribute('role', 'tab');

    const newButtonLink = document.createElement('a');
    newButtonLink.href = 'https://www.roblox.com/my/account?rovalra=info';
    newButtonLink.classList.add('menu-option-content');
    newButtonLink.style.cursor = 'pointer';
    newButtonLink.style.display = 'flex';
    newButtonLink.style.alignItems = 'center';

    newButtonLink.addEventListener('click', (e) => {
        e.preventDefault();
        if (window.location.search.includes('rovalra=')) {
            window.location.reload();
        } else {
            window.location.href =
                'https://www.roblox.com/my/account?rovalra=info#!/info';
        }
    });

    const newButtonSpan = document.createElement('span');
    newButtonSpan.classList.add('font-caption-header');
    newButtonSpan.textContent = ts('common.rovalraSettings');
    newButtonSpan.style.fontSize = '12px';

    const logo = document.createElement('img');
    logo.dataset.rovalraAsset = 'rovalraIcon';
    logo.src = assets.rovalraIcon;
    logo.style.width = '15px';
    logo.style.height = '15px';
    logo.style.marginRight = '5px';
    logo.style.verticalAlign = 'middle';

    newButtonLink.append(logo, newButtonSpan);
    newButtonListItem.appendChild(newButtonLink);
    divider.insertAdjacentElement('afterend', newButtonListItem);
    rovalraButtonAdded = true;
}

function findFoundationSettingsItem(menu) {
    return [...menu.querySelectorAll('[role="menuitem"][href]')].find(
        (item) => {
            try {
                return (
                    new URL(item.href, location.origin).pathname ===
                    '/my/account'
                );
            } catch {
                return false;
            }
        },
    );
}

export function getSettingsPopoverMenu() {
    const legacyMenu = document.getElementById('settings-popover-menu');
    if (legacyMenu) return legacyMenu;

    for (const menu of document.querySelectorAll(FOUNDATION_MENU_SELECTOR)) {
        if (findFoundationSettingsItem(menu)) return menu;
    }
    return null;
}

function removePopoverButton() {
    const existingLink = getSettingsPopoverMenu()?.querySelector(
        POPOVER_SETTINGS_LINK_SELECTOR,
    );

    if (existingLink?.parentElement?.tagName === 'LI') {
        existingLink.parentElement.remove();
    } else {
        existingLink?.remove();
    }
    window.rovalraPopoverButtonAdded = false;
}

async function shouldHidePopoverButton() {
    try {
        return (await settings[NAVBAR_DROPDOWN_SETTING_NAME]) === true;
    } catch (error) {
        console.warn(
            'RoValra: Failed to read navbar settings dropdown visibility.',
            error,
        );
        return false;
    }
}

export async function addPopoverButton() {
    if (await shouldHidePopoverButton()) {
        removePopoverButton();
        return;
    }

    const popoverMenu = getSettingsPopoverMenu();
    if (!popoverMenu) return;

    if (window.rovalraPopoverButtonAdded) {
        if (popoverMenu.querySelector(POPOVER_SETTINGS_LINK_SELECTOR)) return;
        window.rovalraPopoverButtonAdded = false;
    }

    if (popoverMenu.querySelector(POPOVER_SETTINGS_LINK_SELECTOR)) {
        window.rovalraPopoverButtonAdded = true;
        return;
    }

    if (popoverMenu.id === 'settings-popover-menu') {
        addLegacyPopoverButton(popoverMenu);
    } else {
        addFoundationPopoverButton(popoverMenu);
    }

    window.rovalraPopoverButtonAdded = true;
}

function handlePopoverButtonClick(e) {
    e.preventDefault();
    if (window.location.search.includes('rovalra=')) {
        window.location.reload();
    } else {
        window.location.href = 'https://www.roblox.com/my/account?rovalra=info';
    }
}

function createPopoverLogo(size) {
    const logo = document.createElement('img');
    logo.dataset.rovalraAsset = 'rovalraIcon';
    logo.src = getAssets().rovalraIcon;
    Object.assign(logo.style, { width: size, height: size, flexShrink: '0' });
    return logo;
}

function addLegacyPopoverButton(popoverMenu) {
    const newButtonListItem = document.createElement('li');
    const newButtonLink = document.createElement('a');
    newButtonLink.className = 'rbx-menu-item';
    newButtonLink.href = 'https://www.roblox.com/my/account?rovalra=info';
    Object.assign(newButtonLink.style, {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
    });
    newButtonLink.addEventListener('click', handlePopoverButtonClick);

    const buttonText = document.createTextNode(ts('common.rovalraSettings'));
    newButtonLink.append(createPopoverLogo('18px'), buttonText);
    newButtonListItem.appendChild(newButtonLink);

    const nativeSettingsLink = popoverMenu.querySelector(
        'a.rbx-menu-item[href="/my/account"]',
    );
    if (nativeSettingsLink?.parentElement) {
        nativeSettingsLink.parentElement.before(newButtonListItem);
    } else {
        popoverMenu.prepend(newButtonListItem);
    }
}

function addFoundationPopoverButton(popoverMenu) {
    const nativeSettingsItem = findFoundationSettingsItem(popoverMenu);
    if (!nativeSettingsItem) return;

    const newButtonLink = nativeSettingsItem.cloneNode(true);
    newButtonLink.removeAttribute('data-radix-collection-item');
    newButtonLink.removeAttribute('id');
    newButtonLink.setAttribute('tabindex', '-1');
    newButtonLink.href = 'https://www.roblox.com/my/account?rovalra=info';
    newButtonLink.style.columnGap = '8px';
    newButtonLink.addEventListener('click', handlePopoverButtonClick);

    const title = newButtonLink.querySelector(
        '.foundation-web-menu-item-title',
    );
    if (title) {
        title.textContent = ts('common.rovalraSettings');
        title.parentElement.before(createPopoverLogo('20px'));
    } else {
        newButtonLink.replaceChildren(
            createPopoverLogo('20px'),
            document.createTextNode(ts('common.rovalraSettings')),
        );
    }

    nativeSettingsItem.before(newButtonLink);
}

function handleNavbarDropdownSettingChange(value) {
    if (value === true) {
        removePopoverButton();
        return;
    }

    window.rovalraPopoverButtonAdded = false;
    addPopoverButton();
}

if (typeof document !== 'undefined') {
    document.addEventListener('rovalra:settingSaved', (event) => {
        if (event.detail?.name !== NAVBAR_DROPDOWN_SETTING_NAME) return;
        handleNavbarDropdownSettingChange(event.detail.value);
    });
}

if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local') return;
        const change = changes[NAVBAR_DROPDOWN_SETTING_NAME];
        if (!change) return;
        handleNavbarDropdownSettingChange(change.newValue);
    });
}
