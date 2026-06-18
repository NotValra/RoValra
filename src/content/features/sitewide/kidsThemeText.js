import DOMPurify from 'dompurify';
import { observeChildren, startObserving } from '../../core/observer.js';
import { t } from '../../core/locale/i18n.js';

const ageBadgeContainerId = 'age-badge-container';
const badgeClassToSelect = 'rbx-age-badge';
const badgeClasses = badgeClassToSelect + ' items-center justify-center select-none height-400 padding-x-xsmall radius-small text-label-small margin-left-[6px] bg-[var(--color-content-emphasis)] content-[var(--color-surface-0)]';

let currentBadgeContainerObserver = null

const AGE_BADGE_TEXT_OPTIONS = [
    {
        labelKey: 'ageTheme.badge.select',
        fallbackLabel: 'SELECT',
        value: 'select',
    },
    {
        labelKey: 'ageTheme.badge.select',
        fallbackLabel: 'SELECT',
        value: 'startmode',
    },
    {
        labelKey: 'ageTheme.badge.kids',
        fallbackLabel: 'KIDS',
        value: 'kids',
    },
];

async function getLocalizedThemeOptionsText() {
    return Promise.all(
        AGE_BADGE_TEXT_OPTIONS.map(async (option) => [
            option.value,
            (await t(option.labelKey).catch(() => option.fallbackLabel)).toLocaleUpperCase(),
        ]),
    ).then(entries => Object.fromEntries(entries));
}

async function hideBadge() {
    const badgeContainer = document.getElementById(ageBadgeContainerId)
    badgeContainer.style.display = 'none';
    badgeContainer.style.visibility = 'hidden';
}

async function showBadge() {
    const badgeContainer = document.getElementById(ageBadgeContainerId)
    badgeContainer.style.display = null;
    badgeContainer.style.visibility = null;
}

async function addBadge() {
    const badgeContainer = document.getElementById(ageBadgeContainerId);
    const newBadge = document.createElement('span');

    if (!badgeContainer) return undefined;

    newBadge.className = badgeClasses;
    badgeContainer.appendChild(newBadge);

    return newBadge;
}

async function editBadge(text) {
    const cleanText = DOMPurify.sanitize(text)
    const elementsWithBadgeClass =
        document.getElementsByClassName(badgeClassToSelect);
    const badgeElement = elementsWithBadgeClass.length >= 1
        ? elementsWithBadgeClass[0]
        : await addBadge();

    if (!badgeElement) return;

    if (cleanText == '')
        hideBadge();
    else
        showBadge();

    badgeElement.textContent = cleanText
}

async function matchBadgeToTheme(theme) {
    const badgeNames = await getLocalizedThemeOptionsText();
    editBadge(badgeNames[theme])
}

export function makeBadgeChanges() {
    chrome.storage.local.get(
        {
            // Age Theme Settings
            ageKidsThemeEnabled: false,
            ageThemeSelection: 'normal',
            ageThemeTextMatch: true,

            // Age Text Settings
            ageKidsTextEnabled: false,
            ageKidsTextInput: null,
            ageKidsTextHiddenEnabled: false,
        },
        (settings) => {
            if (
                (
                    !(settings.ageKidsThemeEnabled && settings.ageThemeTextMatch)
                    && (!settings.ageKidsTextEnabled)
                )
                || !document.body
            ) return;

            if (settings.ageKidsTextEnabled && settings.ageKidsTextHiddenEnabled) {
                chrome.storage.local.set({ ageThemeTextMatch: false });
                hideBadge();
            } else if (settings.ageKidsTextEnabled && !settings.ageKidsTextHiddenEnabled) {
                chrome.storage.local.set({ ageThemeTextMatch: false });
                editBadge(settings.ageKidsTextInput);
            } else if (settings.ageKidsThemeEnabled && settings.ageThemeTextMatch) {
                matchBadgeToTheme(settings.ageThemeSelection);
            }
            if (currentBadgeContainerObserver) currentBadgeContainerObserver.disconnect();
        },
    );
}

export function init() {
    if (!document.body && !document.getElementById(ageBadgeContainerId)) return;
    if (currentBadgeContainerObserver) currentBadgeContainerObserver.disconnect();
    currentBadgeContainerObserver = observeChildren(document.getElementById(ageBadgeContainerId), makeBadgeChanges);
    startObserving();
    makeBadgeChanges();
}
