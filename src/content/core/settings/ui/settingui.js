import { getAssets } from '../../assets.js';
import { SETTINGS_CONFIG } from '../settingConfig.js';
import { generateSettingsUI } from '../generateSettings.js';
import { applyTheme } from '../../../features/settings/index.js';
import { createDropdown } from '../../ui/dropdown.js'; 


export function buildSettingsPage({ handleSearch, debounce, loadTabContent, buttonData, REGIONS, initSettings }) {
    const assets = getAssets();
    const containerMain = document.querySelector('main.container-main');
    if (!containerMain) {
        console.error("RoValra: Main container not found. Cannot build settings page.");
        return {};
    }

    const roproThemeFrame = containerMain.querySelector('#roproThemeFrame');
    let roproThemeFrameHTML = roproThemeFrame ? roproThemeFrame.outerHTML : '';
    containerMain.innerHTML = roproThemeFrameHTML;

    let reactUserAccountBaseDiv = document.createElement('div');
    reactUserAccountBaseDiv.id = 'react-user-account-base';
    let contentDiv = document.createElement('div');
    contentDiv.classList.add('content');
    contentDiv.id = 'content';
    let userAccountDiv = document.createElement('div');
    userAccountDiv.classList.add('row', 'page-content', 'new-username-pwd-rule');
    userAccountDiv.id = 'user-account';

    let headerContainer = document.createElement('div');
    headerContainer.style.cssText = 'display: flex; align-items: center; justify-content: center; margin-bottom: 20px;';

    let rovalraIcon = document.createElement('img');
    rovalraIcon.src = assets.rovalraIcon;
    rovalraIcon.style.cssText = 'width: 35px; height: 35px; margin-left: 5px;  user-select: none;'; 

    let rovalraHeader = document.createElement('h1');
    rovalraHeader.textContent = 'RoValra Settings';
    rovalraHeader.style.margin = '0';
    rovalraHeader.style.color = 'var(--rovalra-main-text-color)'; 

    headerContainer.appendChild(rovalraHeader);
    rovalraHeader.appendChild(rovalraIcon);
    
    let settingsContainer = document.createElement('div');
    settingsContainer.id = 'settings-container';

    userAccountDiv.appendChild(reactUserAccountBaseDiv);
    reactUserAccountBaseDiv.appendChild(headerContainer);
    reactUserAccountBaseDiv.appendChild(settingsContainer);
    contentDiv.appendChild(userAccountDiv);
    containerMain.appendChild(contentDiv);

    contentDiv.style.cssText = `width: 100% !important; height: auto !important; border-radius: 10px !important; overflow: hidden !important; padding-bottom: 25px !important; padding-top: 25px !important; min-height: 800px !important; position: relative !important;`;
    
    if (userAccountDiv) {
        userAccountDiv.style.cssText = `display: flex !important; flex-direction: column !important; align-items: center !important; justify-content: center !important; padding-left: 0px !important; padding-right: 0px !important; margin-left: auto !important; margin-right: auto !important; width: 100% !important;`;
    }


    const mobileMenuContainer = document.createElement('div');
    mobileMenuContainer.id = 'rovalra-mobile-menu-container';
    mobileMenuContainer.style.width = '100%'; 
    
    settingsContainer.appendChild(mobileMenuContainer);


    const renderMobileDropdown = () => {
        mobileMenuContainer.innerHTML = ''; 

        const urlParams = new URLSearchParams(window.location.search);
        const initialTab = urlParams.get('rovalra') || 'info';
        const dropdownItems = [];
        
        buttonData.filter(item => item.text === "Info" || item.text === "Credits").forEach(item => {
            dropdownItems.push({
                value: item.text.toLowerCase(),
                label: item.text
            });
        });
        
        Object.keys(SETTINGS_CONFIG).forEach(sectionName => {
            dropdownItems.push({
                value: sectionName.toLowerCase(),
                label: SETTINGS_CONFIG[sectionName].title
            });
        });

        const mobileDropdown = createDropdown({
            items: dropdownItems,
            initialValue: initialTab,
            placeholder: 'Select Setting...',
            onValueChange: async (value) => {
                const newUrl = new URL(window.location.href);
                if (newUrl.searchParams.get('rovalra') !== value) {
                    newUrl.searchParams.set('rovalra', value);
                    history.pushState(null, '', newUrl.pathname + newUrl.search);
                }


                const selectedItem = dropdownItems.find(item => item.value === value);
                
                if (selectedItem) {
                    const textSpan = mobileDropdown.trigger.querySelector('.text-truncate-split span') || mobileDropdown.trigger.querySelector('span');
                    if (textSpan) {
                        textSpan.textContent = selectedItem.label;
                    }
                }

                await loadTabContent(value);
                stripInlineStyles(document.getElementById('content-container'));
            }
        });

        mobileDropdown.element.style.width = '100%';
        mobileDropdown.element.style.display = 'block';
        mobileDropdown.trigger.style.width = '100%';
        mobileMenuContainer.appendChild(mobileDropdown.element);
        
        const currentItem = dropdownItems.find(item => item.value === initialTab);
        if (currentItem) {
             const textSpan = mobileDropdown.trigger.querySelector('.text-truncate-split span') || mobileDropdown.trigger.querySelector('span');
             if (textSpan) textSpan.textContent = currentItem.label;
        }
    };

    renderMobileDropdown();



    const uiContainer = document.createElement('div');
    uiContainer.id = 'rovalra-ui-container'; 
    uiContainer.style.cssText = 'display: flex; flex-direction: row; gap: 10px; align-items: flex-start; position: relative; overflow: visible; width: 100%; justify-content: flex-start;';
    
    settingsContainer.appendChild(uiContainer);
    settingsContainer.style.cssText = 'display: block; position: relative; overflow: visible; width: 100%;';

    settingsContainer.insertAdjacentElement("afterbegin", rovalraHeader);

    injectSettingsStyles();

    uiContainer.innerHTML = '';

    const contentContainer = document.createElement('div');
    contentContainer.id = 'content-container';

    contentContainer.style.cssText = `
        width: 800px; 
        flex-shrink: 0;
        overflow-y: auto; 
        overflow-x: auto; 
        padding-left: 0px; 
        z-index: 1000; 
        position: relative; 
        margin-top: 7px; 
        background-color: transparent; 
        min-width: 0;
    `;

    let devTabAdded = false;
    const unifiedMenu = createUnifiedMenu({ handleSearch, debounce, buttonData, devTabAdded, loadTabContent, REGIONS, initSettings });

    rovalraIcon.addEventListener('click', () => {
        let rovalraIconClickCount = (rovalraIcon.dataset.clickCount || 0) * 1;
        rovalraIconClickCount++;
        rovalraIcon.dataset.clickCount = rovalraIconClickCount;

        if (rovalraIconClickCount >= 10 && !devTabAdded) {
            devTabAdded = true;
            addDeveloperTab({ 
                REGIONS, 
                initSettings, 
                menuList: unifiedMenu, 
                loadTabContent, 
                renderMobileDropdown 
            });
        }
    });

    uiContainer.appendChild(unifiedMenu);
    uiContainer.appendChild(contentContainer);

    return { rovalraHeader, settingsContainer, contentDiv, userAccountDiv };
}

