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

async function updateProfileMeta(profileKey: string, properties: Record<string, unknown>): Promise<Record<string, unknown>> {
    const meta = (await chrome.storage.local.get(CONFIG.STG_KEY) as any)[profileKey];
    Object.assign(meta, properties);
    await chrome.storage.local.set({[CONFIG.STG_KEY]: meta});
    return meta;
}

async function saveProfile(profileKey: string, title: string, settings: Record<string, unknown>) {
    const meta = await chrome.storage.local.get(CONFIG.STG_KEY) as any;
    meta[profileKey] = {
        name: title,
        currentProfile: true  // TODO: include predefined/custom
    };
    await chrome.storage.local.set({[CONFIG.STG_KEY]: meta});

    // TODO: Save settings as well
}

async function renderSettingProfile(profileKey: string) {
    const meta: {
        name: string,
        currentProfile: boolean
    } = (await chrome.storage.local.get(CONFIG.STG_KEY) as any)[profileKey];

    return <div id={`rovalra-settingprofile-${profileKey}`} className="child-setting-item">
        <div className="setting-controls">
            <label>{meta.name}</label>
            <div style="margin-left: auto; width: 200px; max-width: 100%;">
                <button disabled={meta.currentProfile} onClick={async() => {
                    const settings: Record<string, unknown> = await indexedDb.get(CONFIG.DB_STORE, profileKey);
                    for (const [settingKey, settingValue] of Object.entries(settings)) {
                        await chrome.storage.local.set({settingKey: settingValue});
                    }
                    await updateProfileMeta(profileKey, {currentProfile: true});  // TODO: Update all others to `currentProfile: false`
                }}>Load Profile</button>
            </div>
        </div>
    </div>
}

async function renderWebpage() {
    document.querySelector("div#content")!.remove();

    const all_profiles_meta: Record<string, Record<string, unknown>> = await chrome.storage.local.get(CONFIG.STG_KEY) as any;

    const user_profiles = [];

    for (const profile of Object.keys(all_profiles_meta)) {
        user_profiles.push(await renderSettingProfile(profile));
    }

    const page = <div class="content" id="content"
    style={{
        width: '100% !important',
        height: 'auto !important',
        borderRadius: '10px !important',
        overflow: 'hidden !important',
        paddingBottom: '25px !important',
        paddingTop: '25px !important',
        minHeight: '800px !important',
        position: 'relative !important'
    }}>
        <h1 style="margin: 0px; color: var(--rovalra-main-text-color);">
            RoValra Setting Profiles
            <img data-rovalra-asset="rovalraIcon" src="chrome-extension://kgldgfecccdikgnhibokgfpgbhonoelj/public/Assets/RoValraLogo.png" style="width: 35px; height: 35px; margin-left: 5px; user-select: none;"/>
        </h1>
        <secondary>
            <div id="setting-section-content">
                <div id="predefined-profiles" className="setting">

                </div>
                <div id="custom-profiles" className="setting">
                    {user_profiles}
                </div>
                <div id="create-profile" className="setting">
                    <div className="setting-controls">
                        <label>Save current profile</label>
                        <div style="margin-left: auto; width: 200px; max-width: 100%;">
                            <button onClick={async () => {
                                let overlayInstance;

                                const bodyContainer = renderElement(<div className="rovalra-overlay-body">
                                    <p>Save your current settings as a new setting profile, that you can load later!</p>
                                    <br/>
                                    <input id="rovalra-setting-profile-input" type="text" placeholder="Profile name"/>
                                </div>);

                                const saveButton = createButton('(text) save', 'primary', {
                                    onClick: () => {
                                        const inputElement = document.getElementById("rovalra-setting-profile-input") as HTMLInputElement;
                                        const profileName = inputElement.value;


                                    }
                                })

                                overlayInstance = createOverlay({
                                    title: 'no-title-here',
                                    bodyContent: bodyContainer,
                                    actions: [],
                                    onClose: () => {}
                                })
                            }}>
                                Save Profile
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </secondary>
    </div>;

    return renderElement(page, document.querySelector("main")!);
}

export async function init() {
    document.addEventListener("rovalra:openSettingProfiles", () => {
        window.location.replace("https://www.roblox.com/rovalra/setting-profiles");
    });

    if (window.location.pathname === '/rovalra/setting-profiles') {
        await renderWebpage();
    }
};
