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
import {
    getUserCardContext,
    onUserCardElement,
    observeUserCardElements,
} from '../../../core/profile/userCardElements.js';
import { settings } from '../../../core/settings/getSettings.js';
import { ts } from '../../../core/locale/i18n.js';
import { getCurrentUserTier } from '../../../core/settings/handlesettings.js';
import { getDecal, openDecalReport } from '../../../core/apis/decals.js';
import { createThumbnailElement } from '../../../core/thumbnail/thumbnails.js';
const MAX_STATUS_LENGTH = 128;
const STATUS_IMAGE_MIN_TIER = 3;
const REPORTING_ENABLED = false;
let activeHomeStatusBubble = null;
const homeStatusControllers = new WeakMap();

const statusUrlPattern = /\b(?:https?:\/\/|www\.)[^\s<]+/gi;
const trailingUrlPunctuationPattern = /[.,!?;:)\]}]+$/;

function linkifyStatusContent(container) {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) =>
            node.parentElement?.closest('a, code')
                ? NodeFilter.FILTER_REJECT
                : NodeFilter.FILTER_ACCEPT,
    });
    const textNodes = [];
    let node;

    while ((node = walker.nextNode())) textNodes.push(node);

    for (const textNode of textNodes) {
        const text = textNode.nodeValue;
        let lastIndex = 0;
        let match;
        const fragment = document.createDocumentFragment();

        statusUrlPattern.lastIndex = 0;
        while ((match = statusUrlPattern.exec(text))) {
            let urlText = match[0];
            const trailingPunctuation =
                urlText.match(trailingUrlPunctuationPattern)?.[0] || '';
            if (trailingPunctuation) {
                urlText = urlText.slice(0, -trailingPunctuation.length);
            }

            if (!urlText) continue;

            fragment.append(text.slice(lastIndex, match.index));
            const link = document.createElement('a');
            link.href = urlText.startsWith('www.')
                ? `https://${urlText}`
                : urlText;
            link.textContent = urlText;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.style.textDecoration = 'underline';
            link.addEventListener('click', (event) => event.stopPropagation());
            fragment.append(link, trailingPunctuation);
            lastIndex = match.index + match[0].length;
        }

        if (lastIndex === 0) continue;
        fragment.append(text.slice(lastIndex));
        textNode.replaceWith(fragment);
    }
}

