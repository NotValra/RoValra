import { getUserIdFromUrl } from '../../../core/idExtractor.js';
import { getUserIdFromFriendUrl } from '../../../core/idExtractor.js';
import { getAuthenticatedUserId } from '../../../core/user.js';
import { observeElement, observeAttributes } from '../../../core/observer.js';
import {
    getCachedFriendsList,
    getFriendRequestOriginText,
} from '../../../core/utils/trackers/friendslist.js';
import { createInteractiveTimestamp } from '../../../core/ui/time/time.js';
import { t, ts } from '../../../core/locale/i18n.js';

let watcherSet = false;
let lastUrl = window.location.href;
let profileDialogObserver = null;
let lastMoreButtonClickTime = 0;
let cardsObserver = null;
let containerObserver = null;

document.addEventListener(
    'click',
    (e) => {
        const btn = e.target.closest('button.more-btn');
        if (btn && btn.getAttribute('aria-label') === 'more') {
            lastMoreButtonClickTime = Date.now();
        }
    },
    true,
);

async function addFriendsSinceLabel(friendsMap, settings) {
    const attributeObservers = new Map();

    if (containerObserver) containerObserver.disconnect();
    containerObserver = observeElement(
        '.avatar-cards',
        (container) => {
            Object.assign(container.style, {
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'stretch',
                gap: '0',
            });
        },
        { multiple: true },
    );

    if (cardsObserver) cardsObserver.disconnect();
    cardsObserver = observeElement(
        '.avatar-card-caption a.avatar-name',
        (profileLink) => {
            const card = profileLink.closest('.avatar-card-caption');
            const cardItem = profileLink.closest('.avatar-card');
            const cardContainer = profileLink.closest('.avatar-card-container');
            if (!card || !cardItem || !cardContainer) return;

            cardItem.style.display = 'inline-flex';
            cardItem.style.height = 'auto';

            Object.assign(cardContainer.style, {
                flex: '1',
                display: 'flex',
                flexDirection: 'column',
            });

            const cardContent = cardContainer.querySelector(
                '.avatar-card-content',
            );
            if (cardContent) {
                cardContent.style.flex = '1';
                cardContent.style.display = 'flex';
                cardContent.style.flexDirection = 'row';
                cardContent.style.alignItems = 'stretch';
            }

            const updateLabel = async () => {
                const friendId = getUserIdFromUrl(profileLink.href);
                let label = card.querySelector('.rovalra-friends-since-label');

                const friendData = friendId
                    ? friendsMap.get(parseInt(friendId, 10))
                    : null;

                if (!friendData || !friendData.friendsSince) {
                    if (label) label.remove();
                    return;
                }

                const friendedText = await t('friendsSince.friended');

                const existingFriendsLabel = card.querySelector(
                    '.rovalra-friends-since-label',
                );
                if (existingFriendsLabel) existingFriendsLabel.remove();

                const existingDetailsLabel = card.querySelector(
                    '.rovalra-friends-details-label',
                );
                if (existingDetailsLabel) existingDetailsLabel.remove();

                Object.assign(card.style, {
                    display: 'flex',
                    flexDirection: 'column',
                    flex: '1',
                });

                label = document.createElement('div');
                label.className =
                    'avatar-card-label text-overflow rovalra-friends-since-label';
                Object.assign(label.style, {
                    display: 'flex',
                    gap: '3px',
                });

                label.appendChild(document.createTextNode(`${friendedText} `));
                label.appendChild(
                    createInteractiveTimestamp(friendData.friendsSince),
                );

                const statusContainer = card.querySelector(
                    '.avatar-status-container',
                );
                if (statusContainer && statusContainer.parentNode) {
                    statusContainer.parentNode.insertBefore(
                        label,
                        statusContainer,
                    );
                } else {
                    const container = card.querySelector('span') || card;
                    container.appendChild(label);
                }

                const detailsLabel = document.createElement('div');
                detailsLabel.className =
                    'avatar-card-label text-overflow rovalra-friends-details-label';
                Object.assign(detailsLabel.style, {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '11px',
                    marginTop: '2px',
                });

                let ageRange =
                    friendData.verifiedAgeRange || friendData.estimatedAgeRange;
                let hasAgeContent = false;
                let hasOriginContent = false;

                if (ageRange && settings.showUserAgeEnabled) {
                    const ageLabel = document.createElement('span');

                    ageLabel.textContent = `${ts('friendsSince.age')} ${ageRange}`;
                    detailsLabel.appendChild(ageLabel);
                    hasAgeContent = true;
                }

                if (
                    friendData.friendRequestOrigin &&
                    settings.showFriendedFromEnabled
                ) {
                    if (hasAgeContent) {
                        const separator = document.createElement('span');
                        separator.style.opacity = '0.5';
                        separator.textContent = ' • ';
                        detailsLabel.appendChild(separator);
                    }

                    const originLabel = document.createElement('span');
                    originLabel.textContent = getFriendRequestOriginText(
                        friendData.friendRequestOrigin,
                    );
                    detailsLabel.appendChild(originLabel);
                    hasOriginContent = true;
                }

                if (detailsLabel.hasChildNodes()) {
                    if (statusContainer && statusContainer.parentNode) {
                        statusContainer.parentNode.insertBefore(
                            detailsLabel,
                            statusContainer,
                        );
                    } else {
                        const container = card.querySelector('span') || card;
                        container.appendChild(detailsLabel);
                    }
                }
            };

            updateLabel();

            const observer = observeAttributes(
                profileLink,
                (mutation) => {
                    if (mutation.attributeName === 'href') {
                        updateLabel();
                    }
                },
                ['href'],
            );
            attributeObservers.set(profileLink, observer.disconnect);
        },
        {
            multiple: true,
            onRemove: (element) => {
                if (attributeObservers.has(element)) {
                    attributeObservers.get(element)();
                    attributeObservers.delete(element);
                }
            },
        },
    );
}