function stripInlineStyles(container) {
    if (!container) return;
    const selectors = ['.setting', '.setting-description', '.setting-controls', '.setting-label-divider', 'label', 'span', 'div'];
    const elements = container.querySelectorAll(selectors.join(','));
    elements.forEach(el => {
        if (el.style.color) el.style.removeProperty('color');
        if (el.style.backgroundColor) el.style.removeProperty('background-color');
    });
}

function createUnifiedMenu({ handleSearch, debounce, buttonData, devTabAdded, loadTabContent, REGIONS, initSettings }) {
    const menuList = document.createElement('ul');
    menuList.id = 'unified-menu';
    menuList.className = 'menu-vertical rovalra-sidebar';
    menuList.setAttribute('role', 'tablist');
    
    const searchListItem = document.createElement('li');
    searchListItem.id = 'search-tab';
    searchListItem.className = 'menu-option search-container';
    searchListItem.style.padding = '0px';
    searchListItem.style.marginBottom = '10px';

    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.id = 'settings-search-input';
    searchInput.placeholder = 'Search Settings...';
    searchInput.style.cssText = 'width: 89%; padding: 8px; border-radius: 0px; font-size: 14px; border: 0px solid var(--rovalra-container-background-color) !important; background: transparent !important; color: var(--rovalra-main-text-color) !important;';
    

    const performSearch = debounce((query) => {
        try {

            const mockEvent = { 
                target: { 
                    value: query 
                } 
            };
            handleSearch(mockEvent);
        } catch (error) {
            console.warn("RoValra: Search handler failed:", error);
        }
    }, 300);

    searchInput.addEventListener('input', (e) => {

        performSearch(e.target.value);
    });

    searchInput.addEventListener('focus', () => {
        document.querySelectorAll('#unified-menu .menu-option-content').forEach(el => {
            el.classList.remove('active');
            el.removeAttribute('aria-current');
        });
        const newUrl = new URL(window.location.href);
        if (newUrl.searchParams.get('rovalra') !== 'search') {
            newUrl.searchParams.set('rovalra', 'search');
            history.pushState(null, '', newUrl.pathname + newUrl.search);
        }
    });

    searchListItem.appendChild(searchInput);
    menuList.appendChild(searchListItem);

    const staticItems = buttonData.filter(item => item.text === "Info" || item.text === "Credits");
    staticItems.forEach(item => {
        const listItem = document.createElement('li');
        listItem.id = `${item.text.toLowerCase()}-tab`;
        listItem.dataset.text = item.text;
        listItem.className = 'menu-option';
        listItem.setAttribute('role', 'tab');
        const link = document.createElement('a');
        link.className = 'menu-option-content';
        link.href = `#!/${item.text.toLowerCase()}`;
        const span = document.createElement('span');
        span.className = 'font-caption-header';
        span.textContent = item.text;
        link.appendChild(span);
        listItem.appendChild(link);
        menuList.appendChild(listItem);
        link.addEventListener('click', async (e) => {
            e.preventDefault();
            const newHashKey = item.text.toLowerCase();
            const newUrl = new URL(window.location.href);
            if (newUrl.searchParams.get('rovalra') !== newHashKey) {
                newUrl.searchParams.set('rovalra', newHashKey);
                history.pushState(null, '', newUrl.pathname + newUrl.search);
            }
            await loadTabContent(newHashKey);
            stripInlineStyles(document.getElementById('content-container'));
            
            const dropdownTrigger = document.querySelector('#rovalra-mobile-menu-container .rovalra-dropdown-trigger span');
            if(dropdownTrigger) dropdownTrigger.textContent = item.text;
        });
    });

    const separator = document.createElement('li');
    separator.classList.add('menu-separator');
    separator.style.cssText = 'height: 1px; background-color: var(--rovalra-secondary-text-color); opacity: 0.3; margin: 10px 0;';
    separator.setAttribute('role', 'separator');
    menuList.appendChild(separator);

    Object.keys(SETTINGS_CONFIG).forEach(sectionName => {
        if (sectionName === "Developer" && !devTabAdded) return;
        const listItem = createSidebarItem(sectionName, SETTINGS_CONFIG[sectionName].title, loadTabContent);
        menuList.appendChild(listItem);
    });
    return menuList;
}

