import { addTooltip } from '../tooltip.js';

export function createPill(text, tooltipText, options = {}) {
    if (typeof options === 'string') {
        options = { type: options };
    }

    const { type, isButton = false } = options;

    if (!type) {
        const pill = document.createElement('div');
        const baseClasses = 'relative clip flex justify-center items-center radius-circle stroke-none padding-left-medium padding-right-medium height-800 text-label-medium bg-shift-300 content-action-utility';
        const buttonClasses = 'group/interactable focus-visible:outline-focus disabled:outline-none cursor-pointer';
        pill.className = isButton ? `${baseClasses} ${buttonClasses}` : baseClasses;

        if (isButton) {
            const presentation = document.createElement('div');
            presentation.setAttribute('role', 'presentation');
            presentation.className = 'absolute inset-[0] transition-colors group-hover/interactable:bg-[var(--color-state-hover)] group-active/interactable:bg-[var(--color-state-press)] group-disabled/interactable:bg-none';
            pill.appendChild(presentation);
        }

        const content = document.createElement('span');
        content.className = 'padding-y-xsmall text-no-wrap text-truncate-end';
        content.textContent = text;

        pill.appendChild(content);

        if (tooltipText) {
            addTooltip(pill, tooltipText, { position: 'top' });
        }
        return pill;
    }

    const pill = document.createElement('div');
    pill.className = `rovalra-pill ${type}`;
    pill.textContent = text;
    addTooltip(pill, tooltipText, { position: 'top' });
    return pill;
}