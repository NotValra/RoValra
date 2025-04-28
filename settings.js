const REGIONS = {
    "AUTO": { city: "Nothing Selected", state: null, country: null },
    "SG": { latitude: 1.3521, longitude: 103.8198, city: "Singapore", state: null, country: "Singapore" },
    "DE": { latitude: 50.1109, longitude: 8.6821, city: "Frankfurt", state: null, country: "Germany" },
    "FR": { latitude: 48.8566, longitude: 2.3522, city: "Paris", state: null, country: "France" },
    "JP": { latitude: 35.6895, longitude: 139.6917, city: "Tokyo", state: null, country: "Japan" },
    "NL": { latitude: 52.3676, longitude: 4.9041, city: "Amsterdam", state: null, country: "Netherlands" },
    "US-CA": { latitude: 34.0522, longitude: -118.2437, city: "Los Angeles", state: "California", country: "United States" },
    "US-VA": { latitude: 38.9577, longitude: -77.1445, city: "Ashburn", state: "Virginia", country: "United States" },
    "US-IL": { latitude: 41.8781, longitude: -87.6298, city: "Chicago", state: "Illinois", country: "United States" },
    "US-TX": { latitude: 32.7767, longitude: -96.7970, city: "Dallas", state: "Texas", country: "United States" },
    "US-FL": { latitude: 25.7617, longitude: -80.1918, city: "Miami", state: "Florida", country: "United States" },
    "US-NY": { latitude: 40.7128, longitude: -74.0060, city: "New York City", state: "New York", country: "United States" },
    "AU": { latitude: -33.8688, longitude: 151.2093, city: "Sydney", state: null, country: "Australia" },
    "GB": { latitude: 51.5074, longitude: -0.1278, city: "London", state: null, country: "United Kingdom" },
    "IN": { latitude: 19.0760, longitude: 72.8777, city: "Mumbai", state: null, country: "India" }
};

const SETTINGS_CONFIG = {
    Catalog: {
        title: "Catalog",
        settings: {
            itemSalesEnabled: {
                label: "Enable Item Sales",
                description: ["This shows the most up to date sales and revenue data we have.", 
                            "The sales data is very likely to be inaccurate on items that are for sale, but very likely to be correct on off sale items."],
                type: "checkbox",
                default: true
            },
            hiddenCatalogEnabled: {
                label: "Enable Hidden Catalog",
                description: ["Shows Roblox made items before they are on the official catalog."],
                type: "checkbox",
                default: true
            }
        }
    },
    Games: {
        title: "Games",
        settings: {
            regionSelectorEnabled: {
                label: "Enable Region Selector",
                description: ["This lets you select a server in a specific region to join."],
                type: "checkbox",
                default: false,
                childSettings: {
                    regionSimpleUi: {
                        label: "Enable Globe UI",
                        description: ["This changes the region selector UI to a globe.",
                                    "WARNING this may be laggy on lower end devices, and the UI is outdated."],
                        type: "checkbox",
                        default: false
                    }
                    
                }
            },
            PreferredRegionEnabled: {
                label: "Enable Preferred Join Region",
                description: ["This adds a play button that joins your preferred region.",
                            "Works independently whether Region Selector is enabled or not."],
                type: "checkbox",
                default: true,
                childSettings: {
                    robloxPreferredRegion: {
                        label: "Preferred Join Region",
                        description: ["Select your preferred region for joining games.",
                                    "This setting works independently of the Region Selector."],
                        type: "select",
                        options: "REGIONS",
                        default: "AUTO"
                    }
                }
            },
            subplacesEnabled: {
                label: "Enable Subplaces",
                description: ["Shows the subplaces of a game."],
                type: "checkbox",
                default: true
            },
            inviteEnabled: {
                label: "Enable Universal Server Invites (disabled for maintenance)",
                description: ["This allows you to invite your friends to the game you're in, without your friend requiring any extension, not even RoValra!",
                            "This will replace RoPros invites.",
                            "This does require you to have BTRoblox for it to work."],
                type: "checkbox",
                default: false,
                disabled: true
            },
            universalSniperEnabled: {
                label: "Enable Universal User Sniper",
                description: ["This allows you to join a user, without needing to be friends with them.",
                            "Only requirement is that you know what game they are playing."],
                type: "checkbox",
                default: true
            }
        }
    },
    Profile: {
        title: "Profile",
        settings: {
            userGamesEnabled: {
                label: "Enable Hidden User Games",
                description: ["Shows a users hidden games on their profile."],
                type: "checkbox",
                default: true
            },
            userSniperEnabled: {
                label: "Enable Instant Joiner",
                description: ["This joins a user instantly when they go into a game, best used for people with a lot of people trying to join them.",
                            "It is recommended that you uninstall the microsoft store version of roblox, if you plan to use this feature.",
                            "This feature requires the user to be friends with you or have their joins on."],
                type: "checkbox",
                default: false
            },
            privateInventoryEnabled: {
                label: "Enable Private Inventory Viewer",
                description: ["This allows you to view a users private inventory, by scanning a lot of items at once, to check if they own them."],
                type: "checkbox",
                default: true,
            }
        }
    },
    Communities: {
        title: "Communities",
        settings: {
            groupGamesEnabled: {
                label: "Enable Hidden Community Games",
                description: ["Shows a communities hidden games."],
                type: "checkbox",
                default: true
            },
            pendingRobuxEnabled: {
                label: "Enable Unpending Robux",
                description: ["Shows an estimate of how many pending Robux will stop pending within 24 hours.",],
                type: "checkbox",
                default: true
            }
        }
    },
    Avatar: {
        title: "Avatar",
        settings: {
            forceR6Enabled: {
                label: "Remove R6 Warning",
                description: ["Removes the R6 warning when switching to R6"],
                type: "checkbox",
                default: true
            },
            fixR6Enabled: {
                label: "Enable R6 Fix (BETA)",
                description: ["Stops Roblox from automatically switching your character to R15 when equiping dynamic heads.",
                            "This requires you to use the english language on Roblox."],
                type: "checkbox",
                default: false
            }
        }
    }
};

function generateSettingsUI(section) {
    let html = '';
    const sectionConfig = SETTINGS_CONFIG[section];
    
    if (!sectionConfig) return '';

    for (const [settingName, setting] of Object.entries(sectionConfig.settings)) {
        html += '<div class="setting">';
        html += `<label style="">${setting.label}</label>`;
        
        setting.description.forEach(desc => {
            html += `<p>${desc}</p>`;
        });

        html += generateSettingInput(settingName, setting);

        if (setting.childSettings) {
            for (const [childName, childSetting] of Object.entries(setting.childSettings)) {
                html += `
                    <div class="setting" id="setting-${childName}" style="margin-left: 20px; margin-top: 10px; border-left: 0px solid #eee; padding-left: 15px;">
                        <label style="">${childSetting.label}</label>
                        ${childSetting.description.map(desc => `<p>${desc}</p>`).join('')}
                        ${generateSettingInput(childName, childSetting)}
                    </div>`;
            }
        }

        html += '<div class="setting-separator"></div></div>';
    }

    return html;
}

