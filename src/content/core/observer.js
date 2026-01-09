

let observerInitialized = false; 
let observationRequests = []; 
let globalObserver = null; 


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
                        if (typeof req.onRemove === 'function') req.onRemove(element);
                    }
                }
            } else if (!req.multiple && req.element && !document.body.contains(req.element)) {
                if (typeof req.onRemove === 'function') req.onRemove();
                req.element = null;
            }
        }

        for (const mutation of mutationsList) {
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
                            const foundElement = addedNode.querySelector(req.selector);
                            if (foundElement) {
                                req.element = foundElement;
                                req.callback(foundElement);
                            }
                        }
                    }

                    if (req.multiple) {
                        if (addedNode.matches(req.selector) && !req.elements.has(addedNode)) {
                            req.elements.add(addedNode);
                            req.callback(addedNode);
                        }
                        addedNode.querySelectorAll(req.selector).forEach(child => {
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
        ...(isMultiple ? { elements: new Set() } : { element: null })
    };
    observationRequests.push(request);

    if (isMultiple) {
        document.querySelectorAll(selector).forEach(element => {
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


export function startObserving() {
    if (!observerInitialized) {
        initializeObserver(); 
    }

    if (!globalObserver) {
        console.error("RoValra: Observer initialization failed.");
        return "failed";
    }


    if (document.body) {
        globalObserver.observe(document.body, { childList: true, subtree: true });
        return "active";
    } else {
        window.addEventListener('DOMContentLoaded', () => {
            globalObserver.observe(document.body, { childList: true, subtree: true });
        }, { once: true });
        return "deferred";
    }
}