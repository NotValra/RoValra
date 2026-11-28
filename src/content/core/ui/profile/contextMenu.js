import { observeElement } from '../../observer.js';

const menuCallbacks = [];
const triggerCallbacks = [];

export function registerProfileContextMenuAction(
    menuCallback,
    triggerCallback,
) {
    if (menuCallback) menuCallbacks.push(menuCallback);
    if (triggerCallback) triggerCallbacks.push(triggerCallback);
}

export function createContextMenuButton(text, isPending = false) {
    const button = document.createElement('button');
    button.type = 'button';
    button.role = 'menuitem';
    button.className = `relative clip group/interactable focus-visible:outline-focus foundation-web-menu-item flex items-center content-default text-truncate-split focus-visible:hover:outline-none stroke-none bg-none text-align-x-left width-full text-body-medium padding-x-medium padding-y-small gap-x-medium radius-medium ${isPending ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`;

    if (isPending) {
        button.setAttribute('aria-disabled', 'true');
    }

    const presentationDiv = document.createElement('div');
    presentationDiv.setAttribute('role', 'presentation');
    presentationDiv.className =
        'absolute inset-[0] transition-colors group-hover/interactable:bg-[var(--color-state-hover)] group-active/interactable:bg-[var(--color-state-press)]';

    const textDiv = document.createElement('div');
    textDiv.className = 'grow-1 text-truncate-split flex flex-col gap-y-xsmall';

    const titleSpan = document.createElement('span');
    titleSpan.className =
        'foundation-web-menu-item-title text-no-wrap text-truncate-split content-emphasis';
    titleSpan.textContent = text;

    textDiv.appendChild(titleSpan);
    button.append(presentationDiv, textDiv);

    return { button, titleSpan };
}

observeElement(
    '#user-profile-header-contextual-menu-button',
    (button) => {
        triggerCallbacks.forEach((cb) => cb(button));

        if (button.dataset.rovalraContextMenuListener) return;
        button.dataset.rovalraContextMenuListener = 'true';

        button.addEventListener('click', () => {
            observeElement(
                'div[data-radix-popper-content-wrapper] div[role="menu"]:not(.nav-foundation-menu)',
                (menu) => menuCallbacks.forEach((cb) => cb(menu)),
                { once: true },
            );
        });
    },
    { multiple: true },
);
