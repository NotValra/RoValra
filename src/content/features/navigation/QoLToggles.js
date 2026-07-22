import { getAssets } from '../../core/assets.js';
import { createNavbarButton } from '../../core/ui/navbarButton.js';
import { createDropdownMenu, createDropdown } from '../../core/ui/dropdown.js';
import { createRadioButton } from '../../core/ui/general/radio.js';
import { callRobloxApi } from '../../core/api.js';
import { t } from '../../core/locale/i18n.js';

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

export function init() {
    chrome.storage.local.get({ qolTogglesEnabled: true }, async (settings) => {
        if (!settings.qolTogglesEnabled) {
            return;
        }

        if (document.getElementById('rovalra-qol-toggle')) return;

        const assets = getAssets();
        const button = await createNavbarButton({
            id: 'rovalra-qol-toggle',
            iconSvgData: assets.qolIcon,
        });

        if (!button) return;

        const permissionLevels = {
            AllUsers: 4,
            All: 4,
            FriendsFollowingAndFollowers: 3,
            Followers: 3,
            FriendsAndFollowing: 2,
            Following: 2,
            Friends: 1,
            NoOne: 0,
        };
        const onlineToJoinMap = {
            AllUsers: 'All',
            FriendsFollowingAndFollowers: 'Followers',
            FriendsAndFollowing: 'Following',
            Friends: 'Friends',
            NoOne: 'NoOne',
        };
        const joinToOnlineMap = {
            All: 'AllUsers',
            Followers: 'FriendsFollowingAndFollowers',
            Following: 'FriendsAndFollowing',
            Friends: 'Friends',
            NoOne: 'NoOne',
        };

        const tMap = {
            onlineStatus: await t('qolToggles.onlineStatus'),
            joinStatus: await t('qolToggles.joinStatus'),
            privateServerPrivacy: await t('qolToggles.privateServerPrivacy'),
            inventoryVisibility: await t('qolToggles.inventoryVisibility'),
            everyone: await t('qolToggles.everyone'),
            friendsFollowingAndFollowers: await t(
                'qolToggles.friendsFollowingAndFollowers',
            ),
            friendsAndFollowing: await t('qolToggles.friendsAndFollowing'),
            friends: await t('qolToggles.friends'),
            trustedFriends: await t('qolToggles.trustedFriends'),
            noOne: await t('qolToggles.noOne'),
        };

        let currentOnlineStatus = 'AllUsers';
        let currentJoinStatus = 'AllUsers';
        let currentPrivateServerPrivacy = 'AllUsers';
        let currentInventoryVisibility = 'AllUsers';
        try {
            const response = await callRobloxApi({
                subdomain: 'apis',
                endpoint:
                    '/user-settings-api/v1/user-settings/settings-and-options',
            });
            if (response.ok) {
                const data = await response.json();
                if (data.whoCanSeeMyOnlineStatus?.currentValue) {
                    currentOnlineStatus =
                        data.whoCanSeeMyOnlineStatus.currentValue;
                }
                if (data.whoCanJoinMeInExperiences?.currentValue) {
                    currentJoinStatus =
                        data.whoCanJoinMeInExperiences.currentValue;
                }
                if (data.privateServerPrivacy?.currentValue) {
                    currentPrivateServerPrivacy =
                        data.privateServerPrivacy.currentValue;
                }
                if (data.whoCanSeeMyInventory?.currentValue) {
                    currentInventoryVisibility =
                        data.whoCanSeeMyInventory.currentValue;
                }
            }
        } catch (e) {
            console.warn('RoValra: Failed to fetch online status', e);
        }

        currentJoinStatus =
            onlineToJoinMap[currentJoinStatus] || currentJoinStatus;

        const data = await new Promise((resolve) =>
            chrome.storage.local.get([], resolve),
        );

        const labelMap = {
            onlineStatus: tMap.onlineStatus,
            joinStatus: tMap.joinStatus,
            privateServerPrivacy: tMap.privateServerPrivacy,
            inventoryVisibility: tMap.inventoryVisibility,
        };

        const menu = createDropdownMenu({
            trigger: button,
            items: [
                {
                    label: labelMap['onlineStatus'],
                    value: 'onlineStatus',
                },
                {
                    label: labelMap['joinStatus'],
                    value: 'joinStatus',
                },
                {
                    label: labelMap['privateServerPrivacy'],
                    value: 'privateServerPrivacy',
                },
                {
                    label: labelMap['inventoryVisibility'],
                    value: 'inventoryVisibility',
                },
            ],
            onValueChange: () => {},
            position: 'center',
        });

        menu.panel.style.setProperty('min-width', '320px', 'important');

        const updatePosition = () => {
            if (button.offsetWidth <= 0) return;

            const edge =
                button.dataset.rovalraTopbarLayoutEdge ||
                button.closest('[data-rovalra-topbar-layout-key]')?.dataset
                    .rovalraTopbarLayoutEdge;
            if (edge === 'left' || edge === 'right') {
                menu.panel.style.transform = 'none';
                menu.panel.style.marginLeft = '0';
            } else {
                menu.panel.style.transform = 'translateX(-50%)';
                menu.panel.style.marginLeft = `${button.offsetWidth / 2}px`;
            }
        };
        button.addEventListener('click', updatePosition);
        updatePosition();

        const itemButtons = menu.panel.querySelectorAll(
            '.rovalra-dropdown-item',
        );
        itemButtons.forEach((btn) => {
            const value = btn.dataset.value;
            if (!value) return;

            const div = document.createElement('div');
            div.className = btn.className;
            div.setAttribute('role', 'option');
            div.setAttribute('data-value', value);

            while (btn.firstChild) {
                div.appendChild(btn.firstChild);
            }

            if (
                value === 'onlineStatus' ||
                value === 'joinStatus' ||
                value === 'privateServerPrivacy' ||
                value === 'inventoryVisibility'
            ) {
                const isOnlineStatus = value === 'onlineStatus';
                const isJoinStatus = value === 'joinStatus';
                const isPrivateServer = value === 'privateServerPrivacy';
                const isInventoryVisibility = value === 'inventoryVisibility';

                const statusOptions = [
                    {
                        label: tMap.everyone,
                        value: isJoinStatus ? 'All' : 'AllUsers',
                    },
                    {
                        label: tMap.friendsFollowingAndFollowers,
                        value: isJoinStatus
                            ? 'Followers'
                            : 'FriendsFollowingAndFollowers',
                    },
                    {
                        label: tMap.friendsAndFollowing,
                        value: isJoinStatus
                            ? 'Following'
                            : 'FriendsAndFollowing',
                    },
                    { label: tMap.friends, value: 'Friends' },
                ];

                if (isOnlineStatus || isJoinStatus) {
                    statusOptions.push({
                        label: tMap.trustedFriends,
                        value: 'TrustedFriends',
                    });
                }

                statusOptions.push({ label: tMap.noOne, value: 'NoOne' });

                let initialValue;
                if (isOnlineStatus) initialValue = currentOnlineStatus;
                else if (isJoinStatus) initialValue = currentJoinStatus;
                else if (isPrivateServer)
                    initialValue = currentPrivateServerPrivacy;
                else if (isInventoryVisibility)
                    initialValue = currentInventoryVisibility;

                const { element: statusDropdown, setValue } = createDropdown({
                    items: statusOptions,
                    initialValue: initialValue,
                    onValueChange: async (newValue) => {
                        let payload;

                        if (isOnlineStatus) {
                            payload = { whoCanSeeMyOnlineStatus: newValue };
                            currentOnlineStatus = newValue;

                            const onlineLevel =
                                permissionLevels[currentOnlineStatus];
                            const joinLevel =
                                permissionLevels[currentJoinStatus];
                            const joinDropdownEl = document.getElementById(
                                'rovalra-qol-joinStatus-dropdown',
                            );

                            if (onlineLevel < joinLevel) {
                                const newJoinValue =
                                    onlineToJoinMap[currentOnlineStatus];
                                if (
                                    joinDropdownEl &&
                                    joinDropdownEl.rovalraSetValue
                                ) {
                                    await callRobloxApi({
                                        subdomain: 'apis',
                                        endpoint:
                                            '/user-settings-api/v1/user-settings',
                                        method: 'POST',
                                        body: {
                                            whoCanJoinMeInExperiences:
                                                newJoinValue,
                                        },
                                    }).catch((e) =>
                                        console.error(
                                            'Failed to update join status',
                                            e,
                                        ),
                                    );
                                    joinDropdownEl.rovalraSetValue(
                                        newJoinValue,
                                    );
                                    currentJoinStatus = newJoinValue;
                                }
                            }
                        } else if (isJoinStatus) {
                            payload = { whoCanJoinMeInExperiences: newValue };
                            currentJoinStatus = newValue;

                            const joinLevel =
                                permissionLevels[currentJoinStatus];
                            const onlineLevel =
                                permissionLevels[currentOnlineStatus];
                            const onlineDropdownEl = document.getElementById(
                                'rovalra-qol-onlineStatus-dropdown',
                            );

                            if (joinLevel > onlineLevel) {
                                const newOnlineValue =
                                    joinToOnlineMap[currentJoinStatus];
                                if (
                                    onlineDropdownEl &&
                                    onlineDropdownEl.rovalraSetValue
                                ) {
                                    await callRobloxApi({
                                        subdomain: 'apis',
                                        endpoint:
                                            '/user-settings-api/v1/user-settings',
                                        method: 'POST',
                                        body: {
                                            whoCanSeeMyOnlineStatus:
                                                newOnlineValue,
                                        },
                                    }).catch((e) =>
                                        console.error(
                                            'Failed to update online status',
                                            e,
                                        ),
                                    );
                                    onlineDropdownEl.rovalraSetValue(
                                        newOnlineValue,
                                    );
                                    currentOnlineStatus = newOnlineValue;
                                }
                            }
                        } else if (isPrivateServer) {
                            payload = { privateServerPrivacy: newValue };
                            currentPrivateServerPrivacy = newValue;
                        } else if (isInventoryVisibility) {
                            payload = { whoCanSeeMyInventory: newValue };
                            currentInventoryVisibility = newValue;
                        }

                        callRobloxApi({
                            subdomain: 'apis',
                            endpoint: '/user-settings-api/v1/user-settings',
                            method: 'POST',
                            body: payload,
                        }).catch((e) =>
                            console.error('Failed to update status', e),
                        );
                    },
                });

                statusDropdown.id = `rovalra-qol-${value}-dropdown`;
                statusDropdown.rovalraSetValue = setValue;
                statusDropdown.style.marginLeft = 'auto';
                statusDropdown.style.minWidth = '140px';
                statusDropdown.style.maxWidth = '140px';
                statusDropdown.addEventListener('click', (e) =>
                    e.stopPropagation(),
                );

                const trigger = statusDropdown.querySelector(
                    '.rovalra-dropdown-trigger',
                );
                if (trigger) {
                    trigger.style.height = '30px';
                    trigger.style.minHeight = '30px';
                    trigger.style.padding = '0 8px';
                    trigger.style.fontSize = '12px';
                    trigger.style.minWidth = '100%';
                }

                appendInlineControl(div, statusDropdown);
            } else {
                const radio = createRadioButton({
                    id: `rovalra-qol-${value}`,
                    checked: !!data[value],
                    onChange: (newState) => {
                        chrome.storage.local.set({ [value]: newState });
                    },
                });
                radio.style.marginLeft = 'auto';

                appendInlineControl(div, radio);

                div.addEventListener('click', () => {
                    const currentChecked =
                        radio.getAttribute('aria-checked') === 'true';
                    radio.setChecked(!currentChecked);
                    chrome.storage.local.set({
                        [value]: !currentChecked,
                    });
                });
            }

            btn.parentNode.replaceChild(div, btn);
        });
    });
}
