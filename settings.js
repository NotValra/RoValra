

let currentTheme = 'light'; 
window.addEventListener('themeDetected', (event) => {
    currentTheme = event.detail.theme;
    applyTheme();
});

let observer = null;
let isChecking = false;
const checkInterval = 50;
let popoverButtonCheckTimeout = null;
let isPopoverButtonAdding = false;
let rovalraButtonAdded = false;
let isSettingsPage = false;

function applyTheme() {
    const isDarkMode = currentTheme === 'dark';
    const contentColor = isDarkMode ? '' : 'rgb(255, 255, 255)';
    const textColor = isDarkMode ? '' : 'rgb(96, 97, 98)';
    const headerColor = isDarkMode ? '' : 'rgb(40, 40, 40)';
    const sliderOnBackgroundColor = isDarkMode ? '#444' : '#ddd';  
    const sliderButtonColor = isDarkMode ? '#24292e' : 'white';
    const contentContainer = document.querySelector('#content-container');
    const settingsContainer = document.querySelector('#settings-container');
    const uiContainer = document.querySelector('#settings-container > div');
    const tabButtons = document.querySelectorAll('.tab-button');

    if (contentContainer) {
        const childDiv = contentContainer.querySelector(':scope > div');
        if (childDiv) {
            childDiv.style.backgroundColor = contentColor;
        }
    }
    if (settingsContainer) {
        const rovalraHeader = settingsContainer.querySelector('#react-user-account-base > h1');
        if (rovalraHeader) {
            rovalraHeader.style.color = headerColor;
        }
    }
    if (uiContainer) {
        uiContainer.style.color = textColor;
    }
    if (contentContainer) {
        const childDiv = contentContainer.querySelector(':scope > div');
        if (childDiv) {
            childDiv.querySelectorAll('h2, p, a, div').forEach(element => {
                if (!element.closest('.slider')) {
                    element.style.color = textColor;
                }
            });
        }
    }
    tabButtons.forEach(button => {
        if (!isDarkMode) {
            button.style.setProperty('color', '#fff', 'important');
        } else {
            button.style.removeProperty('color');
        }
    });

    const sliders = document.querySelectorAll('.slider');
    sliders.forEach(slider => {
        const input = slider.parentNode.querySelector('input');
        slider.style.backgroundColor = input.checked ? sliderOnBackgroundColor : sliderOffBackgroundColor;
    });

    const sliderButtons = document.querySelectorAll('.slider:before');
    sliderButtons.forEach(button => {
        button.style.backgroundColor = sliderButtonColor;
    });
}
function addCustomButton() {

    if (!window.location.href.startsWith('https://www.roblox.com/my/account')) {
        return; 
    }
        
    const menuList = document.querySelector('ul.menu-vertical[role="tablist"]');

    if (!menuList) {
        addPopoverButton();
        return;
    }

    let divider = menuList.querySelector('li.rbx-divider.thick-height');

    if (!divider) {
        const lastMenuItem = menuList.querySelector('li.menu-option[role="tab"]:last-of-type');
        if(!lastMenuItem){
            addPopoverButton()
            return
        }
        const newDivider = document.createElement('li');
        newDivider.classList.add('rbx-divider', 'thick-height');
        newDivider.style.width = '100%'; 
        newDivider.style.height = '2px'; 
        lastMenuItem.insertAdjacentElement('afterend', newDivider);
        divider = newDivider; 

    } else {
        divider.style.width = '100%';
    }

   if (rovalraButtonAdded) {
        observer.disconnect();
       return;
   }

    const existingButton = menuList.querySelector('li.menu-option > a > span.font-caption-header[textContent="RoValra Settings"]');
    if(existingButton){
        return;
    }
    const newButtonListItem = document.createElement('li');
    newButtonListItem.classList.add('menu-option');
    newButtonListItem.setAttribute('role', 'tab');

    const newButtonLink = document.createElement('a');
    newButtonLink.classList.add('menu-option-content');
    newButtonLink.style.cursor = 'pointer';
    newButtonLink.style.display = 'flex'; 
    newButtonLink.style.alignItems = 'center';

    const newButtonSpan = document.createElement('span');
    newButtonSpan.classList.add('font-caption-header');
    newButtonSpan.textContent = 'RoValra Settings';
    newButtonSpan.style.fontSize = '12px'

    const logo = document.createElement('img');
    logo.src = chrome.runtime.getURL("Assets/icon-128.png");
    logo.style.width = '15px';
    logo.style.height = '15px';
    logo.style.marginRight = '5px';
    logo.style.verticalAlign = 'middle';

    newButtonLink.appendChild(logo);
    newButtonLink.appendChild(newButtonSpan);
    newButtonListItem.appendChild(newButtonLink);

    newButtonLink.addEventListener('click', function () {

        const contentDiv = document.querySelector('div.content#content');

         if (contentDiv) {
            let reactUserAccountBaseDiv = contentDiv.querySelector('#react-user-account-base');
            if (reactUserAccountBaseDiv) {
                reactUserAccountBaseDiv.innerHTML =
                    `<h1>RoValra Settings</h1><div id="settings-container"></div>`;
            } else {
                const userAccountDiv = contentDiv.querySelector('.row.page-content.new-username-pwd-rule#user-account');
                if (userAccountDiv) {
                    userAccountDiv.innerHTML =
                        `<div id="react-user-account-base"><h1>RoValra Settings</h1><div id="settings-container"></div></div>`;
                } else {
                    contentDiv.innerHTML =
                        `<div class="row page-content new-username-pwd-rule" id="user-account">
                                <div id="react-user-account-base"><h1>RoValra Settings</h1><div id="settings-container"></div></div>
                            </div>`;
                }
            }
             checkRoValraPage();
             if (currentTheme) {
                    applyTheme();
              }
        } else {
        }

    });
    divider.insertAdjacentElement('afterend', newButtonListItem);
    rovalraButtonAdded = true;
}

