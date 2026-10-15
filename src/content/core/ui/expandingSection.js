import { observeChildren, observeResize } from '../observer.js';
import { getMotionOptions } from './motion.js';

const sections = new Map();

function saveStyle(element, property) {
    return [
        element.style.getPropertyValue(property),
        element.style.getPropertyPriority(property),
    ];
}

function restoreStyle(element, property, [value, priority]) {
    if (value) element.style.setProperty(property, value, priority);
    else element.style.removeProperty(property);
}

function readSize(element) {
    const style = getComputedStyle(element);
    return {
        height: style.height,
        marginTop: style.marginTop,
        marginBottom: style.marginBottom,
    };
}

function finishSection(element, state) {
    if (sections.get(element) !== state) return;
    sections.delete(element);
    cancelAnimationFrame(state.frame);
    state.animation.onfinish = null;
    state.animation.oncancel = null;
    state.animation.cancel();
    state.children.disconnect();
    state.resizes.forEach((observer) => observer.unobserve());
    state.flexShrinks.forEach((value, child) =>
        restoreStyle(child, 'flex-shrink', value),
    );
    element.removeEventListener('load', state.refresh, true);
    restoreStyle(element, 'overflow', state.overflow);
    restoreStyle(element, 'min-height', state.minHeight);
    element.inert = state.inert;
    element.style.display = state.visible ? state.display : 'none';
}

function animateSection(
    element,
    state,
    from,
    duration = state.options.duration,
) {
    if (state.animation) {
        state.animation.onfinish = null;
        state.animation.oncancel = null;
        state.animation.cancel();
    }
    state.deadline = performance.now() + duration;
    state.animation = element.animate([from, state.target], {
        ...state.options,
        duration,
    });
    state.animation.onfinish = () => finishSection(element, state);
    state.animation.oncancel = () => finishSection(element, state);
}

function refreshSection(element, state) {
    if (sections.get(element) !== state || !state.visible) return;
    if (!element.isConnected || !getMotionOptions('panels')) {
        finishSection(element, state);
        return;
    }

    const from = readSize(element);
    const remaining = Math.max(0, state.deadline - performance.now());
    state.animation.onfinish = null;
    state.animation.oncancel = null;
    state.animation.cancel();
    // Read the original layout, then restore the current frame before painting.
    restoreStyle(element, 'overflow', state.overflow);
    restoreStyle(element, 'min-height', state.minHeight);
    const targetHeight = getComputedStyle(element).height;
    element.style.overflow = 'clip';
    element.style.minHeight = '0';
    const changed = targetHeight !== state.target.height;
    state.target.height = targetHeight;
    if (!changed && remaining === 0) {
        finishSection(element, state);
        return;
    }
    animateSection(
        element,
        state,
        from,
        changed ? state.options.duration : remaining,
    );
}

export function setExpandingSectionVisible(
    element,
    visible,
    { display = '', focusTarget } = {},
) {
    const previous = sections.get(element);
    if (previous?.visible === visible && previous.display === display) return;

    const options = getMotionOptions('panels');
    const wasVisible = getComputedStyle(element).display !== 'none';
    const from = wasVisible
        ? readSize(element)
        : { height: '0px', marginTop: '0px', marginBottom: '0px' };
    if (previous) finishSection(element, previous);

    if (
        !options ||
        !element.animate ||
        !element.isConnected ||
        (!previous && wasVisible === visible) ||
        (!wasVisible && !visible)
    ) {
        element.style.display = visible ? display : 'none';
        return;
    }

    element.style.display = display;
    if (element.getClientRects().length === 0) {
        element.style.display = visible ? display : 'none';
        return;
    }
    const state = {
        visible,
        display,
        options,
        target: visible
            ? readSize(element)
            : { height: '0px', marginTop: '0px', marginBottom: '0px' },
        overflow: saveStyle(element, 'overflow'),
        minHeight: saveStyle(element, 'min-height'),
        inert: element.inert,
        resizes: [],
        flexShrinks: new Map(),
        frame: 0,
    };
    if (!visible) {
        if (element.contains(document.activeElement)) {
            if (focusTarget) focusTarget.focus({ preventScroll: true });
            else document.activeElement.blur();
        }
        element.inert = true;
    }
    element.style.overflow = 'clip';
    element.style.minHeight = '0';
    state.refresh = () => {
        if (state.frame || !state.visible) return;
        state.frame = requestAnimationFrame(() => {
            state.frame = 0;
            refreshSection(element, state);
        });
    };
    const watchChildren = () => {
        state.resizes.forEach((observer) => observer.unobserve());
        state.flexShrinks.forEach((value, child) => {
            if (child.parentElement === element) return;
            restoreStyle(child, 'flex-shrink', value);
            state.flexShrinks.delete(child);
        });
        for (const child of element.children) {
            if (!state.flexShrinks.has(child)) {
                state.flexShrinks.set(child, saveStyle(child, 'flex-shrink'));
                child.style.flexShrink = '0';
            }
        }
        state.resizes = [...element.children].map((child) =>
            observeResize(child, state.refresh),
        );
        state.refresh();
    };
    state.children = observeChildren(element, watchChildren);
    element.addEventListener('load', state.refresh, true);
    sections.set(element, state);
    animateSection(element, state, from);
    watchChildren();
}

export function finishExpandingSections() {
    for (const [element, state] of sections) finishSection(element, state);
}
