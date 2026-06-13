import { observeElement } from '../../../core/observer.js';
import { getAssets } from '../../../core/assets.js';
import { addTooltip } from '../../../core/ui/tooltip.js';
import { getAuthenticatedUserId } from '../../../core/user.js';
import { ts } from '../../../core/locale/i18n.js';

const STORAGE_KEY = 'rovalra_first_account_cache';
const ONE_HOUR_MS = 3600000;
const pendingSections = new WeakSet();

function isAccountSettingsPage() {
    return /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?my\/account(?:\/|$)/i.test(
        window.location.pathname,
    );
}

function getLoginMethodsSection(element) {
    const section = element.closest('.setting-section');
    if (!section) return null;

    if (
        section.querySelector('#account-change-password') ||
        section.querySelector('#fido-registration-container') ||
        section.querySelector('.passkey-upsell-banner')
    ) {
        return section;
    }

    return null;
}

function getLoginMethodsContent(section) {
    const passwordButton = section.querySelector('#account-change-password');
    const passwordField = passwordButton?.closest(
        '.settings-text-field-container',
    );

    return (
        passwordField?.parentElement ||
        section.querySelector('#fido-registration-container')?.parentElement ||
        section.querySelector('.passkey-upsell-banner')?.parentElement ||
        section.querySelector('.section-content') ||
        section
    );
}

function getLocalStorage(keys) {
    return new Promise((resolve) => {
        chrome.storage.local.get(keys, resolve);
    });
}

function setLocalStorage(items) {
    return new Promise((resolve) => {
        chrome.storage.local.set(items, resolve);
    });
}

function createFirstAccountElement(isFirst, creationTimestamp) {
    const container = document.createElement('div');
    container.className =
        'form-group settings-text-field-container rovalra-first-account';

    const textField = document.createElement('div');
    textField.className = 'account-settings-text-field';

    const label = document.createElement('span');
    label.className = 'text-title-large account-info-inline-label';
    label.textContent = ts('firstAccount.label');

    const valueContainer = document.createElement('div');
    valueContainer.className = 'settings-text-lines-container';

    const valueMetaContainer = document.createElement('div');
    valueMetaContainer.className = 'account-settings-value-metadata-container';
    valueMetaContainer.style.display = 'flex';
    valueMetaContainer.style.alignItems = 'center';

    const valueSpan = document.createElement('span');
    valueSpan.className = 'settings-text-span-visible text-body-medium';
    valueSpan.textContent = isFirst
        ? ts('firstAccount.yes')
        : ts('firstAccount.no');

    valueMetaContainer.appendChild(valueSpan);

    const assets = getAssets();
    const icon = document.createElement('div');
    Object.assign(icon.style, {
        width: '16px',
        height: '16px',
        marginLeft: '4px',
        cursor: 'help',
        display: 'inline-block',
        backgroundColor: 'var(--rovalra-secondary-text-color)',
        webkitMask: `url("${assets.priceFloorIcon}") no-repeat center / contain`,
        mask: `url("${assets.priceFloorIcon}") no-repeat center / contain`,
    });

    let tooltipText = ts('firstAccount.tooltip');
    if (creationTimestamp) {
        const date = new Date(parseInt(creationTimestamp, 10));
        tooltipText += `<br>${ts('firstAccount.createdDate', { date: date.toLocaleDateString() })}`;
    }

    addTooltip(icon, tooltipText, { position: 'top' });
    valueMetaContainer.appendChild(icon);

    valueContainer.appendChild(valueMetaContainer);
    textField.appendChild(label);
    textField.appendChild(valueContainer);
    container.appendChild(textField);

    return container;
}

function insertFirstAccountElement(section, isFirst, creationTimestamp) {
    if (section.querySelector('.rovalra-first-account')) return;

    const element = createFirstAccountElement(isFirst, creationTimestamp);
    const contentContainer = getLoginMethodsContent(section);
    const passwordButton = section.querySelector('#account-change-password');
    const passwordField = passwordButton?.closest(
        '.settings-text-field-container',
    );

    if (passwordField?.parentElement === contentContainer) {
        passwordField.insertAdjacentElement('afterend', element);
        return;
    }

    contentContainer.appendChild(element);
}

async function loadFirstAccountInfo(section) {
    if (
        pendingSections.has(section) ||
        section.querySelector('.rovalra-first-account')
    ) {
        return;
    }

    pendingSections.add(section);

    try {
        const userId = await getAuthenticatedUserId();
        if (!userId) return;

        const result = await getLocalStorage([STORAGE_KEY]);
        const allCache = result[STORAGE_KEY] || {};
        const userCache = allCache[userId];
        const now = Date.now();

        if (userCache && now - userCache.timestamp < ONE_HOUR_MS) {
            insertFirstAccountElement(
                section,
                userCache.isOriginalUser,
                userCache.originalAccountCreationTimestampMs,
            );
            return;
        }

        const response = await fetch(
            'https://apis.roblox.com/player-hydration-service/v1/players/signed',
            {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
            },
        ); //Verified

        if (!response.ok) throw new Error('API failed');

        const data = await response.json();
        if (!data?.playerInfo) return;

        const isOriginalUser = data.playerInfo.isOriginalUser;
        const creationTimestamp =
            data.playerInfo.originalAccountCreationTimestampMs;
        const latestResult = await getLocalStorage([STORAGE_KEY]);
        const currentCache = latestResult[STORAGE_KEY] || {};

        currentCache[userId] = {
            isOriginalUser,
            originalAccountCreationTimestampMs: creationTimestamp,
            timestamp: Date.now(),
        };

        await setLocalStorage({ [STORAGE_KEY]: currentCache });

        insertFirstAccountElement(section, isOriginalUser, creationTimestamp);
    } catch (err) {
        console.error('RoValra: Failed to get first account info', err);
    } finally {
        pendingSections.delete(section);
    }
}

export function init() {
    if (!isAccountSettingsPage()) {
        return;
    }

    chrome.storage.local.get({ firstAccountEnabled: true }, (result) => {
        if (!result.firstAccountEnabled) return;

        observeElement(
            '#account-change-password, #fido-registration-container, .passkey-upsell-banner',
            (element) => {
                const section = getLoginMethodsSection(element);
                if (section) loadFirstAccountInfo(section);
            },
            { multiple: true },
        );
    });
}
