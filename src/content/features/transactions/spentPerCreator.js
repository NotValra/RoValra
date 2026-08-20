import { observeElement } from '../../core/observer.js';
import {
    createThumbnailElement,
    fetchThumbnails,
} from '../../core/thumbnail/thumbnails.js';
import { createDropdown } from '../../core/ui/dropdown.js';
import { createStyledInput } from '../../core/ui/catalog/input.js';
import { createToggle } from '../../core/ui/general/toggle.js';
import { createProfileHeaderButton } from '../../core/ui/profile/header/button.js';
import { createRobuxIcon } from '../../core/ui/robuxIcon.js';
import { getTransactionData } from '../../core/utils/trackers/transactions.js';
import { createShimmerBlock } from '../../core/ui/shimmer.js';
import { ts } from '../../core/locale/i18n.js';
import { settings } from '../../core/settings/getSettings.js';
import { getAssets } from '../../core/assets.js';

const ROW_SELECTOR = '#transactions-web-app .summary table.summary tr';
const ROW_MARKER = 'data-rovalra-spent-per-creator';
const TRANSACTIONS_DATA_KEY = 'rovalra_transactions_v2';
const PAGE_SIZE = 5;
const SORTS = [
    { value: 'spent', label: 'spentPerCreator.mostSpent' },
    { value: 'transactions', label: 'spentPerCreator.mostPurchases' },
];

const getCreators = (data, includeGameCreators = false) =>
    Object.entries(data?.creators || {}).map(([id, creator]) => ({
        ...creator,
        id: creator.id || id,
        type: creator.type === 'Group' ? 'Group' : 'User',
        totalSpent: includeGameCreators
            ? Number(creator.totalSpent) || 0
            : Math.max(
                  0,
                  (Number(creator.totalSpent) || 0) -
                      Object.values(creator.games || {}).reduce(
                          (sum, game) => sum + (Number(game.totalSpent) || 0),
                          0,
                      ),
              ),
        totalTransactions: includeGameCreators
            ? Number(creator.totalTransactions) || 0
            : Math.max(
                  0,
                  (Number(creator.totalTransactions) || 0) -
                      Object.values(creator.games || {}).reduce(
                          (sum, game) =>
                              sum + (Number(game.totalTransactions) || 0),
                          0,
                      ),
              ),
    })).filter((creator) => creator.totalTransactions > 0);

function sortCreators(creators, sort) {
    return [...creators].sort((a, b) => {
        if (sort === 'transactions') {
            return b.totalTransactions - a.totalTransactions ||
                b.totalSpent - a.totalSpent;
        }
        return b.totalSpent - a.totalSpent ||
            String(a.id).localeCompare(String(b.id));
    });
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
        const thumbnail = createShimmerBlock({ width: '42px', height: '42px', borderRadius: '6px' });
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
        item.append(thumbnail, details, createShimmerBlock({ width: '58px', height: '16px' }));
        list.appendChild(item);
    }
    return list;
}

