(function() {
    const newClassName = "icon-logo-r-95";
    const originalSelector = "span.app-icon-bluebg.app-icon-windows.app-icon-size-96";
    const newSelector = "div.MuiGrid-root div.app-icon-bluebg.app-icon-windows";
    const rosealStartup = '.app-icon-windows.app-icon-bluebg'
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

    function applyOldLogo() {
        const targets = [
            document.getElementById("simplemodal-container")?.querySelector(originalSelector),
            document.querySelector(newSelector),
            document.querySelector(rosealStartup)
        ].filter(Boolean); 

        for (const element of targets) {
            if (element && element.id !== customLogoId) {
                element.className = newClassName;
                const size = getLogoSize(element);
                element.style.width = size.width;
                element.style.height = size.height;
                element.style.objectFit = "contain";
                element.style.backgroundSize = "contain";
                return true;
            }
        }
        return false;
    }

    function applyCustomLogo(imageData) {
        const targets = [
            document.getElementById("simplemodal-container")?.querySelector(originalSelector),
            document.querySelector(newSelector),
            document.querySelector(rosealStartup)
        ].filter(Boolean);
        
        let applied = false;

        for (const element of targets) {
            if (element) {
                if (element.id === customLogoId) {
                    const size = getLogoSize(element);
                    element.style.width = size.width;
                    element.style.height = size.height;
                    applied = true;
                    continue;
                }

                const img = document.createElement("img");
                img.id = customLogoId;
                img.src = imageData;
                
                const size = getLogoSize(element);
                img.style.width = size.width; 
                img.style.height = size.height;
                img.style.objectFit = "contain"; 
                
                element.replaceWith(img);
                applied = true;
            }
        }
        return applied;
    }

    function handleLogoMutation(mutationHandler, targetSelectors) {
        return function(mutationsList) {
            for (const mutation of mutationsList) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    let foundRelevantNode = false;

                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === 1) { 
                            if (targetSelectors.some(selector => node.matches(selector) || node.querySelector(selector))) {
                                foundRelevantNode = true;
                                break;
                            }
                        }
                    }

                    if (foundRelevantNode) {
                        if (mutationHandler()) {
                            break;
                        }
                    }
                }
            }
        };
    }

    function initRevertLogo() {
        chrome.storage.local.get({ revertLogo: 'NEW', customLogoData: null }, function(settings) {
            const revertLogoSetting = settings.revertLogo;
            const customLogoData = settings.customLogoData;

            let mutationHandler;
            const targetSelectors = [originalSelector, newSelector, rosealStartup];
            
            if (revertLogoSetting === 'OLD') {
                mutationHandler = applyOldLogo;
            } else if (revertLogoSetting === 'CUSTOM') {
                let logoToApply = customLogoData || chrome.runtime.getURL("Assets/icon-128.png");
                mutationHandler = () => applyCustomLogo(logoToApply);
            } else {
                return;
            }

            mutationHandler();

            const observerCallback = handleLogoMutation(mutationHandler, targetSelectors);
            const observer = new MutationObserver(observerCallback);
            const config = { childList: true, subtree: true };

            observer.observe(document.body, config);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initRevertLogo);
    } else {
        initRevertLogo();
    }

})();