import { observeAttributes, observeElement } from '../../core/observer.js';
import { t } from '../../core/locale/i18n.js';
import { Icon } from '../../core/ui/buildericon.js';
import { settings } from '../../core/settings/getSettings.js';

const STORAGE_KEY = 'hiddenFriendPrivateServers';
const PRIVATE_SERVER_ROW_SELECTOR =
    '.flex.items-center.justify-between.padding-y-medium.width-full';
const HIDE_BUTTON_SELECTOR = '[data-rovalra-hide-private-server]';

let hiddenPrivateServerIds = new Set();
let storageListenerRegistered = false;
let enabled = false;

function isHideablePrivateServer(row) {
    return (
        row.closest('[data-rovalra-section-type="private"]') &&
        row.getAttribute('data-rovalra-is-owner') === 'false' &&
        row.getAttribute('data-private-server-id')
    );
}

function getButtonContainer(row) {
    return row.querySelector(
        '.flex.items-center.gap-small.grow-0.shrink-0.basis-auto',
    );
}

async function hidePrivateServer(row, privateServerId) {
    hiddenPrivateServerIds.add(privateServerId);

    try {
        await chrome.storage.local.set({
            [STORAGE_KEY]: [...hiddenPrivateServerIds],
        });
        row.remove();
    } catch {
        hiddenPrivateServerIds.delete(privateServerId);
    }
}

async function addHideButton(row, privateServerId) {
    const buttonContainer = getButtonContainer(row);
    const nativeButton = buttonContainer?.querySelector('button');

    if (
        !buttonContainer ||
        !nativeButton ||
        buttonContainer.querySelector(HIDE_BUTTON_SELECTOR)
    )
        return;

    const wrapper = nativeButton.parentElement.cloneNode(false);
    const hideButton = nativeButton.cloneNode(true);
    const content = hideButton.querySelector(
        '.flex.items-center.min-width-0.gap-xsmall',
    );

    if (!content) return;

    const hideLabel = await t('serverList.hide');
    wrapper.className = 'grow-0 shrink-0 basis-auto';
    hideButton.classList.remove(
        'width-full',
        'padding-x-small',
        'bg-action-soft-emphasis',
        'content-action-soft-emphasis',
    );
    hideButton.classList.add(
        'width-[40px]',
        'padding-x-none',
        'bg-action-standard',
        'content-action-standard',
    );
    hideButton.removeAttribute('data-rovalra-join-button');
    hideButton.setAttribute('data-rovalra-hide-private-server', 'true');
    hideButton.setAttribute('aria-label', hideLabel);
    hideButton.title = hideLabel;
    content.replaceChildren(
        Icon({
            icon: 'visibility_off',
            material: true,
            size: 'medium',
        }),
    );
    hideButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        hidePrivateServer(row, privateServerId);
    });

    wrapper.appendChild(hideButton);
    buttonContainer.appendChild(wrapper);
}

function applyToRow(row) {
    if (!enabled) {
        row.querySelector(HIDE_BUTTON_SELECTOR)?.parentElement?.remove();
        return false;
    }

    const privateServerId = isHideablePrivateServer(row);

    if (!privateServerId) {
        row.querySelector(HIDE_BUTTON_SELECTOR)?.parentElement?.remove();
        return false;
    }

    if (hiddenPrivateServerIds.has(privateServerId)) {
        row.remove();
        return true;
    }

    addHideButton(row, privateServerId);
    return true;
}

function registerStorageListener() {
    if (storageListenerRegistered) return;

    storageListenerRegistered = true;
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local') return;

        if (
            changes.HidePrivateServersEnabled ||
            changes.ServerlistmodificationsEnabled
        ) {
            enabled =
                changes.HidePrivateServersEnabled?.newValue !== false &&
                changes.ServerlistmodificationsEnabled?.newValue !== false;
        }

        if (changes[STORAGE_KEY])
            hiddenPrivateServerIds = new Set(changes[STORAGE_KEY].newValue || []);
        document.querySelectorAll(PRIVATE_SERVER_ROW_SELECTOR).forEach(applyToRow);
    });
}

function observePrivateServerRows() {
    observeElement(
        PRIVATE_SERVER_ROW_SELECTOR,
        (row) => {
            if (!row.closest('[data-rovalra-section-type="private"]')) return;

            applyToRow(row);
            observeAttributes(
                row,
                () => applyToRow(row),
                [
                    'data-private-server-id',
                    'data-rovalra-is-owner',
                ],
            );
        },
        { multiple: true },
    );
}

export async function init() {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    hiddenPrivateServerIds = new Set(stored[STORAGE_KEY] || []);
    enabled =
        (await settings.ServerlistmodificationsEnabled) !== false &&
        (await settings.HidePrivateServersEnabled) !== false;

    registerStorageListener();
    observePrivateServerRows();
}
