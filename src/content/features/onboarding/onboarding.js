import { createOverlay } from '../../core/ui/overlay.js';
import { createButton } from '../../core/ui/buttons.js';
import { getAssets } from '../../core/assets.js';
import { ts } from '../../core/locale/i18n.js';

export function init() {
    chrome.storage.local.get({ onboardingShown: false }, function(settings) {
        if (!settings.onboardingShown) {
            const bodyContent = document.createElement('div');
            const assets = getAssets();
            bodyContent.style.maxHeight = 'calc(90vh - 150px)';
            bodyContent.style.overflowY = 'auto';

            bodyContent.innerHTML = `
                <p style="line-height: 1.6; margin-bottom: 15px;">
                    ${ts('onboarding.thankYou')}
                </p>

                <p style="line-height: 1.6; margin-bottom: 15px;">
                    ${ts('onboarding.exploreFeatures')}
                </p>
                <ul style="list-style-type: disc; margin-left: 20px; margin-bottom: 15px; line-height: 1.6;">
                    <li>${ts('onboarding.settingsInstruction')}</li>
                   
                </ul>

                <img src="${assets.onboarding}" alt="${ts('onboarding.imageAlt')}" style="max-width: 100%; height: auto; display: block; margin: 5px auto 20px auto; border-radius: 8px; border: 1px solid var(--rovalra-overlay-border-primary, #D9DADB);"/>

                <p style="line-height: 1.6;">
                    ${ts('onboarding.description')}
                </p>
            `;// Verified

            const acknowledgeOnboarding = () => {
                chrome.storage.local.set({ onboardingShown: true }, function() {
                    console.log('RoValra: Onboarding acknowledged and marked as shown.');
                });
            };

            const gotItButton = createButton(ts('onboarding.gotIt'), 'primary');

            const { close } = createOverlay({
                title: ts('onboarding.title'),
                bodyContent: bodyContent,
                actions: [gotItButton],
                maxWidth: 'min(550px, 90vw)',
                showLogo: true,
                preventBackdropClose: true,
                onClose: acknowledgeOnboarding
            });

            gotItButton.addEventListener('click', () => {
                close();
            });
        }
    });
}
