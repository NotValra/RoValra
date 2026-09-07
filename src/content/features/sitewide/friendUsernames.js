import { getUserIdFromUrl } from '../../core/idExtractor.js';
import { observeElement } from '../../core/observer.js';
import { settings } from '../../core/settings/getSettings.js';
import { getUserFullData, getUserName } from '../../core/apis/users.js';
import { addTooltip } from '../../core/ui/tooltip.js';
import { ts } from '../../core/locale/i18n.js';
import {
    getUserCardContext,
    observeUserCardElements,
    onUserCardElement,
} from '../../core/profile/userCardElements.js';

const USERNAME_WRAPPER_CLASS = 'rovalra-friend-username-wrapper';
const USERNAME_LABEL_CLASS = 'rovalra-friend-username-label';
const USERNAME_INLINE_CLASS = 'rovalra-friend-username-inline';
const COMPATIBLE_FRIEND_USERNAME_SELECTOR =
    '.roseal-friends-carousel-container, .btr-friends-carousel-username';
const SERVER_FRIEND_AVATAR_SELECTOR =
    '.rbx-friends-game-server-item .player-thumbnails-container .avatar-card-link[href*="/users/"]';
const SERVER_FRIEND_NAME_SELECTOR =
    '.rbx-friends-game-server-item a.text-name[href*="/users/"]';

let cardUnsubscribe = null;
let serverAvatarObserverStarted = false;
let serverNameObserverStarted = false;
let compatibleFriendUsernameDetected = false;

function isCompatibleFriendUsernamePresent() {
    return (
        compatibleFriendUsernameDetected ||
        document.querySelector(COMPATIBLE_FRIEND_USERNAME_SELECTOR) !== null
    );
}

function setupCompatibleFriendUsernameDetection() {
    observeElement(
        COMPATIBLE_FRIEND_USERNAME_SELECTOR,
        () => {
            compatibleFriendUsernameDetected = true;
        },
        { multiple: true },
    );
}

function isOnFriendsListPage() {
    return (
        window.location.hash.includes('#!/friends') ||
        window.location.pathname.includes('/friends')
    );
}

// Roblox and other extensions render badges (verified, premium, ...) next to the
// display name instead of inside it, so the row holding both gets wrapped as a
// whole. Wrapping only the display name would drop those badges onto the
// username line.
function getNameRow(displayNameEl, context) {
    const parent = displayNameEl.parentElement;
    if (!parent || parent.classList.contains(USERNAME_WRAPPER_CLASS)) {
        return displayNameEl;
    }

    // Anything still holding the card link or the avatar is the card itself,
    // not a name row.
    if (context.link && parent.contains(context.link)) return displayNameEl;
    if (context.avatar && parent.contains(context.avatar)) return displayNameEl;

    // Badges carry no text, so a name row reads exactly like the display name.
    if (parent.textContent.trim() !== displayNameEl.textContent.trim()) {
        return displayNameEl;
    }

    return parent;
}

function ensureUsernameWrapper(nameRow) {
    const parent = nameRow.parentElement;
    if (parent?.classList.contains(USERNAME_WRAPPER_CLASS)) {
        return parent;
    }

    const wrapper = document.createElement('span');
    wrapper.className = USERNAME_WRAPPER_CLASS;
    nameRow.replaceWith(wrapper);
    wrapper.appendChild(nameRow);
    return wrapper;
}

