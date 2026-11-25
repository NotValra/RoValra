import DOMPurify from 'dompurify';
import { ts } from '../../locale/i18n.js';

const CONTAINER_ID = 'rovalra-download-dialog-container';
const MOBILE_QR_CODE_URL = 'https://images.rbxcdn.com/79852c254bf43f36.webp';

export function startClientDownload() {
    window.open(
        `https://www.roblox.com/download/client?_=${Date.now()}`,
        '_blank',
    );
}

function getDialogHtml() {
    return `<div role="dialog" aria-labelledby="rovalra-download-dialog-title" data-state="open" class="relative radius-large bg-surface-100 stroke-muted stroke-standard foundation-web-dialog-content shadow-transient-high install-dialog" data-size="Large" tabindex="-1" style="pointer-events: auto;"><div class="absolute foundation-web-dialog-close-container"><button type="button" class="foundation-web-close-affordance flex stroke-none bg-none cursor-pointer relative clip group/interactable focus-visible:outline-focus disabled:outline-none bg-over-media-100 padding-medium radius-circle" aria-label="Close"><div role="presentation" class="absolute inset-[0] transition-colors group-hover/interactable:bg-[var(--color-state-hover)] group-active/interactable:bg-[var(--color-state-press)] group-disabled/interactable:bg-none"></div><span role="presentation" class="grow-0 shrink-0 basis-auto icon icon-regular-x size-[var(--icon-size-large)]"></span></button></div><div class="padding-x-xlarge padding-top-xlarge padding-bottom-xlarge content-default"><div class="flex flex-col gap-xlarge padding-xlarge"><div class="flex flex-col gap-xsmall"><h2 id="rovalra-download-dialog-title" class="text-heading-medium content-emphasis padding-none">${ts('revertLogo.thanksDownloading')}</h2><p class="text-body-large">${ts('revertLogo.downloadInstructions')}</p></div><div></div> <div class="flex gap-xxlarge"><section class="flex flex-col gap-large grow basis-0"><h3 class="text-title-large content-emphasis padding-none">${ts('revertLogo.installInstructions')}</h3><ol class="download-instructions-list flex flex-col gap-xlarge margin-none padding-left-large text-body-medium"><li class="padding-left-medium">${ts('revertLogo.step1')}</li><li class="padding-left-medium">${ts('revertLogo.step2')}</li><li class="padding-left-medium">${ts('revertLogo.step3')}</li><li class="padding-left-medium">${ts('revertLogo.step4')}</li></ol></section><div></div> <div class="stroke-standard stroke-default"></div><div></div> <section class="flex flex-col grow basis-0 gap-xxlarge"><div class="flex flex-col gap-small"><h3 class="text-label-large content-emphasis padding-none">${ts('revertLogo.mobileApp')}</h3><p class="text-body-medium">${ts('revertLogo.scanCode')}</p></div><div class="flex grow justify-center items-center bg-shift-100 radius-medium padding-x-large"><div class="radius-medium padding-small bg-[white]"><img class="size-2100" src="${MOBILE_QR_CODE_URL}" alt=""></div></div></section></div></div></div></div>`;
}

export function showDownloadDialog({ onClose, onJoin } = {}) {
    document.getElementById(CONTAINER_ID)?.remove();

    startClientDownload();

    const container = document.createElement('div');
    container.id = CONTAINER_ID;
    container.className = 'rovalra-download-dialog-container';
    container.innerHTML = DOMPurify.sanitize(getDialogHtml(), {
        ADD_ATTR: ['id'],
    });
    document.body.appendChild(container);

    const remove = () => container.remove();

    container
        .querySelector('button[aria-label="Close"]')
        ?.addEventListener('click', () => {
            remove();
            onClose?.();
        });

    container
        .querySelector('#download-join-experience')
        ?.addEventListener('click', (e) => {
            e.preventDefault();
            remove();
            onJoin?.();
        });

    container
        .querySelector('#rovalra-restart-download')
        ?.addEventListener('click', (e) => {
            e.preventDefault();
            startClientDownload();
        });

    return remove;
}
