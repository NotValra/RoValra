import { observeElement, startObserving } from '../observer.js';

export const USER_CARD_SELECTORS = [
    '.friends-carousel-tile',
    'li.list-item.avatar-card',
    '.avatar-card-container',
];

const callbacks = new Set();
const observedElements = new Set();
let active = false;

function handleElement(element) {
    if (observedElements.has(element)) return;
    if (element.dataset.rovalraUserCardObserved) return;
    element.dataset.rovalraUserCardObserved = 'true';

    observedElements.add(element);

    for (const cb of callbacks) {
        try {
            cb(element);
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

export function onUserCardElement(callback) {
    callbacks.add(callback);

    for (const element of observedElements) {
        try {
            callback(element);
        } catch (e) {
            console.warn('RoValra: User card element callback error', e);
        }
    }

    return () => {
        callbacks.delete(callback);
    };
}

export function getUserCardElements() {
    return [...observedElements];
}

export function reset() {
    callbacks.clear();
    observedElements.clear();
    active = false;
}