function generateSettingInput(settingName, setting) {
    if (setting.type === 'checkbox') {
        const toggleClass = setting.disabled ? 'toggle-switch1' : 'toggle-switch';
        return `
            <label class="${toggleClass}">
                <input type="checkbox" id="${settingName}" data-setting-name="${settingName}"${setting.disabled ? ' disabled' : ''}>
                <span class="${setting.disabled ? 'slider1' : 'slider'}"></span>
            </label>`;
    } else if (setting.type === 'select') {
        let options = '';
        if (setting.options === 'REGIONS') {
            options = Object.keys(REGIONS).map(regionCode =>
                `<option value="${regionCode}">${getFullRegionName(regionCode)}</option>`
            ).join('');
        } else if (Array.isArray(setting.options)) {
            options = setting.options.map(opt => 
                `<option value="${opt.value}">${opt.label}</option>`
            ).join('');
        }
        
        return `
            <select id="${settingName}" data-setting-name="${settingName}" style="width: 100%; padding: 8px; margin-top: 5px; border-radius: 4px; border: 1px solid #555; background-color: #393b3d; color: #eee;">
                ${options}
            </select>`;
    }
    return '';
}

const THEME_CONFIG = {
    light: {
        content: 'rgb(247, 247, 248)',
        text: 'rgb(57, 59, 61)',
        header: 'rgb(40, 40, 40)',
        sliderOn: '#444',
        sliderOff: 'rgba(0, 0, 0, 0.1)',
        sliderButton: '#24292e',
        buttonText: 'rgb(57, 59, 61)',
        buttonBg: 'rgb(242, 244, 245)',
        buttonHover: 'rgb(224, 226, 227)',
        buttonActive: 'rgb(210, 212, 213)',
        buttonBorder: '0 solid rgba(0, 0, 0, 0.1)',
        discordLink: '#3479b7',
        githubLink: '#1e722a'
    },
    dark: {
        content: 'rgb(39, 41, 48)',
        text: 'rgb(189, 190, 190)',
        header: 'white',
        sliderOn: '#ddd',
        sliderOff: 'rgba(0, 0, 0, 0.1)',
        sliderButton: 'white',
        buttonText: 'rgba(255, 255, 255, 0.9)',
        buttonBg: 'rgb(45, 48, 51)',
        buttonHover: 'rgb(57, 60, 64)',
        buttonActive: 'rgb(69, 73, 77)',
        buttonBorder: '0px solid rgba(255, 255, 255, 0.1)',
        discordLink: '#7289da',
        githubLink: '#2dba4e'
    }
};

let domCache = new Map();

function getElement(selector, parent = document) {
    if (!domCache.has(selector)) {
        domCache.set(selector, parent.querySelector(selector));
    }
    return domCache.get(selector);
}

function getElements(selector, parent = document) {
    const key = `multiple:${selector}`;
    if (!domCache.has(key)) {
        domCache.set(key, parent.querySelectorAll(selector));
    }
    return domCache.get(key);
}

function getFullRegionName(regionCode) {
    const regionData = REGIONS[regionCode];
    if (!regionData) {
        return regionCode;
    }
    if (regionCode === "AUTO") return regionData.city;

    let parts = [];
    if (regionData.city && regionData.city !== regionData.country) parts.push(regionData.city);
    if (regionData.state && regionData.country === "United States") parts.push(regionData.state);
    if (regionData.country) parts.push(regionData.country);
    parts = [...new Set(parts.filter(p => p))];
    if (parts.length > 1 && parts[parts.length - 1] === "United States") parts[parts.length - 1] = "USA";
    return parts.join(', ') || regionCode;
}

let currentTheme = 'light';
let observer = null;
let isChecking = false;
let popoverButtonCheckTimeout = null;
let isPopoverButtonAdding = false;
let rovalraButtonAdded = false;
let isSettingsPage = false;
let settingsSyncInterval = null;

const syncSettingsVisualState = async () => {
    const settingsContent = document.querySelector('#setting-section-content');
    if (settingsContent && window.location.href.includes('?rovalra=info')) {
        await initSettings(settingsContent);
    }
};

const startSettingsSync = () => {
    if (settingsSyncInterval) {
        clearInterval(settingsSyncInterval);
    }
    settingsSyncInterval = setInterval(syncSettingsVisualState, 30000);
};

const stopSettingsSync = () => {
    if (settingsSyncInterval) {
        clearInterval(settingsSyncInterval);
        settingsSyncInterval = null;
    }
};

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && window.location.href.includes('?rovalra=info')) {
        syncSettingsVisualState();
    }
});

const fetchThemeFromAPI = async () => {
    try {
        const response = await fetch('https://apis.roblox.com/user-settings-api/v1/user-settings', {
            credentials: 'include'
        });
        if (!response.ok) {
            console.error('Failed to fetch theme from API:', response.status, response.statusText);
            return 'light';
        }
        const data = await response.json();
        if (data && data.themeType) {
            return data.themeType.toLowerCase();
        } else {
            console.warn('Theme data from API is unexpected:', data);
            return 'light';
        }
    } catch (error) {
        console.error('Error fetching theme from API:', error);
        return 'light';
    }
};

function updateThemeStyles_settingsPage(theme) {
    const isDarkMode = theme === 'dark';
    
    const colors = {
        dark: {
            button: {
                base: 'rgb(45, 48, 51)',
                hover: 'rgb(57, 60, 64)',
                active: 'rgb(69, 73, 77)',
                text: 'rgb(230, 230, 230)'
            },
            select: {
                bg: 'rgb(45, 48, 51)',
                border: 'rgb(69, 73, 77)',
                text: 'rgb(230, 230, 230)'
            }
        },
        light: {
            button: {
                base: 'rgb(242, 244, 245)',
                hover: 'rgb(234, 236, 237)',
                active: 'rgb(224, 226, 227)',
                text: 'rgb(57, 59, 61)'
            },
            select: {
                bg: 'rgb(255, 255, 255)',
                border: 'rgb(224, 226, 227)',
                text: 'rgb(57, 59, 61)'
            }
        }
    };

    const currentColors = colors[isDarkMode ? 'dark' : 'light'];
    
    const buttons = document.querySelectorAll('.setting-section-button');
    buttons.forEach(button => {
        Object.assign(button.style, {
            padding: '10px 16px',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            transition: 'all 0.2s ease',
            margin: '0 8px 0 0',
            fontFamily: 'Gotham SSm A, Gotham SSm B, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
            backgroundColor: currentColors.button.base,
            color: currentColors.button.text
        });

        if (button.dataset.active === 'true') {
            button.style.backgroundColor = currentColors.button.active;
        }

        button.addEventListener('mouseenter', function() {
            if (this.dataset.active !== 'true') {
                this.style.backgroundColor = currentColors.button.hover;
                this.style.transform = 'translateY(-1px)';
            }
        });

        button.addEventListener('mouseleave', function() {
            if (this.dataset.active !== 'true') {
                this.style.backgroundColor = currentColors.button.base;
                this.style.transform = 'translateY(0)';
            }
        });
    });

    const regionSelect = document.querySelector('#preferredRegionSelect');
    if (regionSelect) {
        Object.assign(regionSelect.style, {
            width: '100%',
            padding: '10px 12px',
            borderRadius: '8px',
            fontSize: '14px',
            fontFamily: 'Gotham SSm A, Gotham SSm B, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
            transition: 'all 0.2s ease',
            backgroundColor: currentColors.select.bg,
            color: currentColors.select.text,
            border: `1px solid ${currentColors.select.border}`
        });
    }
}

