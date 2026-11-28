import { callRobloxApiJson } from '../../core/api.js';
import { observeElement, observeResize } from '../../core/observer.js';
import { fetchThumbnails } from '../../core/thumbnail/thumbnails.js';

const FEED_LIST_SELECTOR = '[data-rovalra-sdui-feed-list]';
const ROW_CLASS = 'rovalra-sdui-extra-row';
const KEY_ATTR = 'data-rovalra-sdui-key';
const SUB_ID_ATTR = 'data-rovalra-sort-sub-id';
const CAROUSEL_TILE_SELECTOR =
    '[data-testid="collection-carousel-track"] [data-testid="collection-carousel-item-slot"] [data-testid="sdui-game-tile"]';
const IMAGE_CONTAINER_SELECTOR = '[data-testid="sdui-tile-image-container"]';
const ICON_SIZE = '256x256';
const WIDE_SIZE = '384x216';
const MULTIGET_CHUNK_SIZE = 50;

const PLACEHOLDER_SRC =
    'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

const sortsBySource = new Map();
const rowState = new WeakMap();
const resizeObservedLists = new WeakSet();
let renderQueued = false;
let initialized = false;
const compactNumber = new Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1,
});

document.addEventListener('rovalra-home-extra-sorts', (event) => {
    sortsBySource.set(
        event.detail?.source || 'legacy',
        Array.isArray(event.detail?.sorts) ? event.detail.sorts : [],
    );
    scheduleRender();
});

function getSortKey(sort) {
    if (sort?.topicId !== undefined && sort?.topicId !== null) {
        return `topicId:${sort.topicId}`;
    }
    return sort?.topic ? `topic:${sort.topic}` : '';
}

function getSortKind(sort) {
    return sort?.topicLayoutData?.componentType === 'EventTile'
        ? 'wide'
        : 'square';
}

function getGames(sort) {
    return (Array.isArray(sort?.games) ? sort.games : []).filter((game) =>
        Number.isSafeInteger(Number(game?.universeId)),
    );
}

function getWantedSorts() {
    const seenKeys = new Set();
    return [...sortsBySource.values()].flat().filter((sort) => {
        const key = getSortKey(sort);
        if (!key || seenKeys.has(key)) return false;
        seenKeys.add(key);
        return getGames(sort).length > 0 || sort.rovalraKeepEmpty === true;
    });
}

function getTemplateKind(template) {
    const ratio = template
        .querySelector(IMAGE_CONTAINER_SELECTOR)
        ?.style.aspectRatio.split('/')
        .map(Number);
    if (!ratio || !ratio[0]) return 'square';
    return ratio[0] / (ratio[1] || 1) > 1.2 ? 'wide' : 'square';
}

function findCarouselTemplates(list) {
    return [...list.children].filter(
        (child) =>
            !child.classList.contains(ROW_CLASS) &&
            child.querySelector(CAROUSEL_TILE_SELECTOR),
    );
}

function findCarouselTemplate(list, kind) {
    const templates = findCarouselTemplates(list);
    const template =
        templates.find((candidate) => getTemplateKind(candidate) === kind) ||
        templates[0] ||
        null;
    return template ? { template, kind: getTemplateKind(template) } : null;
}

function isInjectedToken(token) {
    return token.startsWith('rovalra-') || token.startsWith('roseal-');
}

function sanitizeClone(root) {
    for (const element of [root, ...root.querySelectorAll('*')]) {
        if (element !== root && !root.contains(element)) continue;
        const tokens = [...element.classList];
        if (
            element !== root &&
            ((tokens.length &&
                tokens.every((token) => isInjectedToken(token))) ||
                (element.hasAttribute('data-rovalra-wide-game-tile-stats') &&
                    element.dataset.testid !== 'tile-footer-right'))
        ) {
            element.remove();
            continue;
        }
        tokens
            .filter((token) => isInjectedToken(token))
            .forEach((token) => element.classList.remove(token));
        [...element.attributes]
            .filter(
                (attribute) =>
                    attribute.name.startsWith('data-rovalra') ||
                    attribute.name === 'data-sdui-feed-index' ||
                    attribute.name === 'inert',
            )
            .forEach((attribute) => element.removeAttribute(attribute.name));
        if (element.dataset?.testid?.startsWith('sdui-carousel-item-')) {
            element.setAttribute('aria-hidden', 'false');
        }
        element.style?.removeProperty('order');
    }
}

