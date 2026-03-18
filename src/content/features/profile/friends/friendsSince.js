import { getUserIdFromUrl } from '../../../core/idExtractor.js';
import { observeElement, observeAttributes } from '../../../core/observer.js';
import { getCachedFriendsList } from '../../../core/utils/trackers/friendslist.js';
import { createInteractiveTimestamp } from '../../../core/ui/time/time.js';
import { t } from '../../../core/locale/i18n.js';

let watcherSet = false;
let lastUrl = window.location.href;

async function addFriendsSinceLabel(friendsMap) {
    console.log('Adding friends since label');
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

export async function init() {
    const settings = await new Promise((resolve) =>
        chrome.storage.local.get({ friendsSinceEnabled: true }, resolve),
    );

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
    console.log('Friends Since init');
    if (
        getUserIdFromUrl(window.location.href) ||
        window.location.hash !== '#!/friends' ||
        !window.location.pathname.endsWith('/friends')
    ) {
        return;
    }

    const friendsList = await getCachedFriendsList();
    if (!friendsList || friendsList.length === 0) return;

    const friendsMap = new Map(
        friendsList.map((friend) => [friend.id, friend]),
    );
    addFriendsSinceLabel(friendsMap);
}
