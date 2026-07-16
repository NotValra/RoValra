import { observeElement, startObserving } from '../../../core/observer.js';
import { getUserIdFromUrl } from '../../../core/idExtractor.js';
import { injectStylesheet } from '../../../core/ui/cssInjector.js';
import { addTooltip } from '../../../core/ui/tooltip.js';
import { getAuthenticatedUserId } from '../../../core/user.js';
import { createOverlay } from '../../../core/ui/overlay.js';
import {
    getUserSettings,
    updateUserSettingViaApi,
} from '../../../core/donators/settingHandler.js';
import { createStyledInput } from '../../../core/ui/catalog/input.js';
import { showSystemAlert } from '../../../core/ui/roblox/alert.js';
import { reportUserContent } from '../../../core/report.js';
import { showConfirmationPrompt } from '../../../core/ui/confirmationPrompt.js';
import { ensureTouAgreement } from '../../../core/ui/tou/touAgreement.js';
import { parseUntrustedMarkdown } from '../../../core/utils/markdown.js';
import { migrateLegacyStatus } from '../../../core/profile/descriptionhandler.js';
import DOMPurify from 'dompurify';
import { TRUSTED_USER_IDS } from '../../../core/configs/userIds.js';
import {
    getUserCardContext,
    onUserCardElement,
    observeUserCardElements,
} from '../../../core/profile/userCardElements.js';
import { settings } from '../../../core/settings/getSettings.js';
const MAX_STATUS_LENGTH = 128;
const REPORTING_ENABLED = false;
let activeHomeStatusBubble = null;
const homeStatusControllers = new WeakMap();

function renderStatusBubbleContent(bubble, statusText) {
    const html = parseUntrustedMarkdown(statusText);
    bubble.innerHTML = html; // Verified
}

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
        } catch (e) { }
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
        } catch (e) { }
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
        } catch (e) { }
    }
});

function createStatusHelpText(isTrusted) {
    const helpText = document.createElement('p');
    helpText.className = 'text-description';
    Object.assign(helpText.style, {
        fontSize: '12px',
        lineHeight: '1.4',
    });

    if (isTrusted) {
        helpText.textContent =
            "As a trusted RoValra user, your status bypasses the normal status filters. Do not add swears or anything against Roblox's ToS or RoValra's ToS. Links to your own stuff are allowed but don't link anything discord, youtube, x, etc pretty much don't link any social platforms..";
        return helpText;
    }

    helpText.append(
        "You must follow Roblox's ToS and RoValra's ToS when using status bubbles. If you break these rules, your status may be reset and your status privileges may be revoked.",
        document.createElement('br'),
        document.createElement('br'),
        "If you're restricted from status, ",
    );

    const appealLink = document.createElement('a');
    appealLink.href =
        'https://www.roblox.com/my/account?rovalra=account+standing';
    appealLink.textContent = 'appeal here';
    appealLink.style.textDecoration = 'underline';
    helpText.append(appealLink, '.');

    return helpText;
}

function openEditStatusOverlay(currentStatus, onSave, isTrusted) {
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

    container.appendChild(createStatusHelpText(isTrusted));

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
        } else if (typeof result === 'string' && result.trim()) {
            errorDisplay.textContent = result;
            errorDisplay.style.display = 'block';
        } else {
            errorDisplay.textContent =
                'An unknown error occurred while saving. No changes were applied.';
            errorDisplay.style.display = 'block';
        }
    };
}

async function addStatusBubble(avatarContainer) {
    if (avatarContainer.querySelector('.rovalra-status-bubble-wrapper')) return;

    try {
        avatarContainer.classList.add('rovalra-status-bubble-host');

        const userId = getUserIdFromUrl();
        if (!userId) return;
        const isTrusted = TRUSTED_USER_IDS.has(String(userId));

        const authenticatedUserId = await getAuthenticatedUserId();
        const isOwnProfile =
            authenticatedUserId &&
            String(authenticatedUserId) === String(userId);

        const profileSettings = await getUserSettings(userId);

        const { status } = profileSettings;
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

        renderStatusBubbleContent(bubble, statusText);

        bubbleWrapper.appendChild(bubble);
        avatarContainer.appendChild(bubbleWrapper);

        if (isOwnProfile) {
            bubble.style.cursor = 'pointer';
            const tooltipText =
                statusText === '...'
                    ? 'Click to add a status'
                    : 'Click to edit';
            addTooltip(bubble, tooltipText);

            const updateBubbleUI = (newStatus) => {
                statusText = newStatus || '...';
                const textToRender = newStatus
                    ? newStatus.length > MAX_STATUS_LENGTH
                        ? newStatus.substring(0, MAX_STATUS_LENGTH) + '...'
                        : newStatus
                    : '...';

                renderStatusBubbleContent(bubble, textToRender);

                const newTooltipText =
                    statusText === '...'
                        ? 'Click to add a status'
                        : 'Click to edit';
                addTooltip(bubble, newTooltipText);
            };

            bubble.addEventListener('click', (e) => {
                e.stopPropagation();
                ensureTouAgreement(() => {
                    openEditStatusOverlay(
                        statusText === '...' ? '' : statusText,
                        async (newStatus) => {
                            try {
                                const updatedValue =
                                    await updateUserSettingViaApi(
                                        'status',
                                        newStatus,
                                        { throwOnError: true },
                                    );
                                if (typeof updatedValue === 'string') {
                                    updateBubbleUI(updatedValue);
                                    showSystemAlert(
                                        'Status updated successfully!',
                                        'success',
                                    );
                                    return true;
                                }
                                return false;
                            } catch (error) {
                                console.error(
                                    'RoValra: Failed to update status via API.',
                                    error,
                                );
                                if (error?.userMessage) {
                                    return error.userMessage;
                                }
                                return false;
                            }
                        },
                        isTrusted,
                    );
                });
            });
        } else if (REPORTING_ENABLED) {
            bubble.style.cursor = 'pointer';
            addTooltip(bubble, 'Report status');

            bubble.addEventListener('click', (e) => {
                e.stopPropagation();
                showConfirmationPrompt({
                    title: 'Report Status',
                    message:
                        "Are you sure you want to report this user's status to RoValra moderators?",
                    confirmText: 'Report',
                    onConfirm: async () => {
                        try {
                            await reportUserContent(userId, 'status');
                        } catch (error) {
                            console.error(
                                'RoValra: Failed to report status.',
                                error,
                            );
                        }
                    },
                });
            });
        }
    } catch (error) {
        console.error('RoValra: Error adding status bubble.', error);
    }
}

