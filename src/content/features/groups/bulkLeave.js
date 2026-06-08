import { observeElement } from '../../core/observer.js';
import { createOverlay } from '../../core/ui/overlay.js';
import { callRobloxApi, callRobloxApiJson } from '../../core/api.js';
import { createButton } from '../../core/ui/buttons.js';
import { ts } from '../../core/locale/i18n.js';
import { showSystemAlert } from '../../core/ui/roblox/alert.js';
import { getAuthenticatedUserId } from '../../core/user.js';
import { getGroupIdFromUrl } from '../../core/idExtractor.js';

const selectedGroups = new Map();
let leaveButton = null;
let bulkToggleButton = null;
let enableBulkLeave = false;
let toolbar = null;

let groupInfoMap = new Map();
const ownedGroupIds = new Set();

function getGroupIdFromCard(card) {
    const href = card.getAttribute('href');
    if (!href) return null;
    return getGroupIdFromUrl(href);
}

function findCardByGroupId(groupId) {
    return Array.from(document.querySelectorAll('a.groups-list-item')).find(
        (card) => getGroupIdFromCard(card) === groupId,
    );
}

function isOwnedGroup(groupId) {
    return !!groupId && ownedGroupIds.has(parseInt(groupId, 10));
}

function getGroupName(groupId, card = null) {
    const apiName = groupInfoMap.get(parseInt(groupId, 10))?.name;
    if (apiName) return apiName;

    const img = card?.querySelector('img');
    if (img?.alt?.trim()) return img.alt.trim();

    return `Community ${groupId}`;
}

function getGroupIconFromCard(card) {
    const img = card.querySelector('img');
    return img?.src || '';
}

function applySelectionStyle(card, selected) {
    if (selected) {
        card.style.outline =
            '3px solid var(--rovalra-playbutton-color, #00a2ff)';
        card.style.outlineOffset = '-3px';
    } else {
        card.style.outline = '';
        card.style.outlineOffset = '';
    }
}

function addSelectionDot(card) {
    if (card.querySelector('.rovalra-leave-dot')) return;

    const dot = document.createElement('span');
    dot.classList.add('rovalra-leave-dot');
    Object.assign(dot.style, {
        position: 'absolute',
        right: '12px',
        top: '50%',
        transform: 'translateY(-50%)',
        fontSize: '22px',
        lineHeight: '1',
        zIndex: '10',
        pointerEvents: 'none',
    });

    card.style.position = 'relative';
    card.appendChild(dot);
    updateSelectionDot(card);
}

function updateSelectionDot(card) {
    const dot = card.querySelector('.rovalra-leave-dot');
    if (!dot) return;

    const groupId = getGroupIdFromCard(card);
    const selected = !!groupId && selectedGroups.has(groupId);
    dot.className = selected
        ? 'rovalra-leave-dot icon-radio-check-circle-filled'
        : 'rovalra-leave-dot icon-radio-check-circle';
}

function removeSelectionDot(card) {
    card.querySelector('.rovalra-leave-dot')?.remove();
}

async function fetchUserGroups() {
    try {
        const authedId = await getAuthenticatedUserId();
        if (!authedId) return;

        const res = await callRobloxApiJson({
            subdomain: 'groups',
            endpoint: `/v1/users/${authedId}/groups/roles?includeLocked=true`,
        });

        groupInfoMap = new Map();
        ownedGroupIds.clear();

        for (const item of res?.data || []) {
            const isOwner = item?.role?.rank === 255;
            groupInfoMap.set(item.group.id, {
                name: item.group.name,
                isOwner,
            });
            if (isOwner) {
                ownedGroupIds.add(item.group.id);
            }
        }

        if (enableBulkLeave) {
            for (const groupId of Array.from(selectedGroups.keys())) {
                if (isOwnedGroup(groupId)) {
                    selectedGroups.delete(groupId);
                }
            }
            updateLeaveButton();
            document.querySelectorAll('a.groups-list-item').forEach((card) => {
                if (card.closest('.pending-join-requests')) return;
                setCardInteractivity(card, true);
            });
        }
    } catch (error) {
        console.error('RoValra: Failed to fetch user communities', error);
    }
}

async function leaveGroup(groupId, attempt = 1) {
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 1000;

    if (isOwnedGroup(groupId)) {
        return false;
    }

    try {
        const authedId = await getAuthenticatedUserId();
        const response = await callRobloxApi({
            subdomain: 'groups',
            endpoint: `/v1/groups/${groupId}/users/${authedId}`,
            method: 'DELETE',
        });

        if (response.ok) {
            return true;
        }

        throw new Error(`leave community API returned: ${response.status}`);
    } catch {
        if (attempt < MAX_RETRIES) {
            await new Promise((resolve) =>
                setTimeout(resolve, RETRY_DELAY * attempt),
            );
            return leaveGroup(groupId, attempt + 1);
        }

        return false;
    }
}

function updateLeaveButton() {
    if (!leaveButton) return;

    if (selectedGroups.size > 0) {
        leaveButton.style.display = 'inline-flex';
        leaveButton.textContent = ts('leaveGroups.leaveCount', {
            count: selectedGroups.size,
        });
    } else {
        leaveButton.style.display = 'none';
    }
}

