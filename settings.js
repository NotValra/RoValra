const REGIONS = {
    "AUTO": { city: "Nothing Selected", state: null, country: null },
    "SG": { latitude: 1.3521, longitude: 103.8198, city: "Singapore", state: null, country: "Singapore" },
    "DE": { latitude: 50.1109, longitude: 8.6821, city: "Frankfurt", state: null, country: "Germany" },
    "FR": { latitude: 48.8566, longitude: 2.3522, city: "Paris", state: null, country: "France" },
    "JP": { latitude: 35.6895, longitude: 139.6917, city: "Tokyo", state: null, country: "Japan" },
    "BR": { latitude: -14.2350, longitude: -51.9253, city: "Coming early 2026", state: null, country: "Brazil" },
    "NL": { latitude: 52.3676, longitude: 4.9041, city: "Amsterdam", state: null, country: "Netherlands" },
    "US-CA": { latitude: 34.0522, longitude: -118.2437, city: "LA", state: "California", country: "United States" },
    "US-VA": { latitude: 38.9577, longitude: -77.4875, city: "Ashburn", state: "Virginia", country: "United States" },
    "US-IL": { latitude: 41.8781, longitude: -87.6298, city: "Chicago", state: "Illinois", country: "United States" },
    "US-TX": { latitude: 32.7767, longitude: -96.7970, city: "Dallas", state: "Texas", country: "United States" },
    "US-FL": { latitude: 25.7743, longitude: -80.1937, city: "Miami", state: "Florida", country: "United States" },
    "US-NY": { latitude: 40.7128, longitude: -74.0060, city: "NYC", state: "New York", country: "United States" },
    "US-WA": { latitude: 47.6062, longitude: -122.3321, city: "Seattle", state: "Washington", country: "United States" },
    "AU": { latitude: -33.8688, longitude: 151.2093, city: "Sydney", state: null, country: "Australia" },
    "GB": { latitude: 51.5074, longitude: -0.1278, city: "London", state: null, country: "United Kingdom" },
    "IN": { latitude: 19.0760, longitude: 72.8777, city: "Mumbai", state: null, country: "India" },
    "US-NJ": { latitude: 40.7895, longitude: -74.0565, city: "Secaucus", state: "New Jersey", country: "United States" },
    "US-OR": { latitude: 45.8400, longitude: -119.7012, city: "Boardman", state: "Oregon", country: "United States" },
    "US-OH": { latitude: 39.9612, longitude: -82.9988, city: "Columbus", state: "Ohio", country: "United States" }
};

let cachedTheme = null;
let themeLastFetched = 0;
// This shit useless at this point but OH WELLLLLLL!!!!!!
const THEME_CACHE_DURATION = 24 * 60 * 60 * 1000; 

const REGION_CONTINENTS = {
    "Asia": ["SG", "JP", "IN"],
    "Europe": ["DE", "FR", "NL", "GB"],
    "North America": ["US-CA", "US-VA", "US-IL", "US-TX", "US-FL", "US-NY", "US-WA", "US-NJ", "US-OR", "US-OH"],
    "Oceania": ["AU"],
    "South America": ["BR"]
};

const SETTINGS_CONFIG = {
    Catalog: {
        title: "Catalog",
        settings: {
            itemSalesEnabled: {
                label: "Enable Item Sales",
                description: ["This shows the most up to date sales and revenue data we have.", 
                            "The sales data is very likely to be inaccurate on items that are for sale, but very likely to be correct on off sale items.",
                        "Keep in mind this was leaked data from around half a year ago. A lot of data is inaccurate and a lot of items dont have data."],
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
                                    "{{red WARNING}} this may be laggy on lower end devices, and the UI is outdated and lacking features."],
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
                        description: ["Select your preferred region for joining games."],
                        type: "select",
                        options: "REGIONS",
                        default: "AUTO"
                    }
                }
            },
            botdataEnabled: {
                label: "Enable Bot Data",
                description: ["Shows if a game has a lot of bots.",
                            "It doesn't show the amount of bots, since the sample size is too small to give an accurate number."],
                type: "checkbox",
                default: true
            },
            subplacesEnabled: {
                label: "Enable Subplaces",
                description: ["Shows the subplaces of a game."],
                type: "checkbox",
                default: true
            },
            inviteEnabled: {
                label: "Enable Universal Server Invites",
                description: ["This allows you to invite your friends to the game you're in, without your friend requiring any extension, not even RoValra!",
                            "You can copy the link by pressing on the `Copy Join Link` button.",
                        "This will remove the RoPro share button for the 'Servers' section.",],
                type: "checkbox",
                default: true
            },
            showfullserveridEnabled: {
                label: "Enable Show Full Server ID",
                description: ["This shows the full server id in the server list.",
                    "May cause issues with the UI if you have RoPro Plus Server Uptime.",
                    "Unless you have BTRoblox too. (The normal roblox website is made in interesting ways)"
                ],
                type: "checkbox",
                default: true
            },
            enableFriendservers: {
                label: "Enable Servers My Friends Are In modifications",
                description: ["This adds a few modifications to the servers my friends are in section.",
                    "It adds text saying if a friend is in a private server.",
                    "It also adds a copy join link button if a friend isnt in a private server.",
                    "This will remove the RoPro share button for the 'Servers My Friends Are In' section.",
                ],
                type: "checkbox",   
                default: true
            },
            privateserverlink: {
                label: "Enable Quick Private Server Invite Link",
                description: ["This adds a button allowing you to copy your private server invite link without needing to open the configure page.",
                    "This also adds a button allowing you to quickly generate a new private server link"
                ],
                type: "checkbox",
                default: true
                
            },
            universalSniperEnabled: {
                label: "Enable Universal User Sniper",
                description: ["This allows you to join a user, without needing to be friends with them.",
                            "Only requirement is that you know what game they are playing.",
                        "**If you don't want users using this to join you, you can change your joins to no one.**",
                         "keep in mind having joins to no one might not fully prevent users from joining you depending on what bypass users are using."],
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
                            "### Requirements",
                            "- It is **strongly recommended** that you uninstall the Microsoft Store version of Roblox",
                            "- This feature requires the user to be friends with you or have their joins enabled"
                           ],
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
                label: "Enable R6 Fix",
                description: ["{{green Beta Feature}}",
                    "Stops Roblox from automatically switching your character to R15 when equiping dynamic heads.",
                            "This requires you to use the english language on Roblox."],
                type: "checkbox",
                default: false
            }
        }
    },
    Miscellaneous: {
        title: "Miscellaneous",
        settings: {
            ServerdataEnabled: {
                label: "Send Server ids to RoValras api",
                description: ["This feature is here since im trying to figure out how well my server handles stuff like this.",
                    "No personal data is sent, not even user id or username, only the server ids and the place id that ur client found",
                    "This might be come a permanent feature if this test is successful.",
                    "Leaving this setting on will help me develop the extension."
                ],
                type: "checkbox",
                default: true
            },
            pendingrobuxtrans: {

                label: "Enable Unpending Robux Transactions",
                description: ["This estimates how many Robux will stop pending in 24 hours.",
                    "This feature is experimental since I couldnt test it myself but it should work fine."
                ],

                type: "checkbox",
                default: true
            },
            revertLogo: {
                label: "Change the app launching icon",
                description: ["This changes the icon that shows when you join a game.",
                    "Old icon is the icon it had before they changed it to the new app client icon.",
                    "And ofc custom icon is any image you want."
                ],
                type: "select",
                options: [
                    { value: 'NEW', label: 'Off' },
                    { value: 'OLD', label: 'Old icon' },
                    { value: 'CUSTOM', label: 'Custom icon' }
                ],
                default: 'NEW'
            },
            customLogoData: {
                label: "Custom icon",
                description: ["Upload your custom image."],
                type: "file",
                default: null
            }
            
        }
        
    },
    FunStuff: {
        title: "Fun Stuff",
        settings: {
            bandurationsEnabled: {
                label: "All possible ban durations",
                
                description: [
"**This does not include voice chat bans.**",
"**Any text saying 'Note:' is a note added by Valra to explain stuff better.**",
"- Banned for 1 Day",
"- Banned for 3 Days",
"- Banned for 7 Days",
"- Banned for 14 Days",
"- Account Deleted",
"• Warning",
"• Banned for 6 Months",
"• Banned for 1 Year",
"• Note: the stuff below are not bans but instead Roblox telling you what will happen if you do it again, this doesn't always show when you get banned.",
"• This stuff below is called a 'Forshadow ban'",
"• If you violate the Community Standards again, your account may be suspended in the future. ",
"• If you violate the Community Standards again, your account may be suspended for at least 1 day.",
"• If you violate the Community Standards again, your account may be suspended for at least 3 days.",
"• If you violate the Community Standards again, your account may be suspended for at least 7 days.",
"• If you violate the Community Standards again, your account may be permanently banned from Roblox.",
"- Note: 2 days, 1 hour, 3 hours, 6 hours and 12 hours bans might not be in use.",
"• Banned for 2 Days",
"• Banned for 3 Hours",
"• Banned for 6 Hours",
"• Banned for 12 Hours",
"• Banned for 1 Hour",
"• Account Terminated",
"• Banned for 60 Days",],
                    default: null,
                },
                
            
           BanReasons: {
                label: "All possible ban reasons on Roblox, some ban reasons have been censored by Valra.",
                description: [
"**All ban reasons are 100% confirmed**",
"**Keep in mind these are ban reasons, which is basically categories each ban might fall into.**",
"**Any text saying 'Note:' is a note added by Valra to explain stuff better.**",
"- None (Note: Likely used for when there isnt a ban reason, and instead only a moderator note.)",
"- Profanity",
"- Harassment",
"- Spam",
"- Advertisement",
"• Scamming",
"• Adult Content",
"• Inappropriate",
"• Privacy",
"• Unclassified Mild",
"• BlockedContent",
"• Minor Swearing",
"• Distorted Audio",
"• Loud Earbleeders",
"• Players Screaming into Microphone",
"• Swearing",
"• P####graphic Sounds",
"• Explicit S##ual References and Innuendo",
"• Dr## and Alc###l References",
"• Discriminatory or N##i Content",
"• Dating Imagery",
"• Discriminatory Content",
"• Dr##s, Alc###l",
"• DMCA",
"• Explicit N####y/P##n",
"• Gang Images",
"• N###s",
"• Personal Attack/Harassment/Bullying",
"• Red Armbands (Not N###s) ",
"• Suggestive/S##ualized Imagery",
"• S####de/Self-####",
"• Clickbait Ads",
"• Inappropriate Content",
"• Not Related to Roblox",
"• Off-Site Links",
"• Hidden Message Clothing",
"• None of the Above",
"• Account Theft",
"• Asset Ownership",
"• Billing",
"• Compromised Account",
"• Copyright/DMCA",
"• Derogatory/Harassment",
"• Depressive",
"• Discriminatory",
"• Exploiting",
"• Text Filter / Profanity",
"• Gr###ing",
"• Illicit Substance",
"• Malicious",
"• Misleading",
"• Dating",
"• Phishing/Scam",
"• Real Info",
"• RMT (Note: Real money transaction)",
"• S##ual/Adult Content",
"• Shock",
"• Threats",
"• Real-Life Tragedy",
"• Politics",
"• Encouraging Dangerous Behavior",
"• Other",
"• Dating and Romantic Content",
"• S##ual Content",
"• Directing Users Off-Platform",
"• Privacy: Asking for PII",
"• Privacy: Giving PII",
"• Impersonation",
"• Extortion and Blackmail",
"• Illegal and Regulated Content",
"• Misusing Roblox Systems",
"• Political Content",
"• T###orism/Extremism",
"• Child Endangerment",
"• Real-Life Threats",
"• Cheat and Exploits",
"• Seeking S##ual Content",
"• Disruptive Audio",
"• Contests and Sweepstakes",
"• Threats or Abuse of Roblox Employees or Affiliates",
"• Roblox Economy",
"• IRL Dangerous Activities",
"• Intellectual Property Violation",
"• Off Platform Speech and Behavior",
"• Violent Content and Gore",
"• Advertising",
"• Chargeback",
"• DMCA Early Legal Strike",
"• DMCA Final Legal Strike",
"• You created or used an account to avoid an enforcement action taken against another account determined from your account information, such as your account email, phone number, or other information (Note: This is not a ban reason this is a modarator note)",
"• Trademark Violation",
"• Roblox does not permit using third-parties to buy, sell, or trade Robux, promotional codes that falsely appear to be from Roblox Corporation, or inappropriate use of the community payout system. (Note: This is not a ban reason this is a modarator note)",
"- Note: Fun fact the 'using third-parties to buy, sell, or trade Robux' modarator are called 'Virtual Casino' bans in the code"],
               
                default: null
            },
            appealstuff: {
            label: "Appeals related stuff",
            description: ["**Appeal Outcomes & Decisions**",
                "- Appeal denied",
"- We have reviewed your appeal. This activity is still in violation of Roblox Community Standards.",
"- Appeal accepted",
"- We have reviewed your appeal. This activity is not in violation of Roblox Community Standards. Any consequence related to this activity is reversed.",
"- We have reviewed your appeal. This activity is still in violation of Roblox Community Standards. However, we’ve updated the violation category.",
"**Appeal Instructions & Information**",
"- Appeal something not shown",
"- Request Appeal",
"- Additional info (optional)",
"- You can appeal by {date}",
"- View past violations and manage your appeals. All content and behavior must adhere to the {link}Roblox Community\nStandards{linkEnd}.",
"- Reviews are based on {link}Roblox Community Standards{linkEnd}",
"- Learn more about appeals {link}here{linkEnd}.",
"**Error Messages & Support Fallbacks**",
"- Appeals information not found",
"- If you would like to appeal something not shown here please visit {link}Support{linkEnd}",
"- You've reached the maximum number of appeals. You may no longer appeal this {assetType}."
],
            default: null,
        },
            captcha: {
                label: "All the places where you can get a captcha on Roblox",
                description: ["- sign up"
                , "- login"
                , "- change password"
                , "- redeeming a gift card"
                , "- submitting a support ticket"
                , "- buying an item (speculation, might have been removed)"
                , "- posting on a group wall (likely gonna be the same for group forum posts)"
                , "- joining a group"
                , "- 'generic challange' no idea what they mean by that."
                , "- following a user"
                , "- uploading 'clothing asset' could also be the same for any asset but im unsure"
                , "- posting a comment on an asset (comments on assets have been removed)"
                ],
                default: null
            }
            
        }
        
    }
}

