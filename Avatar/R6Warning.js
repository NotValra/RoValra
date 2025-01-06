console.log("ForceR6.js: Script loaded.");

(function() {
    if (!window.location.href.startsWith('https://www.roblox.com/my/avatar')) {
        console.log("ForceR6.js: Not on an avatar page, script will not run.");
        return;
    }

    let observer;
    let modalDetected = false;
     let lastModal = null;
    function setupObserver() {
        modalDetected = false;
         lastModal = null;
        observer = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach(node => {
                       if (node.nodeType === 1 && node.classList.contains('modal-dialog')) {
                            if(node !== lastModal)
                            {
                                console.log("ForceR6.js: Element with class 'modal-dialog' detected.");
                                 attemptClickButton();
                                 lastModal = node
                                  modalDetected = true;
                            }
                        }
                          if(node.nodeType === 1)
                        {
                            const modalElements = node.querySelectorAll('.modal-dialog');
                            if(modalElements.length > 0)
                            {

                                   const modal = modalElements[0];
                                   if(modal !== lastModal)
                                    {
                                         console.log("ForceR6.js: Element with class 'modal-dialog' detected.");
                                        attemptClickButton();
                                        lastModal = modal;
                                        modalDetected = true;

                                     }
                            }
                        }
                    });
                }
                   if(mutation.type === 'attributes')
                {
                   if(mutation.target.nodeType === 1 && mutation.target.classList.contains('modal-dialog'))
                    {
                          if(mutation.target !== lastModal)
                           {
                            console.log("ForceR6.js: Element with class 'modal-dialog' detected.");
                                 attemptClickButton();
                                  lastModal = mutation.target;
                                   modalDetected = true;
                            }

                     }

                }
            }
        });
         observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class']});
    }

    function attemptClickButton() {
        const button = document.getElementById('submit');
        if (button) {
            button.click();
           observer.disconnect();
            setTimeout(setupObserver, 500);
        } else {
            setTimeout(setupObserver, 500);
        }
    }

    setupObserver();
})();