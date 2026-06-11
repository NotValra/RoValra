import { settings } from '../../core/settings/getSettings';
import { observeElement } from '../../core/observer';
import { createButton } from '../../core/ui/buttons';
import { t } from '../../core/locale/i18n';
import { getUserCardContext } from '../../core/profile/userCardElements';
import { getUserDisplayName } from '../../core/apis/users';

async function addUserCardToggle() {
    observeElement('.friend-tile-dropdown', async (userCard) => {
        const userTile = userCard.closest('.friends-carousel-tile');

        const toggleIdentifier = 'rovalra-favorite-friend-userCard-toggle';
        if (userCard.querySelector(`.${toggleIdentifier}`)) return;

        const userId = getUserCardContext(userTile).userId;
        const userDisplayName = await getUserDisplayName(userId);

        const container = userCard.querySelector('ul');
        let item = document.createElement('li');

        const toggle = createButton(
            await t('favoriteFriends.favoriteFriendDisplayName', {
                displayName: userDisplayName,
            }),
            'secondary',
        );
        toggle.classList.add(toggleIdentifier);
        toggle.classList.add('friend-tile-dropdown-button');

        let favoriteIcon = document.createElement('span');
        favoriteIcon.classList.add('icon-favorite');
        toggle.prepend(favoriteIcon);

        item.append(toggle);
        container.append(item);
    });
}
// .friends-carousel-tile
// .friend-tile-dropdown

export async function init() {
    if (!(await settings.favoriteFriendsEnabled)) return;
    observeElement('.friends-carousel-tile', addUserCardToggle);
}
