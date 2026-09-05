import { callRobloxApi } from '../../../core/api.js';

let currentOptionSelected;

async function baseOnOnlineStatus(currentSettings, otherSettingValue, setValue = null) {
    currentSettings.forEach(a => a.disabled = false);
    switch (otherSettingValue) {
        case 'NoOne':
            if (setValue && currentOptionSelected !== 'NoOne')
                setValue("NoOne");

            currentSettings
                .filter(a => a.value !== "NoOne")
                .forEach(a => a.disabled = true);
            break;
        case 'TrustedFriends':
            if (
                setValue &&
                currentOptionSelected !== 'TrustedFriends' &&
                currentOptionSelected !== 'NoOne'
            ) { setValue("TrustedFriends"); }

            currentSettings
                .filter(a =>
                    a.value !== "TrustedFriends" &&
                    a.value !== "NoOne")
                .forEach(a => a.disabled = true);
            break;
        case 'Friends':
            if (
                setValue &&
                currentOptionSelected !== 'Friends' &&
                currentOptionSelected !== 'TrustedFriends' &&
                currentOptionSelected !== 'NoOne'
            ) { setValue("Friends"); }

            currentSettings
                .filter(a =>
                    a.value !== "Friends" &&
                    a.value !== "TrustedFriends" &&
                    a.value !== "NoOne")
                .forEach(a => a.disabled = true);
            break;
        case 'FriendsAndFollowing':
            if (
                setValue && (
                    currentOptionSelected === 'All' ||
                    currentOptionSelected === 'Followers'
                )
            ) { setValue("Following"); }

            currentSettings
                .filter(a =>
                    a.value === "All" ||
                    a.value === "Followers")
                .forEach(a => a.disabled = true);
            break;
        case 'FriendsFollowingAndFollowers':
            if (
                setValue &&
                currentOptionSelected === 'All'
            ) { setValue("Followers"); }

            currentSettings
                .filter(a =>
                    a.value === "All")
                .forEach(a => a.disabled = true);
            break;
        default:
            break;
    }

    return currentSettings;
}

/** @type {import('../privacyToggles.d.ts').Dropdown} */
export default {
    title: 'privacyToggles.dropdowns.joinStatus.name',
    name: 'joinStatus',
    settingAttached: 'privacyTogglesDropdownJoinStatusEnabled',
    icon: {
        icon: "person-arrow-from-bottom-right",
        filled: true,
    },
    getInitialItems: async (accountSettings) => {
        const onlineStatus = accountSettings.whoCanSeeMyOnlineStatus;
        const joinStatus = accountSettings.whoCanJoinMeInExperiences;
        const joinStatusAvailableOptions = joinStatus.options.map(a => a.option.optionValue);

        /** @type {import('../privacyToggles.d.ts').DropdownOption[]} */
        let options = [
            {
                label: 'privacyToggles.dropdowns.shared.allUsers',
                value: 'All',
            },
            {
                label: 'privacyToggles.dropdowns.shared.friendsFollowingFollowers',
                value: 'Followers',
            },
            {
                label: 'privacyToggles.dropdowns.shared.friendsFollowing',
                value: 'Following',
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

        (options.find(a => a.value === joinStatus.currentValue) || options[0]).default = true

        currentOptionSelected = joinStatus.currentValue || options[0].value;

        options.forEach(a => a.hidden = !joinStatusAvailableOptions.includes(a.value));

        options = await baseOnOnlineStatus(options, onlineStatus.currentValue || "Everyone")

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
                whoCanJoinMeInExperiences: value
            }
        });
    },
    changeSettingsBasedOtherSettings: async (currentSettings, otherSettingName, otherSettingValue, setValue) => {
        // horrible code inbound!
        if (otherSettingName === 'onlineStatus') {
            currentSettings = await baseOnOnlineStatus(currentSettings, otherSettingValue, async (value) => {
                currentOptionSelected = value;
                setValue(value);
            });
        }

        return currentSettings;
    },
}
