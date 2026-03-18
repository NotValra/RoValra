let observerInitialized = false;
let observationRequests = [];
let globalObserver = null;
let attributeListeners = new Map();
let childListListeners = new Map();

const viewportObservers = new Map();
const customRootObservers = new WeakMap();
const intersectionCallbacks = new WeakMap();
const resizeObservers = new Map();
const resizeCallbacks = new WeakMap();

export function initializeObserver() {
    if (observerInitialized) {
        return;
    }

    globalObserver = new MutationObserver((mutationsList) => {
        for (const req of observationRequests) {
            if (!req.active) continue;

            if (req.multiple && req.elements.size > 0) {
                for (const element of [...req.elements]) {
                    if (!document.body.contains(element)) {
                        req.elements.delete(element);
                        if (typeof req.onRemove === 'function')
                            req.onRemove(element);
                    }
                }
            } else if (
                !req.multiple &&
                req.element &&
                !document.body.contains(req.element)
            ) {
                if (typeof req.onRemove === 'function') req.onRemove();
                req.element = null;
            }
        }

        for (const mutation of mutationsList) {
            if (mutation.type === 'attributes') {
                const listener = attributeListeners.get(mutation.target);
                if (listener) listener(mutation);
                continue;
            }

            if (mutation.type === 'childList') {
                const listener = childListListeners.get(mutation.target);
                if (listener) listener(mutation);
            }

            if (mutation.addedNodes.length === 0) continue;

            for (const addedNode of mutation.addedNodes) {
                if (addedNode.nodeType !== Node.ELEMENT_NODE) continue;

                for (const req of observationRequests) {
                    if (!req.active) continue;

                    if (!req.multiple && !req.element) {
                        if (addedNode.matches(req.selector)) {
                            req.element = addedNode;
                            req.callback(addedNode);
                        } else {
                            const foundElement = addedNode.querySelector(
                                req.selector,
                            );
                            if (foundElement) {
                                req.element = foundElement;
                                req.callback(foundElement);
                            }
                        }
                    }

                    if (req.multiple) {
                        if (
                            addedNode.matches(req.selector) &&
                            !req.elements.has(addedNode)
                        ) {
                            req.elements.add(addedNode);
                            req.callback(addedNode);
                        }
                        addedNode
                            .querySelectorAll(req.selector)
                            .forEach((child) => {
                                if (!req.elements.has(child)) {
                                    req.elements.add(child);
                                    req.callback(child);
                                }
                            });
                    }
                }
            }
        }
    }); //Verified

    observerInitialized = true;
}

export const observeElement = (selector, callback, options = {}) => {
    const isMultiple = options.multiple || false;

    const request = {
        selector,
        callback,
        onRemove: options.onRemove,
        multiple: isMultiple,
        active: true,
        ...(isMultiple ? { elements: new Set() } : { element: null }),
    };
    observationRequests.push(request);

    if (isMultiple) {
        document.querySelectorAll(selector).forEach((element) => {
            if (!request.elements.has(element)) {
                request.elements.add(element);
                callback(element);
            }
        });
    } else {
        const existingElement = document.querySelector(selector);
        if (existingElement && !request.element) {
            request.element = existingElement;
            callback(existingElement);
        }
    }

    return request;
};

export const observeAttributes = (element, callback, attributeFilter = []) => {
    if (!observerInitialized) initializeObserver();

    attributeListeners.set(element, callback);
    globalObserver.observe(element, { attributes: true, attributeFilter });

    return {
        disconnect: () => {
            attributeListeners.delete(element);
        },
    };
};

export function observeChildren(element, callback) {
    if (!observerInitialized) initializeObserver();

    childListListeners.set(element, callback);

    return {
        disconnect: () => {
            childListListeners.delete(element);
        },
    };
}

export function observeIntersection(element, callback, options = {}) {
    const root = options.root || null;
    const rootMargin = options.rootMargin || '0px';
    const threshold = options.threshold || 0;
    const optionsKey = `${rootMargin}|${threshold}`;

    let observer;

    if (root) {
        let rootMap = customRootObservers.get(root);
        if (!rootMap) {
            rootMap = new Map();
            customRootObservers.set(root, rootMap);
        }
        observer = rootMap.get(optionsKey);
        if (!observer) {
            observer = new IntersectionObserver(
                (entries) => {
                    entries.forEach((entry) => {
                        const callbacks = intersectionCallbacks.get(
                            entry.target,
                        );
                        if (callbacks) callbacks.forEach((cb) => cb(entry));
                    });
                },
                { root, rootMargin, threshold },
            );
            rootMap.set(optionsKey, observer);
        }
    } else {
        observer = viewportObservers.get(optionsKey);
        if (!observer) {
            observer = new IntersectionObserver(
                (entries) => {
                    entries.forEach((entry) => {
                        const callbacks = intersectionCallbacks.get(
                            entry.target,
                        );
                        if (callbacks) callbacks.forEach((cb) => cb(entry));
                    });
                },
                { root: null, rootMargin, threshold },
            );
            viewportObservers.set(optionsKey, observer);
        }
    }

    let callbacks = intersectionCallbacks.get(element);
    if (!callbacks) {
        callbacks = new Set();
        intersectionCallbacks.set(element, callbacks);
    }
    callbacks.add(callback);
    observer.observe(element);

    return {
        unobserve: () => {
            const cbs = intersectionCallbacks.get(element);
            if (cbs) {
                cbs.delete(callback);
                if (cbs.size === 0) {
                    intersectionCallbacks.delete(element);
                    observer.unobserve(element);
                }
            }
        },
    };
}

export function observeResize(element, callback, options = {}) {
    const box = options.box || 'content-box';

    let observer = resizeObservers.get(box);
    if (!observer) {
        observer = new ResizeObserver((entries) => {
            entries.forEach((entry) => {
                const callbacks = resizeCallbacks.get(entry.target);
                if (callbacks) callbacks.forEach((cb) => cb(entry));
            });
        });
        resizeObservers.set(box, observer);
    }

    let callbacks = resizeCallbacks.get(element);
    if (!callbacks) {
        callbacks = new Set();
        resizeCallbacks.set(element, callbacks);
    }
    callbacks.add(callback);
    observer.observe(element, options);

    return {
        unobserve: () => {
            const cbs = resizeCallbacks.get(element);
            if (cbs) {
                cbs.delete(callback);
                if (cbs.size === 0) {
                    resizeCallbacks.delete(element);
                    observer.unobserve(element);
                }
            }
        },
    };
}

export function startObserving() {
    if (!observerInitialized) {
        initializeObserver();
    }

    if (!globalObserver) {
        console.error('RoValra: Observer initialization failed.');
        return 'failed';
    }

    if (document.body) {
        globalObserver.observe(document.body, {
            childList: true,
            subtree: true,
        });
        return 'active';
    } else {
        window.addEventListener(
            'DOMContentLoaded',
            () => {
                globalObserver.observe(document.body, {
                    childList: true,
                    subtree: true,
                });
            },
            { once: true },
        );
        return 'deferred';
    }
}
