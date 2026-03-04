import { createOverlay } from '../overlay.js';
import { createThumbnailElement } from '../../thumbnail/thumbnails.js';
import { launchGame } from '../../utils/launcher.js';
import { createButton } from '../buttons.js';

export function showFriendListOverlay(friends, gameName) {
    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '12px';

    friends.forEach(friend => {
        const row = document.createElement('div');
        Object.assign(row.style, {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px',
            borderRadius: '8px'
        });

        const left = document.createElement('div');
        Object.assign(left.style, {
            display: 'flex',
            alignItems: 'center',
            gap: '16px'
        });

        const thumbContainer = document.createElement('div');
        Object.assign(thumbContainer.style, {
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            overflow: 'hidden'
        });
        
        const thumbData = { state: 'Completed', imageUrl: friend.thumbnailUrl };
        const thumb = createThumbnailElement(thumbData, friend.name, 'avatar-card-image');
        thumb.style.width = '100%';
        thumb.style.height = '100%';
        
        thumbContainer.appendChild(thumb);

        const nameContainer = document.createElement('div');
        nameContainer.style.display = 'flex';
        nameContainer.style.flexDirection = 'column';

        const displayName = document.createElement('span');
        displayName.textContent = friend.displayName || friend.name;
        displayName.style.fontWeight = '600';
        displayName.style.fontSize = '18px';
        displayName.style.color = 'var(--rovalra-main-text-color)';

        const username = document.createElement('span');
        username.textContent = `@${friend.username}`;
        username.style.fontSize = '14px';
        username.style.color = 'var(--rovalra-secondary-text-color)';

        nameContainer.appendChild(displayName);
        nameContainer.appendChild(username);

        left.appendChild(thumbContainer);
        left.appendChild(nameContainer);

        const joinBtn = createButton('Join', 'primary');
        joinBtn.style.backgroundColor = 'var(--rovalra-playbutton-color)';
        joinBtn.style.border = 'none';
        joinBtn.style.color = '#ffffff';
        joinBtn.onclick = () => {
            launchGame(friend.rootPlaceId, friend.gameInstanceId);
        };

        row.appendChild(left);
        row.appendChild(joinBtn);
        container.appendChild(row);
    });

    createOverlay({
        title: `Connections playing ${gameName}`,
        bodyContent: container,
        showLogo: true,
        maxWidth: '600px'
    });
}
