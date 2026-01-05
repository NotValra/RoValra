import { addTooltip } from '../tooltip.js';

export function createPill(text, tooltipText, type) {
    const pill = document.createElement('div');
    pill.className = `rovalra-pill ${type}`;
    pill.textContent = text;
    addTooltip(pill, tooltipText, { position: 'top' });
    return pill;
}