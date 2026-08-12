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
const EXCLUDED_CONTAINER_SELECTOR = '.roseal-friends-carousel-container';

/* Legacy Roblox friend dropdown */
const DROPDOWN_LIST_SELECTOR = '.friend-tile-dropdown ul';

/*
 * The modern Roblox friend menu is rendered in a document-level portal.
 * Identify it from its structure rather than translated button text.
 */
const MODERN_TOOLTIP_ROOT_SELECTOR = '.friend-tile-dropdown--iarc';
const MODERN_ACTIONS_SELECTOR = '.in-game-friend-card-actions';
const MODERN_PROFILE_LINK_SELECTOR = 'a[href*="/users/"][href*="/profile"]';

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

function isExcludedCarouselPresent() {
    return Boolean(document.querySelector(EXCLUDED_CONTAINER_SELECTOR));
}

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

function getNameRow(displayNameEl, context) {
    const parent = displayNameEl.parentElement;

    if (!parent || parent.classList.contains(HOST_CLASS)) {
        return displayNameEl;
    }

    /*
     * Roblox and other extensions can render badges such as Verified or
     * Roblox Premium next to the display name. In that layout the badge is a
     * sibling of the name, so wrap the complete name row rather than moving
     * only the text and leaving the badge behind.
     */
    if (context.link && parent.contains(context.link)) {
        return displayNameEl;
    }

    if (context.avatar && parent.contains(context.avatar)) {
        return displayNameEl;
    }

    if (parent.textContent.trim() !== displayNameEl.textContent.trim()) {
        return displayNameEl;
    }

    return parent;
}

