// Very work in progress, not done yet.
const detectAndAddSaveButton = () => {
    console.log("Starting to detect the purchase modal.");

    if (!document.body) {
        console.error("Document body is not ready yet. Cannot observe.");
        return;
    }

    const observer = new MutationObserver((mutationsList, observer) => {
        console.log("Mutation detected on the document body.");

        for (const mutation of mutationsList) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                const modal = document.querySelector('.modal-window.modal-sm.modal-dialog');

                if (modal && !modal.querySelector('.btn-save-robux')) {
                    console.log("Purchase modal found. Proceeding to add the 'Save Robux' button.");
                    addSaveButton(modal);
                    console.log("Observer disconnected after finding the modal.");
                    return;
                }
            }
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    console.log("MutationObserver is now active, watching for changes.");
};


const addSaveButton = (modal) => {
    console.log("addSaveButton function called.");

    const buyNowButton = modal.querySelector('.modal-button.btn-primary-md.btn-min-width');
    const robuxPriceElement = modal.querySelector('.modal-body .text-robux');
    const buttonContainer = modal.querySelector('.modal-footer .modal-buttons');

    if (!buyNowButton || !robuxPriceElement || !buttonContainer) {
        console.error("Required elements for save button not found in the modal.");
        return;
    }

    const currentUrl = window.location.href;
    const urlParts = currentUrl.match(/(?:catalog|bundles)\/(\d+)/);
    let assetId = null;
    let purchaseType = '1'; 

    if (urlParts && urlParts[1]) {
        assetId = urlParts[1];
        if (currentUrl.includes('/bundles/')) {
            purchaseType = '3';
        }
    }

    if (!assetId) {
        console.error("Could not extract asset ID from the URL:", currentUrl);
        return;
    }

    const robuxPriceText = robuxPriceElement.textContent;
    const robuxPrice = parseInt(robuxPriceText.replace(/,/g, ''), 10);

    if (!isNaN(robuxPrice)) {
        const savings = Math.round(robuxPrice * 0.40);

        const saveButton = document.createElement('button');
        saveButton.textContent = `Save ${savings} Robux`;
        saveButton.type = 'button';
        saveButton.className = 'modal-button btn-control-md btn-min-width btn-save-robux';

        saveButton.addEventListener('click', () => {
            saveButton.disabled = true;
            saveButton.textContent = 'Launching...';

            const placeId = 17222553211; // for now we use a set place id, but a user will be able to use their own place id

            const launchData = `${assetId}`;


            window.open(`roblox://placeId=${placeId}&launchData=${launchData}`);
            
            console.log("Attempting to launch Roblox with URL:", launchUrl);

            setTimeout(() => {
            }, 2000); 

            setTimeout(() => {
                saveButton.textContent = `Save ${savings} Robux`;
                saveButton.disabled = false;
                const closeButton = modal.querySelector('.modal-header .modal-close-btn');
                if (closeButton) {
                    closeButton.click();
                }
            }, 1500);
        });

        buttonContainer.insertBefore(saveButton, buyNowButton);
        console.log("'Save Robux' button has been inserted into the modal.");
    } else {
        console.error("Could not parse Robux price from:", robuxPriceText);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    detectAndAddSaveButton();
});