function injectDialogStats(dialog, friendData, settings) {
    const containers = Array.from(
        dialog.querySelectorAll('div.gap-small.flex.flex-col'),
    );
    if (containers.length === 0) return;

    const parent = containers[containers.length - 1];
    if (!parent) return;

    if (parent.querySelector('.rovalra-friends-since-dialog')) return;

    t('friendsSince.friended').then((friendedText) => {
        if (parent.querySelector('.rovalra-friends-since-dialog')) return;

        parent
            .querySelectorAll(
                '.rovalra-friends-since-dialog, .rovalra-friends-age-row, .rovalra-friends-origin-row',
            )
            .forEach((el) => el.remove());

        const row = document.createElement('div');
        row.className =
            'items-center gap-xsmall flex rovalra-friends-since-dialog';
        row.id = 'rovalra-friends-since-container';

        const sibling = parent.querySelector('.items-center.gap-xsmall.flex');
        if (sibling) {
            const textBody = sibling.querySelector('.text-body-medium');
            if (textBody) {
                row.style.fontSize = window.getComputedStyle(textBody).fontSize;
            } else {
                row.style.fontSize = window.getComputedStyle(sibling).fontSize;
            }
        } else {
            row.style.fontSize = '14px';
        }

        const icon = document.createElement('span');
        icon.className =
            'grow-0 shrink-0 basis-auto icon icon-filled-circle-i size-[var(--icon-size-xsmall)]';
        row.appendChild(icon);

        row.appendChild(document.createTextNode(`${friendedText} `));

        const timestamp = createInteractiveTimestamp(friendData.friendsSince);
        const p = document.createElement('span');
        p.appendChild(timestamp);
        row.appendChild(p);

        parent.appendChild(row);

        let ageRange =
            friendData.verifiedAgeRange || friendData.estimatedAgeRange;
        if (ageRange && settings.showUserAgeEnabled) {
            const ageRow = document.createElement('div');
            ageRow.className =
                'items-center gap-xsmall flex rovalra-friends-age-row';
            ageRow.style.fontSize = row.style.fontSize;

            const ageIcon = document.createElement('span');
            ageIcon.className =
                'grow-0 shrink-0 basis-auto icon icon-filled-circle-i size-[var(--icon-size-xsmall)]';
            ageRow.appendChild(ageIcon);

            ageRow.appendChild(
                document.createTextNode(`${ts('friendsSince.age')} `),
            );

            const ageValue = document.createElement('span');
            if (friendData.verifiedAgeRange) {
                ageValue.style.color = 'var(--rovalra-secondary-text-color)';
            }
            ageValue.textContent = ageRange;
            ageRow.appendChild(ageValue);

            parent.appendChild(ageRow);
        }

        if (
            friendData.friendRequestOrigin &&
            settings.showFriendedFromEnabled
        ) {
            const originRow = document.createElement('div');
            originRow.className =
                'items-center gap-xsmall flex rovalra-friends-origin-row';
            originRow.style.fontSize = row.style.fontSize;

            const originIcon = document.createElement('span');
            originIcon.className =
                'grow-0 shrink-0 basis-auto icon icon-filled-circle-i size-[var(--icon-size-xsmall)]';
            originRow.appendChild(originIcon);

            originRow.appendChild(
                document.createTextNode(`${ts('friendsSince.friended')} `),
            );

            const originValue = document.createElement('span');
            originValue.textContent = getFriendRequestOriginText(
                friendData.friendRequestOrigin,
            );
            originRow.appendChild(originValue);

            parent.appendChild(originRow);
        }
    });
}

