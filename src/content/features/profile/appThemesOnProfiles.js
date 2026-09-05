import { updateUserSettingViaApi, getUserSettings } from '../../core/donators/settingHandler'
import { getCurrentUserTierSync } from '../../core/settings/handlesettings';
import { getAuthenticatedUserId } from '../../core/user';
import { settings } from '../../core/settings/getSettings.js';
import { callRobloxApiJson } from '../../core/api.js';
import { getUserIdFromUrl } from '../../core/idExtractor.js';

const SETTING_NAME = 'displayAppThemeUserProfile';
const SETTING_NAME_2 = 'displayAppThemeOwnProfile';
let isSetInProgress = false;
let isProfilePage = false;

export async function freePlusThemeCallback() { // Called by freeRobloxPlusThemes.js
    if (!isProfilePage || !await settings[SETTING_NAME]) return;

    const body = document.body;
    const profileUserId = getUserIdFromUrl();
    const profileUserSettings = await getUserSettings(profileUserId)

    const appThemes = (await callRobloxApiJson({
        subdomain: 'www',
        endpoint: '/global-settings/roblox-themes.json',
        isRovalraApi: true,
    })).themes;

    if (
        profileUserSettings.theme === '' ||
        appThemes.filter(i => i.setting === profileUserSettings.theme).length < 1
    ) return;

    body.classList.remove(...appThemes.map(i => i.class));

    if (profileUserSettings.theme === 'Default') return;

    body.classList.add(appThemes.filter(i => i.setting === profileUserSettings.theme)[0].class)
}

export async function initProfile() {
    isProfilePage = true;
}

export async function initSitewide() {
    document.addEventListener('rovalra:user-settings-response', async ({detail}) => {
        if (isSetInProgress || getCurrentUserTierSync() < 1 || !await settings[SETTING_NAME_2] || !detail.accountTheme) return;
        isSetInProgress = true;
        const userSettings = await getUserSettings(await getAuthenticatedUserId());
        if ((userSettings.theme && detail.accountTheme !== userSettings.theme) || !userSettings.theme) {
            updateUserSettingViaApi('theme', detail.accountTheme);
        }
        isSetInProgress = false;
    })
    document.addEventListener('rovalra:settingSaved', async (event) => {
        if (event.detail?.name !== SETTING_NAME_2) return;
        event.detail.value
        if (event.detail.value === true && getCurrentUserTierSync() >= 1) {
            try {
                const robloxUserSettings = await callRobloxApiJson({
                    subdomain: 'apis',
                    endpoint: '/user-settings-api/v1/user-settings'
                });
                updateUserSettingViaApi('theme', robloxUserSettings.accountTheme || "");
            } catch (e) {
                console.error('RoValra App Themes On Profile: Uh oh! Something went wrong! Setting theme to none. Details:', e);
                updateUserSettingViaApi('theme', "");
            }
        } else if (event.detail.value === false) {
            updateUserSettingViaApi('theme', "");
        }
    });
}
