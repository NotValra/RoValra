import { debugVerbose, flush } from "../debug";
import { t } from "../locale/i18n";
import { createButton } from "../ui/buttons";
import { createOverlay } from "../ui/overlay";
import { parseMarkdown } from "../utils/markdown";
import { settings } from "./getSettings";

type ChangeData = {
    replaced?: string[],
    deleted?: string[]
}

interface Config {
    Locales: {
        UI: {
            Popup: {
                title: string
            },
            Deleted: string,
            Replaced: string
        }
    }
}

async function GetConfig(): Promise<Config> {
    return {
        Locales: {
            UI: {
                Popup: {
                    title: await t("settingsCompat-settingChangeNote.ui.popup.title")
                },
                Deleted: await t("settingsCompat-settingChangeNote.ui.deleted"),
                Replaced: await t("settingsCompat-settingChangeNote.ui.replaced")
            }
        }
    }
}

async function Init(message: ChangeData) {
    debugVerbose(`settingsCompatResultData received data.`, message);

    const replaced = message.replaced;
    const deleted = message.deleted;
    if (!replaced || !deleted) {
        console.error(`settingsCompatGetRes returned no data.`);
        return;
    }

    const config = await GetConfig();

    if (await settings.settingChangeNote !== true)
        return;

    let displayedMarkdown = "";

    if (replaced.length >= 1) {
        displayedMarkdown += `${config.Locales.UI.Replaced}\n * ${replaced.join("\n * ")}\n\n`;
        debugVerbose(`Replaced/changed ${replaced.length} settings.`, replaced);
    }

    if (deleted.length >= 1) {
        displayedMarkdown += `${config.Locales.UI.Deleted}\n * ${deleted.join("\n * ")}\n\n`;
        debugVerbose(`Deleted/locked/deprecated ${deleted.length} settings.`, deleted);
    }

    if (displayedMarkdown === "") {
        debugVerbose(`No markdown generated in settingsCompat. Returning.`, {replaced: replaced, deleted: deleted});
        return;
    }

    let outputHtml = parseMarkdown(displayedMarkdown);
    let outputObject = document.createElement("div");
    outputObject.innerHTML = outputHtml;

    const okayBtn = createButton("Okay", 'primary', {
        onClick: () => {
            overlay.close();
        },
        classList: ['rovalra-overlay-btn']
    });

    const overlay = createOverlay({
        title: config.Locales.UI.Popup.title,
        showLogo: true,
        preventBackdropClose: false,
        bodyContent: outputObject,
        actions: [okayBtn],
        onClose: () => {}
    });
}

function onLoad() {
    chrome.runtime.sendMessage({ type: "settingsCompatGetRes" }, Init);
}

if (window !== undefined) {
    window.addEventListener('load', onLoad);
}