function getGamePlaceId(game) {
    return Number(game.rootPlaceId || game.root_place_id || game.placeId) || 0;
}

function getGameUrl(game, subId) {
    const placeId = getGamePlaceId(game);
    if (!placeId) return '';
    const slug =
        String(game.name || '')
            .replace(/[^a-z0-9]+/gi, '-')
            .replace(/^-+|-+$/g, '') || 'game';
    const url = new URL(`/games/${placeId}/${slug}`, window.location.origin);
    if (subId) url.searchParams.set('sortSubId', subId);
    url.searchParams.set('universeId', String(game.universeId));
    return url.toString();
}

function getRatingSuffix(slot) {
    const text =
        slot.querySelector('[data-testid="tile-footer-left"] [data-sdui-text]')
            ?.textContent || '';
    return text.replace(/^[^%]*%/, '');
}

function getRatingText(game, suffix) {
    const upVotes = Number(game.totalUpVotes) || 0;
    const downVotes = Number(game.totalDownVotes) || 0;
    if (!upVotes && !downVotes) return `--${suffix}`;
    return `${Math.round((upVotes / (upVotes + downVotes)) * 100)}%${suffix}`;
}

function getPlayersText(game) {
    return compactNumber.format(Number(game.playerCount ?? game.playing) || 0);
}

function isSafeImageUrl(value) {
    try {
        const url = new URL(value);
        return (
            url.protocol === 'https:' &&
            (url.hostname === 'rbxcdn.com' ||
                url.hostname.endsWith('.rbxcdn.com'))
        );
    } catch {
        return false;
    }
}

function syncSlotWidths(row, list) {
    const state = rowState.get(row);
    const match = findCarouselTemplate(list, state.kind);
    if (!match || match.kind !== state.kind) return;
    const width = match.template.querySelector(
        '[data-testid="collection-carousel-item-slot"]',
    )?.style.width;
    if (!width) return;
    row.querySelectorAll(
        '[data-testid="collection-carousel-item-slot"]',
    ).forEach((slot) => {
        slot.style.width = width;
    });
}

function updateArrows(state) {
    if (!state) return;
    const { track, leftArrow, rightArrow } = state;
    const maxScroll = track.scrollWidth - track.clientWidth;
    leftArrow?.classList.toggle('hidden', track.scrollLeft <= 1);
    rightArrow?.classList.toggle('hidden', track.scrollLeft >= maxScroll - 1);
}

function setupArrow(arrow, track, direction) {
    const scroll = () =>
        track.scrollBy({
            left: direction * track.clientWidth,
            behavior: 'smooth',
        });
    arrow.addEventListener('click', scroll);
    arrow.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        scroll();
    });
}

function createSubtitleTemplate(titleRows) {
    if (titleRows[1]) return titleRows[1].cloneNode(true);
    const subtitle = titleRows[0]?.cloneNode(true);
    const text = subtitle?.querySelector('[data-testid="text-icon-row-text"]');
    if (!text) return null;
    text.classList.replace('text-heading-small', 'text-body-medium');
    text.classList.replace('content-emphasis', 'content-default');
    return subtitle;
}

