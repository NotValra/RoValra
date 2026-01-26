import { observeElement } from '../../../core/observer.js';
import { addTooltip } from '../../../core/ui/tooltip.js';
import { createConfetti } from '../../../core/fun/confetti.js';
import { BADGE_CONFIG } from '../../../core/configs/badges.js';
import DOMPurify from 'dompurify';


function createHeaderBadge(parentContainer, badge) {
    const iconContainer = document.createElement('div');
    iconContainer.className = 'rovalra-header-badge';
    Object.assign(iconContainer.style, {
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        marginLeft: '8px',
        verticalAlign: 'middle'
    });

    const icon = document.createElement('img');
    icon.src = badge.icon;
    Object.assign(icon.style, {
        width: 'var(--icon-size-large)',
        height: 'var(--icon-size-large)',
        cursor: 'pointer',
        ...badge.style
    });

    if (badge.confetti) {
        icon.addEventListener('click', () => createConfetti(icon, badge.confetti));
    }

    if (badge.tooltip) {
        addTooltip(iconContainer, badge.tooltip, { position: 'bottom' });
    }

    parentContainer.appendChild(iconContainer);
    iconContainer.appendChild(icon);
}


function createProfileBadge(badgeList, badge) {
    const badgeItem = document.createElement('li');
    badgeItem.className = 'list-item asset-item';

    const badgeLink = document.createElement('a');
    badgeLink.href = '#'; 
    badgeLink.title = badge.tooltip || badge.name;
    badgeLink.style.cursor = 'pointer';
    badgeLink.addEventListener('click', (e) => {
        e.preventDefault(); 
        if (badge.confetti) {
            createConfetti(thumbSpan, badge.confetti);
        }
    });

    const thumbSpan = document.createElement('span');
    thumbSpan.className = 'asset-thumb-container border';
    thumbSpan.className = 'border asset-thumb-container';
    thumbSpan.title = badge.name;
    thumbSpan.style.height = '140px';
    thumbSpan.style.display = 'block';
    thumbSpan.style.backgroundSize = 'contain';
    thumbSpan.style.backgroundRepeat = 'no-repeat';
    thumbSpan.style.backgroundPosition = 'center';

    const thumbImage = document.createElement('img');
    thumbImage.src = badge.icon;
    thumbImage.style.height = '140px'; 
    thumbSpan.appendChild(thumbImage);

    const nameContainer = document.createElement('span');
    nameContainer.className = 'item-name-container text-overflow';
    nameContainer.style.textAlign = 'left'; 
    nameContainer.innerHTML = DOMPurify.sanitize(`<span class="font-header-2 text-overflow item-name">${badge.name}</span>`);

    badgeLink.append(thumbSpan, nameContainer);
    badgeItem.appendChild(badgeLink);
    badgeList.prepend(badgeItem); 
}


function addHeaderBadges(nameContainer) {
    if (nameContainer.dataset.rovalraHeaderObserverAttached) return;
    nameContainer.dataset.rovalraHeaderObserverAttached = 'true';

    const parentContainer = nameContainer.parentElement;
    if (!parentContainer) return;

    const uniqueId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    nameContainer.dataset.rovalraId = uniqueId;

    const reapplyBadges = () => {
        parentContainer.querySelectorAll('.rovalra-header-badge').forEach(badge => badge.remove());

        const userIdMatch = window.location.pathname.match(/\/users\/(\d+)/);
        if (!userIdMatch) return;
        const currentUserId = userIdMatch[1];

        chrome.storage.local.get({ ShowBadgesEverywhere: false }, (settings) => {
            for (const key in BADGE_CONFIG) {
                const badge = BADGE_CONFIG[key];
                if (badge.type === 'header' && badge.userIds.includes(currentUserId)) {
                    createHeaderBadge(nameContainer, badge);
                }
            }
        });
    };

    reapplyBadges(); 

    observeElement(`[data-rovalra-id="${uniqueId}"] .rovalra-header-badge`, () => {}, {
        onRemove: () => {
            if (!nameContainer.querySelector('.rovalra-header-badge')) reapplyBadges();
        }
    });
}


function addProfileBadges(badgeList) {
    if (badgeList.dataset.rovalraProfileBadgesProcessed) return;
    badgeList.dataset.rovalraProfileBadgesProcessed = 'true';

    const userIdMatch = window.location.pathname.match(/\/users\/(\d+)/);
    if (!userIdMatch) return;
    const currentUserId = userIdMatch[1];

    chrome.storage.local.get({ ShowBadgesEverywhere: false }, (settings) => {
        for (const key in BADGE_CONFIG) {
            const badge = BADGE_CONFIG[key];
            if (badge.type === 'badge' && (badge.alwaysShow || settings.ShowBadgesEverywhere || badge.userIds.includes(currentUserId))) {
                if (badge.userIds.includes(currentUserId)) {
                    createProfileBadge(badgeList, badge);
                }
            }
        }
    });
}

export function init() {
    chrome.storage.local.get({ RoValraBadgesEnable: true }, (settings) => {
        if (settings.RoValraBadgesEnable) {
            observeElement('#profile-header-title-container-name', addHeaderBadges);
            observeElement('.profile-header-title-container', addHeaderBadges);
            observeElement('ul.hlist.badge-list', addProfileBadges);
        }
    });
}
