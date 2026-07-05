import { observeElement, startObserving } from '../observer.js';
import { getUserIdFromUrl } from '../idExtractor.js';

export const USER_CARD_DEFINITIONS = [
    {
        selector: '.friends-carousel-tile',
        linkSelector: 'a.avatar-card-link',
        avatarSelector:
            '.rovalra-user-card-avatar, .avatar-card-fullbody, .avatar-card-image',
        gradientAvatarSelector:
            '.rovalra-user-card-thumbnail, .avatar-card-image',
        displayNameSelector:
            '.friends-carousel-display-name, .user-card-name span, .avatar-name',
        statusAvatarSelector:
            '.rovalra-user-card-avatar, .avatar-card-fullbody, .avatar-card-image-container',
    },
    {
        selector: 'li.list-item.avatar-card',
        linkSelector: 'a.avatar-card-link',
        avatarSelector: '.avatar-card-fullbody, .avatar-card-image',
        gradientAvatarSelector: '.avatar-card-image',
        displayNameSelector: '.avatar-name, .user-card-name span',
    },
    {
        selector: '.avatar-card-container',
        linkSelector: 'a.avatar-card-link',
        avatarSelector: '.avatar-card-fullbody, .avatar-card-image',
        gradientAvatarSelector: '.avatar-card-image',
        displayNameSelector: '.avatar-name, .user-card-name span',
    },
    {
        selector: '.rovalra-donator-card',
        linkSelector: 'a.avatar-card-link',
        avatarSelector: '.avatar-card-fullbody, .avatar-card-image',
        gradientAvatarSelector: '.avatar-card-image',
        displayNameSelector:
            '.avatar-name, .user-card-name span, a[href*="/users/"][href*="/profile"]:not(.avatar-card-link)',
    },
    {
        selector: '.user-item-clickable',
        linkSelector: ':scope',
        avatarSelector: '.avatar-card-fullbody, .avatar-card-image',
        gradientAvatarSelector: '.avatar-card-image',
        displayNameSelector:
            '.avatar-name, .user-card-name span, .text-name, .name',
    },
    {
        selector: 'a.user-avatar-container.avatar.avatar-headshot',
        linkSelector: ':scope',
        avatarSelector: '.avatar-card-image, .thumbnail-2d-container',
        gradientAvatarSelector: '.avatar-card-image, .thumbnail-2d-container',
        displayNameSelector: '.avatar-name, .user-card-name span',
    },
];

export const USER_CARD_SELECTORS = USER_CARD_DEFINITIONS.map(
    ({ selector }) => selector,
);

const subscriptions = new Set();
const observedElements = new Set();
let active = false;

const DISPLAY_NAME_FALLBACK_SELECTOR = [
    '.friends-carousel-display-name',
    '.user-card-name span',
    '.avatar-name',
    '.text-name',
    '.name',
].join(', ');

function getDefinition(element) {
    return USER_CARD_DEFINITIONS.find(({ selector }) =>
        element.matches(selector),
    );
}

function getElement(element, selector) {
    if (!selector) return null;
    if (selector === ':scope') return element;
    if (element.matches(selector)) return element;
    return element.querySelector(selector);
}

function getFallbackLink(element) {
    if (element.matches('a')) return element;

    return element.querySelector(
        [
            'a.avatar-card-link',
            'a.user-item-clickable',
            'a.user-avatar-container',
            'a[href*="/users/"][href*="/profile"]',
            'a[href*="/banned-users/"][href*="/profile"]',
        ].join(', '),
    );
}

function getLinkedDisplayName(element, link) {
    if (!link?.href) return null;

    const linkUrl = new URL(link.href, window.location.origin);
    const linkPath = `${linkUrl.pathname}${linkUrl.search}${linkUrl.hash}`;
    const containers = [
        element.closest(
            '#roseal-home-header, .home-header, .home-header-container, .friends-carousel-tile',
        ),
        element.parentElement,
    ].filter(Boolean);

    for (const container of containers) {
        const linkedNames = container.querySelectorAll(
            [
                `a[href="${CSS.escape(linkPath)}"]`,
                `a[href="${CSS.escape(linkUrl.pathname)}"]`,
                `a[href="${CSS.escape(linkUrl.href)}"]`,
            ].join(', '),
        );

        for (const linkedName of linkedNames) {
            if (linkedName === link || linkedName.contains(element)) continue;
            if (linkedName.querySelector('img, .thumbnail-2d-container')) {
                continue;
            }
            if (!linkedName.textContent?.trim()) continue;
            return linkedName;
        }
    }

    return null;
}

export function getUserCardContext(element) {
    const definition = getDefinition(element);
    const link =
        getElement(element, definition?.linkSelector) ||
        getFallbackLink(element);
    const userId = link?.href ? getUserIdFromUrl(link.href) : null;
    const avatar =
        getElement(element, definition?.avatarSelector) ||
        element.querySelector(
            '.rovalra-user-card-avatar, .avatar-card-fullbody, .avatar-card-image',
        );
    const gradientAvatar =
        getElement(element, definition?.gradientAvatarSelector) || avatar;
    const statusAvatar =
        getElement(element, definition?.statusAvatarSelector) ||
        element.querySelector(
            '.avatar-card-fullbody, .avatar-card-image-container',
        );
    const displayName =
        getElement(element, definition?.displayNameSelector) ||
        element.querySelector(DISPLAY_NAME_FALLBACK_SELECTOR) ||
        getLinkedDisplayName(element, link);

    return {
        element,
        definition,
        link,
        userId,
        avatar,
        gradientAvatar,
        statusAvatar,
        displayName,
    };
}

function getContextKey(context) {
    return [
        context.userId || '',
        context.link?.href || '',
        context.avatar
            ? context.avatar.className || context.avatar.tagName
            : '',
        context.gradientAvatar
            ? context.gradientAvatar.className || context.gradientAvatar.tagName
            : '',
        context.displayName
            ? context.displayName.textContent || context.displayName.className
            : '',
    ].join('|');
}

function notifySubscribers(element, context) {
    const currentContext = context || getUserCardContext(element);
    if (!currentContext.userId) return;

    for (const sub of subscriptions) {
        try {
            if (
                sub.options?.exclude?.some((selector) =>
                    element.matches(selector),
                )
            ) {
                continue;
            }
            sub.callback(element, currentContext);
        } catch (e) {
            console.warn('RoValra: User card element callback error', e);
        }
    }
}

function refreshElement(element) {
    const context = getUserCardContext(element);
    const contextKey = getContextKey(context);

    if (
        !context.userId ||
        element.dataset.rovalraUserCardContextKey === contextKey
    ) {
        return;
    }

    element.dataset.rovalraUserCardContextKey = contextKey;
    notifySubscribers(element, context);
}

function setupRefreshObserver(element) {
    if (element.dataset.rovalraUserCardRefreshObserver) return;
    element.dataset.rovalraUserCardRefreshObserver = 'true';

    const observer = new MutationObserver(() => refreshElement(element));
    observer.observe(element, {
        attributes: true,
        attributeFilter: ['href', 'src', 'class', 'style'],
        childList: true,
        subtree: true,
    });
}

function handleElement(element) {
    if (!observedElements.has(element)) {
        observedElements.add(element);
    }

    element.dataset.rovalraUserCardObserved = 'true';
    setupRefreshObserver(element);
    refreshElement(element);
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
            callback(element, getUserCardContext(element));
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
