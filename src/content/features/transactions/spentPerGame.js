import { observeElement } from '../../core/observer.js';
import {
    createThumbnailElement,
    fetchThumbnails,
} from '../../core/thumbnail/thumbnails.js';
import { createDropdown } from '../../core/ui/dropdown.js';
import { createStyledInput } from '../../core/ui/catalog/input.js';
import { createProfileHeaderButton } from '../../core/ui/profile/header/button.js';
import { createRobuxIcon } from '../../core/ui/robuxIcon.js';
import { getUniversesDetails } from '../../core/apis/games.js';
import { getAllGameSpending } from '../../core/utils/trackers/transactions.js';
import { createShimmerBlock } from '../../core/ui/shimmer.js';
import { ts } from '../../core/locale/i18n.js';
import { settings } from '../../core/settings/getSettings.js';
import { getAssets } from '../../core/assets.js';

const ROW_SELECTOR = 'table.table.summary tr';
const ROW_MARKER = 'data-rovalra-spent-per-game';
const INITIAL_GAME_COUNT = 5;
const GAME_PAGE_SIZE = 5;

const SORTS = [
    { value: 'spent', label: 'spentPerGame.mostSpent' },
    { value: 'transactions', label: 'spentPerGame.mostPurchases' },
];

async function loadGameSpending() {
    return getAllGameSpending();
}

async function loadGameDetails(games) {
    games = Array.isArray(games) ? games : [];
    if (!games.length) return [];

    const details = [];
    for (let index = 0; index < games.length; index += 50) {
        const batch = games.slice(index, index + 50);
        const batchDetails = await getUniversesDetails(
            batch.map((game) => game.id),
        );
        details.push(...(Array.isArray(batchDetails) ? batchDetails : []));
    }

    const detailsByUniverseId = new Map(
        details.map((game) => [String(game.id), game]),
    );

    return games.flatMap((game) => {
        const gameDetails = detailsByUniverseId.get(String(game.id));
        if (!gameDetails?.rootPlaceId || !gameDetails.name) return [];

        return [
            {
                ...game,
                id: gameDetails.rootPlaceId,
                name: gameDetails.name,
                universeId: game.id,
            },
        ];
    });
}

function sortGames(games, sort) {
    return [...games].sort((a, b) => {
        if (sort === 'transactions') {
            return (
                b.totalTransactions - a.totalTransactions ||
                b.totalSpent - a.totalSpent
            );
        }
        return (
            b.totalSpent - a.totalSpent ||
            String(a.id).localeCompare(String(b.id))
        );
    });
}

function createAmountElement(amount) {
    const amountElement = document.createElement('span');
    amountElement.className = 'icon-robux-container';
    amountElement.style.display = 'inline-flex';
    amountElement.style.alignItems = 'center';
    amountElement.style.gap = '4px';

    const icon = createRobuxIcon({ size: '16px' });
    const value = document.createElement('span');
    value.className = 'text-robux';
    value.textContent = amount.toLocaleString();
    amountElement.append(icon, value);
    return amountElement;
}

function createGameShimmerList(count) {
    const list = document.createElement('div');
    list.style.display = 'grid';
    list.style.gap = '8px';

    for (let index = 0; index < count; index++) {
        const item = document.createElement('div');
        item.style.display = 'flex';
        item.style.alignItems = 'center';
        item.style.gap = '10px';
        item.style.minHeight = '50px';

        const thumbnail = createShimmerBlock({
            width: '42px',
            height: '42px',
            borderRadius: '6px',
        });
        thumbnail.style.flex = '0 0 42px';

        const details = document.createElement('div');
        details.style.display = 'grid';
        details.style.gap = '6px';
        details.style.minWidth = '0';
        details.style.flex = '1';
        details.append(
            createShimmerBlock({ width: '65%', height: '14px' }),
            createShimmerBlock({ width: '35%', height: '12px' }),
        );

        const amount = createShimmerBlock({ width: '58px', height: '16px' });
        item.append(thumbnail, details, amount);
        list.appendChild(item);
    }

    return list;
}

function showGameShimmers(container, count, append = false) {
    const shimmerList = createGameShimmerList(count);
    if (!append) {
        container.replaceChildren(shimmerList);
        return;
    }

    const loadMore = container.lastElementChild;
    if (loadMore?.tagName === 'BUTTON') {
        container.insertBefore(shimmerList, loadMore);
    } else {
        container.appendChild(shimmerList);
    }
}

