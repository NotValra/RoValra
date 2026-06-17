import { settings } from '../../core/settings/getSettings';
import { observeElement } from '../../core/observer';
import { createButton } from '../../core/ui/buttons';
import { t } from '../../core/locale/i18n';
import { getUserCardContext } from '../../core/profile/userCardElements';
import { getUserDisplayName } from '../../core/apis/users';
import { fetchThumbnails } from '../../core/thumbnail/thumbnails';

const DEVELOPMENT_MODE = true;
const CAROUSEL_OFFSET = 2;

const STORAGE_KEY = 'rovalra_favorited_friends';

const TOGGLE_IDENTIFIER = 'rovalra-favorite-friend-userCard-toggle';
const TOGGLE_FAVORITED_IDENTIFIER = 'rovalra-favorite-friend-userCard-toggled';

const FAVORITED_IDENTIFER = 'rovalra-friend-favorited';
const AVATAR_IDENTIFIER = 'rovalra-forcefully-loaded-avatar';

// ─── Chrome Storage ──────────────────────────────────────────────────────────

async function fetchFavoritedFriends() {
    try {
        const storage = await chrome.storage.local.get(STORAGE_KEY);
        return Array.isArray(storage[STORAGE_KEY]) ? storage[STORAGE_KEY] : [];
    } catch (error) {
        console.log(
            'Rovalra: Failed to fetch favorited friends cache, ',
            error,
        );
        return [];
    }
}

async function writeFavoritedFriends(favorite_friends) {
    try {
        await chrome.storage.local.set({
            [STORAGE_KEY]: favorite_friends,
        });
    } catch (error) {
        console.warn(
            'RoValra: Failed to write favorited friends into cache, ',
            error,
        );
    }
}

// ─── Helper Functions ────────────────────────────────────────────────────────

async function isFavorited(userId) {
    let favorited_friends = await fetchFavoritedFriends();

    return favorited_friends.includes(userId);
}

async function determineLabel(userFavorited, userDisplayName) {
    return userFavorited
        ? await t('favoriteFriends.unFavoriteFriendDisplayName', {
              displayName: userDisplayName,
          })
        : await t('favoriteFriends.favoriteFriendDisplayName', {
              displayName: userDisplayName,
          });
}

async function updateToggle(favoriteToggle, userDisplayName, userFavorited) {
    const textNode = favoriteToggle.childNodes[1];
    textNode.textContent = await determineLabel(userFavorited, userDisplayName);
}

async function updateTileDecoration(userTile, userFavorited) {
    userFavorited
        ? userTile.classList.add(FAVORITED_IDENTIFER)
        : userTile.classList.remove(FAVORITED_IDENTIFER);
}

async function attachAvatar(userTile, userId) {
    const container = userTile.querySelector('.thumbnail-2d-container.shimmer');
    if (container.querySelector(`.${AVATAR_IDENTIFIER}`)) return;

    const avatarImage = document.createElement('img');
    avatarImage.classList.add(AVATAR_IDENTIFIER);
    container.append(avatarImage);

    const thumbMap = await fetchThumbnails(
        [{ id: userId }],
        'AvatarHeadshot',
        '150x150',
        true,
    );

    avatarImage.src = thumbMap.entries().next().value[1].imageUrl;
    container.classList.remove('shimmer');
}

// ─── Favoriting Logic ────────────────────────────────────────────────────────

async function toggleFavorite(userId) {
    let favorited_friends = await fetchFavoritedFriends();

    favorited_friends = favorited_friends.includes(userId)
        ? favorited_friends.filter((id) => id !== userId)
        : [...favorited_friends, userId];

    if (DEVELOPMENT_MODE) console.table('Favorited Friends', favorited_friends);
    await writeFavoritedFriends(favorited_friends);

    return favorited_friends.includes(userId);
}

async function reorderCarousel(userTile, userId) {
    const userFavorited = await isFavorited(userId);
    const userFavoritedFriends = await fetchFavoritedFriends(userId);

    const tileContainer = document.querySelector(
        '.friends-carousel-list-container',
    );

    const alreadyFavoritedLocation = () => {
        if (tileContainer.querySelector('.add-friends-icon-container')) {
            return tileContainer.children[1];
        } else {
            return tileContainer.children[0];
        }
    };

    userFavorited
        ? tileContainer.insertBefore(
              userTile.parentElement,
              alreadyFavoritedLocation(),
          )
        : tileContainer.insertBefore(
              userTile.parentElement,
              tileContainer.children[
                  userFavoritedFriends.length + CAROUSEL_OFFSET
              ],
          );
}

// ─── Component Injection ─────────────────────────────────────────────────────

async function createUserCardToggle(userTile, userId, userDisplayName) {
    let userFavorited = await isFavorited(userId);

    const favoriteToggle = createButton(
        await determineLabel(userFavorited, userDisplayName),
        'secondary',
        {
            onClick: async () => {
                const userFavorited = await toggleFavorite(userId);
                await updateToggle(
                    favoriteToggle,
                    userDisplayName,
                    userFavorited,
                );
                await updateTileDecoration(userTile, userFavorited);
                await reorderCarousel(userTile, userId);
            },
        },
    );

    userFavorited = await isFavorited(userId);
    userFavorited
        ? favoriteToggle.classList.add(TOGGLE_FAVORITED_IDENTIFIER)
        : favoriteToggle.classList.remove(TOGGLE_FAVORITED_IDENTIFIER);

    if (DEVELOPMENT_MODE)
        console.log(
            `RoValra - Favorited Friends: Is ${userDisplayName} (${userId}) favorited? ${await isFavorited(userId)}.`,
            await determineLabel(await isFavorited(userId), userDisplayName),
        );

    favoriteToggle.classList.add(TOGGLE_IDENTIFIER);
    favoriteToggle.classList.add('friend-tile-dropdown-button');

    let favoriteIcon = document.createElement('span');
    favoriteIcon.classList.add('icon-favorite');
    favoriteToggle.prepend(favoriteIcon);

    return favoriteToggle;
}

async function addUserCardToggle() {
    observeElement('.friend-tile-dropdown', async (userCard) => {
        const userTile = userCard.closest('.friends-carousel-tile');
        if (userCard.querySelector(`.${TOGGLE_IDENTIFIER}`)) return;

        const container = userCard.querySelector('ul');
        let item = document.createElement('li');

        const userId = getUserCardContext(userTile).userId;
        const userDisplayName = await getUserDisplayName(userId);

        const favoriteToggle = await createUserCardToggle(
            userTile,
            userId,
            userDisplayName,
        );

        item.append(favoriteToggle);
        container.append(item);
    });
}

async function userTileModification(userTile) {
    if (userTile.querySelector(`.${FAVORITED_IDENTIFER}`)) return;

    const userId = getUserCardContext(userTile).userId;
    const userFavorited = await isFavorited(userId);

    if (userFavorited) {
        userTile.classList.add(FAVORITED_IDENTIFER);
        await reorderCarousel(userTile, userId);

        if (userTile.querySelector('.thumbnail-2d-container.shimmer'))
            attachAvatar(userTile, userId);
    }
}

export async function init() {
    if (!(await settings.favoriteFriendsEnabled)) return;
    observeElement('.friends-carousel-tile', addUserCardToggle);
    observeElement('.friends-carousel-tile', userTileModification, {
        multiple: true,
    });

    let favorite_friends = await fetchFavoritedFriends();
    console.table(favorite_friends);
}
