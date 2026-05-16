const plusTypeEnum = Object.freeze({
    Full: 0,
    Reduced: 1,
    None: 2
});

let plusType = plusTypeEnum.Reduced;

async function actualInitBecauseTheUniverseHatesMe(settings) {
    if (settings.rovalra_less_robloxplus)
        if (settings.rovalra_no_robloxplus)
            plusType = plusTypeEnum.None;
        else
            plusType = plusTypeEnum.Reduced;
    else
        plusType = plusTypeEnum.Full;

    window.addEventListener('load', () => {
        if (plusType >= plusTypeEnum.Reduced) {
            const _RobloxPlusButtonA = document.querySelectorAll("#left-navigation-container .left-nav div a[href='https://www.roblox.com/plus']");
            if (_RobloxPlusButtonA.length != 1)
                console.error(`Query selector \`#left-navigation-container .left-nav div a[href='https://www.roblox.com/plus']\` returned ${_RobloxPlusButtonA.length} elements.`);

            const robloxPlusButton = _RobloxPlusButtonA[0];
            robloxPlusButton.parentElement.remove();

            const _RobloxPlusNoteA = document.querySelectorAll("#left-navigation-container .left-nav div li.padding-top-xsmall a[href='/plus']");
            if (_RobloxPlusNoteA.length != 1)
                console.error(`Query selector \`#left-navigation-container .left-nav div li.padding-top-xsmall a[href='/plus']\` returned ${_RobloxPlusNoteA.length} elements.`);

            const robloxPlusNote = _RobloxPlusNoteA[0];
            if (plusType >= plusTypeEnum.None)
                robloxPlusNote.parentElement.remove();
            else {
                robloxPlusNote.parentElement.innerHTML = String.raw`
                    <p class="text-body-medium padding-x-medium padding-y-small" style="white-space: nowrap;">
                      <span role="presentation" class="grow-0 shrink-0 basis-auto icon icon-regular-roblox-plus size-[var(--icon-size-small)]" style="vertical-align: -1px;"></span>
                      More fun for less Robux. 
                      <a href='/plus' class="content-default [text-decoration:underline] [text-decoration-skip-ink:none] [text-underline-offset:3px]">Subscribe</a>
                    </p>
                `;  // Verified
            }

            const _RobloxPlusInBuyRobuxSnippetA = document.querySelectorAll("div.buy-robux-content div div div.flex a[href='/plus']");
            if (_RobloxPlusInBuyRobuxSnippetA.length != 1)
                console.error(`Query selector \`div.buy-robux-content div div div.flex a[href='/plus']\` returned ${_RobloxPlusInBuyRobuxSnippetA.length} elements.`);

            const robloxPlusInBuyRobuxSnippet = _RobloxPlusInBuyRobuxSnippetA[0].parentElement.parentElement.parentElement.children[1];

            if (plusType >= plusTypeEnum.None)
                robloxPlusInBuyRobuxSnippet.parentElement.remove();
            else
                robloxPlusInBuyRobuxSnippet.remove();
        }

    });
}

export function init() {
    chrome.storage.local.get({reducePlusAds: true, removeAllPlusAdds: true}, actualInitBecauseTheUniverseHatesMe);
}
