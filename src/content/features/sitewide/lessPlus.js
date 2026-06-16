import { settings } from "../../core/settings/getSettings";
import { feature } from "../../core/defineFeature/defFeat";

const plusTypeEnum = Object.freeze({
    Full: 0,
    Reduced: 1,
    None: 2,
});

@feature({paths: ["*"]})
export class LessPlus {
    constructor() {
        this.plusType = plusTypeEnum.Reduced;
    }

    async init() {
        if (await settings.reducePlusAds)
            if (await settings.removeAllPlusAdds) this.plusType = plusTypeEnum.None;
            else this.plusType = plusTypeEnum.Reduced;
        else this.plusType = plusTypeEnum.Full;
    }

    async onDOMLoaded() {
        if (this.plusType >= plusTypeEnum.Reduced) {
            const _RobloxPlusButtonA = document.querySelectorAll(
                "#left-navigation-container .left-nav div a[href='https://www.roblox.com/plus']",
            );

            const robloxPlusButton = _RobloxPlusButtonA[0];
            robloxPlusButton.parentElement.remove();

            const _RobloxPlusNoteA = document.querySelectorAll(
                "#left-navigation-container .left-nav div li.padding-top-xsmall a[href='/plus']",
            );
            const robloxPlusNote = _RobloxPlusNoteA[0];
            if (this.plusType >= plusTypeEnum.None)
                robloxPlusNote.parentElement.remove();
            else {
                robloxPlusNote.parentElement.innerHTML = String.raw`
                    <p class="text-body-medium padding-x-medium padding-y-small" style="white-space: nowrap;">
                      <span role="presentation" class="grow-0 shrink-0 basis-auto icon icon-regular-roblox-plus size-[var(--icon-size-small)]" style="vertical-align: -1px;"></span>
                      More fun for less Robux. 
                      <a href='/plus' class="content-default [text-decoration:underline] [text-decoration-skip-ink:none] [text-underline-offset:3px]">Subscribe</a>
                    </p>
                `; // Verified
            }

            const _RobloxPlusInBuyRobuxSnippetA = document.querySelectorAll(
                "div.buy-robux-content div div div.flex a[href='/plus']",
            );

            if (_RobloxPlusInBuyRobuxSnippetA.length >= 1) {
                const robloxPlusInBuyRobuxSnippet =
                    _RobloxPlusInBuyRobuxSnippetA[0].parentElement.parentElement
                        .parentElement.children[1];

                if (this.plusType >= plusTypeEnum.None)
                    robloxPlusInBuyRobuxSnippet.parentElement.remove();
                else robloxPlusInBuyRobuxSnippet.remove();
            }
        }
    }
}
