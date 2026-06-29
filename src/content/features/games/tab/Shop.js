import { callRobloxApiJson } from '../../../core/api.js';
import { getItemDetails } from '../../../core/catalog/itemPrice.js';
import {
    createThumbnailElement,
    fetchThumbnails,
} from '../../../core/thumbnail/thumbnails.js';
import { createGamePassCard } from '../../../core/ui/games/gamePassCard.js';
import { injectStylesheet } from '../../../core/ui/cssInjector.js';
import { createPillToggle } from '../../../core/ui/general/pillToggle.js';
import { createRobuxIcon } from '../../../core/ui/robuxIcon.js';
import { ts } from '../../../core/locale/i18n.js';

const PRODUCT_PAGE_SIZE = 400;

function makeItemKey(item) {
    return `${item.type}:${item.id}`;
}

function formatCurrency(price) {
    const amount = price?.amount;
    const currencyCode = price?.currency?.currencyCode;
    const currencySymbol = price?.currency?.currencySymbol;

    if (!Number.isFinite(Number(amount))) return '';

    if (currencyCode) {
        try {
            return new Intl.NumberFormat(undefined, {
                style: 'currency',
                currency: currencyCode,
            }).format(Number(amount));
        } catch {}
    }

    return `${Number(amount).toLocaleString()}${currencySymbol || ''}`;
}

async function fetchDeveloperProducts(universeId) {
    const products = [];
    let cursor = null;

    do {
        const data = await callRobloxApiJson({
            subdomain: 'apis',
            endpoint:
                `/developer-products/v2/universes/${universeId}/developerproducts?limit=${PRODUCT_PAGE_SIZE}` +
                (cursor ? `&cursor=${cursor}` : ''),
            method: 'GET',
        });

        if (Array.isArray(data?.developerProducts)) {
            products.push(...data.developerProducts);
        }

        cursor = data?.nextPageCursor || null;
    } while (cursor);

    return products;
}

async function fetchGamePasses(universeId) {
    const passes = [];
    let cursor = '';

    do {
        const data = await callRobloxApiJson({
            subdomain: 'apis',
            endpoint:
                `/game-passes/v1/universes/${universeId}/game-passes?pageSize=50&passView=Full` +
                (cursor ? `&cursor=${cursor}` : ''),
            method: 'GET',
        });

        if (Array.isArray(data?.gamePasses)) {
            passes.push(...data.gamePasses);
        } else if (Array.isArray(data?.data)) {
            passes.push(...data.data);
        }

        cursor = data?.nextPageToken || data?.nextPageCursor || '';
    } while (cursor);

    return passes;
}

async function fetchShopWidget(universeId) {
    const requestId =
        typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    return callRobloxApiJson({
        subdomain: 'apis',
        endpoint: `/marketplace-widgets/v1/widgets/shop-widgets?universeId=${universeId}&requestId=${requestId}`,
        method: 'GET',
    });
}

function normalizeProduct(product) {
    if (!product) return null;

    return {
        type: 'Product',
        id: product.ProductId,
        name: product.Name || product.displayName || ts('shop.product'),
        description: product.Description || product.displayDescription || '',
        price: product.PriceInRobux,
        iconId: product.IconImageAssetId || product.displayIcon,
        raw: product,
        href: `https://www.roblox.com/developer-product/${product.universeId}/product/${product.ProductId}`,
    };
}

function normalizeGamePass(pass) {
    if (!pass) return null;

    const id = pass.id || pass.gamePassId;
    const iconId =
        pass.displayIconImageAssetId ||
        pass.iconImageAssetId ||
        pass.IconImageAssetId;
    const price = pass.price ?? pass.priceInRobux ?? pass.PriceInRobux;

    return {
        type: 'GamePass',
        id,
        name: pass.displayName || pass.name || ts('shop.gamePass'),
        description: pass.displayDescription || pass.description || '',
        price,
        isForSale: pass.isForSale ?? price !== null,
        isOwned: pass.isOwned ?? false,
        productId: pass.productId || pass.ProductId,
        iconId,
        raw: {
            ...pass,
            id,
            gamePassId: id,
            name: pass.displayName || pass.name || ts('shop.gamePass'),
            price,
            displayIconImageAssetId: iconId,
            IconImageAssetId: iconId,
            isForSale: pass.isForSale ?? price !== null,
            isOwned: pass.isOwned ?? false,
        },
        href: `https://www.roblox.com/game-pass/${id}/-`,
    };
}

