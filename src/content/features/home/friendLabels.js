import { getUserCardContext } from '../../core/profile/userCardElements.js';
import { t } from '../../core/locale/i18n.js';
import { observeElement } from '../../core/observer.js';
import { settings } from '../../core/settings/getSettings.js';
import { createButton } from '../../core/ui/buttons.js';
import { createStyledInput } from '../../core/ui/catalog/input.js';
import { createOverlay } from '../../core/ui/overlay.js';

const SETTING_NAME = 'friendLabelsEnabled';
const STORAGE_KEY = 'rovalra_friend_labels';

const CARD_SELECTOR = '.friends-carousel-tile';
const DROPDOWN_LIST_SELECTOR = '.friend-tile-dropdown ul';

const HOST_CLASS = 'rovalra-friend-label-host';
const LABEL_CLASS = 'rovalra-friend-label';
const MENU_ITEM_CLASS = 'rovalra-friend-label-menu-item';
const MENU_BUTTON_CLASS = 'rovalra-friend-label-menu-button';

const MAX_LABEL_LENGTH = 24;

let enabled = false;
let observersRegistered = false;
let storageListenerRegistered = false;
let friendLabels = {};

function sanitizeLabels(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }

    const sanitized = {};

    for (const [userId, label] of Object.entries(value)) {
        if (!/^\d+$/.test(userId) || typeof label !== 'string') {
            continue;
        }

        const cleanedLabel = label.trim().slice(0, MAX_LABEL_LENGTH);

        if (cleanedLabel) {
            sanitized[userId] = cleanedLabel;
        }
    }

    return sanitized;
}

async function loadFriendLabels() {
    try {
        const result = await chrome.storage.local.get(STORAGE_KEY);

        return sanitizeLabels(result[STORAGE_KEY]);
    } catch (error) {
        console.warn('RoValra: Failed to load friend labels', error);
        return {};
    }
}

async function saveFriendLabels(nextLabels) {
    friendLabels = sanitizeLabels(nextLabels);

    try {
        await chrome.storage.local.set({
            [STORAGE_KEY]: friendLabels,
        });
    } catch (error) {
        console.warn('RoValra: Failed to save friend labels', error);
    }

    refreshExistingCards();
}

function getFriendLabel(userId) {
    return friendLabels[String(userId)] || '';
}

function getDisplayNameText(context) {
    return context.displayName?.textContent?.trim() || '';
}

function findLabelHost(context) {
    if (!(context.displayName instanceof HTMLElement)) {
        return null;
    }

    const labelContainer = context.displayName.closest(
        '.user-card-labels, .user-card-labels-no-username',
    );

    if (labelContainer) {
        return labelContainer;
    }

    const nameRow = context.displayName.closest('.user-card-name');

    if (nameRow?.parentElement) {
        return nameRow.parentElement;
    }

    return context.displayName.parentElement;
}

function removeRenderedLabel(card) {
    if (!(card instanceof HTMLElement)) return;

    const label = card.querySelector(`.${LABEL_CLASS}`);
    const host = label?.closest(`.${HOST_CLASS}`);

    label?.remove();

    if (host && !host.querySelector(`.${LABEL_CLASS}`)) {
        host.classList.remove(HOST_CLASS);
    }
}

function renderFriendLabel(card, suppliedContext = null) {
    if (!(card instanceof HTMLElement)) return;

    const context = suppliedContext || getUserCardContext(card);
    const existingLabel = card.querySelector(`.${LABEL_CLASS}`);

    if (!enabled || !context.userId) {
        removeRenderedLabel(card);
        return;
    }

    const labelText = getFriendLabel(context.userId);

    if (!labelText) {
        removeRenderedLabel(card);
        return;
    }

    const host = findLabelHost(context);

    if (!host) {
        removeRenderedLabel(card);
        return;
    }

    host.classList.add(HOST_CLASS);

    if (existingLabel) {
        existingLabel.textContent = labelText;
        existingLabel.title = labelText;
        existingLabel.dataset.userId = String(context.userId);

        if (existingLabel.parentElement !== host) {
            host.appendChild(existingLabel);
        }

        return;
    }

    const label = document.createElement('div');

    label.className = LABEL_CLASS;
    label.textContent = labelText;
    label.title = labelText;
    label.dataset.userId = String(context.userId);
    label.setAttribute('aria-label', labelText);

    host.appendChild(label);
}

