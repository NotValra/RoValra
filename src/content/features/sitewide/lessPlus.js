import DOMPurify from 'dompurify';
import { settings } from '../../core/settings/getSettings';
import { debugVerbose } from '../../core/debug';
import { observeElement } from '../../core/observer';

const plusTypeEnum = Object.freeze({
    Full: 0,
    Reduced: 1,
    None: 2,
});

const ROBLOX_PLUS_LINK_SELECTOR =
    "li:not(.padding-top-xsmall) a[href$='/plus']";
const ROBLOX_PLUS_NOTE_SELECTOR =
    "li.padding-top-xsmall a[href='/plus']:not(.minimised-robloxplus-note)";
const BUY_ROBUX_PLUS_SELECTOR =
    "div.buy-robux-content div div div.flex a[href='/plus']";

let plusType = plusTypeEnum.Reduced;
let initialized = false;
let robloxPlusObserver = null;
let robloxPlusNoteObserver = null;

function disableRobloxPlusLink(robloxPlus) {
    const sidebarItem = robloxPlus.closest('li');
    if (!sidebarItem) return;

    debugVerbose(`[lessPlus] Hiding robloxPlus button from sidebar.`, {
        element: robloxPlus,
    });
    sidebarItem.dataset.rovalraLessPlusDisabled = 'true';
    sidebarItem.classList.add('rovalra-less-plus-disabled');
    document.dispatchEvent(new CustomEvent('rovalra-less-plus-change'));
}

function updateRobloxPlusNote(robloxPlusNote) {
    const sidebarItem = robloxPlusNote.closest('li');
    if (!sidebarItem) return;

    sidebarItem.dataset.rovalraLessPlusNote = 'true';

    if (plusType >= plusTypeEnum.None) {
        debugVerbose(`[lessPlus] Removing robloxPlus note from sidebar.`, {
            element: robloxPlusNote,
        });
        sidebarItem.remove();
        return;
    }

    debugVerbose(`[lessPlus] Minimizing robloxPlus note from sidebar.`, {
        element: robloxPlusNote,
    });
    sidebarItem.innerHTML = DOMPurify.sanitize(String.raw`
        <p class="text-body-medium padding-x-medium padding-y-small" style="white-space: nowrap;">
            <span role="presentation" class="grow-0 shrink-0 basis-auto icon icon-regular-roblox-plus size-[var(--icon-size-small)]" style="vertical-align: -1px;"></span>
            More fun for less Robux.
            <a href="/plus" class="content-default minimised-robloxplus-note [text-decoration:underline] [text-decoration-skip-ink:none] [text-underline-offset:3px]">Subscribe</a>
        </p>
    `);
}

function observeRobloxPlusSidebar(navbar) {
    robloxPlusObserver?.disconnect();
    robloxPlusNoteObserver?.disconnect();

    robloxPlusObserver = observeElement(
        ROBLOX_PLUS_LINK_SELECTOR,
        disableRobloxPlusLink,
        { root: navbar, multiple: true },
    );
    robloxPlusNoteObserver = observeElement(
        ROBLOX_PLUS_NOTE_SELECTOR,
        updateRobloxPlusNote,
        { root: navbar, multiple: true },
    );
}

function updateBuyRobuxPlus(robloxPlusLink) {
    const plusSection =
        robloxPlusLink.parentElement?.parentElement?.parentElement
            ?.children?.[1];
    if (!plusSection) return;

    if (plusType >= plusTypeEnum.None) {
        debugVerbose(
            `[lessPlus] Removing Roblox Plus section from Buy Robux page.`,
            {
                element: plusSection,
            },
        );
        plusSection.parentElement?.remove();
        return;
    }

    debugVerbose(
        `[lessPlus] Minimizing Roblox Plus section from Buy Robux page.`,
        {
            element: plusSection,
        },
    );
    plusSection.remove();
}

async function asyncInit() {
    if (await settings.reducePlusAds)
        if (await settings.removeAllPlusAdds) plusType = plusTypeEnum.None;
        else plusType = plusTypeEnum.Reduced;
    else plusType = plusTypeEnum.Full;

    if (plusType < plusTypeEnum.Reduced) return;

    observeElement(
        '#left-navigation-container .left-nav',
        observeRobloxPlusSidebar,
    );
    observeElement(BUY_ROBUX_PLUS_SELECTOR, updateBuyRobuxPlus, {
        multiple: true,
    });
}

export function init() {
    if (initialized) return;
    initialized = true;
    asyncInit();
}