function createRobuxHref(item, paymentSessionId) {
    const productId = item.info?.productId || item.id;

    if (!productId || !paymentSessionId) {
        return 'https://www.roblox.com/upgrades/robux';
    }

    const params = new URLSearchParams({
        ap: String(productId),
        page: 'RobuxRedesign',
        paymentSessionId,
    });

    return `https://www.roblox.com/upgrades/paymentmethods?${params.toString()}`;
}

function normalizeRobux(item, bonusItem, paymentSessionId) {
    const info = item.info || {};
    const robux = Number(info.robux || 0);
    const priceText = formatCurrency(info.price);
    const bonusName = bonusItem?.name || bonusItem?.displayName || '';
    const bonusIconId =
        bonusItem?.displayIconImageAssetId ||
        bonusItem?.IconImageAssetId ||
        bonusItem?.iconImageAssetId;

    return {
        type: 'Robux',
        id: item.id,
        name: ts('shop.robuxAmount', {
            amount: robux.toLocaleString(),
        }),
        description: bonusName
            ? ts('shop.bonusItem', { item: bonusName })
            : ts('shop.bonusItemFallback'),
        priceText,
        robux,
        iconId: bonusIconId,
        href: createRobuxHref(item, paymentSessionId),
    };
}

async function enrichShopItems(categories, universeId) {
    const productIds = new Set();
    const passIds = new Set();
    const bonusPassIds = new Set();

    categories.forEach((category) => {
        (category.items || []).forEach((item) => {
            if (item.type === 'Product') productIds.add(Number(item.id));
            if (item.type === 'GamePass') passIds.add(Number(item.id));
            if (item.type === 'Robux' && item.bonusItem) {
                if (item.bonusItem.type === 'GamePass') {
                    bonusPassIds.add(Number(item.bonusItem.id));
                }
            }
        });
    });

    const [developerProducts, gamePasses, detailPassEntries, bonusPassEntries] =
        await Promise.all([
            productIds.size > 0 ? fetchDeveloperProducts(universeId) : [],
            passIds.size > 0 || bonusPassIds.size > 0
                ? fetchGamePasses(universeId).catch(() => [])
                : [],
            Promise.all(
                [...passIds].map((id) =>
                    getItemDetails(id, 'GamePass').catch(() => null),
                ),
            ),
            Promise.all(
                [...bonusPassIds].map((id) =>
                    getItemDetails(id, 'GamePass').catch(() => null),
                ),
            ),
        ]);

    const productMap = new Map(
        developerProducts
            .map((product) => ({
                ...product,
                universeId,
            }))
            .map((product) => [Number(product.ProductId), product]),
    );
    const passMap = new Map();
    const addPassToMap = (pass) => {
        if (!pass) return;
        const id = Number(pass.id || pass.gamePassId);
        if (!Number.isFinite(id)) return;
        passMap.set(id, {
            ...(passMap.get(id) || {}),
            ...pass,
        });
    };

    gamePasses.forEach(addPassToMap);
    detailPassEntries.forEach(addPassToMap);
    bonusPassEntries.forEach(addPassToMap);

    const normalizedByKey = new Map();

    categories.forEach((category) => {
        (category.items || []).forEach((item) => {
            let normalized = null;
            const paymentSessionId =
                item.paymentSessionId || category.metadata?.paymentSessionId;

            if (item.type === 'Product') {
                normalized = normalizeProduct(productMap.get(Number(item.id)));
            } else if (item.type === 'GamePass') {
                normalized = normalizeGamePass(passMap.get(Number(item.id)));
            } else if (item.type === 'Robux' && item.bonusItem) {
                const bonusItem =
                    item.bonusItem.type === 'GamePass'
                        ? passMap.get(Number(item.bonusItem.id))
                        : null;
                normalized = normalizeRobux(item, bonusItem, paymentSessionId);
            }

            if (normalized) normalizedByKey.set(makeItemKey(item), normalized);
        });
    });

    return normalizedByKey;
}