async function addHomeStatusHover(tile, card) {
    const userId = card?.userId;
    const avatarContainer =
        card?.statusAvatar ||
        tile.querySelector(
            '.avatar-card-fullbody, .avatar-card-image-container',
        );
    if (!userId || !avatarContainer) return;
    if (tile.dataset.rovalraStatusObserved === String(userId)) return;

    tile.classList.add('rovalra-status-bubble-tile');
    avatarContainer.classList.add('rovalra-status-bubble-host');

    homeStatusControllers.get(tile)?.abort();
    homeStatusControllers.delete(tile);

    for (const wrapper of avatarContainer.querySelectorAll(
        ':scope > .rovalra-status-bubble-wrapper',
    )) {
        if (activeHomeStatusBubble === wrapper) activeHomeStatusBubble = null;
        cleanupStatusElements(wrapper.querySelector('.rovalra-status-bubble'));
        wrapper.remove();
    }

    tile.dataset.rovalraStatusObserved = String(userId);
    const controller = new AbortController();
    homeStatusControllers.set(tile, controller);

    const bubbleWrapper = document.createElement('div');
    bubbleWrapper.className = 'rovalra-status-bubble-wrapper';
    bubbleWrapper.style.left = '130%';
    bubbleWrapper.style.display = 'none';
    bubbleWrapper.style.pointerEvents = 'none';

    const bubble = document.createElement('div');
    bubble.className = 'rovalra-status-bubble text-label-medium';
    bubble.style.pointerEvents = 'none';
    bubbleWrapper.appendChild(bubble);
    avatarContainer.appendChild(bubbleWrapper);

    let statusLoaded = false;
    let isHovering = false;
    let pendingLoad = null;

    tile.addEventListener(
        'mouseenter',
        async () => {
            if (controller.signal.aborted) return;
            isHovering = true;

            if (!statusLoaded) {
                if (pendingLoad) return;

                const loadPromise = (async () => {
                    try {
                        const currentUserId = getUserCardContext(tile).userId;
                        if (String(currentUserId) !== String(userId)) return;

                        const authenticatedUserId =
                            await getAuthenticatedUserId();
                        const isOwnProfile =
                            authenticatedUserId &&
                            String(authenticatedUserId) === String(userId);

                        const settings = await getUserSettings(userId);

                        const { status } = settings;

                        const latestUserId = getUserCardContext(tile).userId;
                        if (
                            controller.signal.aborted ||
                            String(latestUserId) !== String(userId)
                        ) {
                            return;
                        }

                        if (!isHovering) return;

                        if (status) {
                            let statusText = status;
                            if (statusText.length > MAX_STATUS_LENGTH) {
                                statusText =
                                    statusText.substring(0, MAX_STATUS_LENGTH) +
                                    '...';
                            }

                            renderStatusBubbleContent(bubble, statusText);
                            statusLoaded = true;

                            if (!isOwnProfile && REPORTING_ENABLED) {
                                bubble.style.cursor = 'pointer';
                                addTooltip(bubble, 'Report status');
                                bubble.onclick = (e) => {
                                    e.stopPropagation();
                                    showConfirmationPrompt({
                                        title: 'Report Status',
                                        message:
                                            "Are you sure you want to report this user's status to RoValra moderators?",
                                        confirmText: 'Report',
                                        onConfirm: async () => {
                                            try {
                                                await reportUserContent(
                                                    userId,
                                                    'status',
                                                );
                                            } catch (error) {
                                                console.error(
                                                    'RoValra: Failed to report status.',
                                                    error,
                                                );
                                            }
                                        },
                                    });
                                };
                            }
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

            if (controller.signal.aborted) return;

            if (statusLoaded && isHovering) {
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

                const videos = bubble.querySelectorAll('video');
                for (const video of videos) {
                    video.muted = true;
                    video.volume = 0;

                    video.play().catch(() => { });
                }
            }
        },
        { signal: controller.signal },
    );

    tile.addEventListener(
        'mouseleave',
        () => {
            isHovering = false;
            cleanupStatusElements(bubble);
            bubble.textContent = '';
            statusLoaded = false;

            if (activeHomeStatusBubble === bubbleWrapper)
                activeHomeStatusBubble = null;
            bubbleWrapper.style.display = 'none';
        },
        { signal: controller.signal },
    );
}

export async function init() {
    if (!(await settings.statusBubbleEnabled)) return;

    migrateLegacyStatus();
    startObserving();

    injectStylesheet('css/thinkingbubble.css', 'rovalra-profile-status-css');
    const selector = '.user-profile-header-details-avatar-container:not(.rovalra-sendrobux-avatar)';
    observeElement(selector, (el) => addStatusBubble(el), {
        multiple: true,

    });

    if (await settings.statusBubbleHomePage) {
        observeUserCardElements();
        onUserCardElement(addHomeStatusHover, {
            exclude: ['.rovalra-donator-card', '.user-item-clickable', '.rovalra-sendrobux-profile'],
        });
    }
}