function showCreatorShimmers(container, count, append = false) {
    const shimmerList = createShimmerList(count);
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

async function renderCreators(container, creators, visibleCount, sort, onLoadMore, isScanning) {
    if (!creators.length) {
        container.textContent = isScanning
            ? ts('spentPerCreator.scanInProgress')
            : ts('spentPerCreator.noPurchases');
        return;
    }

    const visible = sortCreators(creators, sort).slice(0, visibleCount);
    const userItems = visible.filter((creator) => creator.type === 'User').map((creator) => ({ id: creator.id }));
    const groupItems = visible.filter((creator) => creator.type === 'Group').map((creator) => ({ id: creator.id }));
    const [userThumbs, groupThumbs] = await Promise.all([
        fetchThumbnails(userItems, 'AvatarHeadshot', '150x150'),
        fetchThumbnails(groupItems, 'GroupIcon', '150x150'),
    ]);

    const list = document.createElement('div');
    list.style.display = 'grid';
    list.style.gap = '8px';
    for (const creator of visible) {
        const isGroup = creator.type === 'Group';
        const thumbnail = createThumbnailElement(
            (isGroup ? groupThumbs : userThumbs).get(Number(creator.id)),
            creator.name,
            'rovalra-spent-creator-thumbnail',
            { width: '42px', height: '42px', flex: '0 0 42px', borderRadius: '6px' },
        );
        const details = document.createElement('div');
        details.style.minWidth = '0';
        details.style.flex = '1';
        const name = document.createElement('div');
        name.textContent = creator.name || ts('spentPerCreator.unknownCreator');
        name.style.overflow = 'hidden';
        name.style.textOverflow = 'ellipsis';
        name.style.whiteSpace = 'nowrap';
        const count = document.createElement('span');
        count.style.fontSize = '12px';
        count.style.opacity = '0.7';
        count.textContent = creator.totalTransactions === 1
            ? ts('spentPerCreator.singlePurchase')
            : ts('spentPerCreator.multiplePurchases', { count: creator.totalTransactions });
        details.append(name, count);

        const link = document.createElement('a');
        link.href = isGroup
            ? `https://www.roblox.com/groups/${encodeURIComponent(creator.id)}/-`
            : `https://www.roblox.com/users/${encodeURIComponent(creator.id)}/profile`;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.style.display = 'flex';
        link.style.alignItems = 'center';
        link.style.gap = '10px';
        link.style.minWidth = '0';
        link.style.flex = '1';
        link.style.color = 'inherit';
        link.style.textDecoration = 'none';
        link.append(thumbnail, details);

        const item = document.createElement('div');
        item.style.display = 'flex';
        item.style.alignItems = 'center';
        item.style.gap = '10px';
        item.style.minHeight = '50px';
        item.append(link, createAmountElement(creator.totalSpent));
        list.appendChild(item);
    }
    container.replaceChildren(list);
    if (visibleCount < creators.length) {
        const loadMore = createProfileHeaderButton({
            content: ts('spentPerCreator.loadMore', { remaining: creators.length - visibleCount }),
            onClick: onLoadMore,
        });
        loadMore.style.marginTop = '10px';
        container.appendChild(loadMore);
    }
}

function addSection(table) {
    if (
        table.parentElement?.querySelector(
            `section[${ROW_MARKER}]`,
        )
    ) return;
    const section = document.createElement('section');
    section.setAttribute(ROW_MARKER, 'true');
    section.className = 'rovalra-spent-per-creator-summary';
    section.style.marginTop = '16px';
    section.style.padding = '16px 0';
    section.style.borderTop = '1px solid var(--rovalra-border-color, rgba(255, 255, 255, 0.12))';

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
    title.append(logo, document.createTextNode(ts('spentPerCreator.title')));
    const disclaimer = document.createElement('small');
    disclaimer.textContent = ts('spentPerCreator.disclaimer');
    disclaimer.style.color = 'var(--rovalra-secondary-text-color)';
    const titleGroup = document.createElement('div');
    titleGroup.style.display = 'grid';
    titleGroup.style.gap = '2px';
    titleGroup.style.marginRight = 'auto';
    titleGroup.append(title, disclaimer);
    const totalAmount = document.createElement('div');
    totalAmount.style.display = 'inline-flex';
    totalAmount.style.alignItems = 'center';
    const search = createStyledInput({ id: `rovalra-spent-per-creator-search-${Date.now()}`, label: ts('spentPerCreator.searchPlaceholder') });
    search.container.style.width = '220px';
    const sortContainer = document.createElement('div');
    const includeGameCreatorsLabel = document.createElement('label');
    includeGameCreatorsLabel.style.display = 'inline-flex';
    includeGameCreatorsLabel.style.alignItems = 'center';
    includeGameCreatorsLabel.style.gap = '6px';
    includeGameCreatorsLabel.style.fontSize = '12px';
    includeGameCreatorsLabel.style.cursor = 'pointer';
    const includeGameCreatorsToggle = createToggle({
        id: `rovalra-spent-per-creator-include-games-${Date.now()}`,
        checked: false,
    });
    const includeGameCreatorsText = document.createElement('span');
    includeGameCreatorsText.textContent = ts('spentPerCreator.includeGameCreators');
    includeGameCreatorsLabel.append(
        includeGameCreatorsToggle,
        includeGameCreatorsText,
    );
    controls.append(
        titleGroup,
        totalAmount,
        includeGameCreatorsLabel,
        search.container,
        sortContainer,
    );
    const creatorsContainer = document.createElement('div');
    creatorsContainer.textContent = ts('spentPerCreator.loading');
    const scanStatus = document.createElement('div');
    scanStatus.style.marginTop = '8px';
    scanStatus.style.fontSize = '12px';
    scanStatus.style.opacity = '0.7';
    section.append(controls, creatorsContainer, scanStatus);
    table.insertAdjacentElement('afterend', section);

    let transactionData = null;
    let creators = [];
    let sort = 'spent';
    let query = '';
    let visibleCount = PAGE_SIZE;
    let loading = false;
    let isScanning = false;
    let includeGameCreators = false;
    const getVisible = () => sortCreators(creators, sort).filter((creator) =>
        String(creator.name || '').toLocaleLowerCase().includes(query),
    );
    const render = () => renderCreators(creatorsContainer, getVisible(), visibleCount, sort, async () => {
        visibleCount += PAGE_SIZE;
        showCreatorShimmers(creatorsContainer, PAGE_SIZE, true);
        await render();
    }, isScanning);
    const updateTotalAmount = () => {
        totalAmount.replaceChildren(
            createAmountElement(
                creators.reduce((sum, creator) => sum + creator.totalSpent, 0),
            ),
        );
    };
    const updateCreatorFilter = async (include) => {
        includeGameCreators = include;
        creators = getCreators(transactionData, includeGameCreators);
        visibleCount = PAGE_SIZE;
        await render();
        updateTotalAmount();
    };
    includeGameCreatorsToggle.addEventListener('click', () => {
        updateCreatorFilter(!includeGameCreators);
    });

    const load = async () => {
        if (loading) return;
        loading = true;
        showCreatorShimmers(creatorsContainer, PAGE_SIZE);
        try {
            transactionData = await getTransactionData();
            creators = getCreators(transactionData, includeGameCreators);
            isScanning = !!transactionData?.isScanning;
            sortContainer.appendChild(createDropdown({
                items: SORTS.map((item) => ({ ...item, label: ts(item.label) })),
                initialValue: sort,
                onValueChange: async (value) => { sort = value; visibleCount = PAGE_SIZE; await render(); },
            }).element);
            await render();
            if (!isScanning) scanStatus.replaceChildren();
            updateTotalAmount();
        } catch (error) {
            creatorsContainer.textContent = ts('spentPerCreator.loadError');
            console.error('RoValra: Failed to load spending per creator', error);
        } finally {
            loading = false;
        }
    };
    chrome.storage.onChanged.addListener(async (changes, areaName) => {
        if (areaName !== 'local' || !changes[TRANSACTIONS_DATA_KEY]) return;
        const latest = await getTransactionData();
        if (isScanning && !latest?.isScanning) {
            transactionData = null;
            creators = [];
            await load();
        }
    });
    search.input.addEventListener('input', () => {
        query = search.input.value.trim().toLocaleLowerCase();
        visibleCount = PAGE_SIZE;
        render();
    });
    load();
}

function processSummary(row) {
    if (!window.location.pathname.startsWith('/transactions')) return;
    const table = row.closest('#transactions-web-app .summary table.summary');
    if (table) addSection(table);
}

export async function init() {
    if (!(await settings.spentPerCreatorEnabled)) return;
    observeElement(ROW_SELECTOR, processSummary, { multiple: true });
}
