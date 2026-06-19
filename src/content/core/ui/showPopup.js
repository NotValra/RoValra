import { createOverlay } from './overlay.js';
import { parseMarkdown } from '../utils/markdown.js';
import { getAssets } from '../assets.js';
import { settings } from '../settings/getSettings.js';

let activePopup = null;
const popupGlobalSettings = {};

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
    messageType = 'md',
    buttons = [],
    onClose = async () => {},
    classList = undefined,
    preventBackdropClose = false,
    customLogo = undefined
}) {
    if (popupGlobalSettings.popupTestDisablePopups) {
        console.warn(`createPopup: popup supressed.`);
        return;
    }

    if (activePopup) {
        activePopup.close();
        activePopup = null;
    }

    if (Array.isArray(message))
        message = '&emsp;' + message.join('\n\n<br>&emsp;');

    const top = document.createElement('div');
    top.className = "rovalra-popup-content";
    if (classList)
        top.classList.add(...classList);

    const logoImg = document.createElement('img');
    
    if (customLogo) {
        logoImg.src = customLogo;
    } else {
        try {
            logoImg.src = getAssets().rovalraIcon;
        } catch (e) {
            console.error(`createPopup: Failed to retrieve asset \`rovalraIcon\`.`, e);
        }
    }

    logoImg.classList.add("rovalra-popup-rvl-logo");
    top.appendChild(logoImg);

    const titleEl = document.createElement('h1');
    titleEl.textContent = title;
    titleEl.className = 'rovalra-popup-message-title';
    top.appendChild(titleEl);
    
    const msg = document.createElement('div');
    msg.className = 'rovalra-popup-message';
    if (messageType === 'md')
        msg.innerHTML = parseMarkdown(message);  // Verified
    else if (messageType === 'html')
        msg.innerHTML = message; // Verified
    else
        msg.textContent = "(Empty)";

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
        title: 'RoValra',
        bodyContent: top,
        showLogo: false,
        maxWidth: '20%',
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

export async function init() {
    popupGlobalSettings.popupTestDisablePopups = await settings.popupTestDisablePopups;
}

document.addEventListener('DOMContentLoaded', async () => {
    if (await settings.popupTestExample) {
        createPopup({
            title: "I want cookies",
            message: ["Hi there!", "'RoValra - Roblox Improved' is a super cool extension.<br>\n\n---", "I'm gonna steal your cookies now"],
            buttons: [
                {
                    text: 'Have your cookies stolen'
                },
                {
                    text: 'Disable Extension',
                    type: 'secondary'
                },
                {
                    text: 'Uninstall Extension',
                    type: 'risky',
                    onClick: () => alert('Rude.')
                }
            ]
        });
    }
});
