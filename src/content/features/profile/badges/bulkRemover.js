import { observeElement } from '../../../core/observer.js';
import { callRobloxApi } from '../../../core/api.js';
import { createButton } from '../../../core/ui/buttons.js';
import { createRadioButton } from '../../../core/ui/general/radio.js';
import { createOverlay } from '../../../core/ui/overlay.js';
import { getAuthenticatedUserId } from '../../../core/user.js';
import { showSystemAlert } from '../../../core/ui/roblox/alert.js';
import { ts } from '../../../core/locale/i18n.js';
import {
    getBadgeIdFromUrl,
    getUserIdFromInventoryUrl,
} from '../../../core/idExtractor.js';

const selectedBadges = new Set();
let bulkMode = false;
let actionButton = null;
let toggleButton = null;

function isBadgeInventoryPage() {
    return /\/users\/(?:\d+\/)?inventory\/?$/.test(location.pathname) && location.hash === '#!/badges';
}

function getBadgeId(card) {
    const href = card.querySelector('a[href*="/badges/"]')?.href || '';
    return getBadgeIdFromUrl(href);
}

function updateActionButton() {
    if (!actionButton) return;
    actionButton.textContent = ts('bulkBadgeRemover.deleteCount', {
        count: selectedBadges.size,
    });
    actionButton.style.display = selectedBadges.size ? 'inline-flex' : 'none';
}

function restoreCard(card) {
    card.style.outline = '';
    card.style.cursor = '';
    card.style.userSelect = '';
    card.querySelectorAll('a, button, img, span').forEach((element) => {
        element.style.pointerEvents = '';
    });
    card.removeEventListener('click', handleCardClick);
}

function setCardMode(card) {
    const radio = card.querySelector('.rovalra-badge-radio');
    if (!radio) return;
    radio.style.display = bulkMode ? 'inline-flex' : 'none';
    if (bulkMode) {
        card.style.cursor = 'pointer';
        card.style.userSelect = 'none';
        card.querySelectorAll('a, button, img, span').forEach((element) => {
            element.style.pointerEvents = 'none';
        });
        card.addEventListener('click', handleCardClick);
    } else {
        restoreCard(card);
    }
    radio.setChecked(selectedBadges.has(getBadgeId(card)));
}

function addSelectionControl(card) {
    if (card.querySelector('.rovalra-badge-radio')) return;
    const badgeId = getBadgeId(card);
    if (!badgeId) return;
    const radio = createRadioButton({
        onChange: (checked) => {
            if (checked) selectedBadges.add(badgeId);
            else selectedBadges.delete(badgeId);
            card.style.outline = checked ? '2px solid var(--rovalra-playbutton-color)' : '';
            updateActionButton();
        },
    });
    radio.className = 'rovalra-badge-radio';
    radio.style.display = 'none';
    radio.style.position = 'absolute';
    radio.style.top = '8px';
    radio.style.left = '8px';
    radio.style.zIndex = '2';
    card.style.position = 'relative';
    card.appendChild(radio);
    setCardMode(card);
}

function handleCardClick(event) {
    if (!bulkMode) return;
    const radio = event.currentTarget.querySelector('.rovalra-badge-radio');
    if (radio && !event.target.closest('.rovalra-badge-radio')) radio.click();
}

async function deleteBadge(badgeId) {
    try {
        const response = await callRobloxApi({
            subdomain: 'badges',
            endpoint: `/v1/user/badges/${badgeId}`,
            method: 'DELETE',
        });
        return response.ok;
    } catch {
        return false;
    }
}

function showFinalConfirmation(ids) {
    const body = document.createElement('p');
    body.textContent = ts('bulkBadgeRemover.finalDescription', { count: ids.length });
    const cancel = createButton(ts('bulkBadgeRemover.cancel'), 'secondary');
    const confirm = createButton(ts('bulkBadgeRemover.deleteCount', { count: ids.length }), 'alert');
    const overlay = createOverlay({
        title: ts('bulkBadgeRemover.finalTitle'),
        bodyContent: body,
        actions: [cancel, confirm],
        showLogo: true,
    });
    cancel.addEventListener('click', () => overlay.close());
    confirm.addEventListener('click', async () => {
        confirm.disabled = true;
        cancel.disabled = true;
        const progressLabel = document.createElement('p');
        progressLabel.style.marginTop = '20px';
        progressLabel.style.textAlign = 'center';
        progressLabel.textContent = ts('bulkBadgeRemover.deletingProgress', { current: 0, total: ids.length });
        body.appendChild(progressLabel);
        let successCount = 0;
        for (let index = 0; index < ids.length; index++) {
            const badgeId = ids[index];
            if (await deleteBadge(badgeId)) {
                successCount++;
                document.querySelector(`.item-card-container:has(a[href*="/badges/${badgeId}"])`)?.remove();
                selectedBadges.delete(badgeId);
            }
            progressLabel.textContent = ts('bulkBadgeRemover.deletingProgress', { current: index + 1, total: ids.length });
        }
        overlay.close();
        updateActionButton();
        showSystemAlert(ts('bulkBadgeRemover.success', { successCount, totalCount: ids.length }), successCount ? 'success' : 'error');
    });
}

