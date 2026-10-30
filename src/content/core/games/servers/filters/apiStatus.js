let disabled = false;
const listeners = new Set();

export function isServerApiDisabled() {
    return disabled;
}

export function markServerApiDisabled() {
    if (disabled) return;
    disabled = true;
    listeners.forEach((cb) => {
        try {
            cb();
        } catch {}
    });
    listeners.clear();
}

export function onServerApiDisabled(cb) {
    if (disabled) cb();
    else listeners.add(cb);
}

export function applyDisabledFilterStyle(element) {
    if (!element || element.dataset.rovalraApiDisabled === 'true') return;
    element.dataset.rovalraApiDisabled = 'true';
    element.style.opacity = '0.5';
    element.style.cursor = 'not-allowed';
    element.setAttribute('aria-disabled', 'true');

    const block = (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
    };
    ['click', 'mousedown', 'pointerdown', 'keydown'].forEach((type) =>
        element.addEventListener(type, block, true),
    );
    element
        .querySelectorAll('button, input, .rovalra-dropdown-trigger')
        .forEach((el) => {
            el.style.cursor = 'not-allowed';
        });
}
