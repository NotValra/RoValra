import { observeElement } from '../../core/observer.js';
import { settings } from '../../core/settings/getSettings.js';
import { createTab } from '../../core/ui/profile/tab.js';

function addTestTab(tabContainer) {
    if (tabContainer.dataset.rovalraTestTabInitialized === 'true') return;

    const profileContainer = tabContainer.parentElement;
    const contentContainer =
        profileContainer?.querySelector('.profile-tab-content-wrapper') ||
        profileContainer;
    if (!contentContainer) return;

    tabContainer.dataset.rovalraTestTabInitialized = 'true';

    const { contentPane } = createTab({
        id: 'test',
        label: 'test',
        container: tabContainer,
        contentContainer,
    });
    contentPane.textContent = 'test';
}

export async function init() {
    if (!(await settings.profileTestTabEnabled)) return;

    observeElement('.profile-tabs', addTestTab, { multiple: true });
}
