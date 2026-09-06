import {
    BOOKMARKS_KEY,
    DEFAULT_CATEGORY_ID,
    normalizeBookmarks,
    positiveId,
} from '../../../shared/gameBookmarks.js';
import { getPlaceDetails, getUniversesDetails } from '../../core/apis/games.js';
import {
    getPlaceIdFromUrl,
    getUniverseIdFromUrl,
} from '../../core/idExtractor.js';
import {
    observeElement,
    observeAttributes,
    observeResize,
} from '../../core/observer.js';
import { settings } from '../../core/settings/getSettings.js';
import { createOverlay } from '../../core/ui/overlay.js';
import { createButton } from '../../core/ui/buttons.js';
import { Icon } from '../../core/ui/buildericon.js';
import { showConfirmationPrompt } from '../../core/ui/confirmationPrompt.js';
import { t } from '../../core/locale/i18n.js';

let initialization;
let state = normalizeBookmarks();
let picker = null;
const listeners = new Set();
const controls = new Map();
const labels = {
    bookmark: 'Bookmark',
    saved: 'Bookmarked',
    title: 'Bookmarks',
    uncategorized: 'Uncategorized',
    create: '+ Create New Category',
    categoryName: 'Category name',
    createSave: 'Create and Save',
    save: 'Save Changes',
    deleteCategory: 'Delete category',
    deleteCategoryConfirm:
        'Are you sure? This will delete the category and remove it from every bookmarked game.',
    confirm: 'Delete',
    cancel: 'Cancel',
    remove: 'Remove Bookmark',
    error: 'Could not save bookmark. Please try again.',
    loading: 'Loading game…',
    all: 'All',
    topic: 'Bookmarked Games',
    empty: 'No bookmarked games in this category.',
};

export function getBookmarkState() {
    return state;
}
export function bookmarkLabel(key) {
    return labels[key];
}
export function subscribeBookmarks(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function acceptState(value) {
    state = normalizeBookmarks(value);
    for (const [button, getGame] of controls) {
        if (!button.isConnected) {
            controls.delete(button);
            continue;
        }
        const saved = Boolean(state.bookmarks[getGame()?.universeId]);
        button.setAttribute('aria-pressed', String(saved));
        button.title = saved ? labels.saved : labels.bookmark;
        button.setAttribute('aria-label', button.title);
        button.querySelector('icon')?.toggleAttribute('filled', saved);
        const label = button.querySelector('.icon-label');
        if (label) label.textContent = button.title;
    }
    for (const listener of listeners) listener(state);
}

export function createBookmarkButton(getGame, compact = true) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'rovalra-bookmark-control';
    const icon = Icon({ icon: 'bookmark', material: true, size: 'large' });
    icon.setAttribute('aria-hidden', 'true');
    button.append(icon);
    if (!compact) {
        const label = document.createElement('span');
        label.textContent = labels.bookmark;
        label.className = 'icon-label';
        button.append(label);
    }
    controls.set(button, getGame);
    const saved = Boolean(state.bookmarks[getGame()?.universeId]);
    icon.toggleAttribute('filled', saved);
    button.setAttribute('aria-pressed', String(saved));
    button.setAttribute('aria-label', saved ? labels.saved : labels.bookmark);
    button.title = saved ? labels.saved : labels.bookmark;
    const blockCardNavigation = (event) => {
        event.preventDefault();
        event.stopPropagation();
    };
    button.addEventListener('pointerdown', blockCardNavigation);
    button.addEventListener('mousedown', blockCardNavigation);
    button.addEventListener('mouseup', blockCardNavigation);
    button.addEventListener('click', (event) => {
        blockCardNavigation(event);
        openPicker(getGame, button);
    });
    button.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.stopPropagation();
        }
    });
    return button;
}

