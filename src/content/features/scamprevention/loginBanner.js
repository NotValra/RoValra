import { observeElement } from '../../core/observer.js';

export function init() {
    chrome.storage.local.get({ loginBannerEnabled: true }, (settings) => {
        if (!settings.loginBannerEnabled) return;

        const hostname = window.location.hostname;
        if (hostname !== 'www.roblox.com' && hostname !== 'roblox.com') {
            return;
        }

        let interval;
        let observer;

        const stopTrying = () => {
            if (interval) clearInterval(interval);
            if (observer && typeof observer.disconnect === 'function')
                observer.disconnect();
        };

        const addBanner = () => {
            const loginWrapper = document.querySelector(
                '.login-content-wrapper',
            );

            if (!loginWrapper) {
                return;
            }

            if (document.querySelector('.rovalra-login-banner')) {
                stopTrying();
                return;
            }

            const banner = document.createElement('div');
            banner.className = 'rovalra-login-banner';
            Object.assign(banner.style, {
                backgroundColor: 'var(--rovalra-container-background-color)',
                color: 'var(--rovalra-main-text-color)',
                padding: '20px',
                marginBottom: '20px',
                textAlign: 'center',
                fontSize: '16px',
                fontWeight: '700',
                lineHeight: '1.5',
            });

            banner.textContent =
                'This is the real login page, if you do not see this banner when logging in then you are on a fake Roblox.com. This banner is added by RoValra';

            loginWrapper.prepend(banner);
            stopTrying();
        };

        interval = setInterval(addBanner, 100);

        observer = observeElement('.login-content-wrapper', addBanner);
    });
}