function createSidebarItem(sectionName, title, loadTabContent) {
    const listItem = document.createElement('li');
    listItem.id = `${sectionName.toLowerCase()}-tab`;
    listItem.dataset.section = sectionName;
    listItem.setAttribute('role', 'tab');
    listItem.classList.add('menu-option');

    const link = document.createElement('a');
    link.classList.add('menu-option-content');
    link.href = `#!/${sectionName.toLowerCase()}`;

    const span = document.createElement('span');
    span.classList.add('font-caption-header');
    span.textContent = title;
    link.appendChild(span);
    listItem.appendChild(link);

    link.addEventListener('click', async function(e) {
        e.preventDefault();
        document.querySelectorAll('#unified-menu .menu-option-content').forEach(el => {
            el.classList.remove('active');
            el.removeAttribute('aria-current');
        });
        this.classList.add('active');
        this.setAttribute('aria-current', 'page');

        const newUrl = new URL(window.location.href);
        if (newUrl.searchParams.get('rovalra') !== sectionName.toLowerCase()) {
            newUrl.searchParams.set('rovalra', sectionName.toLowerCase());
            history.pushState(null, '', newUrl.pathname + newUrl.search);
        }

        await loadTabContent(sectionName);
        stripInlineStyles(document.getElementById('content-container'));
        
        const dropdownTrigger = document.querySelector('#rovalra-mobile-menu-container .rovalra-dropdown-trigger span');
        if(dropdownTrigger) dropdownTrigger.textContent = title;
    });

    return listItem;
}

