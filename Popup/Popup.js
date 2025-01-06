document.addEventListener('DOMContentLoaded', async () => {
    const itemSalesCheckbox = document.getElementById('enableItemSales');
    const groupGamesCheckbox = document.getElementById('enableGroupGames');
    const userGamesCheckbox = document.getElementById('enableUserGames');
    const userSniperCheckbox = document.getElementById('enableUserSniper');
    const regionSelectorCheckbox = document.getElementById('enableRegionSelector');
    const subplacesCheckbox = document.getElementById('enableSubplaces');
    const forceR6Checkbox = document.getElementById('enableForceR6');
    const r6FixCheckbox = document.getElementById('enableR6Fix'); // New checkbox for R6 Fix


    function saveSettings() {
        console.log("Saving Settings");
        chrome.storage.local.set({
            itemSalesEnabled: itemSalesCheckbox.checked,
            groupGamesEnabled: groupGamesCheckbox.checked,
            userGamesEnabled: userGamesCheckbox.checked,
            userSniperEnabled: userSniperCheckbox.checked,
            regionSelectorEnabled: regionSelectorCheckbox.checked,
            subplacesEnabled: subplacesCheckbox.checked,
            forceR6Enabled: forceR6Checkbox.checked,
            fixR6Enabled: r6FixCheckbox.checked, // Save the state of R6 Fix

        }, () => {
            if (chrome.runtime.lastError) {
                console.error("Error saving settings:", chrome.runtime.lastError.message);
            } else {
                console.log("Settings Saved:", {
                    itemSalesEnabled: itemSalesCheckbox.checked,
                    groupGamesEnabled: groupGamesCheckbox.checked,
                    userGamesEnabled: userGamesCheckbox.checked,
                    userSniperEnabled: userSniperCheckbox.checked,
                    regionSelectorEnabled: regionSelectorCheckbox.checked,
                    subplacesEnabled: subplacesCheckbox.checked,
                    forceR6Enabled: forceR6Checkbox.checked,
                    fixR6Enabled: r6FixCheckbox.checked, // Log the saved state of R6 Fix
                });
            }
        });
    }

    async function loadSettings() {
        console.log("Loading Settings");
        const settings = await chrome.storage.local.get({
            itemSalesEnabled: true,
            groupGamesEnabled: true,
            userGamesEnabled: true,
            userSniperEnabled: true,
            regionSelectorEnabled: true,
            subplacesEnabled: true,
             forceR6Enabled: true,
            fixR6Enabled: false, // Load the state of R6 Fix
        });
        console.log("Loaded Settings:", settings);
        itemSalesCheckbox.checked = settings.itemSalesEnabled;
        groupGamesCheckbox.checked = settings.groupGamesEnabled;
        userGamesCheckbox.checked = settings.userGamesEnabled;
        userSniperCheckbox.checked = settings.userSniperEnabled;
        regionSelectorCheckbox.checked = settings.regionSelectorEnabled;
        subplacesCheckbox.checked = settings.subplacesEnabled;
         forceR6Checkbox.checked = settings.forceR6Enabled;
         r6FixCheckbox.checked = settings.fixR6Enabled; // Set the initial state of R6 Fix checkbox
    }
    await loadSettings();

    itemSalesCheckbox.addEventListener('change', saveSettings);
    groupGamesCheckbox.addEventListener('change', saveSettings);
    userGamesCheckbox.addEventListener('change', saveSettings);
    userSniperCheckbox.addEventListener('change', saveSettings);
    regionSelectorCheckbox.addEventListener('change', saveSettings);
    subplacesCheckbox.addEventListener('change', saveSettings);
    forceR6Checkbox.addEventListener('change', saveSettings);
    r6FixCheckbox.addEventListener('change', saveSettings); // Event listener for R6 Fix

    document.getElementById("Show update")?.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'showUpdateOverlayFromPopup' }, response => {
            if (response) {
                console.log(response);
            } else {
                console.error("No response received from background script.");
            }
        });
    });
});