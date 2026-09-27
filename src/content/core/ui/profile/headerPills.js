import { observeChildren } from '../../observer.js';

const GROUP_CLASS = 'rovalra-profile-pill-group';

// Keeps the pill group after the username details and before chips that other
// features and extensions add to the same row.
function keepGroupPositioned(targetContainer, group) {
    if (!group.isConnected || group.parentElement !== targetContainer) return;

    const subplaceChip = targetContainer.querySelector(
        [
            ':scope > .rovalra-profile-subplace-legacy-chip',
            ':scope > .rovalra-profile-subplace-legacy-row',
        ].join(','),
    );
    const customizationPill = targetContainer.querySelector(
        ':scope > .rovalra-profile-customization-pill',
    );
    const roproLikeCount = targetContainer.querySelector(
        ':scope > #reputationDiv',
    );

    if (roproLikeCount) {
        if (roproLikeCount.nextElementSibling !== group) {
            roproLikeCount.after(group);
        }
        if (
            customizationPill &&
            group.nextElementSibling !== customizationPill
        ) {
            group.after(customizationPill);
        }
        return;
    }

    if (customizationPill) {
        if (group.nextElementSibling !== customizationPill) {
            customizationPill.before(group);
        }
        return;
    }

    if (subplaceChip) {
        if (group.nextElementSibling !== subplaceChip) {
            subplaceChip.before(group);
        }
        return;
    }

    if (targetContainer.lastElementChild !== group) {
        targetContainer.appendChild(group);
    }
}

/**
 * Returns the shared row that holds RoValra's profile header pills, creating it
 * next to the username if needed, so pills sit side by side with equal spacing.
 *
 * @param {HTMLElement} targetContainer The parent of the username element.
 * @returns {HTMLElement} The pill group.
 */
export function getProfileHeaderPillGroup(targetContainer) {
    let group = targetContainer.querySelector(`:scope > .${GROUP_CLASS}`);
    if (group) return group;

    group = document.createElement('div');
    group.className = GROUP_CLASS;
    targetContainer.appendChild(group);

    keepGroupPositioned(targetContainer, group);
    [0, 250, 1000, 2500].forEach((delay) => {
        setTimeout(() => keepGroupPositioned(targetContainer, group), delay);
    });
    observeChildren(targetContainer, () =>
        keepGroupPositioned(targetContainer, group),
    );

    return group;
}
