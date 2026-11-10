// TODO: Fix bug -- yeah it doesnt work
// TODO: Add confirmation prompt when deleting profiles

import { render } from "preact";
import { renderElement } from "../../../core/ui/react";
import * as indexedDb from '../../../core/storage/indexedDb.js';
import { createOverlay } from "../../../core/ui/overlay";
import { createButton } from "../../../core/ui/buttons";
import { getCachedSettings } from "../../../core/settings/getSettings";
import { useEffect, useState } from "preact/hooks";
import { FLAT_SETTINGS_CONFIG } from "../../../core/settings/settingConfig";

const CONFIG = {
    DB_STORE: "rovalra-settingProfiles",
    STG_KEY: "rovalra-settingProfile-meta"
} as const;

async function lclstorage(): Promise<Record<string, Record<string, unknown>>> {
    return (await chrome.storage.local.get(CONFIG.STG_KEY) as any)[CONFIG.STG_KEY] ?? {};
}

async function __ensure_premade_profiles() {
    const predefinedProfileIndexRequest = await fetch(chrome.runtime.getURL("public/Assets/data/RuntimeData/settingProfiles/profiles.json"));
    const predefinedProfileIndex: Record<string, {
        name: string,
        path: string,
        default: "on" | "default" | "off"
    }> = await predefinedProfileIndexRequest.json();
    const allMeta = await lclstorage();

    for (const [key, value] of Object.entries(predefinedProfileIndex)) {
        if (allMeta[`predefined-${key}`] && (await indexedDb.get(CONFIG.DB_STORE, `predefined-${key}`))) {}
        else {
            const title = value.name;
            const _path = value.path;
            const default_value = value.default;
            const profileSettingsRequest = await fetch(chrome.runtime.getURL(_path));
            const profileSettings = await profileSettingsRequest.json();
            await saveProfile(`predefined-${key}`, title, profileSettings, false, default_value);
            console.info(`Saved premade profile: "${title}"`, {key: value});
        }
    }
}

async function updateProfileMeta(profileKey: string, properties: Record<string, unknown>): Promise<Record<string, unknown>> {
    const meta = (await lclstorage());
    Object.assign(meta[profileKey], properties);
    await chrome.storage.local.set({[CONFIG.STG_KEY]: meta});
    return meta[profileKey];
}

async function saveProfile(profileKey: string, title: string, settings: Record<string, unknown>, is_custom: boolean = true, default_value: "on" | "off" | "default" = "default") {
    const meta = await lclstorage();
    for (const profile of Object.values(meta)) {
        profile.currentProfile = false;
    }
    meta[profileKey] = {
        name: title,
        currentProfile: true,
        is_custom: is_custom,
        default_value: default_value
    };
    await chrome.storage.local.set({[CONFIG.STG_KEY]: meta});

    await indexedDb.set(CONFIG.DB_STORE, profileKey, settings);
}

function RenderedSettingProfile({profileKey, updateFn}: {profileKey: string, updateFn: () => Promise<void>}) {
    const [profileName, set_profileName] = useState<string>();
    const [isProfileCurrent, set_isProfileCurrent] = useState<boolean>();

    useEffect(() => {
        async function __inner() {
            const all_meta = await lclstorage();
            let meta: {
                name: string,
                currentProfile: boolean
            } = (all_meta)[profileKey] as any;
            set_profileName(meta.name);
            set_isProfileCurrent(meta.currentProfile);
        }
        void __inner();
        chrome.storage.local.onChanged.addListener(__inner);
    }, [profileKey]);

    return <div id={`rovalra-settingprofile-${profileKey}`} className="child-setting-item">
        <div className="setting-controls">
            <label>{profileName}</label>
            <button class="btn-control-md rovalra-ui-btn rovalra-btn-secondary"
            style="margin-left: auto;" disabled={isProfileCurrent} onClick={async() => {
                const all_meta = await lclstorage();
                let meta: {
                    name: string,
                    currentProfile: boolean
                } = (all_meta)[profileKey] as any;
                const settings: Record<string, unknown> = await indexedDb.get(CONFIG.DB_STORE, profileKey);

                const new_settings = await getCachedSettings();
                for (const settingKey of Object.keys(FLAT_SETTINGS_CONFIG)) {
                    new_settings[settingKey] = FLAT_SETTINGS_CONFIG[settingKey]['default'] ?? false;
                }
                for (const [settingKey, settingValue] of Object.entries(settings)) {
                   new_settings[settingKey] = settingValue;
                }
                await chrome.storage.local.set(new_settings);

                for (const profile of Object.values(all_meta)) {
                    profile.currentProfile = false;
                }
                all_meta[profileKey].currentProfile = true;
                await chrome.storage.local.set({
                    [CONFIG.STG_KEY]: all_meta
                });
            }}>Load Profile</button>
            <button class="btn-control-md rovalra-ui-btn rovalra-btn-secondary"
            style="margin-left: auto;" onClick={async() => {
                const meta = await lclstorage();
                delete meta[profileKey];
                await chrome.storage.local.set({ [CONFIG.STG_KEY]: meta });
                await indexedDb.set(CONFIG.DB_STORE, profileKey, undefined);
                await updateFn();
            }}>Delete Profile</button>
        </div>
    </div>
}

