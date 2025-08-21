(function() {
    const muiModalSelector = 'div[role="presentation"].MuiDialog-root';
    const uibModalSelector = 'div[uib-modal-window="modal-window"]';

    const buttonTextToFind = 'switch';
    const buttonIdToFind = 'submit';
    const maxCycles = 50;

    let observer;

    function setupObserver() {
        if (observer) {
            observer.disconnect();
        }

        observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.addedNodes.length === 0) continue;

                for (const node of mutation.addedNodes) {
                    if (node.nodeType !== Node.ELEMENT_NODE) continue;

                    let foundModal = null;

                    if (node.matches(muiModalSelector) || node.matches(uibModalSelector)) {
                        foundModal = node;
                    } else {
                        foundModal = node.querySelector(muiModalSelector) || node.querySelector(uibModalSelector);
                    }

                    if (foundModal) {
                        observer.disconnect();
                        const originalDisplay = foundModal.style.display;
                        foundModal.style.display = 'none';
                        findAndClickInModal(foundModal, originalDisplay);
                        return;
                    }
                }
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    function findAndClickInModal(modalRootNode, originalDisplay) {
        let cycles = 0;
        let animationFrameId;

        function checkAndClick() {
            if (cycles >= maxCycles) {
                modalRootNode.style.display = originalDisplay; 
                setupObserver();
                cancelAnimationFrame(animationFrameId);
                return;
            }

            let targetButton = modalRootNode.querySelector(`button#${buttonIdToFind}`);

            if (!targetButton) {
                const allButtons = modalRootNode.querySelectorAll('button');
                targetButton = Array.from(allButtons).find(btn => btn.textContent.trim().toLowerCase() === buttonTextToFind);
            }


            if (targetButton && !targetButton.disabled) {
                targetButton.click();
                setTimeout(setupObserver, 500);
                cancelAnimationFrame(animationFrameId);
            } else {
                cycles++;
                animationFrameId = requestAnimationFrame(checkAndClick);
            }
        }

        animationFrameId = requestAnimationFrame(checkAndClick);
    }

    setupObserver();
})();