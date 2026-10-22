import { observeElement } from '../../core/observer.js';
import { callRobloxApiJson } from '../../core/api.js';
import { createDropdown } from '../../core/ui/dropdown.js';
import { createShimmerGrid } from '../../core/ui/shimmer.js';
import { fetchThumbnails } from '../../core/thumbnail/thumbnails.js';
import { getUserIdFromInventoryUrl } from '../../core/idExtractor.js';
import { getAuthenticatedUserId } from '../../core/user.js';
import { settings } from '../../core/settings/getSettings.js';
import { ts } from '../../core/locale/i18n.js';

const PAGE_SIZE = 30;
const API_PAGE_LIMIT = 100;
const BATCH_SIZE = 100;
const SORTED_CLASS = 'rovalra-inventory-sorted';

const ASSET_TYPES = {
    accessories: {
        head: 8,
        face: 42,
        neck: 43,
        shoulder: 44,
        front: 45,
        back: 46,
        waist: 47,
        gear: 19,
    },
    animations: { animations: 24 },
    audio: { audio: 3 },
    'avatar-animations': {
        run: 53,
        walk: 55,
        fall: 50,
        jump: 52,
        idle: 51,
        swim: 54,
        climb: 48,
    },
    backgrounds: { backgrounds: 92 },
    'body-parts': {
        torso: 27,
        'right-arm': 28,
        'left-arm': 29,
        'left-leg': 30,
        'right-leg': 31,
    },
    bottoms: { pants: 66, shorts: 69, skirts: 72 },
    'classic-clothing': {
        'classic-t-shirts': 2,
        'classic-shirts': 11,
        'classic-pants': 12,
    },
    'classic-heads': { 'classic-heads': 17 },
    decals: { decals: 13 },
    'emote-animations': { emotes: 61 },
    faces: { faces: 18 },
    'hair-accessories': { hair: 41 },
    heads: { heads: null, 'mood-animations': 78, 'dynamic-heads-asset': 79 },
    makeup: { eyebrows: 76, eyelashes: 77, faces: 88, lips: 89, eyes: 90 },
    meshparts: { meshes: 40 },
    models: { 'models-&-packages': 10 },
    plugins: { plugins: 38 },
    shoes: { 'left-shoe': 70, 'right-shoe': 71 },
    tops: { 't-shirts': 64, shirts: 65, sweaters: 68, jackets: 67 },
    video: { video: 62 },
};

const SORT_OPTIONS = {
    asset: [
        'default',
        'newest',
        'oldest',
        'nameAsc',
        'nameDesc',
        'priceDesc',
        'priceAsc',
        'rapDesc',
        'rapAsc',
    ],
    badge: [
        'default',
        'newestEarned',
        'oldestEarned',
        'nameAsc',
        'nameDesc',
        'rarest',
        'mostCommon',
    ],
};

const nameCollator = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: 'base',
});

const SORTS = {
    newest: (a, b) => b.date - a.date,
    oldest: (a, b) => a.date - b.date,
    newestEarned: (a, b) => b.date - a.date,
    oldestEarned: (a, b) => a.date - b.date,
    nameAsc: (a, b) => nameCollator.compare(a.sortName, b.sortName),
    nameDesc: (a, b) => nameCollator.compare(b.sortName, a.sortName),
    priceDesc: (a, b) => compareMissingLast(a.price, b.price, -1),
    priceAsc: (a, b) => compareMissingLast(a.price, b.price, 1),
    rapDesc: (a, b) => compareMissingLast(a.rap, b.rap, -1),
    rapAsc: (a, b) => compareMissingLast(a.rap, b.rap, 1),
    rarest: (a, b) => compareMissingLast(a.rarity, b.rarity, 1),
    mostCommon: (a, b) => compareMissingLast(a.rarity, b.rarity, -1),
};

const itemsCache = new Map();
const rapCache = new Map();
let currentSort = 'default';
let currentPage = 0;
let sortedItems = [];
let renderToken = 0;

function compareMissingLast(a, b, direction) {
    const aMissing = typeof a !== 'number';
    const bMissing = typeof b !== 'number';
    if (aMissing && bMissing) return 0;
    if (aMissing) return 1;
    if (bMissing) return -1;
    return (a - b) * direction;
}

