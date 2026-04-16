import { createGameCard } from '../../core/ui/games/gameCard.js';
import { observeElement } from '../../core/observer.js';
import { createItemCard } from '../../core/ui/items/items.js';
import { createRadioButton } from '../../core/ui/general/radio.js';
import { createToggle } from '../../core/ui/general/toggle.js';
import { createPillToggle } from '../../core/ui/general/pillToggle.js';
import { createPill } from '../../core/ui/general/pill.js';
import { createFriendTile } from '../../core/ui/profile/userCard.js';
import { callRobloxApiJson } from '../../core/api.js';
import { getBatchThumbnails } from '../../core/thumbnail/thumbnails.js';
function removeHomeElement() {
    const homeElementToRemove = document.querySelector(
        'li.cursor-pointer.btr-nav-node-header_home.btr-nav-header_home',
    );
    if (homeElementToRemove) homeElementToRemove.remove();
}

async function renderTestPage(contentDiv) {
    if (window.location.pathname.toLowerCase() !== '/test') return;

    contentDiv.innerHTML = '';
    contentDiv.style.position = 'relative';

    const headerContainer = document.createElement('div');
    headerContainer.style.marginBottom = '20px';
    headerContainer.style.padding = '20px 0';

    const h1 = document.createElement('h1');
    h1.textContent = 'RoValra General UI Test';
    h1.style.fontWeight = '800';
    h1.style.fontSize = '2.5em';
    h1.style.margin = '0';

    headerContainer.appendChild(h1);
    contentDiv.appendChild(headerContainer);

    const friendSection = document.createElement('div');
    friendSection.style.marginBottom = '24px';
    const friendHeading = document.createElement('h2');
    friendHeading.textContent = 'Friend Tiles (user 847685835)';
    friendHeading.style.marginBottom = '12px';
    friendSection.appendChild(friendHeading);
    const friendList = document.createElement('div');
    friendList.style.display = 'flex';
    friendList.style.gap = '12px';
    friendList.style.flexWrap = 'wrap';
    friendSection.appendChild(friendList);
    contentDiv.appendChild(friendSection);

    const testUserId = 847685835;
    try {
        const friendsRes = await callRobloxApiJson({
            subdomain: 'friends',
            endpoint: `/v1/users/${testUserId}/friends/find?userSort=2&limit=7`,
        }).catch(() => null);
        const friendItems = friendsRes?.PageItems || [];

        if (friendItems.length > 0) {
            const friendIds = friendItems
                .map((item) => item.id)
                .filter((id) => id > 0);

            const [profilesRes, thumbs] = await Promise.all([
                callRobloxApiJson({
                    subdomain: 'apis',
                    endpoint: '/user-profile-api/v1/user/profiles/get-profiles',
                    method: 'POST',
                    body: {
                        userIds: friendIds,
                        fields: [
                            'names.combinedName',
                            'isVerified',
                            'names.username',
                        ],
                    },
                }),
                getBatchThumbnails(friendIds, 'AvatarHeadshot', '150x150'),
            ]);

            const profileMap = new Map(
                (profilesRes?.profileDetails || []).map((p) => [p.userId, p]),
            );
            const thumbMap = new Map(thumbs.map((t) => [t.targetId, t]));

            friendItems.forEach((item) => {
                const isHidden = item.id === -1;
                const profile = isHidden ? null : profileMap.get(item.id);
                if (!isHidden && !profile) return;

                const thumbData = isHidden
                    ? { state: 'Error' }
                    : thumbMap.get(item.id);
                const displayName = isHidden
                    ? 'Hidden User'
                    : profile.names.combinedName;
                const username = isHidden ? '' : `@${profile.names.username}`;

                const tile = createFriendTile(item, thumbData, {
                    displayName,
                    username,
                    isHidden,
                });
                friendList.appendChild(tile);
            });
        }
    } catch (e) {
        console.error('RoValra: Failed to load friend tiles', e);
    }

    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.gap = '20px';
    container.style.flexWrap = 'wrap';
    contentDiv.appendChild(container);

    const gameId = 1818;
    const card = createGameCard(gameId);
    container.appendChild(card);
    const fregameId = 70845479499574;
    const frecard = createGameCard(fregameId);
    container.appendChild(frecard);
    const LonggameId = 14056754882;
    const Longcard = createGameCard(LonggameId);
    container.appendChild(Longcard);
    const itemId = 48894692;
    const itemCard = createItemCard(itemId);
    container.appendChild(itemCard);
    const freeitemId = 3443038622;
    const freeitemCard = createItemCard(freeitemId);
    container.appendChild(freeitemCard);
    const ugclimited = createItemCard(126708761692926);
    container.appendChild(ugclimited);
    const deletedItem = createItemCard(17845088792);
    container.appendChild(deletedItem);

    const limiteduid = 16477149823;
    const limiteduitemCard = createItemCard(limiteduid);
    container.appendChild(limiteduitemCard);
    const limitedid = 76233968067050;
    const limiteditemCard = createItemCard(limitedid);
    container.appendChild(limiteditemCard);
    const radio = createRadioButton();
    container.appendChild(radio);
    const toggle = createToggle('RoValra-Toggle');
    container.appendChild(toggle);
    const pill = createPill('Test test');
    container.appendChild(pill);
    const pillToggle = createPillToggle({
        options: [
            { text: 'Option 1', value: 1 },
            { text: 'Option 2', value: 2, tooltip: 'A tooltip for option 2' },
            { text: 'Option 3', value: 3 },
            { text: '4', value: 4 },
        ],
        initialValue: 2,
        onChange: (value) => console.log('Pill Toggle changed to:', value),
    });
    container.appendChild(pillToggle);
    removeHomeElement();
}

export function init() {
    chrome.storage.local.get('eastereggslinksEnabled', (result) => {
        if (result.eastereggslinksEnabled) {
            observeElement('.content#content', (cDiv) => {
                renderTestPage(cDiv);
            });
        }
    });
}
