import { observeElement, observeAttributes } from '../../../core/observer.js';
import { createOverlay } from '../../../core/ui/overlay.js';
import { callRobloxApi } from '../../../core/api.js';
import { createButton } from '../../../core/ui/buttons.js';
import { createRadioButton } from '../../../core/ui/general/radio.js';
import {
    fetchThumbnails,
    createThumbnailElement,
} from '../../../core/thumbnail/thumbnails.js';
import {
    getCachedFriendsList,
    getFriendRequestOriginText,
} from '../../../core/utils/trackers/friendslist.js';
import { createInteractiveTimestamp } from '../../../core/ui/time/time.js';
import { t, ts } from '../../../core/locale/i18n.js';
import { showSystemAlert } from '../../../core/ui/roblox/alert.js';
import { getUserIdFromFriendUrl } from '../../../core/idExtractor.js';
import { getAuthenticatedUserId } from '../../../core/user.js';

const selectedFriends = new Set();
let unfriendButton = null;
let enableBulkUnfriend = false;
let bulkToggleButton = null;
let isInjectingHeader = false;
let friendsMap = null;
let headerObserver = null;
let cardsObserver = null;
const cardAttributeObservers = new Map();

async function unfriendUser(userId, attempt = 1) {
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 1000;

    try {
        await callRobloxApi({
            subdomain: 'friends',
            endpoint: `/v1/users/${userId}/unfriend`,
            method: 'POST',
        });

        await new Promise((resolve) => setTimeout(resolve, 500));

        const statusResponse = await callRobloxApi({
            subdomain: 'friends',
            endpoint: `/v1/my/trusted-friends/${userId}/status`,
            method: 'GET',
        });

        const statusResult = await statusResponse.json();

        if (statusResult?.status === 'NotFriends') {
            return true;
        }

        throw new Error(
            `trusted-friends API returned: ${statusResult?.status || statusResponse.status}`,
        );
    } catch (error) {
        if (attempt < MAX_RETRIES) {
            await new Promise((resolve) =>
                setTimeout(resolve, RETRY_DELAY * attempt),
            );
            return unfriendUser(userId, attempt + 1);
        }

        return false;
    }
}