function findLabelHost(context) {
    if (!(context.displayName instanceof HTMLElement)) {
        return null;
    }

    let nameRow = getNameRow(context.displayName, context);

    /*
     * If the newer RoValra username feature has already wrapped this row,
     * keep that wrapper intact and place the friend label beneath it.
     */
    const usernameWrapper = nameRow.closest('.rovalra-friend-username-wrapper');

    if (usernameWrapper) {
        nameRow = usernameWrapper;
    }

    const currentParent = nameRow.parentElement;

    if (!(currentParent instanceof HTMLElement)) {
        return null;
    }

    if (currentParent.classList.contains(HOST_CLASS)) {
        return currentParent;
    }

    const host = document.createElement('span');
    host.className = HOST_CLASS;

    nameRow.replaceWith(host);
    host.appendChild(nameRow);

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

    if (isExcludedCarouselPresent()) {
        removeRenderedLabel(card);
        return;
    }

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
            const previousHost = existingLabel.closest(`.${HOST_CLASS}`);

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
    if (isExcludedCarouselPresent()) {
        removeFeatureUi();
        return;
    }

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
        getDisplayNameText(context) || (await t('friendLabels.friendFallback'));

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
        suggestionSection.className = 'rovalra-friend-label-suggestion-section';

        const suggestionTitle = document.createElement('div');
        suggestionTitle.className = 'rovalra-friend-label-suggestion-title';
        suggestionTitle.textContent = await t('friendLabels.existingLabels');

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
        const nextLabel = input.value.trim().slice(0, MAX_LABEL_LENGTH);

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

    const saveButton = createButton(await t('friendLabels.save'), 'primary', {
        onClick: saveLabel,
    });

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

        removeButton.classList.add('rovalra-friend-label-remove-button');

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

function getModernActionContainer(root) {
    if (!(root instanceof HTMLElement)) {
        return null;
    }

    const actions = root.querySelector(MODERN_ACTIONS_SELECTOR);

    return actions instanceof HTMLElement ? actions : null;
}

function isModernFriendTooltip(root) {
    if (!(root instanceof HTMLElement)) {
        return false;
    }

    return Boolean(
        root.matches(MODERN_TOOLTIP_ROOT_SELECTOR) &&
        getModernActionContainer(root)?.querySelector(
            MODERN_PROFILE_LINK_SELECTOR,
        ),
    );
}

function getCanonicalModernTooltipRoot(candidate) {
    if (!(candidate instanceof HTMLElement)) {
        return null;
    }

    const root = candidate.matches(MODERN_TOOLTIP_ROOT_SELECTOR)
        ? candidate
        : candidate.closest(MODERN_TOOLTIP_ROOT_SELECTOR);

    return root instanceof HTMLElement && isModernFriendTooltip(root)
        ? root
        : null;
}

function removeModernTooltipAction(button) {
    if (!(button instanceof HTMLElement)) {
        return;
    }

    const wrapper = button.closest(`.${MODERN_TOOLTIP_ITEM_CLASS}`);

    if (
        wrapper instanceof HTMLElement &&
        wrapper !== button &&
        wrapper.querySelectorAll(`.${MODERN_TOOLTIP_BUTTON_CLASS}`).length === 1
    ) {
        wrapper.remove();
        return;
    }

    button.remove();
}

function dedupeModernTooltipActions(tooltip) {
    if (!(tooltip instanceof HTMLElement)) {
        return null;
    }

    const buttons = [
        ...tooltip.querySelectorAll(`.${MODERN_TOOLTIP_BUTTON_CLASS}`),
    ].filter((button) => button instanceof HTMLElement);

    if (buttons.length === 0) {
        return null;
    }

    const keep = buttons[0];

    for (const duplicate of buttons.slice(1)) {
        removeModernTooltipAction(duplicate);
    }

    return keep;
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

    const activeCard = document.activeElement?.closest?.(CARD_SELECTOR);

    if (activeCard instanceof HTMLElement) {
        lastInteractedFriendCard = activeCard;
        return activeCard;
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

function findModernActionMount(viewProfileControl) {
    const previousControl = viewProfileControl.previousElementSibling;
    const chatControl =
        previousControl instanceof HTMLButtonElement ? previousControl : null;

    const styleSource = chatControl || viewProfileControl;

    if (styleSource?.parentElement === viewProfileControl.parentElement) {
        return {
            reference: viewProfileControl,
            wrapperSource: null,
            controlSource: styleSource,
        };
    }

    const viewWrapper = viewProfileControl.parentElement;
    const styleWrapper = styleSource?.parentElement;

    if (
        viewWrapper instanceof HTMLElement &&
        styleWrapper instanceof HTMLElement &&
        viewWrapper.parentElement === styleWrapper.parentElement
    ) {
        return {
            reference: viewWrapper,
            wrapperSource: styleWrapper,
            controlSource: styleSource,
        };
    }

    return {
        reference: viewProfileControl,
        wrapperSource: null,
        controlSource: styleSource,
    };
}

function createModernTooltipButton(sourceControl, labelText) {
    let button;

    if (sourceControl instanceof HTMLElement) {
        button = sourceControl.cloneNode(false);
    } else {
        button = document.createElement('button');
    }

    if (!(button instanceof HTMLElement)) {
        return null;
    }

    button.removeAttribute('id');
    button.removeAttribute('href');
    button.removeAttribute('target');
    button.removeAttribute('rel');
    button.removeAttribute('aria-controls');
    button.removeAttribute('aria-expanded');

    if (button instanceof HTMLButtonElement) {
        button.type = 'button';
    } else {
        button.setAttribute('role', 'button');
        button.tabIndex = 0;
    }

    button.classList.add(MENU_BUTTON_CLASS, MODERN_TOOLTIP_BUTTON_CLASS);
    button.textContent = labelText;

    return button;
}

async function attachModernTooltipAction(candidate) {
    if (
        !enabled ||
        isExcludedCarouselPresent() ||
        !(candidate instanceof HTMLElement)
    ) {
        return;
    }

    const tooltip = getCanonicalModernTooltipRoot(candidate);

    if (!tooltip) {
        return;
    }

    /*
     * Clean up any duplicate left by a previous Roblox rerender before doing
     * anything else. One canonical tooltip should own exactly one action.
     */
    if (dedupeModernTooltipActions(tooltip)) {
        return;
    }

    if (tooltip.dataset.rovalraFriendLabelPending === 'true') {
        return;
    }

    /*
     * Lock the canonical tooltip before awaiting translations. This prevents
     * two observer callbacks from racing and inserting the same action twice.
     */
    tooltip.dataset.rovalraFriendLabelPending = 'true';

    try {
        const actions = getModernActionContainer(tooltip);
        const viewProfileControl = actions?.querySelector(
            MODERN_PROFILE_LINK_SELECTOR,
        );

        if (!viewProfileControl) {
            return;
        }

        const card = resolveModernTooltipCard(tooltip);
        const context = card ? getUserCardContext(card) : null;

        if (!context?.userId) {
            return;
        }

        const mount = findModernActionMount(viewProfileControl);

        const labelText = await t('friendLabels.menuAction');

        /*
         * Re-check after the async translation in case another lifecycle path
         * already created the action while Roblox was replacing DOM nodes.
         */
        if (dedupeModernTooltipActions(tooltip)) {
            return;
        }

        const button = createModernTooltipButton(
            mount.controlSource,
            labelText,
        );

        if (!button) {
            return;
        }

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

        if (!(button instanceof HTMLButtonElement)) {
            button.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') {
                    return;
                }

                event.preventDefault();
                button.click();
            });
        }

        if (mount.wrapperSource) {
            const wrapper = document.createElement(
                mount.wrapperSource.tagName.toLowerCase(),
            );

            wrapper.className = mount.wrapperSource.className;
            wrapper.classList.add(MENU_ITEM_CLASS, MODERN_TOOLTIP_ITEM_CLASS);

            wrapper.appendChild(button);

            mount.reference.insertAdjacentElement('afterend', wrapper);
        } else {
            const wrapper = document.createElement('div');

            wrapper.className = [
                MENU_ITEM_CLASS,
                MODERN_TOOLTIP_ITEM_CLASS,
            ].join(' ');

            wrapper.appendChild(button);
            mount.reference.insertAdjacentElement('afterend', wrapper);
        }

        /*
         * Final safety net for React/Roblox rerenders that may replay observer
         * callbacks during insertion.
         */
        dedupeModernTooltipActions(tooltip);
    } finally {
        delete tooltip.dataset.rovalraFriendLabelPending;
    }
}

