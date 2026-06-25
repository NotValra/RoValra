import { getAssets } from '../../assets.js';
import { settings } from '../getSettings.js';

let rovalraButtonAdded = false;
const NAVBAR_DROPDOWN_SETTING_NAME = 'hideRoValraSettingsNavbarDropdown';
const POPOVER_SETTINGS_LINK_SELECTOR = 'a.rbx-menu-item[href*="?rovalra=info"]';

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
        'li.menu-option > a > span.font-caption-header[textContent="RoValra Settings"]',
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
    newButtonSpan.textContent = 'RoValra Settings';
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

function removePopoverButton() {
    const popoverMenu = document.getElementById('settings-popover-menu');
    const existingLink = popoverMenu?.querySelector(
        POPOVER_SETTINGS_LINK_SELECTOR,
    );

    existingLink?.closest('li')?.remove();
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

    const popoverMenu = document.getElementById('settings-popover-menu');
    if (!popoverMenu) return;

    if (window.rovalraPopoverButtonAdded) {
        if (popoverMenu.querySelector(POPOVER_SETTINGS_LINK_SELECTOR)) return;
        window.rovalraPopoverButtonAdded = false;
    }

    if (popoverMenu.querySelector(POPOVER_SETTINGS_LINK_SELECTOR)) {
        window.rovalraPopoverButtonAdded = true;
        return;
    }

    const assets = getAssets();
    const newButtonListItem = document.createElement('li');
    const newButtonLink = document.createElement('a');
    newButtonLink.className = 'rbx-menu-item';
    newButtonLink.href = 'https://www.roblox.com/my/account?rovalra=info';
    Object.assign(newButtonLink.style, {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
    });

    newButtonLink.addEventListener('click', (e) => {
        e.preventDefault();
        if (window.location.search.includes('rovalra=')) {
            window.location.reload();
        } else {
            window.location.href =
                'https://www.roblox.com/my/account?rovalra=info';
        }
    });

    const logo = document.createElement('img');
    logo.dataset.rovalraAsset = 'rovalraIcon';
    logo.src = assets.rovalraIcon;
    Object.assign(logo.style, { width: '18px', height: '18px' });

    const buttonText = document.createTextNode('RoValra Settings');
    newButtonLink.append(logo, buttonText);
    newButtonListItem.appendChild(newButtonLink);

    const nativeSettingsLink = popoverMenu.querySelector(
        'a.rbx-menu-item[href="/my/account"]',
    );
    if (nativeSettingsLink?.parentElement) {
        nativeSettingsLink.parentElement.before(newButtonListItem);
    } else {
        popoverMenu.prepend(newButtonListItem);
    }

    window.rovalraPopoverButtonAdded = true;
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
