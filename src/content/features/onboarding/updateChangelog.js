import { createOverlay } from '../../core/ui/overlay.js';
import { createButton } from '../../core/ui/buttons.js';
import { ts } from '../../core/locale/i18n.js';
import { settings } from '../../core/settings/getSettings.js';
import {
    getChangelogs,
    isCurrentChangelogRelease,
    renderChangelogRelease,
} from '../settings/index.js';

const CHANGELOGS_URL = 'https://www.roblox.com/my/account?rovalra=changelogs';

export async function init() {
    const version = chrome.runtime.getManifest().version;
    const { lastSeenChangelogVersion } = await chrome.storage.local.get(
        'lastSeenChangelogVersion',
    );
    if (lastSeenChangelogVersion === version) return;

    const markSeen = () =>
        chrome.storage.local.set({ lastSeenChangelogVersion: version });

    // Fresh installs get the onboarding instead
    if (
        !(await settings.onboardingShown) ||
        !(await settings.updateChangelogModalEnabled)
    ) {
        markSeen();
        return;
    }

    let release;
    try {
        release = (await getChangelogs()).find(isCurrentChangelogRelease);
    } catch (error) {
        console.warn('RoValra: Failed to load update changelog', error);
        return;
    }

    markSeen();
    if (!release) return;

    const bodyContent = document.createElement('div');
    bodyContent.style.overflowY = 'auto';
    bodyContent.appendChild(renderChangelogRelease(release));

    const viewAllButton = createButton(ts('updateChangelog.viewAll'));
    const gotItButton = createButton(ts('updateChangelog.gotIt'), 'primary');

    const { close } = createOverlay({
        title: ts('updateChangelog.title'),
        bodyContent,
        actions: [viewAllButton, gotItButton],
        maxWidth: 'min(650px, 90vw)',
        showLogo: true,
    });

    viewAllButton.addEventListener('click', () => {
        window.location.href = CHANGELOGS_URL;
    });
    gotItButton.addEventListener('click', () => close());
}
