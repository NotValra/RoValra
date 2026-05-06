import { observeElement } from '../../../core/observer.js';
import { createOverlay } from '../../../core/ui/overlay.js';
import { getUsernameFromPageData } from '../../../core/utils.js';
import { createDropdown } from '../../../core/ui/dropdown.js';

import { getOrCreateRovalraContainer } from './rap.js';
import { createProfileHeaderButton } from '../../../core/ui/profile/header/button.js';
import DOMPurify from 'dompurify';
import { User } from '../../../core/user.js';
import { ts } from '../../../core/locale/i18n.js';
import { getUserIdFromUrl } from '../../../core/idExtractor.js';
import { callRobloxApi } from '../../../core/api.js';
import { createGamePassCard } from '../../../core/ui/games/gamePassCard.js';
import { createShimmerGrid } from '../../../core/ui/shimmer.js';
import { createPill } from '../../../core/ui/general/pill.js';
import { showSystemAlert } from '../../../core/ui/roblox/alert.js';
import { showConfirmationPrompt } from '../../../core/ui/confirmationPrompt.js';

const CONFIG = {
    PAGE_SIZE: 50,
    DONATION_PAGE_SIZE: 24,
    ACCESS_FILTER: 2,
    RETRY: {
        MAX_ATTEMPTS: 5,
        DELAY_MS: 3000,
    },
};

const gamePassCache = new Map();

async function fetchWithRetry(options) {
    let delay = CONFIG.RETRY.DELAY_MS;

    for (let i = 0; i <= CONFIG.RETRY.MAX_ATTEMPTS; i++) {
        try {
            const response = await callRobloxApi(options);

            if (response.status === 429) {
                if (i === CONFIG.RETRY.MAX_ATTEMPTS)
                    throw new Error('Rate limit exceeded');
                await new Promise((r) => setTimeout(r, delay));
                delay *= 2;
                continue;
            }

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response;
        } catch (err) {
            if (i >= CONFIG.RETRY.MAX_ATTEMPTS) return null;
            await new Promise((r) => setTimeout(r, delay));
            delay *= 2;
        }
    }
    return null;
}

async function checkInventoryPublic(userId) {
    const res = await fetchWithRetry({
        subdomain: 'inventory',
        endpoint: `/v1/users/${userId}/can-view-inventory`,
    });
    const data = res ? await res.json().catch(() => null) : null;
    return data?.canView === true;
}

async function getGamesFromInventory(userId) {
    let games = [];
    const seenIds = new Set();
    let nextCursor = '';

    do {
        const res = await fetchWithRetry({
            subdomain: 'inventory',
            endpoint: `/v1/users/${userId}/places/inventory?cursor=${nextCursor}&itemsPerPage=100&placesTab=Created`,
        });
        const data = res ? await res.json().catch(() => null) : null;

        if (data?.data) {
            const formattedGames = [];
            for (const item of data.data) {
                if (item.universeId != null && !seenIds.has(item.universeId)) {
                    seenIds.add(item.universeId);
                    formattedGames.push({ id: item.universeId });
                }
            }

            games = games.concat(formattedGames);
            nextCursor = data.nextPageCursor;
        } else {
            nextCursor = null;
        }
    } while (nextCursor);

    return games;
}

async function getGamesFromV2(userId) {
    let games = [];
    let nextCursor = null;

    do {
        const res = await fetchWithRetry({
            subdomain: 'games',
            endpoint: `/v2/users/${userId}/games?accessFilter=${CONFIG.ACCESS_FILTER}&limit=50&sortOrder=Asc&cursor=${nextCursor || ''}`,
        });
        const data = res ? await res.json().catch(() => null) : null;

        if (data?.data) {
            const formattedGames = data.data
                .filter((item) => item.id != null && item.rootPlace)
                .map((item) => ({
                    id: item.id,
                }));

            games = games.concat(formattedGames);
            nextCursor = data.nextPageCursor;
        } else {
            nextCursor = null;
        }
    } while (nextCursor);

    return games;
}

async function fetchUserGames(userId) {
    try {
        const isPublic = await checkInventoryPublic(userId);
        return isPublic
            ? await getGamesFromInventory(userId)
            : await getGamesFromV2(userId);
    } catch (error) {
        console.error('RoValra: Error fetching user games:', error);
        return [];
    }
}

