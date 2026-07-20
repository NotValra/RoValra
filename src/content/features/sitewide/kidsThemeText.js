import DOMPurify from 'dompurify';
import { observeChildren, startObserving } from '../../core/observer.js';
import { t } from '../../core/locale/i18n.js';

const ageBadgeContainerId = 'age-badge-container';
const badgeClassToSelect = 'rbx-age-badge';
const badgeClasses =
    badgeClassToSelect +
    ' items-center justify-center select-none height-400 padding-x-xsmall radius-small text-label-small margin-left-[6px] bg-[var(--color-content-emphasis)] content-[var(--color-surface-0)]';
const AGE_BADGE_TEXT_MAX_LENGTH = 30;
const expandedBadgeRootClass = 'rovalra-age-badge-push-navbar';
const navbarShiftProperty = '--rovalra-age-badge-navbar-shift';
const desktopNavbarSelector =
    '#header > .container-fluid > ul.nav.rbx-navbar.hidden-xs.hidden-sm';
const badgeToNavbarGap = 12;

let currentBadgeContainerObserver = null;
let observerCalled = 0;
let navbarLayoutFrame = null;
let pushNavbarEnabled = false;
let layoutListenersInitialized = false;

function updateNavbarLayout() {
    navbarLayoutFrame = null;

    const root = document.documentElement;
    root.style.removeProperty(navbarShiftProperty);

    if (!pushNavbarEnabled) return;

    const badgeContainer = document.getElementById(ageBadgeContainerId);
    const desktopNavbar = document.querySelector(desktopNavbarSelector);
    const firstNavbarItem = desktopNavbar?.querySelector(':scope > li');

    if (!badgeContainer || !desktopNavbar || !firstNavbarItem) return;

    const badgeRect = badgeContainer.getBoundingClientRect();
    const firstNavbarItemRect = firstNavbarItem.getBoundingClientRect();

    if (
        badgeRect.width === 0 ||
        firstNavbarItemRect.width === 0 ||
        firstNavbarItemRect.height === 0
    )
        return;

    const requiredShift = Math.max(
        0,
        Math.ceil(
            badgeRect.right + badgeToNavbarGap - firstNavbarItemRect.left,
        ),
    );

    if (requiredShift > 0) {
        root.style.setProperty(navbarShiftProperty, `${requiredShift}px`);
    }
}

function scheduleNavbarLayoutUpdate() {
    if (navbarLayoutFrame !== null) return;

    navbarLayoutFrame = requestAnimationFrame(updateNavbarLayout);
}

function setPushNavbarEnabled(enabled) {
    pushNavbarEnabled = enabled === true;

    const root = document.documentElement;
    root.classList.toggle(expandedBadgeRootClass, pushNavbarEnabled);
    root.style.removeProperty(navbarShiftProperty);

    if (pushNavbarEnabled) scheduleNavbarLayoutUpdate();
}

function initializeLayoutListeners() {
    if (layoutListenersInitialized) return;
    layoutListenersInitialized = true;

    window.addEventListener('resize', scheduleNavbarLayoutUpdate, {
        passive: true,
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local') return;

        const relevantSettingChanged = [
            'ageKidsTextEnabled',
            'ageKidsTextInput',
            'ageKidsTextPushNavbarEnabled',
            'ageKidsTextHiddenEnabled',
        ].some((settingName) => changes[settingName]);

        if (relevantSettingChanged) makeBadgeChanges();
    });
}

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
            (
                await t(option.labelKey).catch(() => option.fallbackLabel)
            ).toLocaleUpperCase(),
        ]),
    ).then((entries) => Object.fromEntries(entries));
}

async function hideBadge() {
    const badgeContainer = document.getElementById(ageBadgeContainerId);
    if (!badgeContainer) return;
    badgeContainer.style.display = 'none';
    badgeContainer.style.visibility = 'hidden';
    scheduleNavbarLayoutUpdate();
}

async function showBadge() {
    const badgeContainer = document.getElementById(ageBadgeContainerId);
    if (!badgeContainer) return;
    badgeContainer.style.display = null;
    badgeContainer.style.visibility = null;
    scheduleNavbarLayoutUpdate();
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
    const cleanText = DOMPurify.sanitize(String(text ?? '')).slice(
        0,
        AGE_BADGE_TEXT_MAX_LENGTH,
    );
    const elementsWithBadgeClass =
        document.getElementsByClassName(badgeClassToSelect);
    const badgeElement =
        elementsWithBadgeClass.length >= 1
            ? elementsWithBadgeClass[0]
            : await addBadge();

    if (!badgeElement) return;

    if (cleanText == '') hideBadge();
    else showBadge();

    badgeElement.textContent = cleanText;
    scheduleNavbarLayoutUpdate();
}

async function matchBadgeToTheme(theme) {
    const badgeNames = await getLocalizedThemeOptionsText();
    editBadge(badgeNames[theme]);
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
            ageKidsTextPushNavbarEnabled: false,
            ageKidsTextHiddenEnabled: false,
        },
        (settings) => {
            const shouldPushNavbar =
                settings.ageKidsTextEnabled &&
                !settings.ageKidsTextHiddenEnabled &&
                settings.ageKidsTextPushNavbarEnabled;

            setPushNavbarEnabled(shouldPushNavbar);

            if (
                (!(
                    settings.ageKidsThemeEnabled && settings.ageThemeTextMatch
                ) &&
                    !settings.ageKidsTextEnabled) ||
                !document.body
            )
                return;

            if (
                settings.ageKidsTextEnabled &&
                settings.ageKidsTextHiddenEnabled
            ) {
                chrome.storage.local.set({ ageThemeTextMatch: false });
                hideBadge();
            } else if (
                settings.ageKidsTextEnabled &&
                !settings.ageKidsTextHiddenEnabled
            ) {
                chrome.storage.local.set({ ageThemeTextMatch: false });
                editBadge(settings.ageKidsTextInput);
            } else if (
                settings.ageKidsThemeEnabled &&
                settings.ageThemeTextMatch
            ) {
                matchBadgeToTheme(settings.ageThemeSelection);
            }
            if (currentBadgeContainerObserver && observerCalled >= 2)
                currentBadgeContainerObserver.disconnect();
            else if (currentBadgeContainerObserver) observerCalled++;
        },
    );
}

export function init() {
    if (!document.body && !document.getElementById(ageBadgeContainerId)) return;
    initializeLayoutListeners();
    if (currentBadgeContainerObserver)
        currentBadgeContainerObserver.disconnect();
    makeBadgeChanges();
    currentBadgeContainerObserver = observeChildren(
        document.getElementById(ageBadgeContainerId),
        makeBadgeChanges,
    );
    startObserving();
}