function getAllCategory(categories) {
    const seen = new Set();
    const items = [];

    categories.forEach((category) => {
        (category.items || []).forEach((item) => {
            if (item.type === 'Robux' && !item.bonusItem) return;

            const key = makeItemKey(item);
            if (seen.has(key)) return;

            seen.add(key);
            items.push({
                ...item,
                paymentSessionId: category.metadata?.paymentSessionId,
            });
        });
    });

    return {
        id: 'all',
        name: ts('shop.all'),
        items,
    };
}

function createRobuxShopCard(item, thumbnailMap) {
    const card = document.createElement('a');
    card.className = 'rovalra-shop-card bg-shift-200';
    card.href = item.href || '#';
    card.setAttribute('role', 'listitem');

    const cardInfo = document.createElement('div');
    cardInfo.className = 'rovalra-shop-card-info';

    const thumbSection = document.createElement('div');
    thumbSection.className = 'rovalra-shop-card-thumbnail';

    const thumbContainer = document.createElement('span');
    thumbContainer.className = 'thumbnail-2d-container';
    thumbSection.appendChild(thumbContainer);

    const thumbnail = item.iconId
        ? thumbnailMap.get(Number(item.iconId))
        : null;
    const thumb = createThumbnailElement(
        thumbnail || { state: 'Broken' },
        item.name,
        'rovalra-shop-thumbnail',
        { width: '100%', height: '100%', borderRadius: '8px' },
    );
    thumbContainer.appendChild(thumb);

    const textSection = document.createElement('div');
    textSection.className = 'rovalra-shop-card-text';

    const title = document.createElement('span');
    title.className = 'text-title-medium content-emphasis rovalra-shop-title';
    title.textContent = item.name;
    title.title = item.name;

    const description = document.createElement('span');
    description.className =
        'text-body-medium content-default rovalra-shop-description';
    description.textContent = item.description || ts(`shop.types.${item.type}`);
    description.title = description.textContent;

    const price = document.createElement('div');
    price.className = 'rovalra-shop-price subscription-card-price';

    if (item.type === 'Robux') {
        const robuxIcon = createRobuxIcon({
            size: '16px',
            color: 'var(--rovalra-secondary-text-color)',
            verticalAlign: '-2px',
            className: 'subscription-robux-icon',
        });
        const robuxText = document.createElement('span');
        robuxText.className = 'text-body-medium content-default';
        robuxText.textContent = `${item.robux.toLocaleString()} Robux`;
        price.append(robuxIcon, robuxText);

        if (item.priceText) {
            const fiatText = document.createElement('span');
            fiatText.className = 'text-body-medium content-default';
            fiatText.textContent = `(${item.priceText})`;
            price.appendChild(fiatText);
        }
    } else {
        const robuxIcon = createRobuxIcon({
            size: '16px',
            color: 'var(--rovalra-secondary-text-color)',
            verticalAlign: '-2px',
            className: 'subscription-robux-icon',
        });
        const priceText = document.createElement('span');
        priceText.className = 'text-body-medium content-default';
        priceText.textContent =
            item.price === null || typeof item.price === 'undefined'
                ? ts('privateGames.passes.offSale')
                : Number(item.price).toLocaleString();
        price.append(robuxIcon, priceText);
    }

    textSection.append(title, description, price);
    cardInfo.append(thumbSection, textSection);

    const button = document.createElement('span');
    button.className = 'rovalra-shop-card-button';
    button.textContent = ts('privateGames.products.buy');

    card.append(cardInfo, button);
    return card;
}

