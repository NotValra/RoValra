import { t } from "../../core/locale/i18n";
import { settings } from "../../core/settings/getSettings";
import { createDropdown, createDropdownMenu } from "../../core/ui/dropdown";
import { createNavbarButton } from "../../core/ui/navbarButton";
import { callRobloxApi } from "../../core/api";
import { Icon } from "../../core/ui/buildericon.ts";

const SETTING_NAME = 'privacyTogglesEnabled'

/** @type {import('./privacyToggles.d.ts').Dropdown[]} */
const DROPDOWNS = [
    {
        title: 'privacyToggles.dropdowns.example.name',
        name: 'exampleToggle',
        settingAttached: 'privacyTogglesDropdownExampleToggleEnabled',
        icon: {
            icon: "person-magnifying-glass",
            filled: true,
        },
        getInitialItems: async (accountSettings) => {
            console.log("account settings provided wow:", accountSettings);
            return [
                {
                    label: 'privacyToggles.dropdowns.example.value1',
                    value: 'value1',
                },
                {
                    label: 'privacyToggles.dropdowns.example.value2',
                    value: 'value2',
                },
                {
                    label: 'privacyToggles.dropdowns.example.value3',
                    value: 'value3',
                    disabled: true,
                },
                {
                    label: 'privacyToggles.dropdowns.example.value4',
                    value: 'value4',
                    default: true,
                },
                {
                    label: 'privacyToggles.dropdowns.example.value5',
                    value: 'value5',
                    hidden: true,
                },
            ];
        },
        valueChanged: async (value) => {
            console.log("GOT BALUE WOW OMG UWU: ", value);
        },
        changeSettingsBasedOtherSettings: async (
            currentSettings, otherSettingName, otherSettingValue
        ) => {
            // @TODO
            return currentSettings;
        }
    }
]

let currentNavItem;


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

async function addDropdown(navItem = currentNavItem) {
    const dropdownMenu = createDropdownMenu({
        trigger: navItem,
        items: [{
            label: "placeholder",
            value: "placeholder",
        }],
        position: 'center',
    });

    const accountSettingsRes = await callRobloxApi({
        subdomain: 'apis',
        endpoint: '/user-settings-api/v1/user-settings/settings-and-options',
    });

    const accountSettings = await accountSettingsRes.json();

    const btn = dropdownMenu.panel.querySelector('.rovalra-dropdown-item');

    for (const dropdown of DROPDOWNS) {
        const clonedBtn = btn.cloneNode(true);

        let currentItems = await dropdown.getInitialItems(accountSettings)

        let currentItemsFormatted = await dropdownItemsFormat(currentItems);

        console.log("currentItems:", currentItems, "formatted:", currentItemsFormatted);

        const div = document.createElement('div');
        div.className = clonedBtn.className;
        div.setAttribute('role', 'option');
        div.setAttribute('data-value', dropdown.name);
        div.append(...clonedBtn.children);

        clonedBtn.remove();

        const titleParent = div.querySelector('div > span')
        const title = document.createElement('span')
        const settingIcon = Icon(dropdown.icon)
        title.innerText = await t(dropdown.title);
        title.style.paddingLeft = "8px";
        titleParent.innerHTML = "";
        titleParent.append(settingIcon, title);

        const dropdownEl = createDropdown({
            items: currentItemsFormatted,
            onValueChange: dropdown.valueChanged,
            initialValue: currentItems.filter(i => i.default == true)[0].value
        })

        dropdownEl.element.rovalraSetValue = dropdownEl.setValue;
        dropdownEl.element.style.marginLeft = 'auto';
        dropdownEl.element.addEventListener('click', (e) =>
            e.stopPropagation(),
        );

        const trigger = dropdownEl.element.querySelector(
            '.rovalra-dropdown-trigger',
        );
        if (trigger) {
            trigger.style.height = '30px';
            trigger.style.minHeight = '30px';
            trigger.style.padding = '0 8px';
            trigger.style.fontSize = '12px';
        }

        appendInlineControl(div, dropdownEl.element);

        dropdownMenu.panel.append(div);
    }

    btn.remove();
}

function removeNavBtn() {
    if (!currentNavItem) return;
    currentNavItem.parentNode.remove();
    currentNavItem = undefined;
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
            removeNavBtn();
        }
    })
}
