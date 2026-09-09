const QUICK_ACTIONS_ID = 'RoValra-Quick-Actions';

/**
 * Returns the shared action strip for a game call-to-action area.
 * @param {HTMLElement} callToActionContainer
 * @returns {HTMLElement}
 */
export function getQuickActionsContainer(callToActionContainer) {
    let actions = callToActionContainer.querySelector(
        `:scope > #${QUICK_ACTIONS_ID}`,
    );

    if (!actions) {
        actions = document.createElement('div');
        actions.id = QUICK_ACTIONS_ID;
        actions.className = 'rovalra-quick-actions';
    }

    const gameButtons = callToActionContainer.querySelector(
        ':scope > .game-buttons-container',
    );
    if (gameButtons) callToActionContainer.insertBefore(actions, gameButtons);
    else if (!actions.parentElement) callToActionContainer.appendChild(actions);

    return actions;
}

/**
 * Adds a button or other control to the shared game quick-action strip.
 * @param {HTMLElement} callToActionContainer
 * @param {HTMLElement} action
 * @returns {HTMLElement}
 */
export function addQuickAction(callToActionContainer, action) {
    const actions = getQuickActionsContainer(callToActionContainer);
    actions.appendChild(action);
    return actions;
}