function WebpageComponent() {
    const [user_profiles, set_user_profiles] = useState<preact.ComponentChild[]>([]);
    const [premade_profiles, set_premade_profiles] = useState<preact.ComponentChild[]>([]);

    async function load_user_profiles() {
        set_user_profiles([]);
        set_premade_profiles([]);
        const all_profiles_meta: Record<string, Record<string, unknown>> = await lclstorage();
        for (const profile of Object.keys(all_profiles_meta)) {
            console.log(`Profile: ${profile}`);
            const rendered_setting_profile = <RenderedSettingProfile profileKey={profile} updateFn={load_user_profiles} />;
            if (all_profiles_meta[profile].is_custom === true)
                set_user_profiles(prev => [...prev, rendered_setting_profile]);
            else
                set_premade_profiles(prev => [...prev, rendered_setting_profile]);
        }
    }

    useEffect(() => {void load_user_profiles()}, []);

    const page = <div class="content" id="content"
    style={{
        width: '100%',
        height: 'auto',
        borderRadius: '10px',
        overflow: 'hidden',
        paddingBottom: '25px',
        paddingTop: '25px',
        minHeight: '800px',
        position: 'relative'
    }}>
        <h1 style="margin: 0px; color: var(--rovalra-main-text-color);">
            RoValra Setting Profiles
            <img data-rovalra-asset="rovalraIcon" src="chrome-extension://kgldgfecccdikgnhibokgfpgbhonoelj/public/Assets/RoValraLogo.png" style="width: 35px; height: 35px; margin-left: 5px; user-select: none;"/>
        </h1>
        <div id="setting-section-content">
            <div id="predefined-profiles" className="setting">
                <h2>Premade Profiles</h2>
                {premade_profiles}
            </div>
            {user_profiles.length > 0 && <div id="custom-profiles" className="setting">
                <h2>Your Profiles</h2>
                {user_profiles}
            </div>}
            <div id="create-profile" className="setting">
                <div className="setting-controls">
                    <label>Save current profile</label>
                    <button class="btn-control-md rovalra-ui-btn rovalra-btn-secondary"
                    id="configureGame" style="margin-left: auto;" onClick={async () => {
                        let overlayInstance;

                        const bodyContainer = renderElement(<div className="rovalra-overlay-body">
                            <p>Save your current settings as a new setting profile, that you can load later!</p>
                            <br/>
                            <input id="rovalra-setting-profile-input" type="text" placeholder="Profile name"/>
                        </div>);

                        const saveButton = createButton('(text) save', 'primary', {
                            onClick: async () => {
                                const inputElement = document.getElementById("rovalra-setting-profile-input") as HTMLInputElement;
                                const profileName = inputElement.value;

                                const allSettings = await getCachedSettings();
                                await saveProfile("user-" + profileName.replaceAll(" ", "--s--"), profileName, allSettings);
                                await load_user_profiles();
                            }
                        })

                        overlayInstance = createOverlay({
                            title: 'no-title-here',
                            bodyContent: bodyContainer,
                            actions: [saveButton],
                            onClose: () => {},
                            preventBackdropClose: false
                        });
                    }}>
                        Save Profile
                    </button>
                </div>
            </div>
        </div>
    </div>;

    return page;
}

async function renderWebpage() {
    document.querySelector("div#content")!.remove();

    const page = <WebpageComponent />;

    document.body.classList.add("rovalra-settings-page");
    const container = document.createElement("div");
    render(page, container);
    const element = container.firstElementChild!;

    const all_meta = await lclstorage();

    document.body.querySelector("main")!.append(container);

    return element;
}

export async function init() {
    if (!((await chrome.storage.local.get(CONFIG.STG_KEY))[CONFIG.STG_KEY])) {
        await chrome.storage.local.set({ [CONFIG.STG_KEY]: {} });
    }

    await __ensure_premade_profiles();

    document.addEventListener("rovalra:openSettingProfiles", () => {
        window.location.replace("https://www.roblox.com/my/account#!/setting-profiles");
    });

    if (window.location.pathname === '/my/account' && window.location.hash === "#!/setting-profiles") {
        await renderWebpage();
    }
};
