document.addEventListener('DOMContentLoaded', async () => {
  const itemSalesCheckbox = document.getElementById('enableItemSales');
  const groupGamesCheckbox = document.getElementById('enableGroupGames');
  const userGamesCheckbox = document.getElementById('enableUserGames');
  const userSniperCheckbox = document.getElementById('enableUserSniper');
  const regionSelectorCheckbox = document.getElementById('enableRegionSelector');


  function saveSettings() {
      console.log("Saving Settings");
      chrome.storage.local.set({
          itemSalesEnabled: itemSalesCheckbox.checked,
          groupGamesEnabled: groupGamesCheckbox.checked,
          userGamesEnabled: userGamesCheckbox.checked,
          userSniperEnabled: userSniperCheckbox.checked,
         regionSelectorEnabled: regionSelectorCheckbox.checked,
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
           regionSelectorEnabled: false,
      });
      console.log("Loaded Settings:", settings);
      itemSalesCheckbox.checked = settings.itemSalesEnabled;
      groupGamesCheckbox.checked = settings.groupGamesEnabled;
      userGamesCheckbox.checked = settings.userGamesEnabled;
      userSniperCheckbox.checked = settings.userSniperEnabled;
      regionSelectorCheckbox.checked = settings.regionSelectorEnabled;
  }
  await loadSettings();

  itemSalesCheckbox.addEventListener('change', saveSettings);
  groupGamesCheckbox.addEventListener('change', saveSettings);
  userGamesCheckbox.addEventListener('change', saveSettings);
  userSniperCheckbox.addEventListener('change', saveSettings);
 regionSelectorCheckbox.addEventListener('change', saveSettings);



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