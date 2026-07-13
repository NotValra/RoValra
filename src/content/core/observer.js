let observerInitialized = false;
const observationRequests = new Set();
let globalObserver = null;
let attributeListeners = new Map();
let childListListeners = new Map();
const trackedRequestsByElement = new WeakMap();

const OBSERVER_IGNORE_ATTRIBUTE = 'data-rovalra-observer-ignore';

const viewportObservers = new Map();
const customRootObservers = new WeakMap();
const intersectionCallbacks = new WeakMap();
const resizeObservers = new Map();
const resizeCallbacks = new WeakMap();

function isIgnoredElement(element) {
    return Boolean(element?.closest?.(`[${OBSERVER_IGNORE_ATTRIBUTE}="true"]`));
}

function trackRequestElement(request, element) {
    if (request.multiple) {
        request.elements.add(element);
    } else {
        request.element = element;
    }

    let requests = trackedRequestsByElement.get(element);
    if (!requests) {
        requests = new Set();
        trackedRequestsByElement.set(element, requests);
    }
    requests.add(request);
}

function untrackRequestElement(request, element, notify = false) {
    const requests = trackedRequestsByElement.get(element);
    if (requests) {
        requests.delete(request);
        if (requests.size === 0) trackedRequestsByElement.delete(element);
    }

    if (request.multiple) {
        request.elements.delete(element);
        if (notify && typeof request.onRemove === 'function') {
            request.onRemove(element);
        }
        return;
    }

    if (request.element === element) {
        request.element = null;
        if (notify && typeof request.onRemove === 'function') {
            request.onRemove();
        }
    }
}

function processRemovedTree(removedNode) {
    if (removedNode.nodeType !== Node.ELEMENT_NODE) return;

    const removedElements = [removedNode, ...removedNode.querySelectorAll('*')];
    for (const element of removedElements) {
        if (element.isConnected) continue;

        const requests = trackedRequestsByElement.get(element);
        if (!requests) continue;

        for (const request of [...requests]) {
            untrackRequestElement(request, element, request.active);
        }
    }
}

function isWithinRequestRoot(request, element) {
    return request.root === document || request.root.contains(element);
}

function requestNeedsMatches(request) {
    return request.active && (request.multiple || !request.element);
}

function processRequestMatch(request, element) {
    if (!requestNeedsMatches(request)) return;
    if (!isWithinRequestRoot(request, element)) return;
    if (!element.matches(request.selector)) return;
    if (request.multiple && request.elements.has(element)) return;

    trackRequestElement(request, element);
    request.callback(element);
}

function processAddedTree(addedNode) {
    if (
        addedNode.nodeType !== Node.ELEMENT_NODE ||
        isIgnoredElement(addedNode)
    ) {
        return;
    }

    const requests = [...observationRequests].filter((request) => {
        if (!requestNeedsMatches(request)) return false;
        return (
            request.root === document ||
            request.root === addedNode ||
            request.root.contains(addedNode) ||
            addedNode.contains(request.root)
        );
    });
    if (requests.length === 0) return;

    for (const request of requests) {
        processRequestMatch(request, addedNode);
    }

    const selectors = [
        ...new Set(
            requests
                .filter(requestNeedsMatches)
                .map((request) => request.selector),
        ),
    ];
    if (selectors.length === 0) return;

    for (const element of addedNode.querySelectorAll(selectors.join(','))) {
        if (isIgnoredElement(element)) continue;
        for (const request of requests) {
            processRequestMatch(request, element);
        }
    }
}

export function initializeObserver() {
    if (observerInitialized) {
        return;
    }

    globalObserver = new MutationObserver((mutationsList) => {
        for (const mutation of mutationsList) {
            if (mutation.type === 'attributes') {
                let listener = attributeListeners.get(mutation.target);

                if (!listener) {
                    for (const [
                        observedElement,
                        callback,
                    ] of attributeListeners) {
                        if (
                            observedElement !== mutation.target &&
                            observedElement.contains(mutation.target)
                        ) {
                            listener = callback;
                            break;
                        }
                    }
                }

                if (listener) listener(mutation);
                continue;
            }

            if (mutation.type === 'childList') {
                const listeners = childListListeners.get(mutation.target);
                if (listeners) {
                    for (const listener of listeners) listener(mutation);
                }
            }

            for (const removedNode of mutation.removedNodes) {
                processRemovedTree(removedNode);
            }
            for (const addedNode of mutation.addedNodes) {
                processAddedTree(addedNode);
            }
        }
    }); //Verified

    observerInitialized = true;
}

export const observeElement = (selector, callback, options = {}) => {
    if (!observerInitialized) startObserving();

    const isMultiple = options.multiple || false;
    const root = options.root || options.scope || document;

    const request = {
        selector,
        callback,
        onRemove: options.onRemove,
        multiple: isMultiple,
        root,
        active: true,
        disconnect() {
            if (!this.active) return;
            this.active = false;
            observationRequests.delete(this);

            if (this.multiple) {
                for (const element of [...this.elements]) {
                    untrackRequestElement(this, element);
                }
            } else if (this.element) {
                untrackRequestElement(this, this.element);
            }
        },
        ...(isMultiple ? { elements: new Set() } : { element: null }),
    };
    observationRequests.add(request);

    if (isMultiple) {
        root.querySelectorAll(selector).forEach((element) => {
            if (!isIgnoredElement(element) && !request.elements.has(element)) {
                trackRequestElement(request, element);
                callback(element);
            }
        });
    } else {
        const existingElement = [...root.querySelectorAll(selector)].find(
            (element) => !isIgnoredElement(element),
        );
        if (existingElement && !request.element) {
            trackRequestElement(request, existingElement);
            callback(existingElement);
        }
    }

    return request;
};

export const observeAttributes = (
    element,
    callback,
    attributeFilter = [],
    options = {},
) => {
    if (!observerInitialized) initializeObserver();

    attributeListeners.set(element, callback);
    globalObserver.observe(element, {
        attributes: true,
        attributeFilter,
        subtree: options.subtree || false,
    });

    return {
        disconnect: () => {
            attributeListeners.delete(element);
        },
    };
};

export function observeChildren(element, callback) {
    if (!observerInitialized) initializeObserver();

    let listeners = childListListeners.get(element);
    if (!listeners) {
        listeners = new Set();
        childListListeners.set(element, listeners);
    }
    listeners.add(callback);

    return {
        disconnect: () => {
            const activeListeners = childListListeners.get(element);
            if (!activeListeners) return;

            activeListeners.delete(callback);
            if (activeListeners.size === 0) {
                childListListeners.delete(element);
            }
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

    const observeBody = () => {
        if (document.body) {
            globalObserver.observe(document.body, {
                childList: true,
                subtree: true,
            });
            return true;
        }
        return false;
    };

    if (observeBody()) return 'active';

    const bodyWatcher = new MutationObserver((_, obs) => {
        if (observeBody()) {
            obs.disconnect();
        }
    }); // Verified
    bodyWatcher.observe(document.documentElement, { childList: true });

    return 'waiting-for-body';
}