function buildRow(template, kind, sort) {
    const column = template
        .querySelector('[data-testid="section-header"]')
        ?.closest('.flex.flex-col');
    const track = column?.querySelector(
        '[data-testid="collection-carousel-track"]',
    );
    const slot = track?.querySelector(
        '[data-testid="collection-carousel-item-slot"]',
    );
    if (!column || !slot) return null;

    const row = document.createElement('div');
    row.className = ROW_CLASS;
    const columnClone = column.cloneNode(true);
    sanitizeClone(columnClone);
    row.append(columnClone);

    const slotTemplate = slot.cloneNode(true);
    sanitizeClone(slotTemplate);
    slotTemplate
        .querySelectorAll(
            '[data-testid="sdui-tile-overlay-container"] [data-testid^="slot-wrapper-"]',
        )
        .forEach((badge) => badge.remove());
    const ratingSuffix = getRatingSuffix(slotTemplate);
    const rowTrack = columnClone.querySelector(
        '[data-testid="collection-carousel-track"]',
    );
    rowTrack.replaceChildren();
    rowTrack.scrollLeft = 0;

    const titleLink = columnClone.querySelector(
        '[data-testid="section-header-title-subtitle-container"] a',
    );
    titleLink?.removeAttribute('href');
    if (titleLink) titleLink.style.cursor = 'default';
    columnClone
        .querySelectorAll(
            '[data-testid="section-header"] [data-testid="icon-component"]',
        )
        .forEach((icon) => icon.remove());

    const titleRows = [
        ...columnClone.querySelectorAll(
            '[data-testid="section-header"] [data-testid="text-icon-row"]',
        ),
    ];
    const subtitleTemplate = createSubtitleTemplate(titleRows);
    titleRows.slice(1).forEach((titleRow) => titleRow.remove());

    const viewport = columnClone.querySelector(
        '[data-testid="collection-carousel-viewport"]',
    );
    const arrows = [
        ...columnClone.querySelectorAll(
            '[data-testid="carousel-scroll-arrow"]',
        ),
    ];
    const rightArrow = arrows.shift() || null;
    arrows.forEach((arrow) => arrow.remove());
    let leftArrow = null;
    if (rightArrow) {
        leftArrow = rightArrow.cloneNode(true);
        leftArrow.style.insetInlineEnd = 'auto';
        leftArrow.style.insetInlineStart = '0';
        leftArrow
            .querySelector('[data-testid="carousel-scroll-arrow-icon"]')
            ?.classList.replace(
                'icon-regular-chevron-large-right',
                'icon-regular-chevron-large-left',
            );
        viewport?.append(leftArrow);
        setupArrow(rightArrow, rowTrack, 1);
        setupArrow(leftArrow, rowTrack, -1);
    }

    const state = {
        kind,
        track: rowTrack,
        slotTemplate,
        subtitleTemplate,
        ratingSuffix,
        leftArrow,
        rightArrow,
        signature: '',
        subtitle: null,
    };
    rowTrack.addEventListener('scroll', () => updateArrows(state), {
        passive: true,
    });
    rowState.set(row, state);
    updateRowHeader(row, sort);
    return row;
}

function updateRowHeader(row, sort) {
    const state = rowState.get(row);
    row.setAttribute(KEY_ATTR, getSortKey(sort));
    if (sort.subId) row.setAttribute(SUB_ID_ATTR, sort.subId);
    else row.removeAttribute(SUB_ID_ATTR);

    const titleRow = row.querySelector(
        '[data-testid="section-header"] [data-testid="text-icon-row"]',
    );
    const title = titleRow?.querySelector('[data-testid="text-icon-row-text"]');
    if (title && title.textContent !== sort.topic) {
        title.textContent = sort.topic || '';
    }
    titleRow?.setAttribute('aria-label', sort.topic || '');

    const subtitleText = typeof sort.subtitle === 'string' ? sort.subtitle : '';
    if (state.subtitle === subtitleText) return;
    state.subtitle = subtitleText;

    row.querySelector('.rovalra-sdui-extra-subtitle')?.remove();
    if (!subtitleText || !state.subtitleTemplate || !titleRow) return;
    const subtitle = state.subtitleTemplate.cloneNode(true);
    subtitle.classList.add('rovalra-sdui-extra-subtitle');
    subtitle.removeAttribute('aria-label');
    const subtitleSpan = subtitle.querySelector(
        '[data-testid="text-icon-row-text"]',
    );
    if (subtitleSpan) subtitleSpan.textContent = subtitleText;
    titleRow.after(subtitle);
}

