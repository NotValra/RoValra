/* eslint-disable rovalra/check-css-vars */
import { t } from '../../core/locale/i18n.js';
import { safeHtml } from '../../core/packages/dompurify.js';
import { callRobloxApiJson } from '../../core/api.js';
import { observeElement } from '../../core/observer.js';

const additionalContainerDivClasses = 'padding-x-xxlarge large:padding-x-none'; // added for design purposes as it looks better in a mobile layout vs stretching to the side
const containerDivClasses = `gap-y-large flex flex-col ${additionalContainerDivClasses}`;
const parentElementQuerySelector = '#roblox-subscription-container > .clip-x > .flex > .width-full.flex.flex-col.self-stretch'

let containerObserver = null;

const TRANSLATIONS = [
    {
        key: 'plus.stats.robux',
        fallbackText: 'You\'ve saved {{robux}} with Plus',
    },
    {
        key: 'plus.stats.percentOffSmall',
        fallbackText: 'In-game items, avatars and more',
    },
    {
        key: 'plus.stats.percentOff',
        fallbackText: '{{percent}} off',
    },
    {
        key: 'plus.stats.itemsBoughtSmall',
        fallbackText: 'Items bought with Plus discount'
    },
    {
        key: 'plus.stats.privateServersCreatedSmall',
        fallbackText: 'Private servers created for free',
    },
    {
        key: 'plus.stats.robuxSentSmall',
        fallbackText: 'Robux sent to friends',
    },
    {
        key: 'plus.stats.delayNotice',
        fallbackText: 'All data shown here is delayed by 1 day',
    },
];

async function getTranslations() {
    return Promise.all(
        TRANSLATIONS.map(async (option) => [
            option.key.split('.')[option.key.split('.').length - 1],
            (await t(option.key).catch(() => option.fallbackText)),
        ]),
    ).then(entries => Object.fromEntries(entries));
}

async function makeHtml() {
    if (containerObserver && containerObserver.disconnect) containerObserver.disconnect();
    const containerDiv = document.createElement('div');
    const translations = await getTranslations();
    const robuxSavedTranslationParts = translations.robux.split(' {{robux}} ');
    const parent = document.querySelector(parentElementQuerySelector)
    let plusBenefits = null;

    try {
        plusBenefits = await callRobloxApiJson({
            endpoint: '/roblox-subscriptions/v1/roblox-plus/benefits',
            subdomain: 'apis',
            method: 'GET'
        });
    } catch (e) {
        console.warn("We had an exception in RoValra Plus Stats:", e);
        return;
    }


    containerDiv.className = containerDivClasses

    // large html stuff incoming
    containerDiv.innerHTML = safeHtml`
        <div
            class="
                gap-x-xsmall
                text-heading-small
                content-emphasis
                wrap
                flex
                items-center">
            <span>${robuxSavedTranslationParts[0]}</span>
            <span
                role="presentation"
                class="
                    grow-0
                    shrink-0
                    basis-auto
                    icon
                    icon-regular-robux
                    size-[var(--icon-size-medium)]">
            </span>
            <span>${String(plusBenefits.robuxSavedWithPlus)}</span>
            <span>${robuxSavedTranslationParts[1]}</span>
        </div>
        <div class="gap-y-small flex flex-col">
            <div class="gap-x-small flex">
                <div
                    class="
                        radius-medium
                        bg-shift-200
                        padding-large
                        gap-y-small
                        min-width-0
                        grow-1
                        flex
                        basis-0
                        flex-col">
                    <span
                        class="text-title-medium content-default">
                        ${translations.percentOffSmall}
                    </span>
                    <span
                        class="text-heading-large content-emphasis">
                        ${translations.percentOff.replace("{{percent}}", "0%")}
                    </span>
                </div>
                <div
                    class="
                        radius-medium
                        bg-shift-200
                        padding-large
                        gap-y-small
                        min-width-0
                        grow-1
                        flex
                        basis-0
                        flex-col">
                    <span class="text-title-medium content-default">${translations.itemsBoughtSmall}</span>
                    <span class="text-heading-large content-emphasis">${plusBenefits.itemsBoughtWithPlusDiscount}</span>
                </div>
            </div>
            <div class="gap-x-small flex">
                <div
                    class="
                        radius-medium
                        bg-shift-200
                        padding-large
                        gap-y-small
                        min-width-0
                        grow-1 flex
                        basis-0
                        flex-col">
                    <span class="text-title-medium content-default">${translations.privateServersCreatedSmall}</span>
                    <span class="text-heading-large content-emphasis">${plusBenefits.privateServersCreatedForFree}</span>
                </div>
                <div
                    class="
                        radius-medium
                        bg-shift-200
                        padding-large
                        gap-y-small
                        min-width-0
                        grow-1
                        flex
                        basis-0
                        flex-col">
                    <span class="text-title-medium content-default">${translations.robuxSentSmall}</span>
                    <span class="text-heading-large content-emphasis">
                        <span class="gap-x-xsmall flex items-center">
                            <span
                                role="presentation"
                                class="
                                    grow-0
                                    shrink-0
                                    basis-auto
                                    icon
                                    icon-regular-robux
                                    size-[var(--icon-size-medium)]">
                            </span>
                            ${plusBenefits.robuxSentToFriends}
                        </span>
                    </span>
                </div>
            </div>
            <span class="text-caption-medium content-muted">${translations.delayNotice}</span>
        </div>`;
    parent.appendChild(containerDiv);
    return true;
}


export function init() {
    chrome.storage.local.get(
        {
            plusStatsEnabled: true
        },
        (settings) => {
            if (settings.plusStatsEnabled == true)
                containerObserver = observeElement(parentElementQuerySelector, makeHtml)
        }
    );
}
