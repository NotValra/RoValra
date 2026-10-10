import { createToggle } from '../../core/ui/general/toggle.js';
import {
    getBadgeVisibilitySettings,
    setBadgeVisibility,
} from '../../core/settings/badgeSettings.js';
import { ts } from '../../core/locale/i18n.js';
import {
    registerProfileEditCategory,
    registerProfileEditFeature,
} from '../../core/profile/profileEditRegistry.js';

const BADGE_FEATURE_ID = 'profileBadges';

function formatBadgeLabel(key) {
    return key
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getVisibilitySummary(badges) {
    const visibleCount = badges.filter(({ isVisible }) => isVisible).length;
    return `${visibleCount}/${badges.length} visible`;
}

function notifyProfileEditValue(value) {
    document.dispatchEvent(
        new CustomEvent('rovalra:settingSaved', {
            detail: { name: BADGE_FEATURE_ID, value },
        }),
    );
}

function createSettingRow(labelText, toggle, className = '') {
    const setting = document.createElement('div');
    setting.className = `setting rovalra-profile-badge-setting ${className}`.trim();

    const controls = document.createElement('div');
    controls.className = 'setting-controls';
    const label = document.createElement('label');
    label.textContent = labelText;
    controls.append(label, toggle);
    setting.appendChild(controls);
    return setting;
}

async function createBadgeOverlay() {
    const badgeSettings = await getBadgeVisibilitySettings();

    const body = document.createElement('div');
    body.className = 'rovalra-profile-badges-editor';
    body.style.cssText = 'color:var(--rovalra-main-text-color);';

    const description = document.createElement('div');
    description.className = 'setting-description';
    description.textContent =
        'Choose which of your RoValra donation badges are shown on your profile.';
    body.appendChild(description);

    if (!badgeSettings.length) {
        const emptyState = document.createElement('div');
        emptyState.className = 'setting-description';
        emptyState.textContent =
            'You do not have any RoValra donation badges yet.';
        body.appendChild(emptyState);

        return {
            title: ts('profileEdit.featuresTitle'),
            bodyContent: body,
            showLogo: true,
            maxWidth: '600px',
            titleFontSize: '22px',
        };
    }

    const childToggles = [];
    const mainToggle = createToggle({
        id: 'profileBadgesAll',
        checked: badgeSettings.some(({ isVisible }) => isVisible),
    });
    body.appendChild(
        createSettingRow(
            'Show all badges',
            mainToggle,
            'rovalra-profile-badges-master-setting',
        ),
    );

    const divider = document.createElement('div');
    divider.className = 'setting-label-divider';
    body.appendChild(divider);

    const updateSummary = () => {
        notifyProfileEditValue(getVisibilitySummary(badgeSettings));
    };

    badgeSettings.forEach(({ key, isVisible }) => {
        const toggle = createToggle({
            id: `profileBadge_${key}`,
            checked: isVisible,
            onChange: async (checked) => {
                badgeSettings.find((badge) => badge.key === key).isVisible =
                    checked;
                await setBadgeVisibility(key, checked);
                mainToggle.classList.toggle(
                    'on',
                    badgeSettings.some((badge) => badge.isVisible),
                );
                updateSummary();
            },
        });
        childToggles.push(toggle);
        body.appendChild(
            createSettingRow(formatBadgeLabel(key), toggle),
        );
    });

    mainToggle.addEventListener('click', async () => {
        const isVisible = mainToggle.classList.contains('on');
        await Promise.all(
            badgeSettings.map(async (badge, index) => {
                badge.isVisible = isVisible;
                childToggles[index].classList.toggle('on', isVisible);
                await setBadgeVisibility(badge.key, isVisible);
            }),
        );
        updateSummary();
    });

    return {
        title: ts('profileEdit.featuresTitle'),
        bodyContent: body,
        showLogo: true,
        maxWidth: '600px',
        titleFontSize: '22px',
    };
}

registerProfileEditCategory({
    id: 'rovalra',
    label: 'RoValra Features',
});
registerProfileEditFeature('rovalra', {
    id: BADGE_FEATURE_ID,
    label: ts('profileEdit.profileBadges') || 'Profile Badges',
    labelKey: 'profileEdit.profileBadges',
    settingName: BADGE_FEATURE_ID,
    getValue: async () =>
        getVisibilitySummary(await getBadgeVisibilitySettings()),
    onOpen: createBadgeOverlay,
});
