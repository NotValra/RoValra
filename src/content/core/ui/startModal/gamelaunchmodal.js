// Creates a launch modal made to look like robloxs launchmodal
import { createOverlay } from '../overlay.js';
import { createSpinner } from '../spinner.js';
import { getAssets } from '../../assets.js';


const modalStyles = `
    .rovalra-modal-content {
        font-family: "Builder Sans", "Helvetica Neue", Helvetica, Arial, sans-serif;
        color: var(--rovalra-main-text-color);
        text-align: left;
    }

    .rovalra-game-header {
        display: flex; 
        align-items: center; 
        gap: 12px; 
        width: 100%; 
        padding-bottom: 8px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.15); 
        margin-bottom: 8px;
    }
    
    .rovalra-details-list {
        list-style: none; 
        padding: 0; 
        margin: 0; 
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 6px; 
    }

    .rovalra-details-li { 
        display: flex; 
        align-items: center; 
        color: var(--rovalra-main-text-color); 
        font-size: 14px; 
        font-weight: 600; 
        line-height: 1.4;
    }

    .rovalra-details-li strong { 
        color: var(--rovalra-main-text-color);
        font-weight: 700; 
        margin-right: 6px; 
    }

    .rovalra-details-li svg {
        width: 18px !important;
        height: 18px !important;
        margin-right: 8px;
        fill: var(--rovalra-main-text-color);
        flex-shrink: 0;
        vertical-align: middle;
    }
    .rovalra-channel-text {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        flex: 1;        
        min-width: 0;   
    }
    .rovalra-details-li img {
        width: 18px;
        height: auto;
        margin-right: 8px;
        border-radius: 2px;
        flex-shrink: 0;
        vertical-align: middle;
    }


    
    .rovalra-spoiler {
        display: inline-block;
        vertical-align: middle;
        background-color: rgb(33, 33, 33); 
        color: transparent !important; 
        border: none;
        border-radius: 0px; 
        padding: 0 4px;
        min-width: 60px;
        height: 18px;
        line-height: 18px;
        font-size: 11.5px;
        cursor: default;
        user-select: none;
        transition: background-color 0.2s ease, color 0.2s ease;
    }
    
    .rovalra-spoiler:hover {
        background-color: transparent;
        color: var(--rovalra-main-text-color) !important; 
        user-select: text;
    }



    
    .rovalra-channel-wrapper {
        position: relative;
        flex: 1;
        min-width: 0;
        margin-left: 4px;
        z-index: 100; 
    }

    .rovalra-channel-truncated {
        display: block;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis; 
        color: var(--rovalra-main-text-color);
    }

    .rovalra-channel-tooltip {
        visibility: hidden;
        opacity: 0;
        
        position: absolute;
        bottom: 100%; 
        left: 50%;
        transform: translateX(-50%);
        
        margin-bottom: 12px; 
        
        background-color: var(--rovalra-container-background-color);
        color: var(--rovalra-main-text-color);
        padding: 6px 12px;
        border-radius: 4px;
        font-size: 14px;
        font-weight: 500;
        z-index: 9999;
        
        pointer-events: auto; 
        user-select: text;    
        cursor: text;
        
        white-space: nowrap;
        max-width: none;
        
        transition: opacity 0.15s ease, visibility 0.15s;
    }

    .rovalra-channel-tooltip::after {
        content: "";
        position: absolute;
        top: 100%; 
        left: 50%;
        margin-left: -5px;
        border-width: 5px;
        border-style: solid;
        border-color: var(--rovalra-container-background-color) transparent transparent transparent;
        pointer-events: none;
    }


    .rovalra-channel-tooltip::before {
        content: "";
        position: absolute;
        top: 100%; 
        left: 0;
        width: 100%;
        height: 15px; 
        background: transparent;
    }

    .rovalra-channel-wrapper.rovalra-has-overflow:hover .rovalra-channel-tooltip {
        visibility: visible;
        opacity: 1;
    }
`;

try {
    const styleSheet = document.createElement("style");
    styleSheet.textContent = modalStyles;
    (document.head || document.documentElement).appendChild(styleSheet);
} catch(e) {}



let activeInstance = null;
let keepOverlayOpen = false;

