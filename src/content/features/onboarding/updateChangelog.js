import { ts } from '../../core/locale/i18n.js';
import { settings } from '../../core/settings/getSettings.js';
import { observeElement } from '../../core/observer.js';
import { createCloseButton } from '../../core/ui/closeButton.js';
import { createAssetIcon } from '../../core/ui/general/toast.js';

const CHANGELOGS_URL = 'https://www.roblox.com/my/account?rovalra=changelogs';
const HIDE_AFTER_MS = 60_000;

function createPill(text, className) {
    const pill = document.createElement('span');
    pill.className = `rovalra-update-changelog-pill ${className}`;
    pill.textContent = text;
    return pill;
}

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
        !(await settings.updateChangelogHeaderEnabled)
    ) {
        markSeen();
        return;
    }

    observeElement('main.container-main', (main) => {
        if (main.querySelector('.rovalra-update-changelog-bar')) return;

        const bar = document.createElement('div');
        bar.className = 'rovalra-update-changelog-bar';

        const logo = createAssetIcon({
            altText: 'RoValra Logo',
            width: '40px',
            height: '40px',
        });
        logo?.classList.add('rovalra-update-changelog-logo');

        const info = document.createElement('div');
        info.className = 'rovalra-update-changelog-info';

        const title = document.createElement('div');
        title.className = 'rovalra-update-changelog-title';
        title.append(
            ts('updateChangelog.title'),
            createPill(`v${version}`, 'rovalra-update-changelog-pill-new'),
        );
        if (lastSeenChangelogVersion) {
            title.append(
                createPill(
                    ts('updateChangelog.fromVersion', {
                        version: lastSeenChangelogVersion,
                    }),
                    'rovalra-update-changelog-pill-old',
                ),
            );
        }

        const description = document.createElement('div');
        description.className = 'rovalra-update-changelog-description';
        description.textContent = ts('updateChangelog.description');

        info.append(title, description);

        const viewButton = document.createElement('a');
        viewButton.className = 'btn-primary-md rovalra-update-changelog-button';
        viewButton.href = CHANGELOGS_URL;
        viewButton.textContent = ts('updateChangelog.viewChangelog');
        viewButton.addEventListener('click', markSeen);

        let hideTimer;
        const dismiss = () => {
            clearTimeout(hideTimer);
            markSeen();
            bar.remove();
        };
        // Goes away for good after a minute without the user interacting with it
        const startHideTimer = () => {
            clearTimeout(hideTimer);
            hideTimer = setTimeout(dismiss, HIDE_AFTER_MS);
        };
        const stopHideTimer = () => clearTimeout(hideTimer);

        const closeButton = createCloseButton({ onClick: dismiss });

        bar.append(...[logo, info, viewButton, closeButton].filter(Boolean));
        bar.addEventListener('mouseenter', stopHideTimer);
        bar.addEventListener('mouseleave', startHideTimer);
        bar.addEventListener('focusin', stopHideTimer);
        bar.addEventListener('focusout', startHideTimer);
        main.prepend(bar);

        if (document.readyState === 'complete') {
            startHideTimer();
        } else {
            window.addEventListener('load', startHideTimer, { once: true });
        }
    });
}