function refreshExistingCards() {
    document.querySelectorAll(CARD_SELECTOR).forEach((card) => {
        renderFriendLabel(card);
    });
}

function removeFeatureUi() {
    document.querySelectorAll(`.${LABEL_CLASS}`).forEach((label) => {
        const host = label.closest(`.${HOST_CLASS}`);

        label.remove();

        if (host && !host.querySelector(`.${LABEL_CLASS}`)) {
            host.classList.remove(HOST_CLASS);
        }
    });

    document.querySelectorAll(`.${HOST_CLASS}`).forEach((host) => {
        host.classList.remove(HOST_CLASS);
    });

    document.querySelectorAll(`.${MENU_ITEM_CLASS}`).forEach((item) => {
        item.remove();
    });
}

function getExistingLabels() {
    return [...new Set(Object.values(friendLabels))]
        .filter(Boolean)
        .sort((firstLabel, secondLabel) =>
            firstLabel.localeCompare(secondLabel),
        );
}

async function openLabelEditor(card, context) {
    const userId = String(context.userId);
    const currentLabel = getFriendLabel(userId);

    const displayName =
        getDisplayNameText(context) ||
        (await t('friendLabels.friendFallback'));

    const body = document.createElement('div');
    body.className = 'rovalra-friend-label-editor';

    const { container: inputContainer, input } = createStyledInput({
        id: `rovalra-friend-label-input-${userId}`,
        label: await t('friendLabels.inputLabel'),
        placeholder: await t('friendLabels.inputPlaceholder'),
        value: currentLabel,
    });

    input.maxLength = MAX_LABEL_LENGTH;

    body.appendChild(inputContainer);

    const existingLabels = getExistingLabels();

    if (existingLabels.length > 0) {
        const suggestionSection = document.createElement('div');
        suggestionSection.className =
            'rovalra-friend-label-suggestion-section';

        const suggestionTitle = document.createElement('div');
        suggestionTitle.className =
            'rovalra-friend-label-suggestion-title';
        suggestionTitle.textContent = await t(
            'friendLabels.existingLabels',
        );

        const suggestionList = document.createElement('div');
        suggestionList.className = 'rovalra-friend-label-suggestions';

        for (const existingLabel of existingLabels) {
            const suggestion = document.createElement('button');

            suggestion.type = 'button';
            suggestion.className = 'rovalra-friend-label-suggestion';
            suggestion.textContent = existingLabel;
            suggestion.title = existingLabel;

            suggestion.addEventListener('click', () => {
                input.value = existingLabel;

                input.dispatchEvent(
                    new Event('input', {
                        bubbles: true,
                    }),
                );

                input.focus();
            });

            suggestionList.appendChild(suggestion);
        }

        suggestionSection.append(suggestionTitle, suggestionList);
        body.appendChild(suggestionSection);
    }

    let closeOverlay = () => {};

    const saveLabel = async () => {
        const nextLabel = input.value
            .trim()
            .slice(0, MAX_LABEL_LENGTH);

        const nextLabels = {
            ...friendLabels,
        };

        if (nextLabel) {
            nextLabels[userId] = nextLabel;
        } else {
            delete nextLabels[userId];
        }

        await saveFriendLabels(nextLabels);

        closeOverlay();
    };

    const cancelButton = createButton(
        await t('friendLabels.cancel'),
        'secondary',
        {
            onClick: () => closeOverlay(),
        },
    );

    const saveButton = createButton(
        await t('friendLabels.save'),
        'primary',
        {
            onClick: saveLabel,
        },
    );

    const actions = [];

    if (currentLabel) {
        const removeButton = createButton(
            await t('friendLabels.remove'),
            'secondary',
            {
                onClick: async () => {
                    const nextLabels = {
                        ...friendLabels,
                    };

                    delete nextLabels[userId];

                    await saveFriendLabels(nextLabels);

                    closeOverlay();
                },
            },
        );

        removeButton.classList.add(
            'rovalra-friend-label-remove-button',
        );

        actions.push(removeButton);
    }

    actions.push(cancelButton, saveButton);

    const overlayResult = createOverlay({
        title: await t('friendLabels.dialogTitle', {
            displayName,
        }),
        bodyContent: body,
        actions,
        maxWidth: '430px',
        showLogo: true,
    });

    closeOverlay = overlayResult.close;

    input.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;

        event.preventDefault();
        saveButton.click();
    });

    requestAnimationFrame(() => {
        input.focus();
        input.select();
    });
}

