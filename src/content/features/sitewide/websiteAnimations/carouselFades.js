import {
    observeAttributes,
    observeChildren,
    observeElement,
    observeResize,
} from '../../../core/observer.js';
import { getMotionOptions } from '../../../core/ui/motion.js';

const GAME_TRACK =
    '[data-testid="game-carousel"] .horizontal-scroll-window > .horizontally-scrollable';
const SELECTOR = [
    GAME_TRACK,
    '[data-testid="collection-carousel-viewport"] > div:first-child:not([data-testid="carousel-scroll-arrow"])',
    '[data-testid="variable-item-width-scroll-container"]',
    '.rovalra-carousel-scroll',
    '.rovalra-items-scroll-container',
    '.rovalra-friends-carousel-scroll',
    '.profile-carousel [class*="-carouselContainer"] > [class*="-carousel"]',
].join(',');
const CLASS_NAME = 'rovalra-carousel-fades';
const LEFT = '--rovalra-carousel-fade-left';
const RIGHT = '--rovalra-carousel-fade-right';
const WIDTH = '--rovalra-carousel-mask-width';
const OFFSET = '--rovalra-carousel-mask-offset';
const carousels = new Map();
let discovery;
let initialized = false;

function setProperty(element, name, value) {
    if (element.style.getPropertyValue(name) !== value) {
        element.style.setProperty(name, value);
    }
}

function clearMask(state) {
    state.animation?.cancel();
    state.animation = null;
    if (state.element.classList.contains(CLASS_NAME)) {
        state.element.classList.remove(CLASS_NAME);
    }
    state.last = null;
    for (const [name, value, priority] of state.styles) {
        if (value) {
            if (
                state.element.style.getPropertyValue(name) !== value ||
                state.element.style.getPropertyPriority(name) !== priority
            ) {
                state.element.style.setProperty(name, value, priority);
            }
        } else if (state.element.style.getPropertyValue(name)) {
            state.element.style.removeProperty(name);
        }
    }
}

function removeCarousel(element) {
    const state = carousels.get(element);
    if (!state) return;
    carousels.delete(element);
    cancelAnimationFrame(state.frame);
    state.observers.forEach((observer) => observer.disconnect());
    state.resizes.forEach((observer) => observer.unobserve());
    state.children.forEach(({ resize, children }) => {
        resize.unobserve();
        children.disconnect();
    });
    for (const event of [
        'scroll',
        'load',
        'focusin',
        'focusout',
        'transitionrun',
    ]) {
        element.removeEventListener(event, state.schedule, true);
    }
    clearMask(state);
}

function updateCarousel(state) {
    const { element, viewport, translated } = state;
    const options = getMotionOptions('cards');
    if (!element.isConnected || !options) {
        removeCarousel(element);
        return;
    }
    const style = getComputedStyle(element);
    const width = viewport.clientWidth;
    const maximum = element.scrollWidth - width;
    if (
        !width ||
        maximum <= 1 ||
        !element.getClientRects().length ||
        (!translated && !['auto', 'scroll', 'hidden'].includes(style.overflowX))
    ) {
        clearMask(state);
        return;
    }
    // Preserve masks supplied by Roblox, themes or other features.
    if (!element.classList.contains(CLASS_NAME) && style.maskImage !== 'none') {
        return;
    }

    let left;
    if (translated) {
        const rect = viewport.getBoundingClientRect();
        const scale = rect.width / viewport.offsetWidth || 1;
        left =
            (rect.left - element.getBoundingClientRect().left) / scale +
            viewport.clientLeft;
        setProperty(element, WIDTH, `${width}px`);
        setProperty(element, OFFSET, `${left}px`);
    } else {
        // RTL and row-reverse scrollers use negative scrollLeft from the right.
        const reversed =
            (style.direction === 'rtl') !==
            (style.display.includes('flex') &&
                style.flexDirection === 'row-reverse');
        left = reversed ? maximum + element.scrollLeft : element.scrollLeft;
    }
    left = Math.max(0, Math.min(maximum, left));
    const size = Math.min(24, width / 8);
    const focused = element.matches(':focus-visible, :has(:focus-visible)');
    const next = {
        [LEFT]: `${!focused && left > 1 ? size : 0}px`,
        [RIGHT]: `${!focused && maximum - left > 1 ? size : 0}px`,
    };
    if (
        !state.last ||
        state.last[LEFT] !== next[LEFT] ||
        state.last[RIGHT] !== next[RIGHT]
    ) {
        const from = {
            [LEFT]: style.getPropertyValue(LEFT) || '0px',
            [RIGHT]: style.getPropertyValue(RIGHT) || '0px',
        };
        state.animation?.cancel();
        element.classList.add(CLASS_NAME);
        setProperty(element, LEFT, next[LEFT]);
        setProperty(element, RIGHT, next[RIGHT]);
        state.animation =
            !focused && element.animate
                ? element.animate([from, next], options)
                : null;
        state.last = next;
    }
    // Keep the mask aligned while a native carousel animates its track position.
    if (
        translated &&
        element
            .getAnimations()
            .some(
                (animation) =>
                    animation.playState === 'running' &&
                    ['left', 'transform', 'translate'].includes(
                        animation.transitionProperty,
                    ),
            )
    ) {
        state.schedule();
    }
}

function addCarousel(element) {
    if (carousels.has(element)) return;
    const translated = element.matches(GAME_TRACK);
    const state = {
        element,
        translated,
        viewport: translated ? element.parentElement : element,
        frame: 0,
        last: null,
        animation: null,
        observers: [],
        resizes: [],
        children: new Map(),
        styles: [LEFT, RIGHT, WIDTH, OFFSET].map((name) => [
            name,
            element.style.getPropertyValue(name),
            element.style.getPropertyPriority(name),
        ]),
    };
    state.schedule = () => {
        if (state.frame || carousels.get(element) !== state) return;
        state.frame = requestAnimationFrame(() => {
            state.frame = 0;
            updateCarousel(state);
        });
    };
    const watchChildren = () => {
        for (const [child, observers] of state.children) {
            if (child.parentElement === element) continue;
            observers.resize.unobserve();
            observers.children.disconnect();
            state.children.delete(child);
        }
        for (const child of element.children) {
            if (state.children.has(child)) continue;
            state.children.set(child, {
                resize: observeResize(child, state.schedule),
                children: observeChildren(child, state.schedule),
            });
        }
        state.schedule();
    };
    carousels.set(element, state);
    state.observers.push(observeChildren(element, watchChildren));
    if (translated) {
        state.observers.push(
            observeAttributes(element, state.schedule, ['style', 'class']),
        );
    }
    state.resizes.push(observeResize(element, state.schedule));
    if (state.viewport !== element) {
        state.resizes.push(observeResize(state.viewport, state.schedule));
    }
    for (const event of [
        'scroll',
        'load',
        'focusin',
        'focusout',
        'transitionrun',
    ]) {
        element.addEventListener(event, state.schedule, {
            capture: true,
            passive: true,
        });
    }
    watchChildren();
}

function syncMotion() {
    if (getMotionOptions('cards')) {
        if (!discovery) {
            discovery = observeElement(SELECTOR, addCarousel, {
                multiple: true,
                onRemove: removeCarousel,
            });
        }
    } else {
        discovery?.disconnect();
        discovery = null;
        [...carousels.keys()].forEach(removeCarousel);
    }
}

export function initCarouselFades() {
    if (initialized) return;
    initialized = true;
    document.addEventListener('rovalra:motionChanged', syncMotion);
    syncMotion();
}