function observeContentChanges() {
    const targetNode = document.body;
    if(!targetNode){
        return;
    }
    const config = { childList: true, subtree: true };

    observer = new MutationObserver(function(mutationsList, observer) {
        for(const mutation of mutationsList) {
            if (mutation.type === 'childList') {
                for(const addedNode of mutation.addedNodes) {
                    if(addedNode.nodeType === Node.ELEMENT_NODE) {
                        if (addedNode.querySelector('ul.menu-vertical[role="tablist"]')) {
                           addCustomButton();
                            return; 
                        }
                    }
                }
            }
        }

    });
    observer.observe(targetNode, config);
    
    if (document.querySelector('ul.menu-vertical[role="tablist"]')){
        addCustomButton()
    }
}

observeContentChanges();
function addPopoverButton() {
    if (isPopoverButtonAdding) {
        return;
    }

    isPopoverButtonAdding = true;

    if (popoverButtonCheckTimeout) {
        clearTimeout(popoverButtonCheckTimeout);
    }

    popoverButtonCheckTimeout = setTimeout(() => {
         const popoverMenu = document.getElementById('settings-popover-menu');
         const popover = document.querySelector('.popover-menu.settings-popover');
        if (!popoverMenu || (popover && popover.style.display === 'none')) {
            isPopoverButtonAdding = false; 
            return;
        }
         setTimeout(() => {
                if (observer) {
                     observer.disconnect();
                }
                const existingButtons = popoverMenu.querySelectorAll('li.list-item');

                if (existingButtons.length > 1) {
                    for (let i = 1; i < existingButtons.length; i++) {
                        existingButtons[i].closest('li.list-item').remove();
                    }
                }
                const existingButton = popoverMenu.querySelector('li.list-item');
                if (existingButton) {
                    if(observer){
                        observer.observe(document.body, { childList: true, subtree: true });
                    }
                     isPopoverButtonAdding = false; 
                    return;
                }

             const newButtonListItem = document.createElement('li');
             newButtonListItem.classList.add('list-item', 'menu-option');

             const newButtonLink = document.createElement('a');
             newButtonLink.classList.add('menu-option-content');
             newButtonLink.style.cursor = 'pointer';
             newButtonLink.style.display = 'flex'; 
             newButtonLink.style.alignItems = 'center';


             const newButtonSpan = document.createElement('span');
             newButtonSpan.classList.add('font-caption-header');
             newButtonSpan.textContent = 'RoValra Settings';
             newButtonSpan.style.fontSize = '16px';
              newButtonSpan.style.marginLeft = '-1px';

            const logo = document.createElement('img');
             logo.src = chrome.runtime.getURL("Assets/icon-128.png");
            logo.style.width = '17px';
            logo.style.height = '17px';
            logo.style.marginRight = '5px';
            logo.style.verticalAlign = 'middle';

             newButtonLink.appendChild(logo)
             newButtonLink.appendChild(newButtonSpan);
             newButtonListItem.appendChild(newButtonLink);

               newButtonLink.addEventListener('click', function () {
                     const contentDiv = document.querySelector('div.content#content');
                     
                     if (contentDiv) {
                         const reactUserAccountBaseDiv = contentDiv.querySelector('#react-user-account-base');
                         if (reactUserAccountBaseDiv) {
                             reactUserAccountBaseDiv.innerHTML =
                                 `<h1>RoValra Settings</h1><div id="settings-container"></div>`;
                         } else {
                             const userAccountDiv = contentDiv.querySelector('.row.page-content.new-username-pwd-rule#user-account');
                             if (userAccountDiv) {
                                 userAccountDiv.innerHTML =
                                     `<div id="react-user-account-base"><h1>RoValra Settings</h1><div id="settings-container"></div></div>`;
                             } else {
                                 contentDiv.innerHTML =
                                     `<div class="row page-content new-username-pwd-rule" id="user-account">
                                             <div id="react-user-account-base"><h1>RoValra Settings</h1><div id="settings-container"></div></div>
                                         </div>`;
                               }
                         }
                        checkRoValraPage();
                       if (currentTheme) {
                            applyTheme();
                         }
                     } else {
                     }
                    const popover = document.querySelector('.popover-menu.settings-popover');
                    if (popover) {
                         popover.style.display = 'none';
                     }
                });
             popoverMenu.insertBefore(newButtonListItem, popoverMenu.firstChild);

                if(observer){
                    observer.observe(document.body, { childList: true, subtree: true });
                 }
                isPopoverButtonAdding = false;
         }, 10);
    },50)
}



