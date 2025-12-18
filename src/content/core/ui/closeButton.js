// Creates a close button in Robloxs close button style!!! 
export function createCloseButton({ onClick } = {}) {
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', 'Close');
    closeButton.className = 'foundation-web-close-affordance flex stroke-none bg-none cursor-pointer relative clip group/interactable focus-visible:outline-focus disabled:outline-none bg-over-media-100 padding-medium radius-circle';

    const closeButtonHoverEffect = document.createElement('div');
    closeButtonHoverEffect.setAttribute('role', 'presentation');
    closeButtonHoverEffect.className = 'absolute inset-[0] transition-colors group-hover/interactable:bg-[var(--color-state-hover)] group-active/interactable:bg-[var(--color-state-press)] group-disabled/interactable:bg-none';

    const closeButtonIcon = document.createElement('span');
    closeButtonIcon.setAttribute('role', 'presentation');
    closeButtonIcon.className = 'grow-0 shrink-0 basis-auto icon icon-regular-x size-[var(--icon-size-large)]';

    closeButton.append(closeButtonHoverEffect, closeButtonIcon);
    if (onClick) closeButton.addEventListener('click', onClick);
    return closeButton;
}