import { callRobloxApiJson } from '../../core/api.js';
import { observeElement } from '../../core/observer.js';
import { fetchThumbnails } from '../../core/thumbnail/thumbnails.js';
import { createDevProductCard } from '../../core/ui/games/devProductsUI.js';
import { createDropdown } from '../../core/ui/dropdown.js';
import { createStyledInput } from '../../core/ui/catalog/input.js';
import { createScrollButtons } from '../../core/ui/general/scrollButtons.js';
import { ts } from '../../core/locale/i18n.js';

const PRODUCTS_PATH_PATTERN =
    /^(?:\/[a-z]{2}(?:-[a-z]{2})?)?\/games\/products-section\/(\d+)/i;
const ITEMS_PER_PAGE = 58;

let currentPlaceId = null;

function getProductsSectionPlaceId() {
    return window.location.pathname.match(PRODUCTS_PATH_PATTERN)?.[1] || null;
}

async function fetchUniverseId(placeId) {
    const details = await callRobloxApiJson({
        subdomain: 'games',
        endpoint: `/v1/games/multiget-place-details?placeIds=${placeId}`,
    }).catch(() => null);

    const game = details?.[0];
    return {
        universeId: game?.universeId || null,
        name: game?.name || '',
    };
}

async function fetchDeveloperProducts(universeId) {
    let products = [];
    let cursor = null;

    do {
        const endpoint =
            `/developer-products/v2/universes/${universeId}/developerproducts?limit=400` +
            (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');

        const data = await callRobloxApiJson({
            subdomain: 'apis',
            endpoint,
        }).catch(() => null);

        if (Array.isArray(data?.developerProducts)) {
            products = products.concat(data.developerProducts);
        }

        cursor = data?.nextPageCursor || null;
    } while (cursor);

    return products;
}

function injectStyles() {
    if (document.getElementById('rovalra-developer-products-section-style'))
        return;

    const style = document.createElement('style');
    style.id = 'rovalra-developer-products-section-style';
    style.textContent = `
        .rovalra-products-section {
            max-width: 1280px;
            margin: 0 auto;
            padding: 24px 0 48px;
        }

        .rovalra-products-section-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            gap: 16px;
            margin-bottom: 18px;
        }

        .rovalra-products-section-title {
            margin: 0;
            font-size: 32px;
            line-height: 1.15;
            font-weight: 800;
        }

        .rovalra-products-section-subtitle {
            margin: 6px 0 0;
        }

        .rovalra-products-section-controls {
            display: flex;
            align-items: center;
            justify-content: flex-end;
            gap: 10px;
            flex-wrap: wrap;
            margin-bottom: 18px;
        }

        .rovalra-products-section-list {
            display: flex;
            flex-wrap: wrap;
            padding: 0;
            margin: 0;
            list-style: none;
        }

        .rovalra-products-section-pagination {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 15px;
            margin-top: 16px;
        }

        .rovalra-products-section-status {
            min-height: 180px;
            display: flex;
            align-items: center;
            justify-content: center;
            text-align: center;
        }

        .rovalra-products-section-buy {
            margin-top: 10px;
        }

        @media (max-width: 767px) {
            .rovalra-products-section {
                padding: 18px 0 36px;
            }

            .rovalra-products-section-header {
                display: block;
            }

            .rovalra-products-section-title {
                font-size: 26px;
            }

            .rovalra-products-section-controls {
                justify-content: flex-start;
            }

            .rovalra-products-section-controls .rovalra-catalog-input-wrapper {
                width: 100% !important;
            }
        }
    `;
    document.head.appendChild(style);
}

function createStatus(message, className = 'section-content-off') {
    const status = document.createElement('div');
    status.className = `rovalra-products-section-status ${className}`;
    status.textContent = message;
    return status;
}

function createAutoBuyProductCard(product, thumbnail, universeId) {
    const card = createDevProductCard({
        id: product.ProductId,
        name: product.Name,
        price: product.PriceInRobux,
        thumbnail,
        universeId,
    });

    const container = card.querySelector('.store-card-container');
    if (!container) return card;

    const buyButton = document.createElement('button');
    buyButton.type = 'button';
    buyButton.className =
        'rovalra-products-section-buy PurchaseButton btn-buy-md btn-full-width rbx-gear-passes-purchase btn-primary-md btn-min-width';
    buyButton.dataset.productId = product.ProductId;
    buyButton.dataset.itemId = product.ProductId;
    buyButton.dataset.itemName = product.Name || 'Unnamed Product';
    buyButton.dataset.expectedPrice = product.PriceInRobux ?? '';
    buyButton.dataset.assetType = 'Developer Product';
    buyButton.textContent = ts('privateGames.products.buy');
    buyButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        window.open(
            `https://www.roblox.com/developer-product/${universeId}/product/${product.ProductId}?RoValra-Auto-Buy`,
            '_blank',
        );
    });

    container.appendChild(buyButton);
    return card;
}