function updateThemeStyles_rovalraPage(theme) {
    const isDarkMode = theme === 'dark';
    const contentColor = isDarkMode ? 'rgb(39, 41, 48)' : 'rgb(247, 247, 248)';
    const textColor = isDarkMode ? 'rgb(189, 190, 190)' : 'rgb(96, 97, 98)';
    const headerColor = isDarkMode ? '' : 'rgb(40, 40, 40)';
    const discordLinkColor = isDarkMode ? '#7289da' : '#3479b7';
    const githubLinkColor = isDarkMode ? '#2dba4e' : '#1e722a';

    const contentContainer = document.querySelector('#content-container');
    const rovalraHeader = contentContainer?.querySelector('#react-user-account-base > h1');

    if (contentContainer) {
        contentContainer.style.borderRadius = '8px';
        contentContainer.style.backgroundColor = contentColor;

        contentContainer.querySelectorAll('div, span, li, b, p, h2, h1, button').forEach(element => {
            const computedStyle = window.getComputedStyle(element);
            const elementColor = computedStyle.color;
            if (elementColor === 'rgb(0, 0, 0)' || elementColor === 'rgb(255, 255, 255)') {
                element.style.setProperty('color', textColor, 'important');
            }
        });

        contentContainer.querySelectorAll('h2').forEach(h2Element => {
            if(isDarkMode){
                h2Element.style.setProperty('color', 'white', 'important');
            } else{
                h2Element.style.removeProperty('color')
            }
        });

        const allLinks = contentContainer.querySelectorAll('a');
        allLinks.forEach(link => {
            link.style.setProperty('text-decoration', 'underline', 'important');
            link.style.setProperty('font-weight', 'bold', 'important');
            link.style.setProperty('transition', 'color 0.3s ease', 'important');

            link.addEventListener('mouseenter', function() {
                const computedColor = window.getComputedStyle(this).color;
                const lighterColor = lightenColor(computedColor, 0.2);
                this.style.setProperty('color', lighterColor, 'important');
            });
            link.addEventListener('mouseleave', function() {
                if (this.href.includes('discord.gg')) {
                    this.style.setProperty('color', discordLinkColor, 'important');
                }
                else if(this.href.includes('github.com')) {
                    this.style.setProperty('color', githubLinkColor, 'important');
                } else{
                    this.style.setProperty('color', 'inherit', 'important');
                }
            });
        });


        const discordLinks = contentContainer.querySelectorAll('a[href*="discord.gg"]');
        discordLinks.forEach(link => {
            link.style.setProperty('color', discordLinkColor, 'important');
        });

        const githubLinks = contentContainer.querySelectorAll('a[href*="github.com"]');
        githubLinks.forEach(link => {
            link.style.setProperty('color', githubLinkColor, 'important');
        });
    }

    if (rovalraHeader) {
        rovalraHeader.style.setProperty('color', headerColor, 'important');
    }
}

function applyTheme() {
    if (window.location.href.includes('/RoValra')) {
        updateThemeStyles_rovalraPage(currentTheme);
    } else if (isSettingsPage) {
        updateThemeStyles_settingsPage(currentTheme);
    }
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
        if (!lastMenuItem) {
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
    if (existingButton) {
        return;
    }
    const newButtonListItem = document.createElement('li');
    newButtonListItem.classList.add('menu-option');
    newButtonListItem.setAttribute('role', 'tab');

    const newButtonLink = document.createElement('a');
    newButtonLink.href = 'https://www.roblox.com/my/account?rovalra=info#!/info';
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

function addPopoverButton() {
    if (isPopoverButtonAdding) {
        return;
    }

    isPopoverButtonAdding = true;

    const popoverMenu = document.getElementById('settings-popover-menu');
    if (!popoverMenu) {
        isPopoverButtonAdding = false; 
        return;
    }

    const existingButton = popoverMenu.querySelector('li.list-item > a > span.font-caption-header[textContent="RoValra Settings"]');
    if (existingButton) {
        isPopoverButtonAdding = false;
        return;
    }

    const existingButtons = popoverMenu.querySelectorAll('li.list-item');
    if (existingButtons.length > 1) {
        for (let i = 1; i < existingButtons.length; i++) {
            existingButtons[i].remove();
        }
    }

    const newButtonListItem = document.createElement('li');
    newButtonListItem.classList.add('list-item', 'menu-option');

    const newButtonLink = document.createElement('a');
    newButtonLink.href = 'https://www.roblox.com/my/account?rovalra=info#!/info';
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
        const popover = document.querySelector('.popover-menu.settings-popover');
        if (popover) {
            popover.style.display = 'none';
        }
    });
    popoverMenu.insertBefore(newButtonListItem, popoverMenu.firstChild);

    isPopoverButtonAdding = false; 
}

function startObserver() {
    if (observer) {
        observer.disconnect();
    }

    const targetElement = document.getElementById('navbar-settings');

    if (!targetElement) {
        return;
    }

    observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
            if (mutation.type === 'childList' || mutation.type === 'subtree') {
                for (const addedNode of mutation.addedNodes) {
                    if (addedNode.nodeType === Node.ELEMENT_NODE) {
                        if (addedNode.id === 'settings-popover-menu' || addedNode.querySelector('#settings-popover-menu')) {
                            addPopoverButton();
                            return; 
                        }
                    }
                }
            }
        }
    });

    observer.observe(targetElement, { childList: true, subtree: true }); 
}

const loadSettings = async () => {
    return new Promise((resolve, reject) => {
        const defaultSettings = {
            hiddenCatalogEnabled: true,
            itemSalesEnabled: true,
            groupGamesEnabled: true,
            userGamesEnabled: true,
            userSniperEnabled: false,
            privateInventoryEnabled: true,
            universalSniperEnabled: true,
            regionSelectorEnabled: true,
            regionSimpleUi: false,
            PreferredRegionEnabled: true,
            robloxPreferredRegion: 'AUTO',
            subplacesEnabled: true,
            forceR6Enabled: true,
            fixR6Enabled: false,
            inviteEnabled: false,
            pendingRobuxEnabled: true
        };

        chrome.storage.local.get(defaultSettings, (settings) => {
            if (chrome.runtime.lastError) {
                console.error('Failed to load settings:', chrome.runtime.lastError);
                reject(chrome.runtime.lastError);
            } else {
                resolve(settings);
            }
        });
    });
};

