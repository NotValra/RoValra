import { observeElement } from '../../../core/observer.js';
import { createOverlay } from '../../../core/ui/overlay.js';
import { createSearchInput } from '../../../core/ui/general/gameInput.js';
import { createSquareButton } from '../../../core/ui/profile/header/squarebutton.js';
import { launchGame } from '../../../core/utils/launcher.js';
import { callRobloxApi } from '../../../core/api.js';

export function init() {
    chrome.storage.local.get({ userSniperEnabled: false, deeplinkEnabled: true }, function(settings) {
        if (!settings.userSniperEnabled) {
            return;
        }
        const useDeeplinks = settings.deeplinkEnabled;

        let isRunning = false;
        let intervalId;
        let isRateLimited = false;
        let lastRequestTime = 0;
        const requestDelay = 10;
        let hasJoinedGame = false;
        let canMakeRequest = true;

        function getUserIdFromUrl() {
            const path = window.location.pathname;
            const regex = /^\/(?:[a-z]{2}\/)?users\/(\d+)/;
            const match = path.match(regex);
            if (match) {
                return parseInt(match[1], 10);
            } else {
                return null;
            }
        }

        async function sendQueueReservationRequests(userId) {
            const payload = { userIdToFollow: parseInt(userId, 10) };

            for (let i = 0; i < 10; i++) {
                callRobloxApi({
                    subdomain: 'gamejoin',
                    endpoint: '/v1/play-with-user',
                    method: 'POST',
                    body: payload
                }).catch(() => {});

                if (i < 9) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        }

        async function sendPresenceRequest(userId, specificPlaceId = null) {
            if (isRateLimited || !canMakeRequest) {
                return;
            }
            canMakeRequest = false;
            try {
                const response = await callRobloxApi({
                    subdomain: 'presence',
                    endpoint: '/v1/presence/users',
                    method: 'POST',
                    body: { userIds: [userId] }
                });
                if (response.status === 429) {
                    isRateLimited = true;
                    setTimeout(() => {
                        isRateLimited = false;
                    }, 3000);
                    canMakeRequest = true;
                    return;
                }
                if (response.ok) {
                    canMakeRequest = true;
                }
                const data = await response.json();
                if (data && data.userPresences && data.userPresences.length > 0) {
                    const presence = data.userPresences[0];
                    const placeIdMatch = specificPlaceId ? presence.placeId == specificPlaceId : !!presence.placeId;
                    const shouldJoin = placeIdMatch && presence.gameId && presence.userPresenceType === 2;

                    if (shouldJoin) {
                        if (!hasJoinedGame) {
                            sendQueueReservationRequests(userId);
                            if (useDeeplinks) {
                                const joinURL = `roblox://experiences/start?placeId=${presence.placeId}&gameInstanceId=${presence.gameId}`;
                                window.location.href = joinURL;
                            } else {
                                launchGame(presence.placeId, presence.gameId);
                            }
                            hasJoinedGame = true;
                            stopPresenceCheck();
                        }
                        canMakeRequest = true;
                        return;
                    }
                }
                canMakeRequest = true;
                return data;
            } catch (error) {
                canMakeRequest = true;
            }
        }

        function enableForcedHeaders() {
            if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
                chrome.runtime.sendMessage({ action: "enableServerJoinHeaders" });
            }
        }

        function disableForcedHeaders() {
            if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
                chrome.runtime.sendMessage({ action: "disableServerJoinHeaders" });
            }
        }

        function stopPresenceCheck() {
            disableForcedHeaders();
            document.querySelectorAll('.rovalra-instant-join-button').forEach(btn => {
                btn.querySelector('span').textContent = 'Instant Join';
            });
            clearInterval(intervalId);
            isRunning = false;
            hasJoinedGame = false;
        }

        function showConfirmationOverlay(callback) {
            const bodyContent = document.createElement('div');
            bodyContent.style.display = 'flex';
            bodyContent.style.flexDirection = 'column';
            bodyContent.style.gap = '16px';

            const description = document.createElement('p');
            description.className = 'text-body';
            description.innerHTML = `
                This will automatically attempts to join the user as soon as they get into an experience.
                <br><br>
                This requires the user to have their joins enabled for everyone or for you to be friends with them.
            `;

            let selectedGame = null;

            const searchInputComponent = createSearchInput({
                placeholder: 'Search for an experience or enter a Place ID (Optional)',
                style: { width: '100%' },
                onResultSelect: (game) => {
                    selectedGame = game;
                    searchInputComponent.input.value = game.name;
                    searchInputComponent.hideDropdown();
                    continueButton.disabled = false;
                }
            });

            bodyContent.append(description, searchInputComponent.element);

            const continueButton = document.createElement('button');
            continueButton.innerText = 'Continue';
            continueButton.className = 'btn-primary-md';

            const goBackButton = document.createElement('button');
            goBackButton.innerText = 'Cancel';
            goBackButton.className = 'btn-control-md';

            const { close } = createOverlay({
                title: 'Confirm Action',
                bodyContent: bodyContent,
                actions: [goBackButton, continueButton],
                maxWidth: '480px',
            });

            continueButton.onclick = () => {
                let specificPlaceId = null;
                let thumbnailUrl = null;

                if (selectedGame && searchInputComponent.input.value === searchInputComponent.getSelectedGameName()) {
                    specificPlaceId = selectedGame.rootPlaceId;
                    thumbnailUrl = selectedGame.thumbnail?.imageUrl;
                }

                close();
                callback({ confirmed: true, placeId: specificPlaceId, thumbnailUrl: thumbnailUrl });
            };

            goBackButton.onclick = () => {
                close();
                callback(false);
            };
        }

        function addInstantJoinButton(observedElement) {

            const button = createSquareButton({
                content: 'Instant Join',
                id: 'rovalra-instant-join-button',
                textColor: 'var(--rovalra-main-text-color)',
                width: 'auto',
                height: 'height-1000',
                paddingX: 'padding-x-small',
                disableTextTruncation: true
            });
            button.addEventListener('click', async () => {
                const userId = getUserIdFromUrl();
                if (isRunning) {
                    stopPresenceCheck();
                    return;
                }

                showConfirmationOverlay(async (result) => {
                    if (!result.confirmed) {
                        return;
                    }
                    isRunning = true;
                    const specificPlaceId = result.placeId;
                    const thumbnailUrl = result.thumbnailUrl;

                    enableForcedHeaders();
                    document.querySelectorAll('.rovalra-instant-join-button').forEach(btn => {
                        const contentSpan = btn.querySelector('span');
                        contentSpan.innerHTML = '';

                        if (thumbnailUrl) {
                            Object.assign(contentSpan.style, {
                                display: 'flex',
                                alignItems: 'center',
                                gap: '5px'
                            });

                            const thumbImg = document.createElement('img');
                            thumbImg.src = thumbnailUrl;
                            Object.assign(thumbImg.style, { width: '36px', height: '36px', borderRadius: '4px' });
                            contentSpan.appendChild(thumbImg);
                            contentSpan.appendChild(document.createTextNode('Stop Joining'));
                        } else {
                            contentSpan.textContent = 'Stop Joining';
                        }
                        btn.setAttribute('aria-disabled', 'false');
                    });

                    intervalId = setInterval(async () => {
                        const currentTime = Date.now();
                        if (currentTime - lastRequestTime >= requestDelay) {
                            await sendPresenceRequest(userId, specificPlaceId);
                            lastRequestTime = currentTime;
                        }
                    }, 50);
                });
            });

            if (observedElement.querySelector('.rovalra-instant-join-button')) {
                return;
            }

            const loggedInUserIdMeta = document.querySelector('meta[name="user-data"]');
            if (!loggedInUserIdMeta) return;

            const loggedInUserId = parseInt(loggedInUserIdMeta.getAttribute('data-userid'), 10);
            const profileUserId = getUserIdFromUrl();

            if (!profileUserId || loggedInUserId === profileUserId) {
                return;
            }

            button.classList.add('rovalra-instant-join-button');
            button.style.flexGrow = '0';
            button.style.flexShrink = '0';
            button.style.marginRight = '5px';
            observedElement.prepend(button);
        }

        const selector = '.profile-header-buttons, .buttons-show-on-desktop';
        observeElement(selector, addInstantJoinButton, { multiple: true });
    });
}