function generateSettingsUI(section) {
    let html = '';
    const sectionConfig = SETTINGS_CONFIG[section];
    
    if (!sectionConfig) return '';

    for (const [settingName, setting] of Object.entries(sectionConfig.settings)) {
        html += '<div class="setting">';
        html += '<div class="setting-controls">';
        html += `<label>${setting.label}</label>`;
        html += generateSettingInput(settingName, setting, sectionConfig.settings); 
        html += '</div>';
        html += '<div class="setting-label-divider"></div>'; 
        
        setting.description.forEach(desc => {
            html += `<div class="setting-description">${parseMarkdown(desc)}</div>`;
        });

        if (setting.type === 'file' && settingName === 'customLogoData') {
            html += `
                <div class="file-preview-clear-container" style="margin-top: 10px;"> 
                    <img id="preview-${settingName}" src="#" alt="Image Preview" style="max-width: 96px; max-height: 96px; display: none; border-radius: 4px; border: 1px solid #555; margin-bottom: 5px;"/>
                    <button id="clear-${settingName}" data-setting-name="${settingName}" style="padding: 6px 10px; border-radius: 4px; border: 1px solid #555; background-color: #c0392b; color: white; cursor: pointer; display: none;">Clear Custom Logo</button>
                </div>`;
        }

        if (setting.childSettings) {
            for (const [childName, childSetting] of Object.entries(setting.childSettings)) {
                const isConditional = childSetting.condition;
                const displayStyle = isConditional ? 'display: none;' : ''; 
                
                html += '<div class="child-setting-separator"></div>';
                html += ` 
                    <div class="child-setting-item" id="setting-${childName}" style="${displayStyle}">
                        <div class="setting-controls">`;
                html += `<label>${childSetting.label}</label>`;
                html += generateSettingInput(childName, childSetting, setting.childSettings);
                html += `</div>`;
                html += `<div class="setting-label-divider"></div>
                        ${childSetting.description.map(desc => `<div class="setting-description">${parseMarkdown(desc)}</div>`).join('')}
                        
                    </div>`;
            }
        }

        html += '<div class="setting-separator"></div></div>';
    }

    return html;
}

