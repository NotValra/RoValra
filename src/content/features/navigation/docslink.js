import { ts } from '../../core/locale/i18n.js';
import { Icon } from '../../core/ui/buildericon.js';
import { initSidebarLink } from '../../core/ui/sidebarLink.js';

const DOCS_PATH = '/docs';
const OLD_API_DOCS_STORAGE_KEY = 'EnableRobloxApiDocs';

function cleanupOldApiDocsStorage() {
    chrome.storage.local.get(
        [OLD_API_DOCS_STORAGE_KEY, 'rovalra_settings'],
        (result) => {
            if (
                Object.prototype.hasOwnProperty.call(
                    result,
                    OLD_API_DOCS_STORAGE_KEY,
                )
            ) {
                chrome.storage.local.remove(OLD_API_DOCS_STORAGE_KEY);
            }

            const settingsData = result.rovalra_settings;
            if (
                !settingsData ||
                !Object.prototype.hasOwnProperty.call(
                    settingsData,
                    OLD_API_DOCS_STORAGE_KEY,
                )
            ) {
                return;
            }

            const nextSettingsData = { ...settingsData };
            delete nextSettingsData[OLD_API_DOCS_STORAGE_KEY];
            chrome.storage.local.set({ rovalra_settings: nextSettingsData });
        },
    );
}

function createDocsIcon() {
    return Icon({
        material: true,
        size: 'medium',
        icon: 'description',
        filled: true,
    });
}

export function init() {
    if (init._run) return;
    init._run = true;

    cleanupOldApiDocsStorage();

    initSidebarLink({
        id: 'api-docs',
        path: DOCS_PATH,
        label: () => ts('navigation.apiDocs'),
        createIcon: createDocsIcon,
        settingKeys: ['apiDocsSidebarLinkEnabled'],
        legacySelectors: ['a[href="/docs"]'],
    });
}
