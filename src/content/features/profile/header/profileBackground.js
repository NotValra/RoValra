import { observeElement } from '../../../core/observer.js';
import { getUserIdFromUrl } from '../../../core/idExtractor.js';
import { loadSettings } from '../../../core/settings/handlesettings.js';
import { getUserSettings } from '../../../core/donators/settingHandler.js';

export async function init() {
    try {
        const profileUserId = getUserIdFromUrl();
        if (!profileUserId) return;

        const settings = await loadSettings();
        if (!settings.profileBackgroundGradientEnabled) return;

        const userSettings = await getUserSettings(profileUserId, {
            useDescription: false,
        });

        if (!userSettings?.gradient) return;

        const parts = userSettings.gradient.split(',').map((s) => s.trim());
        if (parts.length < 3) return;

        const color1 = parts[0] || '#667eea';
        const color2 = parts[1] || '#764ba2';
        const fade = parseInt(parts[2], 10) ?? 100;
        const angle = parseInt(parts[3], 10) ?? 135;

        const s1 = (100 - fade) / 2;
        const s2 = 100 - s1;
        const gradient = `linear-gradient(${angle}deg, ${color1} ${s1}%, ${color2} ${s2}%)`;

        observeElement(
            '.profile-header, .profile-avatar-left.profile-avatar-gradient',
            (element) => {
                if (element.classList.contains('profile-header')) {
                    const profileContainer = element.querySelector(
                        '.section-content.profile-header-content',
                    );
                    if (profileContainer) {
                        profileContainer.style.background = gradient;
                        profileContainer.style.backgroundSize = 'cover';
                        profileContainer.style.backgroundPosition = 'center';
                    }

                    const thumbnailHolder = element.querySelector(
                        '.thumbnail-holder.thumbnail-holder-position',
                    );
                    if (thumbnailHolder) {
                        thumbnailHolder.style.background = 'transparent';
                    }
                } else {
                    element.style.background = gradient;
                }
            },
            { multiple: true },
        );
    } catch (error) {
        console.error(
            'RoValra: Profile background gradient init failed',
            error,
        );
    }
}