function startObserver() {
    if (observer) {
        observer.disconnect();
    }

    function checkAndAddButtons() {
        const popover = document.querySelector('.popover-menu.settings-popover');
         if (popover && popover.style.display !== 'none' ) {
            return;
          }

        if (!isChecking) {
            isChecking = true;
            addCustomButton();
           addPopoverButton(); 

            setTimeout(() => {
                isChecking = false;
            }, checkInterval);
        }
    }

    observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
            if (mutation.type === 'childList') {
                checkAndAddButtons();
            }
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
}
const loadSettings = async () => {
    return new Promise((resolve, reject) => {
       chrome.storage.local.get({
             itemSalesEnabled: true,
               groupGamesEnabled: true,
                userGamesEnabled: true,
               userSniperEnabled: true,
              regionSelectorEnabled: false,
                subplacesEnabled: true,
                 showServerListOverlay: true,
                   forceR6Enabled: true,
                      fixR6Enabled: false,
                      inviteEnabled: true,
                       sniperEnabled: true, // Added setting
           }, (settings) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError)
                } else {
                   resolve(settings);
               }
           });
    });

};


 const handleSaveSettings = async (itemSalesCheckbox, groupGamesCheckbox, userGamesCheckbox, userSniperCheckbox, regionSelectorCheckbox, subplacesCheckbox, showServerListOverlayCheckbox, forceR6Checkbox, r6FixCheckbox, inviteCheckbox, sniperCheckbox) => { // Added sniperCheckbox here
   try{
   const settings = {
        itemSalesEnabled: itemSalesCheckbox.checked,
       groupGamesEnabled: groupGamesCheckbox.checked,
       userGamesEnabled: userGamesCheckbox.checked,
       userSniperEnabled: userSniperCheckbox.checked,
       regionSelectorEnabled: regionSelectorCheckbox.checked,
       subplacesEnabled: subplacesCheckbox.checked,
       showServerListOverlay: showServerListOverlayCheckbox.checked,
        forceR6Enabled: forceR6Checkbox.checked,
       fixR6Enabled: r6FixCheckbox.checked,
       inviteEnabled: inviteCheckbox.checked,
       sniperEnabled: sniperCheckbox.checked,
   };
    return new Promise((resolve, reject) => {
       chrome.storage.local.set(settings, () => {
        if (chrome.runtime.lastError) {
               reject(chrome.runtime.lastError);
          } else {
               resolve();
           }
       });
   });

   } catch (error) {
   }
};
const initSettings = async (itemSalesCheckbox, groupGamesCheckbox, userGamesCheckbox, userSniperCheckbox, regionSelectorCheckbox, subplacesCheckbox, showServerListOverlayCheckbox, forceR6Checkbox, r6FixCheckbox, inviteCheckbox, sniperCheckbox) => { // Added sniperCheckbox here
   const settings = await loadSettings();

   if(settings){
        itemSalesCheckbox.checked = settings.itemSalesEnabled;
       groupGamesCheckbox.checked = settings.groupGamesEnabled;
       userGamesCheckbox.checked = settings.userGamesEnabled;
       userSniperCheckbox.checked = settings.userSniperEnabled;
       regionSelectorCheckbox.checked = settings.regionSelectorEnabled;
       subplacesCheckbox.checked = settings.subplacesEnabled;
       showServerListOverlayCheckbox.checked = settings.showServerListOverlay;
        forceR6Checkbox.checked = settings.forceR6Enabled;
       r6FixCheckbox.checked = settings.fixR6Enabled;
       inviteCheckbox.checked = settings.inviteEnabled;
       sniperCheckbox.checked = settings.sniperEnabled;
   }
};



