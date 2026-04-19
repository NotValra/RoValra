import { getCachedFriendsList } from '../../../core/utils/trackers/friendslist.js';
import { callRobloxApiJson } from '../../../core/api.js';
import { createPill } from '../../../core/ui/general/pill.js';
import { fetchThumbnails } from '../../../core/thumbnail/thumbnails.js';
import { ts } from '../../../core/locale/i18n.js';
import { getUserIdFromUrl } from '../../../core/idExtractor.js';
import { observeElement } from '../../../core/observer.js';
import { createInteractiveTimestamp } from '../../../core/ui/time/time.js';
import { fetchPresenceBatched } from '../../../core/ui/profile/userCard.js';

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

async function initLastOnline() {
    const userId = Number(getUserIdFromUrl());
    if (!userId) return;

    const friendsList = await getCachedFriendsList();
    const friend = friendsList.find((f) => f.id === userId);

    if (!friend || !friend.lastOnline) return;

    observeElement(
        '.profile-header-overlay .flex-nowrap.gap-small.flex',
        async (targetContainer) => {
            if (targetContainer.querySelector('.rovalra-last-online-pill'))
                return;

            if (targetContainer.querySelector('.roseal-user-last-seen-v2'))
                return;

            const presence = await fetchPresenceBatched(userId);
            const presenceType = presence?.userPresenceType ?? 0;

            let pillContent;
            if (presenceType > 0) {
                pillContent = 'Last seen now';
            } else {
                pillContent = document.createElement('span');
                pillContent.style.display = 'inline';

                const timeElement = createInteractiveTimestamp(
                    new Date(friend.lastOnline),
                );
                timeElement.style.display = 'inline';
                timeElement.style.marginLeft = '0';

                pillContent.appendChild(document.createTextNode('Last seen '));
                pillContent.appendChild(timeElement);
            }

            const pill = createPill(pillContent);
            pill.classList.add('rovalra-last-online-pill');

            const lastPlayedPill = targetContainer.querySelector(
                '.rovalra-last-played-pill',
            );
            if (lastPlayedPill) {
                targetContainer.insertBefore(pill, lastPlayedPill);
            } else {
                targetContainer.appendChild(pill);
            }
        },
    );
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

                pill.addEventListener('click', () => {
                    window.location.replace(
                        `https://www.roblox.com/games/${gameData.rootPlaceId}/-`,
                    );
                });

                const lastOnlinePill = targetContainer.querySelector(
                    '.rovalra-last-online-pill',
                );
                if (lastOnlinePill && lastOnlinePill.nextSibling) {
                    targetContainer.insertBefore(
                        pill,
                        lastOnlinePill.nextSibling,
                    );
                } else if (lastOnlinePill) {
                    targetContainer.appendChild(pill);
                } else {
                    targetContainer.appendChild(pill);
                }
            }
        },
    );
}

export function init() {
    chrome.storage.local.get({ lastOnlineEnabled: true }, (data) => {
        if (data.lastOnlineEnabled) {
            initLastOnline();
        }
    });
    chrome.storage.local.get({ lastPlayedTogetherEnabled: true }, (data) => {
        if (data.lastPlayedTogetherEnabled) {
            initLastPlayed();
        }
    });
}
