import { addTooltip } from '../tooltip.js';

export function createPill(text, tooltipText, options = {}) {
    if (typeof options === 'string') {
        options = { type: options };
    }

    const { type, isButton = false, iconUrl, size } = options;
    const isSmall = size === 'small';

    if (!type) {
        const pill = document.createElement('div');

        const heightClass = isSmall ? 'padding-y-xsmall' : 'height-800';
        const textClass = isSmall ? 'text-caption-medium' : 'text-label-medium';
        const bgClass = isSmall ? 'bg-surface-300' : 'bg-shift-300';
        const utilityClass = isSmall ? '' : 'content-action-utility';

        const baseClasses = `relative clip flex justify-center items-center radius-circle stroke-none padding-left-medium padding-right-medium ${heightClass} ${textClass} ${bgClass} ${utilityClass}`;
        const buttonClasses =
            'group/interactable focus-visible:outline-focus disabled:outline-none cursor-pointer';
        pill.className = isButton
            ? `${baseClasses} ${buttonClasses}`
            : baseClasses;

        if (isButton) {
            const presentation = document.createElement('div');
            presentation.setAttribute('role', 'presentation');
            presentation.className =
                'absolute inset-[0] transition-colors group-hover/interactable:bg-[var(--color-state-hover)] group-active/interactable:bg-[var(--color-state-press)] group-disabled/interactable:bg-none';
            pill.appendChild(presentation);
        }
        if (iconUrl) {
            const img = document.createElement('img');
            img.src = iconUrl;
            Object.assign(img.style, {
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                marginRight: '6px',
                objectFit: 'cover',
                position: 'relative',
                zIndex: '1',
            });
            pill.appendChild(img);
        }
        const content = document.createElement('span');
        content.className = `${isSmall ? '' : 'padding-y-xsmall'} text-no-wrap text-truncate-end`;
        if (typeof text === 'string' || typeof text === 'number') {
            content.textContent = text;
        } else if (text instanceof Node) {
            content.appendChild(text);
        }
        if (iconUrl) {
            content.style.position = 'relative';
            content.style.zIndex = '1';
        }
        pill.appendChild(content);

        if (tooltipText) {
            addTooltip(pill, tooltipText, { position: 'top' });
        }
        return pill;
    }

    const pill = document.createElement('div');
    pill.className = `rovalra-pill ${type}`;
    if (typeof text === 'string' || typeof text === 'number') {
        pill.textContent = text;
    } else if (text instanceof Node) {
        pill.appendChild(text);
    }
    addTooltip(pill, tooltipText, { position: 'top' });
    return pill;
}
