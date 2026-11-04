import { observeElement } from '../../core/observer.js';
import {
    createThumbnailElement,
    fetchThumbnails,
} from '../../core/thumbnail/thumbnails.js';
import { createBarChart } from '../../core/ui/barChart.js';
import { createDropdown } from '../../core/ui/dropdown.js';
import { createStyledInput } from '../../core/ui/catalog/input.js';
import { createPillToggle } from '../../core/ui/general/pillToggle.js';
import { createToggle } from '../../core/ui/general/toggle.js';
import { createProfileHeaderButton } from '../../core/ui/profile/header/button.js';
import { createRobuxIcon } from '../../core/ui/robuxIcon.js';
import { createShimmerBlock } from '../../core/ui/shimmer.js';
import { getUniversesDetails } from '../../core/apis/games.js';
import { getPurchasedItems } from '../../core/utils/purchasedItems.js';
import {
    getTransactionData,
    onTransactionDataChanged,
} from '../../core/utils/trackers/transactions.js';
import { ts } from '../../core/locale/i18n.js';
import { settings } from '../../core/settings/getSettings.js';
import { getAssets } from '../../core/assets.js';

const ROW_SELECTOR = '#transactions-web-app .summary table.summary tr';
const ROW_MARKER = 'data-rovalra-spending';
const PAGE_SIZE = 5;
const RELOAD_DEBOUNCE = 2000;
const GROUPINGS = [
    { value: 'month', label: 'spending.byMonth' },
    { value: 'year', label: 'spending.byYear' },
];
const SORTS = [
    { value: 'spent', label: 'spentPerCreator.mostSpent' },
    { value: 'transactions', label: 'spentPerCreator.mostPurchases' },
];
const PURCHASE_SORTS = [
    { value: 'expensive', label: 'spending.mostExpensive' },
    { value: 'cheapest', label: 'spending.cheapest' },
    { value: 'newest', label: 'spending.newest' },
    { value: 'oldest', label: 'spending.oldest' },
];

function getBucketStart(timestamp, grouping) {
    const date = new Date(timestamp);
    return grouping === 'year'
        ? new Date(date.getFullYear(), 0, 1)
        : new Date(date.getFullYear(), date.getMonth(), 1);
}