async function showConfirmationOverlay() {
    const selectedCount = selectedFriends.size;
    if (selectedCount === 0) return;

    const bodyContent = document.createElement('div');
    bodyContent.style.padding = '16px 0';

    const description = document.createElement('p');
    if (selectedCount === 1) {
        description.textContent = ts('unfriend.descriptionSingle');
    } else {
        description.textContent = ts('unfriend.descriptionPlural', {
            count: selectedCount,
        });
    }
    description.style.marginBottom = '16px';
    bodyContent.appendChild(description);

    const friendList = document.createElement('div');
    friendList.style.display = 'grid';
    friendList.style.gridTemplateColumns = '1fr 1fr';
    friendList.style.gap = '12px';
    friendList.style.maxHeight = '400px';
    friendList.style.overflowY = 'auto';

    const friendsList = await getCachedFriendsList();
    if (friendsList) {
        friendsMap = new Map(friendsList.map((friend) => [friend.id, friend]));
    }

    const selectedIds = Array.from(selectedFriends);
    const thumbnails = await fetchThumbnails(
        selectedIds.map((id) => ({ id })),
        'AvatarHeadshot',
        '48x48',
        true,
    );

    for (const friendId of Array.from(selectedFriends)) {
        const friendData = friendsMap?.get(parseInt(friendId, 10));
        const displayName =
            friendData?.displayName ||
            friendData?.username ||
            `User ${friendId}`;
        const username = friendData?.username;

        const friendItem = document.createElement('div');
        friendItem.style.display = 'flex';
        friendItem.style.alignItems = 'center';
        friendItem.style.gap = '12px';
        friendItem.style.padding = '12px';
        friendItem.style.borderRadius = '8px';
        friendItem.style.backgroundColor =
            'var(--rovalra-container-background-color)';

        const thumbnail = thumbnails.get(Number(friendId));
        if (thumbnail) {
            const thumbElement = createThumbnailElement(
                thumbnail,
                displayName,
                '',
                {
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    flexShrink: '0',
                },
            );
            friendItem.appendChild(thumbElement);
        }

        const infoContainer = document.createElement('div');
        infoContainer.style.display = 'flex';
        infoContainer.style.flexDirection = 'column';
        infoContainer.style.gap = '4px';
        infoContainer.style.flex = '1';
        infoContainer.style.minWidth = '0';

        const nameText = document.createElement('span');
        nameText.style.fontWeight = '500';
        nameText.style.lineHeight = '1.2';
        nameText.textContent = displayName;
        infoContainer.appendChild(nameText);

        const usernameText = document.createElement('span');
        usernameText.style.opacity = '0.6';
        usernameText.style.fontSize = '12px';
        usernameText.style.lineHeight = '1.2';
        usernameText.textContent = username ? `@${username}` : '';
        infoContainer.appendChild(usernameText);

        if (friendData) {
            const friendsSinceRow = document.createElement('div');
            friendsSinceRow.style.display = 'flex';
            friendsSinceRow.style.alignItems = 'center';
            friendsSinceRow.style.gap = '6px';
            friendsSinceRow.style.fontSize = '13px';
            friendsSinceRow.style.opacity = '0.8';

            const timestamp = createInteractiveTimestamp(
                friendData.friendsSince,
            );
            const friendedText = await t('friendsSince.friended');
            friendsSinceRow.appendChild(
                document.createTextNode(`${friendedText} `),
            );
            friendsSinceRow.appendChild(timestamp);

            infoContainer.appendChild(friendsSinceRow);

            if (friendData.friendRequestOrigin) {
                const detailsRow = document.createElement('div');
                detailsRow.style.display = 'flex';
                detailsRow.style.alignItems = 'center';
                detailsRow.style.gap = '6px';
                detailsRow.style.fontSize = '12px';
                detailsRow.style.opacity = '0.7';
                detailsRow.style.marginTop = '2px';

                const originLabel = document.createElement('span');
                originLabel.textContent = getFriendRequestOriginText(
                    friendData.friendRequestOrigin,
                );
                detailsRow.appendChild(originLabel);

                infoContainer.appendChild(detailsRow);
            }
        }

        friendItem.style.position = 'relative';
        friendItem.appendChild(infoContainer);

        const removeButton = document.createElement('button');
        removeButton.innerHTML = '✕';
        removeButton.style.position = 'absolute';
        removeButton.style.top = '8px';
        removeButton.style.right = '8px';
        removeButton.style.opacity = '0.6';
        removeButton.style.background = 'none';
        removeButton.style.border = 'none';
        removeButton.style.padding = '4px';
        removeButton.style.cursor = 'pointer';
        removeButton.style.color = 'var(--rovalra-main-text-color)';
        removeButton.style.fontSize = '16px';
        removeButton.style.zIndex = '10';
        removeButton.style.transition = 'opacity 0.15s';

        removeButton.addEventListener('click', (e) => {
            e.stopPropagation();

            selectedFriends.delete(friendId);
            const card = document.querySelector(`li[id="${friendId}"]`);
            if (card) {
                const radio = card.querySelector('.rovalra-unfriend-radio');
                if (radio) radio.setChecked(false);
                card.style.outline = '';
            }

            friendItem.style.opacity = '0.3';
            friendItem.style.pointerEvents = 'none';

            setTimeout(() => {
                friendItem.remove();
                updateUnfriendButton();

                const count = selectedFriends.size;
                confirmButton.disabled = count === 0;
                confirmButton.textContent =
                    count === 1
                        ? ts('unfriend.unfriendCountAction', { count })
                        : ts('unfriend.unfriendCountActionPlural', { count });

                if (count === 0) {
                    confirmButton.textContent = ts('unfriend.unfriend');
                }

                if (count === 1) {
                    description.textContent = ts('unfriend.descriptionSingle');
                } else {
                    description.textContent = ts('unfriend.descriptionPlural', {
                        count,
                    });
                }

                const titleEl = overlay.overlay?.querySelector('h2');
                if (titleEl) {
                    titleEl.textContent =
                        count === 1
                            ? ts('unfriend.confirmUnfriend')
                            : ts('unfriend.confirmUnfriends');
                }
            }, 150);
        });

        friendItem.appendChild(removeButton);
        friendList.appendChild(friendItem);
    }

    bodyContent.appendChild(friendList);

    const cancelButton = createButton(ts('unfriend.cancel'), 'secondary');
    const confirmButton = createButton(
        selectedCount === 1
            ? ts('unfriend.unfriendCountAction', { count: selectedCount })
            : ts('unfriend.unfriendCountActionPlural', {
                  count: selectedCount,
              }),
        'alert',
    );

    const overlay = createOverlay({
        title:
            selectedCount === 1
                ? ts('unfriend.confirmUnfriend')
                : ts('unfriend.confirmUnfriends'),
        bodyContent,
        actions: [cancelButton, confirmButton],
        showLogo: true,
    });

    cancelButton.addEventListener('click', () => {
        overlay.close();
    });

    let isUnfriendingActive = false;
    let cancelUnfriending = false;

    confirmButton.addEventListener('click', async () => {
        confirmButton.disabled = true;
        isUnfriendingActive = true;

        const friendsToRemove = Array.from(selectedFriends);
        let successCount = 0;

        const progressContainer = document.createElement('div');
        progressContainer.className = 'rovalra-action-progress-container';
        progressContainer.style.display = 'block';
        progressContainer.style.marginTop = '20px';
        progressContainer.style.textAlign = 'center';

        const progressLabel = document.createElement('div');
        progressLabel.className = 'rovalra-action-status-text';
        progressLabel.style.fontSize = '18px';
        progressLabel.style.fontWeight = '500';
        progressLabel.textContent = `${ts('unfriend.unfriending')} 0/${friendsToRemove.length}`;
        progressContainer.appendChild(progressLabel);

        bodyContent.appendChild(progressContainer);

        for (let i = 0; i < friendsToRemove.length; i++) {
            if (cancelUnfriending) break;

            const friendId = friendsToRemove[i];
            const success = await unfriendUser(friendId);
            if (success) {
                successCount++;
                const card = document.querySelector(`li[id="${friendId}"]`);
                if (card) {
                    card.style.opacity = '0.3';
                    card.style.pointerEvents = 'none';
                }
            }

            progressLabel.textContent = `${ts('unfriend.unfriending')} ${i + 1}/${friendsToRemove.length}`;
        }

        isUnfriendingActive = false;

        sessionStorage.setItem('unfriendCompleteCount', successCount);
        sessionStorage.setItem('unfriendTotalCount', friendsToRemove.length);

        window.location.reload();
    });

    overlay.onClose = () => {
        if (isUnfriendingActive) {
            cancelUnfriending = true;
            updateUnfriendButton();
        }
    };
}

