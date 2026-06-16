import { createOverlay } from './overlay.js';
import { parseMarkdown } from '../utils/markdown.js';
import DOMPurify from 'dompurify';

let activePopup = null;

function getTargetClass(variant = 'primary') {
    switch (variant) {
        case 'secondary':
            return 'rovalra-popup-button rovalra-popup-button-secondary';
        case 'risky':
            return 'rovalra-popup-button rovalra-popup-button-risky';
        case 'primary':
        default:
            return 'rovalra-popup-button rovalra-popup-button-primary';
    }
}

export function createPopup({
    title = '(Empty)',
    message = '',
    buttons = [],
    maxWidth = '400px',
    onClose = async () => {},
    classList = undefined,
    preventBackdropClose = false
}) {
    if (activePopup) {
        activePopup.close();
        activePopup = null;
    }

    const top = document.createElement('div');
    top.className = "rovalra-popup-content";
    if (classList)
        top.classList.add(...classList);
    
    const msg = document.createElement('div');
    msg.className = 'rovalra-popup-message';
    msg.innerHTML = parseMarkdown(message);  // Verified

    top.appendChild(msg);

    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'rovalra-popup-button-container';

    buttons.forEach((btnConfig) => {
        const btn = document.createElement('button');
        btn.textContent = btnConfig.text || '(Empty)';
        btn.className = getTargetClass(btnConfig.type);
        if (btnConfig.classList)
            btn.classList.add(...(btnConfig.classList ?? []));

        btn.onclick = (e) => {
            e.stopPropagation();

            if (typeof btnConfig.onClick === 'function')
                btnConfig.onClick();

            if (btnConfig.close !== false)
                hidePopup();
        }

        buttonContainer.appendChild(btn);
    });

    if (buttons.length > 0)
        top.appendChild(buttonContainer);

    const { overlay, close } = createOverlay({
        title,
        bodyContent: top,
        showLogo: false,
        maxWidth,
        preventBackdropClose: preventBackdropClose,
        onClose: () => {
            activePopup = null;
            onClose();
        },
    });

    activePopup = {
        overlay: overlay,
        close: close,
        html: {
            msg: msg,
            buttonContainer: buttonContainer
        }
    }

    return activePopup;
}

export function hidePopup() {
    if (!activePopup) return;

    const popup = activePopup;
    activePopup = null;
    popup.close();
}

//document.addEventListener('DOMContentLoaded', () => {
//    createPopup({
//        buttons: [
//            {
//
//            }
//        ]
//    })
//});