async function renderGames(
    container,
    games,
    sort,
    visibleCount,
    onLoadMore,
    totalGameCount,
) {
    games = Array.isArray(games) ? games : [];
    totalGameCount = Number.isFinite(totalGameCount)
        ? totalGameCount
        : games.length;
    if (!games.length) {
        container.replaceChildren();
        container.textContent = ts('spentPerGame.noPurchases');
        return;
    }

    const sortedGames = sortGames(games, sort);
    const visibleGames = sortedGames.slice(0, visibleCount);
    const thumbnails = await fetchThumbnails(
        visibleGames.map((game) => ({ id: game.universeId })),
        'GameIcon',
        '150x150',
    );

    const list = document.createElement('div');
    list.style.display = 'grid';
    list.style.gap = '8px';

    for (const game of visibleGames) {
        const item = document.createElement('div');
        item.style.display = 'flex';
        item.style.alignItems = 'center';
        item.style.gap = '10px';
        item.style.minHeight = '50px';

        const thumbnail = createThumbnailElement(
            thumbnails.get(Number(game.universeId)),
            game.name,
            'rovalra-spent-game-thumbnail',
            {
                width: '42px',
                height: '42px',
                flex: '0 0 42px',
                borderRadius: '6px',
            },
        );

        const details = document.createElement('div');
        details.style.minWidth = '0';
        details.style.flex = '1';

        const name = document.createElement('div');
        name.textContent = game.name;
        name.style.overflow = 'hidden';
        name.style.textOverflow = 'ellipsis';
        name.style.whiteSpace = 'nowrap';

        const count = document.createElement('span');
        count.style.fontSize = '12px';
        count.style.opacity = '0.7';
        count.textContent =
            game.totalTransactions === 1
                ? ts('spentPerGame.singlePurchase')
                : ts('spentPerGame.multiplePurchases', {
                      count: game.totalTransactions,
                  });

        details.append(name, count);

        const gameLink = document.createElement('a');
        gameLink.href = `https://www.roblox.com/games/${encodeURIComponent(game.id)}`;
        gameLink.target = '_blank';
        gameLink.rel = 'noopener noreferrer';
        gameLink.style.display = 'flex';
        gameLink.style.alignItems = 'center';
        gameLink.style.gap = '10px';
        gameLink.style.minWidth = '0';
        gameLink.style.flex = '1';
        gameLink.style.color = 'inherit';
        gameLink.style.textDecoration = 'none';
        gameLink.append(thumbnail, details);

        item.append(gameLink, createAmountElement(game.totalSpent));
        list.appendChild(item);
    }

    container.replaceChildren();
    container.appendChild(list);

    if (visibleCount < totalGameCount) {
        const loadMore = createProfileHeaderButton({
            content: ts('spentPerGame.loadMore', {
                remaining: totalGameCount - visibleCount,
            }),
            onClick: () => onLoadMore(),
        });
        loadMore.style.marginTop = '10px';
        container.appendChild(loadMore);
    }
}