function updateContent(buttonInfo, contentContainer, buttonData) {
    const isDarkMode = currentTheme === 'dark';
    const contentColor = isDarkMode ? '#2a2b2c' : '';
    const textColor = isDarkMode ? '' : 'rgb(96, 97, 98)';
    const headerColor = isDarkMode ? '' : 'rgb(40, 40, 40)';

    if (typeof buttonInfo === 'object' && buttonInfo !== null && buttonInfo.content) {
        contentContainer.innerHTML = buttonInfo.content;
        contentContainer.style.borderRadius = '8px';
          if (isDarkMode) {
             contentContainer.style.backgroundColor = contentColor;
         } else{
           contentContainer.style.backgroundColor = '';
         }
        
          if (window.location.href.startsWith('https://www.roblox.com/my/account')) {
            contentContainer.querySelectorAll('h2, p, div, span, li, b, a').forEach(element => {
                element.style.setProperty('color', textColor, 'important');
            });
          }

          const allLinks = contentContainer.querySelectorAll('a');
           allLinks.forEach(link => {
               link.style.setProperty('text-decoration', 'none', 'important');
              link.style.setProperty('font-weight', 'bold', 'important');
           });
        const discordLinks = contentContainer.querySelectorAll('a[href*="discord.gg"]');
         discordLinks.forEach(link => {
            link.style.setProperty('color', '#7289da', 'important');
            });

            const githubLinks = contentContainer.querySelectorAll('a[href*="github.com"]');
            githubLinks.forEach(link => {
                 link.style.setProperty('color', '#2dba4e', 'important');
            });


         const rovalraHeader = contentContainer.querySelector('#react-user-account-base > h1');
         if(rovalraHeader){
            rovalraHeader.style.setProperty('color', headerColor, 'important');
         }
    } else {
        contentContainer.innerHTML = '';
    }
   if (currentTheme) {
        applyTheme();
    }
}