function generateSettingInput(settingName, setting, allSettingsInSection) {
    if (setting.type === 'checkbox') {
        const toggleClass = setting.disabled ? 'toggle-switch1' : 'toggle-switch';
        return `
            <label class="${toggleClass}">
                <input type="checkbox" id="${settingName}" data-setting-name="${settingName}"${setting.disabled ? ' disabled' : ''}>
                <span class="${setting.disabled ? 'slider1' : 'slider'}"></span>
            </label>`;
    } else if (setting.type === 'select') {
        let optionsHtml = '';
        if (setting.options === 'REGIONS') {
            optionsHtml = `<option value="AUTO">${getFullRegionName("AUTO")}</option>`;

            const allRegionCodesInConfig = Object.keys(REGIONS).filter(rc => rc !== "AUTO");
            const categorizedRegionCodes = new Set();

            for (const continentName in REGION_CONTINENTS) {
                const regionsInContinent = REGION_CONTINENTS[continentName];
                if (regionsInContinent && regionsInContinent.length > 0) {
                    let continentOptions = '';
                    regionsInContinent.forEach(regionCode => {
                        if (REGIONS[regionCode]) {
                            continentOptions += `<option value="${regionCode}">${getFullRegionName(regionCode)}</option>`;
                            categorizedRegionCodes.add(regionCode);
                        }
                    });
                    if (continentOptions) {
                        optionsHtml += `<optgroup label="${continentName}">${continentOptions}</optgroup>`;
                    }
                }
            }

            const otherRegions = allRegionCodesInConfig.filter(rc => !categorizedRegionCodes.has(rc));
            if (otherRegions.length > 0) {
                let otherOptions = '';
                otherRegions.forEach(regionCode => {
                    otherOptions += `<option value="${regionCode}">${getFullRegionName(regionCode)}</option>`;
                });
                if (otherOptions) {
                    optionsHtml += `<optgroup label="Other Regions">${otherOptions}</optgroup>`;
                }
            }
        } else if (Array.isArray(setting.options)) {
            optionsHtml = setting.options.map(opt =>
                `<option value="${opt.value}">${opt.label}</option>`
            ).join('');
        }

        let initialSelectStyles;
        if (settingName === 'robloxPreferredRegion') {
            initialSelectStyles = "width: 100%; padding: 10px 12px; border-radius: 8px; font-size: 14px; font-weight: bold; font-family: Gotham SSm A, Gotham SSm B, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif; transition: all 0.2s ease; background-color: rgb(45, 48, 51); color: rgb(230, 230, 230); border: 1px solid rgb(69, 73, 77);";
        } else {
            initialSelectStyles = "padding: 8px; border-radius: 4px; border: 1px solid #555; background-color: #393b3d; color: #eee;";
        }
        
        return `
            <select id="${settingName}" data-setting-name="${settingName}" class="setting-select-input" style="${initialSelectStyles}">
                ${optionsHtml}
            </select>`;
    } else if (setting.type === 'file') {
        const isDark = currentTheme === 'dark';
        const initialFileInputBg = isDark ? 'rgb(45, 48, 51)' : 'rgb(255, 255, 255)';
        const initialFileInputBorder = isDark ? 'rgb(69, 73, 77)' : 'rgb(204, 208, 212)';
        const initialFileInputText = isDark ? 'rgb(230, 230, 230)' : 'rgb(57, 59, 61)';

        return `
                <input type="file" id="${settingName}" data-setting-name="${settingName}" accept="image/*" class="setting-file-input" style="margin-left: auto; background-color: ${initialFileInputBg}; color: ${initialFileInputText}; border: 1px solid ${initialFileInputBorder};">`;
    }
    return '';
}

const THEME_CONFIG = {
    light: {
        content: 'rgb(transparent)',
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
        githubLink: '#1e722a',
        robloxLink: '#c13ad9'
    },
    dark: {
        content: 'rgb(transparent)',
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
        githubLink: '#2dba4e',
        robloxLink: '#c13ad9'
    }
};


