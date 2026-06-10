import { settings } from "../../core/settings/getSettings";
import { debugVerbose } from "../../core/debug";

const plusTypeEnum = Object.freeze({
    Full: 0,
    Reduced: 1,
    None: 2,
});

let plusType = plusTypeEnum.Reduced;

async function asyncInit() {
    if (await settings.reducePlusAds)
        if (await settings.removeAllPlusAdds) plusType = plusTypeEnum.None;
        else plusType = plusTypeEnum.Reduced;
    else plusType = plusTypeEnum.Full;

    const hook = (warnOnNotFound) => {
        debugVerbose(`[lessPlus] hook() running`, {'warnOnNotFound': warnOnNotFound, 'plusTypeStateEnum': Object.keys(plusTypeEnum).find((k) => plusTypeEnum[k] === plusType), 'plusTypeState': plusType});
        if (plusType >= plusTypeEnum.Reduced) {
            const navbar = document.querySelector("#left-navigation-container .left-nav div");
            const robloxPlus = navbar.querySelectorAll("li:not(.padding-top-xsmall) a[href$='/plus']");

            if (robloxPlus[0]) {
                debugVerbose(`[lessPlus] Removing robloxPlus button from sidebar.`, {'element': robloxPlus});
                robloxPlus[0].parentElement.remove();
            } else if (warnOnNotFound)
                console.error("robloxPlus not found.");

            const _RobloxPlusNoteA = document.querySelectorAll(
                "#left-navigation-container .left-nav div li.padding-top-xsmall a[href='/plus']:not(.minimised-robloxplus-note)",
            );
            const robloxPlusNote = _RobloxPlusNoteA[0];
            if (plusType >= plusTypeEnum.None) {
                if (robloxPlusNote?.parentElement) {
                    debugVerbose(`[lessPlus] Removing robloxPlus note from sidebar.`, {'element': robloxPlusNote});
                    robloxPlusNote.parentElement.remove();
                } else if (warnOnNotFound)
                    console.error("robloxPlusNote.parentElement not found (no plus).");
            } else {
                if (robloxPlusNote?.parentElement) {
                    debugVerbose(`[lessPlus] Minimizing robloxPlus note from sidebar.`, {'element': robloxPlusNote});
                    robloxPlusNote.parentElement.innerHTML = String.raw`
                        <p class="text-body-medium padding-x-medium padding-y-small" style="white-space: nowrap;">
                          <span role="presentation" class="grow-0 shrink-0 basis-auto icon icon-regular-roblox-plus size-[var(--icon-size-small)]" style="vertical-align: -1px;"></span>
                          More fun for less Robux. 
                          <a href='/plus' class="content-default minimised-robloxplus-note [text-decoration:underline] [text-decoration-skip-ink:none] [text-underline-offset:3px]">Subscribe</a>
                        </p>
                    `; // Verified
                } else if (warnOnNotFound)
                    console.error("robloxPlusNote.parentElement not found (less plus).");
            }

            const _RobloxPlusInBuyRobuxSnippetA = document.querySelectorAll(
                "div.buy-robux-content div div div.flex a[href='/plus']",
            );

            if (_RobloxPlusInBuyRobuxSnippetA.length >= 1) {
                const robloxPlusInBuyRobuxSnippet =
                    _RobloxPlusInBuyRobuxSnippetA[0].parentElement.parentElement
                        .parentElement.children[1];

                if (plusType >= plusTypeEnum.None)
                    {robloxPlusInBuyRobuxSnippet.parentElement.remove(); debugVerbose(`[lessPlus] Minimizing Roblox Plus section from Buy Robux page.`, {'element': robloxPlusInBuyRobuxSnippet});}
                else {robloxPlusInBuyRobuxSnippet.remove(); debugVerbose(`[lessPlus] Removing Roblox Plus section from Buy Robux page.`, {'element': robloxPlusInBuyRobuxSnippet});}
            }
        }
    };

    window.addEventListener("DOMContentLoaded", () => hook(true));
    window.addEventListener("load", () => hook(false));
}

export function init() {
    asyncInit();
}
