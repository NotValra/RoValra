import { observeElement } from '../../core/observer.js';
import { getAssets } from '../../core/assets.js';
import { injectStylesheet } from '../../core/ui/cssInjector.js';
import { Icon } from '../../core/ui/buildericon.js';

const assets = getAssets();
const ICON_TEMPLATES = new Map();
let modernIconsInitialized = false;

function prepareTemplates() {
    ICON_TEMPLATES.set('votes', Icon({
        classes: ['rovalra-modern-icon'],
        filled: true,
        size: '18px',
        icon: 'thumb-up'
    }));
    ICON_TEMPLATES.set('playing', Icon({
        classes: ['rovalra-modern-icon'],
        filled: true,
        size: '18px',
        icon: 'person-play'
    }));

    injectStylesheet('css/modernIcons.css', 'rovalra-modern-icons-styles');
}

function replaceIcon(element) {
    let type = null;

    if (element.classList.contains('icon-votes-gray')) {
        type = 'votes';
    } else if (element.classList.contains('icon-playing-counts-gray')) {
        type = 'playing';
    }

    const template = ICON_TEMPLATES.get(type);
    if (!template || !element.isConnected) return;

    const replacement = template.cloneNode(true);
    replacement.setAttribute('aria-hidden', 'true');
    element.replaceWith(replacement);
}

export function initializeModernIcons() {
    if (modernIconsInitialized) return;
    modernIconsInitialized = true;

    chrome.storage.local.get('modernIconsEnabled', (result) => {
        const isEnabled = result.modernIconsEnabled !== false;

        if (!isEnabled) return;

        prepareTemplates();

        observeElement(
            '.icon-votes-gray, .icon-playing-counts-gray',
            replaceIcon,
            {
                multiple: true,
            },
        );
    });
}
