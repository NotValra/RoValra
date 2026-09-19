import { observeElement } from '../../core/observer.js';
import { getAuthenticatedUserId } from '../../core/user.js';
import { getUserOutfits } from '../../core/apis/avatar.js';
import { addTooltip } from '../../core/ui/tooltip.js';
import { ts } from '../../core/locale/i18n.js';
import { settings } from '../../core/settings/getSettings.js';
import { getAssets } from '../../core/assets.js';

const STORAGE_KEY = 'rovalra_favorite_outfits';

function loadFavorites(userId) {
    return new Promise((resolve) => {
        chrome.storage.local.get({ [STORAGE_KEY]: {} }, (data) => {
            const stored = data[STORAGE_KEY]?.[userId];
            resolve(new Set(Array.isArray(stored) ? stored : []));
        });
    });
}

function persistFavorites(userId, favorites) {
    return new Promise((resolve) => {
        chrome.storage.local.get({ [STORAGE_KEY]: {} }, (data) => {
            const all = data[STORAGE_KEY] || {};
            all[userId] = Array.from(favorites);
            chrome.storage.local.set({ [STORAGE_KEY]: all }, resolve);
        });
    });
}

function getCardOutfitId(card) {
    const thumb = card.querySelector('[data-thumbnail-target-id]');
    const rawId =
        thumb?.getAttribute('data-thumbnail-target-id') ||
        card.getAttribute('data-item-id') ||
        card.dataset?.itemId;
    const parsed = parseInt(rawId, 10);
    return Number.isNaN(parsed) ? null : parsed;
}

export async function init() {
    if (!window.location.pathname.includes('/my/avatar')) return;
    if (!(await settings.favoriteOutfitsEnabled)) return;

    const userId = await getAuthenticatedUserId();
    if (!userId) return;

    let outfitIds;
    try {
        outfitIds = new Set(
            (await getUserOutfits(userId)).map((outfit) => outfit.id),
        );
    } catch (error) {
        return;
    }
    if (outfitIds.size === 0) return;

    const favorites = await loadFavorites(userId);
    const cardOutfitIds = new WeakMap();
    const originalOrder = new Map();
    let orderCounter = 0;
    const pendingContainers = new Set();
    let resortScheduled = false;

    // `order` only reorders flex/grid children, and this grid is neither, so cards
    // are physically moved. Every resort fully recomputes the target order from a
    // fixed first-seen index plus the live favorite state, so unfavoriting always
    // lands a card back where it started instead of drifting from prior moves.
    function resortContainer(container) {
        const children = Array.from(container.children);
        const sortable = [];
        children.forEach((child, index) => {
            if (cardOutfitIds.has(child)) sortable.push({ child, index });
        });
        if (sortable.length < 2) return;

        const sorted = [...sortable].sort((a, b) => {
            const idA = cardOutfitIds.get(a.child);
            const idB = cardOutfitIds.get(b.child);
            const favA = favorites.has(idA) ? 0 : 1;
            const favB = favorites.has(idB) ? 0 : 1;
            return favA !== favB
                ? favA - favB
                : originalOrder.get(idA) - originalOrder.get(idB);
        });

        sortable.forEach((entry, i) => {
            children[entry.index] = sorted[i].child;
        });

        const fragment = document.createDocumentFragment();
        children.forEach((child) => fragment.appendChild(child));
        container.appendChild(fragment);
    }

    function scheduleResort(container) {
        if (!container) return;
        pendingContainers.add(container);
        if (resortScheduled) return;

        resortScheduled = true;
        requestAnimationFrame(() => {
            resortScheduled = false;
            pendingContainers.forEach(resortContainer);
            pendingContainers.clear();
        });
    }

    function updateStarState(star, outfitId) {
        const isFavorited = favorites.has(outfitId);
        star.classList.toggle('favorited', isFavorited);
        star.setAttribute('aria-pressed', String(isFavorited));
    }

    function toggleFavorite(outfitId, star, container) {
        if (favorites.has(outfitId)) favorites.delete(outfitId);
        else favorites.add(outfitId);

        updateStarState(star, outfitId);
        persistFavorites(userId, favorites);
        scheduleResort(container);
    }

    observeElement(
        'ul.item-cards-stackable li.list-item .outfit-card',
        (outfitCardEl) => {
            const card = outfitCardEl.closest('li.list-item');
            if (!card) return;

            const outfitId = getCardOutfitId(card);
            if (outfitId === null || !outfitIds.has(outfitId)) return;
            if (card.querySelector('.rovalra-outfit-favorite-star')) return;

            const thumbContainer =
                card.querySelector('.item-card-thumb-container') || card;
            if (window.getComputedStyle(thumbContainer).position === 'static') {
                thumbContainer.style.position = 'relative';
            }

            const star = document.createElement('div');
            star.className = 'rovalra-outfit-favorite-star';
            star.setAttribute('role', 'button');
            star.setAttribute('tabindex', '0');
            const starMask = `url("${getAssets().outfitFavoriteIcon}") center / contain no-repeat`;
            star.style.webkitMask = starMask;
            star.style.mask = starMask;
            updateStarState(star, outfitId);

            thumbContainer.appendChild(star);

            star.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                toggleFavorite(outfitId, star, card.parentElement);
            });
            star.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                event.stopPropagation();
                toggleFavorite(outfitId, star, card.parentElement);
            });

            addTooltip(star, () =>
                ts(
                    favorites.has(outfitId)
                        ? 'avatarFavoriteOutfits.remove'
                        : 'avatarFavoriteOutfits.add',
                ),
            );

            cardOutfitIds.set(card, outfitId);
            if (!originalOrder.has(outfitId)) {
                originalOrder.set(outfitId, orderCounter++);
            }
            scheduleResort(card.parentElement);
        },
        { multiple: true },
    );
}
