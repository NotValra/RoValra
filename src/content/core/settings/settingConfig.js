import {
    ROBUX_FIAT_ESTIMATE_DEFAULT_GRADIENT,
    ROBUX_FIAT_ESTIMATE_STYLE_MODE_SOLID,
    ROBUX_FIAT_ESTIMATE_STYLE_OPTIONS,
    TRANSACTION_FIAT_CURRENCY_OPTIONS,
    TRANSACTION_FIAT_RATE_OPTIONS,
} from '../transactions/fiatConfig.js';

// Settings config (not developer settings)

export const SETTINGS_CONFIG = {
    Marketplace: {
        title: 'Marketplace',
        settings: {
            itemSalesEnabled: {
                label: 'Item Sales',
                description: [
                    'This shows the most up to date sales and revenue data we have.',
                    'The sales data is very likely to be inaccurate on items that are for sale, but very likely to be correct on off-sale items.',
                ],
                deprecated: 'Sale stats are very old and now inaccurate.',
                type: 'checkbox',
                default: false,
            },
            hiddenCatalogEnabled: {
                label: 'Hidden Catalog',
                description: [
                    'Shows Roblox made items before they are on the official marketplace.',
                ],
                deprecated: 'Patched by Roblox',
                locked: 'This feature has been patched by Roblox and is no longer functional.',
                isPermanent: true,
                type: 'checkbox',
                default: false,
            },
            SaveLotsRobuxEnabled: {
                label: 'Save 10%-40% Robux on Purchases',
                description: [
                    'This adds a button allowing you to save 40% on items on the marketplace and 10% on gamepasses',
                    'Keep in mind a group is required for this to work.',

                    "**When buying something there will be a 'Save X Robux' Button which when pressed will set up the experience required for it to work for you, if not already set up.**",
                ],
                type: 'checkbox',
                default: true,
                childSettings: {
                    RobuxPlaceId: {
                        label: 'Place ID to use for the 10%-40% Robux back',
                        description: [
                            'It is best to not modify this, as when using the feature it will automatically set a correct place id.',
                            "**Don't change this unless you know what your doing**",
                        ],
                        type: 'input',
                        default: null,
                        placeholder: 'Enter Place ID here...',
                    },
                    configureGame: {
                        label: 'Configure Experience',
                        description:
                            'Open the setup to configure an experience for the 40% method without needing to be in a purchase flow.',
                        type: 'button',
                        buttonText: 'Open Setup',
                        event: 'rovalra:open40methodSetup',
                    },
                },
            },
            EnableRobuxAfterPurchase: {
                label: 'Robux After Purchase',
                description:
                    "This feature restores the 'Your balance after this transaction will be X' text to the new Roblox purchase UI after it was removed.",
                type: 'checkbox',
                default: true,
            },
            EnableItemDependencies: {
                label: 'Item Dependencies',
                description: [
                    'This feature shows an items dependencies which means you are able to view the texture, mesh and more of an item.',
                ],
                type: 'checkbox',
                default: true,
            },
            priceFloorEnabled: {
                label: 'Show Price Floor',
                description:
                    'This will show the price floor when viewing items, and shows if the item you are viewing is sold at or above the price floor.',
                type: 'checkbox',
                default: true,
            },
            ParentItemsEnabled: {
                label: 'Show what bundle an item is a part of.',
                description:
                    'When viewing items pages of items inside of a bundle it will tell you what bundle that item is from.',
                type: 'checkbox',
                default: true,
            },
            PreviousPriceEnabled: {
                label: 'Previous Price to item cards and on item pages.',
                description:
                    'This shows the price of an offsale item before it went offsale.',
                type: 'checkbox',
                default: true,
            },
            itemTradingEnabled: {
                label: 'Item Trading Info',
                description: [
                    'Shows Rolimons values, demand, trend, rare, projected and more on item pages.',
                ],
                type: 'checkbox',
                default: true,
            },
        },
    },
    Games: {
        title: 'Experiences',
        settings: {
            PreferredRegionEnabled: {
                label: 'Preferred Region Play Button',
                description: [
                    'This adds a play button that joins your preferred region.',
                    'This also automatically serverhops',
                    'If you have this enabled and Quick Play Button, there will be a Preferred Region quick play button ',
                ],
                type: 'checkbox',
                default: true,
                childSettings: {
                    robloxPreferredRegion: {
                        label: 'Preferred Region',
                        description: [
                            'Select your preferred region for joining experiences.',
                            '**Automatic** will automatically attempt to find the closest region to you.',
                        ],
                        type: 'select',
                        options: 'REGIONS',
                        showFlags: true,
                        default: 'AUTO',
                    },
                },
            },
            QuickPlayEnable: {
                label: 'Quick Play Button',
                description: [
                    'This will add a quick play button to experiences so you can quickly join the experience without opening the experience page.',
                    'If you have Preferred Region Play Button enabled it will also add a Preferred Region quick play button to quickly join your preferred region.',
                    "This is made to look like the official Roblox client's Quick Play button.",
                ],
                type: 'checkbox',
                default: true,
                childSettings: {
                    privateservers: {
                        label: 'Show Private Servers in Quick Play',
                        description: [
                            'This adds a button to quickly browse and join private servers to the quick play.',
                        ],
                        type: 'checkbox',
                        default: true,
                    },
                    playbuttonpreferredregionenabled: {
                        label: 'Change the normal Play button to join your preferred region in Quick Play',
                        description: [
                            'This makes the Roblox Play button in the Quick Play join servers closest to you, instead of a random region.',
                        ],
                        type: 'checkbox',
                        default: true,
                    },
                },
            },
            whatamIJoiningEnabled: {
                label: 'What Am I Joining',
                description: [
                    "This shows the server ID, region, if it's a private server, and more info about the server you are joining when joining an experience.",
                ],
                type: 'checkbox',
                default: true,
                childSettings: {
                    AlwaysGetInfo: {
                        label: 'Always Get Server Info',
                        description: [
                            'This will always get the server info, even if no server data is available.',
                            'It has a very small change to get inaccurate information.',
                        ],
                        type: 'checkbox',
                        default: true,
                    },
                    closeUiByClickingTheBackground: {
                        label: "Close the 'What am I joining' UI by clicking the background",
                        description:
                            'This allows you to click the background to close the UI, can be annoying if you want to see the info provided in the UI',
                        type: 'checkbox',
                        default: true,
                    },
                },
            },
            EnableImprovedEvents: {
                label: 'Improved Events',
                description:
                    'This allows you to view past events on experiences and how many are going.',
                type: 'checkbox',
                default: true,
            },
            EnableGameTrailer: {
                label: 'Experience Trailer',
                description: [
                    "This adds experience trailers not on youtube to the website, replacing Roblox's way of doing it.",
                    'And as a result adding more quality of life, like being able to full screen, turn off auto play, view the length of the video, change playback speed and picture in picture mode.',
                ],
                type: 'checkbox',
                default: false,
                locked: 'Feature broke and Roblox made their own version.',
                isPermanent: true,
                childSettings: {
                    Enableautoplay: {
                        label: 'Auto Play Trailer',
                        description: [
                            'This will automatically play the trailer',
                        ],
                        type: 'checkbox',
                        default: true,
                    },
                },
            },
            EnableDevProducts: {
                label: 'View Developer Products',
                description:
                    'This allows you to view the developer products of an experience directly on the store page.',
                type: 'checkbox',
                default: true,
            },
            QuickOutfitsEnabled: {
                label: 'Quick Equip Outfits',
                description: [
                    'This allows you to quickly switch your avatar on the an experience page.',
                ],
                type: 'checkbox',
                default: false,
            },
            privateGameDetectionEnabled: {
                label: 'View Private / Moderated Games',
                description: [
                    'This recreates the experience page of private / moderated games, allowing you to view them.',
                ],
                type: 'checkbox',
                default: false,
                requiredPermissions: ['webRequest'],
            },
            botdataEnabled: {
                label: 'Bot Data',
                description: [
                    'Shows if an experience has a lot of bots in the description of the experience.',
                    "It doesn't show the amount of bots, since the sample size is too small to give an accurate number.",
                ],
                type: 'checkbox',
                default: true,
            },
            subplacesEnabled: {
                label: 'Subplaces',
                description: [
                    'This adds a tab to an experience page that shows the subplaces of the experience.',
                ],
                type: 'checkbox',
                default: true,
            },
            updateHistoryEnabled: {
                label: 'Update History',
                description: [
                    'This adds a tab to an experience page that has a heatmap showing the update history of an experience.',
                    'This feature was heavily inspired by a RoPro v2 feature.',
                ],
                type: 'checkbox',
                default: true,
                beta: 'This feature is lacking update history data. It will slowly get it over time.',
            },
            recentServersEnabled: {
                label: 'Recent Servers',
                description: [
                    'Shows the 4 most recent servers you joined under an experience.',
                ],
                type: 'checkbox',
                default: true,
                storageKey: 'rovalra_server_history',
            },
            TotalServersEnabled: {
                label: 'Total Servers',
                description: [
                    'This shows the total amount of servers RoValra is tracking under that experience.',
                ],
                type: 'checkbox',
                default: true,
            },
            GameVersionEnabled: {
                label: 'Experience Version',
                description: [
                    'This shows the current version an experience is on.',
                    'Useful for developers.',
                ],
                type: 'checkbox',
                default: true,
            },
            TotalSpentGamesEnabled: {
                label: 'Total Spent on Experience',
                description: [
                    'This shows how much Robux you have spent total on this experience.',
                    'This will scan your transactions in the background and store the total spent (locally)',
                    'This may take a few mins before it works when first installing the extension.',
                ],
                type: 'checkbox',
                default: true,
                storageKey: 'rovalra_transactions_data',
            },
            OldestVersionEnabled: {
                label: 'Oldest Server Version',
                description: [
                    'This shows the oldest place version that servers are still running on.',
                    'Useful for developers.',
                ],
                type: 'checkbox',
                default: true,
            },
            ServerFilterEnabled: {
                label: 'Server Filters',
                description: [
                    'This adds a filter to the server list.',
                    "**It is highly recommended that the 'Server List Modifications' setting is enabled for this to work correctly.**",
                ],
                type: 'checkbox',
                default: true,
                childSettings: {
                    RegionFiltersEnabled: {
                        label: 'Region Filters',
                        description: 'Adds Region filters in the server list.',
                        type: 'checkbox',
                        default: true,
                    },
                    UptimeFiltersEnabled: {
                        label: 'Uptime Filters',
                        description:
                            'Adds Server Uptime filters in the server list.',
                        type: 'checkbox',
                        default: true,
                    },
                    VersionFiltersEnabled: {
                        label: 'Place Version Filters',
                        description:
                            'Adds Place Version filters in the server list allowing you to filter by servers running a specific place version.',
                        type: 'checkbox',
                        default: true,
                    },
                },
            },
            ServerlistmodificationsEnabled: {
                label: 'Server List Modifications',
                description: [
                    'This adds multiple different features to the server list',
                    "These modifications will also apply to the 'Servers My Friends Are In'",
                ],
                type: 'checkbox',
                default: true,
                childSettings: {
                    enableShareLink: {
                        label: 'Share link button',
                        description: [
                            'This adds a share link button under the join button so you can send a link to the server for other people to join with.',
                            'This uses fishstrap.app for the share link.',
                        ],
                        type: 'checkbox',
                        default: true,
                    },
                    EnableServerUptime: {
                        label: 'Server Uptime',
                        description: [
                            'This shows an estimate of a servers uptime in the server list.',
                            'This works by RoValra tracking hundreds of thousands of servers in a database and then estimating the uptime.',
                        ],
                        type: 'checkbox',
                        default: true,
                    },
                    EnableServerRegion: {
                        label: 'Server Region',
                        description: [
                            'This shows the servers region / location',
                        ],
                        type: 'checkbox',
                        default: true,
                    },
                    EnablePlaceVersion: {
                        label: 'Server Version',
                        description: [
                            'This shows the version of the experience that a specific server is running.',
                        ],
                        type: 'checkbox',
                        default: true,
                    },
                    EnableFullServerID: {
                        label: 'Show the entire ServerID',
                        description: [
                            'This shows the entire ServerID',
                            'By default Roblox only shows a part of it.',
                            'It will hide ServerIDs of servers that you are playing in or friends are playing in unless hovered over.',
                        ],
                        type: 'checkbox',
                        default: true,
                    },
                    EnableFullServerIndicators: {
                        label: 'Full Server Indicators',
                        description: [
                            'This adds indicators when a server is full',
                            "Like the queue size, and text telling you the server is full if we don't have region data.",
                        ],
                        type: 'checkbox',
                        default: true,
                    },
                    EnableServerPerformance: {
                        label: 'Show Server Performance',
                        description: [
                            'This will show the performance of the server, useful if you wanna avoid servers that are running poorly.',
                        ],
                        type: 'checkbox',
                        default: true,
                    },
                    EnableMiscIndicators: {
                        label: 'Show misc indicators',
                        description: [
                            'This shows indicators for servers you cannot join like if someone is playing in a private server',
                        ],
                        type: 'checkbox',
                        default: true,
                    },
                    EnableDatacenterandId: {
                        label: 'Show Datacenter ID and Server Ip',
                        description:
                            'This shows the Datacenter ID server Ip of servers in the server list.',
                        type: 'checkbox',
                        default: false,
                    },
                },
            },
            PrivateQuickLinkCopy: {
                label: 'Quick Private Server Link Copy and Generation',
                description: [
                    'This allows you to quickly copy a private server link or generate a new private server link',
                ],
                type: 'checkbox',
                default: true,
            },
        },
    },
    Profile: {
        title: 'Profile',
        settings: {
            userGamesEnabled: {
                label: 'Hidden User Experiences',
                description: [
                    'Shows a users hidden experiences on their profile.',
                ],
                type: 'checkbox',
                default: true,
            },
            userSniperEnabled: {
                label: 'Instant Joiner',
                description: [
                    'This joins a user instantly when they go into an experience, best used for people with a lot of people trying to join them.',
                    '### Requirements',
                    '- This feature requires the user to have their joins enabled for everyone or for you to be friends with them.',
                ],
                type: 'checkbox',
                default: true,
                childSettings: {
                    deeplinkEnabled: {
                        label: 'Join through deeplinks',
                        description: [
                            'This will use deeplinks to join the user for faster joining but may be less reliable.',
                        ],
                        type: 'checkbox',
                        default: false,
                    },
                },
            },

            profile3DRenderEnabled: {
                label: 'Enable Custom 3D Profile Renderer',
                description: [
                    'Replaces the default profile avatar with a more customizable and feature-rich 3D renderer.',
                    'This feature is required for custom environments and other render-related settings.',
                    'This feature was made possible cause of [RoAvatar](https://github.com/steinann/RoAvatar) ❤️',
                ],
                type: 'checkbox',
                default: false,
                experimental:
                    'This feature may cause performance issues. And may be buggy',
                childSettings: {
                    profileRenderUseApi: {
                        label: 'Use RoValra API for Environment',
                        description:
                            "Uses RoValra's API to save your environment choice instead of your 'About Me' section.",
                        type: 'checkbox',
                        default: true,
                        donatorTier: 1,
                        donatorReason:
                            'Donator 1 is required since RoValra doesnt have the resources to track the 200k+ user settings.',
                    },
                    profileRenderEnvironment: {
                        label: '3D Profile Environment',
                        description: [
                            "Choose a custom environment for your own profile's 3D render.",
                            'This only applies when viewing your own profile.',
                            'If you arent a RoValra donator it will add a e:x into your about me so other RoValra users can see your environment',
                        ],
                        type: 'select',
                        options: [
                            { label: 'None', value: 'void', id: 1 },
                            {
                                label: 'Purple Space',
                                value: 'purple',
                                environmentEndpoint:
                                    '/static/json/skyboxSpace.json',
                                id: 2,
                            },

                            {
                                label: 'Crossroads',
                                value: 'crossroads',
                                environmentEndpoint:
                                    '/static/json/crossroads.json',
                                id: 3,
                            },
                            {
                                label: 'Baseplate',
                                value: 'baseplate',
                                environmentEndpoint:
                                    '/static/json/baseplate.json',
                                id: 4,
                            },
                        ],
                        default: 'void',
                    },
                    profileRenderRotateEnabled: {
                        label: 'Auto-Rotate Profile Avatar',
                        description: [
                            'Automatically rotates the 3D avatar on the profile page.',
                        ],
                        type: 'checkbox',
                        default: false,
                    },
                    environmentTester: {
                        label: 'Enable Environment Creator',
                        description: [
                            'Shows the Environment Creator tool on profiles to make custom client sided environments.',
                            'This is to prepare for community environments',
                            'This will overwrite all environment on profiles',
                            '**This feature should only be enabled if you plan to make environments**',
                        ],
                        type: 'checkbox',
                        default: false,
                    },
                },
            },
            trustedConnectionsEnabled: {
                label: 'Trusted Friends',
                description: [
                    'This feature allows you to accept, request and remove trusted friends on the site by pressing the (...) on their profile, this will only work for eligible friends.',
                    'Eligible friends must be ID or face-scan verified and within your age bracket (13–17 or 18+).',
                    'Trusted Friends might not be available in some regions.',
                    '**Note:** Roblox uses an algorithm that may prevent adding someone even if they meet these requirements. [Learn more here.](https://en.help.roblox.com/hc/en-us/articles/46158344285204)',
                ],
                type: 'checkbox',
                default: true,
            },
            lastOnlineEnabled: {
                label: 'Show Last Online / Last Seen',
                description: [
                    'Shows when a user was last online / seen on their profile.',
                    'Only works for friends.',
                ],
                type: 'checkbox',
                default: true,
            },
            friendsSinceEnabled: {
                label: 'Friends Since',
                description:
                    'This feature shows how long you have been friends with someone on their profile and in your friends list.',
                type: 'checkbox',
                default: true,
            },
            groupRoleEnabled: {
                label: 'Show Community Roles',
                description:
                    'Shows a users role in a community on their profile.',
                type: 'checkbox',
                default: true,
            },

            showFriendedFromEnabled: {
                label: 'Show Friended From',
                description:
                    'This shows where you became friends with a user e.g in game, profile etc',
                type: 'checkbox',
                default: true,
            },
            lastPlayedTogetherEnabled: {
                label: 'Most Played Together',
                description:
                    'Shows the experience you played the most with a friend on their profile.',
                type: 'checkbox',
                default: true,
            },
            bulkUnfriendEnabled: {
                label: 'Bulk Unfriend',
                description:
                    'This allows you to unfriend people from your friends list in bulk',
                type: 'checkbox',
                default: true,
            },
            PrivateServerBulkEnabled: {
                label: 'Private Server Bulk Removal',
                description: [
                    'This will add a toggle to the private server inventory tab that allows you to easily set a bunch of private servers as inactive.',
                    'This also works for setting inactive private servers as active',
                ],
                type: 'checkbox',
                default: true,
            },
            idVerificationBadgeEnabled: {
                label: 'ID Verification Badge',
                description: [
                    'Shows if a user has verified their ID on their profile.',
                ],
                type: 'checkbox',
                default: true,
            },
            statusBubbleEnabled: {
                label: 'Status Bubble',
                description: [
                    'This allows you to set a status bubble on your profile that anyone with RoValra can see.',
                    'Also allows you to view other RoValra users status bubbles.',
                    'This works by adding a little "s:" string to your about me.',
                ],
                type: 'checkbox',
                default: true,
                childSettings: {
                    statusBubbleUseApi: {
                        label: 'Use RoValra API for Status',
                        description:
                            "Uses RoValra's API to save your status instead of your 'About Me' section.",
                        type: 'checkbox',
                        default: true,
                        donatorTier: 1,
                        donatorReason:
                            'Donator 1 is required since RoValra doesnt have the resources to track the 200k+ user settings.',
                    },
                    statusBubbleHomePage: {
                        label: 'Status bubble for friends on home page, and other parts of the site where friends might show.',
                        type: 'checkbox',
                        default: true,
                    },
                    disableVideoAudio: {
                        label: 'Disable Video Audio In status',
                        description: [
                            'Mutes audio on videos in statuses.',
                            'Select people can set videos in their status, and this mutes it.',
                            '**Only select people can add videos to their status, and the list wont expand**',
                        ],
                        type: 'checkbox',
                        default: false,
                    },
                },
            },
            donationbuttonEnable: {
                label: 'Donation Button',
                description: [
                    "This will add a donation button to a user's profile, which allows you to donate to someone via PLS Donate",
                ],
                type: 'checkbox',
                default: true,
            },

            categorizeWearingEnabled: {
                label: 'Improved Currently Wearing',
                description: [
                    "Separates the 'Currently Wearing' section on profiles into categories like Items, Emotes, Body Parts and Animations.",
                    'Also improves the item cards making them look a bit better and adds total outfit price.',
                    'This feature was heavily inspired by a [roseal](https://www.roseal.live/) feature.',
                ],
                type: 'checkbox',
                default: true,
                childSettings: {
                    CategorizeBodyParts: {
                        label: 'Body Parts in its own category',
                        description:
                            'This puts Body Parts into its own category',
                        type: 'checkbox',
                        default: true,
                    },
                    CategorizeEmotes: {
                        label: 'Emotes in its own category',
                        description: 'This puts Emotes into its own category',
                        type: 'checkbox',
                        default: true,
                    },
                    CategorizeAnimations: {
                        label: 'Animations in its own category',
                        description:
                            'This puts Animations into its own category',
                        type: 'checkbox',
                        default: true,
                    },
                },
            },
            userRapEnabled: {
                label: 'User RAP/Value',
                description: [
                    "This shows a user's total RAP/Value on their profile.",
                ],
                type: 'checkbox',
                default: true,
                childSettings: {
                    HideSerial: {
                        label: 'Hide Serial Numbers',
                        description: [
                            'This hides serial numbers on limiteds unless you hover over them.',
                        ],
                        type: 'checkbox',
                        default: false,
                    },
                },
            },
            useroutfitsEnabled: {
                label: 'User Outfits',
                description: [
                    "This allows you to view a user's saved outfits on their profile.",
                ],
                type: 'checkbox',
                default: true,
            },
            RoValraBadgesEnable: {
                label: 'RoValra Badges',
                description: [
                    'Disabling this will hide any RoValra badges from profiles.',
                ],
                type: 'checkbox',
                default: true,
            },
            profileBackgroundGradientEnabled: {
                label: 'Custom Profile Background Gradient',
                description: [
                    'Shows a users selected gradient on their profile',
                ],
                type: 'checkbox',
                default: true,
                childSettings: {
                    profileGradient: {
                        label: 'Profile Gradient',
                        description:
                            'Set your own gradient for your own profile',
                        type: 'gradient',
                        donatorTier: 2,
                        donatorReason:
                            'Donator 2 is required to set a custom profile gradient. This feature is purely cosmetic in order to reward donators',
                        default: {
                            enabled: false,
                            color1: '#667eea',
                            color2: '#764ba2',
                            angle: 135,
                            fade: 100,
                        },
                    },
                    applyGradientToAvatarTile: {
                        label: 'Apply Gradient Background to Profile Thumbnails',
                        description: [
                            'This adds the Gradient Background to profile thumbnails across the site like on the home page',
                        ],
                        type: 'checkbox',
                        default: true,
                    },
                },
            },
            bannedUserDetectionEnabled: {
                label: 'View Banned Users Profile',
                description: ['Allows you to view banned users Profile.'],
                type: 'checkbox',
                default: false,
                requiredPermissions: ['webRequest'],
            },
        },
    },
    Communities: {
        title: 'Communities',
        settings: {
            groupGamesEnabled: {
                label: 'Hidden Community Experiences',
                description: ['Shows a communities hidden experiences.'],
                type: 'checkbox',
                default: true,
            },
            pendingRobuxEnabled: {
                label: 'Unpending Robux',
                description: [
                    'Shows an estimate of how many pending Robux will stop pending within 24 hours.',
                ],
                experimental:
                    'May be inaccurate. And will take ages depending on the amount of sales',
                type: 'checkbox',
                default: false,
            },
            antibotsEnabled: {
                label: 'Anti-Bot Members',
                description: [
                    'This adds a button that will allow you to scan all members in a community for bots.',
                    'If there is any bots it will allow you to quickly ban or kick them.',
                    'This calculates bots by similar avatars and display names, so it may not be 100% accurate.',
                ],
                experimental: 'Takes ages since Roblox has heavy rate limits.',
                type: 'checkbox',
                default: true,
                locked: "This broke in a UI update, it wasn' that good to begin with cuz of rate limits",
                isPermanent: false,
            },
            QuickActionsEnabled: {
                label: 'Quick Actions',
                description: [
                    'This adds a quick action button allowing you to quickly ban or kick a bunch of users at once.',
                ],
                type: 'checkbox',
                default: true,
                locked: "This broke in a UI update, it wasn' that good to begin with cuz of rate limits",
                isPermanent: false,
            },
            draggableGroupsEnabled: {
                label: 'Draggable Communities',
                description: [
                    'Hold and drag your communities to reorder them however you want.',
                    'Your custom order will be saved and persist across page refreshes.',
                    'Just hold down on a community for a moment and drag it up or down.',
                ],
                type: 'checkbox',
                default: true,
                storageKey: 'rovalra_groups_order',
            },
            groupPlaceVisitsEnabled: {
                label: 'Total Community Place Visits',
                description: [
                    "Shows the total number of visits across all of a community's experiences in the insights section.",
                ],
                type: 'checkbox',
                default: true,
            },
            groupCreateDateEnabled: {
                label: 'Community Creation Date',
                description: [
                    'Shows when a community was created in its header.',
                ],
                type: 'checkbox',
                default: true,
            },
        },
    },
    Avatar: {
        title: 'Avatar',
        settings: {
            forceR6Enabled: {
                label: 'Remove R6 Warning',
                description: ['Removes the R6 warning when switching to R6'],
                type: 'checkbox',
                default: true,
            },
            multiEquipEnabled: {
                label: 'Multi-Equip',
                description: [
                    'Allows you to equip multiple items like accessories seamlessly without having to use the advanced tab.',
                ],
                type: 'checkbox',
                default: true,
            },
            stickyAvatarEnabled: {
                label: 'Sticky Avatar Preview',
                description:
                    'This forces the avatar preview to always be in view on the avatar editor.',
                type: 'checkbox',
                default: true,
            },
            avatarFiltersEnabled: {
                label: 'Avatar Filters',
                description: [
                    'Adds filters to the avatar page, allowing you to filter by effect items, limited, offsale / onsale and more.',
                ],
                type: 'checkbox',
                default: true,
            },
            searchbarEnabled: {
                label: 'Adds a Searchbar to the Avatar Page',
                description: [
                    'Allowing you to quickly search for items in the avatar editor.',
                ],
                type: 'checkbox',
                default: true,
            },
            avatarRotatorEnabled: {
                label: 'Avatar Rotator',
                description: [
                    'Adds an avatar Rotator allowing you to Rotate between different avatars on a set interval.',
                    'Allowing you to have a random avatar equipped every time you join an experience or respawn.',
                ],
                type: 'checkbox',
                default: true,
                storageKey: [
                    'rovalra_avatar_rotator_enabled',
                    'rovalra_avatar_rotator_ids',
                    'rovalra_avatar_rotator_interval',
                ],
            },
        },
    },
    transactions: {
        title: 'Transactions',
        settings: {
            robuxFiatEstimatesEnabled: {
                label: 'Robux Fiat Estimates',
                description: [
                    'Shows a money estimate beside Robux values on the transactions page, group revenue pages, and related Robux UI.',
                    'You can choose both the display currency and whether the estimate uses Roblox purchase pricing or the current DevEx cash-out rate.',
                ],
                type: 'checkbox',
                default: false,
                experimental:
                    'Sometimes shows the wrong amount. And it might causes some issues on the site.',
                childSettings: {
                    robuxFiatDisplayCurrency: {
                        label: 'Display Currency',
                        description: [
                            'Select which currency RoValra should convert Robux estimates into.',
                        ],
                        type: 'select',
                        options: TRANSACTION_FIAT_CURRENCY_OPTIONS,
                        default: 'USD',
                    },
                    robuxFiatRateMode: {
                        label: 'Valuation Mode',
                        description: [
                            'Normal Purchase Rate uses Roblox purchase pricing as the estimate source.',
                            'DevEx Cash-Out Rate uses the current Roblox DevEx cash-out rate of $0.0038 per Earned Robux before converting to your selected currency.',
                        ],
                        type: 'select',
                        options: TRANSACTION_FIAT_RATE_OPTIONS,
                        default: 'normal',
                    },
                    robuxFiatEstimateStyleMode: {
                        label: 'Text Style',
                        description: [
                            'Choose between a solid color or a two-color gradient for the fiat estimate text.',
                        ],
                        type: 'select',
                        options: ROBUX_FIAT_ESTIMATE_STYLE_OPTIONS,
                        default: ROBUX_FIAT_ESTIMATE_STYLE_MODE_SOLID,
                    },
                    robuxFiatEstimateColor: {
                        label: 'Estimate Text Color',
                        description: [
                            'Pick the color used for the fiat estimate text shown next to Robux values. Used when Text Style is set to Solid Color.',
                        ],
                        type: 'color',
                        default: '#7a7d81',
                    },
                    robuxFiatEstimateGradient: {
                        label: 'Estimate Text Gradient',
                        description: [
                            'Customize the gradient used for the fiat estimate text. Used when Text Style is set to Gradient.',
                        ],
                        type: 'gradient',
                        default: ROBUX_FIAT_ESTIMATE_DEFAULT_GRADIENT,
                    },
                    robuxFiatEstimateBold: {
                        label: 'Bold Estimate Text',
                        description: ['Render the fiat estimate text in bold.'],
                        type: 'checkbox',
                        default: false,
                    },
                    robuxFiatEstimateItalic: {
                        label: 'Italic Estimate Text',
                        description: [
                            'Render the fiat estimate text in italic.',
                        ],
                        type: 'checkbox',
                        default: false,
                    },
                },
            },
            totalspentEnabled: {
                label: 'Total Spent',
                description: [
                    'This calculates the total amount of Robux and money you have spent on your account based on your transaction history.',
                ],
                type: 'checkbox',
                default: true,
            },
            totalearnedEnabled: {
                label: 'Total Earned',
                description: [
                    'This Calulates the amount of Robux you have earned through out the years via stuff like gamepasses, item sales etc.',
                ],
                type: 'checkbox',
                default: true,
            },
            pendingrobuxtrans: {
                label: 'Unpending Robux Transactions',
                description: [
                    'This estimates how many Robux will stop pending in 24 hours.',
                ],
                experimental:
                    'May be inaccurate. And will take ages depending on the amount of sales',
                type: 'checkbox',
                default: false,
            },
        },
    },
    Trading: {
        title: 'Trading',
        settings: {
            tradeValuesEnabled: {
                label: 'Trade Values',
                description: [
                    'This shows a bunch of useful information when trading, stuff like:',
                    'Rolimons Values, Trade differences in values and rap, item demand, item trend and more.',
                ],
                type: 'checkbox',
                default: true,
                childSettings: {
                    tradeShowItemValues: {
                        label: 'Show Item Values',
                        description:
                            'Display Rolimons item values on individual trade item cards',
                        type: 'checkbox',
                        default: true,
                    },
                    tradeShowProjectedIndicator: {
                        label: 'Show Projected Item Indicator',
                        description: 'Display warning icon for projected items',
                        type: 'checkbox',
                        default: true,
                    },
                    tradeShowRareIndicator: {
                        label: 'Show Rare Item Indicator',
                        description: 'Display rare item indicator icon',
                        type: 'checkbox',
                        default: true,
                    },
                    tradeShowItemInfo: {
                        label: 'Show Item Info / Trend / Demand',
                        description:
                            'Display item information tooltip with trend, demand and risk data',
                        type: 'checkbox',
                        default: true,
                    },
                    tradeShowTotalValue: {
                        label: 'Show Total Trade Value',
                        description:
                            'Display total value summary line in trade offers',
                        type: 'checkbox',
                        default: true,
                    },
                    tradeShowTotalDemand: {
                        label: 'Show Average Demand',
                        description:
                            'Display average demand summary line in trade offers',
                        type: 'checkbox',
                        default: true,
                    },
                    tradeShowDiffPills: {
                        label: 'Show Value / RAP Difference Pills',
                        description:
                            'Display the value and RAP difference comparison pills at the bottom of the trade window',
                        type: 'checkbox',
                        default: true,
                    },
                },
            },
            tradePreviewEnabled: {
                label: 'Trade Preview',
                description: [
                    'Allows you to preview the value differences of a trade before opening it up.',
                    'Also changes the timestamp for when the trade was sent to something more readable and adds a "open in Rolimons" beside a users username',
                ],
                type: 'checkbox',
                default: true,
            },
            tradeFilterEnabled: {
                label: 'Trade Filter',
                description:
                    'Adds a search bar to the trade page. Allowing you to search for trades containing specific items.',
                type: 'checkbox',
                default: true,
            },
            tradeSearchEnabled: {
                label: 'Trade Search',
                description:
                    'Allows you to search for items in the create trade pages to quickly find them.',
                type: 'checkbox',
                default: true,
            },
            confirmTradeEnabled: {
                label: 'Trade Protection',
                description:
                    'This adds a small Preview of the trade you are doing in the accept / decline confirmation pop up.',
                type: 'checkbox',
                default: true,
            },
            tradeProofEnabled: {
                label: 'Proof Trades',
                description:
                    'This allows you to quickly copy the rolimons proof format for any trade.',
                type: 'checkbox',
                default: false,
                experimental:
                    'This may be inaccurate, and may in some cases have issues resulting in an inaccurate proof. Please verify it is correct before using.',
            },
            tradeRiskEnabled: {
                label: 'Show Item Risk',
                description:
                    'Shows the calculated risk of an item based on its trading history on item pages and trade pages.',
                type: 'checkbox',
                default: false,
                experimental:
                    'May be inaccurate. It is not recommended to fully rely on this.',
            },
        },
    },
    Navigation: {
        title: 'Navigation',
        settings: {
            qolTogglesEnabled: {
                label: 'Adds quality of life toggles to the navigation bar',
                description:
                    'Allowing you to quickly change your online status or experience status without going into settings.',
                type: 'checkbox',
                default: true,
            },
            betaProgramsEnabled: {
                label: 'Adds a beta programs toggle to the navigation bar',
                description:
                    'This allows you to toggle beta programs you are enrolled into easily.',
                type: 'checkbox',
                default: false,
            },
            transactionsSidebarLinkEnabled: {
                label: 'My Transactions sidebar link',
                description:
                    'Adds a My Transactions link below Communities in the Roblox sidebar.',
                type: 'checkbox',
                default: false,
            },
            quickSearchEnabled: {
                label: 'Quick Search',
                description:
                    'This adds an autocomplete to the search dropdown for users, friends and experiences',
                type: 'checkbox',
                default: true,
                childSettings: {
                    userSearchEnabled: {
                        label: 'Quick User Search',
                        description:
                            'Shows a user that matched what you searched in the search dropdown.',
                        type: 'checkbox',
                        default: true,
                    },
                    gameSearchEnabled: {
                        label: 'Quick Experience Search',
                        description:
                            'Shows an experience that has the best match to what you searched in the search dropdown.',
                        type: 'checkbox',
                        default: true,
                    },
                    friendSearchEnabled: {
                        label: 'Quick Friend Search',
                        description:
                            'Shows a list of friends that has the best match to what you searched in the search dropdown.',
                        type: 'checkbox',
                        default: true,
                    },
                },
            },
            searchHistoryEnabled: {
                label: 'Search History',
                description:
                    'This tracks what you search on Roblox and allows you to view it.',
                type: 'checkbox',
                default: true,
                storageKey: 'rovalra_search_history',
            },
            GroupFundsEnabled: {
                label: 'Show Community Funds',
                description:
                    'Shows the funds of a specific community when pressing your Robux amount in the navigation bar.',
                type: 'checkbox',
                default: false,
                storageKey: 'rovalra-group-funds-data',
                childSettings: {
                    GroupFundsIds: {
                        label: 'Community IDs',
                        description:
                            'The IDs of the communities to show funds for.',
                        type: 'list',
                        default: [''],
                        addButtonText: 'Add Another Community',
                        placeholder: 'Enter Community ID...',
                    },
                },
            },
        },
    },
    Miscellaneous: {
        title: 'Miscellaneous',
        settings: {
            MemoryleakFixEnabled: {
                label: 'Fix Roblox Memory Leak',
                description: [
                    'This attempts to fix the memory leak caused by the Roblox website when reloading a page or navigating the site.',
                    "This fix will redirect most url changes to 'about:blank' and then to the intended url, which fixes the memory leak, but may cause a slight flicker when navigating and issues with the back and forward arrows.",
                    "If you don't know what a memory leak is or you don't feel like Roblox is using too much memory, you can leave this off.",
                    "**This will prompt you to enable the 'webNavigation' permission for the feature to work.**",
                ],
                experimental: 'May cause some issues.',
                type: 'checkbox',
                default: false,
                requiredPermissions: ['webNavigation'],
            },
            Customfont: {
                label: 'Custom font',
                description: [
                    'This allows to set custom font for the Roblox website.',
                ],
                type: 'checkbox',
                default: false,
                childSettings: {
                    Customfontlink: {
                        label: 'Google Fonts link',
                        description: [
                            'You can find Fonts at https://fonts.google.com/',
                            'The link should look like "https://fonts.google.com/specimen/Comic+Neue"',
                        ],
                        type: 'input',
                        default: null,
                        placeholder: 'Enter Font Link here...',
                    },
                },
            },
            ServerdataEnabled: {
                label: "Send Server IDs and Place IDs to RoValra's API",
                description: [
                    "This feature sends server IDs and place IDs to RoValra's API when you browse the site.",
                    'This data is used for the server uptime and the Total Servers features.',
                    'Leaving this feature on will help improve the Server Uptime and Total Servers features.',
                    '**No personal data is sent, not even user ID or username—only the server IDs and the place ID.**',
                    '**No data that can be used to link the server IDs/place IDs to you are sent or logged.**',
                ],
                type: 'checkbox',
                default: true,
            },
            DownloadCreateEnabled: {
                label: 'Adds a download button to create.roblox.com',
                description:
                    'This feature allows you to download assets like meshes, images, audios, etc from the create page.',
                type: 'checkbox',
                default: true,
            },
            legacyThemeSwitcherEnabled: {
                label: 'Legacy Theme Switcher',
                description: [
                    'This adds a dropdown in the Roblox settings which replicates how the old theme switcher worked',
                    "This means you won't have to switch to your preferred theme when logging in on a new browser",
                ],
                type: 'checkbox',
                default: false,
            },

            copyIdEnabled: {
                label: 'Allows you to quickly copy an id of a thing you are right clicking.',
                description:
                    "This adds a copy id button directly into the right click context menu so you don't have  to open the link and copy the id from the link.",
                type: 'checkbox',
                default: false,
                requiredPermissions: ['contextMenus'],
            },
            copyUniverseIdEnabled: {
                label: 'Allows you to quickly copy a universe id',
                description:
                    'This adds a copy universe id button directly into the right click context menu.',
                type: 'checkbox',
                default: false,
                requiredPermissions: ['contextMenus'],
            },

            cssfixesEnabled: {
                label: 'Site Fixes',
                description: [
                    'This fixes various site issues or just poor design choices by Roblox.',
                ],
                type: 'checkbox',
                default: true,
                childSettings: {
                    giantInvisibleLink: {
                        label: "Fix the Continue and Favorites buttons' clickable area",
                        description: [
                            'Fixes the Continue and Favorites buttons on the home page being wider than shown visually.',
                        ],
                        type: 'checkbox',
                        default: true,
                    },
                    gameTitleIssueEnable: {
                        label: 'Fix the experience title issues',
                        description:
                            'Fixes the top and bottom of experience titles on profiles getting cut off.',
                        type: 'checkbox',
                        default: true,
                    },
                    FixCartRemoveButton: {
                        label: 'Fix Cart Remove Button Size',
                        description:
                            'Fixes the size of the remove item from cart button being super small in the shopping cart.',
                        type: 'checkbox',
                        default: true,
                    },
                },
            },
            eastereggslinksEnabled: {
                label: 'Easter Egg Links',
                description: [
                    'Adds Easter eggs to random links that otherwise would do nothing.',
                    'Some easter eggs redirect offsite.',
                ],
                type: 'checkbox',
                default: true,
            },
            firstAccountEnabled: {
                label: 'First Account?',
                description:
                    "This adds a section in Roblox's settings showing if Roblox considers your Roblox account the first Roblox account you created.",
                type: 'checkbox',
                default: true,
                storageKey: 'rovalra_first_account_cache',
            },
            revertLogo: {
                label: 'Change the app launch icon',
                description: [
                    'This changes the icon that shows when you join an experience.',
                    'Old icon is the icon it had before they changed it to the new app client icon.',
                    'And of course, a custom icon can be any image you want.',
                ],
                type: 'checkbox',
                default: false,
                childSettings: {
                    customLogoData: {
                        label: 'Custom icon',
                        description: [
                            'Upload your custom image. Maximum file size is 1MB.',
                        ],
                        type: 'file',
                        default: null,
                        compressSettingName: 'compressCustomLogo',
                        storageKey: 'customLogoData',
                    },
                    compressCustomLogo: {
                        label: 'Compress Custom Icon',
                        description: [
                            'Compresses the image to reduce storage space (max 512px, JPEG 80% quality for photos, PNG for transparent images).',
                            'Disable this to keep full quality and transparency, but it may use more storage space.',
                            'Uncompressed images must still be under 1MB.',
                        ],
                        type: 'checkbox',
                        default: true,
                    },
                },
            },
        },
    },
    AntiAccountTracking: {
        title: 'Privacy',
        settings: {
            streamermode: {
                label: 'Streamer Mode',
                description: [
                    "This feature hides information that you most likely don't wanna accidently show on something like a live stream.",
                ],
                type: 'checkbox',
                default: false,
                experimental:
                    "This may cause some issues since it tricks Roblox into thinking your private info is something it isn't.",
                childSettings: {
                    settingsPageInfo: {
                        label: 'Hide Private Information on the settings page',
                        description: [
                            "This visually replaces your Email, Phone Number, Sessions and account location with 'RoValra Streamer Mode Enabled'",
                            'And completely hides your Age Group, previous usernames in settings and Birthday.',
                        ],
                        type: 'checkbox',
                        default: true,
                    },
                    hideRobux: {
                        label: 'Hide Robux',
                        description: [
                            "Simply hides your Robux by changing it to 'Hidden'",
                            'This does not hide your Robux on purchase prompts.',
                        ],
                        type: 'checkbox',
                        default: false,
                    },
                },
            },
            spoofAsOffline: {
                label: 'Spoof status as Offline',
                description: [
                    'Makes you appear as offline to you and other people.',
                    'This is useful if you want to appear offline while still allowing friends to join you in experiences, since the official offline status by Roblox does not allow this.',
                    'Joining an experience will overwrite this status.',
                    'This may take a few minutes to actually change your status to offline after turning on the feature.',
                ],
                type: 'checkbox',
                default: false,
                exclusiveWith: ['spoofAsStudio', 'spoofAsOnline'],
            },
            spoofAsStudio: {
                label: 'Spoof status as In Studio',
                description: [
                    "Makes your online status appear as 'In Studio' to you and other users.",
                    'Joining an experience will overwrite this status.',
                    'The Spoofed Status will only show if RoValra is enabled and a Roblox page is open.',
                ],
                type: 'checkbox',
                default: false,
                exclusiveWith: ['spoofAsOffline', 'spoofAsOnline'],
            },
        },
    },
    FunStuff: {
        title: 'Fun Stuff',
        settings: {
            bandurationsEnabled: {
                label: 'All possible ban durations',

                description: [
                    '**This does not include voice chat bans.**',
                    "**Any text saying 'Note:' is a note added by Valra to explain stuff better.**",
                    '- Banned for 1 Day',
                    '- Banned for 3 Days',
                    '- Banned for 7 Days',
                    '- Banned for 14 Days',
                    '- Account Deleted',
                    '• Warning',
                    '• Banned for 6 Months',
                    '• Banned for 1 Year',
                    "• Note: the stuff below are not bans but instead Roblox telling you what will happen if you do it again, this doesn't always show when you get banned.",
                    "• This stuff below is called a 'Forshadow ban'",
                    '• If you violate the Community Standards again, your account may be suspended in the future. ',
                    '• If you violate the Community Standards again, your account may be suspended for at least 1 day.',
                    '• If you violate the Community Standards again, your account may be suspended for at least 3 days.',
                    '• If you violate the Community Standards again, your account may be suspended for at least 7 days.',
                    '• If you violate the Community Standards again, your account may be permanently banned from Roblox.',
                    '- Note: 2 days, 1 hour, 3 hours, 6 hours and 12 hours bans might not be in use.',
                    '• Banned for 2 Days',
                    '• Banned for 3 Hours',
                    '• Banned for 6 Hours',
                    '• Banned for 12 Hours',
                    '• Banned for 1 Hour',
                    '• Account Terminated',
                    '• Banned for 60 Days',
                ],
                default: null,
            },

            BanReasons: {
                label: 'All possible ban reasons on Roblox, some ban reasons have been censored by Valra.',
                description: [
                    '**All ban reasons are 100% confirmed**',
                    '**Keep in mind these are ban reasons, which is basically categories each ban might fall into.**',
                    "**Any text saying 'Note:' is a note added by Valra to explain stuff better.**",
                    "- None (Note: Likely used for when there isn't a ban reason, and instead only a moderator note.)",
                    '- Profanity',
                    '- Harassment',
                    '- Spam',
                    '- Advertisement',
                    '• Scamming',
                    '• Adult Content',
                    '• Inappropriate',
                    '• Privacy',
                    '• Unclassified Mild',
                    '• BlockedContent',
                    '• Minor Swearing',
                    '• Distorted Audio',
                    '• Loud Earbleeders',
                    '• Players Screaming into Microphone',
                    '• Swearing',
                    '• P####graphic Sounds',
                    '• Explicit S##ual References and Innuendo',
                    '• Dr## and Alc###l References',
                    '• Discriminatory or N##i Content',
                    '• Dating Imagery',
                    '• Discriminatory Content',
                    '• Dr##s, Alc###l',
                    '• DMCA',
                    '• Explicit N####y/P##n',
                    '• Gang Images',
                    '• N###s',
                    '• Personal Attack/Harassment/Bullying',
                    '• Red Armbands (Not N###s) ',
                    '• Suggestive/S##ualized Imagery',
                    '• S####de/Self-####',
                    '• Clickbait Ads',
                    '• Inappropriate Content',
                    '• Not Related to Roblox',
                    '• Off-Site Links',
                    '• Hidden Message Clothing',
                    '• None of the Above',
                    '• Account Theft',
                    '• Asset Ownership',
                    '• Billing',
                    '• Compromised Account',
                    '• Copyright/DMCA',
                    '• Derogatory/Harassment',
                    '• Depressive',
                    '• Discriminatory',
                    '• Exploiting',
                    '• Text Filter / Profanity',
                    '• Gr###ing',
                    '• Illicit Substance',
                    '• Malicious',
                    '• Misleading',
                    '• Dating',
                    '• Phishing/Scam',
                    '• Real Info',
                    '• RMT (Note: Real money transaction)',
                    '• S##ual/Adult Content',
                    '• Shock',
                    '• Threats',
                    '• Real-Life Tragedy',
                    '• Politics',
                    '• Encouraging Dangerous Behavior',
                    '• Other',
                    '• Dating and Romantic Content',
                    '• S##ual Content',
                    '• Directing Users Off-Platform',
                    '• Privacy: Asking for PII',
                    '• Privacy: Giving PII',
                    '• Impersonation',
                    '• Extortion and Blackmail',
                    '• Illegal and Regulated Content',
                    '• Misusing Roblox Systems',
                    '• Political Content',
                    '• T###orism/Extremism',
                    '• Child Endangerment',
                    '• Real-Life Threats',
                    '• Cheat and Exploits',
                    '• Seeking S##ual Content',
                    '• Disruptive Audio',
                    '• Contests and Sweepstakes',
                    '• Threats or Abuse of Roblox Employees or Affiliates',
                    '• Roblox Economy',
                    '• IRL Dangerous Activities',
                    '• Intellectual Property Violation',
                    '• Off Platform Speech and Behavior',
                    '• Violent Content and Gore',
                    '• Advertising',
                    '• Chargeback',
                    '• DMCA Early Legal Strike',
                    '• DMCA Final Legal Strike',
                    '• You created or used an account to avoid an enforcement action taken against another account determined from your account information, such as your account email, phone number, or other information (Note: This is not a ban reason; this is a moderator note)',
                    '• Trademark Violation',
                    '• Roblox does not permit using third-parties to buy, sell, or trade Robux, promotional codes that falsely appear to be from Roblox Corporation, or inappropriate use of the community payout system. (Note: This is not a ban reason; this is a moderator note)',
                    "- Note: Fun fact—the 'using third-parties to buy, sell, or trade Robux' moderator notes are called 'Virtual Casino' bans in the code",
                ],

                default: null,
            },
            appealstuff: {
                label: 'Appeals related stuff',
                description: [
                    '**Appeal Outcomes & Decisions**',
                    '- Appeal denied',
                    '- We have reviewed your appeal. This activity is still in violation of Roblox Community Standards.',
                    '- Appeal accepted',
                    '- We have reviewed your appeal. This activity is not in violation of Roblox Community Standards. Any consequence related to this activity is reversed.',
                    '- We have reviewed your appeal. This activity is still in violation of Roblox Community Standards. However, we’ve updated the violation category.',
                    '**Appeal Instructions & Information**',
                    '- Appeal something not shown',
                    '- Request Appeal',
                    '- Additional info (optional)',
                    '- You can appeal by {date}',
                    '- View past violations and manage your appeals. All content and behavior must adhere to the {link}Roblox Community\nStandards{linkEnd}.',
                    '- Reviews are based on {link}Roblox Community Standards{linkEnd}',
                    '- Learn more about appeals {link}here{linkEnd}.',
                    '**Error Messages & Support Fallbacks**',
                    '- Appeals information not found',
                    '- If you would like to appeal something not shown here please visit {link}Support{linkEnd}',
                    "- You've reached the maximum number of appeals. You may no longer appeal this {assetType}.",
                ],
                default: null,
            },
            captcha: {
                label: 'All the places where you can get a captcha on Roblox',
                description: [
                    "Roblox, I'm still mad that you denied my captcha bypass just to fix it a few weeks later 😡😡😡😡😡",
                    '- sign up',
                    '- login',
                    '- change password',
                    '- redeeming a gift card',
                    '- submitting a support ticket',
                    '- buying an item (speculation, might have been removed)',
                    '- posting on a group wall (likely gonna be the same for group forum posts)',
                    '- joining a group',
                    "- 'generic challenge'—no idea what they mean by that.",
                    '- following a user',
                    "- uploading 'clothing asset'—could also be the same for any asset but I'm unsure",
                    '- posting a comment on an asset (comments on assets have been removed)',
                ],
                default: null,
            },
        },
    },
    Developer: {
        title: 'Developer',
        settings: {
            info: {
                label: ['Developer Settings'],
                description: [
                    "These are features used mostly to develop rovalra, if you don't know what your doing dont touch them.",
                ],
                type: 'yay',
            },
            alwaysShowDeveloperSettings: {
                label: ['Always show developer settings tab'],
                description: [
                    'This will make the developer settings tab always show. So you dont have to do the easter egg every time.',
                ],
                type: 'checkbox',
                default: false,
            },
            EnableRobloxApiDocs: {
                label: 'Roblox API docs',
                description: [
                    'This adds documentation for Roblox apis on https://www.roblox.com/docs',
                    'All the apis are captured when you browse the site.',
                    'This stores all the APIs in storage.',
                ],
                type: 'checkbox',
                default: false,
            },
            EnablebannerTest: {
                label: ['Banner test'],
                description: ['This adds a test banner to experiences'],
                type: 'checkbox',
                default: false,
            },
            impersonateRobloxStaffSetting: {
                label: ['Impersonate User Option On Profiles'],
                description: [
                    "This enables the 'Impersonate User' option on peoples profile, used by Roblox internally.",
                    "Pressing the 'Impersonate User' option does nothing other than error unless you are authorized to use it",
                ],
                deprecated: 'Roblox removed it with the new profile overhaul',
                locked: 'This internal Roblox feature was removed during the profile page redesign.',
                isPermanent: true,
                type: 'checkbox',
                default: false,
            },
            EarlyAccessProgram: {
                label: ['Early Access Program Showcase'],
                description: [
                    'This will trick Roblox into thinking you are in an early access program, making Roblox add the early access program UI to your settings',
                    'This setting wont allow you to join any early access programs you werent invited to.',
                    'This will also overwrite any early access programs you might already be in.',
                ],
                type: 'checkbox',
                default: false,
            },
            showUserAgeEnabled: {
                label: 'Show Friend Age Range',
                description:
                    'This shows the account age range of anyone on your friends list.',
                type: 'checkbox',
                default: false,
                locked: 'This was made when Roblox decided it was a good idea to leak everyones age range. It was only made to spread light on the issue and the issue has now been resolved.',
                isPermanent: true,
            },
            EnableVideoTest: {
                label: ['Video test'],
                description: [
                    'This adds a video test for experience trailers not uploaded to youtube on https://www.roblox.com/videotest',
                    'Since this feature is only supported on the client.',
                ],
                type: 'checkbox',
                default: false,
            },
            onboardingShown: {
                label: ['Show onboarding'],
                description: [
                    "This will show RoValra's onboarding screen again when this setting is disabled.",
                ],
                type: 'checkbox',
                default: false,
            },
            simulateRoValraServerErrors: {
                label: ['Simulate RoValra Server Errors / downtime'],
                description: [
                    'This will simulate RoValra Server errors / downtime, useful when testing how the extension handles stuff like that.',
                ],
                type: 'checkbox',
                default: false,
            },
            forceReviewPopup: {
                label: ['Force Review Popup'],
                description: [
                    "When enabled, shows the review popup every time it's triggered, ignoring all requirements. For testing purposes.",
                ],
                type: 'checkbox',
                default: false,
            },
            rendererDeveloperToggles: {
                label: '3D renderer Developer toggles',
                type: 'checkbox',
                default: false,
            },
            forceFallbackAuth: {
                label: 'Force Fallback Authentication',
                description: [
                    'Forces the use of the fallback verification system instead of OAuth.',
                    'This auth is used in cases where OAuth doesnt work',
                ],
                type: 'checkbox',
                default: false,
            },
            profile3DRenderBypassCheck: {
                label: 'Bypass Graphics Check',
                description: [
                    'Bypasses the compatibility check for the 3D Profile Renderer.',
                    'Only enable this if the 3D renderer was disabled due to graphics issues but you want to try anyway.',
                ],
                type: 'checkbox',
                default: false,
            },
            localStorageUsage: {
                label: 'Show Local Storage Usage',
                description: [
                    "Displays the total storage used by RoValra in Chrome's local storage.",
                ],
                type: 'button',
                buttonText: 'Calculate Storage',
                event: 'rovalra:showLocalStorageUsage',
            },
        },
    },
};
