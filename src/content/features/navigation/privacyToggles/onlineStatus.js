import { callRobloxApi } from '../../../core/api.js';

let currentOptionSelected;

/** @type {import('../privacyToggles.d.ts').Dropdown} */
export default {
    title: 'privacyToggles.dropdowns.onlineStatus.name',
    name: 'onlineStatus',
    settingAttached: 'privacyTogglesDropdownOnlineStatusEnabled',
    icon: {
        icon: "person-magnifying-glass",
        filled: true,
    },
    getInitialItems: async (accountSettings) => {
        const onlineStatus = accountSettings.whoCanSeeMyOnlineStatus;
        const onlineStatusAvailableOptions = onlineStatus.options.map(a => a.option.optionValue);

        /** @type {import('../privacyToggles.d.ts').DropdownOption[]} */
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
                label: 'privacyToggles.dropdowns.shared.trustedFriends',
                value: 'TrustedFriends',
            },
            {
                label: 'privacyToggles.dropdowns.shared.noOne',
                value: 'NoOne',
            },
        ];

        (options.find(a => a.value === onlineStatus.currentValue) || options[0]).default = true

        currentOptionSelected = onlineStatus.currentValue || options[0].value;

        options.forEach(a => a.hidden = !onlineStatusAvailableOptions.includes(a.value));

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
                whoCanSeeMyOnlineStatus: value
            }
        });
    },
}
