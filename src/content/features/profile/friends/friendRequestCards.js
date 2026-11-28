import {
    observeAttributes,
    observeChildren,
    observeElement,
    observeText,
} from '../../../core/observer.js';
import { settings } from '../../../core/settings/getSettings.js';
import { ts } from '../../../core/locale/i18n.js';
import { getUserIdFromUrl } from '../../../core/idExtractor.js';
import { createInteractiveTimestamp } from '../../../core/ui/time/time.js';
import {
    findRequest,
    trackNativeResponses,
} from '../../../core/apis/friendRequests.js';
import { getFriendRequestOriginTextFromSourceType } from '../../../core/utils/trackers/friendslist.js';

const NATIVE_CAPTION_SELECTOR =
    '.friends-content .avatar-card:not(.rovalra-filtered-request-card) .avatar-card-caption';
const REQUESTS_HEADER_SELECTOR = '.request-tab-header';
const SENT_LABEL_CLASS = 'rovalra-request-sent';
const ORIGIN_LABEL_CLASS = 'rovalra-request-origin';

export function createSentLabel(sentAt) {
    const label = document.createElement('div');
    label.className = `avatar-card-label ${SENT_LABEL_CLASS} rovalra-request-date`;
    label.append(
        document.createTextNode(ts('friendRequestCards.sent')),
        createInteractiveTimestamp(sentAt),
    );
    return label;
}

export function createOriginLabel(originSourceType) {
    const label = document.createElement('div');
    label.className = `avatar-card-footer avatar-card-label ${ORIGIN_LABEL_CLASS}`;
    label.textContent =
        getFriendRequestOriginTextFromSourceType(originSourceType);
    return label;
}

export function createInlineOriginLabel(originSourceType) {
    const label = document.createElement('div');
    label.className = `${ORIGIN_LABEL_CLASS} rovalra-request-origin-inline`;
    label.textContent =
        getFriendRequestOriginTextFromSourceType(originSourceType);
    return label;
}

function isMutualsFooter(footer) {
    return Boolean(footer.querySelector('.mutual-friends-tooltip-label'));
}

function hasNativeFooter(caption) {
    return [...caption.querySelectorAll('.avatar-card-footer')].some(
        (footer) =>
            !footer.classList.contains(ORIGIN_LABEL_CLASS) &&
            !footer.classList.contains(SENT_LABEL_CLASS) &&
            !isMutualsFooter(footer) &&
            footer.textContent.trim() !== '',
    );
}

function placeOrigin(caption) {
    const originSourceType = caption.dataset.rovalraOrigin;
    const current = caption.querySelector(`.${ORIGIN_LABEL_CLASS}`);
    if (!originSourceType || hasNativeFooter(caption)) {
        current?.remove();
        return;
    }

    const mutualsFooter = [
        ...caption.querySelectorAll(':scope > .avatar-card-footer'),
    ].find(isMutualsFooter);
    const wantedParent = mutualsFooter || caption;
    if (current?.parentElement === wantedParent) return;

    current?.remove();
    if (mutualsFooter) {
        mutualsFooter.prepend(createInlineOriginLabel(originSourceType));
    } else {
        caption.appendChild(createOriginLabel(originSourceType));
    }
}

function getLabelParent(caption, link) {
    return link.closest('.avatar-name-container')?.parentElement || caption;
}

function enhanceCard(caption) {
    if (
        !caption
            .closest('.friends-content')
            ?.querySelector(REQUESTS_HEADER_SELECTOR)
    ) {
        return;
    }
    const link = caption.querySelector('a.avatar-name[href]');
    if (!link) return;

    const update = async () => {
        const userId = getUserIdFromUrl(link.href);
        const existing = caption.querySelector(`.${SENT_LABEL_CLASS}`);
        if (existing?.dataset.userId === String(userId)) return;

        const request = userId
            ? await findRequest(userId).catch(() => null)
            : null;
        if (getUserIdFromUrl(link.href) !== userId) return;
        const sentAt = request?.friendRequest?.sentAt;

        caption.querySelector(`.${SENT_LABEL_CLASS}`)?.remove();

        if (sentAt) {
            const label = createSentLabel(sentAt);
            label.dataset.userId = String(userId);
            getLabelParent(caption, link).appendChild(label);
        }

        const { originSourceType, sourceUniverseId } =
            request?.friendRequest || {};
        if (originSourceType && !sourceUniverseId) {
            caption.dataset.rovalraOrigin = originSourceType;
        } else {
            delete caption.dataset.rovalraOrigin;
        }
        placeOrigin(caption);
    };

    update();
    observeAttributes(link, update, ['href']);
    const replaceOrigin = () => placeOrigin(caption);
    observeChildren(caption, replaceOrigin);
    observeText(caption, replaceOrigin);
}

export async function init() {
    if ((await settings.friendRequestCardsEnabled) === false) return;

    trackNativeResponses();
    observeElement(NATIVE_CAPTION_SELECTOR, enhanceCard, { multiple: true });
}