function addDeveloperTab({ REGIONS, initSettings, menuList, loadTabContent, renderMobileDropdown }) {
    SETTINGS_CONFIG.Developer = {
        title: "Developer",
        settings: {
            info: {
                label: ["Developer Settings"],
                description: ["These are featured used mostly to develop rovalra, if you don't know what your doing dont touch them."],
                type: "YOUR MOM!!!!!"
            },
            EnablebannerTest: {
                label: ["Banner test"],
                description: ["This adds a test banner to experiences"],
                type: "checkbox",
                default: false
            },
            impersonateRobloxStaffSetting: {
                label: ["Impersonate User Option On Profiles"],
                description: ["This enables the 'Impersonate User' option on peoples profile, used by Roblox internally.",
                    "Pressing the 'Impersonate User' option does nothing other than error unless you are authorized to use it"
                ],
                type: "checkbox",
                default: false
            },
            EarlyAccessProgram: {
                label: ["Early Access Program Showcase"],
                description: ["This will trick Roblox into thinking you are in an early access program, making Roblox add the early access program UI to your settings",
                    "This setting wont allow you to join any early access programs you werent invited to.",
                    "This will also overwrite any early access programs you might already be in."
                ],
                type: "checkbox",
                default: false
            },
            EnableVideoTest: {
                label: ["Video test"],
                description: ["This adds a video test for experience trailers not uploaded to youtube on https://www.roblox.com/videotest",
                    "Since this feature is only supported on the client."
                ],
                type: "checkbox",
                default: false
            },
            onboardingShown: {
                label: ["Show onboarding"],
                description: ["This will show RoValra's onboarding screen again when this setting is disabled."],
                type: "checkbox",
                default: false
            },
            simulateRoValraServerErrors: {
                label: ["Simulate RoValra Server Errors / downtime"],
                description: ["This will simulate RoValra Server errors / downtime, useful when testing how the extension handles stuff like that."],
                type: "checkbox",
                default: false
            },
            ShowBadgesEverywhere: {
                label: ["Show badges everywhere"],
                description: ["This is just a fun setting that will show RoValra badges on any profile"],
                type: "checkbox",
                default: false
            }

        }
    };

    if (menuList && loadTabContent) {
        const devItem = createSidebarItem("Developer", "Developer", loadTabContent);
        
        devItem.style.opacity = '0';
        devItem.style.transition = 'opacity 0.5s ease';
        
        menuList.appendChild(devItem);
        
        requestAnimationFrame(() => {
            devItem.style.opacity = '1';
        });
    }

    if (typeof renderMobileDropdown === 'function') {
        renderMobileDropdown();
    }
}


