import { getAssets } from '../../core/assets.js';
import { createNavbarButton } from '../../core/ui/navbarButton.js';
import { createDropdownMenu, createDropdown } from '../../core/ui/dropdown.js';
import { createRadioButton } from '../../core/ui/general/radio.js';
import { callRobloxApi } from '../../core/api.js';

export function init() {
    chrome.storage.local.get({ qolTogglesEnabled: true }, (settings) => {
        if (!settings.qolTogglesEnabled) {
            return;
        }

        const addQoLButton = async () => {
            if (document.getElementById('rovalra-qol-toggle')) return;

            const assets = getAssets();
            const button = await createNavbarButton({
                id: 'rovalra-qol-toggle',
                iconSvgData: assets.qolIcon,
            });

            if (!button) return;
                
                const permissionLevels = {
                    'AllUsers': 4, 'All': 4,
                    'FriendsFollowingAndFollowers': 3, 'Followers': 3,
                    'FriendsAndFollowing': 2, 'Following': 2,
                    'Friends': 1,
                    'NoOne': 0
                };
                const onlineToJoinMap = {
                    'AllUsers': 'All',
                    'FriendsFollowingAndFollowers': 'Followers',
                    'FriendsAndFollowing': 'Following',
                    'Friends': 'Friends',
                    'NoOne': 'NoOne'
                };
                const joinToOnlineMap = {
                    'All': 'AllUsers',
                    'Followers': 'FriendsFollowingAndFollowers',
                    'Following': 'FriendsAndFollowing',
                    'Friends': 'Friends',
                    'NoOne': 'NoOne'
                };

                let currentOnlineStatus = 'AllUsers';
                let currentJoinStatus = 'AllUsers';
                try {
                    const response = await callRobloxApi({
                        subdomain: 'apis',
                        endpoint: '/user-settings-api/v1/user-settings/settings-and-options'
                    });
                    if (response.ok) {
                        const data = await response.json();
                        if (data.whoCanSeeMyOnlineStatus?.currentValue) {
                            currentOnlineStatus = data.whoCanSeeMyOnlineStatus.currentValue;
                        }
                        if (data.whoCanJoinMeInExperiences?.currentValue) {
                            currentJoinStatus = data.whoCanJoinMeInExperiences.currentValue;
                        }
                    }
                } catch (e) {
                    console.warn('RoValra: Failed to fetch online status', e);
                }

                currentJoinStatus = onlineToJoinMap[currentJoinStatus] || currentJoinStatus;

                chrome.storage.local.get([], (data) => {
                    const labelMap = {
                        'onlineStatus': 'Online Status',
                        'joinStatus': 'Experience Status'
                    };

                    const menu = createDropdownMenu({
                        trigger: button,
                        items: [
                            { label: labelMap['onlineStatus'], value: 'onlineStatus' },
                            { label: labelMap['joinStatus'], value: 'joinStatus' }
                        ],
                        onValueChange: () => {},
                        position: 'center'
                    });

                    menu.panel.style.transform = 'translateX(-50%)';
                    menu.panel.style.setProperty('min-width', '200px', 'important');

                    const updatePosition = () => {
                        if (button.offsetWidth > 0) {
                            menu.panel.style.marginLeft = `${button.offsetWidth / 2}px`;
                        }
                    };
                    button.addEventListener('click', updatePosition);
                    updatePosition();

                    const itemButtons = menu.panel.querySelectorAll('.rovalra-dropdown-item');
                    itemButtons.forEach(btn => {
                        const value = btn.dataset.value;
                        if (!value) return;

                        const div = document.createElement('div');
                        div.className = btn.className;
                        div.setAttribute('role', 'option');
                        div.setAttribute('data-value', value);
                        
                        while (btn.firstChild) {
                            div.appendChild(btn.firstChild);
                        }

                        if (value === 'onlineStatus' || value === 'joinStatus') {
                            const isOnlineStatus = value === 'onlineStatus';
                            const statusOptions = [
                                { label: 'Everyone', value: isOnlineStatus ? 'AllUsers' : 'All' },
                                { label: 'Connections, Followers, & Following', value: isOnlineStatus ? 'FriendsFollowingAndFollowers' : 'Followers' },
                                { label: 'Connections & Following', value: isOnlineStatus ? 'FriendsAndFollowing' : 'Following' },
                                { label: 'Connections', value: 'Friends' },
                                { label: 'No one', value: 'NoOne' }
                            ];

                            let initialValue = isOnlineStatus ? currentOnlineStatus : currentJoinStatus;

                            const { element: statusDropdown, setValue } = createDropdown({
                                items: statusOptions,
                                initialValue: initialValue,
                                onValueChange: (newValue) => {
                                    const payload = isOnlineStatus 
                                        ? { whoCanSeeMyOnlineStatus: newValue }
                                        : { whoCanJoinMeInExperiences: newValue };
                
                                    callRobloxApi({
                                        subdomain: 'apis',
                                        endpoint: '/user-settings-api/v1/user-settings',
                                        method: 'POST',
                                        body: payload
                                    }).catch(e => console.error('Failed to update status', e));
                
                                    const onlineDropdownEl = document.getElementById('rovalra-qol-onlineStatus-dropdown');
                                    const joinDropdownEl = document.getElementById('rovalra-qol-joinStatus-dropdown');
                
                                    if (isOnlineStatus) {
                                        currentOnlineStatus = newValue;
                                        const onlineLevel = permissionLevels[currentOnlineStatus];
                                        const joinLevel = permissionLevels[currentJoinStatus];
                
                                        if (onlineLevel < joinLevel) {
                                            const newJoinValue = onlineToJoinMap[currentOnlineStatus];
                                            if (joinDropdownEl && joinDropdownEl.rovalraSetValue) {
                                                joinDropdownEl.rovalraSetValue(newJoinValue);
                                                currentJoinStatus = newJoinValue;
                                                callRobloxApi({
                                                    subdomain: 'apis',
                                                    endpoint: '/user-settings-api/v1/user-settings',
                                                    method: 'POST',
                                                    body: { whoCanJoinMeInExperiences: newJoinValue }
                                                }).catch(e => console.error('Failed to update join status', e));
                                            }
                                        }
                                    } else { // isJoinStatus
                                        currentJoinStatus = newValue;
                                        const joinLevel = permissionLevels[currentJoinStatus];
                                        const onlineLevel = permissionLevels[currentOnlineStatus];
                
                                        if (joinLevel > onlineLevel) {
                                            const newOnlineValue = joinToOnlineMap[currentJoinStatus];
                                            if (onlineDropdownEl && onlineDropdownEl.rovalraSetValue) {
                                                onlineDropdownEl.rovalraSetValue(newOnlineValue);
                                                currentOnlineStatus = newOnlineValue;
                                                callRobloxApi({
                                                    subdomain: 'apis',
                                                    endpoint: '/user-settings-api/v1/user-settings',
                                                    method: 'POST',
                                                    body: { whoCanSeeMyOnlineStatus: newOnlineValue }
                                                }).catch(e => console.error('Failed to update online status', e));
                                            }
                                        }
                                    }
                                    if (isOnlineStatus && newValue === 'NoOne' && joinDropdownEl && joinDropdownEl.rovalraSetValue) {
                                        const joinDropdownEl = document.getElementById('rovalra-qol-joinStatus-dropdown');
                                        if (joinDropdownEl && joinDropdownEl.rovalraSetValue) {
                                            joinDropdownEl.rovalraSetValue('NoOne');
                                            callRobloxApi({
                                                subdomain: 'apis',
                                                endpoint: '/user-settings-api/v1/user-settings',
                                                method: 'POST',
                                                body: { whoCanJoinMeInExperiences: 'NoOne' }
                                            }).catch(e => console.error('Failed to update join status', e));
                                        }
                                    }
                                }
                            });

                            statusDropdown.id = `rovalra-qol-${value}-dropdown`;
                            statusDropdown.rovalraSetValue = setValue;
                            statusDropdown.style.marginLeft = 'auto';
                            statusDropdown.style.minWidth = '140px';
                            statusDropdown.style.maxWidth = '140px';
                            statusDropdown.addEventListener('click', (e) => e.stopPropagation());

                            const trigger = statusDropdown.querySelector('.rovalra-dropdown-trigger');
                            if (trigger) {
                                trigger.style.height = '30px';
                                trigger.style.minHeight = '30px';
                                trigger.style.padding = '0 8px';
                                trigger.style.fontSize = '12px';
                                trigger.style.minWidth = '100%';
                            }

                            const textWrapper = div.querySelector('.text-truncate-split.flex.flex-col');
                            if (textWrapper) textWrapper.appendChild(statusDropdown);
                        } else {
                            const radio = createRadioButton({
                                id: `rovalra-qol-${value}`,
                                checked: !!data[value],
                                onChange: (newState) => {
                                    chrome.storage.local.set({ [value]: newState });
                                }
                            });
                            radio.style.marginLeft = 'auto';

                            const textWrapper = div.querySelector('.text-truncate-split.flex.flex-col');
                            if (textWrapper) textWrapper.appendChild(radio);

                            div.addEventListener('click', () => {
                                const currentChecked = radio.getAttribute('aria-checked') === 'true';
                                radio.setChecked(!currentChecked);
                                chrome.storage.local.set({ [value]: !currentChecked });
                            });
                        }

                        btn.parentNode.replaceChild(div, btn);
                    });
                });
        };

        addQoLButton();
    });
}