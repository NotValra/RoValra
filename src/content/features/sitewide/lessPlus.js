import { settings } from "../../core/settings/getSettings";

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
        if (plusType >= plusTypeEnum.Reduced) {
            const navbar = document.querySelector("#left-navigation-container .left-nav div");
            const robloxPlus = navbar.querySelectorAll("a[data-rovalra-sidebar-tooltip-text='Roblox Plus']");

            if (robloxPlus[0])
                robloxPlus[0].parentElement.remove();
            else if (warnOnNotFound)
                console.error("robloxPlus not found.");

            const _RobloxPlusNoteA = document.querySelectorAll(
                "#left-navigation-container .left-nav div li.padding-top-xsmall a[href='/plus']",
            );
            const robloxPlusNote = _RobloxPlusNoteA[0];
            if (plusType >= plusTypeEnum.None) {
                if (robloxPlusNote?.parentElement)
                    robloxPlusNote.parentElement.remove();
                else if (warnOnNotFound)
                    console.error("robloxPlusNote.parentElement not found (no plus).");
            } else {
                if (robloxPlusNote?.parentElement)
                    robloxPlusNote.parentElement.innerHTML = String.raw`
                        <p class="text-body-medium padding-x-medium padding-y-small" style="white-space: nowrap;">
                          <span role="presentation" class="grow-0 shrink-0 basis-auto icon icon-regular-roblox-plus size-[var(--icon-size-small)]" style="vertical-align: -1px;"></span>
                          More fun for less Robux. 
                          <a href='/plus' class="content-default [text-decoration:underline] [text-decoration-skip-ink:none] [text-underline-offset:3px]">Subscribe</a>
                        </p>
                    `; // Verified
                else if (warnOnNotFound)
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
                    robloxPlusInBuyRobuxSnippet.parentElement.remove();
                else robloxPlusInBuyRobuxSnippet.remove();
            }
        }
    };

    window.addEventListener("DOMContentLoaded", () => hook(true));
    window.addEventListener("load", () => hook(false));
}

export function init() {
    asyncInit();
}
