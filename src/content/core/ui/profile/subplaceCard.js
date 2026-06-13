import { getPlaceDetails } from '../../apis/games.js';
import { performJoinAction } from '../../preferredregion.js';
import { followUser, launchGame } from '../../utils/launcher.js';
import { getBatchThumbnails } from '../../thumbnail/thumbnails.js';

const placeDetailsCache = new Map();
const activeCards = new WeakMap();

function normalizeId(value) {
    const id = Number(value);
    return Number.isFinite(id) && id > 0 ? String(id) : '';
}

function normalizeText(text) {
    return String(text || '')
        .replace(/\s+/g, ' ')
        .trim();
}

function getPresenceIds(presence) {
    const placeId = normalizeId(presence?.placeId);
    const rootPlaceId = normalizeId(presence?.rootPlaceId);
    const universeId = normalizeId(presence?.universeId);

    return { placeId, rootPlaceId, universeId };
}

export function clearSubplaceCardFromPresenceTarget(target) {
    if (!target) return;

    const existing = activeCards.get(target);
    if (existing) existing.cleanup();

    target.classList?.remove('rovalra-subplace-hover-target');
    delete target.dataset.rovalraPresencePlaceId;
    delete target.dataset.rovalraPresenceRootPlaceId;
    delete target.dataset.rovalraPresenceUniverseId;
    delete target.dataset.rovalraPresenceUserId;
    delete target.dataset.rovalraPresenceGameId;
}

function normalizePlaceDetails(place, presence) {
    if (!place) return null;

    const ids = getPresenceIds(presence);
    const placeId = normalizeId(place.placeId) || ids.placeId;
    const rootPlaceId =
        normalizeId(place.universeRootPlaceId) || ids.rootPlaceId || placeId;
    const universeId = normalizeId(place.universeId) || ids.universeId;

    if (!placeId) return null;

    return {
        ...place,
        placeId,
        rootPlaceId,
        universeId,
        root: rootPlaceId ? placeId === rootPlaceId : false,
    };
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function fetchPresencePlaceDetails(presence) {
    const ids = getPresenceIds(presence);
    if (!ids.placeId) return null;

    const cacheKey = ids.placeId;
    if (placeDetailsCache.has(cacheKey)) {
        return placeDetailsCache.get(cacheKey);
    }

    const promise = getPlaceDetails(ids.placeId)
        .then((place) => normalizePlaceDetails(place, presence))
        .catch(() => null);

    placeDetailsCache.set(cacheKey, promise);
    return promise;
}

async function fetchRootPlaceDetails(place, presence) {
    const rootPlaceId = normalizeId(
        place?.rootPlaceId || presence?.rootPlaceId,
    );
    if (!rootPlaceId) return null;

    try {
        const rootPlace = await getPlaceDetails(rootPlaceId);
        return normalizePlaceDetails(rootPlace, {
            ...presence,
            placeId: rootPlaceId,
            rootPlaceId,
        });
    } catch {
        return null;
    }
}

export function getSubplaceName(place, fallback = '') {
    return place?.name || place?.displayName || fallback || 'Subplace';
}

function getRootPlaceName(subplace, rootPlace, presence) {
    return (
        rootPlace?.name ||
        rootPlace?.displayName ||
        subplace?.sourceName ||
        presence?.lastLocation ||
        'Experience'
    );
}

function getCleanSubplaceName(subplace, rootPlaceName, fallback = '') {
    const originalName = normalizeText(getSubplaceName(subplace, fallback));
    const rootName = normalizeText(rootPlaceName);

    if (!originalName) return 'Subplace';
    if (!rootName) return originalName;

    const escapedRoot = escapeRegExp(rootName);
    const prefixPattern = new RegExp(
        `^${escapedRoot}\\s*(?:[-–—:|>]+|\\(|\\[)?\\s*`,
        'i',
    );
    const stripped = originalName
        .replace(prefixPattern, '')
        .replace(/^[-–—:|>]+\s*/u, '')
        .replace(/\s*[\])]+$/u, '')
        .trim();

    if (stripped && stripped.toLowerCase() !== rootName.toLowerCase()) {
        return stripped;
    }

    return originalName;
}

function appendCardLine(card, className, text, title = '') {
    const element = document.createElement('div');
    element.className = className;
    element.textContent = text;
    if (title) element.title = title;
    card.appendChild(element);
    return element;
}

function getJoinIds(place, presence) {
    return getPresenceIds({
        ...presence,
        placeId: place?.placeId || presence?.placeId,
        rootPlaceId: place?.rootPlaceId || presence?.rootPlaceId,
        universeId: place?.universeId || presence?.universeId,
    });
}

