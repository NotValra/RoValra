import { ts } from '../../core/locale/i18n.js';
import { Icon } from '../../core/ui/buildericon.js';
import { initSidebarLink } from '../../core/ui/sidebarLink.js';

const WEBCLIENT_URL = 'https://play.roblox.com/games/start?placeId=bleh';

function createWebClientIcon() {
    return Icon({
        material: false,
        size: 'medium',
        icon: 'controller',
        filled: false,
    });
}

export function init() {
    if (init._run) return;
    init._run = true;

    initSidebarLink({
        id: 'web-client',
        path: WEBCLIENT_URL,
        label: () => ts('navigation.webClient'),
        createIcon: createWebClientIcon,
        settingKeys: ['webClientSidebarLinkEnabled'],
        openInNewTab: true,
    });
}