async function attachDropdownAction(menuList) {
    if (!enabled || !(menuList instanceof HTMLElement)) {
        return;
    }

    if (menuList.querySelector(`.${MENU_ITEM_CLASS}`)) {
        return;
    }

    const dropdown = menuList.closest('.friend-tile-dropdown');
    const card = dropdown?.closest(CARD_SELECTOR);

    if (!card) return;

    const context = getUserCardContext(card);

    if (!context.userId) return;

    const item = document.createElement('li');
    item.className = MENU_ITEM_CLASS;

    const button = createButton(
        await t('friendLabels.menuAction'),
        'secondary',
        {
            onClick: async (event) => {
                event.preventDefault();
                event.stopPropagation();

                const currentCard =
                    button.closest(CARD_SELECTOR) || card;

                const currentContext =
                    getUserCardContext(currentCard);

                if (!currentContext.userId) return;

                await openLabelEditor(
                    currentCard,
                    currentContext,
                );
            },
        },
    );

    button.classList.add(
        MENU_BUTTON_CLASS,
        'friend-tile-dropdown-button',
    );

    item.appendChild(button);
    menuList.appendChild(item);
}

function registerObservers() {
    if (observersRegistered) return;

    observersRegistered = true;

    observeElement(
        CARD_SELECTOR,
        (card) => {
            renderFriendLabel(card);
        },
        {
            multiple: true,
        },
    );

    observeElement(
        DROPDOWN_LIST_SELECTOR,
        attachDropdownAction,
        {
            multiple: true,
        },
    );
}

function attachActionsToExistingDropdowns() {
    document
        .querySelectorAll(DROPDOWN_LIST_SELECTOR)
        .forEach((menuList) => {
            attachDropdownAction(menuList);
        });
}

function registerStorageListener() {
    if (storageListenerRegistered) return;

    storageListenerRegistered = true;

    chrome.storage.onChanged.addListener(
        async (changes, namespace) => {
            if (namespace !== 'local') return;

            if (changes[STORAGE_KEY]) {
                friendLabels = sanitizeLabels(
                    changes[STORAGE_KEY].newValue,
                );

                if (enabled) {
                    refreshExistingCards();
                }
            }

            if (!changes[SETTING_NAME]) return;

            enabled = changes[SETTING_NAME].newValue === true;

            if (!enabled) {
                removeFeatureUi();
                return;
            }

            friendLabels = await loadFriendLabels();

            registerObservers();
            refreshExistingCards();
            attachActionsToExistingDropdowns();
        },
    );
}

export async function init() {
    registerStorageListener();

    enabled = (await settings.friendLabelsEnabled) === true;

    if (!enabled) {
        removeFeatureUi();
        return;
    }

    friendLabels = await loadFriendLabels();

    registerObservers();
    refreshExistingCards();
    attachActionsToExistingDropdowns();
}