function toSortName(name) {
    return name.replace(/^[^\p{L}\p{N}]+/u, '').trim();
}

function toUrlSlug(name) {
    return (
        name
            .replace(/'/g, '')
            .replace(/[^a-zA-Z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'unnamed'
    );
}

function abbreviatePrice(value) {
    if (value >= 1e9) return `${Math.floor(value / 1e9)}B+`;
    if (value >= 1e6) return `${Math.floor(value / 1e6)}M+`;
    if (value >= 1e4) return `${Math.floor(value / 1e3)}K+`;
    return value.toLocaleString();
}

function isInventoryPage() {
    return /^(?:\/[a-z]{2}(?:-[a-z]{2})?)?\/users\/(?:\d+\/)?inventory\/?$/i.test(
        location.pathname,
    );
}

function getSource() {
    const parts = location.hash
        .replace(/^#!?\/?/, '')
        .split('/')
        .filter(Boolean)
        .map((part) => decodeURIComponent(part).toLowerCase());
    const category = parts[0] || 'accessories';

    if (category === 'badges') return { kind: 'badge', key: 'badges' };

    const subcategories = ASSET_TYPES[category];
    if (!subcategories) return null;
    const assetTypeId =
        subcategories[parts[1] || Object.keys(subcategories)[0]];
    return assetTypeId == null ? null : { kind: 'asset', key: assetTypeId };
}

async function getInventoryUserId() {
    return (
        getUserIdFromInventoryUrl() || String(await getAuthenticatedUserId())
    );
}

function getCreator(type, id, name) {
    if (!id || !name) return null;
    if (type === 'Group') {
        return { name, url: `https://www.roblox.com/groups/${id}` };
    }
    return {
        name: Number(id) === 1 ? name : `@${name}`,
        url: `https://www.roblox.com/users/${id}/profile`,
    };
}

async function fetchAllPages(subdomain, buildEndpoint) {
    const entries = [];
    let cursor = '';
    do {
        const res = await callRobloxApiJson({
            subdomain,
            endpoint: buildEndpoint(
                cursor ? `&cursor=${encodeURIComponent(cursor)}` : '',
            ),
        });
        entries.push(...(res?.data || []));
        cursor = res?.nextPageCursor || '';
    } while (cursor);
    return entries;
}

async function fetchAssetItems(userId, assetTypeId) {
    const entries = await fetchAllPages(
        'inventory',
        (cursor) =>
            `/v2/users/${userId}/inventory/${assetTypeId}?limit=${API_PAGE_LIMIT}&sortOrder=Desc${cursor}`,
    );

    const items = entries.map((entry) => {
        const name = entry.assetName || '';
        return {
            id: entry.assetId,
            thumbnailType: 'Asset',
            name,
            sortName: toSortName(name),
            url: `https://www.roblox.com/catalog/${entry.assetId}/${toUrlSlug(name)}`,
            date: new Date(entry.created || 0).getTime(),
            showPrice: true,
            price: null,
            isOffSale: true,
            restrictionIcon: null,
            creator: null,
            rap: null,
        };
    });

    const uniqueIds = [...new Set(items.map((item) => item.id))];
    const details = new Map();
    for (let i = 0; i < uniqueIds.length; i += BATCH_SIZE) {
        try {
            const res = await callRobloxApiJson({
                subdomain: 'catalog',
                endpoint: '/v1/catalog/items/details',
                method: 'POST',
                body: {
                    items: uniqueIds
                        .slice(i, i + BATCH_SIZE)
                        .map((id) => ({ itemType: 'Asset', id })),
                },
            });
            (res?.data || []).forEach((entry) => details.set(entry.id, entry));
        } catch (e) {
            console.warn('RoValra: Failed to load inventory item details', e);
        }
    }

    items.forEach((item) => {
        const entry = details.get(item.id);
        if (!entry) return;
        const restrictions = entry.itemRestrictions || [];
        const resalePrice =
            typeof entry.lowestResalePrice === 'number' &&
            entry.lowestResalePrice > 0
                ? entry.lowestResalePrice
                : null;
        const price = resalePrice ?? entry.lowestPrice ?? entry.price;
        item.isOffSale =
            resalePrice == null &&
            (entry.isOffSale === true ||
                entry.priceStatus === 'Off Sale' ||
                typeof price !== 'number');
        item.price = item.isOffSale ? null : price;
        item.creator = getCreator(
            entry.creatorType,
            entry.creatorTargetId,
            entry.creatorName,
        );
        const isLimited = restrictions.includes('Limited');
        if (
            restrictions.includes('LimitedUnique') ||
            (restrictions.includes('Collectible') && !isLimited)
        ) {
            item.restrictionIcon = 'icon-limited-unique-label';
        } else if (isLimited) {
            item.restrictionIcon = 'icon-limited-label';
        }
    });

    return items;
}

async function fetchBadgeItems(userId) {
    const entries = await fetchAllPages(
        'badges',
        (cursor) =>
            `/v1/users/${userId}/badges?limit=${API_PAGE_LIMIT}&sortOrder=Desc${cursor}`,
    );

    const items = entries.map((entry, index) => {
        const name = entry.displayName || entry.name || '';
        return {
            id: entry.id,
            thumbnailType: 'BadgeIcon',
            name,
            sortName: toSortName(name),
            url: `https://www.roblox.com/badges/${entry.id}/${toUrlSlug(name)}`,
            date: entries.length - index,
            showPrice: false,
            rarity: entry.statistics?.winRatePercentage ?? null,
            creator: getCreator(
                entry.creator?.type,
                entry.creator?.id,
                entry.creator?.name,
            ),
        };
    });

    for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const batch = items.slice(i, i + BATCH_SIZE);
        try {
            const res = await callRobloxApiJson({
                subdomain: 'badges',
                endpoint: `/v1/users/${userId}/badges/awarded-dates?badgeIds=${batch.map((item) => item.id).join(',')}`,
            });
            const dates = new Map(
                (res?.data || []).map((entry) => [
                    entry.badgeId,
                    new Date(entry.awardedDate).getTime(),
                ]),
            );
            batch.forEach((item) => {
                if (dates.has(item.id)) item.date = dates.get(item.id);
            });
        } catch (e) {
            console.warn('RoValra: Failed to load badge awarded dates', e);
        }
    }

    return items;
}

async function fetchRapMap(userId) {
    if (rapCache.has(userId)) return rapCache.get(userId);

    const rapMap = new Map();
    const useLegacyApi = String(userId) === '1';
    let cursor = '';
    try {
        do {
            const res = await callRobloxApiJson({
                subdomain: useLegacyApi ? 'inventory' : 'trades',
                endpoint: useLegacyApi
                    ? `/v1/users/${userId}/assets/collectibles?limit=100&sortOrder=Asc${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
                    : `/v2/users/${userId}/tradableItems?limit=100&sortOrder=Desc${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
            });
            if (useLegacyApi) {
                (res?.data || []).forEach((entry) => {
                    if (typeof entry.recentAveragePrice === 'number') {
                        rapMap.set(entry.assetId, entry.recentAveragePrice);
                    }
                });
            } else {
                (res?.items || []).forEach((entry) => {
                    if (entry.itemTarget?.itemType === 'Bundle') return;
                    const assetId = Number(entry.itemTarget?.targetId);
                    const rap =
                        entry.recentAveragePrice ??
                        entry.instances?.[0]?.recentAveragePrice;
                    if (assetId && typeof rap === 'number') {
                        rapMap.set(assetId, rap);
                    }
                });
            }
            cursor = res?.nextPageCursor || '';
        } while (cursor);
    } catch (e) {
        console.warn('RoValra: Failed to load inventory RAP', e);
    }

    rapCache.set(userId, rapMap);
    return rapMap;
}

async function loadItems(userId, source) {
    const key = `${userId}_${source.key}`;
    if (!itemsCache.has(key)) {
        const promise =
            source.kind === 'badge'
                ? fetchBadgeItems(userId)
                : fetchAssetItems(userId, source.key);
        itemsCache.set(key, promise);
        promise.catch(() => itemsCache.delete(key));
    }
    return itemsCache.get(key);
}

function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
}

function createCard(item, thumbnail) {
    const card = createElement('li', 'list-item item-card');
    const container = createElement('div', 'item-card-container');

    const link = createElement('a', 'item-card-link');
    link.href = item.url;

    const thumbContainer = createElement('div', 'item-card-thumb-container');
    const thumb = createElement('div', 'item-card-thumb');
    const thumbSpan = createElement('span', 'thumbnail-2d-container');
    if (thumbnail?.imageUrl) {
        const image = document.createElement('img');
        image.src = thumbnail.imageUrl;
        image.alt = item.name;
        image.title = item.name;
        thumbSpan.appendChild(image);
    } else {
        thumbSpan.classList.add('shimmer');
    }
    thumb.appendChild(thumbSpan);
    thumbContainer.appendChild(thumb);
    if (item.restrictionIcon) {
        thumbContainer.appendChild(
            createElement('span', `restriction-icon ${item.restrictionIcon}`),
        );
    }

    const name = createElement('div', 'item-card-name');
    name.title = item.name;
    name.appendChild(createElement('span', '', item.name));

    link.append(thumbContainer, name);
    container.appendChild(link);

    if (item.creator) {
        const label = createElement('div', 'text-overflow item-card-label');
        const creatorLink = createElement(
            'a',
            'creator-name text-overflow text-link',
            item.creator.name,
        );
        creatorLink.href = item.creator.url;
        label.append(
            createElement('span', '', `${ts('inventorySort.by')} `),
            creatorLink,
        );
        container.appendChild(label);
    }

    if (item.showPrice) {
        const price = createElement('div', 'text-overflow item-card-price');
        if (item.isOffSale) {
            price.appendChild(
                createElement('span', 'text-label', ts('common.offSale')),
            );
        } else if (item.price === 0) {
            price.appendChild(
                createElement('span', 'text-label', ts('inventorySort.free')),
            );
        } else {
            price.append(
                createElement('span', 'icon-robux-16x16'),
                createElement(
                    'span',
                    'text-robux-tile',
                    abbreviatePrice(item.price),
                ),
            );
        }
        container.appendChild(price);
    }

    card.appendChild(container);
    return card;
}

function getCurrentItemsElement() {
    const all = [
        ...document.querySelectorAll('#inventory-container .current-items'),
    ];
    return all.find((element) => element.offsetParent !== null) || all[0];
}

function getResultsElement(currentItems) {
    let results = currentItems.querySelector('.rovalra-inventory-sort-results');
    if (!results) {
        results = createElement('div', 'rovalra-inventory-sort-results');

        const loading = createElement('div', 'rovalra-inventory-sort-loading');
        const list = createElement(
            'ul',
            'hlist item-cards item-cards-embed rovalra-inventory-sort-list',
        );

        const pager = createElement(
            'div',
            'pager-holder rovalra-inventory-sort-pager',
        );
        pager.innerHTML = `
            <ul class="pager">
                <li class="pager-prev"><button class="btn-generic-left-sm"><span class="icon-left"></span></button></li>
                <li><span class="rovalra-inventory-sort-page"></span></li>
                <li class="pager-next"><button class="btn-generic-right-sm"><span class="icon-right"></span></button></li>
            </ul>
        `;
        pager
            .querySelector('.pager-prev button')
            .addEventListener('click', () => renderPage(currentPage - 1));
        pager
            .querySelector('.pager-next button')
            .addEventListener('click', () => renderPage(currentPage + 1));

        results.append(loading, list, pager);
        currentItems.appendChild(results);
    }
    return results;
}

function setLoading(results, isLoading) {
    const loading = results.querySelector('.rovalra-inventory-sort-loading');
    loading.replaceChildren();
    if (isLoading) {
        loading.appendChild(
            createShimmerGrid(PAGE_SIZE, { width: '150px', height: '200px' }),
        );
    }
    results.classList.toggle('rovalra-inventory-sort-is-loading', isLoading);
}

function restoreRobloxView() {
    renderToken++;
    document
        .querySelectorAll(`#inventory-container .${SORTED_CLASS}`)
        .forEach((element) => element.classList.remove(SORTED_CLASS));
    document
        .querySelectorAll('.rovalra-inventory-sort-results')
        .forEach((element) => element.remove());
}

async function renderPage(page) {
    const currentItems = getCurrentItemsElement();
    if (!currentItems) return;
    const results = getResultsElement(currentItems);
    const list = results.querySelector('.rovalra-inventory-sort-list');
    const totalPages = Math.max(1, Math.ceil(sortedItems.length / PAGE_SIZE));

    currentPage = Math.min(Math.max(page, 0), totalPages - 1);
    const pageItems = sortedItems.slice(
        currentPage * PAGE_SIZE,
        (currentPage + 1) * PAGE_SIZE,
    );
    const token = renderToken;

    const thumbnails = pageItems.length
        ? await fetchThumbnails(
              pageItems.map((item) => ({ id: item.id })),
              pageItems[0].thumbnailType,
          )
        : new Map();
    if (token !== renderToken) return;

    setLoading(results, false);
    list.replaceChildren(
        ...pageItems.map((item) => createCard(item, thumbnails.get(item.id))),
    );

    results.querySelector('.rovalra-inventory-sort-page').textContent = ts(
        'inventorySort.page',
        { page: currentPage + 1, total: totalPages },
    );
    results.querySelector('.pager-prev button').disabled = currentPage === 0;
    results.querySelector('.pager-next button').disabled =
        currentPage >= totalPages - 1;
}

function createSortControl(kind) {
    const wrapper = createElement('div', 'rovalra-inventory-sort');
    wrapper.dataset.rovalraSortKind = kind;

    const dropdown = createDropdown({
        items: SORT_OPTIONS[kind].map((value) => ({
            value,
            label: ts(`inventorySort.${value}`),
        })),
        initialValue: currentSort,
        onValueChange: (value) => {
            currentSort = value;
            applySort();
        },
    });

    wrapper.appendChild(dropdown.element);
    return wrapper;
}

function syncSortControls(source) {
    if (source && !SORT_OPTIONS[source.kind].includes(currentSort)) {
        currentSort = 'default';
    }

    document
        .querySelectorAll('#inventory-container .current-items')
        .forEach((currentItems) => {
            const header = currentItems.querySelector(
                ':scope > .container-header',
            );
            if (!header) return;

            let wrapper = currentItems.querySelector('.rovalra-inventory-sort');
            if (
                wrapper &&
                source &&
                wrapper.dataset.rovalraSortKind !== source.kind
            ) {
                wrapper.remove();
                wrapper = null;
            }
            if (!wrapper && source) {
                wrapper = createSortControl(source.kind);
                header.after(wrapper);
            }
            wrapper?.classList.toggle(
                'rovalra-inventory-sort-unavailable',
                !source,
            );
        });
}

async function applySort() {
    const source = getSource();
    syncSortControls(source);

    if (currentSort === 'default' || !source) {
        restoreRobloxView();
        return;
    }

    const currentItems = getCurrentItemsElement();
    if (!currentItems) return;

    const token = ++renderToken;
    currentItems.classList.add(SORTED_CLASS);
    const results = getResultsElement(currentItems);
    results.querySelector('.rovalra-inventory-sort-list').replaceChildren();
    setLoading(results, true);

    try {
        const userId = await getInventoryUserId();
        const items = await loadItems(userId, source);

        if (currentSort.startsWith('rap')) {
            const rapMap = await fetchRapMap(userId);
            items.forEach((item) => {
                item.rap = rapMap.get(item.id) ?? null;
            });
        }
        if (token !== renderToken) return;

        if (items.length === 0) {
            restoreRobloxView();
            return;
        }

        sortedItems = [...items].sort(SORTS[currentSort]);
        await renderPage(0);
    } catch (e) {
        console.warn('RoValra: Failed to sort inventory', e);
        if (token === renderToken) restoreRobloxView();
    }
}

let initialized = false;
export async function init() {
    if (initialized) return;
    if ((await settings.inventorySortEnabled) !== true) return;
    initialized = true;

    observeElement(
        '#inventory-container .current-items .container-header',
        () => {
            if (isInventoryPage()) applySort();
        },
        { multiple: true },
    );

    window.addEventListener('hashchange', () => {
        if (!isInventoryPage()) return;
        restoreRobloxView();
        setTimeout(applySort, 0);
    });
}
