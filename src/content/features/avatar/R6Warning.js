import { observeElement } from '../../core/observer.js';

export function init() {
    function injectLayoutStyles() {
        if (document.getElementById('rovalra-avatar-layout-styles')) return;
        const link = document.createElement('link');
        link.id = 'rovalra-avatar-layout-styles';
        link.rel = 'stylesheet';
        link.href = chrome.runtime.getURL('css/avatar-layout.css');
        document.head.appendChild(link);
    }

    function updateAvatarLayout() {
        chrome.storage.local.get({ stickyAvatarEnabled: true }, (settings) => {
            if (
                window.location.pathname.startsWith('/my/avatar') &&
                settings.stickyAvatarEnabled
            ) {
                injectLayoutStyles();
                document.body.classList.add('rovalra-avatar-layout-enabled');
            } else {
                document.body.classList.remove('rovalra-avatar-layout-enabled');
            }
        });
    }
    updateAvatarLayout();
    const _pushState = history.pushState;
    history.pushState = function (...args) {
        _pushState.apply(this, args);
        setTimeout(updateAvatarLayout, 300);
    };
    window.addEventListener('popstate', () =>
        setTimeout(updateAvatarLayout, 300),
    );

    chrome.storage.local.get({ forceR6Enabled: true }, (settings) => {
        if (!settings.forceR6Enabled) {
            return;
        }

        const avatarTypeSwitchSelector =
            '.avatar-type-toggle-scale button[role="switch"]';
        const modalSelector = '.foundation-web-dialog-overlay';
        const viewToggleSelector = '.toggle-three-dee';

        let lastToggleClickTime = 0;

        function forceViewRefresh() {
            const toggleBtn = document.querySelector(viewToggleSelector);
            if (!toggleBtn) return;

            const originalText = toggleBtn.textContent.trim();

            toggleBtn.click();

            setTimeout(() => {
                const currentText = toggleBtn.textContent.trim();
                if (currentText !== originalText) {
                    toggleBtn.click();
                }
            }, 150);
        }

        function handleAvatarTypeSwitchFound(switchEl) {
            if (switchEl.dataset.rovalraR6Patched) return;
            switchEl.dataset.rovalraR6Patched = 'true';

            switchEl.addEventListener(
                'click',
                () => {
                    lastToggleClickTime = Date.now();
                },
                { capture: true },
            );
        }

        function handleModalFound(modal) {
            if (Date.now() - lastToggleClickTime > 500) {
                return;
            }

            const actionButtons = modal.querySelectorAll(
                '.foundation-web-dialog-content button.foundation-web-button',
            );
            const switchBtn =
                modal.querySelector(
                    '.foundation-web-dialog-content button.foundation-web-button.bg-action-emphasis',
                ) ||
                (actionButtons.length > 0
                    ? actionButtons[actionButtons.length - 1]
                    : null);

            if (switchBtn) {
                modal.style.visibility = 'hidden';
                modal.style.opacity = '0';
                modal.style.pointerEvents = 'none';

                switchBtn.click();

                setTimeout(() => {
                    forceViewRefresh();
                }, 200);
            }
        }

        observeElement(avatarTypeSwitchSelector, handleAvatarTypeSwitchFound, {
            multiple: true,
        });
        observeElement(modalSelector, handleModalFound, { multiple: true });
    });
}
