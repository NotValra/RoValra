// This is meant to run on all pages incase someone is viewing the code and is worried or something idrk
(function() {
    const newClassName = "icon-logo-r-95";
    const originalSelector = "span.app-icon-bluebg.app-icon-windows.app-icon-size-96";
    const customLogoId = "rovalra-custom-logo";

    function applyOldLogo() {
        const containerElement = document.getElementById("simplemodal-container");
        if (containerElement) {
            const spanElement = containerElement.querySelector(originalSelector);
            if (spanElement) {
                spanElement.className = newClassName;
                return true;
            }
        }
        return false;
    }

    function applyCustomLogo(imageData) {
        const containerElement = document.getElementById("simplemodal-container");
        if (containerElement) {
            const spanElement = containerElement.querySelector(originalSelector);
            if (spanElement) {
                const img = document.createElement("img");
                img.id = customLogoId;
                img.src = imageData;
                img.style.width = "96px"; 
                img.style.height = "96px";
                img.style.objectFit = "contain"; 
                
                spanElement.replaceWith(img);
                return true;
            }
            if (containerElement.querySelector(`#${customLogoId}`)) {
                return true; 
            }
        }
        return false;
    }

    function initRevertLogo() {
        chrome.storage.local.get({ revertLogo: 'NEW', customLogoData: null }, function(settings) {
            const revertLogoSetting = settings.revertLogo;
            const customLogoData = settings.customLogoData;

            if (revertLogoSetting === 'OLD') {
                const callback = function(mutationsList, observerInstance) {
                    if (applyOldLogo()) {
                        
                    }
                };
                const observer = new MutationObserver(callback);
                const config = { childList: true, subtree: true };
                if (!applyOldLogo()) {
                }
                observer.observe(document.body, config);
            } else if (revertLogoSetting === 'CUSTOM') {
                let logoToApply = null;
                if (customLogoData) {
                    logoToApply = customLogoData;
                } else {
                    // If no custom logo is uploaded, use the default RoValra icon.
                    logoToApply = chrome.runtime.getURL("Assets/icon-128.png");
                }

                if (logoToApply) {
                    const callback = function(mutationsList, observerInstance) {
                        if (applyCustomLogo(logoToApply)) {
                        }
                    };
                    const observer = new MutationObserver(callback);
                    const config = { childList: true, subtree: true };
                    if (!applyCustomLogo(logoToApply)) {
                    }
                    observer.observe(document.body, config);
                } else {
                    // This case should ideally not be reached if logic is correct,
                    // but as a fallback, do nothing or revert to a known state if necessary.
                }
            } else if (revertLogoSetting === 'NEW') {
                observerInstance.disconnect();
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initRevertLogo);
    } else {
        initRevertLogo();
    }

})();