async function showConfirmationOverlay() {
    const selectedCount = selectedGroups.size;
    if (selectedCount === 0) return;

    const bodyContent = document.createElement('div');
    bodyContent.style.padding = '16px 0';

    const description = document.createElement('p');
    description.textContent =
        selectedCount === 1
            ? ts('leaveGroups.descriptionSingle')
            : ts('leaveGroups.descriptionPlural', { count: selectedCount });
    description.style.marginBottom = '16px';
    bodyContent.appendChild(description);

    const groupList = document.createElement('div');
    groupList.style.display = 'grid';
    groupList.style.gridTemplateColumns = '1fr 1fr';
    groupList.style.gap = '12px';
    groupList.style.maxHeight = '400px';
    groupList.style.overflowY = 'auto';

    for (const [groupId, info] of selectedGroups) {
        const displayName = getGroupName(groupId, findCardByGroupId(groupId));

        const groupItem = document.createElement('div');
        groupItem.style.display = 'flex';
        groupItem.style.alignItems = 'center';
        groupItem.style.gap = '12px';
        groupItem.style.padding = '12px';
        groupItem.style.borderRadius = '8px';
        groupItem.style.position = 'relative';
        groupItem.style.backgroundColor =
            'var(--rovalra-container-background-color)';

        if (info.iconUrl) {
            const icon = document.createElement('img');
            icon.src = info.iconUrl;
            icon.alt = displayName;
            icon.style.width = '48px';
            icon.style.height = '48px';
            icon.style.borderRadius = '8px';
            icon.style.flexShrink = '0';
            icon.style.objectFit = 'cover';
            groupItem.appendChild(icon);
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
        nameText.style.wordBreak = 'break-word';
        nameText.textContent = displayName;
        infoContainer.appendChild(nameText);

        groupItem.appendChild(infoContainer);

        const removeButton = document.createElement('button');
        removeButton.textContent = '✕';
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

            selectedGroups.delete(groupId);
            const card = findCardByGroupId(groupId);
            if (card) {
                applySelectionStyle(card, false);
                updateSelectionDot(card);
            }

            groupItem.style.opacity = '0.3';
            groupItem.style.pointerEvents = 'none';

            setTimeout(() => {
                groupItem.remove();
                updateLeaveButton();

                const count = selectedGroups.size;
                confirmButton.disabled = count === 0;
                confirmButton.textContent =
                    count === 0
                        ? ts('leaveGroups.leave')
                        : count === 1
                          ? ts('leaveGroups.leaveCountAction', { count })
                          : ts('leaveGroups.leaveCountActionPlural', { count });

                description.textContent =
                    count === 1
                        ? ts('leaveGroups.descriptionSingle')
                        : ts('leaveGroups.descriptionPlural', { count });

                const titleEl = overlay.overlay?.querySelector(
                    '.rovalra-overlay-header span',
                );
                if (titleEl) {
                    titleEl.textContent =
                        count === 1
                            ? ts('leaveGroups.confirmLeave')
                            : ts('leaveGroups.confirmLeaves');
                }
            }, 150);
        });

        groupItem.appendChild(removeButton);
        groupList.appendChild(groupItem);
    }

    bodyContent.appendChild(groupList);

    const cancelButton = createButton(ts('leaveGroups.cancel'), 'secondary');
    const confirmButton = createButton(
        selectedCount === 1
            ? ts('leaveGroups.leaveCountAction', { count: selectedCount })
            : ts('leaveGroups.leaveCountActionPlural', {
                  count: selectedCount,
              }),
        'alert',
    );

    let isLeavingActive = false;
    let cancelLeaving = false;

    const overlay = createOverlay({
        title:
            selectedCount === 1
                ? ts('leaveGroups.confirmLeave')
                : ts('leaveGroups.confirmLeaves'),
        bodyContent,
        actions: [cancelButton, confirmButton],
        showLogo: true,
        onClose: () => {
            if (isLeavingActive) {
                cancelLeaving = true;
            }
        },
    });

    cancelButton.addEventListener('click', () => {
        overlay.close();
    });

    confirmButton.addEventListener('click', async () => {
        confirmButton.disabled = true;
        cancelButton.disabled = true;
        isLeavingActive = true;

        const groupsToLeave = Array.from(selectedGroups.keys());
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
        progressLabel.textContent = `${ts('leaveGroups.leaving')} 0/${groupsToLeave.length}`;
        progressContainer.appendChild(progressLabel);

        bodyContent.appendChild(progressContainer);

        for (let i = 0; i < groupsToLeave.length; i++) {
            if (cancelLeaving) break;

            const groupId = groupsToLeave[i];
            const success = await leaveGroup(groupId);
            if (success) {
                successCount++;
                const card = findCardByGroupId(groupId);
                if (card) {
                    card.style.opacity = '0.3';
                    card.style.pointerEvents = 'none';
                }
            }

            progressLabel.textContent = `${ts('leaveGroups.leaving')} ${i + 1}/${groupsToLeave.length}`;
        }

        isLeavingActive = false;

        sessionStorage.setItem('leaveGroupsCompleteCount', successCount);
        sessionStorage.setItem('leaveGroupsTotalCount', groupsToLeave.length);

        window.location.reload();
    });
}

