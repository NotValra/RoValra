import { getAuthenticatedUserId } from '../user.js';

const PREVIEW_STORAGE_KEY = 'rovalra:customCosmeticPreview';
const PREVIEW_MAX_AGE_MS = 60 * 1000;
const MAX_FILE_SIZE = 2 * 1024 * 1024;

let activePreview;

function pickImageFile() {
    return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = () => resolve(input.files?.[0] || null);
        input.click();
    });
}

function readAsDataUri(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

export async function importCustomCosmetic(kind) {
    const userId = await getAuthenticatedUserId().catch(() => null);
    if (!userId) {
        alert('You need to be logged in to preview a custom frame or border.');
        return;
    }

    const file = await pickImageFile();
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        alert('That file is not an image.');
        return;
    }
    if (file.size > MAX_FILE_SIZE) {
        alert('That image is too large. The maximum is 2MB.');
        return;
    }

    try {
        const dataUri = await readAsDataUri(file);
        sessionStorage.setItem(
            PREVIEW_STORAGE_KEY,
            JSON.stringify({
                kind,
                dataUri,
                label: file.name,
                userId: String(userId),
                returnUrl: `${window.location.pathname}${window.location.search}`,
                createdAt: Date.now(),
            }),
        );
    } catch (error) {
        console.error('RoValra: Failed to import custom cosmetic', error);
        alert('Could not load that image.');
        return;
    }

    window.location.href = `/users/${encodeURIComponent(userId)}/profile`;
}

function toObjectUrl(dataUri) {
    try {
        const [header, base64] = dataUri.split(',', 2);
        const mimeType = header.slice('data:'.length).split(';')[0];
        const bytes = Uint8Array.from(atob(base64), (char) =>
            char.charCodeAt(0),
        );
        return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
    } catch {
        return dataUri;
    }
}

function showPreviewBar(preview) {
    const bar = document.createElement('div');
    bar.className = 'rovalra-frame-preview-bar';

    const text = document.createElement('span');
    text.className = 'rovalra-frame-preview-bar-text';
    text.textContent = `Previewing custom ${preview.kind}: ${preview.label}. Only you can see this, and it goes away when you leave or reload.`;

    const backButton = document.createElement('button');
    backButton.type = 'button';
    backButton.className = 'btn-primary-md rovalra-frame-preview-bar-button';
    backButton.textContent = 'Back to settings';
    backButton.onclick = () => {
        window.location.href = preview.returnUrl;
    };

    bar.append(text, backButton);
    document.body.appendChild(bar);
}

function consumePreview() {
    if (!window.location.pathname.startsWith('/users/')) return null;

    let preview = null;
    try {
        preview = JSON.parse(sessionStorage.getItem(PREVIEW_STORAGE_KEY));
        sessionStorage.removeItem(PREVIEW_STORAGE_KEY);
    } catch {
        return null;
    }

    if (!preview?.dataUri?.startsWith?.('data:image/')) return null;
    if (preview.kind !== 'frame' && preview.kind !== 'border') return null;
    if (Date.now() - (preview.createdAt || 0) > PREVIEW_MAX_AGE_MS) return null;

    const result = {
        kind: preview.kind,
        link: toObjectUrl(preview.dataUri),
        label: String(preview.label || ''),
        userId: String(preview.userId),
        returnUrl:
            typeof preview.returnUrl === 'string' &&
            preview.returnUrl.startsWith('/')
                ? preview.returnUrl
                : '/my/account',
    };
    showPreviewBar(result);
    return result;
}

function getActivePreview() {
    if (activePreview === undefined) activePreview = consumePreview();
    return activePreview;
}

function getPreviewLink(userId, kind) {
    const preview = getActivePreview();
    if (!preview || preview.kind !== kind) return null;
    if (!userId || String(userId) !== preview.userId) return null;

    return preview.link;
}

export function getCustomFrameTestLink(userId) {
    return getPreviewLink(userId, 'frame');
}

export function getCustomBorderTestLink(userId) {
    return getPreviewLink(userId, 'border');
}
