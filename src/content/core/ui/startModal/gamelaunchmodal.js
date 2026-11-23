// Creates a launch modal made to look like robloxs launchmodal
import { createOverlay } from '../overlay.js';
import { createSpinner } from '../spinner.js';
import { parseMarkdown } from '../../utils/markdown.js';
import { createFoundationButton } from '../buttons.js';
import DOMPurify from 'dompurify';

let activeInstance = null;
let keepOverlayOpen = false;

function createActionSpinner() {
    return createSpinner({ size: '24px', color: '#FFFFFF' });
}

function createLaunchLogo(customLogo) {
    if (customLogo) {
        const logoImg = document.createElement('img');
        logoImg.src = customLogo;
        logoImg.alt = '';
        logoImg.className = 'rovalra-gamelaunch-logo';
        return logoImg;
    }

    const appIcon = document.createElement('div');
    appIcon.className = 'app-icon-bluebg app-icon-windows size-1600';
    appIcon.setAttribute('role', 'img');
    appIcon.setAttribute('aria-label', 'App Icon');
    appIcon.title = 'App Icon';
    return appIcon;
}

export function showLoadingOverlay(
    onCancel,
    customLogo = null,
    closeOnBackgroundClick = false,
) {
    keepOverlayOpen = false;

    if (activeInstance) {
        activeInstance.close();
        activeInstance = null;
    }

    const bodyWrapper = document.createElement('div');
    bodyWrapper.className =
        'rovalra-modal-content rovalra-gamelaunch-modal-body';

    bodyWrapper.appendChild(createLaunchLogo(customLogo));

    const textElement = document.createElement('div');
    textElement.className = 'text-heading-medium rovalra-gamelaunch-text';
    textElement.style.color = 'var(--rovalra-main-text-color)';
    textElement.innerHTML = DOMPurify.sanitize(
        parseMarkdown('Searching For Servers...'),
    );
    textElement.querySelectorAll('.rovalra-markdown *').forEach((el) => {
        el.style.color = 'inherit';
    });
    bodyWrapper.appendChild(textElement);

    const infoContainer = document.createElement('div');
    infoContainer.className = 'rovalra-gamelaunch-info-container';
    bodyWrapper.appendChild(infoContainer);

    const actionContainer = document.createElement('div');
    actionContainer.className = 'rovalra-gamelaunch-action-container';
    actionContainer.appendChild(createActionSpinner());
    bodyWrapper.appendChild(actionContainer);

    const { overlay, close } = createOverlay({
        title: '',
        bodyContent: bodyWrapper,
        showLogo: false,
        maxWidth: '350px',
        preventBackdropClose: !closeOnBackgroundClick,
        onClose: () => {
            if (activeInstance) {
                activeInstance = null;
                if (typeof onCancel === 'function') onCancel();
            }
        },
    });

    const titleEl = overlay.querySelector(
        '.group-description-dialog-body-header',
    );
    if (titleEl) titleEl.remove();

    const closeBtn = overlay.querySelector(
        '.foundation-web-dialog-close-container button',
    );
    if (closeBtn) {
        const newCloseBtn = closeBtn.cloneNode(true);
        closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
        newCloseBtn.onclick = () => {
            if (typeof onCancel === 'function') onCancel();
            hideLoadingOverlay(true);
        };
    }

    activeInstance = {
        overlay,
        close,
        textElement,
        actionContainer,
        infoContainer,
    };
}

export function hideLoadingOverlay(force = false) {
    if (keepOverlayOpen && !force) return;

    if (activeInstance) {
        const instance = activeInstance;
        activeInstance = null;
        instance.close();
    }
}

export function updateLoadingOverlayText(text) {
    if (activeInstance?.textElement) {
        activeInstance.textElement.innerHTML = DOMPurify.sanitize(
            parseMarkdown(text),
        );
        activeInstance.textElement
            .querySelectorAll('.rovalra-markdown *')
            .forEach((el) => (el.style.color = 'inherit'));
    }
}

export function updateServerInfo(gameName, iconUrl, details) {
    if (!activeInstance?.infoContainer) return;
    const container = activeInstance.infoContainer;
    container.classList.remove('is-visible');
    container.innerHTML = '';

    const headerDiv = document.createElement('div');
    headerDiv.className = 'rovalra-game-header';

    const icon = document.createElement('img');
    icon.src = iconUrl || '';
    icon.className = 'rovalra-gamelaunch-game-icon';

    const textDiv = document.createElement('div');
    textDiv.className = 'rovalra-gamelaunch-text-container';

    const nameLabel = document.createElement('span');
    nameLabel.innerText = gameName || ts('common.robloxExperience');
    nameLabel.className = 'rovalra-gamelaunch-game-name';

    textDiv.appendChild(nameLabel);
    headerDiv.appendChild(icon);
    headerDiv.appendChild(textDiv);
    container.appendChild(headerDiv);

    if (details) {
        const detailsList = document.createElement('ul');
        detailsList.className = 'rovalra-details-list';
        if (typeof details === 'string') {
            detailsList.innerHTML = DOMPurify.sanitize(details);
        } else {
            detailsList.append(...[details].flat());
        }
        container.appendChild(detailsList);
    }

    container.classList.add('is-visible');

    requestAnimationFrame(() => {
        const wrappers = container.querySelectorAll('.rovalra-channel-wrapper');

        wrappers.forEach((wrapper) => {
            const textElement = wrapper.querySelector(
                '.rovalra-channel-truncated',
            );
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
    container.onclick = null;
    if (buttonOptions) {
        let btn;
        if (buttonOptions.emphasis) {
            btn = createFoundationButton(buttonOptions.text, {
                variant: 'emphasis',
                size: 'large',
                classList: ['grow'],
            });
        } else {
            btn = document.createElement('button');
            btn.textContent = buttonOptions.text;
            btn.className = 'rovalra-gamelaunch-action-button';
        }
        container.appendChild(btn);
        container.onclick = (e) => {
            e.stopPropagation();
            keepOverlayOpen = false;
            buttonOptions.onClick();
        };
    }
}

export function showLoadingOverlaySpinner() {
    if (!activeInstance) return;
    keepOverlayOpen = false;
    const container = activeInstance.actionContainer;
    container.onclick = null;
    container.replaceChildren(createActionSpinner());
}
import { ts } from '../../locale/i18n.js';
