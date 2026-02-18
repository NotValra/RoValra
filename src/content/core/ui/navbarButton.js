import { observeElement } from '../observer.js';
import { addTooltip } from './tooltip.js';

/**
 * Creates a new button in the navbar.
 * @param {object} options - The options for the button.
 * @param {string} options.id - The ID for the new navbar item.
 * @param {string} options.iconSvgData - The SVG string for the icon.
 * @param {string} [options.tooltipText] - The tooltip text for the button.
 * @param {function(HTMLElement): void} [options.onClick] - The callback to run when the button is clicked. The button element is passed as an argument.
 * @returns {Promise<HTMLElement|null>} A promise that resolves with the button element when it's created, or null.
 */
export function createNavbarButton({ id, iconSvgData, tooltipText, onClick }) {
    return new Promise((resolve) => {
        const init = () => {
            observeElement('.nav.navbar-right.rbx-navbar-icon-group', (navbar) => {
                if (document.getElementById(id)) {
                    resolve(document.getElementById(id).querySelector('button'));
                    return;
                }

                const li = document.createElement('li');
                li.id = id;
                li.className = 'navbar-icon-item';

                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'btn-uiblox-common-common-notification-bell-md';
                
                const spanIcon = document.createElement('span');
                spanIcon.className = 'rbx-menu-item';
                spanIcon.style.display = 'flex';
                spanIcon.style.alignItems = 'center';
                spanIcon.style.justifyContent = 'center';

                if (iconSvgData) {
                    try {
                        let svgData = iconSvgData.includes('<svg') ? iconSvgData : decodeURIComponent(iconSvgData.split(',')[1]);
                        svgData = svgData.replace('fill="white"', 'fill="var(--rovalra-main-text-color)"');
                        spanIcon.innerHTML = svgData; //Verified
                        
                        const svg = spanIcon.querySelector('svg');
                        if (svg) {
                            svg.setAttribute('width', '28');
                            svg.setAttribute('height', '28');
                        }
                    } catch (e) {
                        console.error('RoValra: Failed to parse navbar button icon', e);
                        resolve(null);
                        return;
                    }
                }

                button.appendChild(spanIcon);
                li.appendChild(button);

                if (tooltipText) {
                    addTooltip(button, tooltipText);
                }

                if (onClick) {
                    button.addEventListener('click', () => onClick(button));
                }

                const searchIcon = navbar.querySelector('.rbx-navbar-right-search');
                if (searchIcon) {
                    navbar.insertBefore(li, searchIcon.nextSibling);
                } else {
                    navbar.insertBefore(li, navbar.firstChild);
                }

                resolve(button);
            });
        };

        if (document.readyState === 'complete') {
            init();
        } else {
            window.addEventListener('load', init, { once: true });
        }
    });
}