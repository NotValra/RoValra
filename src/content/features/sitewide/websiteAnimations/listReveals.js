import {
    observeChildren,
    observeElement,
    observeIntersection,
    observeText,
} from '../../../core/observer.js';
import { getMotionOptions } from '../../../core/ui/motion.js';

const CARDS = [
    '.game-card-container',
    '.rovalra-game-card',
    'a.sdui-game-tile-wrapper',
    '.item-card-container',
    '.rovalra-item-card',
    '.friends-carousel-tile',
    '#friend-tile-button',
    '#friends-web-app .avatar-card',
    '.rbx-game-server-item',
    '.rovalra-server-card',
].join(',');
const SEARCH_RESULTS = [
    '.rovalra-game-input .game-search-dropdown .foundation-web-menu-item',
    '#right-navigation-header .new-dropdown-menu > .navbar-search-option',
].join(',');
const EDITING =
    '[inert], [draggable="true"], [aria-grabbed="true"], .rovalra-home-layout-editor, .rovalra-home-layout-drag-source, .rovalra-home-layout-drag-clone';
let initialized = false;

function createRevealGroup(selector, group, repeatOnChange = false) {
    const seen = new WeakSet();
    const watched = new Map();
    const queued = new Set();
    const animations = new Map();
    let request;
    let frame;

    function forget(element) {
        const record = watched.get(element);
        record?.intersection.unobserve();
        record?.text?.disconnect();
        record?.children?.forEach((observer) => observer.disconnect());
        watched.delete(element);
        queued.delete(element);
        animations.get(element)?.cancel();
        animations.delete(element);
    }

    function flush() {
        frame = null;
        const options = getMotionOptions(group);
        const batch = [...queued];
        queued.clear();
        if (!options) return;

        // Cap the delay so long lists remain immediately usable.
        const positions = new Map();
        batch.sort((a, b) =>
            a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING
                ? 1
                : -1,
        );
        for (const element of batch) {
            const record = watched.get(element);
            if (
                !record?.visible ||
                !element.isConnected ||
                !element.getClientRects().length ||
                element.closest(EDITING) ||
                element.contains(document.activeElement) ||
                (!repeatOnChange && seen.has(element))
            ) {
                continue;
            }
            const signature = element.textContent;
            if (repeatOnChange && record.signature === signature) continue;
            animations.get(element)?.cancel();
            const style = getComputedStyle(element);
            if (style.visibility !== 'visible' || Number(style.opacity) === 0) {
                continue;
            }

            record.signature = signature;
            seen.add(element);
            const position = positions.get(element.parentElement) || 0;
            positions.set(element.parentElement, position + 1);
            const animation = element.animate(
                [{ opacity: 0 }, { opacity: style.opacity }],
                {
                    ...options,
                    delay: Math.min(position, 5) * 30,
                    fill: 'backwards',
                },
            );
            animations.set(element, animation);
            const done = () => {
                if (animations.get(element) === animation) {
                    animations.delete(element);
                }
                if (!repeatOnChange) forget(element);
            };
            animation.finished.then(done, done);
        }
    }

    function queue(element) {
        queued.add(element);
        if (!frame) frame = requestAnimationFrame(flush);
    }

    function watch(element) {
        if (
            (!repeatOnChange && seen.has(element)) ||
            element.parentElement?.closest(selector) ||
            element.closest(EDITING)
        ) {
            return;
        }
        const record = { visible: false, signature: null };
        watched.set(element, record);
        record.intersection = observeIntersection(element, (entry) => {
            record.visible = entry.isIntersecting;
            if (record.visible) queue(element);
        });
        if (repeatOnChange) {
            const changed = () => {
                if (record.visible) queue(element);
            };
            record.text = observeText(element, changed);
            record.children = new Map();
            const watchContent = () => {
                // textContent replaces child nodes instead of emitting a text mutation.
                const nodes = new Set([
                    element,
                    ...element.querySelectorAll('*'),
                ]);
                for (const [node, observer] of record.children) {
                    if (!nodes.has(node)) {
                        observer.disconnect();
                        record.children.delete(node);
                    }
                }
                for (const node of nodes) {
                    if (!record.children.has(node)) {
                        record.children.set(
                            node,
                            observeChildren(node, () => {
                                watchContent();
                                changed();
                            }),
                        );
                    }
                }
            };
            watchContent();
        }
    }

    function update() {
        if (getMotionOptions(group)) {
            if (!request) {
                request = observeElement(selector, watch, {
                    multiple: true,
                    onRemove: forget,
                });
            }
        } else {
            request?.disconnect();
            request = null;
            for (const element of watched.keys()) forget(element);
            queued.clear();
            cancelAnimationFrame(frame);
            frame = null;
        }
    }

    // A focused or pressed result should never wait for its reveal delay.
    function revealInteraction(event) {
        const element = event.target.closest?.(selector);
        if (!element) return;
        queued.delete(element);
        seen.add(element);
        animations.get(element)?.cancel();
        animations.delete(element);
        const record = watched.get(element);
        if (record) record.signature = element.textContent;
        if (!repeatOnChange) forget(element);
    }

    document.addEventListener('focusin', revealInteraction);
    document.addEventListener('pointerdown', revealInteraction, true);
    document.addEventListener('rovalra:motionChanged', update);
    update();
}

export function initListReveals() {
    if (initialized) return;
    initialized = true;
    createRevealGroup(CARDS, 'cards');
    createRevealGroup(SEARCH_RESULTS, 'menus', true);
}
