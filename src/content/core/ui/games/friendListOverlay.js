import { createOverlay } from '../overlay.js';
import {
    createThumbnailElement,
    fetchThumbnails,
} from '../../thumbnail/thumbnails.js';
import { followUser } from '../../utils/launcher.js';
import { createButton } from '../buttons.js';
import { getCachedFriendsList } from '../../utils/trackers/friendslist.js';
import { t } from '../../locale/i18n.js';

export async function showFriendListOverlay(friends, gameName) {
    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '12px';

    const cachedFriends = await getCachedFriendsList();
    const friendCache = new Map(cachedFriends.map((f) => [f.id, f]));

    const thumbnailMap = await fetchThumbnails(
        friends.map((f) => ({ id: f.id })),
        'AvatarHeadshot',
        '150x150',
        true,
    );

    const overlayTitle = await t('friendsListOverlay.title', { gameName });
    const overlayInstance = createOverlay({
        title: overlayTitle,
        bodyContent: container,
        showLogo: true,
        maxWidth: '600px',
    });

    const joinButtonText = await t('friendsListOverlay.join');

    for (const friend of friends) {
        const friendData = friendCache.get(friend.id) || {};

        const row = document.createElement('div');
        Object.assign(row.style, {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px',
        });

        const left = document.createElement('div');
        Object.assign(left.style, {
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
        });

        const thumbContainer = document.createElement('div');
        Object.assign(thumbContainer.style, {
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            overflow: 'hidden',
            flexShrink: '0',
        });

        const thumbData = thumbnailMap.get(friend.id) || {
            state: 'Blocked',
            imageUrl: '',
        };
        const thumb = createThumbnailElement(
            thumbData,
            friend.name || friendData.displayName,
            'avatar-card-image',
        );
        thumb.style.width = '100%';
        thumb.style.height = '100%';

        thumbContainer.appendChild(thumb);

        const nameContainer = document.createElement('div');
        nameContainer.style.display = 'flex';
        nameContainer.style.flexDirection = 'column';

        const displayName = document.createElement('span');
        displayName.textContent =
            friendData.combinedName ||
            `${friend.displayName || friend.name} (@${friend.username})`;
        displayName.style.fontWeight = '600';
        displayName.style.fontSize = '18px';
        displayName.style.color = 'var(--rovalra-main-text-color)';

        const username = document.createElement('span');
        username.textContent = `@${friendData.username || friend.username}`;
        username.style.fontSize = '14px';
        username.style.color = 'var(--rovalra-secondary-text-color)';

        nameContainer.appendChild(displayName);
        nameContainer.appendChild(username);

        left.appendChild(thumbContainer);
        left.appendChild(nameContainer);

        const joinBtn = createButton(joinButtonText, 'primary');
        joinBtn.style.backgroundColor = 'var(--rovalra-playbutton-color)';
        joinBtn.style.border = 'none';
        joinBtn.style.color = 'var(--rovalra-main-text-color)';
        joinBtn.style.minWidth = '80px';
        joinBtn.onclick = () => {
            followUser(friend.id);
            overlayInstance.close();
        };

        row.appendChild(left);
        row.appendChild(joinBtn);
        container.appendChild(row);
    }
}
