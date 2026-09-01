import { t } from "../../core/locale/i18n";
import { settings } from "../../core/settings/getSettings";
import { createDropdown, createDropdownMenu } from "../../core/ui/dropdown";
import { createNavbarButton } from "../../core/ui/navbarButton";
import { callRobloxApi } from "../../core/api";
import { Icon } from "../../core/ui/buildericon.ts";

// Privacy Toggles
import onlineStatus from "./privacyToggles/onlineStatus.js";
import joinStatus from "./privacyToggles/joinStatus.js";
import privateServerPrivacy from "./privacyToggles/privateServerPrivacy.js";
import inventoryPrivacy from "./privacyToggles/inventoryPrivacy.js";

const SETTING_NAME = 'privacyTogglesEnabled';

let abortController = new AbortController();
let togglesEnabled = 0;
let currentNavItem;
let toggleChangeSettingFunctions = [];
let currentlisteners = [];

// If you want to create more toggles use the example.js file as a base in the privacyToggles folder

/** @type {import('./privacyToggles.d.ts').Dropdown[]} */
const DROPDOWNS = [
    onlineStatus,
    joinStatus,
    privateServerPrivacy,
    inventoryPrivacy,
];


async function addNavBtn() {
    if (currentNavItem) return;
    console.log("add nav called!")
    currentNavItem = await createNavbarButton({
        id: 'rovalra-privacy-toggle-navbtn',
        iconData: '<icon size="x-large" style="color: var(--rovalra-main-text-color)" filled>lock-closed</icon>',
        tooltipText: await t('privacyToggles.nav.tooltip'),
    });
    addDropdown(currentNavItem);
}

function appendInlineControl(row, control) {
    const textWrapper = row.querySelector('.text-truncate-split.flex.flex-col');
    if (!textWrapper) return;

    Object.assign(textWrapper.style, {
        alignItems: 'center',
        display: 'flex',
        flexDirection: 'row',
        gap: '12px',
        justifyContent: 'space-between',
        width: '100%',
    });

    const title = textWrapper.querySelector('.foundation-web-menu-item-title');
    if (title) {
        Object.assign(title.style, {
            flex: '1 1 auto',
            minWidth: '0',
        });
    }

    textWrapper.appendChild(control);
}

async function dropdownItemsFormat(dropdownItems) {
    const formattedItems = await Promise.all(
        dropdownItems.map(async option => {
            return { ...option, label: await t(option.label) };
        })
    );

    return formattedItems;
}

async function checkNoToggles(noTogglesEl, togglesEnabledCount = togglesEnabled) {
    noTogglesEl.style.display = togglesEnabledCount > 0 ? 'none' : 'block';
    console.log(togglesEnabledCount);
}

async function changeToggleElements(dropdown = createDropdown(), currentItems) {
    const dropdownElement = dropdown.panel.querySelector('div.flex-dropdown-menu');

    for (item of dropdownElement.children) {
        const connectedItemInfo = currentItems.filter(a => a.value == item.getAttribute('data-value'))[0];

        item.disabled = connectedItemInfo.disabled
        item.style.display = connectedItemInfo.hidden ? 'none' : 'block';
    }
}

