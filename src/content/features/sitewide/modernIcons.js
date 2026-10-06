import { observeElement } from '../../core/observer.js';
import { getAssets } from '../../core/assets.js';
import { injectStylesheet } from '../../core/ui/cssInjector.js';
import { Icon } from '../../core/ui/buildericon.js';

const assets = getAssets();
const ICON_TEMPLATES = new Map();
let modernIconsInitialized = false;

function prepareTemplates() {
    ICON_TEMPLATES.set(
        'votes',
        Icon({
            classes: ['rovalra-modern-icon'],
            filled: true,
            size: '18px',
            icon: 'thumb-up',
        }),
    );
    ICON_TEMPLATES.set(
        'playing',
        Icon({
            classes: ['rovalra-modern-icon'],
            filled: true,
            size: '18px',
            icon: 'person-play',
        }),
    );

    injectStylesheet('css/modernIcons.css', 'rovalra-modern-icons-styles');
}

const ICON_SELECTOR =
    '.icon-votes-gray, .icon-playing-counts-gray, .sdui-icon.icon-rating-16x16, .sdui-icon.icon-current-players-16x16';

function replaceIcon(element) {
    let type = null;
    const isSdui = element.classList.contains('sdui-icon');

    if (
        element.classList.contains('icon-votes-gray') ||
        element.classList.contains('icon-rating-16x16')
    ) {
        type = 'votes';
    } else if (
        element.classList.contains('icon-playing-counts-gray') ||
        element.classList.contains('icon-current-players-16x16')
    ) {
        type = 'playing';
    }

    const template = ICON_TEMPLATES.get(type);
    if (!template || !element.isConnected) return;

    const replacement = template.cloneNode(true);
    replacement.setAttribute('aria-hidden', 'true');
    if (isSdui) {
        replacement.classList.add('rovalra-modern-icon-sdui');
        replacement.setAttribute('size', '10px');
    }
    element.replaceWith(replacement);
}

export function initializeModernIcons() {
    if (modernIconsInitialized) return;
    modernIconsInitialized = true;

    chrome.storage.local.get('modernIconsEnabled', (result) => {
        const isEnabled = result.modernIconsEnabled !== false;

        if (!isEnabled) return;

        prepareTemplates();

        observeElement(ICON_SELECTOR, replaceIcon, {
            multiple: true,
        });
    });
}
