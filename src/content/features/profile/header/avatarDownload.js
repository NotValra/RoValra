import { observeElement } from '../../../core/observer.js';
import { createOverlay } from '../../../core/ui/overlay.js';
import { createSquareButton } from '../../../core/ui/profile/header/squarebutton.js';
import { fetchThumbnails } from '../../../core/thumbnail/thumbnails.js';
import { getUserIdFromUrl } from '../../../core/idExtractor.js';
import { getUsernameFromPageData } from '../../../core/utils.js';
import { showSystemAlert } from '../../../core/ui/roblox/alert.js';
import { ts } from '../../../core/locale/i18n.js';
import { settings } from '../../../core/settings/getSettings.js';

async function getThumbnailUrl(userId, type, size) {
    const map = await fetchThumbnails([{ id: userId }], type, size);
    let entry = map.get(Number(userId));
    if (entry && entry.finalUpdate) {
        entry = (await entry.finalUpdate) || entry;
    }
    if (entry && entry.state === 'Completed' && entry.imageUrl) {
        return entry.imageUrl;
    }
    return null;
}

async function downloadThumbnail(userId, username, type, size, button) {
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = ts('avatarDownload.downloading');

    try {
        const imageUrl = await getThumbnailUrl(userId, type, size);
        if (!imageUrl) {
            showSystemAlert(ts('avatarDownload.failed'), 'warning');
            return;
        }

        const response = await fetch(imageUrl); // Verified
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();

        let suffix = 'avatar';
        if (type === 'AvatarHeadshot') suffix = 'portrait';
        else if (type === 'AvatarBust') suffix = 'bust';

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${username || userId}_${suffix}_${size}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (err) {
        console.error('RoValra AvatarDownload: download failed', err);
        showSystemAlert(ts('avatarDownload.failed'), 'warning');
    } finally {
        button.disabled = false;
        button.textContent = originalText;
    }
}

function showDownloadOverlay(userId, username) {
    let selectedSize = '420x420';

    const body = document.createElement('div');
    body.style.cssText =
        'display: flex; flex-direction: column; gap: 16px; padding: 4px 0 12px;';

    const sizeLabel = document.createElement('span');
    sizeLabel.className = 'text-label-medium';
    sizeLabel.textContent = ts('avatarDownload.size');
    body.appendChild(sizeLabel);

    const sizeRow = document.createElement('div');
    sizeRow.style.cssText = 'display: flex; gap: 8px; flex-wrap: wrap;';

    const sizeButtons = [];
    const sizeRestricted = new Set(['AvatarHeadshot', 'AvatarBust']);
    let portraitButton;
    let bustButton;

    function paintSizeButton(btn, isSelected) {
        btn.style.backgroundColor = isSelected
            ? 'var(--rovalra-playbutton-color)'
            : '';
        btn.style.color = isSelected ? '#ffffff' : '';
        btn.style.fontWeight = isSelected ? '600' : '';
    }

    function paintDisabled(btn, isDisabled) {
        btn.disabled = isDisabled;
        btn.style.opacity = isDisabled ? '0.5' : '';
        btn.style.cursor = isDisabled ? 'not-allowed' : '';
    }

    function refreshActionAvailability() {
        const restricted = selectedSize === '720x720';
        if (portraitButton) paintDisabled(portraitButton, restricted);
        if (bustButton) paintDisabled(bustButton, restricted);
    }

    ['150x150', '420x420', '720x720'].forEach((size) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className =
            'btn-control-md radius-circle padding-left-medium padding-right-medium';
        btn.textContent = size;
        paintSizeButton(btn, size === selectedSize);

        btn.addEventListener('click', () => {
            selectedSize = size;
            sizeButtons.forEach((b) =>
                paintSizeButton(b, b.textContent === size),
            );
            refreshActionAvailability();
        });

        sizeButtons.push(btn);
        sizeRow.appendChild(btn);
    });
    body.appendChild(sizeRow);

    const actionRow = document.createElement('div');
    actionRow.style.cssText =
        'display: flex; gap: 12px; flex-wrap: wrap; margin-top: 4px;';

    function makeActionButton(labelKey, type) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-cta-md';
        btn.style.flex = '1 1 auto';
        btn.textContent = ts(labelKey);
        btn.addEventListener('click', () => {
            if (sizeRestricted.has(type) && selectedSize === '720x720') return;
            downloadThumbnail(userId, username, type, selectedSize, btn);
        });
        return btn;
    }

    portraitButton = makeActionButton(
        'avatarDownload.downloadPortrait',
        'AvatarHeadshot',
    );
    bustButton = makeActionButton('avatarDownload.downloadBust', 'AvatarBust');
    const avatarButton = makeActionButton(
        'avatarDownload.downloadAvatar',
        'Avatar',
    );

    actionRow.appendChild(portraitButton);
    actionRow.appendChild(bustButton);
    actionRow.appendChild(avatarButton);
    body.appendChild(actionRow);

    refreshActionAvailability();

    createOverlay({
        title: ts('avatarDownload.title'),
        bodyContent: body,
        maxWidth: '440px',
        maxHeight: '360px',
    });
}

async function addDownloadButton(toggleContainer) {
    const buttonIdentifier = 'rovalra-avatar-download-btn';
    if (toggleContainer.querySelector(`.${buttonIdentifier}`)) return;

    const button = createSquareButton({
        content: ts('avatarDownload.button'),
        onClick: async (event) => {
            event.preventDefault();
            const userId = getUserIdFromUrl();
            if (!userId) return;
            const username = await getUsernameFromPageData();
            showDownloadOverlay(userId, username);
        },
        width: 'auto',
        height: 'height-1200',
        paddingX: 'padding-x-medium',
        disableTextTruncation: true,
    });
    button.classList.replace('text-label-medium', 'text-label-large');
    button.classList.add(buttonIdentifier);

    toggleContainer.style.display = 'flex';
    toggleContainer.style.gap = '10px';
    toggleContainer.prepend(button);
}

export async function init() {
    if (!(await settings.avatarDownloadEnabled)) return;
    observeElement('.avatar-toggle-button', addDownloadButton, {
        multiple: true,
    });
}