const handleSaveSettings = async (settingName, value) => {
    if (!settingName) {
        console.error('No setting name provided');
        return Promise.reject(new Error('No setting name provided'));
    }

    try {
        const settings = {};
        settings[settingName] = value;
        
        return new Promise((resolve, reject) => {
            chrome.storage.local.set(settings, () => {
                if (chrome.runtime.lastError) {
                    console.error('Failed to save setting:', settingName, chrome.runtime.lastError);
                    reject(chrome.runtime.lastError);
                } else {
                    resolve();
                }
            });
        });
    } catch (error) {
        console.error(`Error saving setting ${settingName}:`, error);
        return Promise.reject(error);
    }
};

const initSettings = async (settingsContent) => {
    if (!settingsContent) {
        console.error("settingsContent is null in initSettings! Check HTML structure.");
        return; 
    }
    const settings = await loadSettings();

    if (settings) {
        // Dynamically find all settings from SETTINGS_CONFIG and set their values
        for (const sectionName in SETTINGS_CONFIG) {
            const section = SETTINGS_CONFIG[sectionName];
            for (const [settingName, setting] of Object.entries(section.settings)) {
                const element = settingsContent.querySelector(`#${settingName}`);
                if (element) {
                    if (setting.type === 'checkbox') {
                        element.checked = settings[settingName] !== undefined ? settings[settingName] : setting.default;
                    } else if (setting.type === 'select') {
                        element.value = settings[settingName] || setting.default;
                    }
                } else {
                    console.warn(`#${settingName} not found in settingsContent in initSettings`);
                }

                // Handle child settings if they exist
                if (setting.childSettings) {
                    for (const [childName, childSetting] of Object.entries(setting.childSettings)) {
                        const childElement = settingsContent.querySelector(`#${childName}`);
                        if (childElement) {
                            if (childSetting.type === 'checkbox') {
                                childElement.checked = settings[childName] !== undefined ? settings[childName] : childSetting.default;
                            } else if (childSetting.type === 'select') {
                                childElement.value = settings[childName] || childSetting.default;

                                // Special handling for region select
                                if (childName === 'robloxPreferredRegion' && childElement.options.length === 0) {
                                    Object.keys(REGIONS).forEach(regionCode => {
                                        const option = document.createElement('option');
                                        option.value = regionCode;
                                        option.textContent = getFullRegionName(regionCode);
                                        childElement.appendChild(option);
                                    });
                                }
                            }
                        } else {
                            console.warn(`#${childName} not found in settingsContent in initSettings`);
                        }
                    }
                }
            }
        }
    }
};

async function updateContent(buttonInfo, contentContainer, buttonData) {
    const isDarkMode = currentTheme === 'dark';
    const contentColor = isDarkMode ? 'rgb(39, 41, 48)' : 'rgb(247, 247, 248)';
    const textColor = isDarkMode ? 'rgb(189, 190, 190)' : 'rgb(96, 97, 98)';
    const headerColor = isDarkMode ? '' : 'rgb(40, 40, 40)';
    const discordLinkColor = isDarkMode ? '#7289da' : '#3479b7';
    const githubLinkColor = isDarkMode ? '#2dba4e' : '#1e722a';

    if (typeof buttonInfo === 'object' && buttonInfo !== null && buttonInfo.content) {
        contentContainer.innerHTML = buttonInfo.content;
        contentContainer.style.borderRadius = '8px';
        contentContainer.style.backgroundColor = contentColor;

        if (window.location.href.includes('/RoValra')) {
            contentContainer.querySelectorAll('div, span, li, b').forEach(element => {
                const computedStyle = window.getComputedStyle(element);
                const elementColor = computedStyle.color;
                if (elementColor === 'rgb(0, 0, 0)' || elementColor === 'rgb(255, 255, 255)') {
                    element.style.setProperty('color', textColor, 'important');
                }
            });

            contentContainer.querySelectorAll('h2').forEach(h2Element => {
                if(isDarkMode){
                    h2Element.style.setProperty('color', 'white', 'important');
                } else{
                    h2Element.style.removeProperty('color')
                }
            });
        }

        const allLinks = contentContainer.querySelectorAll('a');
        allLinks.forEach(link => {
            link.style.setProperty('text-decoration', 'underline', 'important');
            link.style.setProperty('font-weight', 'bold', 'important');
            link.style.setProperty('transition', 'color 0.3s ease', 'important');

            link.addEventListener('mouseenter', function() {
                const computedColor = window.getComputedStyle(this).color;
                const lighterColor = lightenColor(computedColor, 0.2);
                this.style.setProperty('color', lighterColor, 'important');
            });
            link.addEventListener('mouseleave', function() {
                if (this.href.includes('discord.gg')) {
                    this.style.setProperty('color', discordLinkColor, 'important');
                }
                else if(this.href.includes('github.com')) {
                    this.style.setProperty('color', githubLinkColor, 'important');
                } else{
                    this.style.setProperty('color', 'inherit', 'important');
                }
            });
        });

        const discordLinks = contentContainer.querySelectorAll('a[href*="discord.gg"]');
        discordLinks.forEach(link => {
            link.style.setProperty('color', discordLinkColor, 'important');
        });

        const githubLinks = contentContainer.querySelectorAll('a[href*="github.com"]');
        githubLinks.forEach(link => {
            link.style.setProperty('color', githubLinkColor, 'important');
        });
    }

    if (rovalraHeader) {
        rovalraHeader.style.setProperty('color', headerColor, 'important');
    }

    if (buttonInfo.text === "Settings") {
        const settingSections = Object.keys(SETTINGS_CONFIG).map(sectionName => ({
            name: SETTINGS_CONFIG[sectionName].title,
            content: generateSettingsUI(sectionName)
        }));
    }
}

function applyTheme() {
    if (window.location.href.includes('/RoValra')) {
        updateThemeStyles_rovalraPage(currentTheme);
    } else if (isSettingsPage) {
        updateThemeStyles_settingsPage(currentTheme);
    }
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
        if (!lastMenuItem) {
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
    if (existingButton) {
        return;
    }
    const newButtonListItem = document.createElement('li');
    newButtonListItem.classList.add('menu-option');
    newButtonListItem.setAttribute('role', 'tab');

    const newButtonLink = document.createElement('a');
    newButtonLink.href = 'https://www.roblox.com/my/account?rovalra=info#!/info';
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

function addPopoverButton() {
    if (isPopoverButtonAdding) {
        return;
    }

    isPopoverButtonAdding = true;

    const popoverMenu = document.getElementById('settings-popover-menu');
    if (!popoverMenu) {
        isPopoverButtonAdding = false; 
        return;
    }

    const existingButton = popoverMenu.querySelector('li.list-item > a > span.font-caption-header[textContent="RoValra Settings"]');
    if (existingButton) {
        isPopoverButtonAdding = false;
        return;
    }

    const existingButtons = popoverMenu.querySelectorAll('li.list-item');
    if (existingButtons.length > 1) {
        for (let i = 1; i < existingButtons.length; i++) {
            existingButtons[i].remove();
        }
    }

    const newButtonListItem = document.createElement('li');
    newButtonListItem.classList.add('list-item', 'menu-option');

    const newButtonLink = document.createElement('a');
    newButtonLink.href = 'https://www.roblox.com/my/account?rovalra=info#!/info';
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
        const popover = document.querySelector('.popover-menu.settings-popover');
        if (popover) {
            popover.style.display = 'none';
        }
    });
    popoverMenu.insertBefore(newButtonListItem, popoverMenu.firstChild);

    isPopoverButtonAdding = false; 
}

