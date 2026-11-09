// TODO: Fix bug -- first profile saved doesn't appear.
// TODO: Add confirmation prompt when deleting profiles

import { render } from "preact";
import { renderElement } from "../../../core/ui/react";
import * as indexedDb from '../../../core/storage/indexedDb.js';
import { createOverlay } from "../../../core/ui/overlay";
import { createButton } from "../../../core/ui/buttons";
import { getCachedSettings } from "../../../core/settings/getSettings";

const CONFIG = {
    DB_STORE: "rovalra-settingProfiles",
    STG_KEY: "rovalra-settingProfile-meta"
} as const;

async function lclstorage(): Promise<Record<string, Record<string, unknown>>> {
    return (await chrome.storage.local.get(CONFIG.STG_KEY) as any)[CONFIG.STG_KEY] as any;
}

async function updateProfileMeta(profileKey: string, properties: Record<string, unknown>): Promise<Record<string, unknown>> {
    const meta = (await lclstorage());
    Object.assign(meta[profileKey], properties);
    await chrome.storage.local.set({[CONFIG.STG_KEY]: meta});
    return meta[profileKey];
}

async function saveProfile(profileKey: string, title: string, settings: Record<string, unknown>) {
    const meta = await lclstorage();
    for (const profile of Object.values(meta)) {
        profile.currentProfile = false;
    }
    meta[profileKey] = {
        name: title,
        currentProfile: true  // TODO: include predefined/custom
    };
    await chrome.storage.local.set({[CONFIG.STG_KEY]: meta});

    await indexedDb.set(CONFIG.DB_STORE, profileKey, settings);
}

async function renderSettingProfile(profileKey: string) {
    const all_meta = await lclstorage();
    const meta: {
        name: string,
        currentProfile: boolean
    } = (all_meta)[profileKey] as any;

    return <div id={`rovalra-settingprofile-${profileKey}`} className="child-setting-item">
        <div className="setting-controls">
            <label>{meta.name}</label>
            <button class="btn-control-md rovalra-ui-btn rovalra-btn-secondary"
            id="configureGame" style="margin-left: auto;" disabled={meta.currentProfile} onClick={async() => {
                const settings: Record<string, unknown> = await indexedDb.get(CONFIG.DB_STORE, profileKey);
                for (const [settingKey, settingValue] of Object.entries(settings)) {
                    await chrome.storage.local.set({settingKey: settingValue});
                }
                for (const profile of Object.values(all_meta)) {
                    profile.currentProfile = false;
                }
                await updateProfileMeta(profileKey, {currentProfile: true});
            }}>Load Profile</button>
            <button class="btn-control-md rovalra-ui-btn rovalra-btn-secondary"
            id="configureGame" style="margin-left: auto;" onClick={async() => {
                const meta = await lclstorage();
                delete meta[profileKey];
                await chrome.storage.local.set({ [CONFIG.STG_KEY]: meta });
                await indexedDb.set(CONFIG.DB_STORE, profileKey, undefined);
                await window.location.reload();
            }}>Delete Profile</button>
        </div>
    </div>
}

async function renderWebpage() {
    document.querySelector("div#content")!.remove();

    const all_profiles_meta: Record<string, Record<string, unknown>> = await lclstorage();
    console.log(all_profiles_meta);

    const user_profiles = [];

    for (const profile of Object.keys(all_profiles_meta)) {
        console.log(`Profile: ${profile}`);
        user_profiles.push(await renderSettingProfile(profile));
    }

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

            </div>
            <div id="custom-profiles" className="setting">
                {user_profiles}
            </div>
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
                                await saveProfile(profileName.replaceAll(" ", "--s--"), profileName, allSettings);
                                await window.location.reload();
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

    document.body.classList.add("rovalra-settings-page");
    const element = renderElement(page);

    const predefined_profiles = element.querySelector("#predefined-profiles");
    if (predefined_profiles?.children.length === 0)
        predefined_profiles.remove();
    else {
        renderElement(
            <div className="setting-controls">
                <label>Pre-Defined Profiles</label>
            </div>,
            predefined_profiles!
        );
    }

    const custom_profiles = element.querySelector("#custom-profiles");
    if (custom_profiles?.children.length === 0)
        custom_profiles.remove();
    else {
        renderElement(
            <div className="setting-controls">
                <label>Your Profiles</label>
            </div>,
            custom_profiles!
        );
    }

    document.body.querySelector("main")!.append(element);

    return element;
}

export async function init() {
    if (!((await chrome.storage.local.get(CONFIG.STG_KEY))[CONFIG.STG_KEY])) {
        await chrome.storage.local.set({ [CONFIG.STG_KEY]: {} });
    }

    document.addEventListener("rovalra:openSettingProfiles", () => {
        window.location.replace("https://www.roblox.com/my/account#!/setting-profiles");
    });

    if (window.location.pathname === '/my/account' && window.location.hash === "#!/setting-profiles") {
        await renderWebpage();
    }
};
