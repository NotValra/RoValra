// Creates roblox overlay
import { createCloseButton } from './closeButton.js';
import { createAssetIcon } from './general/toast.js';
import DOMPurify from 'dompurify';

function injectOverlayCss() {
    const styleId = 'rovalra-global-overlay-style';
    if (document.getElementById(styleId)) return;

    const css = `
        :root {
            --rovalra-overlay-bg-primary: #1B1D1F; --rovalra-overlay-bg-secondary: #2F353A; --rovalra-overlay-text-primary: #FFFFFF;
            --rovalra-overlay-text-secondary: #b8b8b8; --rovalra-overlay-border-primary: rgba(255, 255, 255, 0.1);
            --rovalra-overlay-shadow: rgba(0, 0, 0, 0.5);
        }
        body:not(.dark-theme) { 
            --rovalra-overlay-bg-primary: #FFFFFF; --rovalra-overlay-bg-secondary: #F2F4F5; --rovalra-overlay-text-primary: #191B1D;
            --rovalra-overlay-text-secondary: #606264; --rovalra-overlay-border-primary: #D9DADB; --rovalra-overlay-shadow: rgba(0, 0, 0, 0.15);
        }
        .rovalra-global-overlay {
            position: fixed !important; top: 0; left: 0; width: 100vw; height: 100vh;
            display: flex; align-items: center; justify-content: center; background-color: rgba(0, 0, 0, 0.6);
            pointer-events: auto; 
        }
    `;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = css;
    document.head.appendChild(style);
}


export function createOverlay({ title, bodyContent, actions = [], maxWidth = '550px', maxHeight = 'none', showLogo = false, preventBackdropClose = false, onClose }) {
    injectOverlayCss();

    const overlay = document.createElement('div');
    overlay.className = 'rovalra-global-overlay'; 
    overlay.style.zIndex = '500'; 

    const content = document.createElement('div');

    content.className = 'relative radius-large bg-surface-100 stroke-muted stroke-standard foundation-web-dialog-content shadow-transient-high flex flex-col overflow-hidden';
    content.setAttribute('role', 'dialog');
    content.style.maxWidth = maxWidth;
    content.style.maxHeight = maxHeight;
    content.style.width = '90%';
    content.style.minHeight = maxHeight; 
    content.style.pointerEvents = 'auto'; 

    const closeButtonContainer = document.createElement('div');
    closeButtonContainer.className = 'absolute foundation-web-dialog-close-container';
    

    const body = document.createElement('div');

    body.className = 'padding-x-xlarge padding-top-xlarge padding-bottom-xlarge gap-xxlarge flex flex-col overflow-y-auto flex-grow';
    body.style.minHeight = '0'; 

    const titleElement = document.createElement('span');
    titleElement.className = 'group-description-dialog-body-header text-heading-small block';
    titleElement.style.display = 'flex';
    titleElement.style.alignItems = 'center';


    if (showLogo) {
        const assetName = typeof showLogo === 'string' ? showLogo : 'rovalraIcon';
        const altText = assetName === 'rovalraIcon' ? 'RoValra Logo' : 'Icon';

        const logo = createAssetIcon({ assetName, altText, width: '24px', height: '24px' });
        
        if (logo) {
            logo.style.marginRight = '8px';
            titleElement.prepend(logo);
        }
    }

    const titleTextNode = document.createTextNode(title);
    titleElement.appendChild(titleTextNode);
    body.appendChild(titleElement);

    if (typeof bodyContent === 'string') {
        const bodyContentContainer = document.createElement('div');
        bodyContentContainer.innerHTML = DOMPurify.sanitize(bodyContent);
        body.appendChild(bodyContentContainer);
    } else if (bodyContent instanceof HTMLElement) {
        body.appendChild(bodyContent);
    }

    if (actions.length > 0) {
        const footer = document.createElement('div');
        footer.className = 'flex justify-end gap-medium';
        actions.forEach(button => footer.appendChild(button));
        body.appendChild(footer);
    }

    content.appendChild(body);

    overlay.appendChild(content); 
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    const close = () => {
        overlay.remove();
        document.body.style.overflow = '';
        if (typeof onClose === 'function') {
            onClose();
        }
    };

    const closeButton = createCloseButton({ onClick: close });
    closeButtonContainer.appendChild(closeButton);
    content.prepend(closeButtonContainer);

    if (!preventBackdropClose) {
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    }

    return { overlay, close };
}
