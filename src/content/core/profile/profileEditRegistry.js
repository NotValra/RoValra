const categories = new Map();
const listeners = new Set();

export function registerProfileEditCategory({ id, label }) {
    if (!id || !label)
        throw new Error('A profile edit category needs an id and label.');
    const category = categories.get(id) || { id, label, features: [] };
    category.label = label;
    categories.set(id, category);
    listeners.forEach((listener) => listener());
    return category;
}

export function registerProfileEditFeature(categoryId, feature) {
    if (!categoryId || !feature?.id || !feature.label) {
        throw new Error(
            'A profile edit feature needs a category, id, and label.',
        );
    }
    const category = categories.get(categoryId) || {
        id: categoryId,
        label: categoryId,
        features: [],
    };
    const existingIndex = category.features.findIndex(
        ({ id }) => id === feature.id,
    );
    if (existingIndex === -1) category.features.push(feature);
    else category.features[existingIndex] = feature;
    categories.set(categoryId, category);
    listeners.forEach((listener) => listener());
    return feature;
}

export function getProfileEditCategories() {
    return [...categories.values()].filter(
        (category) => category.features.length,
    );
}

export function subscribeToProfileEditRegistry(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