function createDeleteCategoryButton() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className =
        'btn-control-sm rovalra-ui-btn rovalra-bookmark-delete-category';
    button.setAttribute('aria-label', labels.deleteCategory);
    button.title = labels.deleteCategory;
    const icon = Icon({
        icon: 'delete',
        filled: true,
        material: true,
        size: 'medium',
    });
    icon.setAttribute('aria-hidden', 'true');
    button.append(icon);
    return button;
}

async function resolveGame(input) {
    let universeId = positiveId(input?.universeId);
    let rootPlaceId = positiveId(input?.rootPlaceId);
    if (!universeId && input?.placeId) {
        const detail = await getPlaceDetails(input.placeId);
        universeId = positiveId(detail?.universeId);
        rootPlaceId = positiveId(detail?.universeRootPlaceId);
    }
    if (universeId && !rootPlaceId) {
        const [detail] = await getUniversesDetails([universeId]);
        rootPlaceId = positiveId(detail?.rootPlaceId);
    }
    if (!universeId || !rootPlaceId) throw new Error('Game unavailable');
    return { universeId, rootPlaceId };
}

async function openPicker(getGame, opener) {
    picker?.close();
    const body = document.createElement('div');
    body.className = 'rovalra-bookmark-picker';
    body.textContent = labels.loading;
    const dialog = createOverlay({
        title: labels.title,
        bodyContent: body,
        maxWidth: '440px',
        showLogo: true,
        onClose: () => {
            document.removeEventListener('keydown', keydown);
            if (picker === dialog) picker = null;
            if (opener.isConnected) opener.focus();
        },
    });
    const keydown = (event) => {
        if (event.key === 'Escape') dialog.close();
        if (event.key !== 'Tab') return;
        const focusable = [
            ...dialog.overlay.querySelectorAll(
                'button:not(:disabled), input:not(:disabled)',
            ),
        ];
        const first = focusable[0],
            last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
        }
    };
    document.addEventListener('keydown', keydown);
    picker = dialog;
    try {
        const game = await resolveGame(getGame());
        if (picker !== dialog) return;
        body.replaceChildren();
        const error = document.createElement('div');
        error.setAttribute('role', 'alert');
        async function save(operation) {
            const inputs = [...body.querySelectorAll('button, input')];
            inputs.forEach((input) => {
                input.disabled = true;
            });
            error.textContent = '';
            try {
                const result = await chrome.runtime.sendMessage({
                    action: 'updateGameBookmarks',
                    operation: { ...game, ...operation },
                });
                if (!result?.state)
                    throw new Error(result?.error || labels.error);
                acceptState(result.state);
                dialog.close();
            } catch {
                error.textContent = labels.error;
                inputs.forEach((input) => {
                    input.disabled = false;
                });
            }
        }
        const selected = new Set(
            state.bookmarks[game.universeId]?.categoryIds || [
                DEFAULT_CATEGORY_ID,
            ],
        );
        const categoryList = document.createElement('div');
        categoryList.className = 'rovalra-bookmark-category-list';
        categoryList.setAttribute('aria-label', labels.title);
        const renderCategories = () => {
            categoryList.replaceChildren();
            for (const category of state.categories) {
                const row = document.createElement('label');
                row.className = 'rovalra-bookmark-category-row';
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.checked = selected.has(category.id);
                checkbox.addEventListener('change', () => {
                    if (checkbox.checked) selected.add(category.id);
                    else selected.delete(category.id);
                });
                const name = document.createElement('span');
                name.textContent =
                    category.id === DEFAULT_CATEGORY_ID
                        ? labels.uncategorized
                        : category.name;
                row.append(checkbox, name);
                if (category.id !== DEFAULT_CATEGORY_ID) {
                    const removeCategory = createDeleteCategoryButton();
                    const deleteCategory = async () => {
                        removeCategory.disabled = true;
                        try {
                            const result = await chrome.runtime.sendMessage({
                                action: 'updateGameBookmarks',
                                operation: {
                                    type: 'deleteCategory',
                                    categoryId: category.id,
                                },
                            });
                            if (!result?.state)
                                throw new Error(result?.error || labels.error);
                            acceptState(result.state);
                            selected.delete(category.id);
                            renderCategories();
                        } catch {
                            error.textContent = labels.error;
                            removeCategory.disabled = false;
                        }
                    };
                    removeCategory.addEventListener('click', (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        showConfirmationPrompt({
                            title: labels.deleteCategory,
                            message: labels.deleteCategoryConfirm,
                            confirmText: labels.confirm,
                            cancelText: labels.cancel,
                            confirmType: 'alert',
                            onConfirm: () => {
                                document.body.style.overflow = 'hidden';
                                deleteCategory();
                            },
                            onCancel: () => {
                                document.body.style.overflow = 'hidden';
                            },
                        });
                    });
                    row.append(removeCategory);
                }
                categoryList.append(row);
            }
        };
        renderCategories();
        const form = document.createElement('form');
        form.hidden = true;
        const input = document.createElement('input');
        input.className = 'form-control input-field';
        input.placeholder = labels.categoryName;
        input.setAttribute('aria-label', labels.categoryName);
        input.maxLength = 60;
        input.required = true;
        const submit = createButton(labels.createSave, 'primary');
        submit.type = 'submit';
        form.append(input, submit);
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (!input.value.trim()) return;
            submit.disabled = true;
            try {
                const result = await chrome.runtime.sendMessage({
                    action: 'updateGameBookmarks',
                    operation: {
                        type: 'save',
                        ...game,
                        categoryIds: [...selected],
                        newCategory: input.value,
                    },
                });
                if (!result?.state)
                    throw new Error(result?.error || labels.error);
                acceptState(result.state);
                const added = getBookmarkState().categories.find(
                    (category) =>
                        category.name.toLowerCase() ===
                        input.value.trim().toLowerCase(),
                );
                if (added) selected.add(added.id);
                input.value = '';
                form.hidden = true;
                create.hidden = false;
                renderCategories();
            } catch {
                error.textContent = labels.error;
            } finally {
                submit.disabled = false;
            }
        });
        const create = createButton(labels.create);
        create.type = 'button';
        create.addEventListener('click', () => {
            form.hidden = false;
            create.hidden = true;
            input.focus();
        });
        const saveChanges = createButton(labels.save, 'primary');
        saveChanges.type = 'button';
        saveChanges.addEventListener('click', () =>
            save({ type: 'save', categoryIds: [...selected] }),
        );
        body.append(categoryList, create, form, saveChanges);
        if (state.bookmarks[game.universeId]) {
            body.append(
                createButton(labels.remove, 'alert', {
                    onClick: () => save({ type: 'remove' }),
                }),
            );
        }
        body.append(error);
        body.querySelector('button')?.focus();
    } catch {
        body.textContent = labels.error;
    }
}