function parseMarkdown(text) {
    if (!text) return '';
    
    text = text.replace(/\\([*_`~\[\]])/g, '$1');
    
    text = text.replace(/(\*\*|__)(.*?)\1/g, '<strong>$2</strong>');
    
    text = text.replace(/(\*|_)(.*?)\1/g, '<em>$2</em>');
    
    text = text.replace(/~~(.*?)~~/g, '<s>$1</s>');
    
    text = text.replace(/```(.*?)```/gs, (match, content) => {
        return `<pre><code>${content.trim()}</code></pre>`;
    });
    
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
        let linkClass = '';
        if (url.includes('discord.gg')) {
            linkClass = 'rovalra-discord-link';
        } else if (url.includes('github.com')) {
            linkClass = 'rovalra-github-link';
        } else if (url.includes('roblox.com')) {
            linkClass = 'rovalra-roblox-link';
        }
        return `<a href="${url}" target="_blank" class="${linkClass}">${text}</a>`;
    });
    
    text = text.replace(/\{\{(#[0-9a-fA-F]{3,6}|red|green|blue|yellow|orange|purple|gray|black|white) (.*?)\}\}/g, (match, color, content) => {
        return `<span style="color:${color};">${content}</span>`;
    });
    
   
    if (text.match(/^[\s]*[-*+][\s]/)) {
        return `<li class="bullet-item">${text.replace(/^[\s]*[-*+][\s]/, '')}</li>`;
    }
    
    if (text.match(/^[\s]*\d+\.[\s]/)) {
        return `<li>${text.replace(/^[\s]*\d+\.[\s]/, '')}</li>`;
    }
    
    if (text.match(/^[\s]*•[\s]/)) {
        return `<li class="bullet-item">${text.replace(/^[\s]*•[\s]/, '')}</li>`;
    }
    if (text.match(/^#{1,6}\s/)) {
        const level = text.match(/^(#{1,6})\s/)[1].length;
        const content = text.replace(/^#{1,6}\s/, '');
        return `<h${level} class="markdown-header">${content}</h${level}>`;
    }
    if (text.match(/^[-*_]{3,}$/)) {
        return '<hr>';
    }
    if (text.match(/^>\s/)) {
        return `<blockquote>${text.replace(/^>\s/, '')}</blockquote>`;
    }
    
    text = text.replace(/\{link\}(.*?)\{linkEnd\}/g, (match, content) => {
        let linkClass = 'rovalra-link';
        let href = '#';
        
        if (content.toLowerCase().includes('roblox community standards')) {
            linkClass = 'rovalra-roblox-link';
            href = 'https://en.help.roblox.com/hc/en-us/articles/203313410-Roblox-Community-Standards';
        } else if (content.toLowerCase().includes('support')) {
            linkClass = 'rovalra-roblox-link';
            href = 'https://en.help.roblox.com/hc/en-us/requests/new';
        } else if (content.toLowerCase() === 'here') {
            linkClass = 'rovalra-roblox-link';
            href = 'https://en.help.roblox.com/hc/en-us/articles/360000375686-Appeal-Process';
        }
        
        return `<a href="${href}" target="_blank" class="${linkClass}">${content}</a>`;
    });
    
    return text;
}

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
        
        if (settingsSyncInterval && cachedTheme && (Date.now() - themeLastFetched) < THEME_CACHE_DURATION) {
            const isDarkMode = cachedTheme === 'dark';
            updateThemeStyles_settingsPage(cachedTheme);
            
            const settingBackgroundColor = isDarkMode ? 'rgb(39, 41, 48)' : 'rgb(240, 240, 240)';
            const childSettingBackgroundColor = isDarkMode ? 'rgb(52, 55, 58)' : 'rgb(230, 230, 230)';
            
            document.querySelectorAll('.setting').forEach(setting => {
                if (setting.id && setting.id.startsWith('setting-')) {
                    setting.style.backgroundColor = childSettingBackgroundColor;
                } else {
                    setting.style.backgroundColor = settingBackgroundColor;
                }
            });
            
            if (window.location.href.includes('/RoValra')) {
                updateThemeStyles_rovalraPage(cachedTheme);
            }
        } else {
            await applyTheme();
            themeLastFetched = Date.now();
        }
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
        const response = await fetch('https://accountsettings.roblox.com/v1/themes/user', {
            credentials: 'include'
        });
        if (!response.ok) {
            console.error('Failed to fetch theme from API:', response.status, response.statusText);
            return cachedTheme || 'light';
        }
        const data = await response.json();
        if (data && data.themeType) {
            const newTheme = data.themeType.toLowerCase();
            cachedTheme = newTheme;
            return newTheme;
        } else {
            console.warn('Theme data from API is unexpected:', data);
            return cachedTheme || 'light';
        }
    } catch (error) {
        console.error('Error fetching theme from API:', error);
        return cachedTheme || 'light';
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
            },
            fileInput: {
                bg: 'rgb(45, 48, 51)',
                border: 'rgb(69, 73, 77)',
                text: 'rgb(230, 230, 230)'
            }
        },
        light: {
            button: {
                base: 'rgb(227, 230, 232)', 
                hover: 'rgb(218, 221, 224)', 
                active: 'rgb(204, 208, 212)', 
                text: 'rgb(36, 41, 45)'    
            },
            select: {
                bg: 'rgb(255, 255, 255)',
                border: 'rgb(224, 226, 227)',
                text: 'rgb(57, 59, 61)'
            },
            fileInput: {
                bg: 'rgb(255, 255, 255)',
                border: 'rgb(204, 208, 212)',
                text: 'rgb(57, 59, 61)'
            }
        }
    };

    const currentColors = colors[isDarkMode ? 'dark' : 'light'];
    
    const buttons = document.querySelectorAll('.setting-section-button');
    buttons.forEach(button => {
        Object.assign(button.style, {
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

    const regionSelect = document.querySelector('#robloxPreferredRegion');
    if (regionSelect) {
        Object.assign(regionSelect.style, {
            width: '100%',
            padding: '10px 12px',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 'bold',
            fontFamily: 'Gotham SSm A, Gotham SSm B, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
            transition: 'all 0.2s ease',
            backgroundColor: currentColors.select.bg,
            color: currentColors.select.text,
            border: `1px solid ${currentColors.select.border}`
        });
    }

    const fileInputs = document.querySelectorAll('.setting-file-input');
    fileInputs.forEach(input => {
        Object.assign(input.style, {
            backgroundColor: currentColors.fileInput.bg,
            color: currentColors.fileInput.text,
            border: `1px solid ${currentColors.fileInput.border}`
        });
    });
}

function updateThemeStyles_rovalraPage(theme) {
    const isDarkMode = theme === 'dark';
    const themeColors = THEME_CONFIG[theme] || THEME_CONFIG.light;

    const textColor = themeColors.text;
    const headerColor = themeColors.header;
    const discordLinkColor = themeColors.discordLink;
    const githubLinkColor = themeColors.githubLink;

    const contentContainer = document.querySelector('#content-container');

    if (contentContainer) {
        contentContainer.style.borderRadius = '8px';

        let finalContentBgColor;
        const currentHash = window.location.hash.replace('#!/!', '').replace('#!', '').toLowerCase() || 'info';

        if (currentHash === 'info' || currentHash === 'credits') {
            finalContentBgColor = 'rgb(transparent)';
        } else {
            finalContentBgColor = 'rgb(transparent)';
        }
        contentContainer.style.backgroundColor = finalContentBgColor;

        contentContainer.querySelectorAll('div, span, li, b, p, h1, button, h2').forEach(element => {
            const computedStyle = window.getComputedStyle(element);
            const elementColor = computedStyle.color;
            if (element.tagName !== 'A') {
                if (elementColor === 'rgb(0, 0, 0)' || elementColor === 'rgb(255, 255, 255)') {
                    if (element.tagName !== 'H2') {
                        element.style.setProperty('color', textColor, 'important');
                    }
                }
            }
        });

        contentContainer.querySelectorAll('h2').forEach(h2Element => {
            if (isDarkMode) {
                h2Element.style.setProperty('color', themeColors.header || 'white', 'important');
            } else {
                h2Element.style.setProperty('color', themeColors.header || 'rgb(40, 40, 40)', 'important');
            }
        });

        const allLinks = contentContainer.querySelectorAll('a');

        setTimeout(() => {
            allLinks.forEach(link => {
                link.style.setProperty('text-decoration', 'underline', 'important');
                link.style.setProperty('font-weight', 'bold', 'important');
                link.style.setProperty('transition', 'color 0.3s ease', 'important');

                if (link.classList.contains('rovalra-discord-link') || link.classList.contains('rovalra-github-link') || link.classList.contains('rovalra-review-link')) {
                    return;
                }

                let initialColor;
                const hostname = link.hostname ? link.hostname.toLowerCase() : '';

                if (hostname === 'discord.gg') {
                    initialColor = discordLinkColor;
                } else if (hostname === 'github.com') {
                    initialColor = githubLinkColor;
                } else {
                    initialColor = textColor;
                }
                link.style.setProperty('color', initialColor, 'important');

                link.addEventListener('mouseenter', function() {
                    let baseHoverColorForLighten;
                    const currentHostname = this.hostname ? this.hostname.toLowerCase() : '';
                    if (currentHostname === 'discord.gg') baseHoverColorForLighten = discordLinkColor;
                    else if (currentHostname === 'github.com') baseHoverColorForLighten = githubLinkColor;
                    else baseHoverColorForLighten = textColor;

                    if (baseHoverColorForLighten && typeof baseHoverColorForLighten === 'string') {
                        const lighterColor = lightenColor(baseHoverColorForLighten, 0.15);
                        this.style.setProperty('color', lighterColor, 'important');
                    } else {
                        const fallbackLighterColor = lightenColor(textColor, 0.15);
                        this.style.setProperty('color', fallbackLighterColor, 'important');
                    }
                });

                link.addEventListener('mouseleave', function() {
                    let restoreColor;
                    const currentHostname = this.hostname ? this.hostname.toLowerCase() : '';
                    if (currentHostname === 'discord.gg') restoreColor = discordLinkColor;
                    else if (currentHostname === 'github.com') restoreColor = githubLinkColor;
                    else restoreColor = textColor;
                    this.style.setProperty('color', restoreColor, 'important');
                });
            });
        }, 0);
    }

    const mainRovalraHeader = document.querySelector('#react-user-account-base > h1');
    if (mainRovalraHeader) {
        mainRovalraHeader.style.setProperty('color', headerColor, 'important');
    }
}

async function applyTheme() {
    try {
        const latestTheme = await fetchThemeFromAPI();
        if (!latestTheme) {
            console.warn('Failed to fetch theme, using current theme:', currentTheme);
        } else {
            currentTheme = latestTheme;
        }
        
        updateThemeCache();
        
        const isDarkMode = currentTheme === 'dark';
        
        const updateAllThemeElements = () => {
            if (isSettingsPage) {
                updateThemeStyles_settingsPage(currentTheme);
                
                const settingBackgroundColor = isDarkMode ? 'rgb(39, 41, 48)' : 'rgb(240, 240, 240)';
                const childSettingBackgroundColor = isDarkMode ? 'rgb(52, 55, 58)' : 'rgb(230, 230, 230)';
                
                document.querySelectorAll('.setting').forEach(setting => {
                    if (setting.id && setting.id.startsWith('setting-')) {
                        setting.style.backgroundColor = childSettingBackgroundColor;
                    } else {
                        setting.style.backgroundColor = settingBackgroundColor;
                    }
                });
            }
            
            if (window.location.href.includes('/RoValra')) {
                updateThemeStyles_rovalraPage(currentTheme);
            }
            
            document.querySelectorAll('[data-theme-dependent]').forEach(element => {
                const elementType = element.dataset.themeDependent;
                if (elementType === 'button') {
                    element.style.backgroundColor = isDarkMode ? cachedThemeColors.button.bg : cachedThemeColors.button.bg;
                    element.style.color = isDarkMode ? cachedThemeColors.button.text : cachedThemeColors.button.text;
                }
            });
        };

        updateAllThemeElements();
        
        setTimeout(updateAllThemeElements, 100);
        
        setTimeout(updateAllThemeElements, 500);
        
    } catch (error) {
        console.error('Error applying theme:', error);
        updateThemeCache();
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
            inviteEnabled: true,
            pendingRobuxEnabled: true,
            ServerdataEnabled: true,
            revertLogo: 'NEW',
            customLogoData: null,
            botdataEnabled: true,
            showfullserveridEnabled: true,
            BanReasons: true,
            enableFriendservers: true,
            bandurationsEnabled: true,
            appealstuff: true,
            privateserverlink: true,
            pendingrobuxtrans: true,
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
        
        if (settingName === 'customLogoData' && value === null) {
        }

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
        for (const sectionName in SETTINGS_CONFIG) {
            const section = SETTINGS_CONFIG[sectionName];
            for (const [settingName, setting] of Object.entries(section.settings)) {
                const element = settingsContent.querySelector(`#${settingName}`);
                if (element) {
                    if (setting.type === 'checkbox') {
                        element.checked = settings[settingName] !== undefined ? settings[settingName] : setting.default;
                    } else if (setting.type === 'select') {
                        element.value = settings[settingName] || setting.default;
                    } else if (setting.type === 'file') {
                        const previewElement = settingsContent.querySelector(`#preview-${settingName}`);
                        const clearButton = settingsContent.querySelector(`#clear-${settingName}`);

                        if (settingName === 'customLogoData') {
                            const currentRevertLogoValue = settings['revertLogo'];
                            const currentCustomLogoData = settings[settingName];

                            if (previewElement) {
                                if (currentCustomLogoData) { 
                                    previewElement.src = currentCustomLogoData;
                                    previewElement.style.display = 'block';
                                    if (clearButton) clearButton.style.display = 'inline-block';
                                } else if (currentRevertLogoValue === 'CUSTOM') { 
                                    previewElement.src = chrome.runtime.getURL("Assets/icon-128.png");
                                    previewElement.style.display = 'block';
                                    if (clearButton) clearButton.style.display = 'none'; 
                                } else { 
                                    previewElement.src = '#';
                                    previewElement.style.display = 'none';
                                    if (clearButton) clearButton.style.display = 'none';
                                }
                            }
                        } else { 
                            if (previewElement && settings[settingName]) {
                                previewElement.src = settings[settingName];
                                previewElement.style.display = 'block';
                                if (clearButton) clearButton.style.display = 'inline-block';
                            } else if (previewElement) {
                                previewElement.src = '#'; 
                                previewElement.style.display = 'none';
                                if (clearButton) clearButton.style.display = 'none';
                            }
                        }
                    }
                } else {
                    console.warn(`#${settingName} not found in settingsContent in initSettings for section ${sectionName}`);
                }

                if (setting.childSettings) {
                    for (const [childName, childSetting] of Object.entries(setting.childSettings)) {
                        const childElement = settingsContent.querySelector(`#${childName}`);
                        if (childElement) {
                            if (childSetting.type === 'checkbox') {
                                childElement.checked = settings[childName] !== undefined ? settings[childName] : childSetting.default;
                            } else if (childSetting.type === 'select') {
                                childElement.value = settings[childName] || childSetting.default;

                                if (childName === 'robloxPreferredRegion' && childElement.options.length === 0) {
                                    Object.keys(REGIONS).forEach(regionCode => {
                                        const option = document.createElement('option');
                                        option.value = regionCode;
                                        option.textContent = getFullRegionName(regionCode);
                                        childElement.appendChild(option);
                                    });
                                }
                            } else if (childSetting.type === 'file') {
                                const previewElement = settingsContent.querySelector(`#preview-${childName}`);
                                const clearButton = settingsContent.querySelector(`#clear-${childName}`);
                                if (previewElement && settings[childName]) {
                                    previewElement.src = settings[childName];
                                    previewElement.style.display = 'block';
                                    if(clearButton) clearButton.style.display = 'inline-block';
                                } else if (previewElement) {
                                    previewElement.style.display = 'none';
                                    if(clearButton) clearButton.style.display = 'none';
                                }
                            }
                        } else {
                            console.warn(`#${childName} not found in settingsContent in initSettings`);
                        }
                    }
                }
            }
        }
        updateConditionalSettingsVisibility(settingsContent, settings);
    }
};

