import { t } from "../../core/locale/i18n";
import { settings } from "../../core/settings/getSettings";
import { createDropdown, createDropdownMenu } from "../../core/ui/dropdown";
import { createNavbarButton } from "../../core/ui/navbarButton";
import { callRobloxApi } from "../../core/api";

const SETTING_NAME = 'privacyTogglesEnabled'
const DROPDOWNS = [
    {
        title: 'privacyToggles.dropdowns.example.name',
        name: 'exampleToggle',
        getInitialItems: async (accountSettings) => {
            return [
                {
                    name: 'privacyToggles.dropdowns.example.value1',
                    value: 'value1',
                },
                {
                    name: 'privacyToggles.dropdowns.example.value2',
                    value: 'value2',
                },
                {
                    name: 'privacyToggles.dropdowns.example.value3',
                    value: 'value3',
                    disabled: true,
                },
                {
                    name: 'privacyToggles.dropdowns.example.value4',
                    value: 'value4',
                    default: true,
                },
                {
                    name: 'privacyToggles.dropdowns.example.value5',
                    value: 'value5',
                    hidden: true,
                },
            ]
        },
        valueChanged: async (value) => {
            console.log(" GOT BALUE WOW OMG UWU: ", value)
        },
        changeSettingsBasedOtherSettings: async (currentSsettings, otherSettingName, otherSettingValue) => {
            // @TODO
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

async function addDropdown(navItem = currentNavItem) {
    const dropdown = createDropdownMenu({
        trigger: navItem,
        items: [],
        position: 'center',
    });

    DROPDOWNS.forEach(())
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