function renderStatusBubbleContent(bubble, statusText) {
    const html = parseUntrustedMarkdown(statusText);
    bubble.innerHTML = html; // Verified
    linkifyStatusContent(bubble);
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

function createStatusHelpText() {
    const helpText = document.createElement('p');
    helpText.className = 'text-description';
    Object.assign(helpText.style, {
        fontSize: '12px',
        lineHeight: '1.4',
    });

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

async function getStatusImageMode() {
    if ((await getCurrentUserTier()) < STATUS_IMAGE_MIN_TIER) return 'locked';
    return (await settings.statusImagesEnabled) ? 'editable' : 'hidden';
}

function truncateStatus(statusText) {
    return statusText.length > MAX_STATUS_LENGTH
        ? statusText.substring(0, MAX_STATUS_LENGTH) + '...'
        : statusText;
}

function createStatusImage(decal) {
    const imageWrap = document.createElement('div');
    imageWrap.className = 'rovalra-status-bubble-image-wrap';
    imageWrap.appendChild(
        createThumbnailElement(
            decal.thumbnail,
            ts('statusBubble.imageThumbnail', { name: decal.name }),
            'rovalra-status-bubble-image',
            { width: '100%', height: 'auto' },
        ),
    );
    return imageWrap;
}

function createLockedStatusImageEditor() {
    const container = document.createElement('div');
    container.className =
        'rovalra-status-image-editor rovalra-status-image-editor-locked';

    const label = document.createElement('p');
    label.className = 'text-label-medium';
    label.textContent = ts('statusBubble.imageLabel');

    const { container: inputContainer, input } = createStyledInput({
        id: 'rovalra-status-image-input',
        label: ts('statusBubble.decalId'),
    });
    inputContainer.classList.add('rovalra-status-image-input');
    input.disabled = true;

    const perkText = document.createElement('p');
    perkText.className = 'text-description rovalra-status-image-perk';
    perkText.textContent = ts('statusBubble.tier3Perk');

    container.append(label, inputContainer, perkText);
    return container;
}

function createStatusImageEditor(currentDecal) {
    const container = document.createElement('div');
    container.className = 'rovalra-status-image-editor';

    const label = document.createElement('p');
    label.className = 'text-label-medium';
    label.textContent = ts('statusBubble.imageLabel');

    const preview = document.createElement('div');
    preview.className = 'rovalra-status-image-preview';

    const { container: inputContainer, input } = createStyledInput({
        id: 'rovalra-status-image-input',
        label: ts('statusBubble.decalId'),
        value: currentDecal ? String(currentDecal.decalId) : '',
    });
    inputContainer.classList.add('rovalra-status-image-input');
    input.inputMode = 'numeric';

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn-control-xs';
    removeBtn.textContent = ts('statusBubble.removeImage');

    const errorDisplay = document.createElement('p');
    errorDisplay.className = 'text-error';
    errorDisplay.style.display = 'none';

    container.append(label, preview, inputContainer, removeBtn, errorDisplay);

    let selectedDecal = currentDecal;

    const renderPreview = () => {
        preview.replaceChildren();
        if (selectedDecal)
            preview.appendChild(createStatusImage(selectedDecal));
        preview.style.display = selectedDecal ? '' : 'none';
        removeBtn.style.display = selectedDecal ? '' : 'none';
    };

    const showError = (message) => {
        errorDisplay.textContent = message || '';
        errorDisplay.style.display = message ? 'block' : 'none';
    };

    const resolveInput = async () => {
        const value = input.value.trim();
        if (!value) {
            selectedDecal = null;
            showError('');
            renderPreview();
            return true;
        }
        if (Number(value) === selectedDecal?.decalId) return true;

        const decal = /^\d+$/.test(value) ? await getDecal(value) : null;
        if (!decal) {
            showError(ts('statusBubble.decalNotFound'));
            return false;
        }
        selectedDecal = decal;
        showError('');
        renderPreview();
        return true;
    };

    input.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        resolveInput();
    });
    input.addEventListener('blur', () => resolveInput());
    removeBtn.addEventListener('click', () => {
        input.value = '';
        selectedDecal = null;
        showError('');
        renderPreview();
    });

    renderPreview();

    return {
        element: container,
        async getChange() {
            if (!(await resolveInput())) throw new Error('invalid-decal');
            if ((selectedDecal?.decalId || 0) === (currentDecal?.decalId || 0))
                return undefined;
            return selectedDecal;
        },
    };
}