export async function joinRootPlaceClosestWithRovalraJoinApi(place, presence) {
    const ids = getJoinIds(place, presence);
    const rootPlaceId = normalizeId(
        place?.rootPlaceId || presence?.rootPlaceId || ids.placeId,
    );

    if (!rootPlaceId) return;

    await performJoinAction(rootPlaceId, ids.universeId || null, null);
}

export async function joinSubplacePersonInstance(place, presence) {
    const ids = getJoinIds(place, presence);
    if (!ids.placeId) return;

    const gameId = presence?.gameId || place?.gameId;
    if (gameId) {
        launchGame(ids.placeId, gameId);
        return;
    }

    if (presence?.userId) {
        followUser(presence.userId);
        return;
    }

    await performJoinAction(ids.placeId, ids.universeId || null, null);
}

export async function joinSubplaceWithRovalraJoinApi(place, presence) {
    return joinSubplacePersonInstance(place, presence);
}

function buildCard({ place, presence, loading = false, failed = false }) {
    const card = document.createElement('div');
    card.className = 'rovalra-subplace-hover-card';

    appendCardLine(card, 'rovalra-subplace-hover-kicker', 'Subplace');

    if (loading) {
        appendCardLine(card, 'rovalra-subplace-hover-title', 'Loading...');
        return card;
    }

    if (failed || !place || place.root) {
        appendCardLine(card, 'rovalra-subplace-hover-title', 'Unavailable');
        return card;
    }

    const subplaceName = getSubplaceName(place, presence?.lastLocation || '');

    appendCardLine(
        card,
        'rovalra-subplace-hover-title',
        subplaceName,
        subplaceName,
    );
    appendCardLine(
        card,
        'rovalra-subplace-hover-meta',
        `Subplace ID: ${place.placeId}`,
    );

    if (place.rootPlaceId) {
        appendCardLine(
            card,
            'rovalra-subplace-hover-meta',
            `Root place ID: ${place.rootPlaceId}`,
        );
    }

    return card;
}

async function buildDetailedHoverCard({ place, presence }) {
    if (!place || place.root) return null;

    const card = document.createElement('div');
    card.className =
        'rovalra-subplace-hover-card rovalra-subplace-hover-card-detailed';

    const list = await createProfileSubplaceListCard(presence);
    if (!list) return null;

    list.classList.add('rovalra-subplace-hover-list');
    card.appendChild(list);

    const meta = document.createElement('div');
    meta.className = 'rovalra-subplace-hover-details';

    appendCardLine(
        meta,
        'rovalra-subplace-hover-meta',
        `Subplace ID: ${place.placeId}`,
    );

    if (place.rootPlaceId) {
        appendCardLine(
            meta,
            'rovalra-subplace-hover-meta',
            `Root place ID: ${place.rootPlaceId}`,
        );
    }

    card.appendChild(meta);
    return card;
}

function positionCard(target, card) {
    const rect = target.getBoundingClientRect();
    const margin = 8;
    const cardRect = card.getBoundingClientRect();

    let top = rect.bottom + margin + window.scrollY;
    let left = rect.left + rect.width / 2 - cardRect.width / 2 + window.scrollX;

    left = Math.max(
        margin + window.scrollX,
        Math.min(
            left,
            window.scrollX + window.innerWidth - cardRect.width - margin,
        ),
    );

    if (top + cardRect.height > window.scrollY + window.innerHeight - margin) {
        top = rect.top - cardRect.height - margin + window.scrollY;
    }

    card.style.top = `${Math.max(margin + window.scrollY, top)}px`;
    card.style.left = `${left}px`;
}