async function confirmDeletion() {
    if (!selectedBadges.size) return;
    const ids = [...selectedBadges];
    const body = document.createElement('div');
    const description = document.createElement('p');
    description.textContent = ids.length === 1
        ? ts('bulkBadgeRemover.descriptionSingle')
        : ts('bulkBadgeRemover.descriptionPlural', { count: ids.length });
    description.style.marginBottom = '16px';
    body.appendChild(description);
    const badgeList = document.createElement('div');
    badgeList.style.display = 'grid';
    badgeList.style.gridTemplateColumns = '1fr 1fr';
    badgeList.style.gap = '8px';
    badgeList.style.maxHeight = '320px';
    badgeList.style.overflowY = 'auto';
    ids.forEach((badgeId) => {
        const card = document.querySelector(`.item-card-container:has(a[href*="/badges/${badgeId}"])`);
        const item = document.createElement('div');
        item.style.display = 'flex';
        item.style.alignItems = 'center';
        item.style.gap = '8px';
        item.style.padding = '6px';
        item.style.minWidth = '0';
        item.style.borderRadius = '6px';
        item.style.backgroundColor = 'var(--rovalra-container-background-color)';
        const image = document.createElement('img');
        image.src = card?.querySelector('img')?.src || '';
        image.alt = '';
        image.style.width = '48px';
        image.style.height = '48px';
        image.style.objectFit = 'cover';
        image.style.borderRadius = '4px';
        image.style.flexShrink = '0';
        item.appendChild(image);
        const name = document.createElement('span');
        name.textContent = card?.querySelector('a[href*="/badges/"]')?.textContent?.trim() || `Badge ${badgeId}`;
        name.style.color = 'var(--rovalra-main-text-color)';
        name.style.fontSize = '14px';
        name.style.fontWeight = '500';
        name.style.lineHeight = '1.2';
        name.style.minWidth = '0';
        name.style.overflow = 'hidden';
        name.style.textOverflow = 'ellipsis';
        name.style.whiteSpace = 'nowrap';
        item.appendChild(name);
        badgeList.appendChild(item);
    });
    body.appendChild(badgeList);
    const cancel = createButton(ts('bulkBadgeRemover.cancel'), 'secondary');
    const confirm = createButton(ts('bulkBadgeRemover.deleteCount', { count: ids.length }), 'alert');
    const overlay = createOverlay({
        title: ts('bulkBadgeRemover.confirmTitle'),
        bodyContent: body,
        actions: [cancel, confirm],
        showLogo: true,
    });
    cancel.addEventListener('click', () => overlay.close());
    confirm.addEventListener('click', async () => {
        overlay.close();
        showFinalConfirmation(ids);
    });
}

async function injectActions(header) {
    const userId = await getAuthenticatedUserId();
    const pageUserId = getUserIdFromInventoryUrl() || String(userId);
    if (!isBadgeInventoryPage() || String(userId) !== pageUserId) {
        cleanup();
        return;
    }
    if (header.querySelector('.rovalra-bulk-badge-toggle')) return;
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    toggleButton = createButton(ts('bulkBadgeRemover.bulk'), 'secondary', {
        onClick: () => {
            bulkMode = !bulkMode;
            if (!bulkMode) selectedBadges.clear();
            document.querySelectorAll('#assetsItems .item-card-container').forEach(setCardMode);
            toggleButton.textContent = ts(bulkMode ? 'bulkBadgeRemover.exit' : 'bulkBadgeRemover.bulk');
            updateActionButton();
        },
    });
    toggleButton.classList.add('rovalra-bulk-badge-toggle');
    toggleButton.style.marginLeft = '12px';
    actionButton = createButton(ts('bulkBadgeRemover.delete'), 'alert', { onClick: confirmDeletion });
    actionButton.style.display = 'none';
    actionButton.style.marginLeft = '8px';
    header.append(toggleButton, actionButton);
}

function cleanup() {
    bulkMode = false;
    selectedBadges.clear();
    toggleButton?.remove();
    actionButton?.remove();
    toggleButton = null;
    actionButton = null;
    document.querySelectorAll('.rovalra-badge-radio').forEach((radio) => radio.remove());
    document.querySelectorAll('#assetsItems .item-card-container').forEach(restoreCard);
}

export async function init() {
    const settings = await chrome.storage.local.get('bulkBadgeRemoverEnabled');
    if (!settings.bulkBadgeRemoverEnabled) return;
    const refresh = async () => {
        const userId = await getAuthenticatedUserId();
        const pageUserId = getUserIdFromInventoryUrl() || String(userId);
        if (!isBadgeInventoryPage() || String(userId) !== pageUserId) {
            cleanup();
            return;
        }
        const title = document.querySelector('#inventory-container .assets-explorer-title');
        if (title) injectActions(title);
    };
    refresh();
    observeElement('#inventory-container .assets-explorer-title', injectActions, { multiple: true });
    observeElement('#assetsItems .item-card-container', addSelectionControl, { multiple: true });
    let lastUrl = location.href;
    observeElement('body', () => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            refresh();
        }
    }, { multiple: false });
    window.addEventListener('popstate', refresh);
    window.addEventListener('hashchange', refresh);
    document.addEventListener('click', (event) => {
        if (event.target.closest('#vertical-menu a, .menu-secondary-option')) {
            setTimeout(refresh, 0);
        }
    });
}