function addSpentPerGameSection(table) {
    if (table.nextElementSibling?.hasAttribute(ROW_MARKER)) return;

    const section = document.createElement('section');
    section.setAttribute(ROW_MARKER, 'true');
    section.className = 'rovalra-spent-per-game-summary';
    section.style.marginTop = '16px';
    section.style.paddingTop = '16px';
    section.style.borderTop =
        '1px solid var(--rovalra-border-color, rgba(255, 255, 255, 0.12))';

    const controls = document.createElement('div');
    controls.style.display = 'flex';
    controls.style.alignItems = 'center';
    controls.style.flexWrap = 'wrap';
    controls.style.gap = '8px';
    controls.style.marginBottom = '10px';

    const title = document.createElement('h3');
    title.style.margin = '0';
    const logo = document.createElement('img');
    logo.dataset.rovalraAsset = 'rovalraIcon';
    logo.src = getAssets().rovalraIcon;
    logo.alt = '';
    logo.style.width = '20px';
    logo.style.height = '20px';
    logo.style.verticalAlign = 'middle';
    logo.style.marginRight = '3px';
    title.append(logo, document.createTextNode(ts('spentPerGame.title')));

    const disclaimer = document.createElement('small');
    disclaimer.textContent = ts('spentPerGame.disclaimer');
    disclaimer.style.color = 'var(--rovalra-secondary-text-color)';

    const titleGroup = document.createElement('div');
    titleGroup.style.display = 'grid';
    titleGroup.style.gap = '2px';
    titleGroup.style.marginRight = 'auto';
    titleGroup.append(title, disclaimer);

    const totalAmount = document.createElement('div');
    totalAmount.style.display = 'inline-flex';
    totalAmount.style.alignItems = 'center';
    totalAmount.style.lineHeight = '1';

    const search = createStyledInput({
        id: `rovalra-spent-per-game-search-${Date.now()}`,
        label: ts('spentPerGame.searchPlaceholder'),
    });
    search.container.style.width = '220px';

    const sortContainer = document.createElement('div');
    controls.append(titleGroup, totalAmount, search.container, sortContainer);

    const gamesContainer = document.createElement('div');
    gamesContainer.textContent = ts('spentPerGame.loading');
    const scanStatus = document.createElement('div');
    scanStatus.style.marginTop = '8px';
    scanStatus.style.fontSize = '12px';
    scanStatus.style.opacity = '0.7';
    section.append(controls, gamesContainer, scanStatus);
    table.insertAdjacentElement('afterend', section);

    let loadedGames = null;
    let allGames = null;
    const loadedGameDetails = new Map();
    let currentSort = 'spent';
    let searchQuery = '';
    let visibleCount = INITIAL_GAME_COUNT;
    let loading = false;

    const getSearchCandidates = () => {
        const games = Array.isArray(allGames) ? allGames : [];
        return sortGames(games, currentSort).filter((game) =>
            String(game.name || '')
                .toLocaleLowerCase()
                .includes(searchQuery),
        );
    };

    const getVisibleGames = () => loadedGames || [];

    const loadVisibleGames = async () => {
        const candidates = getSearchCandidates().slice(0, visibleCount);
        const missingDetails = candidates.filter(
            (game) => !loadedGameDetails.has(String(game.id)),
        );
        const details = await loadGameDetails(missingDetails);
        details.forEach((game) =>
            loadedGameDetails.set(String(game.universeId), game),
        );
        loadedGames = candidates.flatMap(
            (game) => loadedGameDetails.get(String(game.id)) || [],
        );
    };

    const renderCurrentGames = async () => {
        const searchCandidates = getSearchCandidates();
        await renderGames(
            gamesContainer,
            getVisibleGames(),
            currentSort,
            visibleCount,
            async () => {
                visibleCount += GAME_PAGE_SIZE;
                showGameShimmers(gamesContainer, GAME_PAGE_SIZE, true);
                await loadVisibleGames();
                await renderCurrentGames();
            },
            searchCandidates.length,
        );
    };

    const updateTotalAmount = () => {
        if (!allGames) return;
        const total = allGames.reduce((sum, game) => sum + game.totalSpent, 0);
        totalAmount.replaceChildren(createAmountElement(total));
    };

    const load = async () => {
        if (loadedGames || loading) return;
        loading = true;
        showGameShimmers(gamesContainer, INITIAL_GAME_COUNT);
        try {
            const result = await loadGameSpending();
            allGames = Array.isArray(result?.games) ? result.games : [];
            await loadVisibleGames();
            const dropdown = createDropdown({
                items: SORTS.map((sort) => ({
                    ...sort,
                    label: ts(sort.label),
                })),
                initialValue: currentSort,
                onValueChange: async (value) => {
                    currentSort = value;
                    visibleCount = INITIAL_GAME_COUNT;
                    await loadVisibleGames();
                    await renderCurrentGames();
                },
            });
            sortContainer.appendChild(dropdown.element);
            await renderCurrentGames();
            if (result?.isScanning) {
                scanStatus.textContent = ts('spentPerGame.scanInProgress');
            } else {
                scanStatus.replaceChildren();
            }
            updateTotalAmount();
        } catch (error) {
            gamesContainer.textContent = ts('spentPerGame.loadError');
            console.error('RoValra: Failed to load spending per game', error);
        } finally {
            loading = false;
        }
    };

    search.input.addEventListener('input', () => {
        searchQuery = search.input.value.trim().toLocaleLowerCase();
        visibleCount = INITIAL_GAME_COUNT;
        loadVisibleGames().then(renderCurrentGames);
    });

    load();
}

function processSummary(row) {
    if (!window.location.pathname.startsWith('/transactions')) return;
    const table = row.closest('table.table.summary');
    if (!table) return;

    const label = row.querySelector('.summary-transaction-label');
    if (!label?.textContent?.trim().startsWith('Commissions')) return;
    addSpentPerGameSection(table);
}

export async function init() {
    if (!(await settings.spentPerGameEnabled)) return;

    observeElement(ROW_SELECTOR, processSummary, { multiple: true });
}
