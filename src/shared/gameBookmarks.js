export const BOOKMARKS_KEY = 'rovalra_game_bookmarks';
export const DEFAULT_CATEGORY_ID = 'uncategorized';

export function positiveId(value) {
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function normalizeBookmarks(value) {
    const categories = [{ id: DEFAULT_CATEGORY_ID, name: 'Uncategorized' }];
    const ids = new Set([DEFAULT_CATEGORY_ID]);
    for (const category of Array.isArray(value?.categories)
        ? value.categories
        : []) {
        if (typeof category?.id !== 'string' || ids.has(category.id)) continue;
        if (typeof category.name !== 'string' || !category.name.trim())
            continue;
        categories.push({
            id: category.id,
            name: category.name.trim().slice(0, 60),
        });
        ids.add(category.id);
    }
    const bookmarks = {};
    for (const entry of Object.values(value?.bookmarks || {})) {
        const universeId = positiveId(entry?.universeId);
        const rootPlaceId = positiveId(entry?.rootPlaceId);
        if (!universeId || !rootPlaceId) continue;
        const categoryIds = Array.isArray(entry.categoryIds)
            ? entry.categoryIds
            : [entry.categoryId];
        const validCategoryIds = [
            ...new Set(categoryIds.filter((categoryId) => ids.has(categoryId))),
        ];
        bookmarks[universeId] = {
            universeId,
            rootPlaceId,
            categoryIds: validCategoryIds.length
                ? validCategoryIds
                : [DEFAULT_CATEGORY_ID],
        };
    }
    return { version: 1, categories, bookmarks };
}

export function applyBookmarkOperation(value, operation) {
    const state = normalizeBookmarks(value);
    if (!['save', 'remove', 'deleteCategory'].includes(operation?.type))
        throw new Error('Invalid bookmark operation');
    if (operation.type === 'deleteCategory') {
        if (
            typeof operation.categoryId !== 'string' ||
            operation.categoryId === DEFAULT_CATEGORY_ID
        )
            throw new Error('Invalid category');
        if (!state.categories.some((item) => item.id === operation.categoryId))
            throw new Error('Category no longer exists');
        state.categories = state.categories.filter(
            (item) => item.id !== operation.categoryId,
        );
        for (const bookmark of Object.values(state.bookmarks)) {
            bookmark.categoryIds = bookmark.categoryIds.filter(
                (categoryId) => categoryId !== operation.categoryId,
            );
            if (!bookmark.categoryIds.length)
                bookmark.categoryIds = [DEFAULT_CATEGORY_ID];
        }
        return state;
    }
    const universeId = positiveId(operation.universeId);
    if (!universeId) throw new Error('Invalid universe');
    if (operation.type === 'remove') {
        delete state.bookmarks[universeId];
        return state;
    }
    const rootPlaceId = positiveId(operation.rootPlaceId);
    if (!rootPlaceId) throw new Error('Invalid root place');
    let categoryIds = Array.isArray(operation.categoryIds)
        ? operation.categoryIds
        : [operation.categoryId || DEFAULT_CATEGORY_ID];
    if (typeof operation.newCategory === 'string') {
        const name = operation.newCategory.trim();
        if (!name || name.length > 60)
            throw new Error('Category must contain 1–60 characters');
        let category = state.categories.find(
            (item) => item.name.toLowerCase() === name.toLowerCase(),
        );
        if (!category) {
            category = { id: crypto.randomUUID(), name };
            state.categories.push(category);
        }
        categoryIds = [...new Set([...categoryIds, category.id])];
    }
    categoryIds = [...new Set(categoryIds)].filter((categoryId) =>
        state.categories.some((item) => item.id === categoryId),
    );
    if (!categoryIds.length) categoryIds = [DEFAULT_CATEGORY_ID];
    state.bookmarks[universeId] = { universeId, rootPlaceId, categoryIds };
    return state;
}