async function checkRoValraPage() {
    const contentDiv = document.querySelector('div.content#content');
    if (!contentDiv) {
      return; 
    }
  
    const userAccountDiv = contentDiv.querySelector('.row.page-content.new-username-pwd-rule#user-account');
    const rovalraHeader = contentDiv.querySelector('#react-user-account-base > h1');
    const settingsContainer = contentDiv.querySelector('#settings-container');
  
    if (rovalraHeader && rovalraHeader.textContent === 'RoValra Settings' && settingsContainer) {
      contentDiv.style.cssText = `
          width: 1199px !important;
          max-width: 1199px !important;
          height: auto !important;
          border-radius: 10px !important;
          overflow: hidden !important;
          padding-bottom: 25px !important;
          padding-top: 25px !important;
          min-height: 800px !important;
          position: relative !important;
      `;
  
      if (userAccountDiv) {
        userAccountDiv.style.cssText = `
            display: flex !important;
            padding-left: 20px !important;
            padding-right: 20px !important;
            margin: 0 !important;
          `;
        rovalraButtonAdded = false;
      }
      rovalraHeader.remove();
      const uiContainer = document.createElement('div');
      uiContainer.style.display = 'flex';
      uiContainer.style.flexDirection = 'row';
      uiContainer.style.gap = '10px';
      uiContainer.style.alignItems = 'flex-start';
      uiContainer.style.position = 'relative';
      uiContainer.style.overflow = 'auto';
      uiContainer.style.width = 'auto';
      uiContainer.style.justifyContent = 'flex-start';
      settingsContainer.appendChild(uiContainer);
      settingsContainer.style.display = 'block';
      settingsContainer.style.position = 'relative';
      settingsContainer.style.overflow = 'visible'
  
      const style = document.createElement('style');
      style.textContent = `
          .setting {
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              font-size: 16px;
              color: white;
              margin: 0 0px;
          
          }
      
          .setting label {
          flex-grow: 1;
          margin-right: 5px;
          font-weight: bold;
          }
          .setting p {
          }
      .toggle-switch {
          position: relative;
          display: inline-block;
          width: 36px;
          height: 20px;
          margin-top: 4px;
          float: right;
      }
      .toggle-switch input {
          opacity: 0;
          width: 0;
          height: 0;
      }
      .slider {
          position: absolute;
          cursor: pointer;
          top: 0;
          left: 0;
          right: 0;
          background-color: #444;
          bottom: 0;
          transition: .4s;
          
         border-radius: 18px; 
              width: 36px;
      }
      .slider:before {
          position: absolute;
          content: "";
          height: 18px;
          width: 18px;
          left: 1px;
          bottom: 1px;
          background-color:rgb(255, 255, 255);
          transition: .4s;
          border-radius: 50%;
      }
      input:checked + .slider {
          background-color: #2EA44F;
      }
      
      input:checked + .slider:before{
              transform: translateX(16px);
      }
      .setting-separator {
          border-bottom: 1px solid #444;
          margin: 10px 0;
      }
          .disabled-setting {
              opacity: 0.5;
              pointer-events: none;
          }
      .disabled-setting label {
          color: #777;
      }
          .disabled-setting p {
              color: #777;
          }
          .tab-button {
          white-space: nowrap;
          margin-left: 0px;
          }
      
      `;
      document.head.appendChild(style);
  
      const buttonData = [
          {
              text: "Info", content: `
              <div style="padding: 15px; background-color: #2a2b2c; border-radius: 8px;">
              <h2 style="; margin-bottom: 10px;">RoValra Infomation!</h2>
              <p style="">RoValra is an extension that's trying to make basic QoL features free and accessible to everyone, by making everything completely open-source.</p>
              <div style="margin-top: 5px;">
                  <p style="">This is possible by running everything locally.</p>
                  <div style="margin-top: 5px;">
                  <p style="">If you have any feature suggestions please let me know in my Discord server or via GitHub</p>
                  <div style="margin-top: 5px;">
                    <p style="">Also this settings page will get a bunch of improvements in a future update!</p>
                  </div>
              <div style="margin-top: 10px;">
                      <a href="https://discord.gg/GHd5cSKJRk" target="_blank">Discord Server</a>
                      <a href="https://github.com/NotValra/RoValra" target="_blank">
                      Github Repo
                      <img src="${chrome.runtime.getURL("Assets/icon-128.png")}" style="width: 20px; height: 20px; margin-left: 5px; vertical-align: middle;" />
                      </a>
              </div>
          </div>
          `},
          {
              text: "Credits", content: `
                  <div style="padding: 15px; background-color: #2a2b2c; border-radius: 8px;">
                      <h2 style=" margin-bottom: 10px;">RoValra Credits!</h2>
                      <ul style=" margin-top: 10px; padding-left: 0px;">
                          <li style="margin-bottom: 8px;">The sales and revenue feature is only possible because of <b style="font-weight: bold;">Frames.</b>
                              <a href="https://github.com/workframes/roblox-owner-counts" target="_blank">GitHub Repo</a>
                          </li>
                          <li style="margin-bottom: 8px;">The Region searcher was originally a Python script made by <b style="font-weight: bold;">l5se</b> on Discord, that I recoded in Python and then in JS.</li>
                          <li style="margin-bottom: 8px;">Thanks to <b style="font-weight: bold;">Aspect</b> for helping me out here and there when I had a bunch of dumb questions or problems.
                            <a href="https://github.com/Aspectise" style="color: #2dba4e; text-decoration: none; margin-left: 5px; font-weight: bold;" target="_blank">GitHub</a>
                                <a href="https://discord.gg/U75BFsV49z" style="color: #7289da; text-decoration: none; margin-left: 5px; font-weight: bold;" target="_blank">Discord</a>
                          </li>
                          <li style="margin-bottom: 8px;">Thanks to <b style="font-weight: bold;">7_lz</b> on Discord for helping me a bunch when preparing for the Chrome Web Store release. They helped a ton and I'm very thankful.</li>
                          <li style="margin-bottom: 8px;">And thanks to <b style="font-weight: bold;">Coweggs</b> for coming up with the very funny name that is "RoValra" as a joke that I then ended up using.</li>
                      </ul>
                  </div>
              `},
          {
              text: "Settings", content: ""
          },
  
      ];
  
      uiContainer.innerHTML = '';
  
      const buttonContainer = document.createElement('div');
      buttonContainer.style.display = 'flex';
      buttonContainer.style.flexDirection = 'column';
      buttonContainer.style.width = '160px';
      buttonContainer.style.flexShrink = '0';
      const contentContainer = document.createElement('div');
      contentContainer.id = 'content-container';
      contentContainer.style.flex = '1';
      contentContainer.style.overflowY = 'auto';
      contentContainer.style.overflowX = 'auto';
      contentContainer.style.paddingLeft = '0px';
      contentContainer.style.zIndex = '1000';
      contentContainer.style.position = 'relative';
      contentContainer.style.marginLeft = '0px'; 
      contentContainer.style.minWidth = '979px';
  
  
      uiContainer.appendChild(buttonContainer);
      uiContainer.appendChild(contentContainer);
  
  
      buttonData.forEach(item => {
          const button = document.createElement('button');
          button.textContent = item.text || item;
          button.classList.add('tab-button');
          button.style.paddingLeft = '5px';
          button.style.paddingRight = '5px';
          button.style.width = '150px';
          button.style.height = '35px';
          button.style.textAlign = 'center';
          button.style.borderRadius = '4px';
          button.style.backgroundColor = 'rgb(57, 59, 61)';
          button.style.marginBottom = '5px';
          button.dataset.active = 'false';
  
          button.addEventListener('mouseenter', function () {
              if (this.dataset.active === 'false') {
                  this.style.backgroundColor = 'rgb(47, 49, 51)';
              }
          });
          button.addEventListener('mouseleave', function () {
              if (this.dataset.active === 'false') {
                  this.style.backgroundColor = 'rgb(57, 59, 61)';
              }
          });
          button.addEventListener('click', async function () {
              const previouslyActiveButton = buttonContainer.querySelector('button[data-active="true"]');
  
              if (previouslyActiveButton && previouslyActiveButton !== this) {
                  previouslyActiveButton.style.backgroundColor = 'rgb(57, 59, 61)';
                  previouslyActiveButton.dataset.active = 'false';
              }
  
              if (this.dataset.active === 'false') {
                  this.style.backgroundColor = 'rgb(117, 119, 121)';
                  this.dataset.active = 'true';
              } else {
                  this.style.backgroundColor = 'rgb(57, 59, 61)';
                  this.dataset.active = 'false';
              }
  
              if (item.text === "Settings") {
                  contentContainer.innerHTML = `
                      <div style="padding: 25px; background-color: #2a2b2c; border-radius: 8px;">
                      
                              <h1 style="; margin-bottom: 5px;">Games</h1>
                              <div class="setting">
                              <label style="">Enable Region Selector</label>
                                      <p>This lets you select the region to play on. Kinda like RoPro but for free and with support for any game.</p>
                                  <label class="toggle-switch">
                                      <input type="checkbox" id="enableRegionSelector">
                                  <span class="slider"></span>
                                  </label>
                              <div class="setting showServerListOverlay-container ${ await (await loadSettings()).regionSelectorEnabled ? '' : 'disabled-setting'}"  style="margin-left: 35px;">
                                      <label style="">  Show Server List Overlay</label>
                                      <p>This will show an overlay with all the different servers for the picked region. Without this it will instant join.</p>
                                          <label class="toggle-switch">
                                              <input type="checkbox" id="showServerListOverlay">
                                              <span class="slider"></span>
                                          </label>
                                  <div class="setting-separator"></div>
                              </div>
                          <div class="setting">
                              <label style="">Enable Subplaces</label>
                                  <p>Shows the subplaces of a game.</p>
                                      <label class="toggle-switch">
                                              <input type="checkbox" id="enableSubplaces">
                                              <span class="slider"></span>
                                      </label>
                              <div class="setting-separator"></div>
                          </div>
                              <div class="setting">
                                   <label style="">Enable Universal User Sniper</label>
                                  <p>This lets you join ANYONE as long as you know what game they are playing!</p>
                                      <label class="toggle-switch">
                                              <input type="checkbox" id="enableSniper">
                                              <span class="slider"></span>
                                      </label>
                                      <div class="setting-separator"></div>
                              </div>
                              <div class="setting">
                                  <label style="">Enable Hidden User Games</label>
                                  <p>Shows a users hidden games on their profile.</p>
                                  <label class="toggle-switch">
                                      <input type="checkbox" id="enableUserGames">
                                      <span class="slider"></span>
                                  </label>
                                  <div class="setting-separator"></div>
                              </div>
                              <div class="setting">
  
                              <label style="">Enable Hidden Group Games</label>
                              <p>Shows a groups hidden games.</p>
                                  <label class="toggle-switch">
                                      <input type="checkbox" id="enableGroupGames">
                                      <span class="slider"></span>
                                  </label>
                                  <div class="setting-separator"></div>
                              </div>
                            <div class="setting">
                                  <label style="">Enable Universal Server Invites (BROKEN ATM!)</label>
                                  <p>This allows you to invite your friends to the game you're in, without your friend requiring any extension, not even RoValra!</p>
                                  <p>This does require you to have BTRoblox for it to work.</p>
                                  <label class="toggle-switch">
                                      <input type="checkbox" id="enableInvite">
                                      <span class="slider"></span>
                                  </label>
                                  <div class="setting-separator"></div>
                                 </div>
                              
                              <h1 style="; margin-top: 0px; margin-bottom: 10px;">Profile</h1>
                              <div class="setting">
                                      <label style="">Enable User Sniper</label>
                                      <p>This joins a user instantly when they go into a game, best used for people with a lot of people trying to join them.</p>
                                  <label class="toggle-switch">
                                          <input type="checkbox" id="enableUserSniper">
                                          <span class="slider"></span>
                                  </label>
                                      <div class="setting-separator"></div>
                              </div>
                              <h1 style="; margin-top: 0px; margin-bottom: 10px;">Items</h1>
                                  <div class="setting">
                                  <label style="">Enable Item Sales</label>
                              <p>This shows the most up to date sales and revenue data we have.</p>
                                  <label class="toggle-switch">
                                      <input type="checkbox" id="enableItemSales">
                                      <span class="slider"></span>
                                  </label>
                                      <div class="setting-separator"></div>
                                  </div>
  
                                  </div>
                          <h1 style="; margin-top: 0px; margin-bottom: 10px;">Avatar</h1>
                      <div class="setting">
                              <label style="">Remove R6 Warning</label>
                                  <p>Removes the R6 warning when switching to r6</p>
                              <label class="toggle-switch">
                                  <input type="checkbox" id="enableForceR6">
                                  <span class="slider"></span>
                              </label>
                              <div class="setting-separator"></div>
                              </div>
                              <div class="setting">
                                  <label style="">Enable R6 Fix (BETA)</label>
                                  <p>Stops Roblox from automatically switching your character to r15 when equiping dynamic heads. This requires you to use the english language on Roblox.</p>
                                      <label class="toggle-switch">
                                          <input type="checkbox" id="enableR6Fix">
                                          <span class="slider"></span>
                                      </label>
                                      <div class="setting-separator"></div>
                                  </div>
                              </div>
                          </div>
                      `;
                  const itemSalesCheckbox = contentContainer.querySelector('#enableItemSales');
                  const groupGamesCheckbox = contentContainer.querySelector('#enableGroupGames');
                  const userGamesCheckbox = contentContainer.querySelector('#enableUserGames');
                  const userSniperCheckbox = contentContainer.querySelector('#enableUserSniper');
                  const regionSelectorCheckbox = contentContainer.querySelector('#enableRegionSelector');
                  const subplacesCheckbox = contentContainer.querySelector('#enableSubplaces');
                  const showServerListOverlayCheckbox = contentContainer.querySelector('#showServerListOverlay');
                  const forceR6Checkbox = contentContainer.querySelector('#enableForceR6');
                  const r6FixCheckbox = contentContainer.querySelector('#enableR6Fix');
                   const inviteCheckbox = contentContainer.querySelector('#enableInvite');
                  const sniperCheckbox = contentContainer.querySelector('#enableSniper');
                  initSettings(itemSalesCheckbox, groupGamesCheckbox, userGamesCheckbox, userSniperCheckbox, regionSelectorCheckbox, subplacesCheckbox, showServerListOverlayCheckbox, forceR6Checkbox, r6FixCheckbox, inviteCheckbox, sniperCheckbox);
                  itemSalesCheckbox.addEventListener('change', () => handleSaveSettings(itemSalesCheckbox, groupGamesCheckbox, userGamesCheckbox, userSniperCheckbox, regionSelectorCheckbox, subplacesCheckbox, showServerListOverlayCheckbox, forceR6Checkbox, r6FixCheckbox, inviteCheckbox, sniperCheckbox));
                  groupGamesCheckbox.addEventListener('change', () => handleSaveSettings(itemSalesCheckbox, groupGamesCheckbox, userGamesCheckbox, userSniperCheckbox, regionSelectorCheckbox, subplacesCheckbox, showServerListOverlayCheckbox, forceR6Checkbox, r6FixCheckbox, inviteCheckbox, sniperCheckbox));
                  userGamesCheckbox.addEventListener('change', () => handleSaveSettings(itemSalesCheckbox, groupGamesCheckbox, userGamesCheckbox, userSniperCheckbox, regionSelectorCheckbox, subplacesCheckbox, showServerListOverlayCheckbox, forceR6Checkbox, r6FixCheckbox, inviteCheckbox, sniperCheckbox));
                  userSniperCheckbox.addEventListener('change', () => handleSaveSettings(itemSalesCheckbox, groupGamesCheckbox, userGamesCheckbox, userSniperCheckbox, regionSelectorCheckbox, subplacesCheckbox, showServerListOverlayCheckbox, forceR6Checkbox, r6FixCheckbox, inviteCheckbox, sniperCheckbox));
                  regionSelectorCheckbox.addEventListener('change', () => handleSaveSettings(itemSalesCheckbox, groupGamesCheckbox, userGamesCheckbox, userSniperCheckbox, regionSelectorCheckbox, subplacesCheckbox, showServerListOverlayCheckbox, forceR6Checkbox, r6FixCheckbox, inviteCheckbox, sniperCheckbox));
                  subplacesCheckbox.addEventListener('change', () => handleSaveSettings(itemSalesCheckbox, groupGamesCheckbox, userGamesCheckbox, userSniperCheckbox, regionSelectorCheckbox, subplacesCheckbox, showServerListOverlayCheckbox, forceR6Checkbox, r6FixCheckbox, inviteCheckbox, sniperCheckbox));
                  showServerListOverlayCheckbox.addEventListener('change', () => handleSaveSettings(itemSalesCheckbox, groupGamesCheckbox, userGamesCheckbox, userSniperCheckbox, regionSelectorCheckbox, subplacesCheckbox, showServerListOverlayCheckbox, forceR6Checkbox, r6FixCheckbox, inviteCheckbox, sniperCheckbox));
                  forceR6Checkbox.addEventListener('change', () => handleSaveSettings(itemSalesCheckbox, groupGamesCheckbox, userGamesCheckbox, userSniperCheckbox, regionSelectorCheckbox, subplacesCheckbox, showServerListOverlayCheckbox, forceR6Checkbox, r6FixCheckbox, inviteCheckbox, sniperCheckbox));
                  r6FixCheckbox.addEventListener('change', () => handleSaveSettings(itemSalesCheckbox, groupGamesCheckbox, userGamesCheckbox, userSniperCheckbox, regionSelectorCheckbox, subplacesCheckbox, showServerListOverlayCheckbox, forceR6Checkbox, r6FixCheckbox, inviteCheckbox, sniperCheckbox));
                  inviteCheckbox.addEventListener('change', () => handleSaveSettings(itemSalesCheckbox, groupGamesCheckbox, userGamesCheckbox, userSniperCheckbox, regionSelectorCheckbox, subplacesCheckbox, showServerListOverlayCheckbox, forceR6Checkbox, r6FixCheckbox, inviteCheckbox, sniperCheckbox));
                  sniperCheckbox.addEventListener('change', () => handleSaveSettings(itemSalesCheckbox, groupGamesCheckbox, userGamesCheckbox, userSniperCheckbox, regionSelectorCheckbox, subplacesCheckbox, showServerListOverlayCheckbox, forceR6Checkbox, r6FixCheckbox, inviteCheckbox, sniperCheckbox));
                  const showServerListOverlayContainer = contentContainer.querySelector('.showServerListOverlay-container')
                  const regionSelectorCheckboxElement = contentContainer.querySelector('#enableRegionSelector');
  
                  function toggleOverlayDisable() {
                      if(regionSelectorCheckboxElement && showServerListOverlayContainer){
                          if(!regionSelectorCheckboxElement.checked){
                              showServerListOverlayContainer.classList.add('disabled-setting');
                          } else{
                              showServerListOverlayContainer.classList.remove('disabled-setting');
                          }
                      }
                  }
  
                  regionSelectorCheckboxElement.addEventListener('change', () => {
                      toggleOverlayDisable();
                  });
  
                  applyTheme();
  
              } else {
                  updateContent(item, contentContainer, buttonData);
                  applyTheme();
              }
              applyTheme();
  
          });
          buttonContainer.appendChild(button);
      });
  
      const infoButton = buttonContainer.querySelector('button:first-child');
      if (infoButton) {
          infoButton.style.backgroundColor = 'rgb(117, 119, 121)';
          infoButton.dataset.active = 'true';
          updateContent(buttonData[0], contentContainer, buttonData);
          applyTheme();
      }
      settingsContainer.insertAdjacentElement("afterbegin", rovalraHeader)
      applyTheme();
  
  
    } else {
      contentDiv.style.cssText = ''; 
       if(userAccountDiv){
            userAccountDiv.style.cssText = '';
        }
      }
  
      
  }
  
  
