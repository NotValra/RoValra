document.getElementById("Show update").addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'showUpdateOverlayFromPopup' }, response => {
        if (response) {
            console.log(response);
        } else {
            console.error("No response received from background script.");
        }
    });
});