function toggleCardSelection(card) {
    const groupId = getGroupIdFromCard(card);
    if (!groupId) return;

    if (isOwnedGroup(groupId)) return;

    if (selectedGroups.has(groupId)) {
        selectedGroups.delete(groupId);
        applySelectionStyle(card, false);
    } else {
        selectedGroups.set(groupId, {
            name: getGroupName(groupId, card),
            iconUrl: getGroupIconFromCard(card),
        });
        applySelectionStyle(card, true);
    }

    updateSelectionDot(card);
    updateLeaveButton();
}

function onDocumentClickCapture(e) {
    if (!enableBulkLeave) return;

    const card = e.target.closest('a.groups-list-item');
    if (!card || card.closest('.pending-join-requests')) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    toggleCardSelection(card);
}

function setCardInteractivity(card, active) {
    if (active) {
        card.style.userSelect = 'none';
        card.setAttribute('draggable', 'false');

        const groupId = getGroupIdFromCard(card);
        if (isOwnedGroup(groupId)) {
            card.style.cursor = 'not-allowed';
            card.style.opacity = '0.5';
            applySelectionStyle(card, false);
            removeSelectionDot(card);
        } else {
            card.style.cursor = 'pointer';
            card.style.opacity = '';
            applySelectionStyle(card, !!groupId && selectedGroups.has(groupId));
            addSelectionDot(card);
        }
    } else {
        card.style.cursor = '';
        card.style.userSelect = '';
        card.style.opacity = '';
        applySelectionStyle(card, false);
        removeSelectionDot(card);
    }
}

function setBulkMode(active) {
    enableBulkLeave = active;

    if (!active) {
        selectedGroups.clear();
    }

    document.querySelectorAll('a.groups-list-item').forEach((card) => {
        if (card.closest('.pending-join-requests')) return;
        setCardInteractivity(card, active);
    });

    updateLeaveButton();

    if (bulkToggleButton) {
        bulkToggleButton.textContent = active
            ? ts('leaveGroups.exitBulkMode')
            : ts('leaveGroups.bulkLeave');
    }
}

function injectToolbar(container) {
    if (toolbar && document.body.contains(toolbar)) return;

    toolbar = document.createElement('div');
    toolbar.className = 'rovalra-bulk-leave-toolbar';
    toolbar.style.display = 'flex';
    toolbar.style.alignItems = 'center';
    toolbar.style.gap = '8px';
    toolbar.style.marginBottom = '12px';

    bulkToggleButton = createButton(ts('leaveGroups.bulkLeave'), 'secondary', {
        onClick: () => setBulkMode(!enableBulkLeave),
    });
    bulkToggleButton.classList.add('rovalra-bulk-leave-btn');

    leaveButton = createButton(ts('leaveGroups.leave'), 'alert', {
        onClick: showConfirmationOverlay,
    });
    leaveButton.style.display = 'none';

    toolbar.appendChild(bulkToggleButton);
    toolbar.appendChild(leaveButton);

    container.insertAdjacentElement('beforebegin', toolbar);
    updateLeaveButton();
}

function cleanup() {
    enableBulkLeave = false;
    selectedGroups.clear();

    document.querySelectorAll('a.groups-list-item').forEach((card) => {
        setCardInteractivity(card, false);
        card.style.opacity = '';
    });

    if (toolbar) {
        toolbar.remove();
        toolbar = null;
    }
    leaveButton = null;
    bulkToggleButton = null;
}

function showSuccessAlertIfNeeded() {
    const successCount = sessionStorage.getItem('leaveGroupsCompleteCount');
    const totalCount = sessionStorage.getItem('leaveGroupsTotalCount');

    if (successCount !== null && totalCount !== null) {
        sessionStorage.removeItem('leaveGroupsCompleteCount');
        sessionStorage.removeItem('leaveGroupsTotalCount');

        setTimeout(() => {
            showSystemAlert(
                ts('leaveGroups.successMessage', {
                    successCount,
                    totalCount,
                }),
                'success',
            );
        }, 500);
    }
}

export async function init() {
    const settings = await chrome.storage.local.get('bulkLeaveGroupsEnabled');
    if (settings.bulkLeaveGroupsEnabled === false) {
        return;
    }

    if (init._run) return;
    init._run = true;

    showSuccessAlertIfNeeded();

    fetchUserGroups();

    document.addEventListener('click', onDocumentClickCapture, true);

    observeElement(
        '.groups-list-items-container',
        (container) => {
            injectToolbar(container);
        },
        {
            multiple: true,
            onRemove: () => {
                cleanup();
            },
        },
    );

    observeElement(
        'a.groups-list-item',
        (card) => {
            if (card.closest('.pending-join-requests')) return;
            if (enableBulkLeave) {
                setCardInteractivity(card, true);
            }
        },
        {
            multiple: true,
            onRemove: (card) => {
                removeSelectionDot(card);
            },
        },
    );
}
