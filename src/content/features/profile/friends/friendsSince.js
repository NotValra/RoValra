import { getUserIdFromUrl } from '../../../core/idExtractor.js';
import { observeElement, observeAttributes } from '../../../core/observer.js';
import { getCachedFriendsList } from '../../../core/utils/trackers/friendslist.js';
import { createInteractiveTimestamp } from '../../../core/ui/time/time.js';
import { t } from '../../../core/locale/i18n.js';

let watcherSet = false;
let lastUrl = window.location.href;
let profileDialogObserver = null;
let lastMoreButtonClickTime = 0;

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

async function addFriendsSinceLabel(friendsMap) {
    const attributeObservers = new Map();

    observeElement(
        '.avatar-card-caption a.avatar-name',
        (profileLink) => {
            const card = profileLink.closest('.avatar-card-caption');
            if (!card) return;

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

                if (label) {
                    label.innerHTML = '';
                } else {
                    label = document.createElement('div');
                    label.className =
                        'avatar-card-label text-overflow rovalra-friends-since-label';
                    Object.assign(label.style, {
                        display: 'flex',
                        gap: '3px',
                    });

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
                }

                label.appendChild(document.createTextNode(`${friendedText} `));
                label.appendChild(
                    createInteractiveTimestamp(friendData.friendsSince),
                );
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

function injectDialogStats(dialog, friendData) {
    const statsHeader = Array.from(
        dialog.querySelectorAll('span.group-description-dialog-body-header'),
    ).find((el) => el.textContent.trim() === 'Statistics');

    if (!statsHeader) return;
    const parent = statsHeader.parentElement;
    if (!parent) return;

    if (parent.querySelector('.rovalra-friends-since-dialog')) return;

    t('friendsSince.friended').then((friendedText) => {
        if (parent.querySelector('.rovalra-friends-since-dialog')) return;

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
    });
}

function initProfileAboutDialogObserver(friendData) {
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
                injectDialogStats(dialog, friendData);
            }
        },
        { multiple: true },
    );
}

export async function init() {
    const settings = await new Promise((resolve) =>
        chrome.storage.local.get({ friendsSinceEnabled: true }, resolve),
    );

    if (profileDialogObserver) {
        profileDialogObserver.disconnect();
        profileDialogObserver = null;
    }

    if (!settings.friendsSinceEnabled) return;

    if (!watcherSet) {
        watcherSet = true;
        setInterval(() => {
            if (window.location.href !== lastUrl) {
                lastUrl = window.location.href;
                init();
            }
        }, 500);
    }
    lastUrl = window.location.href;

    const friendsList = await getCachedFriendsList();
    if (!friendsList || friendsList.length === 0) return;

    const friendsMap = new Map(
        friendsList.map((friend) => [friend.id, friend]),
    );

    const userId = getUserIdFromUrl(window.location.href);

    if (userId) {
        const friendData = friendsMap.get(parseInt(userId, 10));
        if (friendData && friendData.friendsSince) {
            initProfileAboutDialogObserver(friendData);
        }
    }

    if (
        !userId &&
        window.location.hash === '#!/friends' &&
        window.location.pathname.endsWith('/friends')
    ) {
        addFriendsSinceLabel(friendsMap);
    }
}