function cardGame(link) {
    return {
        universeId:
            positiveId(getUniverseIdFromUrl(link.href)) || positiveId(link.id),
        placeId: positiveId(getPlaceIdFromUrl(link.href)),
    };
}

function attachCard(link) {
    if (!getPlaceIdFromUrl(link.href)) return;
    const thumbnail = link.querySelector(
        '.game-card-thumb-container, .featured-game-icon-container',
    );
    const host =
        link.closest('[data-testid="game-tile"], .game-card-container') ||
        link.parentElement;
    if (!thumbnail || !host || host.querySelector('.rovalra-bookmark-control'))
        return;
    host.classList.add('rovalra-bookmark-card-host');
    const button = createBookmarkButton(() => cardGame(link));
    button.classList.add('rovalra-bookmark-card');
    host.append(button);
}

let detailCleanup = null;
function attachDetail() {
    detailCleanup?.();
    detailCleanup = null;
    const meta = document.querySelector('#game-detail-meta-data');
    const title = document.querySelector(
        '#game-detail-page .game-title-container',
    );
    const row = document.querySelector(
        '#game-detail-page .favorite-follow-vote-share',
    );
    const contextMenu = document.querySelector('#game-context-menu');
    if (!meta || !title || (!row && !contextMenu)) return;
    const getGame = () => ({
        universeId: positiveId(meta.dataset.universeId),
        rootPlaceId: positiveId(meta.dataset.rootPlaceId),
    });
    const button = createBookmarkButton(getGame, false);
    button.id = 'rovalra-game-bookmark';
    const item = document.createElement('li');
    item.className = 'rovalra-bookmark-action';
    const attributes = observeAttributes(meta, () => acceptState(state), [
        'data-universe-id',
        'data-root-place-id',
    ]);
    if (contextMenu) {
        button.classList.add('rovalra-bookmark-context-menu-button');
        contextMenu.append(button);
        detailCleanup = () => {
            attributes.disconnect();
            controls.delete(button);
            button.remove();
        };
        return;
    }
    function place() {
        if (!title.isConnected || !row.isConnected) return;
        title.classList.remove('rovalra-bookmark-header');
        button.classList.remove('rovalra-bookmark-fallback');
        item.remove();
        const favorite = row.querySelector('.game-favorite-button-container');
        const follow = row.querySelector('.game-follow-button-container');
        const votes = row.querySelector('.voting-panel');
        const width = row.getBoundingClientRect().width;
        const needed = [favorite, follow, votes].reduce(
            (sum, element) =>
                sum + (element?.getBoundingClientRect().width || 0),
            0,
        );
        if (favorite && follow && votes && width >= needed + 80) {
            item.append(button);
            favorite.after(item);
            const a = favorite.getBoundingClientRect(),
                b = votes.getBoundingClientRect();
            if (
                Math.abs(a.top - b.top) < 16 &&
                b.right <= row.getBoundingClientRect().right + 1
            )
                return;
            item.remove();
        }
        title.classList.add('rovalra-bookmark-header');
        button.classList.add('rovalra-bookmark-fallback');
        title.append(button);
    }
    place();
    const resize = observeResize(row, place);
    detailCleanup = () => {
        resize.unobserve();
        attributes.disconnect();
        controls.delete(button);
        button.remove();
        item.remove();
        title.classList.remove('rovalra-bookmark-header');
    };
}