function nextBucket(date, grouping) {
    return grouping === 'year'
        ? new Date(date.getFullYear() + 1, 0, 1)
        : new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

function formatBucket(start, grouping, long = false) {
    const date = new Date(start);
    return grouping === 'year'
        ? String(date.getFullYear())
        : date.toLocaleDateString(undefined, {
              month: long ? 'long' : 'short',
              year: 'numeric',
          });
}

const formatPurchases = (count) =>
    count === 1
        ? ts('spentPerCreator.singlePurchase')
        : ts('spentPerCreator.multiplePurchases', { count });

function buildTimeline(transactions, allTransactions, grouping) {
    const first = allTransactions.reduce(
        (min, tx) =>
            Number.isFinite(tx.created) ? Math.min(min, tx.created) : min,
        Infinity,
    );
    if (!Number.isFinite(first)) return [];

    const totals = new Map();
    for (const tx of transactions) {
        if (!Number.isFinite(tx.created)) continue;
        const key = getBucketStart(tx.created, grouping).getTime();
        const bucket = totals.get(key) || { spent: 0, count: 0 };
        bucket.spent += tx.amount;
        bucket.count += 1;
        totals.set(key, bucket);
    }

    const end = getBucketStart(Date.now(), grouping).getTime();
    const timeline = [];
    for (
        let date = getBucketStart(first, grouping);
        date.getTime() <= end;
        date = nextBucket(date, grouping)
    ) {
        const start = date.getTime();
        const bucket = totals.get(start) || { spent: 0, count: 0 };
        timeline.push({
            start,
            label: formatBucket(start, grouping),
            value: bucket.spent,
            tooltip: `${formatBucket(start, grouping, true)}<br>${ts('spending.robuxAmount', { amount: bucket.spent.toLocaleString() })} · ${formatPurchases(bucket.count)}`,
        });
    }
    return timeline;
}

function aggregate(transactions, getKey, createEntry) {
    const entries = new Map();
    for (const tx of transactions) {
        const key = getKey(tx);
        if (!key) continue;
        const entry = entries.get(key) || {
            ...createEntry(tx),
            totalSpent: 0,
            totalTransactions: 0,
        };
        entry.totalSpent += tx.amount;
        entry.totalTransactions += 1;
        entries.set(key, entry);
    }
    return [...entries.values()];
}

const getCreators = (transactions, includeGameCreators) =>
    aggregate(
        includeGameCreators
            ? transactions
            : transactions.filter((tx) => !tx.universeId),
        (tx) => tx.creatorId,
        (tx) => ({
            id: tx.creatorId,
            name: tx.creatorName,
            type: tx.creatorType === 'Group' ? 'Group' : 'User',
        }),
    );

const getGames = (transactions) =>
    aggregate(
        transactions,
        (tx) => tx.universeId,
        (tx) => ({ universeId: tx.universeId, name: tx.gameName }),
    );

function sortEntries(entries, sort) {
    return [...entries].sort((a, b) => {
        if (sort === 'transactions') {
            return (
                b.totalTransactions - a.totalTransactions ||
                b.totalSpent - a.totalSpent
            );
        }
        return (
            b.totalSpent - a.totalSpent ||
            String(a.name || '').localeCompare(String(b.name || ''))
        );
    });
}

function sortPurchases(purchases, sort) {
    const byDate = (a, b) => (b.created || 0) - (a.created || 0);
    return [...purchases].sort((a, b) => {
        if (sort === 'newest') return byDate(a, b);
        if (sort === 'oldest') return byDate(b, a);
        if (sort === 'cheapest') return a.amount - b.amount || byDate(a, b);
        return b.amount - a.amount || byDate(a, b);
    });
}

const universeDetails = new Map();

async function loadUniverseDetails(universeIds) {
    const missing = universeIds.filter(
        (id) => !universeDetails.has(String(id)),
    );
    for (let index = 0; index < missing.length; index += 50) {
        const batch = missing.slice(index, index + 50);
        const details = await getUniversesDetails(batch).catch(() => []);
        batch.forEach((id) => universeDetails.set(String(id), null));
        for (const game of Array.isArray(details) ? details : []) {
            universeDetails.set(String(game.id), game);
        }
    }
}

function createAmountElement(amount) {
    const element = document.createElement('span');
    element.className = 'icon-robux-container';
    element.style.display = 'inline-flex';
    element.style.alignItems = 'center';
    element.style.gap = '4px';
    const icon = createRobuxIcon({ size: '16px' });
    const value = document.createElement('span');
    value.className = 'text-robux';
    value.textContent = amount.toLocaleString();
    element.append(icon, value);
    return element;
}

function createShimmerList(count) {
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
        item.append(
            thumbnail,
            details,
            createShimmerBlock({ width: '58px', height: '16px' }),
        );
        list.appendChild(item);
    }
    return list;
}

function createRowList(rows) {
    const list = document.createElement('div');
    list.style.display = 'grid';
    list.style.gap = '8px';
    for (const row of rows) {
        const details = document.createElement('div');
        details.style.minWidth = '0';
        details.style.flex = '1';
        const title = document.createElement('div');
        title.textContent = row.title;
        title.style.overflow = 'hidden';
        title.style.textOverflow = 'ellipsis';
        title.style.whiteSpace = 'nowrap';
        const subtitle = document.createElement('span');
        subtitle.style.fontSize = '12px';
        subtitle.style.opacity = '0.7';
        subtitle.textContent = row.subtitle;
        details.append(title, subtitle);

        const target = document.createElement(row.href ? 'a' : 'div');
        if (row.href) {
            target.href = row.href;
            target.target = '_blank';
            target.rel = 'noopener noreferrer';
        }
        target.style.display = 'flex';
        target.style.alignItems = 'center';
        target.style.gap = '10px';
        target.style.minWidth = '0';
        target.style.flex = '1';
        target.style.color = 'inherit';
        target.style.textDecoration = 'none';
        target.append(row.thumbnail, details);

        const item = document.createElement('div');
        item.style.display = 'flex';
        item.style.alignItems = 'center';
        item.style.gap = '10px';
        item.style.minHeight = '50px';
        item.append(target, createAmountElement(row.amount));
        if (row.action) item.appendChild(row.action);
        list.appendChild(item);
    }
    return list;
}

const thumbnailStyle = {
    width: '42px',
    height: '42px',
    flex: '0 0 42px',
    borderRadius: '6px',
};