function openEditStatusOverlay(currentStatus, currentDecal, imageMode, onSave) {
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

    const imageEditor =
        imageMode === 'editable' ? createStatusImageEditor(currentDecal) : null;
    if (imageEditor) {
        container.appendChild(imageEditor.element);
    } else if (imageMode === 'locked') {
        container.appendChild(createLockedStatusImageEditor());
    }

    container.appendChild(createStatusHelpText());

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

        let imageChange;
        try {
            imageChange = await imageEditor?.getChange();
        } catch {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save';
            return;
        }

        const result = await onSave(newStatus, imageChange);

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
    if (avatarContainer.closest('[data-rovalra-banned-profile]')) return;

    try {
        avatarContainer.classList.add('rovalra-status-bubble-host');

        const userId = getUserIdFromUrl();
        if (!userId) return;
        const authenticatedUserId = await getAuthenticatedUserId();
        const isOwnProfile =
            authenticatedUserId &&
            String(authenticatedUserId) === String(userId);

        const profileSettings = await getUserSettings(userId);

        let statusText = profileSettings.status || '';
        const statusImageId =
            !isOwnProfile && (await settings.hideStatusImages)
                ? 0
                : profileSettings.status_image || 0;
        let statusDecal = null;

        if (!statusText && !statusImageId && !isOwnProfile) return;

        const bubbleWrapper = document.createElement('div');
        bubbleWrapper.className = 'rovalra-status-bubble-wrapper';

        const bubble = document.createElement('div');
        bubble.className = 'rovalra-status-bubble text-label-medium';

        const textContainer = document.createElement('div');
        textContainer.className = 'rovalra-status-bubble-text';
        bubble.appendChild(textContainer);

        const renderBubble = () => {
            const textToRender =
                statusText || (isOwnProfile && !statusDecal ? '...' : '');
            renderStatusBubbleContent(
                textContainer,
                truncateStatus(textToRender),
            );
            textContainer.hidden = !textToRender;

            bubble
                .querySelector(':scope > .rovalra-status-bubble-image-wrap')
                ?.remove();
            if (statusDecal) {
                const image = createStatusImage(statusDecal);
                if (!isOwnProfile) {
                    image.classList.add(
                        'rovalra-status-bubble-image-reportable',
                    );
                    addTooltip(image, ts('statusBubble.clickToReport'));
                    image.addEventListener('click', (e) => {
                        e.stopPropagation();
                        openDecalReport(statusDecal);
                    });
                }
                bubble.appendChild(image);
            }

            if (isOwnProfile) {
                addTooltip(
                    bubble,
                    statusText || statusDecal
                        ? 'Click to edit'
                        : 'Click to add a status',
                );
            }
        };

        renderBubble();
        bubbleWrapper.appendChild(bubble);
        avatarContainer.appendChild(bubbleWrapper);

        if (statusImageId) {
            getDecal(statusImageId).then((decal) => {
                statusDecal = decal;
                if (!statusDecal && !statusText && !isOwnProfile) {
                    bubbleWrapper.remove();
                    return;
                }
                renderBubble();
            });
        }

        if (isOwnProfile) {
            bubble.style.cursor = 'pointer';

            bubble.addEventListener('click', (e) => {
                e.stopPropagation();
                ensureTouAgreement(async () => {
                    const imageMode = await getStatusImageMode();
                    openEditStatusOverlay(
                        statusText,
                        statusDecal,
                        imageMode,
                        async (newStatus, imageChange) => {
                            try {
                                const updatedValue =
                                    await updateUserSettingViaApi(
                                        'status',
                                        newStatus,
                                        { throwOnError: true },
                                    );
                                if (typeof updatedValue !== 'string') {
                                    return false;
                                }
                                statusText = updatedValue;

                                if (imageChange !== undefined) {
                                    const updatedImage =
                                        await updateUserSettingViaApi(
                                            'status_image',
                                            imageChange?.decalId || 0,
                                            { throwOnError: true },
                                        );
                                    if (updatedImage === false) {
                                        renderBubble();
                                        return ts(
                                            'statusBubble.imageSaveFailed',
                                        );
                                    }
                                    statusDecal = imageChange;
                                }

                                renderBubble();
                                showSystemAlert(
                                    'Status updated successfully!',
                                    'success',
                                );
                                return true;
                            } catch (error) {
                                console.error(
                                    'RoValra: Failed to update status via API.',
                                    error,
                                );
                                renderBubble();
                                if (error?.userMessage) {
                                    return error.userMessage;
                                }
                                return false;
                            }
                        },
                    );
                });
            });
        } else if (REPORTING_ENABLED && statusText) {
            textContainer.style.cursor = 'pointer';
            addTooltip(textContainer, 'Report status');

            textContainer.addEventListener('click', (e) => {
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

                    video.play().catch(() => {});
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
    const selector =
        '.user-profile-header-details-avatar-container:not(.rovalra-sendrobux-avatar):not(.rovalra-user-card-avatar)';
    observeElement(selector, (el) => addStatusBubble(el), {
        multiple: true,
    });

    if (await settings.statusBubbleHomePage) {
        observeUserCardElements();
        onUserCardElement(addHomeStatusHover, {
            exclude: [
                '.rovalra-donator-card',
                '.user-item-clickable',
                '.rovalra-sendrobux-profile',
            ],
        });
    }
}