function initProfileAboutDialogObserver(friendData, settings) {
    if (profileDialogObserver) {
        profileDialogObserver.disconnect();
        profileDialogObserver = null;
    }

    profileDialogObserver = observeElement(
        'div[role="dialog"]',
        (dialog) => {
            const h2 = dialog.querySelector('h2');
            if (
                h2 &&
                h2.textContent === 'About' &&
                Date.now() - lastMoreButtonClickTime < 1500
            ) {
                injectDialogStats(dialog, friendData, settings);
            }
        },
        { multiple: true },
    );
}

function cleanup() {
    if (profileDialogObserver) {
        profileDialogObserver.disconnect();
        profileDialogObserver = null;
    }
    if (cardsObserver) {
        cardsObserver.disconnect();
        cardsObserver = null;
    }
    if (containerObserver) {
        containerObserver.disconnect();
        containerObserver = null;
    }
}

async function run() {
    const settings = await new Promise((resolve) =>
        chrome.storage.local.get(
            {
                friendsSinceEnabled: true,
                showUserAgeEnabled: true,
                showFriendedFromEnabled: true,
            },
            resolve,
        ),
    );

    cleanup();

    if (!settings.friendsSinceEnabled) return;

    const friendsList = await getCachedFriendsList();
    if (!friendsList || friendsList.length === 0) return;

    const friendsMap = new Map(
        friendsList.map((friend) => [friend.id, friend]),
    );

    const userId = getUserIdFromUrl(window.location.href);

    if (userId) {
        const friendData = friendsMap.get(parseInt(userId, 10));
        if (friendData && friendData.friendsSince) {
            initProfileAboutDialogObserver(friendData, settings);
        }
    }

    const isOnFriendsPage =
        window.location.hash.includes('#!/friends') ||
        window.location.pathname.includes('/friends');

    if (isOnFriendsPage) {
        const urlUserId = await getUserIdFromFriendUrl();
        const authedUserId = await getAuthenticatedUserId();

        if (urlUserId == null || String(urlUserId) === String(authedUserId)) {
            addFriendsSinceLabel(friendsMap, settings);
        } else {
            cleanup();
        }
    }
}

export async function init() {
    if (watcherSet) return;
    watcherSet = true;

    const handlePageChange = () => {
        if (window.location.href !== lastUrl) {
            lastUrl = window.location.href;
            run();
        }
    };

    window.addEventListener('popstate', handlePageChange);
    observeElement('body', handlePageChange, { multiple: false });

    run();
}