async function updateContent(buttonInfo, contentContainer, buttonData) {
    const isDarkMode = currentTheme === 'dark';
    const themeColors = THEME_CONFIG[currentTheme] || THEME_CONFIG.light; 

    const textColor = themeColors.text;
    const headerColor = themeColors.header;
    const discordColor = themeColors.discordLink;
    const githubColor = themeColors.githubLink;

    if (typeof buttonInfo === 'object' && buttonInfo !== null && buttonInfo.content) {
        if (buttonInfo.text.toLowerCase() === "info" || buttonInfo.text.toLowerCase() === "credits") {
            contentContainer.innerHTML = `
                <div id="settings-content" style="padding: 0; background-color: transparent;">
                    <div id="setting-section-content" style="padding: 5px;">
                        <div id="info-credits-background-wrapper" style="padding: 15px; background-color: ${cachedThemeColors.content}; margin-bottom: 15px;">${buttonInfo.content}</div>
                    </div>
                </div>`;
            contentContainer.style.backgroundColor = 'rgb(transparent)'; 
        } else {
            contentContainer.innerHTML = buttonInfo.content;
            contentContainer.style.backgroundColor = 'rgb(transparent)';
        }
        contentContainer.style.borderRadius = '0px';

        if (window.location.href.includes('/RoValra')) {
            const contentQueryRoot = (buttonInfo.text.toLowerCase() === "info" || buttonInfo.text.toLowerCase() === "credits")
                ? contentContainer.querySelector('#info-credits-background-wrapper') || contentContainer 
                : contentContainer;

            if (contentQueryRoot) {
                setTimeout(() => {
                    contentQueryRoot.querySelectorAll('a.rovalra-discord-link').forEach(link => {
                        link.style.setProperty('color', discordColor, 'important');
                        link.style.setProperty('text-decoration', 'underline', 'important');
                        link.style.setProperty('font-weight', 'bold', 'important');
                        link.style.setProperty('transition', 'color 0.3s ease', 'important');

                        link.addEventListener('mouseenter', function() {
                            const lighterDiscordColor = lightenColor(discordColor, 0.15);
                            this.style.setProperty('color', lighterDiscordColor, 'important');
                        });
                        link.addEventListener('mouseleave', function() {
                            this.style.setProperty('color', discordColor, 'important');
                        });
                    });

                    contentQueryRoot.querySelectorAll('a.rovalra-github-link').forEach(link => {
                        link.style.setProperty('color', githubColor, 'important');
                        link.style.setProperty('text-decoration', 'underline', 'important');
                        link.style.setProperty('font-weight', 'bold', 'important');
                        link.style.setProperty('transition', 'color 0.3s ease', 'important');

                        link.addEventListener('mouseenter', function() {
                            const lighterGithubColor = lightenColor(githubColor, 0.15);
                            this.style.setProperty('color', lighterGithubColor, 'important');
                        });
                        link.addEventListener('mouseleave', function() {
                            this.style.setProperty('color', githubColor, 'important');
                        });
                    });

                    contentQueryRoot.querySelectorAll('a.rovalra-review-link').forEach(link => {
                        const reviewColor = isInitiallyDark ? '#42a5f5' : '#1976d2';
                        link.style.setProperty('color', reviewColor, 'important');
                        link.style.setProperty('text-decoration', 'underline', 'important');
                        link.style.setProperty('font-weight', 'bold', 'important');
                        link.style.setProperty('transition', 'color 0.3s ease', 'important');

                        link.addEventListener('mouseenter', function() {
                            const lighterReviewColor = lightenColor(reviewColor, 0.15);
                            this.style.setProperty('color', lighterReviewColor, 'important');
                        });
                        link.addEventListener('mouseleave', function() {
                            this.style.setProperty('color', reviewColor, 'important');
                        });
                    });

                    contentQueryRoot.querySelectorAll('div, span, li, b, p, h1, button, h2').forEach(element => {
                        if (element.tagName === 'A' && (element.classList.contains('rovalra-discord-link') || element.classList.contains('rovalra-github-link') || element.classList.contains('rovalra-review-link'))) {
                            return;
                        }
                        
                        const computedStyle = window.getComputedStyle(element);
                        const elementColor = computedStyle.color;
                        
                        if (element.tagName === 'H2') {
                            element.style.setProperty('color', headerColor, 'important');
                        } else if (elementColor === 'rgb(0, 0, 0)' || elementColor === 'rgb(255, 255, 255)') {
                            element.style.setProperty('color', textColor, 'important');
                        }
                    });
                }, 0);
            }
        }
    }

    const rovalraHeader = document.querySelector('#react-user-account-base > h1');
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

async function checkRoValraPage() {
    if (!window.location.href.includes('?rovalra=info')) {
        isSettingsPage = false;
        return;
    }
    isSettingsPage = true;

    const containerMain = document.querySelector('main.container-main');
    if (!containerMain) {
        return;
    }

    async function loadTabContent(hashKey) {
        if (!hashKey) hashKey = 'info'; 
        document.querySelectorAll('#unified-menu .menu-option-content').forEach(el => {
            el.classList.remove('active');
            el.removeAttribute('aria-current');
        });

      
        let targetMenuLink = document.querySelector(`#unified-menu li[id="${hashKey.toLowerCase()}-tab"] a.menu-option-content`);
        if (!targetMenuLink) {
             targetMenuLink = document.querySelector(`#unified-menu li[data-text="${hashKey}"] a.menu-option-content, #unified-menu li[data-section="${hashKey}"] a.menu-option-content`);
        }
        if (!targetMenuLink && (hashKey.toLowerCase() === 'info' || hashKey.toLowerCase() === 'credits')){
            targetMenuLink = document.querySelector(`#unified-menu li[data-text="${hashKey.charAt(0).toUpperCase() + hashKey.slice(1)}"] a.menu-option-content`);
        }


        if (targetMenuLink) {
            targetMenuLink.classList.add('active');
            targetMenuLink.setAttribute('aria-current', 'page');
        } else {
            console.warn(`Menu link for hashKey "${hashKey}" not found. Attempting to default to info tab.`);
            const infoLink = document.querySelector(`#unified-menu li[id="info-tab"] a.menu-option-content`);
            if (infoLink) {
                document.querySelectorAll('#unified-menu .menu-option-content').forEach(el => {el.classList.remove('active'); el.removeAttribute('aria-current');}); // Clear others
                infoLink.classList.add('active');
                infoLink.setAttribute('aria-current', 'page');
            }
        }

        const contentContainer = document.querySelector('#content-container');
        if (!contentContainer) {
            console.error("Content container not found in loadTabContent.");
            return;
        }

        const lowerHashKey = hashKey.toLowerCase();
        const settingsConfigKey = hashKey;

        if (lowerHashKey === "info" || lowerHashKey === "credits") {
            contentContainer.style.backgroundColor = 'rgb(transparent)';  
            const buttonInfo = buttonData.find(b => b.text.toLowerCase() === lowerHashKey);
            if (buttonInfo) {
                updateContent(buttonInfo, contentContainer, buttonData); 
            } else {
                console.error(`Button data for "${lowerHashKey}" not found.`);
                const infoButtonFallback = buttonData.find(b => b.text.toLowerCase() === "info");
                if(infoButtonFallback) updateContent(infoButtonFallback, contentContainer, buttonData);
            }
        } else if (SETTINGS_CONFIG[settingsConfigKey]) { 
            contentContainer.style.backgroundColor = 'rgb(transparent)'; 
            contentContainer.innerHTML = `
                <div id="settings-content" style="padding: 0; background-color: transparent;">
                    <div id="setting-section-content" style="padding: 5px;">
                        ${generateSettingsUI(settingsConfigKey)}
                    </div>
                </div>
            `;
            const settingsContentElement = contentContainer.querySelector('#setting-section-content');
            if (settingsContentElement) {
                initSettings(settingsContentElement);
                await applyTheme();
            }
        } else {
            console.warn("Unknown hashKey for content:", hashKey, "Falling back to info page.");
            const infoButtonData = buttonData.find(b => b.text.toLowerCase() === "info");
            if (infoButtonData) {
                updateContent(infoButtonData, contentContainer, buttonData);
                const infoLinkFallback = document.querySelector(`#unified-menu li[id="info-tab"] a.menu-option-content`);
                if (infoLinkFallback && !infoLinkFallback.classList.contains('active')) {
                     document.querySelectorAll('#unified-menu .menu-option-content').forEach(el => {
                        el.classList.remove('active'); el.removeAttribute('aria-current');
                    });
                    infoLinkFallback.classList.add('active');
                    infoLinkFallback.setAttribute('aria-current', 'page');
                }
            }
        }

        setTimeout(async () => {
            await applyTheme();
        }, 0);
    }

    async function newHandleHashChange() {
        const currentHash = window.location.hash.replace('#!/', '').replace('#!', '') || 'info';
        await loadTabContent(currentHash);
    }
    
    window.removeEventListener('hashchange', newHandleHashChange); 
    window.addEventListener('hashchange', newHandleHashChange);

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
    let rovalraHeader = document.createElement('h1');
    rovalraHeader.textContent = 'RoValra Settings';
    let settingsContainer = document.createElement('div');
    settingsContainer.id = 'settings-container';

    userAccountDiv.appendChild(reactUserAccountBaseDiv);
    reactUserAccountBaseDiv.appendChild(rovalraHeader);
    reactUserAccountBaseDiv.appendChild(settingsContainer);
    contentDiv.appendChild(userAccountDiv);
    containerMain.appendChild(contentDiv);

    if (rovalraHeader && rovalraHeader.textContent === 'RoValra Settings' && settingsContainer) {
        contentDiv.style.cssText = `width: 100% !important; height: auto !important; border-radius: 10px !important; overflow: hidden !important; padding-bottom: 25px !important; padding-top: 25px !important; min-height: 800px !important; position: relative !important;`;
        if (userAccountDiv) {
            userAccountDiv.style.cssText = `display: flex !important; flex-direction: column !important; align-items: center !important; justify-content: center !important; padding-left: 0px !important; padding-right: 0px !important; margin-left: auto !important; margin-right: auto !important; width: 100% !important;`;
            rovalraButtonAdded = false;
        }
        rovalraHeader.remove();
        const uiContainer = document.createElement('div');
        uiContainer.style.cssText = 'display: flex; flex-direction: row; gap: 10px; align-items: flex-start; position: relative; overflow: auto; width: auto; justify-content: flex-start;';
        settingsContainer.appendChild(uiContainer);
        settingsContainer.style.cssText = 'display: block; position: relative; overflow: visible;';
        
        const style = document.createElement('style');
        const isInitiallyDark = currentTheme === 'dark';
        const initialButtonBg = isInitiallyDark ? 'rgb(45, 48, 51)' : 'rgb(227, 230, 232)';
        const initialButtonText = isInitiallyDark ? 'rgb(230, 230, 230)' : 'rgb(36, 41, 45)';
        const initialButtonActiveBg = isInitiallyDark ? 'rgb(69, 73, 77)' : 'rgb(204, 208, 212)';
        style.textContent = `
            .setting { display: flex; flex-direction: column; justify-content: space-between; font-size: 16px; margin: 0 0 15px 0; background-color: ${isInitiallyDark ? 'rgb(39, 41, 48)' : 'rgb(240, 240, 240)'}; border-radius: 0px; padding: 15px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); }
            .setting-controls { display: flex; align-items: center; margin-bottom: 8px; }
            .setting-controls > label { margin-right: 10px; font-weight: bold; }
            .child-setting-item { display: flex; flex-direction: column; margin-left: 10px; margin-top: 5px; padding-top: 0px; }
            .child-setting-separator { height: 1px; background-color: rgba(128, 128, 128, 0.2); margin-top: 10px; margin-bottom: 10px; }
            /* Markdown styles */
            .setting-description { margin-bottom: 10px; }

            .setting-description strong { font-weight: bold; }
            .setting-description em { font-style: italic; }
            .setting-description code { font-family: monospace; padding: 2px 4px; background-color: ${isInitiallyDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)'}; border-radius: 3px; }
            .setting-description pre { background-color: ${isInitiallyDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)'}; padding: 8px; border-radius: 4px; overflow-x: auto; margin: 8px 0; }
            .setting-description a { color: ${isInitiallyDark ? '#7289da' : '#3479b7'}; text-decoration: underline; }
            .setting-description blockquote { padding-left: 10px; border-left: 3px solid ${isInitiallyDark ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.2)'}; margin: 8px 0; font-style: italic; }
            .setting-description hr { border: none; border-top: 1px solid ${isInitiallyDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)'}; margin: 8px 0; }
            .setting-description s { text-decoration: line-through; }
            .setting-description .markdown-header { margin: 10px 0 5px 0; font-weight: bold; }
            .setting-description h1.markdown-header { font-size: 1.8em; }
            .setting-description h2.markdown-header { font-size: 1.5em; }
            .setting-description h3.markdown-header { font-size: 1.3em; }
            .setting-description h4.markdown-header { font-size: 1.1em; }
            .setting-description h5.markdown-header, .setting-description h6.markdown-header { font-size: 1em; }
            .setting-description ul, .setting-description ol { margin-left: 20px; padding-left: 0; list-style-position: outside; }
            .setting-description li { margin-bottom: 4px; position: relative; }
            .setting-description li:before { content: ""; display: none; }
            .setting-description li li { margin-left: 20px; }
            /* Special styling for bullet points (dots) */
            .setting-description li.bullet-item { 
                list-style-type: none; 
                margin-left: 20px; 
                position: relative; 
                padding-left: 15px;
            }
            .setting-description li.bullet-item:before { 
                content: "•"; 
                display: inline-block; 
                position: absolute; 
                left: 0px; 
                color: inherit; 
                font-size: 1.2em;
                line-height: 1em;
                top: -0.05em;
            }
            .setting-description li.bullet-item li.bullet-item {
                margin-left: 15px;
            }
            .setting-description li.bullet-item li.bullet-item:before {
                content: "◦";
                font-size: 1.1em;
            }
            .setting-label-divider { 
                height: 0;
                border-top: 1px solid rgba(128, 128, 128, 0.3);
                margin-top: 0px; 
                margin-bottom: 8px; 
                transform: translateZ(0);
                -webkit-transform: translateZ(0);
                backface-visibility: hidden;
                -webkit-backface-visibility: hidden;
                box-sizing: border-box;
                -webkit-box-sizing: border-box;
                position: relative;
                z-index: 1;
            }
            /* Removed .setting p style in favor of .setting-description styles */
            .toggle-switch { position: relative; display: inline-block; width: 42px; height: 24px; flex-shrink: 0; margin-left: auto; }
            .toggle-switch input { opacity: 0; width: 0; height: 0; }
            .toggle-switch1 { position: relative; display: inline-block; width: 42px; height: 24px; display: none; flex-shrink: 0; margin-left: auto; }
            .toggle-switch1 input { opacity: 0; width: 0; height: 0; }
            .slider1 { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; background-color: #444; bottom: 0; transition: .4s; border-radius: 12px; width: 42px; }
            .slider1:before { position: absolute; disabled: true; content: ""; height: 20px; width: 20px; left: 2px; bottom: 2px; background-color:rgb(255, 255, 255); transition: .4s; border-radius: 50%; }
            input:checked + .slider1 { background-color: #2EA44F; }
            input:checked + .slider1:before { transform: translateX(18px); }
            .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; background-color: #444; bottom: 0; transition: .4s; border-radius: 12px; width: 42px; }
            .slider:before { position: absolute; content: ""; height: 20px; width: 20px; left: 2px; bottom: 2px; background-color:rgb(255, 255, 255); transition: .4s; border-radius: 50%; }
            input:checked + .slider { background-color: #2EA44F; }
            input:checked + .slider:before { transform: translateX(18px); }
            .setting-select-input { padding: 8px; border-radius: 4px; border: 1px solid #555; background-color: #393b3d; color: #eee; max-width: 200px; flex-shrink: 0; margin-left: auto; }
            .setting-file-input-container { display: flex; flex-direction: column; align-items: flex-start; max-width: 250px; flex-shrink: 0; margin-left: auto; }
            .setting-file-input { padding: 8px; border-radius: 4px; max-width: 230px; }
            .setting-separator { display: none; }
            .disabled-setting { opacity: 0.5; pointer-events: none; }
            .disabled-setting label { color: #777; }
            .disabled-setting p { color: #777; }
            .tab-button { white-space: nowrap; margin-left: 0px; }
            .setting-section-button { padding: 10px 16px; border-radius: 8px; border: none; cursor: pointer; background-color: ${initialButtonBg}; color: ${initialButtonText}; margin: 0 8px 0 0; font-size: 14px; font-weight: bold; font-family: Gotham SSm A, Gotham SSm B, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif; transition: all 0.1s ease; }
            .setting-section-button[data-active="true"] { background-color: ${initialButtonActiveBg}; }
            .back-to-main { display: flex; align-items: center; padding: 10px 16px; margin-bottom: 15px; border-radius: 8px; border: none; cursor: pointer; background-color: ${initialButtonBg}; color: ${initialButtonText}; font-size: 14px; font-weight: bold; font-family: Gotham SSm A, Gotham SSm B, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif; transition: all 0.1s ease; }
            .back-to-main:hover { background-color: ${isInitiallyDark ? 'rgb(57, 60, 64)' : 'rgb(218, 221, 224)'}; transform: translateY(-1px); }
            .child-setting-item .toggle-switch, .child-setting-item .toggle-switch1 { margin-right: 20px; }
            
            /* Force link colors */
            a.rovalra-discord-link {
                color: ${isInitiallyDark ? '#7289da' : '#3479b7'} !important;
                text-decoration: underline !important;
                font-weight: bold !important;
                transition: color 0.3s ease !important;
            }
            a.rovalra-discord-link:hover {
                color: ${isInitiallyDark ? '#8ba1e0' : '#4a8bc7'} !important;
            }
            
            a.rovalra-roblox-link {
                color: ${isInitiallyDark ? '#c13ad9' : '#c13ad9'} !important;
                text-decoration: underline !important;
                font-weight: bold !important;
                transition: color 0.3s ease !important;
            }
            a.rovalra-roblox-link:hover {
                color: ${isInitiallyDark ? '#d44de6' : '#d44de6'} !important;
            }
            
            a.rovalra-github-link {
                color: ${isInitiallyDark ? '#2dba4e' : '#1e722a'} !important;
                text-decoration: underline !important;
                font-weight: bold !important;
                transition: color 0.3s ease !important;
            }
            a.rovalra-github-link:hover {
                color: ${isInitiallyDark ? '#3edb5e' : '#2e823a'} !important;
            }
            
            a.rovalra-review-link {
                color: ${isInitiallyDark ? '#42a5f5' : '#1976d2'} !important;
                text-decoration: underline !important;
                font-weight: bold !important;
                transition: color 0.3s ease !important;
            }
            a.rovalra-review-link:hover {
                color: ${isInitiallyDark ? '#64b5f6' : '#2196f3'} !important;
            }

            a.rovalra-extension-link {
                color: ${isInitiallyDark ? '#4a9eff' : '#0066cc'} !important;
                text-decoration: underline !important;
                font-weight: bold !important;
                transition: color 0.3s ease !important;
            }
            a.rovalra-extension-link:hover {
                color: ${isInitiallyDark ? '#6db3ff' : '#1a75ff'} !important;
            }
        `;
        document.head.appendChild(style);

        uiContainer.innerHTML = ''; 

        const createUnifiedMenu = () => {
            const menuList = document.createElement('ul');
            menuList.id = 'unified-menu';
            menuList.className = 'menu-vertical';
            menuList.setAttribute('role', 'tablist');
            menuList.style.width = '160px';

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
                    if (window.location.hash.replace('#!/', '').replace('#!', '') !== newHashKey) {
                        history.pushState(null, '', `#!/${newHashKey}`);
                    }
                    await loadTabContent(newHashKey);
                });
            });

            const separator = document.createElement('li');
            separator.style.cssText = 'height: 1px; background-color: rgba(128, 128, 128, 0.3); margin: 10px 0;';
            separator.setAttribute('role', 'separator');
            menuList.appendChild(separator);

            Object.keys(SETTINGS_CONFIG).forEach(sectionName => {
                const section = SETTINGS_CONFIG[sectionName];
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
                span.textContent = section.title;
                link.appendChild(span);
                listItem.appendChild(link);
                menuList.appendChild(listItem);

                link.addEventListener('click', async function(e) {
                    e.preventDefault();
                    document.querySelectorAll('#unified-menu .menu-option-content').forEach(el => {
                        el.classList.remove('active');
                        el.removeAttribute('aria-current');
                    });
                    this.classList.add('active');
                    this.setAttribute('aria-current', 'page');

                    const newHash = `#!/${sectionName.toLowerCase()}`;
                    if (window.location.hash !== newHash) {
                         history.pushState(null, '', newHash);
                    }

                    const contentContainerElement = document.querySelector('#content-container');
                    if (contentContainerElement) {
                        contentContainerElement.innerHTML = `
                            <div id="settings-content" style="padding: 0; background-color: transparent;">
                                <div id="setting-section-content" style="padding: 5px;">
                                    ${generateSettingsUI(sectionName)}
                                </div>
                            </div>
                        `;
                        initSettings(contentContainerElement.querySelector('#setting-section-content'));
                        await applyTheme();
                    }
                });
            });
            return menuList;
        };

        const unifiedMenu = createUnifiedMenu();
        const contentContainer = document.createElement('div');
        contentContainer.id = 'content-container';
        contentContainer.style.flex = '1';
        contentContainer.style.overflowY = 'auto';
        contentContainer.style.overflowX = 'auto';
        contentContainer.style.paddingLeft = '0px';
        contentContainer.style.zIndex = '1000';
        contentContainer.style.position = 'relative';
        contentContainer.style.marginTop = '7px';  
        contentContainer.style.maxWidth = '750px';
        contentContainer.style.minWidth = '750px';
        contentContainer.style.backgroundColor = currentTheme === 'dark' ? 'rgb(0)' : 'rgb(0)';

        uiContainer.appendChild(unifiedMenu); 
        uiContainer.appendChild(contentContainer);

        currentHash = window.location.hash.replace('#!/', '').replace('#!', '') || 'info';
        const initialTabId = `${currentHash.toLowerCase()}-tab`;
        let tabToMatch = unifiedMenu.querySelector(`#${initialTabId} .menu-option-content`);

        if (tabToMatch) {
            tabToMatch.click();
        } else {
            const defaultTab = unifiedMenu.querySelector('#info-tab .menu-option-content');
            if (defaultTab) {
                defaultTab.click();
            }
        }
        
        settingsContainer.insertAdjacentElement("afterbegin", rovalraHeader);
        await applyTheme();
    } else {
        contentDiv.style.cssText = '';
        const userAccountDiv = contentDiv.querySelector('.row.page-content.new-username-pwd-rule#user-account')
        if(userAccountDiv){
            userAccountDiv.style.cssText = '';
        }
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
        <div style="padding: 8px;">
        <h2 style="margin-bottom: 10px;">RoValra Infomation!</h2>
        <p style="">RoValra is an extension that's trying to make basic quality of life features free and accessible to everyone, by making everything completely open-source.</p>
        <div style="margin-top: 5px;">
            <p style="">This is possible by running almost everything locally.</p>
            <div style="margin-top: 5px;">
            <p style="">If you have any feature suggestions please let me know in my Discord server or via GitHub</p>
            <div style="margin-top: 5px;">
            <p style="">If you like this extension please consider <a href="https://chromewebstore.google.com/detail/rovalra-roblox-improved/njcickgebhnpgmoodjdgohkclfplejli/reviews" target="_blank" class="rovalra-review-link">leaving a review</a>, it helps a lot ❤️</p>
            </div>
        <div style="margin-top: 10px;">
                <a href="https://discord.gg/GHd5cSKJRk" target="_blank" class="rovalra-discord-link">Discord Server</a>
                <a href="https://github.com/NotValra/RoValra" target="_blank" class="rovalra-github-link">
                Github Repo
                <img src="${chrome.runtime.getURL("Assets/icon-128.png")}" style="width: 20px; height: 20px; margin-right: 0px; vertical-align: middle;" />
                </a>
                <a href="https://www.roblox.com/games/9676908657/Gamepasses#!/store" target="_blank" class="rovalra-roblox-link">Support Me on Roblox</a>
        </div>
    </div>
    `},
    {
        text: "Credits", content: `
            <div style="padding: 8px;">
                <h2 style="margin-bottom: 10px;">RoValra Credits!</h2>
                <ul style="margin-top: 10px; padding-left: 0px;">
                    <li style="margin-bottom: 8px; list-style-type: disc; margin-left: 20px;">
                        Thanks to <b style="font-weight: bold;">Frames</b> for somehow getting the Roblox sales and revenue on some items
                        <a href="https://github.com/workframes/roblox-owner-counts" target="_blank" class="rovalra-github-link">GitHub Repo</a>
                    </li>
                    <li style="margin-bottom: 8px; list-style-type: disc; margin-left: 20px;">
                        Thanks to <b style="font-weight: bold;">Julia</b> for making a repo with all Roblox server ips which I now use to get the regions
                        <a href="https://github.com/RoSeal-Extension/Top-Secret-Thing" target="_blank" class="rovalra-github-link">GitHub Repo</a>
                    </li>
                    <li style="margin-bottom: 8px; list-style-type: disc; margin-left: 20px;">
                         Thanks to <b style="font-weight: bold;">Aspect</b> for helping me out here and there when I had a bunch of dumb questions or problems.
                         <a href="https://github.com/Aspectise" target="_blank" class="rovalra-github-link">GitHub</a>
                    </li>
                    <li style="margin-bottom: 8px; list-style-type: disc; margin-left: 20px;">
                         Thanks to <b style="font-weight: bold;">l5se</b> for allowing me to use their open source region selector as a template for my extension.
                    </li>

                    <li style="margin-bottom: 8px; list-style-type: disc; margin-left: 20px;">
                        Thanks to <b style="font-weight: bold;">7_lz</b> for helping me a bunch when preparing for the Chrome Web Store release. They helped a ton and I'm very thankful.
                    </li>
                    <li style="margin-bottom: 8px; list-style-type: disc; margin-left: 20px;">
                        Thanks to <b style="font-weight: bold;">mmfw</b> for making the screenshots on the chrome web store, and general help with UI design of the extension.
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
                            <b style="font-weight: bold;">RoSeal</b> adds so many good QoL features that I can't live without it.
                            <a href="https://www.roseal.live/" target="_blank" class="rovalra-extension-link">Website</a>
                        </li>
                        <li style="margin-bottom: 8px; list-style-type: disc; margin-left: 20px;">
                            <b style="font-weight: bold;">RoQoL</b> adds so many special features no other extension has.
                            <a href="https://roqol.io/" target="_blank" class="rovalra-extension-link">Website</a>
                        </li>
                        <li style="margin-bottom: 8px; list-style-type: disc; margin-left: 20px;">
                            <b style="font-weight: bold;">BetterBlox</b> adds back the last online, and is working on a complete rework of the Roblox website.
                            <a href="https://betterroblox.com/" target="_blank" class="rovalra-extension-link">Website</a>
                        </li>
                    </ul>
                </div>
            </div>
        `},
    {
        text: "Settings", content: `
        <div id="settings-content" style="padding: 0; background-color: transparent;">
            <div id="setting-section-buttons" style="display: flex; margin-bottom: 25px;">
            </div>
            <div id="setting-section-content" style="padding: 5px;">
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
    await applyTheme();
    observeContentChanges();
    startObserver();
    setupThemeMutationObserver(); 
    
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
    
    await checkRoValraPage(); 
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
            handleSaveSettings(settingName, target.checked).then(() => {
                const settingsContent = document.querySelector('#setting-section-content');
                if (settingsContent) {
                    loadSettings().then(currentSettings => {
                        updateConditionalSettingsVisibility(settingsContent, currentSettings);
                    });
                }
            });
        }
    } else if (target.matches('select')) {
        const settingName = target.dataset.settingName;
        if (settingName) {
            handleSaveSettings(settingName, target.value).then(() => {
                const settingsContent = document.querySelector('#setting-section-content');
                if (settingsContent) {
                    loadSettings().then(currentSettings => {
                        updateConditionalSettingsVisibility(settingsContent, currentSettings);
                    });
                }
            });
        }
    }
});