function updateUnfriendButton() {
    if (!unfriendButton) return;

    if (selectedFriends.size > 0) {
        unfriendButton.style.display = 'inline-flex';
        unfriendButton.textContent = ts('unfriend.unfriendCount', {
            count: selectedFriends.size,
        });
    } else {
        unfriendButton.style.display = 'none';
    }
}

function getFriendIdFromCard(card) {
    if (card.id && /^\d+$/.test(card.id)) return card.id;
    const profileLink = card.querySelector(
        '.avatar-card-link, a[href*="/users/"]',
    );
    if (profileLink) {
        const match = profileLink.href.match(/\/users\/(\d+)\//);
        return match ? match[1] : null;
    }
    return null;
}

async function addUnfriendButtonToHeader(headerContainer) {
    if (
        isInjectingHeader ||
        headerContainer.querySelector('.rovalra-bulk-unfriend-btn')
    )
        return;

    isInjectingHeader = true;

    const urlUserId = await getUserIdFromFriendUrl();
    const authedUserId = await getAuthenticatedUserId();

    if (!isOnFriendsPage()) {
        isInjectingHeader = false;
        return;
    }

    if (urlUserId != null && String(urlUserId) !== String(authedUserId)) {
        cleanupBulkMode();
        isInjectingHeader = false;
        return;
    }

    bulkToggleButton = createButton(ts('unfriend.bulkUnfriend'), 'secondary', {
        onClick: () => {
            enableBulkUnfriend = !enableBulkUnfriend;

            document
                .querySelectorAll('.rovalra-unfriend-radio')
                .forEach((radio) => {
                    radio.style.display = enableBulkUnfriend ? 'block' : 'none';
                });

            document
                .querySelectorAll('li.list-item.avatar-card')
                .forEach((card) => {
                    if (enableBulkUnfriend) {
                        card.style.cursor = 'pointer';
                        card.style.pointerEvents = 'auto';
                        card.querySelectorAll(
                            'a, button, svg, span, img',
                        ).forEach((el) => {
                            el.style.pointerEvents = 'none';
                        });
                        card.style.userSelect = 'none';
                        card.addEventListener('click', handleCardClick);
                    } else {
                        card.style.cursor = '';
                        card.style.pointerEvents = '';
                        card.querySelectorAll(
                            'a, button, svg, span, img',
                        ).forEach((el) => {
                            el.style.pointerEvents = '';
                        });
                        card.style.userSelect = '';
                        card.removeEventListener('click', handleCardClick);
                        card.style.outline = '';
                    }
                });

            if (!enableBulkUnfriend) {
                //  Keep selection in memory
            } else {
                selectedFriends.forEach((friendId) => {
                    const card = document.querySelector(`li[id="${friendId}"]`);
                    const radio = card?.querySelector(
                        '.rovalra-unfriend-radio',
                    );
                    if (radio && card) {
                        radio.setChecked(true);
                    }
                });
                updateUnfriendButton();
            }

            bulkToggleButton.textContent = enableBulkUnfriend
                ? ts('unfriend.exitBulkMode')
                : ts('unfriend.bulkUnfriend');
        },
    });
    bulkToggleButton.classList.add('rovalra-bulk-unfriend-btn');
    bulkToggleButton.style.marginLeft = '12px';
    headerContainer.appendChild(bulkToggleButton);

    unfriendButton = createButton(ts('unfriend.unfriend'), 'alert', {
        onClick: showConfirmationOverlay,
    });
    unfriendButton.style.display = 'none';
    unfriendButton.style.marginLeft = '8px';
    headerContainer.appendChild(unfriendButton);

    isInjectingHeader = false;
}

function handleCardClick(e) {
    if (!enableBulkUnfriend) return;

    const card = e.currentTarget;
    const radio = card.querySelector('.rovalra-unfriend-radio');

    if (radio && !e.target.closest('.rovalra-unfriend-radio')) {
        radio.click();
    }
}

function addSelectionCheckboxToCard(card, friendId) {
    if (card.querySelector('.rovalra-unfriend-radio')) return;

    const contentContainer = card.querySelector('.avatar-card-content');
    if (!contentContainer) return;

    const radio = createRadioButton({
        onChange: (checked) => {
            const currentId = getFriendIdFromCard(card);
            if (!currentId) return;

            if (checked) {
                selectedFriends.add(currentId);
            } else {
                selectedFriends.delete(currentId);

                card.style.outline = '';
            }
            updateUnfriendButton();
        },
    });

    radio.className = 'rovalra-unfriend-radio';
    radio.style.position = 'absolute';
    radio.style.top = '8px';
    radio.style.left = '8px';
    radio.style.zIndex = '10';
    radio.style.display = enableBulkUnfriend ? 'block' : 'none';

    card.style.position = 'relative';
    contentContainer.appendChild(radio);
}

function cleanupBulkMode() {
    enableBulkUnfriend = false;
    selectedFriends.clear();

    if (unfriendButton) {
        unfriendButton.remove();
        unfriendButton = null;
    }
    if (bulkToggleButton) {
        bulkToggleButton.remove();
        bulkToggleButton = null;
    }

    cardAttributeObservers.forEach((obs) => obs.disconnect());
    cardAttributeObservers.clear();

    friendsMap = null;

    if (headerObserver) {
        headerObserver.disconnect();
        headerObserver = null;
    }
    if (cardsObserver) {
        cardsObserver.disconnect();
        cardsObserver = null;
    }

    document.querySelectorAll('.rovalra-unfriend-radio').forEach((radio) => {
        radio.remove();
    });

    document.querySelectorAll('li.list-item.avatar-card').forEach((card) => {
        card.style.cursor = '';
        card.style.pointerEvents = '';
        card.querySelectorAll('a, button, svg, span, img').forEach((el) => {
            el.style.pointerEvents = '';
        });
        card.style.userSelect = '';
        card.removeEventListener('click', handleCardClick);
        card.style.outline = '';
        card.style.opacity = '';
    });
}

function isOnFriendsPage() {
    return window.location.hash.includes('#!/friends');
}

async function initializeIfOnFriendsPage() {
    const successCount = sessionStorage.getItem('unfriendCompleteCount');
    const totalCount = sessionStorage.getItem('unfriendTotalCount');

    if (successCount && totalCount) {
        sessionStorage.removeItem('unfriendCompleteCount');
        sessionStorage.removeItem('unfriendTotalCount');

        setTimeout(() => {
            showSystemAlert(
                ts('unfriend.successMessage', {
                    successCount,
                    totalCount,
                }),
                'success',
            );
        }, 500);
    }

    if (!isOnFriendsPage()) {
        cleanupBulkMode();
        return;
    }

    if (headerObserver) return;

    const friendsList = await getCachedFriendsList();
    if (friendsList) {
        friendsMap = new Map(friendsList.map((friend) => [friend.id, friend]));
    }

    headerObserver = observeElement(
        '.friends-left, .friends-subtitle',
        (header) => addUnfriendButtonToHeader(header),
        { multiple: true },
    );

    cardsObserver = observeElement(
        'li.list-item.avatar-card',
        (card) => {
            const updateCardState = () => {
                const friendId = getFriendIdFromCard(card);
                if (!friendId) return;

                addSelectionCheckboxToCard(card);

                const radio = card.querySelector('.rovalra-unfriend-radio');
                if (radio) {
                    radio.setChecked(selectedFriends.has(friendId));
                }

                if (enableBulkUnfriend) {
                    card.style.cursor = 'pointer';
                    card.addEventListener('click', handleCardClick);
                }
            };

            updateCardState();

            const profileLink = card.querySelector(
                '.avatar-card-link, a[href*="/users/"]',
            );
            if (profileLink) {
                const attrObserver = observeAttributes(
                    profileLink,
                    (mutation) => {
                        if (mutation.attributeName === 'href') {
                            updateCardState();
                        }
                    },
                    ['href'],
                );
                cardAttributeObservers.set(card, attrObserver);
            }
        },
        {
            multiple: true,
            onRemove: (card) => {
                card.removeEventListener('click', handleCardClick);
                const obs = cardAttributeObservers.get(card);
                if (obs) {
                    obs.disconnect();
                    cardAttributeObservers.delete(card);
                }
            },
        },
    );
}

export async function init() {
    const settings = await chrome.storage.local.get('bulkUnfriendEnabled');
    if (!settings.bulkUnfriendEnabled) {
        return;
    }

    const handlePageChange = async () => {
        const urlUserId = await getUserIdFromFriendUrl();
        const authedUserId = await getAuthenticatedUserId();

        if (urlUserId != null && String(urlUserId) !== String(authedUserId)) {
            cleanupBulkMode();
            return;
        }

        initializeIfOnFriendsPage();
    };

    handlePageChange();

    let lastUrl = location.href;
    observeElement(
        'body',
        () => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                handlePageChange();
            }
        },
        { multiple: false },
    );

    window.addEventListener('popstate', handlePageChange);
}