export function showLoadingOverlay(onCancel, customLogo = null) {
    keepOverlayOpen = false;

    if (activeInstance) {
        activeInstance.close();
        activeInstance = null;
    }

    const bodyWrapper = document.createElement('div');
    bodyWrapper.className = 'rovalra-modal-content';
    bodyWrapper.style.cssText = `
        display: flex; flex-direction: column; align-items: center; 
        justify-content: center; width: 100%; padding: 0; gap: 20px;
    `;

    const logoImg = document.createElement('img');
    
    if (customLogo) {
        logoImg.src = customLogo;
    } else {
        try { logoImg.src = getAssets().rovalraIcon; } catch (e) {}
    }
    
    logoImg.style.cssText = 'width: 80px; height: 80px; object-fit: contain; display: block;';
    bodyWrapper.appendChild(logoImg);

    const textElement = document.createElement('h2');
    textElement.className = 'text-heading-medium';
    textElement.style.cssText = 'text-align: center; width: 100%; margin: 0; font-size: 22px; font-weight: 700; color: var(--rovalra-main-text-color);';
    textElement.innerHTML = 'Searching For Servers...';
    bodyWrapper.appendChild(textElement);

    const infoContainer = document.createElement('div');
    infoContainer.style.cssText = `
        display: none; 
        width: 100%; 
        max-width: 350px;
        flex-direction: column; 
        background: transparent;
        border: none;
        padding: 0;
    `;
    bodyWrapper.appendChild(infoContainer);

    const actionContainer = document.createElement('div');
    actionContainer.style.cssText = `
        width: 100%; max-width: 302px; height: 40px; min-height: 40px;
        background-color: #335fff; border-radius: 8px; border: none;
        display: flex; align-items: center; justify-content: center;
        margin: 0 auto; position: relative; flex-shrink: 0;
    `;
    const spinner = createSpinner({ size: '24px', color: '#FFFFFF' });
    actionContainer.appendChild(spinner);
    bodyWrapper.appendChild(actionContainer);

    const { overlay, close } = createOverlay({
        title: '', bodyContent: bodyWrapper, showLogo: false,
        maxWidth: '350px', preventBackdropClose: true
    });

    const titleEl = overlay.querySelector('.group-description-dialog-body-header');
    if (titleEl) titleEl.remove();

    const closeBtn = overlay.querySelector('.foundation-web-dialog-close-container button');
    if (closeBtn) {
        const newCloseBtn = closeBtn.cloneNode(true);
        closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
        newCloseBtn.onclick = () => {
            if (typeof onCancel === 'function') onCancel();
            hideLoadingOverlay(true); 
        };
    }

    activeInstance = { overlay, close, textElement, actionContainer, infoContainer };
}

export function hideLoadingOverlay(force = false) {
    if (keepOverlayOpen && !force) return;
    
    if (activeInstance) {
        activeInstance.close();
        activeInstance = null;
    }
}

export function updateLoadingOverlayText(text) {
    if (activeInstance?.textElement) activeInstance.textElement.innerHTML = text;
}

export function updateServerInfo(gameName, iconUrl, detailsHtml) {
    if (!activeInstance?.infoContainer) return;
    const container = activeInstance.infoContainer;
    
    container.innerHTML = '';
    
    const headerDiv = document.createElement('div');
    headerDiv.className = 'rovalra-game-header';
    
    const icon = document.createElement('img');
    icon.src = iconUrl || ''; 
    icon.style.cssText = 'width: 50px; height: 50px; border-radius: 8px; object-fit: cover; background-color: #232527; flex-shrink: 0;';
    
    const textDiv = document.createElement('div');
    textDiv.style.cssText = 'display: flex; flex-direction: column; overflow: hidden; flex-grow: 1; justify-content: center;';
    
    const nameLabel = document.createElement('span');
    nameLabel.innerText = gameName || 'Roblox Experience';
    nameLabel.style.cssText = 'font-size: 16px; font-weight: 700; color: var(--rovalra-main-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
    
    textDiv.appendChild(nameLabel);
    headerDiv.appendChild(icon);
    headerDiv.appendChild(textDiv);
    container.appendChild(headerDiv);

    if (detailsHtml) {
        const detailsList = document.createElement('ul');
        detailsList.className = 'rovalra-details-list';
        detailsList.innerHTML = detailsHtml;
        container.appendChild(detailsList);
    }

    container.style.display = 'flex';


    requestAnimationFrame(() => {
        const wrappers = container.querySelectorAll('.rovalra-channel-wrapper');
        
        wrappers.forEach(wrapper => {
            const textElement = wrapper.querySelector('.rovalra-channel-truncated');
            if (textElement) {
                if (textElement.scrollWidth > textElement.clientWidth) {
                    wrapper.classList.add('rovalra-has-overflow');
                } else {
                    wrapper.classList.remove('rovalra-has-overflow');
                }
            }
        });
    });
}
export function showLoadingOverlayResult(message, buttonOptions) {
    if (!activeInstance) return;
    keepOverlayOpen = true;
    updateLoadingOverlayText(message);
    const container = activeInstance.actionContainer;
    container.innerHTML = ''; 
    if (buttonOptions) {
        const btn = document.createElement('button');
        btn.textContent = buttonOptions.text;
        btn.style.cssText = `width: 100%; height: 100%; background: transparent; border: none; color: white; font-size: 16px; font-weight: 600; cursor: pointer;`;
        container.appendChild(btn);
        container.onclick = (e) => { e.stopPropagation(); keepOverlayOpen = false; buttonOptions.onClick(); };
    }
}