function fillTiles(row, sort) {
    const state = rowState.get(row);
    const games = getGames(sort);
    const placeholderTitle = games.length
        ? ''
        : sort.rovalraPlaceholder?.title || '';
    const signature = JSON.stringify([
        placeholderTitle,
        ...games.map((game) => [
            game.universeId,
            game.name,
            game.totalUpVotes,
            game.totalDownVotes,
            game.playerCount,
            game.rovalraPlaytime,
        ]),
    ]);
    if (state.signature === signature) return false;
    state.signature = signature;

    if (placeholderTitle) {
        state.track.replaceChildren(
            createPlaceholderSlot(state.slotTemplate, placeholderTitle),
        );
        return true;
    }

    const slots = games.map((game, index) => {
        const slot = state.slotTemplate.cloneNode(true);
        slot.querySelector(
            '[data-testid^="sdui-carousel-item-"]',
        )?.setAttribute('data-testid', `sdui-carousel-item-${index}`);

        const tile = slot.querySelector('[data-testid="sdui-game-tile"]');
        if (tile) {
            tile.dataset.rovalraUniverseId = String(game.universeId);
            tile.dataset.rovalraPlaceId = String(getGamePlaceId(game));
        }

        const link = slot.querySelector('a');
        const href = getGameUrl(game, sort.subId);
        if (link) {
            if (href) link.href = href;
            else link.removeAttribute('href');
            link.setAttribute('aria-label', game.name || '');
        }

        const image = slot.querySelector(`${IMAGE_CONTAINER_SELECTOR} img`);
        if (image) {
            image.removeAttribute('srcset');
            image.src = PLACEHOLDER_SRC;
            image.alt = game.name || '';
        }

        const title = link?.querySelector(':scope > [data-sdui-text]');
        if (title) title.textContent = game.name || '';

        const left = slot.querySelector(
            '[data-testid="tile-footer-left"] [data-sdui-text]',
        );
        if (left) left.textContent = getRatingText(game, state.ratingSuffix);
        const right = slot.querySelector(
            '[data-testid="tile-footer-right"] [data-sdui-text]',
        );
        if (right) right.textContent = getPlayersText(game);
        return slot;
    });

    state.track.replaceChildren(...slots);
    state.track.scrollLeft = 0;
    loadThumbnails(row, sort, games).catch((error) =>
        console.warn('RoValra: failed to load SDUI sort thumbnails', error),
    );
    return true;
}

function createPlaceholderSlot(slotTemplate, title) {
    const slot = slotTemplate.cloneNode(true);
    slot.classList.add('rovalra-sdui-placeholder-slot');
    const link = slot.querySelector('a');
    if (link) {
        link.removeAttribute('href');
        link.removeAttribute('aria-label');
        link.style.cursor = 'default';
    }
    const image = slot.querySelector(`${IMAGE_CONTAINER_SELECTOR} img`);
    if (image) {
        image.removeAttribute('srcset');
        image.src = PLACEHOLDER_SRC;
        image.alt = '';
    }
    const titleText = link?.querySelector(':scope > [data-sdui-text]');
    if (titleText) titleText.textContent = title;
    slot.querySelector('[data-testid="sdui-tile-footer-content"]')?.remove();
    slot.querySelector('[data-testid="sdui-tile-overflow-menu"]')?.remove();
    return slot;
}

function getWideImageAssetId(game, sort) {
    const assetId =
        game.layoutDataBySort?.[sort.topicId]?.primaryMediaAsset
            ?.wideImageAssetId ??
        game.wide_image_asset_id ??
        game.wideImageAssetId;
    return Number(assetId) || 0;
}

async function fetchWideGameThumbnails(universeIds) {
    const urls = new Map();
    for (let i = 0; i < universeIds.length; i += MULTIGET_CHUNK_SIZE) {
        const ids = universeIds.slice(i, i + MULTIGET_CHUNK_SIZE).join(',');
        const data = await callRobloxApiJson({
            subdomain: 'thumbnails',
            endpoint: `/v1/games/multiget/thumbnails?universeIds=${ids}&countPerUniverse=1&defaults=true&size=${WIDE_SIZE}&format=Webp&isCircular=false`,
        });
        (data?.data || []).forEach((entry) => {
            const url = entry?.thumbnails?.[0]?.imageUrl;
            if (url) urls.set(Number(entry.universeId), url);
        });
    }
    return urls;
}

