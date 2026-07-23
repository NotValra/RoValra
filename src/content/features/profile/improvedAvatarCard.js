import { observeElement } from '../../core/observer.js';
import { loadSettings } from '../../core/settings/handlesettings.js';

const PROFILE_AVATAR_SELECTOR =
    '.user-profile-header-details-avatar-container .avatar.avatar-card-fullbody';
const AVATAR_CLASS = 'rovalra-improved-avatar-card';

export async function init() {
    try {
        const settings = await loadSettings();
        if (!settings.improvedAvatarCard) return;

        observeElement(
            PROFILE_AVATAR_SELECTOR,
            (avatar) => avatar.classList.add(AVATAR_CLASS),
            { multiple: true },
        );
    } catch (error) {
        console.error('RoValra: Improved avatar card init failed', error);
    }
}