function startObserver() {
    if (observer) {
        observer.disconnect();
    }

    const targetElement = document.getElementById('navbar-settings');

    if (!targetElement) {
        return;
    }

    observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
            if (mutation.type === 'childList' || mutation.type === 'subtree') {
                for (const addedNode of mutation.addedNodes) {
                    if (addedNode.nodeType === Node.ELEMENT_NODE) {
                        if (addedNode.id === 'settings-popover-menu' || addedNode.querySelector('#settings-popover-menu')) {
                            addPopoverButton();
                            return; 
                        }
                    }
                }
            }
        }
    });

    observer.observe(targetElement, { childList: true, subtree: true }); 
}

async function checkRoValraPage() {
    if (!window.location.href.includes('?rovalra=info')) {
        return;
    }

    const containerMain = document.querySelector('main.container-main');
    if (!containerMain) {
        return;
    }

    const currentHash = window.location.hash.replace('#!/', '').replace('#!', '') || 'info';

    window.removeEventListener('hashchange', handleHashChange);
    
    function handleHashChange() {
        const newHash = window.location.hash.replace('#!/', '').replace('#!', '') || 'info';
        const targetLink = document.querySelector(`#${newHash} .menu-option-content`);
        if (targetLink && !targetLink.classList.contains('active')) {
            document.querySelectorAll('.menu-option-content').forEach(el => {
                el.classList.remove('active');
                el.removeAttribute('aria-current');
            });
            
            targetLink.classList.add('active');
            targetLink.setAttribute('aria-current', 'page');
            
            const buttonData = targetLink.closest('li').buttonData;
            if (buttonData) {
                const contentContainer = document.querySelector('#content-container');
                if (contentContainer) {
                    updateContent(buttonData, contentContainer);
                }
            }
        }
    }
    
    window.addEventListener('hashchange', handleHashChange);

    const roproThemeFrame = containerMain.querySelector('#roproThemeFrame');
    let roproThemeFrameHTML = roproThemeFrame ? roproThemeFrame.outerHTML : '';

    containerMain.innerHTML = roproThemeFrameHTML;

    let reactUserAccountBaseDiv = document.createElement('div');
    reactUserAccountBaseDiv.id = 'react-user-account-base'

    let contentDiv = document.createElement('div')
    contentDiv.classList.add('content')
    contentDiv.id = 'content'

    let userAccountDiv = document.createElement('div')
    userAccountDiv.classList.add('row', 'page-content', 'new-username-pwd-rule')
    userAccountDiv.id = 'user-account';

    let rovalraHeader = document.createElement('h1');
    rovalraHeader.textContent = 'RoValra Settings';

    let settingsContainer = document.createElement('div');
    settingsContainer.id = 'settings-container';

    userAccountDiv.appendChild(reactUserAccountBaseDiv)
    reactUserAccountBaseDiv.appendChild(rovalraHeader)
    reactUserAccountBaseDiv.appendChild(settingsContainer)
    contentDiv.appendChild(userAccountDiv)
    containerMain.appendChild(contentDiv);
    applyTheme();
    if (rovalraHeader && rovalraHeader.textContent === 'RoValra Settings' && settingsContainer) {
        contentDiv.style.cssText = `
            width: 100% !important;
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
                flex-direction: column !important;
                align-items: center !important;
                justify-content: center !important;
                padding-left: 0px !important;
                padding-right: 0px !important;
                margin-left: auto !important;
                margin-right: auto !important;
                width: 100% !important;
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
            .toggle-switch1 {
                position: relative;
                display: inline-block;
                width: 36px;
                height: 20px;
                margin-top: 4px;
                float: right;
                display: none;
            }
            .toggle-switch1 input {
                opacity: 0;
                width: 0;
                height: 0;
            }
                .slider1 {
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
            .slider1:before {
                position: absolute;
                disabled: true;
                content: "";
                height: 18px;
                width: 18px;
                left: 1px;
                bottom: 1px;
                background-color:rgb(255, 255, 255);
                transition: .4s;
                border-radius: 50%;
            }
            input:checked + .slider1 {
                background-color: #2EA44F;
            }

            input:checked + .slider1:before{
                transform: translateX(16px);
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
            .setting-section-button {
                padding: 10px 15px;
                border-radius: 5px;
                border: none;
                cursor: pointer;
                background-color: rgb(57, 59, 61);;
                color: rgba(255, 255, 255, 0.9);
                margin-right: 5px;
                font-size: 14px;
            }

            .setting-section-button[data-active="true"] {
                background-color: rgb(117, 119, 121);
            }
            .setting-section-button:hover:not([data-active="true"]) {
                background-color: rgb(47, 49, 51);;
            }


        `;
        document.head.appendChild(style);
        const buttonData = [
            {
                text: "Info", content: `
                   <div style="padding: 15px; border-radius: 8px;">
                   <h2 style="; margin-bottom: 10px;">RoValra Infomation!</h2>
                   <p style="">RoValra is an extension that's trying to make basic quality of life features free and accessible to everyone, by making everything completely open-source.</p>
                   <div style="margin-top: 5px;">
                       <p style="">This is possible by running almost everything locally.</p>
                       <div style="margin-top: 5px;">
                       <p style="">If you have any feature suggestions please let me know in my Discord server or via GitHub</p>
                       <div style="margin-top: 5px;">
                       <p style="">Feel free to report any bugs big or small to me on GitHub.</p>
                       </div>
                   <div style="margin-top: 10px;">
                           <a href="https://discord.gg/GHd5cSKJRk" target="_blank">Discord Server</a>
                           <a href="https://github.com/NotValra/RoValra" target="_blank">
                           Github Repo
                           <img src="${chrome.runtime.getURL("Assets/icon-128.png")}" style="width: 20px; height: 20px; margin-left: 5px; vertical-align: middle;" />
                           </a>
                           <a href="https://www.roblox.com/games/9676908657/Gamepasses#!/store"style="margin-left: 5px; target="_blank">Support me on Roblox</a>

                   </div>
               </div>
               `},
            {
                text: "Credits", content: `
                    <div style="padding: 15px; border-radius: 8px;">
                        <h2 style="margin-bottom: 10px;">RoValra Credits!</h2>
                        <ul style="margin-top: 10px; padding-left: 0px;">
                            <li style="margin-bottom: 8px; list-style-type: disc; margin-left: 20px;">
                                Thanks to <b style="font-weight: bold;">Frames</b> for somehow getting the Roblox sales and revenue on some items
                                <a href="https://github.com/workframes/roblox-owner-counts" target="_blank">GitHub Repo</a>
                            </li>
                            <li style="margin-bottom: 8px; list-style-type: disc; margin-left: 20px;">
                                Thanks to <b style="font-weight: bold;">Julia</b> for making a repo with all Roblox server ips
                                <a href="https://github.com/RoSeal-Extension/Top-Secret-Thing" target="_blank">GitHub Repo</a>
                            </li>
                            <li style="margin-bottom: 8px; list-style-type: disc; margin-left: 20px;">
                                 Thanks to <b style="font-weight: bold;">Aspect</b> for helping me out here and there when I had a bunch of dumb questions or problems.
                                 <a href="https://github.com/Aspectise" target="_blank">GitHub</a>
                           </li>
                           <li style="margin-bottom: 8px; list-style-type: disc; margin-left: 20px;">
                                Thanks to <b style="font-weight: bold;">l5se</b> for allowing me to use their open source region selector as a template for my extension.
                           </li>

                            <li style="margin-bottom: 8px; list-style-type: disc; margin-left: 20px;">
                                Thanks to <b style="font-weight: bold;">7_lz</b> for helping me a bunch when preparing for the Chrome Web Store release. They helped a ton and I'm very thankful.
                            </li>
                            <li style="margin-bottom: 8px; list-style-type: disc; margin-left: 20px;">
                                Thanks to <b style="font-weight: bold;">mmfw</b> for making the screenshots on the chrome web store.
                                   </li>
                             <li style="margin-bottom: 8px; list-style-type: disc; margin-left: 20px;">
                                Thanks to <b style="font-weight: bold;">Coweggs</b> for coming up with the very funny name that is "RoValra" as a joke that I then ended up using.
                                   </li>
                        </ul>
                         <div style="margin-top: 20px; border-top: 1px solid #444; padding-top: 10px;">
                            <h2 style="margin-bottom: 5px;">Extensions</h2>
                            <p style="margin-bottom: 10px; font-size: 16px;">Valra's personal favorite extensions</p>
                            <ul style="margin-top: 10px; padding-left: 0px;">
                                 <li style="margin-bottom: 8px; list-style-type: disc; margin-left: 20px;">
                                    <a href="https://RoSeal.live" target="_blank">RoSeal🦭</a>
                                     <p style="margin-top: 5px;">Adds so many features that after using it you wont be able to use Roblox without it.</p>
                                </li>
                                <li style="margin-bottom: 8px; list-style-type: disc; margin-left: 20px;">
                                   <a href="https://roqol.io/" target="_blank">RoQoL</a>
                                    <p style="margin-top: 5px;">Adds quite a few nice quality of life changes.</p>
                               </li>
                               <li style="margin-bottom: 8px; list-style-type: disc; margin-left: 20px;">
                                   <a href="https://betterroblox.com/" target="_blank">BetterBlox</a>
                                    <p style="margin-top: 5px;">This extension brings back last online and more features that no other extension has.</p>
                               </li>

                            </ul>
                         </div>
                    </div>
                `},
            {
                text: "Settings", content: `
                <div id="settings-content" style="padding: 15px; background-color:rgba(255, 255, 255, 0); border-radius: 8px;">
                    <div id="setting-section-buttons" style="display: flex; margin-bottom: 20px;">
                        </div>
                    <div id="setting-section-content">
                    </div>
                </div>
                `
            },
        ];

        uiContainer.innerHTML = '';

        const menuList = document.createElement('ul');
        menuList.classList.add('menu-vertical');
        menuList.setAttribute('role', 'tablist');
        menuList.style.width = '160px';

        buttonData.forEach((item, index) => {
            const listItem = document.createElement('li');
            listItem.id = item.text.toLowerCase();
            listItem.setAttribute('role', 'tab');
            listItem.classList.add('menu-option');

            const link = document.createElement('a');
            link.classList.add('menu-option-content');
            link.href = `#!/${item.text.toLowerCase()}`;

            if (item.text.toLowerCase() === currentHash) {
                link.classList.add('active');
                link.setAttribute('aria-current', 'page');
            }

            const span = document.createElement('span');
            span.classList.add('font-caption-header');
            span.textContent = item.text;

            const subtitle = document.createElement('span');
            subtitle.classList.add('rbx-tab-subtitle');

            link.appendChild(span);
            link.appendChild(subtitle);
            listItem.appendChild(link);
            menuList.appendChild(listItem);

            link.addEventListener('click', async function(e) {
                e.preventDefault();
                
                const tabName = item.text.toLowerCase();
                
                menuList.querySelectorAll('.menu-option-content').forEach(el => {
                    el.classList.remove('active');
                    el.removeAttribute('aria-current');
                });

                this.classList.add('active');
                this.setAttribute('aria-current', 'page');

                this.closest('li').buttonData = item;

                const newHash = `#!/${tabName}`;
                if (window.location.hash !== newHash) {
                    history.pushState(null, '', newHash);
                }

                if (item.text === "Settings") {
                    contentContainer.innerHTML = item.content;
                    const settingsContent = contentContainer.querySelector('#setting-section-content');
                    const sectionButtonsContainer = contentContainer.querySelector('#setting-section-buttons');

                    const settingSections = Object.keys(SETTINGS_CONFIG).map(sectionName => ({
                        name: SETTINGS_CONFIG[sectionName].title,
                        content: generateSettingsUI(sectionName)
                    }));
                    
                    sectionButtonsContainer.innerHTML = '';
                    settingSections.forEach((section, index) => {
                        const sectionButton = document.createElement('button');
                        sectionButton.textContent = section.name;
                        sectionButton.classList.add('setting-section-button');
                        sectionButton.dataset.sectionName = section.name;
                        sectionButton.dataset.active = 'false';

                        sectionButton.addEventListener('click', async () => {
                            const previouslyActiveSectionButton = sectionButtonsContainer.querySelector('button[data-active="true"]');
                            if (previouslyActiveSectionButton) {
                                previouslyActiveSectionButton.dataset.active = 'false';
                                previouslyActiveSectionButton.style.backgroundColor = 'rgb(57, 59, 61)';
                            }
                            sectionButton.dataset.active = 'true';
                            sectionButton.style.backgroundColor = 'rgb(117, 119, 121)';
                            settingsContent.innerHTML = section.content;
                            await initSettings(settingsContent);
                            initSettings(settingsContent); 
                            attachSettingListeners(settingsContent); 
                            applyTheme();
                        });
                        sectionButtonsContainer.appendChild(sectionButton);
                    });

                    const defaultSectionButton = sectionButtonsContainer.querySelector('button:first-child');
                    if (defaultSectionButton) {
                        defaultSectionButton.click(); 
                    }

                    function attachSettingListeners(settingsContent) {
                        if (!settingsContent) {
                            console.error("settingsContent is null in attachSettingListeners! Check HTML structure.");
                            return;
                        }

                        function updateDependentUiStates() {
                            // Dynamically find all parent settings that have child settings
                            for (const sectionName in SETTINGS_CONFIG) {
                                const section = SETTINGS_CONFIG[sectionName];
                                for (const [settingName, setting] of Object.entries(section.settings)) {
                                    if (setting.childSettings) {
                                        const parentCheckbox = settingsContent.querySelector(`#${settingName}`);
                                        if (parentCheckbox) {
                                            const isParentEnabled = parentCheckbox.checked;
                                            
                                            for (const [childName, childSetting] of Object.entries(setting.childSettings)) {
                                                const childSettingDiv = settingsContent.querySelector(`#setting-${childName}`);
                                                const childInput = settingsContent.querySelector(`#${childName}`);
                                                
                                                if (childSettingDiv && childInput) {
                                                    childInput.disabled = !isParentEnabled;
                                                    if (isParentEnabled) {
                                                        childSettingDiv.classList.remove('disabled-setting');
                                                    } else {
                                                        childSettingDiv.classList.add('disabled-setting');
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        const checkboxes = settingsContent.querySelectorAll('input[type="checkbox"]');
                        checkboxes.forEach(checkbox => {
                            checkbox.removeEventListener('change', handleCheckboxChange);
                            checkbox.addEventListener('change', handleCheckboxChange);
                        });

                        const selects = settingsContent.querySelectorAll('select');
                        selects.forEach(select => {
                            select.removeEventListener('change', handleSelectChange);
                            select.addEventListener('change', handleSelectChange);
                        });

                        function handleCheckboxChange(event) {
                            const settingName = event.target.dataset.settingName;
                            const value = event.target.checked;
                            handleSaveSettings(settingName, value);
                            updateDependentUiStates();
                        }

                        function handleSelectChange(event) {
                            const settingName = event.target.dataset.settingName;
                            const value = event.target.value;
                            handleSaveSettings(settingName, value);
                        }

                        updateDependentUiStates();

                    }

                    applyTheme();
                } else {
                    await updateContent(item, contentContainer, buttonData);
                    applyTheme();
                }
                applyTheme();
            });
        });

        const contentContainer = document.createElement('div');
        contentContainer.id = 'content-container';
        contentContainer.style.flex = '1';
        contentContainer.style.overflowY = 'auto';
        contentContainer.style.overflowX = 'auto';
        contentContainer.style.paddingLeft = '0px';
        contentContainer.style.zIndex = '1000';
        contentContainer.style.position = 'relative';
        contentContainer.style.marginLeft = '10px';
        contentContainer.style.maxWidth = '750px';
        contentContainer.style.minWidth = '750px';
        contentContainer.style.backgroundColor = currentTheme === 'dark' ? 'rgb(39, 41, 48)' : 'rgb(247, 247, 248)';

        uiContainer.appendChild(menuList);
        uiContainer.appendChild(contentContainer);

        const tabToMatch = menuList.querySelector(`#${currentHash} .menu-option-content`);
        if (tabToMatch) {
            const item = buttonData.find(item => item.text.toLowerCase() === currentHash);
            if (item) {
                tabToMatch.classList.add('active');
                tabToMatch.setAttribute('aria-current', 'page');
                tabToMatch.closest('li').buttonData = item;
                
                const contentContainer = document.querySelector('#content-container');
                if (contentContainer) {
                    if (currentHash === 'settings') {
                        contentContainer.innerHTML = item.content;
                    } else {
                        updateContent(item, contentContainer, buttonData);
                    }
                }
            }
        } else {
            const defaultTab = menuList.querySelector('#info .menu-option-content');
            if (defaultTab) {
                defaultTab.click();
            }
        }
        
        settingsContainer.insertAdjacentElement("afterbegin", rovalraHeader);
        applyTheme();
    } else {
        contentDiv.style.cssText = '';
        const userAccountDiv = contentDiv.querySelector('.row.page-content.new-username-pwd-rule#user-account')
        if(userAccountDiv){
            userAccountDiv.style.cssText = '';
        }
    }
}

async function updateContent(buttonInfo, contentContainer, buttonData) {
    const isDarkMode = currentTheme === 'dark';
    const contentColor = isDarkMode ? 'rgb(39, 41, 48)' : 'rgb(247, 247, 248)';
    const textColor = isDarkMode ? 'rgb(189, 190, 190)' : 'rgb(96, 97, 98)';
    const headerColor = isDarkMode ? '' : 'rgb(40, 40, 40)';
    const discordLinkColor = isDarkMode ? '#7289da' : '#3479b7';
    const githubLinkColor = isDarkMode ? '#2dba4e' : '#1e722a';

    if (typeof buttonInfo === 'object' && buttonInfo !== null && buttonInfo.content) {
        contentContainer.innerHTML = buttonInfo.content;
        contentContainer.style.borderRadius = '8px';
        contentContainer.style.backgroundColor = contentColor;
        if (window.location.href.includes('/RoValra')) {
            contentContainer.querySelectorAll('div, span, li, b').forEach(element => {
                const computedStyle = window.getComputedStyle(element);
                const elementColor = computedStyle.color;
                if (elementColor === 'rgb(0, 0, 0)' || elementColor === 'rgb(255, 255, 255)') {
                    element.style.setProperty('color', textColor, 'important');
                }
            });

            contentContainer.querySelectorAll('h2').forEach(h2Element => {
                if(isDarkMode){
                    h2Element.style.setProperty('color', 'white', 'important');
                } else{
                    h2Element.style.removeProperty('color');
                }
            });
        }

        const allLinks = contentContainer.querySelectorAll('a');
        allLinks.forEach(link => {
            link.style.setProperty('text-decoration', 'underline', 'important');
            link.style.setProperty('font-weight', 'bold', 'important');
            link.style.setProperty('transition', 'color 0.3s ease', 'important');

            link.addEventListener('mouseenter', function() {
                const computedColor = window.getComputedStyle(this).color;
                const lighterColor = lightenColor(computedColor, 0.2);
                this.style.setProperty('color', lighterColor, 'important');
            });
            link.addEventListener('mouseleave', function() {
                if (this.href.includes('discord.gg')) {
                    this.style.setProperty('color', discordLinkColor, 'important');
                }
                else if(this.href.includes('github.com')) {
                    this.style.setProperty('color', githubLinkColor, 'important');
                } else{
                    this.style.setProperty('color', 'inherit', 'important');
                }
            });
        });

        const discordLinks = contentContainer.querySelectorAll('a[href*="discord.gg"]');
        discordLinks.forEach(link => {
            link.style.setProperty('color', discordLinkColor, 'important');
        });

        const githubLinks = contentContainer.querySelectorAll('a[href*="github.com"]');
        githubLinks.forEach(link => {
            link.style.setProperty('color', githubLinkColor, 'important');
        });

        const rovalraHeader = contentContainer.querySelector('#react-user-account-base > h1');
        if (rovalraHeader) {
            rovalraHeader.style.setProperty('color', headerColor, 'important');
        }
    } else {
        contentContainer.innerHTML = '';
    }
    
    if (currentTheme) {
        currentTheme = await fetchThemeFromAPI();
        applyTheme();
    }
}

function lightenColor(color, percent) {
    const rgbMatch = color.match(/rgb\((\d+), (\d+), (\d+)\)/);
    if (!rgbMatch) return color;

    let r = parseInt(rgbMatch[1]);
    let g = parseInt(rgbMatch[2]);
    let b = parseInt(rgbMatch[3]);

    r = Math.min(255, Math.round(r + (255 - r) * percent));
    g = Math.min(255, Math.round(g + (255 - g) * percent));
    b = Math.min(255, Math.round(b + (255 - b) * percent));

    return `rgb(${r}, ${g}, ${b})`;
}

const buttonData = [
    {
        text: "Info", content: `
        <div style="padding: 15px; border-radius: 8px;">
        <h2 style="; margin-bottom: 10px;">RoValra Infomation!</h2>
        <p style="">RoValra is an extension that's trying to make basic QoL features free and accessible to everyone, by making everything completely open-source.</p>
        <div style="margin-top: 5px;">
            <p style="">This is possible by running almost everything locally.</p>
            <div style="margin-top: 5px;">
            <p style="">If you have any feature suggestions please let me know in my Discord server or via GitHub</p>
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
            <div style="padding: 15px; border-radius: 8px;">
                <h2 style=" margin-bottom: 10px;">RoValra Credits!</h2>
                <ul style=" margin-top: 10px; padding-left: 0px;">
                    <li style="margin-bottom: 8px;">The sales and revenue feature is only possible because of <b style="font-weight: bold;">Frames.</b>
                        <a href="https://github.com/workframes/roblox-owner-counts" target="_blank">GitHub Repo</a>
                    </li>
                    <li style="margin-bottom: 8px;">The Region searcher was originally a Python script made by <b style="font-weight: bold;">l5se</b> on Discord, that I recoded in Python and then in JS.</li>
                    <li style="margin-bottom: 8px;">Thanks to <b style="font-weight: bold;">Aspect</b> for helping me out here and there when I had a bunch of dumb questions or problems.
                        <a href="https://github.com/Aspectise" target="_blank">GitHub</a>
                    </li>
                    <li style="margin-bottom: 8px;">Thanks to <b style="font-weight: bold;">7_lz</b> on Discord for helping me a bunch when preparing for the Chrome Web Store release. They helped a ton and I'm very thankful.</li>
                    <li style="margin-bottom: 8px;">And thanks to <b style="font-weight: bold;">Coweggs</b> for coming up with the very funny name that is "RoValra" as a joke that I then ended up using.</li>
                </ul>
            </div>
        `},
    {
        text: "Settings", content: `
        <div id="settings-content" style="padding: 15px; background-color:rgba(255, 255, 255, 0); border-radius: 8px;">
            <div id="setting-section-buttons" style="display: flex; margin-bottom: 20px;">
                </div>
            <div id="setting-section-content">
            </div>
        </div>
        `
    },
];

const settingSections = Object.keys(SETTINGS_CONFIG).map(sectionName => ({
    name: SETTINGS_CONFIG[sectionName].title,
    content: generateSettingsUI(sectionName)
}));

async function initializeExtension() {
    currentTheme = await fetchThemeFromAPI();
    applyTheme();
    observeContentChanges();
    startObserver();
    
    if (window.location.href.includes('?rovalra=info')) {
        startSettingsSync();
    }

    const observer = new MutationObserver((mutations) => {
        if (mutations.some(mutation => mutation.target.nodeName === 'TITLE')) {
            if (window.location.href.includes('?rovalra=info')) {
                startSettingsSync();
            } else {
                stopSettingsSync();
            }
        }
    });
    
    observer.observe(document.querySelector('head'), { childList: true, subtree: true });
    
    checkRoValraPage();
}

if (document.readyState === 'loading') { 
    document.addEventListener('DOMContentLoaded', initializeExtension);
} else {  
    initializeExtension();
}

document.addEventListener('click', (event) => {
    const target = event.target;
    
    if (target.matches('.tab-button, .setting-section-button')) {
        return;
    }

    if (target.matches('input[type="checkbox"]')) {
        const settingName = target.dataset.settingName;
        if (settingName) {
            handleSaveSettings(settingName, target.checked);
        }
    }
});

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

const debouncedApplyTheme = debounce(applyTheme, 250);

const debouncedAddCustomButton = debounce(addCustomButton, 100);
const debouncedAddPopoverButton = debounce(addPopoverButton, 100);

let cachedThemeColors = {};

function updateThemeCache() {
    const isDarkMode = currentTheme === 'dark';
    cachedThemeColors = {
        content: isDarkMode ? 'rgb(39, 41, 48)' : 'rgb(247, 247, 248)',
        text: isDarkMode ? 'rgb(189, 190, 190)' : 'rgb(57, 59, 61)',
        header: isDarkMode ? 'white' : 'rgb(40, 40, 40)',
        button: isDarkMode ? {
            text: 'rgba(255, 255, 255, 0.9)',
            bg: 'rgb(45, 48, 51)',
            hover: 'rgb(57, 60, 64)',
            active: 'rgb(69, 73, 77)'
        } : {
            text: 'rgb(57, 59, 61)',
            bg: 'rgb(242, 244, 245)',
            hover: 'rgb(224, 226, 227)',
            active: 'rgb(210, 212, 213)'
        }
    };
}

updateThemeCache();

function withErrorHandling(fn, context = '') {
    return async (...args) => {
        try {
            return await fn(...args);
        } catch (error) {
            console.error(`Error in ${context}:`, error);
            return null;
        }
    };
}

const safeLoadSettings = withErrorHandling(loadSettings, 'loadSettings');
const safeHandleSaveSettings = withErrorHandling(handleSaveSettings, 'handleSaveSettings');
const safeFetchTheme = withErrorHandling(fetchThemeFromAPI, 'fetchThemeFromAPI');

window.addEventListener('beforeunload', () => {
    if (observer) {
        observer.disconnect();
    }
    domCache.clear();
});

document.addEventListener('DOMContentLoaded', function() {
    const PreferredRegionEnabled = document.getElementById('PreferredRegionEnabled');
    const preferredRegionSelect = document.getElementById('preferredRegionSelect');
    const regionSettingDiv = document.getElementById('setting-preferred-region');

    function updateRegionSelectVisibility() {
        if (PreferredRegionEnabled && preferredRegionSelect && regionSettingDiv) {
            const isEnabled = PreferredRegionEnabled.checked;
            regionSettingDiv.style.display = isEnabled ? 'block' : 'none';
            preferredRegionSelect.disabled = !isEnabled;
        }
    }

    if (PreferredRegionEnabled) {
        PreferredRegionEnabled.addEventListener('change', function() {
            updateRegionSelectVisibility();
            handleSaveSettings('PreferredRegionEnabled', this.checked);
        });
    }

    if (preferredRegionSelect) {
        preferredRegionSelect.addEventListener('change', function() {
            handleSaveSettings('robloxPreferredRegion', this.value);
        });

        if (preferredRegionSelect.options.length === 0) {
            Object.keys(REGIONS).forEach(regionCode => {
                const option = document.createElement('option');
                option.value = regionCode;
                option.textContent = getFullRegionName(regionCode);
                preferredRegionSelect.appendChild(option);
            });
        }
    }

    updateRegionSelectVisibility();
});
