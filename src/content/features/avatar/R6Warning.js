import { observeElement } from '../../core/observer.js';

export function init() {
    chrome.storage.local.get({ forceR6Enabled: true }, (settings) => {
        if (!settings.forceR6Enabled) {
            return;
        }

        const toggleGroupSelector = '.avatar-type-contents-container .MuiToggleButtonGroup-root';
        const modalSelector = 'div[role="presentation"].MuiDialog-root';
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


        function handleToggleGroupFound(groupContainer) {
            if (groupContainer.dataset.rovalraR6Patched) return;
            groupContainer.dataset.rovalraR6Patched = 'true';

            const buttons = groupContainer.querySelectorAll('button');

            buttons.forEach(btn => {
                btn.addEventListener('click', () => {
                    lastToggleClickTime = Date.now();
                    
          
                    buttons.forEach(b => {
                        const isSelected = b === btn;
                        b.setAttribute('aria-pressed', isSelected);
                        if(isSelected) b.classList.add('selected', 'Mui-selected');
                        else b.classList.remove('selected', 'Mui-selected');
                    });

                }, { capture: true });
            });
        }


        function handleModalFound(modal) {

            if (Date.now() - lastToggleClickTime > 500) {
                return;
            }

            const allButtons = modal.querySelectorAll('button');
            const switchBtn = Array.from(allButtons).find(
                b => b.textContent.trim().toLowerCase() === 'switch'
            ) || (allButtons.length > 0 ? allButtons[allButtons.length - 1] : null);

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

        observeElement(toggleGroupSelector, handleToggleGroupFound, { multiple: true });
        observeElement(modalSelector, handleModalFound, { multiple: true });
    });
}