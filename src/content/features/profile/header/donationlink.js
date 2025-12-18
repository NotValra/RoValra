import { observeElement } from '../../../core/observer.js';
import { createOverlay } from '../../../core/ui/overlay.js';
import { launchMultiplayerGame } from '../../../core/utils/launcher.js';
import { getUsernameFromPageData } from '../../../core/utils.js';
import { getOrCreateRovalraContainer } from './rap.js';
import { createProfileHeaderButton } from '../../../core/ui/profile/header/button.js';

function addDonationButton(observedElement) {
    const buttonIdentifier = 'rovalra-donation-button';
    const targetContainer = getOrCreateRovalraContainer(observedElement);

    if (!targetContainer) return;
    if (targetContainer.querySelector(`.${buttonIdentifier}`)) return;

    function showDonationOverlay() {
        const username = getUsernameFromPageData();
        if (!username) {
            alert('Could not determine the username for the donation.');
            return;
        }

        const bodyContent = document.createElement('div');
        bodyContent.innerHTML = `
            <p style="line-height: 1.6; white-space: pre-line; font-size: 14px; font-weight: 600;">
                This will launch "PLS DONATE" where you can give an offline donation.

                Due to fees from Roblox (30%) and the game (10%), the user receives 60% of the donated amount.

                Upon joining, the "Offline Donations" UI will appear with their username pre-filled. Simply click the gift button to open their stand and purchase a gamepass to donate.
            </p>
        `;

        const continueButton = document.createElement('button');
        continueButton.innerText = 'Join Pls Donate';
        Object.assign(continueButton.style, { padding: '10px 20px', border: 'none', borderRadius: '8px', backgroundColor: '#04ff00ff', color: '#181818ff', fontWeight: '600', cursor: 'pointer', transition: 'background-color 0.2s', fontSize: '14px' });
        continueButton.addEventListener('mouseenter', () => continueButton.style.backgroundColor = '#00e600');
        continueButton.addEventListener('mouseleave', () => continueButton.style.backgroundColor = '#04ff00ff');

        const goBackButton = document.createElement('button');
        goBackButton.innerText = 'Go Back';
        goBackButton.className = 'btn-control-md rovalra-btn-cancel';

        const { close } = createOverlay({
            title: 'Pls Donate',
            bodyContent: bodyContent,
            actions: [goBackButton, continueButton],
            maxWidth: '480px'
        });

        continueButton.addEventListener('click', () => {
            close();
            const PLS_DONATE_PLACE_ID = 8737602449;
            const giftData = JSON.stringify({ giftTarget: username });
            launchMultiplayerGame(PLS_DONATE_PLACE_ID, giftData);
        });
        goBackButton.onclick = close;
    }

    const robuxIcon = document.createElement('span');
    robuxIcon.className = 'icon-robux-16x16';
    Object.assign(robuxIcon.style, {
        filter: 'brightness(0)',
    });

    const buttonText = document.createElement('span');
    buttonText.innerText = 'Donate';
    buttonText.style.color = '#181818ff';

    const donationButton = createProfileHeaderButton({
        id: buttonIdentifier,
        content: [robuxIcon, buttonText],
        backgroundColor: '#04ff00ff',
        onClick: (event) => {
            event.preventDefault();
            showDonationOverlay();
        }
    });

    targetContainer.appendChild(donationButton);
}

export function init() {
    chrome.storage.local.get({ donationbuttonEnable: true }, function(data) {
        if (data.donationbuttonEnable) {
            observeElement('.flex-nowrap.gap-small.flex, .profile-header-names', addDonationButton, { multiple: true });
        }
    });
}