import { createOverlay } from '../../core/ui/overlay.js';
import { createButton } from '../../core/ui/buttons.js';
import { getAssets } from '../../core/assets.js';
import DOMPurify from 'dompurify';

export function init() {
    chrome.storage.local.get({ onboardingShown: false }, function(settings) {
        if (!settings.onboardingShown) {
            const bodyContent = document.createElement('div');
            const assets = getAssets();

            bodyContent.innerHTML = `
                <p style="line-height: 1.6; margin-bottom: 15px;">
                    Thank you for installing <strong>RoValra</strong>!
                </p>

                <p style="line-height: 1.6; margin-bottom: 15px;">
                    To change settings and explore all features, you can:
                </p>
                <ul style="list-style-type: disc; margin-left: 20px; margin-bottom: 15px; line-height: 1.6;">
                    <li>Click the <strong>gear icon</strong> in the Roblox header, and then click on "RoValra Setting".</li>
                   
                </ul>

                <img src="${assets.onboarding}" alt="A guide showing where to find the RoValra settings button on the Roblox website." style="max-width: 100%; height: auto; display: block; margin: 5px auto 20px auto; border-radius: 8px; border: 1px solid var(--rovalra-overlay-border-primary, #D9DADB);"/>

                <p style="line-height: 1.6;">
                    RoValra is a forever free Roblox extension trying to provide quality of life to everyone!
                </p>
            `;

            const acknowledgeOnboarding = () => {
                chrome.storage.local.set({ onboardingShown: true }, function() {
                    console.log('RoValra: Onboarding acknowledged and marked as shown.');
                });
            };

            const gotItButton = createButton('Got It!', 'primary');

            const { close } = createOverlay({
                title: 'Welcome to RoValra!',
                bodyContent: bodyContent,
                actions: [gotItButton],
                maxWidth: '550px',
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