function createRobuxShimmerGrid(count = 4) {
    const fragment = document.createDocumentFragment();

    for (let i = 0; i < count; i++) {
        const card = document.createElement('div');
        card.className = 'rovalra-shop-card rovalra-shop-shimmer-card';

        const row = document.createElement('div');
        row.className = 'rovalra-shop-card-info';

        const thumb = document.createElement('div');
        thumb.className =
            'thumbnail-2d-container shimmer rovalra-shop-card-thumbnail';

        const text = document.createElement('div');
        text.className = 'rovalra-shop-card-text';

        const title = document.createElement('div');
        title.className = 'thumbnail-2d-container shimmer';
        title.style.cssText = 'width: 85%; height: 14px; border-radius: 4px;';

        const description = document.createElement('div');
        description.className = 'thumbnail-2d-container shimmer';
        description.style.cssText =
            'width: 70%; height: 12px; margin-top: 8px; border-radius: 4px;';

        const price = document.createElement('div');
        price.className = 'thumbnail-2d-container shimmer';
        price.style.cssText =
            'width: 45%; height: 12px; margin-top: 8px; border-radius: 4px;';

        const button = document.createElement('div');
        button.className = 'thumbnail-2d-container shimmer';
        button.style.cssText = 'width: 100%; height: 40px; border-radius: 8px;';

        text.append(title, description, price);
        row.append(thumb, text);
        card.append(row, button);
        fragment.appendChild(card);
    }

    return fragment;
}

function createDeveloperProductTile(item, thumbnailMap) {
    const li = document.createElement('li');
    li.className = 'list-item developer-product-tile';

    const storeCard = document.createElement('div');
    storeCard.className = 'store-card';

    const thumbSection = document.createElement('div');
    thumbSection.className = 'store-product-card-thumbnail';

    const thumbLink = document.createElement('a');
    thumbLink.href = item.href;

    if (item.iconId) {
        const thumbContainer = document.createElement('span');
        thumbContainer.className = 'thumbnail-2d-container gear-passes-asset';
        thumbContainer.style.borderRadius = '8px';
        thumbContainer.style.overflow = 'hidden';
        thumbLink.appendChild(thumbContainer);

        const thumbData = thumbnailMap.get(Number(item.iconId));
        if (thumbData) {
            const thumbEl = createThumbnailElement(thumbData, item.name, '', {
                width: '100%',
                height: '100%',
                borderRadius: '0px',
            });
            thumbContainer.appendChild(thumbEl);
        }
    }

    thumbSection.appendChild(thumbLink);

    const captionSection = document.createElement('div');
    captionSection.className = 'store-product-card-caption';

    const nameDiv = document.createElement('div');
    nameDiv.className = 'store-product-card-name';
    nameDiv.title = item.name;
    nameDiv.textContent = item.name;

    const priceDiv = document.createElement('div');
    priceDiv.className = 'store-card-price';

    const robuxIcon = document.createElement('span');
    robuxIcon.className = 'icon-robux-16x16';
    const robuxText = document.createElement('span');
    robuxText.className = 'text-robux';
    robuxText.textContent =
        item.price === null || typeof item.price === 'undefined'
            ? ts('privateGames.passes.offSale')
            : Number(item.price).toLocaleString();
    priceDiv.append(robuxIcon, robuxText);

    captionSection.append(nameDiv, priceDiv);
    storeCard.append(thumbSection, captionSection);
    li.appendChild(storeCard);

    return li;
}

