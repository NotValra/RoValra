(function() {
    const newClassName = "icon-logo-r-95";
    const originalSelector = "span.app-icon-bluebg.app-icon-windows.app-icon-size-96";
    const newSelector = "div.MuiGrid-root div.app-icon-bluebg.app-icon-windows";
    const muiDialogSelector = "div.MuiPaper-root.MuiDialog-paper";
    const customLogoId = "rovalra-custom-logo";

    function getLogoSize(element) {
        let size = {
            width: "96px",
            height: "96px"
        };
        
        const dialogParent = element.closest(muiDialogSelector);
        if (dialogParent) {
            size = {
                width: "64px",
                height: "64px"
            };
            
            if (dialogParent.querySelector(".web-blox-css-tss-1o0wd2v-root")) {
                size = {
                    width: "60px",
                    height: "60px"
                };
            }
        }
        
        return size;
    }

    function checkAndFixOldIcons() {
        const oldIcons = document.querySelectorAll(`.${newClassName}`);
        oldIcons.forEach(icon => {
            const size = getLogoSize(icon);
            icon.style.width = size.width;
            icon.style.height = size.height;
            icon.style.objectFit = "contain";
            icon.style.backgroundSize = "contain";
        });

        setTimeout(checkAndFixOldIcons, 1000);
    }

    function applyOldLogo() {
        const containerElement = document.getElementById("simplemodal-container");
        if (containerElement) {
            const spanElement = containerElement.querySelector(originalSelector);
            if (spanElement) {
                spanElement.className = newClassName;
                const size = getLogoSize(spanElement);
                spanElement.style.width = size.width;
                spanElement.style.height = size.height;
                return true;
            }
        }

        const muiElement = document.querySelector(newSelector);
        if (muiElement) {
            muiElement.className = newClassName;
            const size = getLogoSize(muiElement);
            muiElement.style.width = size.width;
            muiElement.style.height = size.height;
            
            muiElement.style.objectFit = "contain";
            muiElement.style.backgroundSize = "contain";
            return true;
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
                
                const size = getLogoSize(spanElement);
                img.style.width = size.width; 
                img.style.height = size.height;
                img.style.objectFit = "contain"; 
                
                spanElement.replaceWith(img);
                return true;
            }
            if (containerElement.querySelector(`#${customLogoId}`)) {
                return true; 
            }
        }

        const muiElement = document.querySelector(newSelector);
        if (muiElement) {
            const parentElement = muiElement.parentElement;
            if (parentElement && parentElement.querySelector(`#${customLogoId}`)) {
                return true;
            }
            
            const img = document.createElement("img");
            img.id = customLogoId;
            img.src = imageData;
            
            const size = getLogoSize(muiElement);
            img.style.width = size.width; 
            img.style.height = size.height;
            img.style.objectFit = "contain"; 
            
            muiElement.replaceWith(img);
            return true;
        }

        const existingLogo = document.getElementById(customLogoId);
        if (existingLogo) {
            const size = getLogoSize(existingLogo);
            existingLogo.style.width = size.width;
            existingLogo.style.height = size.height;
            return true;
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
                
                checkAndFixOldIcons();
            } else if (revertLogoSetting === 'CUSTOM') {
                let logoToApply = null;
                if (customLogoData) {
                    logoToApply = customLogoData;
                } else {
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
                }
            } else if (revertLogoSetting === 'NEW') {
            }
        });
    }

    let observerInstance;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initRevertLogo);
    } else {
        initRevertLogo();
    }

})();