const buttonData = [
   {
       text: "Info", content: `
       <div style="padding: 15px; background-color: #2a2b2c; border-radius: 8px;">
       <h2 style="; margin-bottom: 10px;">RoValra Infomation!</h2>
       <p style="">RoValra is an extension that's trying to make basic QoL features free and accessible to everyone, by making everything completely open-source.</p>
       <div style="margin-top: 5px;">
           <p style="">This is possible by running everything locally.</p>
           <div style="margin-top: 5px;">
           <p style="">If you have any feature suggestions please let me know in my Discord server or via GitHub</p>
           <div style="margin-top: 5px;">
           <p style="">Also this settings page will get a bunch of improvements in a future update!</p>
           </div>
       <div style="margin-top: 10px;">
               <a href="https://discord.gg/GHd5cSKJRk" target="_blank">Discord Server</a>
               <a href="https://github.com/NotValra/RoValra" target="_blank">
               Github Repo
               <img src="${chrome.runtime.getURL("Assets/icon-128.png")}" style="width: 20px; height: 20px; margin-left: 5px; vertical-align: middle;" />
               </a>
       </div>
   </div>
   `},
   {
    //ngl no idea why there is two of htesem the ai told me to so i listen.
       text: "Credits", content: `
           <div style="padding: 15px; background-color: #2a2b2c; border-radius: 8px;">
               <h2 style=" margin-bottom: 10px;">RoValra Credits!</h2>
               <ul style=" margin-top: 10px; padding-left: 0px;">
                   <li style="margin-bottom: 8px;">The sales and revenue feature is only possible because of <b style="font-weight: bold;">Frames.</b>
                       <a href="https://github.com/workframes/roblox-owner-counts" target="_blank">GitHub Repo</a>
                   </li>
                   <li style="margin-bottom: 8px;">The Region searcher was originally a Python script made by <b style="font-weight: bold;">l5se</b> on Discord, that I recoded in Python and then in JS.</li>
                   <li style="margin-bottom: 8px;">Thanks to <b style="font-weight: bold;">Aspect</b> for helping me out here and there when I had a bunch of dumb questions or problems.
                       <a href="https://github.com/Aspectise" target="_blank">GitHub</a>
                       <a href="https://discord.gg/U75BFsV49z" target="_blank">Discord</a>
                   </li>
                   <li style="margin-bottom: 8px;">Thanks to <b style="font-weight: bold;">7_lz</b> on Discord for helping me a bunch when preparing for the Chrome Web Store release. They helped a ton and I'm very thankful.</li>
                   <li style="margin-bottom: 8px;">And thanks to <b style="font-weight: bold;">Coweggs</b> for coming up with the very funny name that is "RoValra" as a joke that I then ended up using.</li>
               </ul>
           </div>
       `},
   {
       text: "Settings", content: ""
   },

];
addCustomButton();
startObserver();
checkRoValraPage()