async function fetchGamePassesForUniverse(universeId) {
    let allGamePasses = [];
    let cursor = null;
    const pageSize = 50;

    try {
        do {
            const response = await callRobloxApi({
                subdomain: 'apis',
                endpoint: `/game-passes/v1/universes/${universeId}/game-passes?pageSize=100&passView=Full${cursor ? `&pageToken=${cursor}` : ''}`,
                method: 'GET',
            });

            if (!response.ok) {
                console.warn(
                    `RoValra: Failed to fetch game passes for universe ${universeId}: ${response.status}`,
                );
                break;
            }

            const data = await response.json();
            allGamePasses = allGamePasses.concat(data.gamePasses);
            cursor = data.nextPageToken;
        } while (cursor);
    } catch (error) {
        console.error(
            `RoValra: Error fetching game passes for universe ${universeId}:`,
            error,
        );
        return [];
    }
    return allGamePasses;
}

async function showGamePassSelectionOverlay(userId, username) {
    let allGamePasses = [];
    let displayedCount = 0;
    let currentSortValue = 'asc';

    const bodyContent = document.createElement('div');
    bodyContent.style.cssText =
        'display: flex; flex-direction: column; gap: 16px;';

    const loadingMessage = document.createElement('p');
    loadingMessage.className = 'text-secondary';
    loadingMessage.style.display = 'none';
    bodyContent.appendChild(loadingMessage);

    const sortContainer = document.createElement('div');
    sortContainer.style.cssText =
        'display: flex; justify-content: flex-start; width: 100%;';

    const sortDropdown = createDropdown({
        items: [
            { label: 'Price (Low to High)', value: 'asc' },
            { label: 'Price (High to Low)', value: 'desc' },
        ],
        initialValue: 'asc',
        onValueChange: (value) => {
            currentSortValue = value;
            if (!allGamePasses || allGamePasses.length === 0) return;

            if (value === 'asc') {
                allGamePasses.sort((a, b) => (a.price || 0) - (b.price || 0));
            } else {
                allGamePasses.sort((a, b) => (b.price || 0) - (a.price || 0));
            }

            displayedCount = 0;
            gamePassListContainer.innerHTML = '';
            renderNextBatch();
        },
    });

    sortContainer.appendChild(sortDropdown.element);
    bodyContent.appendChild(sortContainer);

    const gamePassListContainer = document.createElement('div');
    gamePassListContainer.style.cssText =
        'display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; padding: 0; margin: 0;';
    gamePassListContainer.appendChild(
        createShimmerGrid(12, { width: '150px', height: '240px' }),
    );
    bodyContent.appendChild(gamePassListContainer);

    const loadMoreContainer = document.createElement('div');
    loadMoreContainer.style.cssText =
        'display: flex; justify-content: center; padding: 10px 0; width: 100%;';

    const loadMoreBtn = document.createElement('button');
    loadMoreBtn.className = 'btn-control-md';
    loadMoreBtn.style.width = '100%';
    loadMoreBtn.textContent = ts('subplaces.loadMore');
    loadMoreBtn.style.display = 'none';
    loadMoreContainer.appendChild(loadMoreBtn);
    bodyContent.appendChild(loadMoreContainer);

    const renderNextBatch = () => {
        const nextBatch = allGamePasses.slice(
            displayedCount,
            displayedCount + CONFIG.DONATION_PAGE_SIZE,
        );
        nextBatch.forEach((gamePass) => {
            const card = createGamePassCard(gamePass);
            gamePassListContainer.appendChild(card);
        });
        displayedCount += nextBatch.length;
        loadMoreBtn.style.display =
            displayedCount < allGamePasses.length ? 'block' : 'none';
    };

    loadMoreBtn.onclick = () => renderNextBatch();

    const { overlay, close } = createOverlay({
        title: `${username}'s Game Passes`,
        bodyContent: bodyContent,
        maxWidth: '800px',
        maxHeight: '80vh',
    });

    const header = overlay.querySelector('.rovalra-overlay-header');
    if (header) {
        const copyPill = createPill('Copy Donation Link', null, {
            isButton: true,
            size: 'small',
        });
        copyPill.style.marginLeft = '12px';
        copyPill.addEventListener('click', (e) => {
            e.preventDefault();
            showConfirmationPrompt({
                title: 'Copy Donation Link',
                message:
                    'This copies a special link to this profile. When a RoValra user opens it, this donation menu will automatically appear.<br><br><strong>Note:</strong> Only RoValra users will see the donation window, others will see the standard profile.',
                confirmText: 'Copy Link',
                onConfirm: () => {
                    const url = `https://www.roblox.com/users/${userId}/profile?RoValra-Donation-Link`;
                    navigator.clipboard.writeText(url).then(() => {
                        showSystemAlert(
                            'Donation link copied successfully!',
                            'success',
                        );
                        close();
                    });
                },
            });
        });
        header.appendChild(copyPill);
    }

    if (gamePassCache.has(userId)) {
        allGamePasses = gamePassCache.get(userId);

        if (currentSortValue === 'asc') {
            allGamePasses.sort((a, b) => (a.price || 0) - (b.price || 0));
        } else {
            allGamePasses.sort((a, b) => (b.price || 0) - (a.price || 0));
        }

        gamePassListContainer.innerHTML = '';
        if (allGamePasses.length === 0) {
            loadingMessage.style.display = 'block';
            loadingMessage.textContent = `No game passes found for ${username}'s games.`;
        } else {
            renderNextBatch();
        }
        return;
    }

    try {
        const userGames = await fetchUserGames(userId);

        for (const game of userGames) {
            const passes = await fetchGamePassesForUniverse(game.id);
            const forSalePasses = passes.filter(
                (pass) => pass && pass.isForSale,
            );
            allGamePasses = allGamePasses.concat(forSalePasses);
        }

        if (currentSortValue === 'asc') {
            allGamePasses.sort((a, b) => (a.price || 0) - (b.price || 0));
        } else {
            allGamePasses.sort((a, b) => (b.price || 0) - (a.price || 0));
        }

        gamePassCache.set(userId, allGamePasses);

        if (allGamePasses.length === 0) {
            gamePassListContainer.innerHTML = '';
            loadingMessage.style.display = 'block';
            loadingMessage.textContent = `No game passes found for ${username}'s games.`;
            return;
        }

        gamePassListContainer.innerHTML = '';
        if (allGamePasses.length === 0) {
            loadingMessage.style.display = 'block';
            loadingMessage.textContent = `No game passes found for ${username}'s games.`;
        } else {
            renderNextBatch();
        }
    } catch (error) {
        console.error('RoValra: Error in showGamePassSelectionOverlay:', error);
        gamePassListContainer.innerHTML = '';
        loadingMessage.style.display = 'block';
        loadingMessage.textContent = `Error loading game passes: ${error.message}`;
    }
}

