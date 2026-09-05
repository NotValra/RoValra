import { callRobloxApi } from '../../../core/api.js';

let currentOptionSelected;

/** @type {import('../privacyToggles.d.ts').Dropdown} */
export default {
    title: 'privacyToggles.dropdowns.example.name', // manage translation strings
    name: 'example',
    settingAttached: 'privacyTogglesDropdownExampleToggleEnabled',
    icon: {
        icon: "tilt",
        filled: true,
    },
    getInitialItems: async (accountSettings) => {
        /** @type {import('../privacyToggles.d.ts').DropdownOption[]} */
        let options = [
            {
                label: 'privacyToggles.dropdowns.example.value1',
                value: 'value1',
            },
            {
                label: 'privacyToggles.dropdowns.example.value2',
                value: 'value2',
                default: true,
            },
            {
                label: 'privacyToggles.dropdowns.example.value3',
                value: 'value3',
                hidden: true,
            },
            {
                label: 'privacyToggles.dropdowns.example.value4',
                value: 'value4',
                disabled: true,
            },
        ];

        // other logic here

        return options;
    },
    valueChanged: async (value) => {
        if (currentOptionSelected === value) return;
        currentOptionSelected = value;

        // logic here
    },
    changeSettingsBasedOtherSettings: async (currentSettings, otherSettingName, otherSettingValue, setValue) => {
        // change option and option availability based on other dropdown toggles and stuff!
        // this function is completely optional
        return currentSettings;
    },
}
