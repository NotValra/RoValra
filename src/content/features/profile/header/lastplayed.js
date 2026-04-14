import { getCachedFriendsList } from '../../../core/utils/trackers/friendslist.js';
import { callRobloxApiJson } from '../../../core/api.js';
import { createPill } from '../../../core/ui/general/pill.js';
import { fetchThumbnails } from '../../../core/thumbnail/thumbnails.js';
import { ts } from '../../../core/locale/i18n.js';
import { getUserIdFromUrl } from '../../../core/idExtractor.js';
import { observeElement } from '../../../core/observer.js';

async function fetchGameData(universeId) {
    try {
        const response = await callRobloxApiJson({
            subdomain: 'games',
            endpoint: `/v1/games?universeIds=${universeId}`,
            useBackground: true,
        });

        if (response && response.data && response.data.length > 0) {
            return response.data[0];
        }
    } catch (error) {
        console.error('RoValra: Failed to fetch game name', error);
    }
    return null;
}

async function getGameThumbnail(universeId) {
    try {
        const items = [{ id: universeId }];
        const thumbnailMap = await fetchThumbnails(
            items,
            'GameIcon',
            '150x150',
            false,
        );
        return thumbnailMap.get(Number(universeId));
    } catch (error) {
        console.error('RoValra: Failed to fetch game thumbnail', error);
    }
    return null;
}

async function initLastPlayed() {
    const userId = Number(getUserIdFromUrl());
    if (!userId) return;

    const friendsList = await getCachedFriendsList();
    const friend = friendsList.find((f) => f.id === userId);

    if (!friend || !friend.mostFrequentUniverseId) return;

    const universeId = friend.mostFrequentUniverseId;

    observeElement(
        '.profile-header-overlay .flex-nowrap.gap-small.flex',
        async (targetContainer) => {
            if (targetContainer.querySelector('.rovalra-last-played-pill'))
                return;

            const [gameData, thumbnail] = await Promise.all([
                fetchGameData(universeId),
                getGameThumbnail(universeId),
            ]);

            if (gameData && gameData.name) {
                const pillOptions = {
                    isButton: true,
                    iconUrl: thumbnail?.imageUrl || null,
                };

                const pill = createPill(
                    gameData.name,
                    ts('lastPlayed.together'),
                    pillOptions,
                );
                pill.classList.add('rovalra-last-played-pill');
                pill.style.marginLeft = '4px';

                pill.addEventListener('click', () => {
                    window.location.replace(
                        `https://www.roblox.com/games/${gameData.rootPlaceId}/-`,
                    );
                });
                targetContainer.appendChild(pill);
            }
        },
    );
}

export function init() {
    if (!window.location.pathname.startsWith('/users/')) return;
    chrome.storage.local.get({ lastPlayedTogetherEnabled: true }, (data) => {
        if (data.lastPlayedTogetherEnabled) {
            initLastPlayed();
        }
    });
}