async function addDonationButton(observedElement) {
    const username = await getUsernameFromPageData();
    const buttonIdentifier = 'rovalra-donation-button';
    const targetContainer = getOrCreateRovalraContainer(observedElement);

    if (!targetContainer) return;
    if (targetContainer.querySelector(`.${buttonIdentifier}`)) return;

    const robuxIcon = document.createElement('span');
    robuxIcon.className = 'icon-robux-16x16';
    Object.assign(robuxIcon.style, {
        filter: 'brightness(0)',
    });

    const buttonText = document.createElement('span');
    buttonText.innerText = ts('donationLink.donate');
    buttonText.style.color = '#181818ff';
    const donationButton = createProfileHeaderButton({
        id: buttonIdentifier,
        content: [robuxIcon, buttonText],
        backgroundColor: '#04ff00ff',
        onClick: (event) => {
            event.preventDefault();
            const userId = getUserIdFromUrl();
            if (userId && username) {
                showGamePassSelectionOverlay(userId, username);
            } else {
                console.error(
                    'Could not get user ID or username for donation button.',
                );
            }
        },
    });
    targetContainer.appendChild(donationButton);
}

export function init() {
    const userId = getUserIdFromUrl();
    if (userId && window.location.search.includes('RoValra-Donation-Link')) {
        getUsernameFromPageData().then((username) => {
            if (username) {
                showGamePassSelectionOverlay(userId, username);
            }
        });
    }

    chrome.storage.local.get({ donationbuttonEnable: true }, function (data) {
        if (data.donationbuttonEnable) {
            observeElement(
                '.flex-nowrap.gap-small.flex, .profile-header-names',
                addDonationButton,
                { multiple: true },
            );
        }
    });
}
