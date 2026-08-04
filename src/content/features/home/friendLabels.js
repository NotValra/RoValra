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

/* Legacy Roblox friend dropdown */
const DROPDOWN_LIST_SELECTOR = '.friend-tile-dropdown ul';

/*
 * The modern Roblox friend tooltip is rendered in a document-level portal,
 * rather than inside the friend card. Watch interactive controls and verify
 * that they belong to the friend tooltip before modifying them.
 */
const MODERN_TOOLTIP_ROOT_SELECTOR = [
    '[role="dialog"]',
    '[role="menu"]',
    '[role="tooltip"]',
    '[class*="popover" i]',
    '[class*="dropdown" i]',
].join(', ');

const HOST_CLASS = 'rovalra-friend-label-host';
const LABEL_CLASS = 'rovalra-friend-label';
const MENU_ITEM_CLASS = 'rovalra-friend-label-menu-item';
const MENU_BUTTON_CLASS = 'rovalra-friend-label-menu-button';
const MODERN_TOOLTIP_ITEM_CLASS = 'rovalra-friend-label-modern-item';
const MODERN_TOOLTIP_BUTTON_CLASS = 'rovalra-friend-label-modern-button';

const MAX_LABEL_LENGTH = 24;

let enabled = false;
let observersRegistered = false;
let storageListenerRegistered = false;
let friendLabels = {};
let lastInteractedFriendCard = null;

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

function unwrapLabelHost(host) {
    if (
        !(host instanceof HTMLElement) ||
        !host.classList.contains(HOST_CLASS)
    ) {
        return;
    }

    const parent = host.parentElement;

    if (!(parent instanceof HTMLElement)) {
        return;
    }

    while (host.firstChild) {
        parent.insertBefore(host.firstChild, host);
    }

    host.remove();
}

function findLabelHost(context) {
    if (!(context.displayName instanceof HTMLElement)) {
        return null;
    }

    /*
     * Wrap only the name row itself. Roblox keeps the current-game/presence
     * text as a sibling, so this prevents Friend Labels from taking ownership
     * of and restyling the playing-status layout.
     */
    const nameElement =
        context.displayName.closest(
            '.user-card-name, .friends-carousel-display-name, .avatar-name',
        ) || context.displayName;

    const currentParent = nameElement.parentElement;

    if (!(currentParent instanceof HTMLElement)) {
        return null;
    }

    if (currentParent.classList.contains(HOST_CLASS)) {
        return currentParent;
    }

    const host = document.createElement('div');
    host.className = HOST_CLASS;

    currentParent.insertBefore(host, nameElement);
    host.appendChild(nameElement);

    return host;
}