async function getThumbnailUrls(sort, games, kind) {
    if (kind !== 'wide') {
        const icons = await fetchThumbnails(
            games.map((game) => ({ id: Number(game.universeId) })),
            'GameIcon',
            ICON_SIZE,
        );
        return new Map(
            games.map((game) => [
                Number(game.universeId),
                icons.get(Number(game.universeId))?.imageUrl,
            ]),
        );
    }

    const urls = new Map();
    const withAsset = games.filter((game) => getWideImageAssetId(game, sort));
    if (withAsset.length) {
        const assets = await fetchThumbnails(
            withAsset.map((game) => ({ id: getWideImageAssetId(game, sort) })),
            'Asset',
            WIDE_SIZE,
        );
        withAsset.forEach((game) => {
            const asset = assets.get(getWideImageAssetId(game, sort));
            if (asset?.state === 'Completed' && asset.imageUrl) {
                urls.set(Number(game.universeId), asset.imageUrl);
            }
        });
    }
    const missing = games
        .map((game) => Number(game.universeId))
        .filter((universeId) => !urls.has(universeId));
    if (missing.length) {
        (await fetchWideGameThumbnails(missing)).forEach((url, universeId) =>
            urls.set(universeId, url),
        );
    }
    return urls;
}

async function loadThumbnails(row, sort, games) {
    if (!games.length) return;
    const urls = await getThumbnailUrls(sort, games, rowState.get(row).kind);
    row.querySelectorAll('[data-testid="sdui-game-tile"]').forEach((tile) => {
        const url = urls.get(Number(tile.dataset.rovalraUniverseId));
        const container = tile.querySelector(
            `${IMAGE_CONTAINER_SELECTOR} .sdui-thumbnail-image-container`,
        );
        if (!isSafeImageUrl(url) || !container) return;
        let image = container.querySelector('img');
        if (!image) {
            image = document.createElement('img');
            image.className = 'size-full';
            image.loading = 'lazy';
            container.replaceChildren(image);
        }
        image.alt = '';
        image.src = url;
    });
}

function render() {
    const list = document.querySelector(FEED_LIST_SELECTOR);
    if (!list) return;
    if (!resizeObservedLists.has(list)) {
        resizeObservedLists.add(list);
        observeResize(list, () => requestAnimationFrame(syncAllRows));
    }

    const wantedSorts = getWantedSorts();
    const wantedKeys = new Set(wantedSorts.map(getSortKey));
    const existingRows = new Map(
        [...list.querySelectorAll(`:scope > .${ROW_CLASS}`)].map((row) => [
            row.getAttribute(KEY_ATTR),
            row,
        ]),
    );
    let changed = false;

    existingRows.forEach((row, key) => {
        if (wantedKeys.has(key)) return;
        row.remove();
        existingRows.delete(key);
        changed = true;
    });

    for (const sort of wantedSorts) {
        const key = getSortKey(sort);
        const kind = getSortKind(sort);
        let row = existingRows.get(key);
        const match = findCarouselTemplate(list, kind);
        if (row && match && rowState.get(row).kind !== match.kind) {
            const rebuilt = buildRow(match.template, match.kind, sort);
            if (rebuilt) {
                row.replaceWith(rebuilt);
                row = rebuilt;
                changed = true;
            }
        }
        if (!row) {
            if (!match) continue;
            row = buildRow(match.template, match.kind, sort);
            if (!row) continue;
            list.append(row);
            changed = true;
        }
        updateRowHeader(row, sort);
        if (fillTiles(row, sort)) changed = true;
        syncSlotWidths(row, list);
        requestAnimationFrame(() => updateArrows(rowState.get(row)));
    }

    if (changed) {
        document.dispatchEvent(new CustomEvent('rovalra-sdui-home-updated'));
    }
}

function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
        renderQueued = false;
        render();
    });
}

function syncAllRows() {
    const list = document.querySelector(FEED_LIST_SELECTOR);
    if (!list) return;
    list.querySelectorAll(`:scope > .${ROW_CLASS}`).forEach((row) => {
        syncSlotWidths(row, list);
        updateArrows(rowState.get(row));
    });
}

export function init() {
    if (initialized) return;
    initialized = true;

    document.addEventListener('rovalra-sdui-feed-ready', scheduleRender);
    observeElement(
        '[data-testid="home-sdui-page"] [data-testid="collection-carousel-track"]',
        scheduleRender,
        { multiple: true },
    );
    scheduleRender();
}
