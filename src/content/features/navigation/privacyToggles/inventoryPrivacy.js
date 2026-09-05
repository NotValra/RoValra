import { callRobloxApi } from '../../../core/api.js';

let currentOptionSelected;

/** @type {import('../privacyToggles').Dropdown} */
export default {
    title: 'privacyToggles.dropdowns.inventoryPrivacy.name',
    name: 'inventoryPrivacy',
    settingAttached: 'privacyTogglesDropdownInventoryPrivacyEnabled',
    icon: {
        icon: "file-box",
        filled: true,
    },
    getInitialItems: async (accountSettings) => {
        const invPrivacy = accountSettings.whoCanSeeMyInventory;
        const invPrivacyAvailableOptions = invPrivacy.options.map(a => a.option.optionValue);

        /** @type {import('../privacyToggles').DropdownOption[]} */
        let options = [
            {
                label: 'privacyToggles.dropdowns.shared.allUsers',
                value: 'AllUsers',
            },
            {
                label: 'privacyToggles.dropdowns.shared.friendsFollowingFollowers',
                value: 'FriendsFollowingAndFollowers',
            },
            {
                label: 'privacyToggles.dropdowns.shared.friendsFollowing',
                value: 'FriendsAndFollowing',
            },
            {
                label: 'privacyToggles.dropdowns.shared.friends',
                value: 'Friends',
            },
            {
                label: 'privacyToggles.dropdowns.shared.noOne',
                value: 'NoOne',
            },
        ];

        (options.find(a => a.value === invPrivacy.currentValue) || options[0]).default = true

        currentOptionSelected = invPrivacy.currentValue || options[0].value;

        options.forEach(a => a.hidden = !invPrivacyAvailableOptions.includes(a.value));

        return options;
    },
    valueChanged: async (value) => {
        if (currentOptionSelected === value) return;
        currentOptionSelected = value;

        const changeSetting = await callRobloxApi({
            subdomain: 'apis',
            endpoint: '/user-settings-api/v1/user-settings',
            method: 'POST',
            body: {
                whoCanSeeMyInventory: value
            }
        });
    },
}
