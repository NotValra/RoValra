if (typeof window.myCustomIconInjector === 'undefined') {

    /**
     * Some people might call this bitrate ruiner but there isnt enough for it actually to ruin bitrate 💔
     * Creates a confetti effect from a given element using a specific image.
     * @param {HTMLElement} element The element to use for the confetti source and positioning.
     * @param {string} imageUrl The URL of the image to use for the confetti pieces.
     */
    function createConfetti(element, imageUrl) {
        const rect = element.getBoundingClientRect();
        const confettiContainer = document.createElement('div');
        confettiContainer.style.position = 'fixed';
        confettiContainer.style.left = rect.left + (rect.width / 2) + 'px';
        confettiContainer.style.top = rect.top + (rect.height / 2) + 'px';
        confettiContainer.style.width = '1px';
        confettiContainer.style.height = '1px';
        confettiContainer.style.zIndex = '1000';
        document.body.appendChild(confettiContainer);

        for (let i = 0; i < 100; i++) {
            const confetti = document.createElement('img');
            confetti.src = imageUrl;
            
            confetti.style.position = 'absolute';
            confetti.style.width = '15px';
            confetti.style.height = '15px';
            confetti.style.filter = `hue-rotate(${Math.random() * 360}deg)`;
            confetti.style.opacity = '0';

            const angle = Math.random() * 2 * Math.PI;
            const distance = Math.random() * 150 + 50;
            const duration = Math.random() * 2000 + 1000;

            confetti.animate([
                { transform: 'translate(-50%, -50%) rotate(0deg)', opacity: 1 },
                { transform: `translate(calc(-50% + ${Math.cos(angle) * distance}px), calc(-50% + ${Math.sin(angle) * distance}px)) rotate(720deg)`, opacity: 0 }
            ], {
                duration: duration,
                easing: 'ease-out',
                fill: 'forwards' 
            });
            confettiContainer.appendChild(confetti);
        }

        setTimeout(() => {
            if (document.body.contains(confettiContainer)) {
                document.body.removeChild(confettiContainer);
            }
        }, 3000); 
    }

    function addCustomIcon() {
      const parentContainer = document.querySelector('.profile-header-title-container');

      if (parentContainer && !document.querySelector('.custom-icon-container')) {
        const premiumBadge = document.querySelector('.profile-header-premium-badge');
        const iconContainer = document.createElement('div');
        iconContainer.className = 'custom-icon-container';
        iconContainer.style.position = 'relative'; 
        iconContainer.style.display = 'inline-flex';
        iconContainer.style.alignItems = 'center';
        iconContainer.style.marginLeft = '0px';

        const icon = document.createElement('img');
        icon.src = chrome.runtime.getURL('Assets/icon-128.png');
        icon.className = 'my-custom-profile-icon';
        icon.style.width = '30px';
        icon.style.height = '30px';
        icon.style.cursor = 'default';

        let clickCount = 0;
        icon.addEventListener('click', () => {
            clickCount++;
            if (clickCount === 10) {
                createConfetti(icon, chrome.runtime.getURL('Assets/icon-128.png')); 
                clickCount = 0; 
            }
        });

        const tooltip = document.createElement('span');
        tooltip.textContent = 'Creator of RoValra';
        tooltip.style.visibility = 'hidden';
        tooltip.style.width = '120px';
        tooltip.style.backgroundColor = 'black';
        tooltip.style.color = '#fff';
        tooltip.style.textAlign = 'center';
        tooltip.style.borderRadius = '6px';
        tooltip.style.padding = '5px 0';
        tooltip.style.position = 'absolute';
        tooltip.style.zIndex = '1';
        tooltip.style.bottom = '-200%';
        tooltip.style.left = '50%';
        tooltip.style.marginLeft = '-60px'; 
       
        iconContainer.addEventListener('mouseover', () => { tooltip.style.visibility = 'visible'; });
        iconContainer.addEventListener('mouseout', () => { tooltip.style.visibility = 'hidden'; });

        iconContainer.appendChild(icon);
        iconContainer.appendChild(tooltip);

        if (premiumBadge) {
          parentContainer.insertBefore(iconContainer, premiumBadge);
        } else {
          parentContainer.appendChild(iconContainer);
        }
      }
    }

    function addContributorIcon() {
        const parentContainer = document.querySelector('.profile-header-title-container');

        if (parentContainer && !document.querySelector('.contributor-icon-container')) {
            const premiumBadge = document.querySelector('.profile-header-premium-badge');
            const iconContainer = document.createElement('div');
            iconContainer.className = 'contributor-icon-container';
            iconContainer.style.position = 'relative';
            iconContainer.style.display = 'inline-flex';
            iconContainer.style.alignItems = 'center';
            iconContainer.style.marginLeft = '0px';

            const icon = document.createElement('img');
            icon.src = chrome.runtime.getURL('Assets/icon-128.png');
            icon.className = 'my-contributor-profile-icon';
            icon.style.width = '30px';
            icon.style.height = '30px';
            icon.style.cursor = 'default';
            icon.style.filter = 'sepia(80%) saturate(300%) brightness(90%) hue-rotate(-20deg)';


            let clickCount = 0;
            icon.addEventListener('click', () => {
                clickCount++;
                if (clickCount >= 10) {
                    createConfetti(icon, chrome.runtime.getURL('Assets/icon-128.png'));
                    clickCount = 0;
                }
            });

            const tooltip = document.createElement('span');
            tooltip.textContent = 'RoValra contributor';
            tooltip.style.visibility = 'hidden';
            tooltip.style.width = '140px';
            tooltip.style.backgroundColor = 'black';
            tooltip.style.color = '#fff';
            tooltip.style.textAlign = 'center';
            tooltip.style.borderRadius = '6px';
            tooltip.style.padding = '5px 0';
            tooltip.style.position = 'absolute';
            tooltip.style.zIndex = '1';
            tooltip.style.bottom = '-200%';
            tooltip.style.left = '50%';
            tooltip.style.marginLeft = '-70px';

            iconContainer.addEventListener('mouseover', () => { tooltip.style.visibility = 'visible'; });
            iconContainer.addEventListener('mouseout', () => { tooltip.style.visibility = 'hidden'; });

            iconContainer.appendChild(icon);
            iconContainer.appendChild(tooltip);

            if (premiumBadge) {
                parentContainer.insertBefore(iconContainer, premiumBadge);
            } else {
                parentContainer.appendChild(iconContainer);
            }
        }
    }

    function addGilbertBadge() {
        const badgesList = document.querySelector('#roblox-badges-container .badge-list');

        if (badgesList && !document.querySelector('[data-testid="custom-badge-gilbert"]')) {
            const badgeItem = document.createElement('li');
            badgeItem.className = 'list-item asset-item';
            badgeItem.setAttribute('data-testid', 'custom-badge-gilbert');
            const iconUrl = chrome.runtime.getURL('Assets/icon-128.png');
            const badgeLink = document.createElement('a');
            badgeLink.href = "#";
            badgeLink.title = "Creator of RoValra";
            badgeLink.style.cursor = 'pointer';
            badgeLink.innerHTML = `
                <span class="border asset-thumb-container" 
                    style="display: inline-block; width: 140px; height: 140px; background-image: url('${iconUrl}'); background-size: contain; background-repeat: no-repeat; background-position: center;" 
                    title="Gilbert">
                </span>
                <span class="font-header-2 text-overflow item-name">Gilbert</span>
            `;
            badgeLink.addEventListener('click', (event) => {
                event.preventDefault();
                const badgeImage = badgeLink.querySelector('.asset-thumb-container');
                if (badgeImage) {
                    createConfetti(badgeImage, chrome.runtime.getURL('Assets/icon-128.png'));
                }
            });
            badgeItem.appendChild(badgeLink);
            badgesList.appendChild(badgeItem);
        }
    }


    function addRatBadge() {
        const badgesList = document.querySelector('#roblox-badges-container .badge-list');

        if (badgesList && !document.querySelector('[data-testid="custom-badge-rat"]')) {
            const badgeItem = document.createElement('li');
            badgeItem.className = 'list-item asset-item';
            badgeItem.setAttribute('data-testid', 'custom-badge-rat');
            const iconUrl = chrome.runtime.getURL('Assets/return_request.png');
            const badgeLink = document.createElement('a');
            badgeLink.href = "#";
            badgeLink.title = "I make rats";
            badgeLink.style.cursor = 'pointer';
            badgeLink.innerHTML = `
                <span class="border asset-thumb-container" 
                    style="display: inline-block; width: 140px; height: 140px; background-image: url('${iconUrl}'); background-size: contain; background-repeat: no-repeat; background-position: center;" 
                    title="I make rats">
                </span>
                <span class="font-header-2 text-overflow item-name">I make rats</span>
            `;
            badgeLink.addEventListener('click', (event) => {
                event.preventDefault();
                const badgeImage = badgeLink.querySelector('.asset-thumb-container');
                if (badgeImage) {
                    createConfetti(badgeImage, chrome.runtime.getURL('Assets/fishstrap.png'));
                }
            });
            badgeItem.appendChild(badgeLink);
            badgesList.appendChild(badgeItem);
        }
    }


    function applyProfileModifications() {
        const specialUserIds = ['1337447242', '109176680', '795922138', '8345351117']; // Contributors. if you feel like you deserve this badge lmk. Feature suggestions or bug reports dont quality for it, unless done a lot ig

        chrome.storage.local.get(['ShowBadgesEverywhere', 'RoValraBadgesEnable'], function(result) {
            const currentUrl = window.location.href;

            const isSpecialUser = specialUserIds.some(id => currentUrl.includes(id));

            if (isSpecialUser) {
                addContributorIcon(); 
            }

            if (result.ShowBadgesEverywhere === true) {
                addCustomIcon();
                addGilbertBadge();
                addRatBadge();
                
            } else {
                if (currentUrl.includes('447170745')) {
                    addCustomIcon();
                }

                if (result.RoValraBadgesEnable === true) {
                    if (currentUrl.includes('447170745')) {
                        addGilbertBadge();
                    } else if (currentUrl.includes('477516666')) {
                        addRatBadge();
                    }
                }
            }
        });
    }

    applyProfileModifications();

    const observer = new MutationObserver((mutationsList) => {
        for(const mutation of mutationsList) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                applyProfileModifications();
                break;
            }
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    window.myCustomIconInjector = true;
}