function attachActionsToExistingModernTooltips() {
    const canonicalTooltips = new Set();

    document
        .querySelectorAll(MODERN_TOOLTIP_ROOT_SELECTOR)
        .forEach((candidate) => {
            const tooltip = getCanonicalModernTooltipRoot(candidate);

            if (tooltip) {
                canonicalTooltips.add(tooltip);
            }
        });

    canonicalTooltips.forEach((tooltip) => {
        attachModernTooltipAction(tooltip);
    });
}

async function attachDropdownAction(menuList) {
    if (
        !enabled ||
        isExcludedCarouselPresent() ||
        !(menuList instanceof HTMLElement)
    ) {
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

                    const currentCard = button.closest(CARD_SELECTOR) || card;

                    const currentContext = getUserCardContext(currentCard);

                    if (!currentContext.userId) return;

                    await openLabelEditor(currentCard, currentContext);
                },
            },
        );

        button.classList.add(MENU_BUTTON_CLASS, 'friend-tile-dropdown-button');

        if (menuList.querySelector(`.${MENU_ITEM_CLASS}`)) {
            return;
        }

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

    observeElement(DROPDOWN_LIST_SELECTOR, attachDropdownAction, {
        multiple: true,
    });

    observeElement(MODERN_TOOLTIP_ROOT_SELECTOR, attachModernTooltipAction, {
        multiple: true,
    });

    observeElement(EXCLUDED_CONTAINER_SELECTOR, removeFeatureUi, {
        multiple: true,
    });
}

function attachActionsToExistingDropdowns() {
    document.querySelectorAll(DROPDOWN_LIST_SELECTOR).forEach((menuList) => {
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

    chrome.storage.onChanged.addListener(async (changes, namespace) => {
        if (namespace !== 'local') return;

        if (changes[STORAGE_KEY]) {
            friendLabels = sanitizeLabels(changes[STORAGE_KEY].newValue);

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
    });
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