export function init() {
    initialization ||= initialize();
    return initialization;
}

async function initialize() {
    await Promise.all(
        Object.keys(labels).map(async (key) => {
            labels[key] = await t(`gameBookmarks.${key}`, {
                defaultValue: labels[key],
            });
        }),
    );
    if ((await settings.gameBookmarksEnabled) === false) return;
    acceptState((await chrome.storage.local.get(BOOKMARKS_KEY))[BOOKMARKS_KEY]);
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes[BOOKMARKS_KEY])
            acceptState(changes[BOOKMARKS_KEY].newValue);
    });
    observeElement('a.game-card-link[href*="/games/"]', attachCard, {
        multiple: true,
        onRemove: (link) => {
            const host = link.closest(
                '[data-testid="game-tile"], .game-card-container',
            );
            for (const button of host?.querySelectorAll(
                '.rovalra-bookmark-control',
            ) || []) {
                controls.delete(button);
                button.remove();
            }
            if (!host?.querySelector('.rovalra-bookmark-card'))
                host?.classList.remove('rovalra-bookmark-card-host');
        },
    });
    observeElement(
        'a.game-card-link .game-card-thumb-container, a.game-card-link .featured-game-icon-container',
        (thumbnail) => attachCard(thumbnail.closest('a.game-card-link')),
        { multiple: true },
    );
    observeElement(
        '#game-detail-meta-data, #game-detail-page .game-title-container, #game-detail-page .favorite-follow-vote-share',
        attachDetail,
        {
            multiple: true,
            onRemove: () => {
                detailCleanup?.();
                detailCleanup = null;
                picker?.close();
            },
        },
    );
}