async function addDropdown(navItem = currentNavItem) {
    const dropdownMenu = createDropdownMenu({
        trigger: navItem,
        items: [{
            label: 'placeholder',
            value: 'placeholder',
        }],
        position: 'center',
    });

    const accountSettingsRes = await callRobloxApi({
        subdomain: 'apis',
        endpoint: '/user-settings-api/v1/user-settings/settings-and-options',
        noCache: true,
    });

    const accountSettings = await accountSettingsRes.json();

    const btn = dropdownMenu.panel.querySelector('.rovalra-dropdown-item');

    const noTogglesEl = document.createElement('div');
    noTogglesEl.classList.add('rovalra-dropdown-item', 'rovalra-privacysettings-notoggles');
    noTogglesEl.textContent = await t('privacyToggles.noTogglesEnabled');
    noTogglesEl.style.textAlign = 'center';
    noTogglesEl.style.padding = '10px';
    dropdownMenu.panel.appendChild(noTogglesEl);

    for (const dropdown of DROPDOWNS) {
        const clonedBtn = btn.cloneNode(true);

        let currentItems = await dropdown.getInitialItems(accountSettings)

        const div = document.createElement('div');
        div.className = clonedBtn.className;
        div.setAttribute('role', 'option');
        div.setAttribute('data-value', dropdown.name);
        div.append(...clonedBtn.children);
        div.style.display = await settings[dropdown.settingAttached] || await settings[dropdown.settingAttached] !== false ? 'block' : 'none';

        if (await settings[dropdown.settingAttached] || await settings[dropdown.settingAttached] !== false)
            togglesEnabled += 1;

        console.log(await settings[dropdown.settingAttached] || await settings[dropdown.settingAttached] !== false, await settings[dropdown.settingAttached], await settings[dropdown.settingAttached] !== false)

        if (!currentlisteners.includes(dropdown.name)) {
            currentlisteners.push(dropdown.name);
            document.addEventListener('rovalra:settingSaved', async ({ detail }) => {
                if (!dropdownEl || !detail.name || detail.name !== dropdown.settingAttached) return;
                div.style.display = detail.value ? 'block' : 'none';
                togglesEnabled += detail.value ? 0.5 : -0.5; // had to set this to 0.5 because for some reason this event would fire twice
                checkNoToggles(noTogglesEl);
            }, { signal: abortController.signal })
        }

        clonedBtn.remove();

        const titleParent = div.querySelector('div > span')
        const title = document.createElement('span')
        const settingIcon = Icon(dropdown.icon)
        title.innerText = await t(dropdown.title);
        title.style.paddingLeft = '8px';
        titleParent.innerHTML = '';
        titleParent.append(settingIcon, title);

        const dropdownEl = createDropdown({
            items: await dropdownItemsFormat(currentItems),
            initialValue: currentItems.filter(i => i.default == true)[0].value,
            onValueChange: async (newValue) => {
                dropdown.valueChanged(newValue);
                toggleChangeSettingFunctions
                    .filter(a => a.name !== dropdown.name)
                    .forEach(a => a.callback(dropdown.name, newValue));
            },
        });

        dropdownEl.element.rovalraSetValue = dropdownEl.setValue;
        dropdownEl.element.style.marginLeft = 'auto';
        dropdownEl.element.addEventListener('click', (e) => e.stopPropagation());

        const trigger = dropdownEl.element.querySelector('.rovalra-dropdown-trigger',);
        if (trigger) {
            trigger.style.height = '30px';
            trigger.style.minHeight = '30px';
            trigger.style.padding = '0 8px';
            trigger.style.fontSize = '12px';
        }

        if (dropdown.changeSettingsBasedOtherSettings) {
            async function changeSettingsCallback(otherSettingName, otherSettingValue) {
                console.log("GOT OTHER CHANGE SETTING", otherSettingName, otherSettingValue);
                const callbackResult = await dropdown.changeSettingsBasedOtherSettings(
                    currentItems,
                    otherSettingName,
                    otherSettingValue,
                    dropdownEl.setValue
                );
                console.log("got callback result", callbackResult);
                currentItems = callbackResult;
                changeToggleElements(dropdownEl, callbackResult);
            }
            toggleChangeSettingFunctions.push({
                name: dropdown.name,
                callback: changeSettingsCallback,
            });
        }

        appendInlineControl(div, dropdownEl.element);

        changeToggleElements(dropdownEl, currentItems);

        dropdownMenu.panel.append(div);
    }

    btn.remove();

    checkNoToggles(noTogglesEl);
}

function cleanup() {
    if (currentNavItem) {
        currentNavItem.parentNode.remove();
        currentNavItem = undefined;
    }

    currentlisteners = [];
    abortController.abort();
    abortController = new AbortController();

    togglesEnabled = 0;
}

export async function init() {
    if (await settings[SETTING_NAME]) {
        addNavBtn();
    }

    document.addEventListener('rovalra:settingSaved', async ({ detail }) => {
        if (!detail.name || detail.name !== SETTING_NAME) return;

        if (detail.value) {
            addNavBtn();
        } else {
            cleanup();
        }
    })
}
