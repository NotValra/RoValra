import { observeElement, startObserving } from '../../../core/observer.js';
import { getUserIdFromUrl } from '../../../core/idExtractor.js';
import { callRobloxApiJson, callRobloxApi } from '../../../core/api.js';
import { injectStylesheet } from '../../../core/ui/cssInjector.js';
import { addTooltip } from '../../../core/ui/tooltip.js';
import { getAuthenticatedUserId } from '../../../core/user.js';
import { createOverlay } from '../../../core/ui/overlay.js';

const STATUS_PREFIX = 'Status:';
const MAX_STATUS_LENGTH = 50;

function openEditStatusOverlay(currentStatus, onSave) {
    const container = document.createElement('div');
    Object.assign(container.style, {
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
    });

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'form-control input-field';
    input.value = currentStatus;
    input.maxLength = MAX_STATUS_LENGTH;
    input.placeholder = 'Enter new status';
    
    container.appendChild(input);

    const errorDisplay = document.createElement('p');
    errorDisplay.className = 'text-error';
    Object.assign(errorDisplay.style, {
        display: 'none',
        marginTop: '-4px',
        marginBottom: '0'
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
        preventBackdropClose: true
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
            errorDisplay.textContent = 'Failed to save status. It may have been censored.';
            errorDisplay.style.display = 'block';
        } else if (result === 'limit_exceeded') {
            errorDisplay.textContent = 'Unable to add a status, your about me has max characters.';
            errorDisplay.style.display = 'block';
        } else if (result === false) {
            errorDisplay.textContent = 'An unknown error occurred while saving.';
            errorDisplay.style.display = 'block';
        }
    };
}

async function addStatusBubble(avatarContainer) {
    if (avatarContainer.querySelector('.rovalra-status-bubble-wrapper')) return;

    try {
        const userId = getUserIdFromUrl();
        if (!userId) return;

        const [userData, authenticatedUserId] = await Promise.all([
            callRobloxApiJson({
                subdomain: 'users',
                endpoint: `/v1/users/${userId}`
            }),
            getAuthenticatedUserId()
        ]);

        if (!userData) return;

        const description = userData.description || '';
        const isOwnProfile = authenticatedUserId && String(authenticatedUserId) === String(userId);
        
        if (!description.includes(STATUS_PREFIX) && !isOwnProfile) return;

        let statusText = description.includes(STATUS_PREFIX) 
            ? description.split(STATUS_PREFIX)[1].split('\n')[0].trim() 
            : null;
            
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
            const tooltipText = statusText === '...' ? 'Click to add a status' : 'Click to edit';
            addTooltip(bubble, tooltipText);

            bubble.addEventListener('click', (e) => {
                e.stopPropagation();
                openEditStatusOverlay(statusText === '...' ? '' : statusText, async (newStatus) => {
                    try {
                        const latestUserData = await callRobloxApiJson({
                            subdomain: 'users',
                            endpoint: `/v1/users/${userId}`
                        });
                        
                        const currentDescription = latestUserData.description || '';
                        let newDescription;
                        const hadStatus = currentDescription.includes(STATUS_PREFIX);

                        if (newStatus) {
                            if (hadStatus) {
                                const prefixIndex = currentDescription.indexOf(STATUS_PREFIX);
                                newDescription = currentDescription.substring(0, prefixIndex) + STATUS_PREFIX + ' ' + newStatus;
                            } else {
                                newDescription = currentDescription + '\n\n\n' + STATUS_PREFIX + ' ' + newStatus;
                            }

                            if (newDescription.length > 1000) {
                                return 'limit_exceeded';
                            }
                        } else { 
                            if (hadStatus) {
                                const prefixIndex = currentDescription.indexOf(STATUS_PREFIX);
                                newDescription = currentDescription.substring(0, prefixIndex).trimEnd();
                            } else {
                                return true; 
                            }
                        }

                        const updateResponse = await callRobloxApi({
                            subdomain: 'users',
                            endpoint: '/v1/description',
                            method: 'POST',
                            body: { description: newDescription }
                        });

                        if (!updateResponse.ok) throw new Error(`API returned status ${updateResponse.status}`);

                        const responseData = await updateResponse.json();

                        if (newStatus && responseData.description && !responseData.description.includes(newStatus)) {
                            console.warn('RoValra: Status update appears to have been censored. Reverting.');
                            await callRobloxApi({
                                subdomain: 'users',
                                endpoint: '/v1/description',
                                method: 'POST',
                                body: { description: currentDescription }
                            });
                            return 'failed';
                        }

                        statusText = newStatus || '...';
                        bubble.textContent = newStatus ? (newStatus.length > MAX_STATUS_LENGTH ? newStatus.substring(0, MAX_STATUS_LENGTH) + '...' : newStatus) : '...';
                        
                        const newTooltipText = statusText === '...' ? 'Click to add a status' : 'Click to edit';
                        addTooltip(bubble, newTooltipText);

                        return true;
                    } catch (error) {
                        console.error('RoValra: Failed to update status.', error);
                        return false;
                    }
                });
            });
        }

    } catch (error) {
        console.error('RoValra: Error adding status bubble.', error);
    }
}

export function init() {
    chrome.storage.local.get({ statusBubbleEnabled: true }, (settings) => {
        if (settings.statusBubbleEnabled) {
            startObserving();
            
            injectStylesheet('css/thinkingbubble.css', 'rovalra-profile-status-css');
            const selector = '.user-profile-header-details-avatar-container';
            observeElement(selector, addStatusBubble, { multiple: true });
        }
    });
}