function createStoreShimmerGrid(count = 4) {
    const fragment = document.createDocumentFragment();

    for (let i = 0; i < count; i++) {
        const li = document.createElement('li');
        li.className = 'list-item';

        const card = document.createElement('div');
        card.className = 'store-card';

        const thumb = document.createElement('div');
        thumb.className = 'thumbnail-2d-container shimmer store-card-image';
        thumb.style.borderRadius = '8px';

        const name = document.createElement('div');
        name.className = 'thumbnail-2d-container shimmer';
        name.style.cssText =
            'width: 90%; height: 14px; margin-top: 8px; border-radius: 4px;';

        const price = document.createElement('div');
        price.className = 'thumbnail-2d-container shimmer';
        price.style.cssText =
            'width: 55%; height: 14px; margin-top: 8px; border-radius: 4px;';

        card.append(thumb, name, price);
        li.appendChild(card);
        fragment.appendChild(li);
    }

    return fragment;
}

function createAutoBuyGamePassCard(item) {
    const card = createGamePassCard(item.raw || item);
    const buyButton = card.querySelector('button');

    if (buyButton) {
        buyButton.addEventListener(
            'click',
            (event) => {
                event.preventDefault();
                event.stopImmediatePropagation();
                window.open(
                    `https://www.roblox.com/game-pass/${item.id}/-?RoValra-Auto-Buy`,
                    '_blank',
                );
            },
            true,
        );
    }

    return card;
}

function setSectionVisible(section, visible) {
    section.hidden = !visible;
}

function renderItems(
    passSection,
    passList,
    productSection,
    productList,
    robuxSection,
    robuxList,
    items,
) {
    passList.innerHTML = '';
    productList.innerHTML = '';
    robuxList.innerHTML = '';
    setSectionVisible(passSection, false);
    setSectionVisible(productSection, false);
    setSectionVisible(robuxSection, false);

    if (items.length === 0) {
        setSectionVisible(robuxSection, true);
        const empty = document.createElement('div');
        empty.className = 'section-content-off rovalra-shop-empty';
        empty.textContent = ts('shop.noItems');
        robuxList.appendChild(empty);
        return;
    }

    const passItems = items.filter((item) => item.type === 'GamePass');
    const productItems = items.filter((item) => item.type === 'Product');
    const robuxItems = items.filter((item) => item.type === 'Robux');
    setSectionVisible(passSection, passItems.length > 0);
    setSectionVisible(productSection, productItems.length > 0);
    setSectionVisible(robuxSection, robuxItems.length > 0);

    const iconIds = items
        .map((item) => item.iconId)
        .filter(Boolean)
        .map((id) => ({ id: Number(id) }));

    const thumbnailMapPromise =
        iconIds.length > 0
            ? fetchThumbnails(iconIds, 'Asset', '150x150')
            : Promise.resolve(new Map());

    if (passItems.length > 0) {
        passList.appendChild(createStoreShimmerGrid());
    }
    if (productItems.length > 0) {
        productList.appendChild(createStoreShimmerGrid());
    }
    if (robuxItems.length > 0) {
        robuxList.appendChild(createRobuxShimmerGrid());
    }

    thumbnailMapPromise.then((thumbnailMap) => {
        passList.innerHTML = '';
        productList.innerHTML = '';
        robuxList.innerHTML = '';
        setSectionVisible(passSection, passItems.length > 0);
        setSectionVisible(productSection, productItems.length > 0);
        setSectionVisible(robuxSection, robuxItems.length > 0);

        passItems.forEach((item) => {
            passList.appendChild(createAutoBuyGamePassCard(item));
        });

        productItems.forEach((item) => {
            productList.appendChild(
                createDeveloperProductTile(item, thumbnailMap),
            );
        });

        robuxItems.forEach((item) => {
            robuxList.appendChild(createRobuxShopCard(item, thumbnailMap));
        });
    });
}

