import { observeElement } from '../../core/observer.js';

const applyImpersonateAttribute = (headerContainer) => {
    chrome.storage.local.get('impersonateRobloxStaffSetting', function (data) {
        if (data.impersonateRobloxStaffSetting) {
            headerContainer.setAttribute('data-mayimpersonate', 'true');
        }
    });
};

const applyHeaderFix = (profileHeader) => {
    if (profileHeader.dataset.headerFixApplied) return;
    profileHeader.dataset.headerFixApplied = 'true';

    const headerNames = profileHeader.querySelector('.profile-header-names');
    const headerDetails = profileHeader.querySelector('.profile-header-details');
    const headerMain = profileHeader.querySelector('.profile-header-main');
    const headerButtons = profileHeader.querySelector('.profile-header-buttons');
    const headerMisc = profileHeader.querySelector('.header-misc');

    if (headerNames && headerDetails && headerMain && headerButtons) {
        if (headerNames.parentElement !== headerMain) {
            headerMain.insertBefore(headerNames, headerButtons);
        }

        if (headerMisc) {
            headerNames.appendChild(headerMisc);
        }

        if (headerDetails.parentElement !== profileHeader) {
            profileHeader.appendChild(headerDetails);
        }
        const css = `
            .profile-avatar-thumb { width: 128px !important; height: 128px !important; }
            .profile-header-main { margin-bottom: 0 !important; }
            .profile-header-details { padding: 0 !important; padding-bottom: 24px !important; }
            .profile-header-social-counts { padding-left: 167px; box-sizing: border-box; }
            .profile-header-names { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }
            .header-misc { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
            @media (max-width: 768px) { .profile-header-social-counts { padding-left: 0; } }
        `;
        const style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);

        console.log("CSS Fixer: Header fix applied successfully.");
    }
};

const applyHomeHeaderLinkFix = () => {
    chrome.storage.local.get('giantInvisibleLink', function(settings) {
        if (!settings.giantInvisibleLink || window.location.pathname !== '/home') {
            return;
        }

        const selector = 'a[data-testid="section-header-title-subtitle-container"]';

        observeElement(selector, (anchor) => {
            if (anchor.dataset.rovalraLinkFixApplied) return;
            anchor.dataset.rovalraLinkFixApplied = 'true';

            const innerDiv = anchor.querySelector('div[data-testid="text-icon-row"]');
            if (!innerDiv) return;

            const newAnchor = document.createElement('a');
            newAnchor.href = anchor.href;
            newAnchor.className = 'css-j5e4nw-textIconRow';
            newAnchor.setAttribute('aria-label', anchor.getAttribute('aria-label'));
            newAnchor.style.display = 'inline-flex';
            newAnchor.style.width = 'fit-content';
            newAnchor.style.minWidth = 'fit-content';

            while (innerDiv.firstChild) {
                newAnchor.appendChild(innerDiv.firstChild);
            }

            anchor.replaceWith(newAnchor);
        }, { multiple: true });
    });
};

const applyGameTitleFix = () => {
    chrome.storage.local.get('gameTitleIssueEnable', function(settings) {
        if (!settings.gameTitleIssueEnable) return;

        if (!window.location.href.includes('profile')) return;

        const css = `
            .slide-item-name.games.font-title {
                line-height: normal !important;
            }
        `;
        const style = document.createElement('style');
        style.textContent = css;
        (document.head || document.documentElement).appendChild(style);
    });
};

const applyCartRemoveButtonFix = () => {
    chrome.storage.local.get('FixCartRemoveButton', function(settings) {
        if (!settings.FixCartRemoveButton) return;

        const css = `
            .cart-item-container .rm-item-btn-container.icon-actions-clear-sm button {
                width: 18px;
                height: 18px;
            }
        `;
        const style = document.createElement('style');
        style.textContent = css;
        (document.head || document.documentElement).appendChild(style);
    });
};

export function init() {
    chrome.storage.local.get(['cssfixesEnabled', 'giantInvisibleLink'], function(data) {
        if (data.cssfixesEnabled === true) {
            observeElement('#profile-header-container', applyImpersonateAttribute);
            observeElement('.profile-header', applyHeaderFix);
            applyHomeHeaderLinkFix();
            applyGameTitleFix();
            applyCartRemoveButtonFix();
        }
    });
}