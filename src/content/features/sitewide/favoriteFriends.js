import { settings } from '../../core/settings/getSettings';
import { observeElement } from '../../core/observer';
import { createButton } from '../../core/ui/buttons';
import { t } from '../../core/locale/i18n';
import { getUserCardContext } from '../../core/profile/userCardElements';
import { getUserDisplayName } from '../../core/apis/users';

const DEVELOPMENT_MODE = true;

const STORAGE_KEY = 'rovalra_favorited_friends';
const TOGGLE_IDENTIFIER = 'rovalra-favorite-friend-userCard-toggle';
const FAVORITED_IDENTIFER = 'rovalra-friend-favorited';

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

// ─── Favoriting Logic ────────────────────────────────────────────────────────

async function toggleFavorite(userId) {
    let favorited_friends = await fetchFavoritedFriends();
    const userFavorited = await isFavorited(userId);

    userFavorited
        ? favorited_friends.pop(userId)
        : favorited_friends.push(userId);

    if (DEVELOPMENT_MODE) console.table('Favorited Friends', favorited_friends);
    await writeFavoritedFriends(favorited_friends);
}

// ─── Component Injection ─────────────────────────────────────────────────────

async function createUserCardToggle(userTile, userId, userDisplayName) {
    const favoriteToggle = createButton(
        await determineLabel(await isFavorited(userId), userDisplayName),
        'secondary',
        {
            onClick: async () => {
                await toggleFavorite(userId);
                updateToggle();
                await updateTileDecoration();
            },
        },
    );

    const updateToggle = async () => {
        const textNode = favoriteToggle.childNodes[1];
        textNode.textContent = await determineLabel(
            await isFavorited(userId),
            userDisplayName,
        );
    };

    const updateTileDecoration = async () => {
        (await isFavorited(userId))
            ? userTile.classList.add(FAVORITED_IDENTIFER)
            : userTile.classList.remove(FAVORITED_IDENTIFER);
    };

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

async function addUserTileDecoration(userTile) {
    if (userTile.querySelector(`.${FAVORITED_IDENTIFER}`)) return;
    const userId = getUserCardContext(userTile).userId;
    const userFavorited = await isFavorited(userId);

    if (userFavorited) userTile.classList.add(FAVORITED_IDENTIFER);
}

// .friends-carousel-tile
// .friend-tile-dropdown

export async function init() {
    if (!(await settings.favoriteFriendsEnabled)) return;
    observeElement('.friends-carousel-tile', addUserCardToggle);
    observeElement('.friends-carousel-tile', addUserTileDecoration, {
        multiple: true,
    });

    let favorite_friends = await fetchFavoritedFriends();
    console.table(favorite_friends);
}