export function createShopSection({ parentContainer, universeId }) {
    injectStylesheet('css/game-shop.css', 'rovalra-game-shop-css');

    const section = document.createElement('div');
    section.id = 'rovalra-shop-section';
    section.className = 'rovalra-shop-section';
    section.style.display = 'none';

    const categoryControls = document.createElement('div');
    categoryControls.className = 'rovalra-shop-category-controls';

    const createSection = (titleText, listClassName, listTag = 'ul') => {
        const section = document.createElement('div');
        section.className = 'rovalra-shop-section-group';
        section.hidden = true;

        const title = document.createElement('h3');
        title.className = 'rovalra-shop-section-title';
        title.textContent = titleText;

        const list = document.createElement(listTag);
        list.className = listClassName;
        list.setAttribute('role', 'list');

        section.append(title, list);

        return { section, list };
    };

    const { section: passSection, list: passList } = createSection(
        ts('privateGames.passes.title'),
        'hlist store-cards store-developer-products-row rovalra-shop-store-list rovalra-shop-pass-list',
    );

    const { section: productSection, list: productList } = createSection(
        ts('privateGames.products.title'),
        'hlist store-cards store-developer-products-row rovalra-shop-store-list rovalra-shop-product-list',
    );

    const { section: robuxSection, list: robuxList } = createSection(
        ts('shop.sections.robux'),
        'rovalra-shop-robux-list',
        'div',
    );

    section.append(categoryControls, passSection, productSection, robuxSection);
    parentContainer.appendChild(section);

    let loaded = false;
    let loadingPromise = null;

    const load = async () => {
        if (loaded) return;
        if (loadingPromise) return loadingPromise;

        loadingPromise = (async () => {
            passList.innerHTML = '';
            productList.innerHTML = '';
            robuxList.innerHTML = '';
            setSectionVisible(passSection, true);
            setSectionVisible(productSection, true);
            setSectionVisible(robuxSection, true);
            passList.appendChild(createStoreShimmerGrid());
            productList.appendChild(createStoreShimmerGrid());
            robuxList.appendChild(createRobuxShimmerGrid());

            try {
                const data = await fetchShopWidget(universeId);
                const widgetCategories = Array.isArray(data?.categories)
                    ? data.categories
                    : [];
                const categories = [
                    getAllCategory(widgetCategories),
                    ...widgetCategories,
                ].filter((category) => category.items?.length);

                const normalizedByKey = await enrichShopItems(
                    categories,
                    universeId,
                );

                const renderCategory = (category) => {
                    const items = (category.items || [])
                        .filter(
                            (item) =>
                                item.type !== 'Robux' ||
                                Boolean(item.bonusItem),
                        )
                        .map((item) => normalizedByKey.get(makeItemKey(item)))
                        .filter(Boolean);
                    renderItems(
                        passSection,
                        passList,
                        productSection,
                        productList,
                        robuxSection,
                        robuxList,
                        items,
                    );
                };

                categoryControls.innerHTML = '';

                if (categories.length > 1) {
                    const toggle = createPillToggle({
                        options: categories.map((category) => ({
                            text: category.name || ts('shop.category'),
                            value: String(category.id),
                        })),
                        initialValue: String(categories[0].id),
                        onChange: (value) => {
                            const selected = categories.find(
                                (category) =>
                                    String(category.id) === String(value),
                            );
                            if (selected) renderCategory(selected);
                        },
                    });
                    categoryControls.appendChild(toggle);
                }

                if (categories.length === 0) {
                    renderItems(
                        passSection,
                        passList,
                        productSection,
                        productList,
                        robuxSection,
                        robuxList,
                        [],
                    );
                } else {
                    renderCategory(categories[0]);
                }

                loaded = true;
            } catch (error) {
                console.warn('RoValra: Failed to load shop widgets', error);
                passList.innerHTML = '';
                productList.innerHTML = '';
                robuxList.innerHTML = '';
                setSectionVisible(passSection, false);
                setSectionVisible(productSection, false);
                setSectionVisible(robuxSection, true);
                const errorMessage = document.createElement('div');
                errorMessage.className =
                    'section-content-off rovalra-shop-empty';
                errorMessage.textContent = ts('shop.failedToLoad');
                robuxList.appendChild(errorMessage);
            }
        })();

        return loadingPromise;
    };

    return {
        element: section,
        show() {
            section.style.display = '';
            load();
        },
        hide() {
            section.style.display = 'none';
        },
    };
}
