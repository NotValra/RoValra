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

function keepViewsRowAfterUsernameDetails(targetContainer, row) {
    const appendRow = () => {
        if (!row.isConnected || row.parentElement !== targetContainer) return;

        const subplaceChip = targetContainer.querySelector(
            [
                ':scope > .rovalra-profile-subplace-legacy-chip',
                ':scope > .rovalra-profile-subplace-legacy-row',
            ].join(','),
        );
        const customizationElement = targetContainer.querySelector(
            [
                ':scope > .rovalra-profile-customization-pill-row',
                ':scope > .rovalra-profile-customization-pill',
            ].join(','),
        );
        const roproLikeCount = targetContainer.querySelector(
            ':scope > #reputationDiv',
        );

        if (roproLikeCount) {
            if (roproLikeCount.nextElementSibling !== row) {
                roproLikeCount.after(row);
            }
            if (
                customizationElement &&
                row.nextElementSibling !== customizationElement
            ) {
                row.after(customizationElement);
            }
            return;
        }

        if (customizationElement) {
            if (row.nextElementSibling !== customizationElement) {
                customizationElement.before(row);
            }
            return;
        }

        if (subplaceChip) {
            if (row.nextElementSibling !== subplaceChip) {
                subplaceChip.before(row);
            }
            return;
        }

        if (targetContainer.lastElementChild !== row) {
            targetContainer.appendChild(row);
        }
    };

    appendRow();
    [0, 250, 1000, 2500].forEach((delay) => {
        setTimeout(appendRow, delay);
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

            if (targetContainer.querySelector('.rovalra-profile-views-row'))
                return;

            const pill = createPill(
                createProfileViewsContent(views),
                'Profile views from RoValra users. This counts total profile views, not unique users.',
                { size: 'small' },
            );
            pill.classList.add('rovalra-profile-views-pill');

            const row = document.createElement('div');
            row.className = 'rovalra-profile-views-row';
            row.appendChild(pill);

            targetContainer.classList.add('rovalra-profile-views-host');
            targetContainer.appendChild(row);
            keepViewsRowAfterUsernameDetails(targetContainer, row);
            observeChildren(targetContainer, () =>
                keepViewsRowAfterUsernameDetails(targetContainer, row),
            );
        },
    );
}

export function init() {
    initProfileViews();
}