export function injectSettingsStyles() {
    const style = document.createElement('style');
    style.textContent = `
        body, .font-caption-header, .rovalra-header {
            color: var(--rovalra-main-text-color) !important;
        }

        .rovalra-sidebar {
            width: 160px;
            flex-shrink: 0;
        }

        #rovalra-mobile-menu-container {
            display: none;
            margin-bottom: 20px;
            z-index: 2000;
            position: relative;
        }

        #settings-search-input { 
            transition: border-color 0.2s ease-in-out; 
            color: var(--rovalra-main-text-color) !important;
            background-color: var(--rovalra-container-background-color) !important;
        }
        
        body.rovalra-settings-loading main.container-main {
            visibility: hidden;
        }
        
        #settings-search-input:focus {
            outline: none;
            border-color: var(--rovalra-search-focus-border, #0078d4); 
        }

        .setting { 
            display: flex; 
            flex-direction: column; 
            justify-content: space-between; 
            font-size: 16px; 
            margin: 0 0 15px 0; 
            background-color: var(--rovalra-container-background-color) !important;
            color: var(--rovalra-main-text-color) !important;
            border-radius: 0px; 
            padding: 15px; 
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); 
        }

        .setting-controls > label {
            color: var(--rovalra-main-text-color) !important;
            margin-right: 10px; 
            font-weight: bold;
        }
        
        .setting-controls {
            display: flex; 
            align-items: center; 
            margin-bottom: 8px;
            color: var(--rovalra-main-text-color) !important; 
        }
        
        .child-setting-item { display: flex; flex-direction: column; margin-left: 10px; margin-top: 5px; padding-top: 0px; }
        .child-setting-separator { height: 1px; background-color: var(--rovalra-secondary-text-color); opacity: 0.2; margin-top: 10px; margin-bottom: 10px; }
        
        .setting-description { margin-bottom: 10px; color: var(--rovalra-secondary-text-color) !important; }
        .setting-description strong { font-weight: bold; color: var(--rovalra-main-text-color) !important; }
        
        .setting-description code { 
            font-family: monospace; 
            padding: 2px 4px; 
            background-color: rgba(128, 128, 128, 0.15) !important; 
            border-radius: 3px; 
            color: var(--rovalra-main-text-color) !important;
        }
        
        .setting-label-divider { 
            height: 0; 
            border-top: 1px solid var(--rovalra-secondary-text-color) !important; 
            color: transparent !important; 
            opacity: 0.3; 
            margin-top: 0px; 
            margin-bottom: 8px; 
        }
        
        .toggle-switch { position: relative; display: inline-block; width: 42px; height: 24px; flex-shrink: 0; margin-left: auto; }
        .toggle-switch input { opacity: 0; width: 0; height: 0; }
        
        .slider1, .slider { 
            position: absolute; cursor: pointer; top: 0; left: 0; right: 0; 
            background-color: #444; 
            bottom: 0; transition: .4s; border-radius: 12px; width: 42px; 
        }
        .slider1:before, .slider:before { 
            position: absolute; content: ""; height: 20px; width: 20px; left: 2px; bottom: 2px; 
            background-color: #fff; 
            transition: .4s; border-radius: 50%; 
        }
        
        input:checked + .slider1, input:checked + .slider { background-color: #2EA44F; }
        input:checked + .slider1:before, input:checked + .slider:before { transform: translateX(18px); }
        
        .setting-select-input { 
            padding: 8px; border-radius: 4px; 
            border: 1px solid var(--rovalra-secondary-text-color) !important; 
            background-color: var(--rovalra-container-background-color) !important; 
            color: var(--rovalra-main-text-color) !important; 
            max-width: 200px; flex-shrink: 0; margin-left: auto; 
        }
        
        .setting-file-input-container { display: flex; flex-direction: column; align-items: flex-start; max-width: 250px; flex-shrink: 0; margin-left: auto; }
        .setting-file-input { padding: 8px; border-radius: 4px; max-width: 230px; color: var(--rovalra-main-text-color) !important; }
        .setting-separator { display: none; }
        
        .disabled-setting { opacity: 0.5; pointer-events: none; }
        .disabled-setting label { color: var(--rovalra-secondary-text-color) !important; }
        .disabled-setting p { color: var(--rovalra-secondary-text-color) !important; }
        
        .tab-button { white-space: nowrap; margin-left: 0px; }
        
        .setting-section-button, .back-to-main { 
            padding: 10px 16px; 
            border-radius: 8px; 
            border: 1px solid rgba(128,128,128,0.3);
            cursor: pointer; 
            background-color: var(--rovalra-container-background-color) !important; 
            color: var(--rovalra-main-text-color) !important; 
            margin: 0 8px 0 0; 
            font-size: 14px; 
            font-weight: bold; 
            transition: all 0.1s ease; 
        }
        
        .setting-section-button:hover, .back-to-main:hover {
            filter: brightness(1.1);
        }
        .setting-section-button[data-active="true"] { 
            background-color: rgba(128,128,128,0.2) !important; 
            border-color: var(--rovalra-main-text-color) !important;
        }

        .child-setting-item .toggle-switch, .child-setting-item .toggle-switch1 { margin-right: 20px; }

        .setting-description a { text-decoration: underline; }

        a.rovalra-discord-link { color: #3479b7 !important; }
        a.rovalra-roblox-link { color: #c13ad9 !important; }
        a.rovalra-tiktok-link { color: #b91e4dff !important; }
        a.rovalra-github-link { color: #1e722a !important; }
        a.rovalra-review-link { color: #1976d2 !important; }
        a.rovalra-extension-link { color: #0066cc !important; }

        :root.dark-theme a.rovalra-discord-link, :root[data-theme="dark"] a.rovalra-discord-link { color: #7289da !important; }

        @media (max-width: 1000px) {
            #content-container {
                width: 550px !important;
            }
        }

        @media (max-width: 768px) {
            #rovalra-ui-container {
                flex-direction: column !important;
            }

            .rovalra-sidebar {
                display: none !important; 
            }
            
            #rovalra-mobile-menu-container {
                display: block !important;
            }

            #content-container {
                margin-top: 0px !important;
                padding: 5px !important;
                width: 100% !important; 
            }
            
            .content {
                padding-top: 10px !important;
            }
        }
    `;
    document.head.appendChild(style);
}