import {
    observeAttributes,
    observeChildren,
    observeElement,
    observeResize,
} from '../../../core/observer.js';
import { getMotionOptions } from '../../../core/ui/motion.js';

const BAR_SELECTOR =
    '#game-detail-page #horizontal-tabs, .profile-platform-container .profile-tabs';
const TAB_SELECTOR = '.rbx-tab > .rbx-tab-heading, a.profile-tab';
const bars = new Map();
let discovery = null;
let initialized = false;

function removeBar(bar) {
    const state = bars.get(bar);
    if (!state) return;
    bars.delete(bar);
    cancelAnimationFrame(state.frame);
    state.animation?.cancel();
    state.observers.forEach((observer) => observer.disconnect());
    state.resizes.forEach((observer) => observer.unobserve());
    bar.removeEventListener('scroll', state.onScroll);
    state.indicator.remove();
    bar.classList.remove(
        'rovalra-tab-indicator-bar',
        'rovalra-tab-indicator-positioned',
        'rovalra-tab-indicator-ready',
    );
}

function updateBar(state, animate) {
    const { bar, indicator } = state;
    if (!bar.isConnected || !getMotionOptions('navigation')) {
        removeBar(bar);
        return;
    }
    if (indicator.parentElement !== bar) {
        state.last = null;
        bar.appendChild(indicator);
    }

    const tabs = [...bar.querySelectorAll(TAB_SELECTOR)].filter(
        (tab) => tab.closest(BAR_SELECTOR) === bar,
    );
    const selected =
        tabs.find((tab) => tab.getAttribute('aria-selected') === 'true') ||
        tabs.find(
            (tab) =>
                tab.classList.contains('active') ||
                tab.parentElement.classList.contains('active'),
        );
    const rect = selected?.getBoundingClientRect();
    if (
        !rect?.width ||
        !rect.height ||
        selected.closest('[hidden], [aria-hidden="true"]') ||
        getComputedStyle(selected).visibility === 'hidden'
    ) {
        state.animation?.cancel();
        state.last = null;
        bar.classList.remove('rovalra-tab-indicator-ready');
        return;
    }

    const barRect = bar.getBoundingClientRect();
    const scaleX = barRect.width / bar.offsetWidth || 1;
    const scaleY = barRect.height / bar.offsetHeight || 1;
    // Physical coordinates and scrollLeft work for both LTR and RTL scrollers.
    const left =
        (rect.left - barRect.left) / scaleX - bar.clientLeft + bar.scrollLeft;
    const top =
        (rect.bottom - barRect.top) / scaleY -
        bar.clientTop +
        bar.scrollTop -
        2;
    const width = rect.width / scaleX;
    if (
        state.last &&
        state.last.left === left &&
        state.last.top === top &&
        state.last.width === width
    ) {
        return;
    }

    const previous = state.last ? indicator.getBoundingClientRect() : null;
    state.animation?.cancel();
    indicator.style.left = `${left}px`;
    indicator.style.top = `${top}px`;
    indicator.style.width = `${width}px`;
    bar.classList.add('rovalra-tab-indicator-ready');
    state.last = { left, top, width };

    if (animate && previous?.width && indicator.animate) {
        const target = indicator.getBoundingClientRect();
        const x = (previous.left - target.left) / scaleX;
        const y = (previous.top - target.top) / scaleY;
        const zoom = previous.width / target.width;
        state.animation = indicator.animate(
            [
                { transform: `translate(${x}px, ${y}px) scaleX(${zoom})` },
                { transform: 'none' },
            ],
            getMotionOptions('navigation'),
        );
    }
}

function addBar(bar) {
    if (bars.has(bar)) return;
    const indicator = document.createElement('li');
    indicator.className = 'rovalra-tab-indicator';
    indicator.setAttribute('aria-hidden', 'true');
    const state = {
        bar,
        indicator,
        observers: [],
        resizes: new Map(),
        frame: 0,
        animate: false,
        animation: null,
        last: null,
    };
    const schedule = (animate = true) => {
        state.animate ||= animate;
        if (state.frame) return;
        state.frame = requestAnimationFrame(() => {
            state.frame = 0;
            const shouldAnimate = state.animate;
            state.animate = false;
            updateBar(state, shouldAnimate);
        });
    };
    state.onScroll = () => schedule(false);
    bars.set(bar, state);
    if (getComputedStyle(bar).position === 'static') {
        bar.classList.add('rovalra-tab-indicator-positioned');
    }
    bar.classList.add('rovalra-tab-indicator-bar');
    bar.appendChild(indicator);
    bar.addEventListener('scroll', state.onScroll, { passive: true });
    state.resizes.set(
        bar,
        observeResize(bar, () => schedule(false)),
    );
    state.observers.push(
        observeAttributes(
            bar,
            (mutation) => {
                if (mutation.target !== indicator) schedule();
            },
            ['class', 'aria-selected', 'aria-hidden', 'hidden', 'dir'],
            { subtree: true },
        ),
        observeChildren(bar, () => schedule()),
        observeElement(
            TAB_SELECTOR,
            (tab) => {
                state.resizes.set(
                    tab,
                    observeResize(tab, () => schedule(false)),
                );
                schedule();
            },
            {
                root: bar,
                multiple: true,
                onRemove: (tab) => {
                    state.resizes.get(tab)?.unobserve();
                    state.resizes.delete(tab);
                    schedule();
                },
            },
        ),
    );
    updateBar(state, false);
}

function syncMotion() {
    if (!getMotionOptions('navigation')) {
        discovery?.disconnect();
        discovery = null;
        [...bars.keys()].forEach(removeBar);
    } else if (!discovery) {
        discovery = observeElement(BAR_SELECTOR, addBar, {
            multiple: true,
            onRemove: removeBar,
        });
    }
}

export function initTabIndicator() {
    if (initialized) return;
    initialized = true;
    document.addEventListener('rovalra:motionChanged', syncMotion);
    syncMotion();
}