const getCreatorUrl = (creator) =>
    creator.type === 'Group'
        ? `https://www.roblox.com/groups/${encodeURIComponent(creator.id)}/-`
        : `https://www.roblox.com/users/${encodeURIComponent(creator.id)}/profile`;

const createViewPurchasesButton = (onClick) =>
    createProfileHeaderButton({
        content: ts('spending.viewPurchases'),
        onClick,
    });

const thumbnailCache = new Map();

async function getThumbnails(ids, type) {
    const thumbnails = await fetchThumbnails(
        ids.map((id) => ({ id })),
        type,
        '150x150',
    );
    thumbnails.forEach((thumbnail, id) => {
        if (thumbnail?.state === 'Completed')
            thumbnailCache.set(`${type}:${id}`, thumbnail);
    });
    return thumbnails;
}

const getCachedThumbnail = (type, id) =>
    thumbnailCache.get(`${type}:${Number(id)}`) || {
        state: 'Pending',
        thumbnailType: type,
    };

const getCreatorThumbnailType = (creator) =>
    creator.type === 'Group' ? 'GroupIcon' : 'AvatarHeadshot';

function createCreatorRow(creator, thumbnail, onSelect) {
    return {
        thumbnail: createThumbnailElement(
            thumbnail,
            creator.name,
            'rovalra-spent-creator-thumbnail',
            thumbnailStyle,
        ),
        title: creator.name || ts('spentPerCreator.unknownCreator'),
        subtitle: formatPurchases(creator.totalTransactions),
        amount: creator.totalSpent,
        href: getCreatorUrl(creator),
        action: onSelect
            ? createViewPurchasesButton(() => onSelect(creator))
            : undefined,
    };
}

function createGameRow(game, thumbnail, onSelect) {
    const details = universeDetails.get(String(game.universeId));
    const name = details?.name || game.name || ts('spending.unknownGame');
    return {
        thumbnail: createThumbnailElement(
            thumbnail,
            name,
            'rovalra-spent-game-thumbnail',
            thumbnailStyle,
        ),
        title: name,
        subtitle: formatPurchases(game.totalTransactions),
        amount: game.totalSpent,
        href: details?.rootPlaceId
            ? `https://www.roblox.com/games/${encodeURIComponent(details.rootPlaceId)}`
            : undefined,
        action: onSelect
            ? createViewPurchasesButton(() => onSelect(game))
            : undefined,
    };
}

async function buildCreatorRows(creators, onSelect) {
    const [userThumbs, groupThumbs] = await Promise.all([
        getThumbnails(
            creators.filter((c) => c.type === 'User').map((c) => c.id),
            'AvatarHeadshot',
        ),
        getThumbnails(
            creators.filter((c) => c.type === 'Group').map((c) => c.id),
            'GroupIcon',
        ),
    ]);
    return creators.map((creator) =>
        createCreatorRow(
            creator,
            (creator.type === 'Group' ? groupThumbs : userThumbs).get(
                Number(creator.id),
            ),
            onSelect,
        ),
    );
}

async function buildGameRows(games, onSelect) {
    const [, thumbnails] = await Promise.all([
        loadUniverseDetails(games.map((game) => game.universeId)),
        getThumbnails(
            games.map((game) => game.universeId),
            'GameIcon',
        ),
    ]);
    return games.map((game) =>
        createGameRow(game, thumbnails.get(Number(game.universeId)), onSelect),
    );
}

function createPurchaseRow(tx, item, showGame) {
    const name = item?.name || tx.itemName || ts('spending.unknownItem');
    const date = Number.isFinite(tx.created)
        ? new Date(tx.created).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
          })
        : '';
    return {
        thumbnail: createThumbnailElement(
            item ? item.thumbnail : { state: 'Pending' },
            name,
            'rovalra-spent-item-thumbnail',
            thumbnailStyle,
        ),
        title: name,
        subtitle: [date, showGame && tx.gameName].filter(Boolean).join(' · '),
        amount: tx.amount,
        href: item?.url || undefined,
    };
}

function createRow() {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.flexWrap = 'wrap';
    row.style.gap = '8px';
    row.style.marginBottom = '10px';
    return row;
}

