import { observeChildren, observeElement } from '../observer.js';
import DOMPurify from '../packages/dompurify.js';
import { CUSTOM_ADDED_TAGS } from '../utils/purifyCfg.js';
import { addTooltip } from './tooltip.js';

const navbarButtons = new Map();

function buildItem({ id, iconSvgData, iconData, tooltipText, onClick }) {
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
            let svgData = iconSvgData.includes('<svg')
                ? iconSvgData
                : decodeURIComponent(iconSvgData.split(',')[1]);
            svgData = svgData.replace(
                'fill="white"',
                'fill="var(--rovalra-main-text-color)"',
            );
            spanIcon.innerHTML = svgData; //Verified

            const svg = spanIcon.querySelector('svg');
            if (svg) {
                svg.setAttribute('width', '28');
                svg.setAttribute('height', '28');
            }
        } catch (e) {
            console.error('RoValra: Failed to parse navbar button icon svg', e);
            return null;
        }
    } else if (iconData) {
        try {
            spanIcon.innerHTML = DOMPurify.sanitize(iconData, {
                ...CUSTOM_ADDED_TAGS,
            });
        } catch (e) {
            console.error(
                'RoValra: Failed to parse navbar button icon element',
                e,
            );
            return null;
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

    return { li, button };
}

function placeItem(entry, navbar) {
    if (entry.destroyed || !navbar?.isConnected) return;
    if (entry.li.parentNode === navbar) return;

    for (const duplicate of document.querySelectorAll(`[id="${entry.id}"]`)) {
        if (duplicate !== entry.li) duplicate.remove();
    }

    const afterEl = entry.insertAfter
        ? navbar.querySelector(entry.insertAfter)
        : null;
    const searchIcon = navbar.querySelector('.rbx-navbar-right-search');
    if (afterEl) {
        navbar.insertBefore(entry.li, afterEl.nextSibling);
    } else if (searchIcon) {
        navbar.insertBefore(entry.li, searchIcon.nextSibling);
    } else {
        navbar.insertBefore(entry.li, navbar.firstChild);
    }
}

/**
 * Creates a new button in the navbar. The button is kept in the navbar until
 * removeNavbarButton is called, even if the site re-renders the navbar.
 * @param {object} options - The options for the button.
 * @param {string} options.id - The ID for the new navbar item.
 * @param {string} [options.iconSvgData] - The SVG string for the icon.
 * @param {string} [options.iconData] - The icon element string for the icon.
 * @param {string} [options.tooltipText] - The tooltip text for the button.
 * @param {function(HTMLElement): void} [options.onClick] - The callback to run when the button is clicked. The button element is passed as an argument.
 * @returns {Promise<HTMLElement|null>} A promise that resolves with the button element when it's created, or null.
 */
export function createNavbarButton(options) {
    const {
        id,
        insertAfter,
        navbarSelector = 'ul.navbar-right.rbx-navbar-icon-group',
    } = options;

    const existing = navbarButtons.get(id);
    if (existing) return existing.ready;

    const entry = {
        id,
        insertAfter,
        li: null,
        button: null,
        destroyed: false,
        navbarObserver: null,
        childObserver: null,
        ready: null,
    };
    navbarButtons.set(id, entry);

    entry.ready = new Promise((resolve) => {
        const init = () => {
            if (entry.destroyed) {
                resolve(null);
                return;
            }

            entry.navbarObserver = observeElement(navbarSelector, (navbar) => {
                if (entry.destroyed) return;

                if (!entry.li) {
                    const built = buildItem(options);
                    if (!built) {
                        removeNavbarButton(id);
                        resolve(null);
                        return;
                    }
                    entry.li = built.li;
                    entry.button = built.button;
                }

                placeItem(entry, navbar);

                entry.childObserver?.disconnect();
                entry.childObserver = observeChildren(navbar, () => {
                    if (!entry.li.isConnected) placeItem(entry, navbar);
                });

                resolve(entry.button);
            });
        };

        if (document.readyState === 'complete') {
            init();
        } else {
            window.addEventListener('load', init, { once: true });
        }
    });

    return entry.ready;
}

export function removeNavbarButton(id) {
    const entry = navbarButtons.get(id);
    if (entry) {
        entry.destroyed = true;
        entry.navbarObserver?.disconnect();
        entry.childObserver?.disconnect();
        entry.li?.remove();
        navbarButtons.delete(id);
    }
    document.getElementById(id)?.remove();
}