export function attachSubplaceCardToPresenceTarget(
    target,
    presence,
    options = {},
) {
    if (!target || !presence || presence.userPresenceType !== 2) return;

    const ids = getPresenceIds(presence);
    if (!ids.placeId) return;
    if (ids.rootPlaceId && ids.placeId === ids.rootPlaceId) return;

    clearSubplaceCardFromPresenceTarget(target);

    target.classList.add('rovalra-subplace-hover-target');
    target.dataset.rovalraPresencePlaceId = ids.placeId;
    if (ids.rootPlaceId)
        target.dataset.rovalraPresenceRootPlaceId = ids.rootPlaceId;
    if (ids.universeId)
        target.dataset.rovalraPresenceUniverseId = ids.universeId;
    if (presence.userId)
        target.dataset.rovalraPresenceUserId = String(presence.userId);
    if (presence.gameId)
        target.dataset.rovalraPresenceGameId = String(presence.gameId);

    let card = null;
    let hideTimer = null;
    let removeTimer = null;
    let loadedPlace = null;
    let loadingPromise = null;
    let detailedCardPromise = null;
    let isPointerOnCard = false;
    let isPointerOnTarget = false;
    const boundHoverCards = new WeakSet();

    const clearRemoveTimer = () => {
        if (!removeTimer) return;
        clearTimeout(removeTimer);
        removeTimer = null;
    };

    const removeCard = ({ immediate = false } = {}) => {
        clearTimeout(hideTimer);
        hideTimer = null;
        clearRemoveTimer();
        if (!card) return;

        const cardToRemove = card;
        card = null;

        if (immediate) {
            cardToRemove.remove();
            cardToRemove.classList.remove(
                'rovalra-subplace-hover-card-leaving',
            );
            return;
        }

        cardToRemove.classList.add('rovalra-subplace-hover-card-leaving');
        removeTimer = setTimeout(() => {
            cardToRemove.remove();
            cardToRemove.classList.remove(
                'rovalra-subplace-hover-card-leaving',
            );
            if (!card) removeTimer = null;
        }, 140);
    };

    const scheduleHide = () => {
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => {
            if (!isPointerOnTarget && !isPointerOnCard) {
                removeCard();
            }
        }, 180);
    };

    const bindCardHover = () => {
        if (!card || boundHoverCards.has(card)) return;

        boundHoverCards.add(card);
        card.addEventListener('mouseenter', () => {
            isPointerOnCard = true;
            clearTimeout(hideTimer);
            clearRemoveTimer();
            card?.classList.remove('rovalra-subplace-hover-card-leaving');
        });
        card.addEventListener('mouseleave', () => {
            isPointerOnCard = false;
            scheduleHide();
        });
    };

    const mountCard = (nextCard) => {
        if (!nextCard) return;

        clearRemoveTimer();
        nextCard.classList.remove('rovalra-subplace-hover-card-leaving');

        if (card && card !== nextCard) {
            removeCard({ immediate: true });
        } else if (card === nextCard) {
            positionCard(target, card);
            return;
        }

        card = nextCard;
        if (options.className) card.classList.add(options.className);
        document.body.appendChild(card);
        positionCard(target, card);
        bindCardHover();
    };

    const render = (state = {}) => {
        mountCard(buildCard({ place: loadedPlace, presence, ...state }));
    };

    const renderDetailed = async () => {
        if (!detailedCardPromise) {
            detailedCardPromise = buildDetailedHoverCard({
                place: loadedPlace,
                presence,
            });
        }

        const detailedCard = await detailedCardPromise;
        if (!isPointerOnTarget && !isPointerOnCard) return;
        if (!detailedCard) {
            removeCard();
            return;
        }

        mountCard(detailedCard);
    };

    const show = async () => {
        isPointerOnTarget = true;
        clearTimeout(hideTimer);

        if (loadedPlace) {
            if (!loadedPlace.root) {
                if (options.detailedHover) await renderDetailed();
                else render();
            }
            return;
        }

        render({ loading: true });

        if (!loadingPromise) {
            loadingPromise = fetchPresencePlaceDetails(presence);
        }

        loadedPlace = await loadingPromise;
        if (!isPointerOnTarget && !isPointerOnCard) return;
        if (!loadedPlace || loadedPlace.root) {
            removeCard();
            return;
        }

        if (options.detailedHover) await renderDetailed();
        else render();
    };

    const onTargetEnter = () => {
        show().catch(() => {
            removeCard();
        });
    };
    const onTargetLeave = () => {
        isPointerOnTarget = false;
        scheduleHide();
    };
    const onWindowMove = () => {
        if (card) positionCard(target, card);
    };

    target.addEventListener('mouseenter', onTargetEnter);
    target.addEventListener('mouseleave', onTargetLeave);
    window.addEventListener('scroll', onWindowMove, true);
    window.addEventListener('resize', onWindowMove);

    activeCards.set(target, {
        cleanup() {
            removeCard({ immediate: true });
            target.removeEventListener('mouseenter', onTargetEnter);
            target.removeEventListener('mouseleave', onTargetLeave);
            window.removeEventListener('scroll', onWindowMove, true);
            window.removeEventListener('resize', onWindowMove);
            activeCards.delete(target);
        },
    });
}

function createPlaceImage(thumbnail, altText) {
    const img = document.createElement('img');
    img.className = 'rovalra-profile-subplace-row-icon';
    img.alt = altText;
    img.loading = 'lazy';

    if (thumbnail?.imageUrl) {
        img.src = thumbnail.imageUrl;
    }

    return img;
}