async function applyCardUsernameLabel(tile, context) {
    const { userId, displayName } = context;
    if (!userId || !displayName) return;

    // The dedicated friends list already shows enough friend info on its own.
    if (isOnFriendsListPage()) return;

    // BTRoblox already render usernames in their friends carousel.
    if (isCompatibleFriendUsernamePresent()) return;

    // RoValra's own generated user cards already render a username sub-label.
    if (tile.querySelector('.user-card-subname')) return;

    const applyKey = `${userId}|${displayName.textContent || ''}`;
    if (tile.dataset.rovalraFriendUsernameApplied === applyKey) return;

    try {
        const username = await getUserName(userId);
        if (!username) return;

        const currentUserId = getUserCardContext(tile).userId;
        if (String(currentUserId) !== String(userId)) return;
        if (isCompatibleFriendUsernamePresent()) return;

        tile.dataset.rovalraFriendUsernameApplied = applyKey;

        const wrapper = ensureUsernameWrapper(getNameRow(displayName, context));

        let label = wrapper.querySelector(`:scope > .${USERNAME_LABEL_CLASS}`);
        if (!label) {
            label = document.createElement('span');
            label.className = USERNAME_LABEL_CLASS;
            wrapper.appendChild(label);
        }
        label.textContent = username.length > 13
            ? `@${username.slice(0, 10)}...`
            : `@${username}`;
        label.setAttribute(
            'aria-label',
            ts('friendUsernames.ariaLabel', { username }),
        );
    } catch (error) {
        console.warn(
            'RoValra: Failed to render friend username label',
            userId,
            error,
        );
    }
}

function setupCardUsernames() {
    if (cardUnsubscribe) return;
    setupCompatibleFriendUsernameDetection();
    observeUserCardElements();
    cardUnsubscribe = onUserCardElement(applyCardUsernameLabel);
}

function formatNameWithUsername(userData) {
    return userData.displayName && userData.displayName !== userData.name
        ? ts('friendUsernames.nameWithUsername', {
              displayName: userData.displayName,
              username: userData.name,
          })
        : `@${userData.name}`;
}

// The friend names Roblox renders next to a server only show the display name,
// so the username gets appended behind it as "DisplayName (@username)".
function applyServerFriendName(link, userId) {
    const applyKey = `${userId}|${link.textContent.trim()}`;
    if (link.dataset.rovalraFriendUsernameName === applyKey) return;
    link.dataset.rovalraFriendUsernameName = applyKey;

    getUserFullData(userId)
        .then((userData) => {
            if (!userData?.name || !link.isConnected) return;
            if (getUserIdFromUrl(link.href) !== userId) return;

            const existing = link.querySelector(`.${USERNAME_INLINE_CLASS}`);
            if (
                userData.displayName &&
                userData.displayName !== userData.name
            ) {
                const usernameEl = existing || document.createElement('span');
                usernameEl.className = USERNAME_INLINE_CLASS;
                usernameEl.textContent = ` (@${userData.name})`;
                if (!existing) link.appendChild(usernameEl);
            } else {
                existing?.remove();
            }

            link.dataset.rovalraFriendUsernameName = `${userId}|${link.textContent.trim()}`;
            link.setAttribute('aria-label', formatNameWithUsername(userData));
        })
        .catch((error) => {
            delete link.dataset.rovalraFriendUsernameName;
            console.warn(
                'RoValra: Failed to render server friend username',
                userId,
                error,
            );
        });
}

function setupServerFriendNames() {
    if (serverNameObserverStarted) return;
    serverNameObserverStarted = true;

    observeElement(
        SERVER_FRIEND_NAME_SELECTOR,
        (link) => {
            const userId = getUserIdFromUrl(link.href);
            if (!userId) return;
            applyServerFriendName(link, userId);
        },
        { multiple: true },
    );
}

function setupServerFriendTooltips() {
    if (serverAvatarObserverStarted) return;
    serverAvatarObserverStarted = true;

    observeElement(
        SERVER_FRIEND_AVATAR_SELECTOR,
        (link) => {
            if (link.dataset.rovalraFriendUsernameTooltip) return;
            const userId = getUserIdFromUrl(link.href);
            if (!userId) return;

            link.dataset.rovalraFriendUsernameTooltip = 'true';
            link.removeAttribute('title');

            addTooltip(
                link,
                () => link.dataset.rovalraFriendUsernameText || '',
                {
                    position: 'top',
                },
            );

            getUserFullData(userId).then((userData) => {
                if (!userData?.name || !link.isConnected) return;

                const text = formatNameWithUsername(userData);

                link.dataset.rovalraFriendUsernameText = text;
                link.setAttribute('aria-label', text);
            });
        },
        { multiple: true },
    );
}

export async function init() {
    if (!(await settings.friendUsernamesEnabled)) return;

    setupCardUsernames();
    setupServerFriendTooltips();
    setupServerFriendNames();
}