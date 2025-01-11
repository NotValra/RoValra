(function() {
    const currentURL = window.location.href;
      const avatarPathRegex = /\/my\/avatar$/;
      if (!avatarPathRegex.test(currentURL)) {
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
                              if (node !== lastModal) {
                                  attemptClickButton();
                                  lastModal = node;
                                  modalDetected = true;
                              }
                          }
                          if (node.nodeType === 1) {
                              const modalElements = node.querySelectorAll('.modal-dialog');
                              if (modalElements.length > 0) {
                                  const modal = modalElements[0];
                                  if (modal !== lastModal) {
                                      attemptClickButton();
                                      lastModal = modal;
                                      modalDetected = true;
                                  }
                              }
                          }
                      });
                  }
                  if (mutation.type === 'attributes') {
                      if (mutation.target.nodeType === 1 && mutation.target.classList.contains('modal-dialog')) {
                          if (mutation.target !== lastModal) {
                              attemptClickButton();
                              lastModal = mutation.target;
                              modalDetected = true;
                          }
                      }
                  }
              }
          });
          observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
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