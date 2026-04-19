import { observeElement, startObserving } from '../../../core/observer.js';
import * as cache from '../../../core/storage/cacheHandler.js';
import { getUserIdFromUrl } from '../../../core/idExtractor.js';
import { injectStylesheet } from '../../../core/ui/cssInjector.js';
import { addTooltip } from '../../../core/ui/tooltip.js';
import { getAuthenticatedUserId } from '../../../core/user.js';
import { createOverlay } from '../../../core/ui/overlay.js';
import {
    updateUserDescription,
    isTextFiltered,
    updateUserSettingViaApi,
} from '../../../core/profile/descriptionhandler.js';
import { createStyledInput } from '../../../core/ui/catalog/input.js';
import { getUserSettings } from '../../../core/donators/settingHandler.js';
import { parseMarkdown } from '../../../core/utils/markdown.js';
import DOMPurify from 'dompurify';
import {
    TRUSTED_USER_IDS,
    ARTIST_BADGE_USER_ID,
    RAT_BADGE_USER_ID,
    BLAHAJ_BADGE_USER_ID,
    CAM_BADGE_USER_ID,
    alice_badge_user_id,
    GILBERT_USER_ID,
} from '../../../core/configs/userIds.js';
import {
    syncDonatorTier,
    getCurrentUserTier,
} from '../../../core/settings/handlesettings.js';
const STATUS_PREFIX = 's:';
const MAX_STATUS_LENGTH = 128;
let activeHomeStatusBubble = null;

function cleanupStatusElements(container) {
    if (!container) return;

    const mediaElements = container.querySelectorAll(
        'video, audio, iframe, source',
    );
    for (const element of mediaElements) {
        try {
            if (element.tagName === 'VIDEO' || element.tagName === 'AUDIO') {
                element.pause();
                element.src = '';
                element.load();
            }
            element.remove();
        } catch (e) {}
    }
}

const downloadableExtensions =
    /\.(zip|rar|7z|tar|gz|exe|msi|dmg|iso|apk|ahk|ps1|cmd|bat|cmd|com|scr|cpl|sys|dll|js|jse|vbs|vbe|wsf|wsh|ps1|psm1|psd1|sh|docm|xlsm|pptm|dotm|xltm|deb|rpm|pkg|appimage|hta|jar|class)$/i;

DOMPurify.addHook('afterSanitizeAttributes', (currentNode) => {
    if (currentNode.tagName === 'A' && currentNode.hasAttribute('href')) {
        const href = currentNode.getAttribute('href');
        try {
            const url = new URL(href, window.location.href);
            if (
                url.hostname === 'localhost' ||
                url.hostname === '127.0.0.1' ||
                url.protocol === 'file:' ||
                downloadableExtensions.test(url.pathname)
            ) {
                currentNode.removeAttribute('href');
                currentNode.removeAttribute('target');
                currentNode.removeAttribute('rel');
                currentNode.style.color = 'inherit';
                currentNode.style.textDecoration = 'none';
                currentNode.style.cursor = 'text';
                currentNode.style.pointerEvents = 'none';
            }
        } catch (e) {}
    }

    if (currentNode.tagName === 'IMG' && currentNode.hasAttribute('src')) {
        const src = currentNode.getAttribute('src');
        try {
            const url = new URL(src, window.location.href);
            if (
                url.hostname === 'localhost' ||
                url.hostname === '127.0.0.1' ||
                url.protocol === 'file:'
            ) {
                currentNode.removeAttribute('src');
            }
        } catch (e) {}
    }
});

