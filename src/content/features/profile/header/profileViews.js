import { getUserIdFromUrl } from '../../../core/idExtractor.js';
import { getUserSettings } from '../../../core/donators/settingHandler.js';
import { observeChildren, observeElement } from '../../../core/observer.js';
import { settings as rovalraSettings } from '../../../core/settings/getSettings.js';
import { createPill } from '../../../core/ui/general/pill.js';

function getViewCount(settings) {
    const count = Number(settings?.Views);
    return Number.isFinite(count) && count > 0 ? count : 0;
}

function createProfileViewsContent(views) {
    const content = document.createElement('span');
    content.className = 'rovalra-profile-views-content';

    const text = document.createElement('span');
    text.textContent = `${views.toLocaleString()} Profile Views`;

    content.append(text);
    return content;
}

function keepPillAfterUsernameDetails(targetContainer, pill) {
    const appendPill = () => {
        if (!pill.isConnected || pill.parentElement !== targetContainer) return;

        const subplaceChip = targetContainer.querySelector(
            [
                ':scope > .rovalra-profile-subplace-legacy-chip',
                ':scope > .rovalra-profile-subplace-legacy-row',
            ].join(','),
        );
        const customizationPill = targetContainer.querySelector(
            ':scope > .rovalra-profile-customization-pill',
        );
        const roproLikeCount = targetContainer.querySelector(
            ':scope > #reputationDiv',
        );

        if (roproLikeCount) {
            if (roproLikeCount.nextElementSibling !== pill) {
                roproLikeCount.after(pill);
            }
            if (
                customizationPill &&
                pill.nextElementSibling !== customizationPill
            ) {
                pill.after(customizationPill);
            }
            return;
        }

        if (customizationPill) {
            if (pill.nextElementSibling !== customizationPill) {
                customizationPill.before(pill);
            }
            return;
        }

        if (subplaceChip) {
            if (pill.nextElementSibling !== subplaceChip) {
                subplaceChip.before(pill);
            }
            return;
        }

        if (targetContainer.lastElementChild !== pill) {
            targetContainer.appendChild(pill);
        }
    };

    appendPill();
    [0, 250, 1000, 2500].forEach((delay) => {
        setTimeout(appendPill, delay);
    });
}

async function initProfileViews() {
    if (!(await rovalraSettings.profileViewsEnabled)) return;

    const userId = Number(getUserIdFromUrl());
    if (!userId) return;

    let settings;
    try {
        settings = await getUserSettings(userId, {
            disableBatch: true,
            noCache: true,
        });
    } catch (error) {
        console.warn('RoValra: Failed to fetch profile views.', error);
        return;
    }

    if (settings?.hide_views) return;

    const views = getViewCount(settings);
    if (!views) return;

    observeElement(
        '.user-profile-header-info .stylistic-alts-username',
        (username) => {
            const targetContainer = username.parentElement;
            if (!targetContainer) return;

            if (targetContainer.querySelector('.rovalra-profile-views-pill'))
                return;

            const pill = createPill(
                createProfileViewsContent(views),
                'Profile views from RoValra users. This counts total profile views, not unique users.',
                { size: 'small' },
            );
            pill.classList.add('rovalra-profile-views-pill');

            targetContainer.appendChild(pill);
            keepPillAfterUsernameDetails(targetContainer, pill);
            observeChildren(targetContainer, () =>
                keepPillAfterUsernameDetails(targetContainer, pill),
            );
        },
    );
}

export function init() {
    initProfileViews();
}
