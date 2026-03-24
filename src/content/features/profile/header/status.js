import * as storage from "../../../core/chrome/localStorage.js";
import { observeElement, startObserving } from '../../../core/observer.js';
import { getUserIdFromUrl } from '../../../core/idExtractor.js';
import { injectStylesheet } from '../../../core/ui/cssInjector.js';
import { addTooltip } from '../../../core/ui/tooltip.js';
import { getAuthenticatedUserId } from '../../../core/user.js';
import { createOverlay } from '../../../core/ui/overlay.js';
import {
    getUserDescription,
    updateUserDescription,
} from '../../../core/profile/descriptionhandler.js';
import { createStyledInput } from '../../../core/ui/catalog/input.js';

const STATUS_PREFIX = 's:';
const MAX_STATUS_LENGTH = 50;

function openEditStatusOverlay(currentStatus, onSave) {
    const container = document.createElement('div');
    Object.assign(container.style, {
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        paddingTop: '5px',
    });

    const { container: inputContainer, input } = createStyledInput({
        id: 'rovalra-status-edit-input',
        label: 'Enter new status',
        value: currentStatus,
    });
    input.maxLength = MAX_STATUS_LENGTH;

    container.appendChild(inputContainer);

    const helpText = document.createElement('p');
    helpText.className = 'text-description';
    helpText.textContent =
        'This will add a string starting with "s:" to your Roblox about me.';
    Object.assign(helpText.style, {
        marginTop: '-8px',
        fontSize: '12px',
    });
    container.appendChild(helpText);

    const errorDisplay = document.createElement('p');
    errorDisplay.className = 'text-error';
    Object.assign(errorDisplay.style, {
        display: 'none',
        marginTop: '-4px',
        marginBottom: '0',
    });
    container.appendChild(errorDisplay);

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn-primary-md';
    saveBtn.textContent = 'Save';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn-control-md';
    cancelBtn.textContent = 'Cancel';

    const { close } = createOverlay({
        title: 'Edit Status',
        bodyContent: container,
        actions: [cancelBtn, saveBtn],
        maxWidth: '400px',
        preventBackdropClose: true,
    });

    cancelBtn.onclick = close;

    saveBtn.onclick = async () => {
        const newStatus = input.value.trim();

        errorDisplay.style.display = 'none';
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        const result = await onSave(newStatus);

        saveBtn.disabled = false;
        saveBtn.textContent = 'Save';

        if (result === true) {
            close();
        } else if (result === 'failed') {
            errorDisplay.textContent =
                'Failed to save status. It may have been censored. No changes were applied.';
            errorDisplay.style.display = 'block';
        } else if (result === 'limit_exceeded') {
            errorDisplay.textContent =
                'Unable to add a status, your about me has max characters. No changes were applied.';
            errorDisplay.style.display = 'block';
        } else if (result === false) {
            errorDisplay.textContent =
                'An unknown error occurred while saving. No changes were applied.';
            errorDisplay.style.display = 'block';
        }
    };
}

async function addStatusBubble(avatarContainer) {
    if (avatarContainer.querySelector('.rovalra-status-bubble-wrapper')) return;

    try {
        const userId = getUserIdFromUrl();
        if (!userId) return;

        const [description, authenticatedUserId] = await Promise.all([
            getUserDescription(userId),
            getAuthenticatedUserId(),
        ]);

        if (description === null) return;

        const isOwnProfile =
            authenticatedUserId &&
            String(authenticatedUserId) === String(userId);

        const lines = description.split('\n');
        const statusLine = lines.find((line) =>
            line.trim().startsWith(STATUS_PREFIX),
        );
        let statusText = statusLine
            ? statusLine.trim().substring(STATUS_PREFIX.length).trim()
            : null;

        if (!statusText && !isOwnProfile) return;

        if (!statusText) {
            if (isOwnProfile) {
                statusText = '...';
            } else {
                return;
            }
        }

        if (statusText.length > MAX_STATUS_LENGTH) {
            statusText = statusText.substring(0, MAX_STATUS_LENGTH) + '...';
        }

        const bubbleWrapper = document.createElement('div');
        bubbleWrapper.className = 'rovalra-status-bubble-wrapper';

        const bubble = document.createElement('div');
        bubble.className = 'rovalra-status-bubble text-label-medium';
        bubble.textContent = statusText;

        bubbleWrapper.appendChild(bubble);
        avatarContainer.appendChild(bubbleWrapper);

        if (isOwnProfile) {
            bubble.style.cursor = 'pointer';
            const tooltipText =
                statusText === '...'
                    ? 'Click to add a status'
                    : 'Click to edit';
            addTooltip(bubble, tooltipText);

            bubble.addEventListener('click', (e) => {
                e.stopPropagation();
                openEditStatusOverlay(
                    statusText === '...' ? '' : statusText,
                    async (newStatus) => {
                        try {
                            const currentDescription =
                                await getUserDescription(userId);
                            if (currentDescription === null) return false;

                            let newDescription;
                            const lines = currentDescription.split('\n');

                            if (newStatus) {
                                const statusLine = `${STATUS_PREFIX}${newStatus}`;
                                let statusFound = false;

                                const newLines = [];
                                for (const line of lines) {
                                    if (line.trim().startsWith(STATUS_PREFIX)) {
                                        if (!statusFound) {
                                            newLines.push(statusLine);
                                            statusFound = true;
                                        }
                                    } else {
                                        newLines.push(line);
                                    }
                                }

                                if (!statusFound) {
                                    const lastLineIndex = newLines.length - 1;
                                    if (
                                        lastLineIndex >= 0 &&
                                        newLines[lastLineIndex].trim() === ''
                                    ) {
                                        newLines[lastLineIndex] = statusLine;
                                    } else {
                                        if (currentDescription.trim()) {
                                            newLines.push(statusLine);
                                        } else {
                                            newLines[0] = statusLine;
                                        }
                                    }
                                }

                                newDescription = newLines.join('\n');

                                if (newDescription.length > 1000) {
                                    return 'limit_exceeded';
                                }
                            } else {
                                const newLines = lines.filter(
                                    (line) =>
                                        !line.trim().startsWith(STATUS_PREFIX),
                                );
                                newDescription = newLines.join('\n').trimEnd();
                            }

                            const result = await updateUserDescription(
                                userId,
                                newDescription,
                            );

                            if (result === 'Filtered') {
                                return 'failed';
                            }

                            if (result !== true) {
                                return false;
                            }

                            statusText = newStatus || '...';
                            bubble.textContent = newStatus
                                ? newStatus.length > MAX_STATUS_LENGTH
                                    ? newStatus.substring(
                                          0,
                                          MAX_STATUS_LENGTH,
                                      ) + '...'
                                    : newStatus
                                : '...';
                            const newTooltipText =
                                statusText === '...'
                                    ? 'Click to add a status'
                                    : 'Click to edit';
                            addTooltip(bubble, newTooltipText);

                            return true;
                        } catch (error) {
                            console.error(
                                'RoValra: Failed to update status.',
                                error,
                            );
                            return false;
                        }
                    },
                );
            });
        }
    } catch (error) {
        console.error('RoValra: Error adding status bubble.', error);
    }
}

export function init() {
    storage.get({ statusBubbleEnabled: true }).then((settings) => {
        if (settings.statusBubbleEnabled) {
            startObserving();

            injectStylesheet(
                'css/thinkingbubble.css',
                'rovalra-profile-status-css',
            );
            const selector = '.user-profile-header-details-avatar-container';
            observeElement(selector, addStatusBubble, { multiple: true });
        }
    });
}