function removeRenderedLabel(card) {
    if (!(card instanceof HTMLElement)) return;

    const label = card.querySelector(`.${LABEL_CLASS}`);
    const host = label?.closest(`.${HOST_CLASS}`);

    label?.remove();

    if (host && !host.querySelector(`.${LABEL_CLASS}`)) {
        unwrapLabelHost(host);
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
            const previousHost = existingLabel.closest(
                `.${HOST_CLASS}`,
            );

            host.appendChild(existingLabel);

            if (
                previousHost &&
                previousHost !== host &&
                !previousHost.querySelector(`.${LABEL_CLASS}`)
            ) {
                unwrapLabelHost(previousHost);
            }
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
        label.remove();
    });

    document.querySelectorAll(`.${HOST_CLASS}`).forEach((host) => {
        unwrapLabelHost(host);
    });

    document.querySelectorAll(`.${MENU_ITEM_CLASS}`).forEach((item) => {
        item.remove();
    });

    document
        .querySelectorAll(`.${MODERN_TOOLTIP_BUTTON_CLASS}`)
        .forEach((button) => {
            button.remove();
        });

    document
        .querySelectorAll('[data-rovalra-friend-label-pending]')
        .forEach((element) => {
            delete element.dataset.rovalraFriendLabelPending;
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

function normalizeControlText(element) {
    return (
        element?.textContent
            ?.replace(/\s+/g, ' ')
            .trim()
            .toLowerCase() || ''
    );
}

function getTooltipControls(root) {
    if (!(root instanceof HTMLElement)) {
        return [];
    }

    return [
        ...root.querySelectorAll('button, a, [role="button"]'),
    ].filter(
        (element) =>
            element instanceof HTMLElement &&
            element.offsetParent !== null,
    );
}

function isModernFriendTooltip(root) {
    if (!(root instanceof HTMLElement)) {
        return false;
    }

    const controlTexts = new Set(
        getTooltipControls(root).map(normalizeControlText),
    );

    const hasViewProfile = controlTexts.has('view profile');
    const hasFriendAction =
        controlTexts.has('chat') || controlTexts.has('join');

    return hasViewProfile && hasFriendAction;
}

function getUserIdFromProfileLink(root) {
    if (!(root instanceof HTMLElement)) {
        return null;
    }

    const profileLink = root.querySelector('a[href*="/users/"]');
    const href = profileLink?.getAttribute('href') || '';
    const match = href.match(/\/users\/(\d+)(?:\/|$)/);

    return match ? match[1] : null;
}

function findFriendCardByUserId(userId) {
    if (!userId) return null;

    for (const card of document.querySelectorAll(CARD_SELECTOR)) {
        const context = getUserCardContext(card);

        if (String(context.userId) === String(userId)) {
            return card;
        }
    }

    return null;
}

function findHoveredFriendCard() {
    for (const card of document.querySelectorAll(CARD_SELECTOR)) {
        if (card.matches(':hover')) {
            return card;
        }
    }

    return null;
}

function findFriendCardByTooltipText(tooltip) {
    if (!(tooltip instanceof HTMLElement)) {
        return null;
    }

    const tooltipText =
        tooltip.textContent
            ?.replace(/\s+/g, ' ')
            .trim()
            .toLowerCase() || '';

    if (!tooltipText) {
        return null;
    }

    const cards = [...document.querySelectorAll(CARD_SELECTOR)];

    cards.sort((firstCard, secondCard) => {
        const firstName = getDisplayNameText(
            getUserCardContext(firstCard),
        );
        const secondName = getDisplayNameText(
            getUserCardContext(secondCard),
        );

        return secondName.length - firstName.length;
    });

    for (const card of cards) {
        const context = getUserCardContext(card);
        const displayName = getDisplayNameText(context)
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();

        if (displayName && tooltipText.includes(displayName)) {
            return card;
        }
    }

    return null;
}

function resolveModernTooltipCard(tooltip) {
    const linkedUserId = getUserIdFromProfileLink(tooltip);
    const linkedCard = findFriendCardByUserId(linkedUserId);

    if (linkedCard) {
        lastInteractedFriendCard = linkedCard;
        return linkedCard;
    }

    const hoveredCard = findHoveredFriendCard();

    if (hoveredCard) {
        lastInteractedFriendCard = hoveredCard;
        return hoveredCard;
    }

    const activeCard = document.activeElement?.closest?.(
        CARD_SELECTOR,
    );

    if (activeCard instanceof HTMLElement) {
        lastInteractedFriendCard = activeCard;
        return activeCard;
    }

    const textMatchedCard = findFriendCardByTooltipText(tooltip);

    if (textMatchedCard) {
        lastInteractedFriendCard = textMatchedCard;
        return textMatchedCard;
    }

    if (
        lastInteractedFriendCard instanceof HTMLElement &&
        lastInteractedFriendCard.isConnected
    ) {
        return lastInteractedFriendCard;
    }

    return null;
}

function rememberFriendCard(card) {
    if (!(card instanceof HTMLElement)) {
        return;
    }

    if (card.dataset.rovalraFriendLabelTracking === 'true') {
        return;
    }

    card.dataset.rovalraFriendLabelTracking = 'true';

    const remember = () => {
        lastInteractedFriendCard = card;
    };

    card.addEventListener('pointerenter', remember);
    card.addEventListener('pointerdown', remember);
    card.addEventListener('focusin', remember);
}

function findModernActionMount(tooltip, viewProfileControl) {
    const controls = getTooltipControls(tooltip);

    const peerControl = controls.find((control) => {
        const text = normalizeControlText(control);

        return text === 'chat' || text === 'join';
    });

    if (
        peerControl?.parentElement ===
        viewProfileControl.parentElement
    ) {
        return {
            reference: viewProfileControl,
            wrapperSource: null,
        };
    }

    const viewWrapper = viewProfileControl.parentElement;
    const peerWrapper = peerControl?.parentElement;

    if (
        viewWrapper instanceof HTMLElement &&
        peerWrapper instanceof HTMLElement &&
        viewWrapper.parentElement === peerWrapper.parentElement
    ) {
        return {
            reference: viewWrapper,
            wrapperSource: viewWrapper,
        };
    }

    return {
        reference: viewProfileControl,
        wrapperSource: null,
    };
}

async function attachModernTooltipAction(tooltip) {
    if (!enabled || !(tooltip instanceof HTMLElement)) {
        return;
    }

    if (!isModernFriendTooltip(tooltip)) {
        return;
    }

    if (
        tooltip.querySelector(`.${MODERN_TOOLTIP_BUTTON_CLASS}`) ||
        tooltip.dataset.rovalraFriendLabelPending === 'true'
    ) {
        return;
    }

    tooltip.dataset.rovalraFriendLabelPending = 'true';

    try {
        const controls = getTooltipControls(tooltip);
        const viewProfileControl = controls.find(
            (element) =>
                normalizeControlText(element) === 'view profile',
        );

        if (!viewProfileControl) {
            return;
        }

        const card = resolveModernTooltipCard(tooltip);
        const context = card ? getUserCardContext(card) : null;

        if (!context?.userId) {
            return;
        }

        const button = document.createElement('button');
        button.type = 'button';
        button.className = [
            MENU_BUTTON_CLASS,
            MODERN_TOOLTIP_BUTTON_CLASS,
        ].join(' ');
        button.textContent = await t('friendLabels.menuAction');

        button.addEventListener('pointerdown', (event) => {
            event.stopPropagation();
        });

        button.addEventListener('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();

            const currentCard = resolveModernTooltipCard(tooltip);

            if (!currentCard) {
                return;
            }

            const currentContext = getUserCardContext(currentCard);

            if (!currentContext.userId) {
                return;
            }

            await openLabelEditor(currentCard, currentContext);
        });

        const mount = findModernActionMount(
            tooltip,
            viewProfileControl,
        );

        if (mount.wrapperSource) {
            const wrapper = document.createElement(
                mount.wrapperSource.tagName.toLowerCase(),
            );

            wrapper.className = mount.wrapperSource.className;
            wrapper.classList.add(
                MENU_ITEM_CLASS,
                MODERN_TOOLTIP_ITEM_CLASS,
            );

            wrapper.appendChild(button);

            mount.reference.insertAdjacentElement(
                'afterend',
                wrapper,
            );

            return;
        }

        const wrapper = document.createElement('div');

        wrapper.className = [
            MENU_ITEM_CLASS,
            MODERN_TOOLTIP_ITEM_CLASS,
        ].join(' ');

        wrapper.appendChild(button);
        mount.reference.insertAdjacentElement('afterend', wrapper);
    } finally {
        delete tooltip.dataset.rovalraFriendLabelPending;
    }
}

function attachActionsToExistingModernTooltips() {
    document
        .querySelectorAll(MODERN_TOOLTIP_ROOT_SELECTOR)
        .forEach((tooltip) => {
            attachModernTooltipAction(tooltip);
        });
}

async function attachDropdownAction(menuList) {
    if (!enabled || !(menuList instanceof HTMLElement)) {
        return;
    }

    if (
        menuList.querySelector(`.${MENU_ITEM_CLASS}`) ||
        menuList.dataset.rovalraFriendLabelPending === 'true'
    ) {
        return;
    }

    menuList.dataset.rovalraFriendLabelPending = 'true';

    try {
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
    } finally {
        delete menuList.dataset.rovalraFriendLabelPending;
    }
}

function registerObservers() {
    if (observersRegistered) return;

    observersRegistered = true;

    observeElement(
        CARD_SELECTOR,
        (card) => {
            rememberFriendCard(card);
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

    observeElement(
        MODERN_TOOLTIP_ROOT_SELECTOR,
        attachModernTooltipAction,
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

    document.querySelectorAll(CARD_SELECTOR).forEach((card) => {
        rememberFriendCard(card);
    });

    attachActionsToExistingModernTooltips();
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