function addSection(table) {
    if (table.parentElement?.querySelector(`section[${ROW_MARKER}]`)) return;
    const section = document.createElement('section');
    section.setAttribute(ROW_MARKER, 'true');
    section.className = 'rovalra-spending-summary';
    section.style.marginTop = '16px';
    section.style.padding = '16px 0';
    section.style.borderTop =
        '1px solid var(--rovalra-border-color, rgba(255, 255, 255, 0.12))';

    const header = createRow();
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
    title.append(logo, document.createTextNode(ts('spending.title')));
    const disclaimer = document.createElement('small');
    disclaimer.textContent = ts('spending.disclaimer');
    disclaimer.style.color = 'var(--rovalra-secondary-text-color)';
    const titleGroup = document.createElement('div');
    titleGroup.style.display = 'grid';
    titleGroup.style.gap = '2px';
    titleGroup.style.marginRight = 'auto';
    titleGroup.append(title, disclaimer);
    const totalAmount = document.createElement('div');
    totalAmount.style.display = 'inline-flex';
    totalAmount.style.alignItems = 'center';
    const groupingContainer = document.createElement('div');
    header.append(titleGroup, totalAmount, groupingContainer);

    const chartContainer = document.createElement('div');
    chartContainer.style.marginBottom = '12px';
    chartContainer.appendChild(
        createShimmerBlock({ width: '100%', height: '180px' }),
    );

    const periodRow = createRow();
    periodRow.style.fontSize = '12px';
    periodRow.style.lineHeight = '16px';
    periodRow.style.minHeight = '16px';
    periodRow.style.color = 'var(--rovalra-secondary-text-color)';
    periodRow.style.visibility = 'hidden';

    const createControlsRow = (borderColor) => {
        const row = createRow();
        row.style.boxSizing = 'content-box';
        row.style.minHeight = '50px';
        row.style.paddingBottom = '10px';
        row.style.borderBottom = `1px solid ${borderColor}`;
        return row;
    };
    const listControls = createControlsRow('transparent');
    const selectedHeader = document.createElement('div');
    selectedHeader.style.flex = '1 1 280px';
    selectedHeader.style.minWidth = '0';
    const purchaseControls = createControlsRow(
        'var(--rovalra-border-color, rgba(255, 255, 255, 0.12))',
    );
    purchaseControls.style.display = 'none';

    const listContainer = document.createElement('div');
    section.append(
        header,
        chartContainer,
        periodRow,
        listControls,
        purchaseControls,
        listContainer,
    );
    table.insertAdjacentElement('afterend', section);

    let transactions = [];
    let isScanning = false;
    let grouping = 'month';
    let period = null;
    let view = 'creators';
    let sort = 'spent';
    let purchaseSort = 'expensive';
    let query = '';
    let includeGameCreators = true;
    let visibleCount = PAGE_SIZE;
    let selected = null;
    let timeline = [];
    let renderToken = 0;

    const chart = createBarChart({
        emptyText: ts('spending.noPurchases'),
        onSelect: (index, item) => {
            period = item ? item.start : null;
            visibleCount = PAGE_SIZE;
            renderPeriod();
            renderList();
        },
    });

    const viewToggle = createPillToggle({
        options: [
            { text: ts('spending.creators'), value: 'creators' },
            { text: ts('spending.games'), value: 'games' },
        ],
        initialValue: view,
        onChange: (value) => {
            view = value;
            visibleCount = PAGE_SIZE;
            includeGameCreatorsLabel.style.display =
                view === 'creators' ? 'inline-flex' : 'none';
            renderList();
        },
    });
    viewToggle.style.alignSelf = 'center';
    viewToggle.style.marginRight = 'auto';

    const includeGameCreatorsLabel = document.createElement('label');
    includeGameCreatorsLabel.style.display = 'inline-flex';
    includeGameCreatorsLabel.style.alignItems = 'center';
    includeGameCreatorsLabel.style.gap = '6px';
    includeGameCreatorsLabel.style.fontSize = '12px';
    includeGameCreatorsLabel.style.cursor = 'pointer';
    const includeGameCreatorsToggle = createToggle({
        id: `rovalra-spending-include-games-${Date.now()}`,
        checked: includeGameCreators,
    });
    const includeGameCreatorsText = document.createElement('span');
    includeGameCreatorsText.textContent = ts(
        'spentPerCreator.includeGameCreators',
    );
    includeGameCreatorsLabel.append(
        includeGameCreatorsToggle,
        includeGameCreatorsText,
    );
    includeGameCreatorsToggle.addEventListener('click', () => {
        includeGameCreators = !includeGameCreators;
        visibleCount = PAGE_SIZE;
        renderList();
    });

    const search = createStyledInput({
        id: `rovalra-spending-search-${Date.now()}`,
        label: ts('spending.searchPlaceholder'),
    });
    search.container.style.width = '220px';
    search.input.addEventListener('input', () => {
        query = search.input.value.trim().toLocaleLowerCase();
        visibleCount = PAGE_SIZE;
        renderList();
    });

    const sortDropdown = createDropdown({
        items: SORTS.map((item) => ({ ...item, label: ts(item.label) })),
        initialValue: sort,
        onValueChange: (value) => {
            sort = value;
            visibleCount = PAGE_SIZE;
            renderList();
        },
    });
    const purchaseSortDropdown = createDropdown({
        items: PURCHASE_SORTS.map((item) => ({
            ...item,
            label: ts(item.label),
        })),
        initialValue: purchaseSort,
        onValueChange: (value) => {
            purchaseSort = value;
            visibleCount = PAGE_SIZE;
            renderList();
        },
    });
    listControls.append(
        viewToggle,
        includeGameCreatorsLabel,
        search.container,
        sortDropdown.element,
    );

    groupingContainer.appendChild(
        createDropdown({
            items: GROUPINGS.map((item) => ({
                ...item,
                label: ts(item.label),
            })),
            initialValue: grouping,
            onValueChange: (value) => {
                grouping = value;
                period = null;
                visibleCount = PAGE_SIZE;
                renderChart();
                renderList();
            },
        }).element,
    );

    const getScoped = () => {
        if (selected?.kind === 'creator') {
            return transactions.filter(
                (tx) =>
                    tx.creatorId === selected.entry.id &&
                    (includeGameCreators || !tx.universeId),
            );
        }
        if (selected?.kind === 'game') {
            return transactions.filter(
                (tx) => tx.universeId === selected.entry.universeId,
            );
        }
        return transactions;
    };

    const getInPeriod = () => {
        const scoped = getScoped();
        if (period === null) return scoped;
        const end = nextBucket(new Date(period), grouping).getTime();
        return scoped.filter((tx) => tx.created >= period && tx.created < end);
    };

    const renderChart = () => {
        timeline = buildTimeline(getScoped(), transactions, grouping);
        chart.update(timeline);
        const index = timeline.findIndex((item) => item.start === period);
        if (index === -1) period = null;
        chart.setSelected(index === -1 ? null : index);
        renderPeriod();
    };

    const renderPeriod = () => {
        if (period === null) {
            periodRow.style.visibility = 'hidden';
            periodRow.replaceChildren();
            return;
        }
        const label = document.createElement('span');
        label.textContent = ts('spending.showingPeriod', {
            period: formatBucket(period, grouping, true),
        });
        periodRow.replaceChildren(label);
        periodRow.style.visibility = 'visible';
    };

    const select = (next) => {
        selected = next;
        visibleCount = PAGE_SIZE;
        query = '';
        search.input.value = '';
        listControls.style.display = selected ? 'none' : 'flex';
        purchaseControls.style.display = selected ? 'flex' : 'none';
        if (selected) {
            purchaseControls.replaceChildren(
                selectedHeader,
                search.container,
                purchaseSortDropdown.element,
            );
        } else {
            listControls.insertBefore(search.container, sortDropdown.element);
            selectedHeader.replaceChildren();
        }
        renderChart();
        renderList();
    };
    const selectCreator = (entry) => select({ kind: 'creator', entry });
    const selectGame = (entry) => select({ kind: 'game', entry });

    const renderSelectedHeader = (inPeriod) => {
        const entry = {
            ...selected.entry,
            totalSpent: inPeriod.reduce((sum, tx) => sum + tx.amount, 0),
            totalTransactions: inPeriod.length,
        };
        const row =
            selected.kind === 'creator'
                ? createCreatorRow(
                      entry,
                      getCachedThumbnail(
                          getCreatorThumbnailType(entry),
                          entry.id,
                      ),
                  )
                : createGameRow(
                      entry,
                      getCachedThumbnail('GameIcon', entry.universeId),
                  );
        row.action = createProfileHeaderButton({
            content: ts('spending.back'),
            onClick: () => select(null),
        });
        return createRowList([row]);
    };

    const getEntries = () => {
        const inPeriod = getInPeriod();
        const matches = (text) =>
            String(text || '')
                .toLocaleLowerCase()
                .includes(query);

        if (selected) {
            return sortPurchases(
                inPeriod.filter(
                    (tx) => matches(tx.itemName) || matches(tx.gameName),
                ),
                purchaseSort,
            );
        }
        const entries =
            view === 'games'
                ? getGames(inPeriod)
                : getCreators(inPeriod, includeGameCreators);
        return sortEntries(
            entries.filter((entry) => matches(entry.name)),
            sort,
        );
    };

    const renderList = async () => {
        const token = ++renderToken;
        const inPeriod = getInPeriod();
        totalAmount.replaceChildren(
            createAmountElement(
                inPeriod.reduce((sum, tx) => sum + tx.amount, 0),
            ),
        );

        const entries = getEntries();
        if (selected)
            selectedHeader.replaceChildren(renderSelectedHeader(inPeriod));
        if (!entries.length) {
            listContainer.textContent =
                !transactions.length && isScanning
                    ? ts('spending.scanInProgress')
                    : period !== null
                      ? ts('spending.noPurchasesInPeriod')
                      : ts('spending.noPurchases');
            return;
        }

        const visible = entries.slice(0, visibleCount);
        const showRows = (rows) => {
            listContainer.replaceChildren(createRowList(rows));
            if (visibleCount >= entries.length) return;
            const loadMore = createProfileHeaderButton({
                content: ts('spentPerCreator.loadMore', {
                    remaining: entries.length - visibleCount,
                }),
                onClick: () => {
                    visibleCount += PAGE_SIZE;
                    loadMore.replaceWith(
                        createShimmerList(
                            Math.min(
                                PAGE_SIZE,
                                entries.length - visibleCount + PAGE_SIZE,
                            ),
                        ),
                    );
                    renderList();
                },
            });
            loadMore.style.marginTop = '10px';
            listContainer.appendChild(loadMore);
        };

        if (selected) {
            const showGame = selected.kind !== 'game';
            showRows(
                visible.map((tx) => createPurchaseRow(tx, null, showGame)),
            );
            const items = await getPurchasedItems(visible);
            if (token !== renderToken) return;
            showRows(
                visible.map((tx, index) =>
                    createPurchaseRow(tx, items[index], showGame),
                ),
            );
            return;
        }

        showRows(
            visible.map((entry) =>
                view === 'games'
                    ? createGameRow(
                          entry,
                          getCachedThumbnail('GameIcon', entry.universeId),
                          selectGame,
                      )
                    : createCreatorRow(
                          entry,
                          getCachedThumbnail(
                              getCreatorThumbnailType(entry),
                              entry.id,
                          ),
                          selectCreator,
                      ),
            ),
        );
        const rows =
            view === 'games'
                ? await buildGameRows(visible, selectGame)
                : await buildCreatorRows(visible, selectCreator);
        if (token !== renderToken) return;
        showRows(rows);
    };

    const load = async () => {
        try {
            const data = await getTransactionData();
            transactions = Object.values(data?.transactions || {}).map(
                (tx) => ({
                    ...tx,
                    amount: Number(tx.amount) || 0,
                }),
            );
            isScanning = !!data?.isScanning;
            if (!transactions.length && isScanning) {
                chartContainer.textContent = ts('spending.scanInProgress');
            } else if (chartContainer.firstElementChild !== chart.element) {
                chartContainer.replaceChildren(chart.element);
            }
            renderChart();
            await renderList();
        } catch (error) {
            listContainer.textContent = ts('spending.loadError');
            console.error('RoValra: Failed to load spending', error);
        }
    };

    let reloadTimeout = null;
    onTransactionDataChanged(() => {
        clearTimeout(reloadTimeout);
        reloadTimeout = setTimeout(load, RELOAD_DEBOUNCE);
    });
    listContainer.replaceChildren(createShimmerList(PAGE_SIZE));
    load();
}

function processSummary(row) {
    if (!window.location.pathname.startsWith('/transactions')) return;
    const table = row.closest('#transactions-web-app .summary table.summary');
    if (table) addSection(table);
}

export async function init() {
    if (!(await settings.spendingEnabled)) return;
    observeElement(ROW_SELECTOR, processSummary, { multiple: true });
}