document.addEventListener('change', (event) => {
    const target = event.target;
    
    if (target.matches('input[type="file"]')) {
        const settingName = target.dataset.settingName;
        if (settingName && target.files && target.files[0]) {
            const file = target.files[0];
            const reader = new FileReader();
            
            reader.onload = (e) => {
                const dataUrl = e.target.result;
                
                const previewElement = document.querySelector(`#preview-${settingName}`);
                const clearButton = document.querySelector(`#clear-${settingName}`);
                
                if (previewElement) {
                    previewElement.src = dataUrl;
                    previewElement.style.display = 'block';
                }
                
                if (clearButton) {
                    clearButton.style.display = 'inline-block';
                }
                
                handleSaveSettings(settingName, dataUrl).then(() => {
                    console.log(`${settingName} saved successfully`);
                }).catch((error) => {
                    console.error(`Error saving ${settingName}:`, error);
                });
            };
            
            reader.readAsDataURL(file);
        }
    }
});

document.addEventListener('click', (event) => {
    const target = event.target;
    
    if (target.id && target.id.startsWith('clear-')) {
        const settingName = target.dataset.settingName;
        if (settingName) {
            const fileInput = document.querySelector(`#${settingName}`);
            if (fileInput) {
                fileInput.value = '';
            }
            
            const previewElement = document.querySelector(`#preview-${settingName}`);
            if (previewElement) {
                previewElement.src = '#';
                previewElement.style.display = 'none';
            }
            
            target.style.display = 'none';
            
            handleSaveSettings(settingName, null).then(() => {
                console.log(`${settingName} cleared successfully`);
            }).catch((error) => {
                console.error(`Error clearing ${settingName}:`, error);
            });
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
        content: isDarkMode ? 'rgb(39, 41, 48)' : 'rgb(240, 240, 240)',
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
        if (PreferredRegionEnabled && regionSettingDiv) {
            const isEnabled = PreferredRegionEnabled.checked;
            regionSettingDiv.style.display = isEnabled ? 'flex' : 'none'; 
            if(preferredRegionSelect){ 
                 preferredRegionSelect.disabled = !isEnabled;
            }
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

function updateConditionalSettingsVisibility(settingsContent, currentSettings) {
    if (!settingsContent || !currentSettings) {
        return;
    }

    const parentStates = new Map();
    for (const sectionName in SETTINGS_CONFIG) {
        const sectionConfig = SETTINGS_CONFIG[sectionName];
        for (const [settingName, settingDef] of Object.entries(sectionConfig.settings)) {
            const parentElement = settingsContent.querySelector(`#${settingName}`);
            if (parentElement) {
                let isEnabled = false;
                if (settingDef.type === 'checkbox') {
                    isEnabled = parentElement.checked;
                } else if (settingDef.type === 'select') {
                    isEnabled = !parentElement.disabled;
                }
                parentStates.set(settingName, isEnabled);
            }
        }
    }

    for (const sectionName in SETTINGS_CONFIG) {
        const sectionConfig = SETTINGS_CONFIG[sectionName];
        for (const [settingName, settingDef] of Object.entries(sectionConfig.settings)) {
            if (settingDef.childSettings) {
                const isParentEnabled = parentStates.get(settingName) || false;

                for (const [childName, childDef] of Object.entries(settingDef.childSettings)) {
                    const childSettingDiv = settingsContent.querySelector(`#setting-${childName}`);
                    const childInputElement = settingsContent.querySelector(`#${childName}`);

                    if (childSettingDiv && childInputElement) {
                        if (!isParentEnabled) {
                            childInputElement.disabled = true;
                            childSettingDiv.classList.add('disabled-setting');
                            childSettingDiv.style.opacity = '0.5';
                            childSettingDiv.style.pointerEvents = 'none';
                            
                            childSettingDiv.querySelectorAll('input, select, button').forEach(el => {
                                el.disabled = true;
                            });
                        } else {
                            childInputElement.disabled = false;
                            childSettingDiv.classList.remove('disabled-setting');
                            childSettingDiv.style.opacity = '1';
                            childSettingDiv.style.pointerEvents = 'auto';
                            
                            childSettingDiv.querySelectorAll('input, select, button').forEach(el => {
                                el.disabled = false;
                            });
                        }
                    }
                }
            }
        }
    }

    const revertLogoValue = currentSettings.revertLogo;
    const customLogoDataInput = settingsContent.querySelector('#customLogoData');
    const customLogoDataSettingWrapper = customLogoDataInput ? customLogoDataInput.closest('.setting') : null;

    if (customLogoDataSettingWrapper) {
        const isCustomLogoMode = revertLogoValue === 'CUSTOM';
        if (!isCustomLogoMode) {
            if (customLogoDataInput) {
                customLogoDataInput.disabled = true;
            }
            customLogoDataSettingWrapper.classList.add('disabled-setting');
            customLogoDataSettingWrapper.style.opacity = '0.5';
            customLogoDataSettingWrapper.style.pointerEvents = 'none';
            
            customLogoDataSettingWrapper.querySelectorAll('input, select, button').forEach(el => {
                el.disabled = true;
            });
        } else {
            if (customLogoDataInput) {
                customLogoDataInput.disabled = false;
            }
            customLogoDataSettingWrapper.classList.remove('disabled-setting');
            customLogoDataSettingWrapper.style.opacity = '1';
            customLogoDataSettingWrapper.style.pointerEvents = 'auto';
            
            customLogoDataSettingWrapper.querySelectorAll('input, select, button').forEach(el => {
                el.disabled = false;
            });
        }
    }
}

function setupThemeMutationObserver() {
    const themeObserver = new MutationObserver((mutations) => {
        let shouldUpdateTheme = false;
        
        for (const mutation of mutations) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        if (node.matches('[data-theme-dependent], .setting, .menu-option, .content-container, #content-container')) {
                            shouldUpdateTheme = true;
                            break;
                        }
                    }
                }
            }
        }
        
        if (shouldUpdateTheme) {
            debouncedApplyTheme();
        }
    });
    
    themeObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style']
    });
    
    return themeObserver;
}

// AWOOOGGAAAAAAAAA