function openEditStatusOverlay(currentStatus, onSave, canUseApi, isTrusted) {
    const container = document.createElement('div');
    Object.assign(container.style, {
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        paddingTop: '5px',
        alignItems: 'center',
    });

    const { container: inputContainer, input } = createStyledInput({
        id: 'rovalra-status-edit-input',
        label: 'Enter new status',
        value: currentStatus,
        multiline: true,
    });
    inputContainer.style.width = '222px';
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
    if (!canUseApi) {
        container.appendChild(helpText);
    }

    if (isTrusted) {
        const trustedHelpText = document.createElement('p');
        trustedHelpText.className = 'text-description';
        trustedHelpText.innerHTML = DOMPurify.sanitize(`
            You are a trusted RoValra user, you can add any text, embed videos, and images.
            <br>Only embed images and videos if you have at least donator tier 1. Without Donator tier 1 it will add the text to your description.
            <br>
            <strong>Note:</strong> If you are found to add inappropriate content, your donator and custom badges will be revoked.
        `);
        Object.assign(trustedHelpText.style, {
            fontSize: '12px',
        });
        container.appendChild(trustedHelpText);
    }

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
        maxWidth: '330px',
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

async function addStatusBubble(avatarContainer, userWantsApi) {
    if (avatarContainer.querySelector('.rovalra-status-bubble-wrapper')) return;

    try {
        const userId = getUserIdFromUrl();
        if (!userId) return;

        const isUserTrusted = TRUSTED_USER_IDS.has(String(userId));

        const authenticatedUserId = await getAuthenticatedUserId();
        const isOwnProfile =
            authenticatedUserId &&
            String(authenticatedUserId) === String(userId);

        const { disableVideoAudio } = await chrome.storage.local.get({
            disableVideoAudio: false,
        });

        const profileSettings = await getUserSettings(userId, {
            useDescription: true,
        });

        const { status, canUseApi } = profileSettings;
        let statusText = status;

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

        if (isUserTrusted) {
            bubble.innerHTML = DOMPurify.sanitize(parseMarkdown(statusText), {
                FORBID_ATTR: ['style'],
                FORBID_TAGS: ['audio'],
            });

            const videos = bubble.querySelectorAll('video');
            for (const video of videos) {
                video.muted = true;
                video.volume = disableVideoAudio ? 0 : 0.1;

                video
                    .play()
                    .then(() => {
                        if (!disableVideoAudio) {
                            video.muted = false;
                        }
                    })
                    .catch(() => {});
            }
        } else {
            bubble.textContent = statusText;
        }

        bubbleWrapper.appendChild(bubble);
        avatarContainer.appendChild(bubbleWrapper);

        if (isOwnProfile) {
            bubble.style.cursor = 'pointer';
            const tooltipText =
                statusText === '...'
                    ? 'Click to add a status'
                    : 'Click to edit';
            addTooltip(bubble, tooltipText);

            const updateBubbleUI = async (newStatus) => {
                statusText = newStatus || '...';
                const textToRender = newStatus
                    ? newStatus.length > MAX_STATUS_LENGTH
                        ? newStatus.substring(0, MAX_STATUS_LENGTH) + '...'
                        : newStatus
                    : '...';

                if (isUserTrusted) {
                    const { disableVideoAudio: localDisableAudio } =
                        await chrome.storage.local.get({
                            disableVideoAudio: false,
                        });

                    bubble.innerHTML = DOMPurify.sanitize(
                        parseMarkdown(textToRender),
                        {
                            FORBID_ATTR: ['style'],
                            FORBID_TAGS: ['audio'],
                        },
                    );

                    const videos = bubble.querySelectorAll('video');
                    for (const video of videos) {
                        video.muted = true;
                        video.volume = localDisableAudio ? 0 : 0.1;

                        video
                            .play()
                            .then(() => {
                                if (!localDisableAudio) {
                                    video.muted = false;
                                }
                            })
                            .catch(() => {});
                    }
                } else {
                    bubble.textContent = textToRender;
                }

                const newTooltipText =
                    statusText === '...'
                        ? 'Click to add a status'
                        : 'Click to edit';
                addTooltip(bubble, newTooltipText);
            };

            bubble.addEventListener('click', (e) => {
                e.stopPropagation();
                const isDonator = getCurrentUserTier() >= 1;
                const isTrusted = TRUSTED_USER_IDS.has(
                    String(authenticatedUserId),
                );
                openEditStatusOverlay(
                    statusText === '...' ? '' : statusText,
                    async (newStatus) => {
                        const effectiveCanUseApi = isDonator && userWantsApi;
                        if (
                            newStatus &&
                            !isTrusted &&
                            (await isTextFiltered(newStatus))
                        ) {
                            return 'failed';
                        }

                        if (effectiveCanUseApi) {
                            try {
                                const response = await updateUserSettingViaApi(
                                    'status',
                                    newStatus,
                                );
                                if (response) {
                                    updateBubbleUI(newStatus);
                                    return true;
                                }
                                return 'failed';
                            } catch (error) {
                                console.error(
                                    'RoValra: Failed to update status via API.',
                                    error,
                                );
                                return false;
                            }
                        } else {
                            try {
                                const currentDescription = await (async () => {
                                    const { getUserDescription } =
                                        await import('../../../core/profile/descriptionhandler.js');
                                    return await getUserDescription(userId);
                                })();
                                if (currentDescription === null) return false;

                                let newDescription;
                                const lines = currentDescription.split('\n');

                                if (newStatus) {
                                    const statusLine = `${STATUS_PREFIX}${newStatus}`;
                                    let statusFound = false;

                                    const newLines = [];
                                    for (const line of lines) {
                                        if (
                                            line
                                                .trim()
                                                .startsWith(STATUS_PREFIX)
                                        ) {
                                            if (!statusFound) {
                                                newLines.push(statusLine);
                                                statusFound = true;
                                            }
                                        } else {
                                            newLines.push(line);
                                        }
                                    }

                                    if (!statusFound) {
                                        const lastLineIndex =
                                            newLines.length - 1;
                                        if (
                                            lastLineIndex >= 0 &&
                                            newLines[lastLineIndex].trim() ===
                                                ''
                                        ) {
                                            newLines[lastLineIndex] =
                                                statusLine;
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
                                            !line
                                                .trim()
                                                .startsWith(STATUS_PREFIX),
                                    );
                                    newDescription = newLines
                                        .join('\n')
                                        .trimEnd();
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

                                updateBubbleUI(newStatus);
                                return true;
                            } catch (error) {
                                console.error(
                                    'RoValra: Failed to update status.',
                                    error,
                                );
                                return false;
                            }
                        }
                    },
                    isDonator && userWantsApi,
                    isTrusted,
                );
            });
        }
    } catch (error) {
        console.error('RoValra: Error adding status bubble.', error);
    }
}

async function addHomeStatusHover(tile) {
    if (tile.dataset.rovalraStatusObserved) return;
    tile.dataset.rovalraStatusObserved = 'true';

    const link = tile.querySelector('a.avatar-card-link');
    const avatarContainer = tile.querySelector(
        '.avatar-card-fullbody, .avatar-card-image-container',
    );
    if (!link || !avatarContainer) return;

    const match = link.href.match(/\/users\/(\d+)\//);
    if (!match) return;
    const userId = match[1];

    const bubbleWrapper = document.createElement('div');
    bubbleWrapper.className = 'rovalra-status-bubble-wrapper';
    bubbleWrapper.style.left = '130%';
    bubbleWrapper.style.display = 'none';

    const bubble = document.createElement('div');
    bubble.className = 'rovalra-status-bubble text-label-medium';
    bubbleWrapper.appendChild(bubble);
    avatarContainer.appendChild(bubbleWrapper);

    let statusLoaded = false;
    let isHovering = false;
    let pendingLoad = null;

    tile.addEventListener('mouseenter', async () => {
        isHovering = true;

        if (!statusLoaded) {
            if (pendingLoad) return;

            const loadPromise = (async () => {
                try {
                    const authenticatedUserId = await getAuthenticatedUserId();
                    const isOwnProfile =
                        authenticatedUserId &&
                        String(authenticatedUserId) === String(userId);

                    const settings = await getUserSettings(userId, {
                        useDescription: true,
                    });

                    const { status } = settings;

                    if (!isHovering) return;

                    if (status) {
                        let statusText = status;
                        if (statusText.length > MAX_STATUS_LENGTH) {
                            statusText =
                                statusText.substring(0, MAX_STATUS_LENGTH) +
                                '...';
                        }

                        const isUserTrusted = TRUSTED_USER_IDS.has(
                            String(userId),
                        );

                        if (isUserTrusted) {
                            bubble.innerHTML = DOMPurify.sanitize(
                                parseMarkdown(statusText),
                                {
                                    FORBID_ATTR: ['style'],
                                    FORBID_TAGS: ['audio'],
                                },
                            );
                        } else {
                            bubble.textContent = statusText;
                        }
                        statusLoaded = true;
                    } else {
                        bubbleWrapper.remove();
                        return;
                    }
                } catch (error) {
                    if (!isHovering) return;
                    console.error(
                        'RoValra: Error fetching status for home page hover.',
                        error,
                    );
                    bubbleWrapper.remove();
                    return;
                }
            })();

            pendingLoad = loadPromise;
            await loadPromise;
            pendingLoad = null;
        }

        if (statusLoaded && isHovering) {
            if (!tile.matches(':hover')) return;

            if (
                activeHomeStatusBubble &&
                activeHomeStatusBubble !== bubbleWrapper
            ) {
                const activeBubble = activeHomeStatusBubble.querySelector(
                    '.rovalra-status-bubble',
                );
                cleanupStatusElements(activeBubble);
                activeBubble.textContent = '';
                activeHomeStatusBubble.style.display = 'none';
            }
            bubbleWrapper.style.display = 'flex';
            activeHomeStatusBubble = bubbleWrapper;

            const { disableVideoAudio } = await chrome.storage.local.get({
                disableVideoAudio: false,
            });

            const videos = bubble.querySelectorAll('video');
            for (const video of videos) {
                video.muted = true;
                video.volume = disableVideoAudio ? 0 : 0.1;

                video
                    .play()
                    .then(() => {
                        if (!disableVideoAudio && isHovering) {
                            video.muted = false;
                        }
                    })
                    .catch(() => {});
            }
        }
    });

    tile.addEventListener('mouseleave', () => {
        isHovering = false;
        cleanupStatusElements(bubble);
        bubble.textContent = '';
        statusLoaded = false;

        if (activeHomeStatusBubble === bubbleWrapper)
            activeHomeStatusBubble = null;
        bubbleWrapper.style.display = 'none';
    });
}

export function init() {
    syncDonatorTier();
    chrome.storage.local.get(
        {
            statusBubbleEnabled: true,
            statusBubbleHomePage: true,
            statusBubbleUseApi: true,
            disableVideoAudio: false,
        },
        (settings) => {
            if (settings.statusBubbleEnabled) {
                startObserving();

                injectStylesheet(
                    'css/thinkingbubble.css',
                    'rovalra-profile-status-css',
                );
                const selector =
                    '.user-profile-header-details-avatar-container';
                observeElement(
                    selector,
                    (el) => addStatusBubble(el, settings.statusBubbleUseApi),
                    { multiple: true },
                );

                if (settings.statusBubbleHomePage) {
                    observeElement(
                        '.friends-carousel-tile',
                        addHomeStatusHover,
                        {
                            multiple: true,
                        },
                    );
                }
            }
        },
    );
}
