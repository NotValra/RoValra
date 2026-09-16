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
    const originalOrder = new Map();
    let orderCounter = 0;
    // Roblox renders this list through React, so cards get re-diffed/replaced on
    // its own re-renders. Reordering the DOM directly gets fought/undone by React,
    // so favorited cards are floated to the front with a flex `order` style instead,
    // which React leaves alone and which we can reapply idempotently per card.
    const FAVORITED_ORDER_OFFSET = 100000;

    function computeOrder(outfitId) {
        const base = originalOrder.get(outfitId) ?? 0;
        return favorites.has(outfitId) ? base : base + FAVORITED_ORDER_OFFSET;
    }

    function applyCardOrder(card, outfitId) {
        card.style.order = String(computeOrder(outfitId));
    }

    function updateStarState(star, outfitId) {
        const isFavorited = favorites.has(outfitId);
        star.classList.toggle('favorited', isFavorited);
        star.setAttribute('aria-pressed', String(isFavorited));
    }

    function toggleFavorite(outfitId, star, card) {
        if (favorites.has(outfitId)) favorites.delete(outfitId);
        else favorites.add(outfitId);

        updateStarState(star, outfitId);
        persistFavorites(userId, favorites);
        applyCardOrder(card, outfitId);
    }

    observeElement(
        'ul.item-cards-stackable li.list-item',
        (card) => {
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

            star.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                toggleFavorite(outfitId, star, card);
            });
            star.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                event.stopPropagation();
                toggleFavorite(outfitId, star, card);
            });

            addTooltip(star, () =>
                ts(
                    favorites.has(outfitId)
                        ? 'avatarFavoriteOutfits.remove'
                        : 'avatarFavoriteOutfits.add',
                ),
            );

            thumbContainer.appendChild(star);
            if (!originalOrder.has(outfitId)) {
                originalOrder.set(outfitId, orderCounter++);
            }
            applyCardOrder(card, outfitId);
        },
        { multiple: true },
    );
}
