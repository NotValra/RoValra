import { addTooltip } from '../tooltip.js';

let isCssInjected = false;

function injectPillCss() {
    if (isCssInjected) return;
    isCssInjected = true;

    const style = document.createElement('style');
    style.id = 'rovalra-pill-style';
    style.textContent = `
        .rovalra-pill {
            display: inline-block;
            padding: 4px 10px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 600;
            line-height: 1.5;
            cursor: default;
            align-self: flex-start; 
        }

        .rovalra-pill.experimental {
            background-color: rgb(2, 170, 81);
            color: var(--rovalra-main-text-color);
        }

        .rovalra-pill.beta {
            background-color: rgb(51, 95, 255);
            color: var(--rovalra-main-text-color);
        }

        .rovalra-pill.deprecated {
            background-color: rgb(220, 53, 69);
            color: #FFFFFF;
        }
    `;
    document.head.appendChild(style);
}

export function createPill(text, tooltipText, type) {
    injectPillCss();
    const pill = document.createElement('div');
    pill.className = `rovalra-pill ${type}`;
    pill.textContent = text;
    addTooltip(pill, tooltipText, { position: 'top' });
    return pill;
}