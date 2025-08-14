(function() {
    'use strict';


    chrome.storage.local.get('cssfixesEnabled', function(data) {
        if (data.cssfixesEnabled) {

            if (window.headerFixApplied) {
                return;
            }
            window.headerFixApplied = true;

            const main = () => {
                const injectCustomCss = () => {
                    const css = `
                        .profile-avatar-thumb {
                            width: 128px !important;
                            height: 128px !important;
                        }

                        .profile-header-main {
                            margin-bottom: 0 !important;
                        }

                        .profile-header-details {
                            padding: 0 !important;
                            padding-bottom: 24px !important;
                        }

                        .header-misc {
                            display: none !important;
                        }

                        .profile-header-social-counts {
                            padding-left: 167px;
                            box-sizing: border-box;
                        }

                        @media (max-width: 768px) {
                            .profile-header-social-counts {
                                padding-left: 0;
                            }
                        }
                    `;
                    const style = document.createElement('style');
                    style.textContent = css;
                    document.head.appendChild(style);
                };

                injectCustomCss();

                const rearrangeHeaderElements = () => {
                    const headerNames = document.querySelector('.profile-header-names');
                    const headerDetails = document.querySelector('.profile-header-details');
                    const headerMain = document.querySelector('.profile-header-main');
                    const headerButtons = document.querySelector('.profile-header-buttons');
                    const profileHeader = document.querySelector('.profile-header');
                    
                    if (headerNames && headerDetails && headerMain && headerButtons && profileHeader) {
                        if (headerNames.parentElement !== headerMain) {
                            headerMain.insertBefore(headerNames, headerButtons);
                        }
                        if (headerDetails.parentElement !== profileHeader) {
                            profileHeader.appendChild(headerDetails);
                        }
                        return true;
                    }
                    return false;
                };

                const observer = new MutationObserver((mutationsList, obs) => {
                    if (rearrangeHeaderElements()) {
                        obs.disconnect();
                    }
                });

                observer.observe(document.body, {
                    childList: true,
                    subtree: true
                });
            };

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', main);
            } else {
                main();
            }
        }
    });
})();