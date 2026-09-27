import { getUserIdFromUrl } from '../../../core/idExtractor.js';
import { getUserSettings } from '../../../core/donators/settingHandler.js';
import { observeElement } from '../../../core/observer.js';
import { settings as rovalraSettings } from '../../../core/settings/getSettings.js';
import { createPill } from '../../../core/ui/general/pill.js';
import { getProfileHeaderPillGroup } from '../../../core/ui/profile/headerPills.js';

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

async function initProfileViews() {
    if (!(await rovalraSettings.profileViewsEnabled)) return;

    const userId = Number(getUserIdFromUrl());
    if (!userId) return;

    let settings;
    try {
        settings = await getUserSettings(userId);
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

            getProfileHeaderPillGroup(targetContainer).prepend(pill);
        },
    );
}

export function init() {
    initProfileViews();
}