function sortDeveloperProducts(products, field, order, searchTerm) {
    const terms = searchTerm.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const filtered = terms.length
        ? products.filter((product) => {
              const name = (product.Name || '').toLowerCase();
              return terms.every((term) => name.includes(term));
          })
        : [...products];

    filtered.sort((a, b) => {
        let valA;
        let valB;

        switch (field) {
            case 'Price':
                valA = a.PriceInRobux ?? 0;
                valB = b.PriceInRobux ?? 0;
                break;
            case 'Name':
                valA = (a.Name || '').toLowerCase();
                valB = (b.Name || '').toLowerCase();
                break;
            case 'Updated':
                valA = a.Updated ? new Date(a.Updated).getTime() : 0;
                valB = b.Updated ? new Date(b.Updated).getTime() : 0;
                break;
            case 'Created':
            default:
                valA = a.ProductId ?? 0;
                valB = b.ProductId ?? 0;
                break;
        }

        if (valA < valB) return order === 'Asc' ? -1 : 1;
        if (valA > valB) return order === 'Asc' ? 1 : -1;
        return 0;
    });

    return filtered;
}

async function renderProductsPage(content, placeId) {
    injectStyles();
    content.innerHTML = '';

    const section = document.createElement('div');
    section.className = 'rovalra-products-section';

    const loading = createStatus('', 'section-content');
    const spinner = document.createElement('div');
    spinner.className = 'spinner spinner-default';
    loading.appendChild(spinner);
    section.appendChild(loading);
    content.appendChild(section);

    const { universeId, name } = await fetchUniverseId(placeId);
    if (currentPlaceId !== placeId) return;

    if (!universeId) {
        section.replaceChildren(
            createStatus('Unable to load developer products for this game.'),
        );
        return;
    }

    const products = await fetchDeveloperProducts(universeId);
    if (currentPlaceId !== placeId) return;

    const header = document.createElement('div');
    header.className = 'rovalra-products-section-header';

    const titleWrap = document.createElement('div');
    const title = document.createElement('h1');
    title.className = 'rovalra-products-section-title';
    title.textContent = ts('devProducts.developerProducts');
    titleWrap.appendChild(title);

    if (name) {
        const subtitle = document.createElement('p');
        subtitle.className =
            'rovalra-products-section-subtitle text-secondary';
        subtitle.textContent = name;
        titleWrap.appendChild(subtitle);
    }

    const count = document.createElement('div');
    count.className = 'text-secondary';
    count.style.fontWeight = '500';
    header.append(titleWrap, count);

    const controls = document.createElement('div');
    controls.className = 'rovalra-products-section-controls';

    const searchInput = createStyledInput({
        id: 'rovalra-products-section-search',
        label: ts('devProducts.search'),
        placeholder: ' ',
    });
    searchInput.container.style.width = '250px';

    const sortFieldDropdown = createDropdown({
        items: [
            { value: 'Created', label: ts('devProducts.sort.created') },
            { value: 'Price', label: ts('devProducts.sort.price') },
            { value: 'Updated', label: ts('devProducts.sort.updated') },
            { value: 'Name', label: ts('devProducts.sort.name') },
        ],
        initialValue: 'Created',
        onValueChange: (value) => {
            sortField = value;
            renderCurrentPage();
        },
    });

    const sortOrderDropdown = createDropdown({
        items: [
            { value: 'Asc', label: ts('devProducts.order.ascending') },
            { value: 'Desc', label: ts('devProducts.order.descending') },
        ],
        initialValue: 'Desc',
        onValueChange: (value) => {
            sortOrder = value;
            renderCurrentPage();
        },
    });

    controls.append(
        searchInput.container,
        sortFieldDropdown.element,
        sortOrderDropdown.element,
    );

    const list = document.createElement('ul');
    list.className = 'hlist store-cards rovalra-products-section-list';

    const pagination = document.createElement('div');
    pagination.className = 'rovalra-products-section-pagination';

    section.replaceChildren(header, controls, list, pagination);

    let sortField = 'Created';
    let sortOrder = 'Desc';
    let searchTerm = '';
    let currentPage = 0;
    let filteredProducts = [];
    let renderId = 0;
    const thumbnailMap = new Map();

    const updatePagination = () => {
        pagination.innerHTML = '';
        const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);
        if (totalPages <= 1) return;

        const { leftButton, rightButton } = createScrollButtons({
            onLeftClick: () => {
                if (currentPage > 0) {
                    currentPage--;
                    renderPageItems();
                }
            },
            onRightClick: () => {
                if (currentPage < totalPages - 1) {
                    currentPage++;
                    renderPageItems();
                }
            },
        });

        if (currentPage === 0) {
            leftButton.style.opacity = '0.5';
            leftButton.style.cursor = 'default';
        }
        if (currentPage >= totalPages - 1) {
            rightButton.style.opacity = '0.5';
            rightButton.style.cursor = 'default';
        }

        const pageInfo = document.createElement('span');
        pageInfo.className = 'text-secondary';
        pageInfo.style.fontWeight = '500';
        pageInfo.textContent = `${currentPage + 1} / ${totalPages}`;

        pagination.append(leftButton, pageInfo, rightButton);
    };

    const renderPageItems = async () => {
        const currentRenderId = ++renderId;
        list.innerHTML = '';

        if (filteredProducts.length === 0) {
            list.appendChild(createStatus(ts('devProducts.noProducts')));
            count.textContent = '0';
            pagination.innerHTML = '';
            return;
        }

        count.textContent = filteredProducts.length.toLocaleString();

        const pageItems = filteredProducts.slice(
            currentPage * ITEMS_PER_PAGE,
            currentPage * ITEMS_PER_PAGE + ITEMS_PER_PAGE,
        );
        const cardMap = new Map();

        pageItems.forEach((product) => {
            const assetId = Number(product.IconImageAssetId) || 0;
            const thumbnail =
                assetId > 0 && thumbnailMap.has(assetId)
                    ? thumbnailMap.get(assetId)
                    : { state: assetId > 0 ? 'Pending' : 'Broken' };

            const card = createAutoBuyProductCard(
                product,
                thumbnail,
                universeId,
            );
            list.appendChild(card);
            cardMap.set(product.ProductId, card);
        });

        updatePagination();

        const productsToFetch = pageItems.filter((product) => {
            const assetId = Number(product.IconImageAssetId) || 0;
            return assetId > 0 && !thumbnailMap.has(assetId);
        });

        if (productsToFetch.length === 0) return;

        const fetchedThumbnails = await fetchThumbnails(
            productsToFetch.map((product) => ({
                id: Number(product.IconImageAssetId),
            })),
            'Asset',
            '150x150',
        );

        if (currentRenderId !== renderId || currentPlaceId !== placeId) return;

        productsToFetch.forEach((product) => {
            const assetId = Number(product.IconImageAssetId);
            const thumbnail = fetchedThumbnails.get(assetId);
            const oldCard = cardMap.get(product.ProductId);
            if (!thumbnail || !oldCard) return;

            thumbnailMap.set(assetId, thumbnail);
            if (
                (thumbnail.state === 'Pending' ||
                    thumbnail.state === 'InReview') &&
                thumbnail.finalUpdate
            ) {
                thumbnail.finalUpdate.then((finalData) => {
                    if (finalData) thumbnailMap.set(assetId, finalData);
                });
            }

            oldCard.replaceWith(
                createAutoBuyProductCard(product, thumbnail, universeId),
            );
        });
    };

    const renderCurrentPage = () => {
        filteredProducts = sortDeveloperProducts(
            products,
            sortField,
            sortOrder,
            searchTerm,
        );
        currentPage = 0;
        renderPageItems();
    };

    searchInput.input.addEventListener('input', (event) => {
        searchTerm = event.target.value;
        renderCurrentPage();
    });

    renderCurrentPage();
}

export function init() {
    const placeId = getProductsSectionPlaceId();
    if (!placeId) return;
    if (
        currentPlaceId === placeId &&
        document.querySelector('.rovalra-products-section')
    )
        return;

    currentPlaceId = placeId;
    observeElement('.content#content, #content', (content) => {
        if (getProductsSectionPlaceId() !== placeId) return;
        renderProductsPage(content, placeId).catch((error) => {
            console.error(
                'RoValra: Failed to render developer products section',
                error,
            );
            content.innerHTML = '';
            content.appendChild(
                createStatus('Unable to load developer products for this game.'),
            );
        });
    });
}
