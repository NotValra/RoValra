import { getUserIdFromUrl } from '../../../core/idExtractor.js';
import {
    getUserSettings,
    updateUserSettingViaApi,
} from '../../../core/donators/settingHandler.js';
import { observeElement } from '../../../core/observer.js';
import { getAuthenticatedUserId } from '../../../core/user.js';
import { addTooltip } from '../../../core/ui/tooltip.js';
import { normalizeProfilePronouns } from '../../../core/profile/pronouns.js';
import { ts } from '../../../core/locale/i18n.js';

const PRONOUNS_SETTING_NAME = 'profilePronouns';
const USERNAME_SELECTOR = '.user-profile-header-info .stylistic-alts-username';

let activeProfileUserId = null;
let activePronouns = null;
let usernameObserverStarted = false;
let settingListenerStarted = false;
const automaticApiSyncAttempts = new Set();

function renderPronouns(usernameElement) {
    const targetContainer = usernameElement?.parentElement;
    if (!targetContainer) return;

    let pronounsElement = targetContainer.querySelector(
        ':scope > .rovalra-profile-pronouns',
    );

    if (!activePronouns) {
        pronounsElement?.remove();
        targetContainer.classList.remove('rovalra-profile-username-row');
        return;
    }

    targetContainer.classList.add('rovalra-profile-username-row');

    if (!pronounsElement) {
        pronounsElement = document.createElement('span');
        pronounsElement.className = 'rovalra-profile-pronouns';
        usernameElement.after(pronounsElement);
    }

    if (!pronounsElement.dataset.rovalraPronounsTooltip) {
        addTooltip(pronounsElement, ts('profilePronouns.label'), {
            position: 'top',
            showArrow: false,
            tooltipClassName: 'rovalra-pronouns-tooltip',
        });
        pronounsElement.dataset.rovalraPronounsTooltip = 'true';
    }

    pronounsElement.textContent = activePronouns;
    pronounsElement.setAttribute(
        'aria-label',
        ts('profilePronouns.ariaLabel', { pronouns: activePronouns }),
    );
    pronounsElement.removeAttribute('title');
}

function renderAllPronouns() {
    document.querySelectorAll(USERNAME_SELECTOR).forEach(renderPronouns);
}

async function getStoredPronouns() {
    const stored = await chrome.storage.local.get([
        PRONOUNS_SETTING_NAME,
        'rovalra_settings',
    ]);
    return normalizeProfilePronouns(
        stored[PRONOUNS_SETTING_NAME] ??
            stored.rovalra_settings?.[PRONOUNS_SETTING_NAME],
    );
}

async function setStoredPronouns(pronouns) {
    const stored = await chrome.storage.local.get('rovalra_settings');
    const rovalraSettings = { ...(stored.rovalra_settings || {}) };
    rovalraSettings[PRONOUNS_SETTING_NAME] = pronouns;

    await chrome.storage.local.set({
        [PRONOUNS_SETTING_NAME]: pronouns,
        rovalra_settings: rovalraSettings,
    });
}

async function syncStoredPronounsToApi(userId, pronouns) {
    const syncKey = String(userId);
    if (!pronouns || automaticApiSyncAttempts.has(syncKey)) return pronouns;
    automaticApiSyncAttempts.add(syncKey);

    try {
        const updatedValue = await updateUserSettingViaApi(
            'pronouns',
            pronouns,
            {
                throwOnError: true,
                suppressErrorLog: true,
            },
        );
        return normalizeProfilePronouns(updatedValue) || pronouns;
    } catch (error) {
        console.warn(
            'RoValra: Existing local pronouns could not be synced to the API yet.',
            error,
        );
        return pronouns;
    }
}

function startObservers() {
    if (!usernameObserverStarted) {
        usernameObserverStarted = true;
        observeElement(USERNAME_SELECTOR, renderPronouns);
    }

    if (!settingListenerStarted) {
        settingListenerStarted = true;
        document.addEventListener('rovalra:settingSaved', async (event) => {
            if (event.detail?.name !== PRONOUNS_SETTING_NAME) return;

            const authenticatedUserId = await getAuthenticatedUserId();
            if (activeProfileUserId !== String(authenticatedUserId)) return;

            activePronouns = normalizeProfilePronouns(event.detail.value);
            renderAllPronouns();
        });
    }
}

async function initProfilePronouns() {
    startObservers();

    const userId = Number(getUserIdFromUrl());
    activeProfileUserId = userId ? String(userId) : null;
    activePronouns = null;
    renderAllPronouns();
    if (!userId) return;

    try {
        const authenticatedUserId = await getAuthenticatedUserId();
        if (activeProfileUserId !== String(userId)) return;

        const isOwnProfile = String(authenticatedUserId) === String(userId);
        const storedPronouns = isOwnProfile ? await getStoredPronouns() : null;

        if (isOwnProfile) {
            activePronouns = storedPronouns;
            if (activeProfileUserId !== String(userId)) return;
            renderAllPronouns();
        }

        const profileSettings = await getUserSettings(userId, {
            disableBatch: true,
            noCache: true,
            forcePublicEndpoint: true,
        });
        if (activeProfileUserId !== String(userId)) return;

        const apiPronouns = normalizeProfilePronouns(profileSettings?.pronouns);
        if (!isOwnProfile) {
            activePronouns = apiPronouns;
        } else if (apiPronouns) {
            activePronouns = apiPronouns;
            if (apiPronouns !== storedPronouns) {
                await setStoredPronouns(apiPronouns);
            }
        } else if (storedPronouns) {
            activePronouns = await syncStoredPronounsToApi(
                userId,
                storedPronouns,
            );
        } else {
            activePronouns = null;
        }

        if (activeProfileUserId !== String(userId)) return;
        renderAllPronouns();
    } catch (error) {
        console.warn('RoValra: Failed to load profile pronouns.', error);
    }
}

export function init() {
    initProfilePronouns();
}