function createProfileRow({
    name,
    thumbnail,
    placeId,
    universeId = null,
    onClick = null,
}) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'rovalra-profile-subplace-row';
    row.title = name;

    row.append(
        createPlaceImage(thumbnail, name),
        Object.assign(document.createElement('span'), {
            className: 'rovalra-profile-subplace-row-name',
            textContent: name,
        }),
    );

    row.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();

        if (onClick) {
            await onClick();
            return;
        }

        await joinSubplaceWithRovalraJoinApi(
            { placeId, universeId },
            null,
        );
    });

    return row;
}

async function getPlaceIconMap(placeIds) {
    const ids = Array.from(new Set(placeIds.map(normalizeId).filter(Boolean)));
    if (!ids.length) return new Map();

    const thumbnails = await getBatchThumbnails(ids, 'PlaceIcon', '150x150');
    const map = new Map();

    ids.forEach((id, index) => {
        map.set(id, thumbnails[index]);
    });

    return map;
}

export async function createProfileSubplaceListCard(presence) {
    if (!presence || presence.userPresenceType !== 2) return null;

    const subplace = await fetchPresencePlaceDetails(presence);
    if (!subplace || subplace.root) return null;

    const rootPlaceId = normalizeId(
        subplace.rootPlaceId || presence.rootPlaceId,
    );
    if (!rootPlaceId || rootPlaceId === subplace.placeId) return null;

    const rootPlace = await fetchRootPlaceDetails(subplace, presence);
    const rootName = getRootPlaceName(subplace, rootPlace, presence);
    const subplaceName = getCleanSubplaceName(
        subplace,
        rootName,
        presence.lastLocation || '',
    );
    const icons = await getPlaceIconMap([rootPlaceId, subplace.placeId]);

    const card = document.createElement('div');
    card.className = 'rovalra-profile-subplace-list';

    const heading = document.createElement('div');
    heading.className = 'rovalra-profile-subplace-list-heading';
    heading.textContent = 'SUBPLACE';

    const rootRow = createProfileRow({
        name: rootName,
        thumbnail: icons.get(rootPlaceId),
        placeId: rootPlaceId,
        universeId: subplace.universeId || presence.universeId || null,
        onClick: () => joinSubplacePersonInstance(subplace, presence),
    });

    const subplaceRow = createProfileRow({
        name: subplaceName,
        thumbnail: icons.get(subplace.placeId),
        placeId: subplace.placeId,
        universeId: subplace.universeId || presence.universeId || null,
        onClick: () => joinSubplacePersonInstance(subplace, presence),
    });

    card.append(heading, rootRow, subplaceRow);
    return card;
}


export async function createSubplaceDetailsCard(presence, options = {}) {
    if (!presence || presence.userPresenceType !== 2) return null;

    const place = await fetchPresencePlaceDetails(presence);
    if (!place || place.root) return null;

    const list = await createProfileSubplaceListCard(presence);
    if (!list) return null;

    const card = document.createElement('div');
    card.className = 'rovalra-subplace-details-card';

    if (options.className) {
        card.classList.add(options.className);
    }

    card.appendChild(list);

    const details = document.createElement('div');
    details.className = 'rovalra-subplace-hover-details';

    appendCardLine(
        details,
        'rovalra-subplace-hover-meta',
        `Subplace ID: ${place.placeId}`,
    );

    if (place.rootPlaceId) {
        appendCardLine(
            details,
            'rovalra-subplace-hover-meta',
            `Root place ID: ${place.rootPlaceId}`,
        );
    }

    card.appendChild(details);
    return card;
}

export async function createPersistentSubplaceCard(presence, options = {}) {
    if (!presence || presence.userPresenceType !== 2) return null;

    const place = await fetchPresencePlaceDetails(presence);
    if (!place || place.root) return null;

    const rootPlace = await fetchRootPlaceDetails(place, presence);
    const rootName = getRootPlaceName(place, rootPlace, presence);
    const subplaceName = getCleanSubplaceName(
        place,
        rootName,
        presence.lastLocation || '',
    );
    const card = document.createElement(options.href ? 'a' : 'button');
    card.className = 'rovalra-current-subplace-card';

    if (card.tagName === 'BUTTON') {
        card.type = 'button';
    }

    if (options.href) {
        card.href = options.href;
    }

    if (options.launchOnClick !== false) {
        card.addEventListener('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            await joinSubplacePersonInstance(place, presence);
        });
    }

    const label = document.createElement('span');
    label.className = 'rovalra-current-subplace-label';
    label.textContent = 'Subplace';

    const name = document.createElement('span');
    name.className = 'rovalra-current-subplace-name';
    name.textContent = subplaceName;
    name.title = subplaceName;

    card.append(label, name);

    if (options.attachHover !== false) {
        attachSubplaceCardToPresenceTarget(card, presence, {
            className: 'rovalra-subplace-hover-card-profile',
            detailedHover: Boolean(options.detailedHover),
        });
    }

    return card;
}
