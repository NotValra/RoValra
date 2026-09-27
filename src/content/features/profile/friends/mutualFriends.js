import { getUserIdFromUrl } from '../../../core/idExtractor.js';
import { getAuthenticatedUserId } from '../../../core/user.js';
import { observeElement } from '../../../core/observer.js';
import { settings } from '../../../core/settings/getSettings.js';
import { getMutualFriends } from '../../../core/apis/users.js';
import { getBatchThumbnails } from '../../../core/thumbnail/thumbnails.js';
import { createPill } from '../../../core/ui/general/pill.js';
import { createOverlay } from '../../../core/ui/overlay.js';
import { createSpinner } from '../../../core/ui/spinner.js';
import { createUserCardsFromIds } from '../../../core/ui/profile/userCard.js';
import { getProfileHeaderPillGroup } from '../../../core/ui/profile/headerPills.js';
import { t } from '../../../core/locale/i18n.js';

const PILL_CLASS = 'rovalra-mutual-friends-pill';
const MAX_PREVIEW_AVATARS = 3;

function createPillContent(thumbnails, label) {
    const content = document.createElement('span');
    content.className = 'rovalra-mutual-friends-content';

    const avatars = document.createElement('span');
    avatars.className = 'rovalra-mutual-friends-avatars';
    thumbnails.forEach((thumb) => {
        if (thumb.state !== 'Completed' || !thumb.imageUrl) return;
        const img = document.createElement('img');
        img.src = thumb.imageUrl;
        img.alt = '';
        avatars.appendChild(img);
    });

    const text = document.createElement('span');
    text.textContent = label;

    content.append(avatars, text);
    return content;
}

async function openMutualFriendsOverlay(mutualIds) {
    const body = document.createElement('div');
    Object.assign(body.style, {
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: '16px',
        padding: '8px 0',
        minHeight: '120px',
    });

    const spinner = createSpinner({ size: '32px' });
    body.appendChild(spinner);

    createOverlay({
        title: await t('mutualFriends.overlayTitle', {
            count: mutualIds.length,
        }),
        bodyContent: body,
        maxWidth: '600px',
    });

    try {
        await createUserCardsFromIds(body, mutualIds, mutualIds.length);
    } catch (error) {
        console.warn('RoValra: Failed to load mutual friends.', error);
        const message = document.createElement('span');
        message.className = 'text-secondary';
        message.textContent = await t('mutualFriends.loadFailed');
        body.appendChild(message);
    } finally {
        spinner.remove();
    }
}

async function initMutualFriends() {
    if (!(await settings.mutualFriendsEnabled)) return;

    const userId = Number(getUserIdFromUrl());
    if (!userId) return;

    const authedUserId = Number(await getAuthenticatedUserId());
    if (!authedUserId || authedUserId === userId) return;

    const mutualIds = Object.keys(await getMutualFriends(userId))
        .map(Number)
        .filter((id) => id > 0);
    if (mutualIds.length === 0) return;

    const [thumbnails, label, tooltip] = await Promise.all([
        getBatchThumbnails(
            mutualIds.slice(0, MAX_PREVIEW_AVATARS),
            'AvatarHeadshot',
            '48x48',
        ),
        t('mutualFriends.pill', { count: mutualIds.length }),
        t('mutualFriends.tooltip'),
    ]);

    observeElement(
        '.user-profile-header-info .stylistic-alts-username',
        (username) => {
            const targetContainer = username.parentElement;
            if (!targetContainer) return;
            if (targetContainer.querySelector(`.${PILL_CLASS}`)) return;

            const pill = createPill(
                createPillContent(thumbnails, label),
                tooltip,
                {
                    size: 'small',
                    isButton: true,
                },
            );
            pill.classList.add(PILL_CLASS);
            pill.setAttribute('role', 'button');
            pill.tabIndex = 0;
            pill.addEventListener('click', () =>
                openMutualFriendsOverlay(mutualIds),
            );
            pill.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openMutualFriendsOverlay(mutualIds);
                }
            });

            getProfileHeaderPillGroup(targetContainer).appendChild(pill);
        },
    );
}

export function init() {
    initMutualFriends();
}
