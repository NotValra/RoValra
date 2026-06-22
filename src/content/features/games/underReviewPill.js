import {
    getPlaceDetails,
    getUniverseEligibility,
} from '../../core/apis/games.js';
import { getPlaceIdFromUrl } from '../../core/idExtractor.js';
import { settings } from '../../core/settings/getSettings.js';
import { observeElement } from '../../core/observer.js';
import { createPill } from '../../core/ui/general/pill.js';

const CAROUSEL_SELECTOR = '#game-details-carousel-container';
const ACTIONS_SELECTOR = '.game-calls-to-action';
const BUTTONS_SELECTOR = '.game-buttons-container';
const PILL_WRAPPER_CLASS = 'rovalra-under-review-pill-wrapper';

let observerInitialized = false;

async function getCurrentUniverseId() {
    const metaData = document.getElementById('game-detail-meta-data');
    const metaDataUniverseId = Number(metaData?.dataset?.universeId);
    if (Number.isSafeInteger(metaDataUniverseId) && metaDataUniverseId > 0) {
        return metaDataUniverseId;
    }

    const meta = document.querySelector('meta[name="universe-id"]');
    const universeId = Number(meta?.dataset?.universeId);
    if (Number.isSafeInteger(universeId) && universeId > 0) {
        return universeId;
    }

    const placeId = getPlaceIdFromUrl();
    if (!placeId) return null;

    const placeDetails = await getPlaceDetails(placeId);
    const fallbackUniverseId = Number(placeDetails?.universeId);
    return Number.isSafeInteger(fallbackUniverseId) && fallbackUniverseId > 0
        ? fallbackUniverseId
        : null;
}

function restoreCarouselSibling(container) {
    const wrapper = container.parentElement;
    if (!wrapper?.classList.contains('rovalra-under-review-media-wrapper'))
        return;

    const parent = wrapper.parentElement;
    if (!parent) return;

    parent.insertBefore(container, wrapper);
    const pillWrapper = wrapper.querySelector(
        `:scope > .${PILL_WRAPPER_CLASS}`,
    );
    if (pillWrapper) parent.insertBefore(pillWrapper, wrapper.nextSibling);
    wrapper.remove();
    container.style.flex = '';
    container.style.maxWidth = '';
}

function restorePreviousPlacements(container) {
    restoreCarouselSibling(container);

    const oldWrapper = container.parentElement?.querySelector(
        `:scope > .${PILL_WRAPPER_CLASS}`,
    );
    if (oldWrapper) {
        oldWrapper.remove();
    }
}

function getPlacementContainers(container) {
    restorePreviousPlacements(container);

    const mainContainer = container.parentElement;
    const actionsContainer = mainContainer?.querySelector(ACTIONS_SELECTOR);
    const buttonsContainer =
        actionsContainer?.querySelector(BUTTONS_SELECTOR) ||
        mainContainer?.querySelector(BUTTONS_SELECTOR);

    return {
        actionsContainer:
            actionsContainer ||
            buttonsContainer?.closest(ACTIONS_SELECTOR) ||
            buttonsContainer?.parentElement ||
            null,
        buttonsContainer,
    };
}

function removeExistingPill(container) {
    const { actionsContainer } = getPlacementContainers(container);
    const wrapper = actionsContainer?.querySelector(`.${PILL_WRAPPER_CLASS}`);
    if (wrapper) wrapper.remove();
}

function insertUnderReviewPill(container) {
    const { actionsContainer, buttonsContainer } =
        getPlacementContainers(container);
    if (!actionsContainer) return;

    const existingWrapper = actionsContainer.querySelector(
        `.${PILL_WRAPPER_CLASS}`,
    );
    if (existingWrapper) return;

    const wrapper = document.createElement('div');
    wrapper.className = PILL_WRAPPER_CLASS;
    Object.assign(wrapper.style, {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        margin: buttonsContainer ? '0 0 8px' : '0',
    });

    const pill = createPill(
        'Under all-ages review',
        'This game is currently being reviewed for all-ages eligibility.',
        { size: 'small' },
    );
    pill.classList.add('rovalra-under-review-pill');

    wrapper.appendChild(pill);
    if (buttonsContainer) {
        buttonsContainer.prepend(wrapper);
    } else {
        actionsContainer.appendChild(wrapper);
    }
}

async function updateUnderReviewPill(container) {
    if (!(await settings.underReviewPillEnabled)) {
        removeExistingPill(container);
        return;
    }

    const universeId = await getCurrentUniverseId();
    if (!universeId) return;

    const eligibility = await getUniverseEligibility(universeId);
    if (eligibility?.underReview === true) {
        insertUnderReviewPill(container);
    } else {
        removeExistingPill(container);
    }
}

export function init() {
    const currentContainer = document.querySelector(CAROUSEL_SELECTOR);
    if (currentContainer) {
        updateUnderReviewPill(currentContainer);
    }

    if (observerInitialized) return;
    observerInitialized = true;

    observeElement(CAROUSEL_SELECTOR, updateUnderReviewPill);
    observeElement(ACTIONS_SELECTOR, () => {
        const container = document.querySelector(CAROUSEL_SELECTOR);
        if (container) updateUnderReviewPill(container);
    });
    observeElement(BUTTONS_SELECTOR, () => {
        const container = document.querySelector(CAROUSEL_SELECTOR);
        if (container) updateUnderReviewPill(container);
    });
}
