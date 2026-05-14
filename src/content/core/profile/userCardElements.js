import { observeElement, startObserving } from '../observer.js';

export const USER_CARD_SELECTORS = [
    '.friends-carousel-tile',
    'li.list-item.avatar-card',
    '.avatar-card-container',
    '.rovalra-donator-card',
];

const subscriptions = new Set();
const observedElements = new Set();
let active = false;

function handleElement(element) {
    if (observedElements.has(element)) return;
    if (element.dataset.rovalraUserCardObserved) return;
    element.dataset.rovalraUserCardObserved = 'true';

    observedElements.add(element);

    for (const sub of subscriptions) {
        try {
            if (
                sub.options?.exclude?.some((selector) =>
                    element.matches(selector),
                )
            ) {
                continue;
            }
            sub.callback(element);
        } catch (e) {
            console.warn('RoValra: User card element callback error', e);
        }
    }
}

function setupObservers() {
    startObserving();

    for (const selector of USER_CARD_SELECTORS) {
        observeElement(selector, handleElement, { multiple: true });
    }
}

export function observeUserCardElements() {
    if (active) return;
    active = true;
    setupObservers();
}

export function onUserCardElement(callback, options = {}) {
    const sub = { callback, options };
    subscriptions.add(sub);

    for (const element of observedElements) {
        try {
            if (
                options.exclude?.some((selector) => element.matches(selector))
            ) {
                continue;
            }
            callback(element);
        } catch (e) {
            console.warn('RoValra: User card element callback error', e);
        }
    }

    return () => {
        subscriptions.delete(sub);
    };
}

export function getUserCardElements() {
    return [...observedElements];
}

export function reset() {
    subscriptions.clear();
    observedElements.clear();
    active = false;
}
