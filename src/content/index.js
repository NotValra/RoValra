import { initializeObserver, startObserving } from './core/observer.js';
import { detectTheme, dispatchThemeEvent } from './core/theme.js';
import { getValidAccessToken } from './core/oauth/oauth.js';
import { startAuthFavoriteCleanupMonitor } from './core/oauth/fallback.js';
import { t } from './core/locale/i18n.js';
// Site wide
import { init as initOnboarding } from './features/onboarding/onboarding.js';
import { init as initWhatAmIJoining } from './features/games/revertlogo.js';
import { init as initEasterEggLinks } from './features/sitewide/easterEggs/links.js';
import { init as initCssFixes } from './features/sitewide/cssfixes.js';
import { init as initServerListener } from './features/games/serverlistener.js';
import { init as initBetaPrograms } from './features/navigation/betaprograms.js';
import { init as initVideoTest } from './features/developer/videotest.js';
import { init as initStreamerMode } from './features/sitewide/streamermode.js';
import { init as initMarkDownTest } from './features/developer/markdowntest.js';
import { init as initTests } from './features/developer/tests.js';
import { init as initApiDocs } from './features/developer/apiDocs.js';
import { init as initModeration } from './features/moderation/moderation.js';
import { init as initBirthdayTracker } from './core/utils/trackers/birthday.js';
import { init as initServerTracker } from './core/utils/trackers/servers.js';
import { initFriendsListTracking } from './core/utils/trackers/friendslist.js';
import { initTransactionsTracking } from './core/utils/trackers/transactions.js';
import { initBadgesTracking } from './core/utils/trackers/badges.js';
import { initAvatarInventoryTracking } from './core/utils/trackers/avatarInventory.js';
import { initUserCurrencyTracking } from './core/utils/trackers/currency.js';
import { init as initClientChannelTracker } from './core/utils/trackers/channels.js';
import { init as initPrivateGames } from './features/games/privateGames.js';
import { init as initGamePassViewer } from './features/games/gamePassViewer.js';
import { init as initQoLToggles } from './features/navigation/QoLToggles.js';
import { init as initCopyId } from './features/sitewide/copyid.js';
import { init as initQuickSearch } from './features/navigation/search/quicksearch.js';
import { init as initRenderTest } from './features/developer/rendertest.js';
import { init as initGroupFunds } from './features/navigation/groupfunds.js';
import { init as initUrlTracker } from './core/utils/trackers/urlTracker.js';
import { init as initCustomFont } from './features/sitewide/customFont.js';
import { init as initTransactionsLink } from './features/navigation/transactionslink.js';
import { init as initDocsLink } from './features/navigation/docslink.js';
import { initializeModernIcons as initModernIcons } from './features/sitewide/modernIcons.js';
import { init as initLoginBanner } from './features/scamprevention/loginBanner.js';
import { init as initLessPlus } from './features/sitewide/lessPlus.js';
import { init as initKidsTheme } from './features/sitewide/kidsTheme.js';
import { init as initKidsThemeText } from './features/sitewide/kidsThemeText.js';
import { init as initSidebarCollapse } from './features/sitewide/sidebarCollapse.js';
import { init as initSidebarLayout } from './features/sitewide/sidebarLayout.js';
import { init as initRemoveDownloadButton } from './features/sitewide/removeDownloadButton.js';
import { init as initFriendGameLink } from './features/sitewide/friendGameLink.js';
import { init as initPaymentMethodBonusItems } from './features/paymentmethods/bonusItems.js';
import { init as initThemeSwitcher } from './features/sitewide/themeSwitcher.js';

// Avatar
import { init as initAvatarFilters } from './features/avatar/filters.js';
import { init as initR6Warning } from './features/avatar/R6Warning.js';
import { init as initAvatarRotator } from './features/avatar/avatarRotator.js';
import { init as initMultiEquip } from './features/avatar/multiEquip.js';

// Catalog
import { init as initItemSales } from './features/catalog/itemsales.js';
import { init as init40Method } from './features/catalog/40method.js';
import { init as initDependencies } from './features/catalog/depenencies.js';
import { init as initPriceFloor } from './features/catalog/pricefloor.js';
import { init as initCatalogBannerTest } from './features/catalog/bannerTest.js';
import { init as initParentItem } from './features/catalog/ParentItem.js';
import { init as initPurchasePrompt } from './features/catalog/purchasePrompt.js';
import { init as initItemTrading } from './features/catalog/ItemTrading.js';
import { init as initLastEquipped } from './features/catalog/lastEquipped.js';
import { init as initItemRender } from './features/catalog/ItemRender.js';

// Games
import { init as initBotDetector } from './features/games/about/botDetector.js';
import { init as initQuickPlay } from './features/games/quickplay.js';
import { init as initHiddenBadges } from './features/games/hiddenBadges.js';
import { init as initBadgeLayoutToggle } from './features/games/badgeLayoutToggle.js';
import { init as initBadgeOwnership } from './features/games/badgeOwnership.js';
import { init as initServerList } from './features/games/serverlist/serverlist.js';
import { initRecentServers } from './features/games/serverlist/recentservers.js';
import { init as initRegionPlayButton } from './features/games/RegionPlayButton.js';
import { init as initSubplaces } from './features/games/tab/Subplaces.js';
import { initServerIdExtraction } from './core/games/servers/serverids.js';
import { init as initGameTrailers } from './features/games/thumbnails/gametrailers.js';
import { init as initGameBanner } from './core/ui/games/banner.js';
import { init as bannertest } from './features/games/banner.js';
import { init as quickOutfits } from './features/games/actions/quickOutfits.js';
import { init as initDevProductLoader } from './features/games/tab/DevProducts.js';
import { init as initDeveloperProductsSection } from './features/games/DeveloperProductsSection.js';
import { init as initDeveloperProductAutoBuy } from './features/games/developerProductAutoBuy.js';
import { init as initHeatmap } from './features/games/tab/updateHistory.js';
import { init as initTotalSpentGames } from './features/games/tab/totalSpentGames.js';
import { init as initEvents } from './features/games/about/events.js';
import { init as initUnderReviewPill } from './features/games/underReviewPill.js';
// transactions
import { init as initTotalSpent } from './features/transactions/totalspent.js';
import { init as initPendingRobuxTrans } from './features/transactions/pendingRobuxTrans.js';
import { init as initTotalEarned } from './features/transactions/totalearned.js';
// Trading
import { init as initConfirmTrade } from './features/trading/confirmtrade.js';
import { init as initItemValues } from './features/trading/itemValues.js';
import { init as initTradePreview } from './features/trading/tradePreview.js';
import { init as initTradeFilter } from './features/trading/tradefilter.js';
import { init as initTradeSearch } from './features/trading/tradeSearch.js';
import { init as initTradeProof } from './features/trading/tradeProof.js';
// group
import { init as initHiddenGroupGames } from './features/groups/hiddenGroupGames.js';
import { init as initAntiBots } from './features/groups/Antibots.js';
import { init as initPendingRobux } from './features/groups/pendingRobux.js';
import { init as initDraggableGroups } from './features/groups/draggableGroups.js';
import { init as initBulkLeaveGroups } from './features/groups/bulkLeave.js';
import { init as initPlaceVisits } from './features/groups/placevisits.js';
import { init as initGroupCreateDate } from './features/groups/createDate.js';
// Plus
import { init as initRobloxPlusStats } from './features/plus/stats.js';
import { init as initRobloxPlusTransferLimits } from './features/plus/transferLimits.js';
// Profile
import { init as initDonationLink } from './features/profile/header/donationlink.js';
import { init as initRap } from './features/profile/header/rap.js';
import { init as initInstantJoiner } from './features/profile/header/instantjoiner.js';
import { init as initOutfits } from './features/profile/outfits.js';
import { init as initPrivateServers } from './features/profile/privateserver.js';
import { init as initRovalraBadges } from './features/profile/header/RoValraBadges.js';
import { init as initUserGames } from './features/profile/hiddengames.js';
import { init as initGroupRole } from './features/profile/grouprole.js';
import { init as initPrivateServerControls } from './features/games/privateserver.js';
import { init as initPlusPrivateServerTooltip } from './features/games/plusPrivateServerTooltip.js';
import { init as initPreviousPrice } from './features/sitewide/PreviousPrice.js';
import { init as initCategorizeWearing } from './features/profile/categorizeWearing.js';
import { init as initBannedUsers } from './features/profile/bannedusers.js';
import { init as initTrustedFriends } from './features/profile/trustedfriends.js';
import { init as initProfileRender } from './features/profile/header/ProfileRender.js';
import { init as initStatus } from './features/profile/header/status.js';
import { init as initLastPlayed } from './features/profile/header/lastplayed.js';
import { init as initProfileViews } from './features/profile/header/profileViews.js';
import { init as initCurrentlyPlayingLink } from './features/profile/header/currentlyPlayingLink.js';
import { init as initCurrentlyPlayingSubplace } from './features/profile/header/currentlyPlayingSubplace.js';
import { init as initIdVerificationBadge } from './features/profile/header/idVerificationBadge.js';
import { init as initFriendsSince } from './features/profile/friends/friendsSince.js';
import { init as initUnfriend } from './features/profile/friends/unfriend.js';
import { init as initProfileBackground } from './features/profile/header/profileBackground.js';
import { init as initAvatarDownload } from './features/profile/header/avatarDownload.js';
import { init as initAvatarBorder } from './features/profile/avatarBorder.js';
import { init as initRobuxIcons } from './core/ui/robuxIcon.js';
import { init as initPurchasePromptItemId } from './core/catalog/purchasePromptItemId.js';
import { init as initCurrencyTransfer } from './features/profile/currencytransfer.js';
import { init as initGroupFilters } from './features/profile/groupFilters.js';
import { init as initUsernameColor } from './features/profile/header/usernameColor.js';
import { init as initDisplayNameGradient } from './features/profile/header/displayNameGradient.js';
import { init as initChatEligibilityTooltip } from './features/profile/header/chatEligibilityTooltip.js';
import { init as initProfileCustomization } from './features/profile/profileCustomization.js';

// Settings
import { init as initSettingsPage } from './features/settings/index.js';
import { init as initFirstAccount } from './features/settings/roblox/firstAccount.js';
import { init as initLegacyThemeSwitcher } from './features/settings/roblox/legacyThemeSwitcher.js';
// Home
import { init as initAccurateContinue } from './features/home/accurateContinue.js';
import { init as initHomeLayout } from './features/home/homeLayout.js';
import { init as initCustomThemeEditor } from './features/home/customThemeEditor.js';
import { init as initUnderratedGamesHome } from './features/home/underratedGames.js';
import { init as initThemeCatalogPage } from './features/themes/themeCatalogPage.js';
// create
import { init as initCreateDownload } from './features/create.roblox.com/download.js';
import { init as initCatalogExplorer } from './features/catalog/explorer.js';
import { enforceSettingOverrides } from './core/settings/handlesettings.js';
import { refreshRemoteSettingLocks } from './core/settings/remoteSettingLocks.js';

let pageLoaded = false;
let lastPath = window.location.pathname.toLowerCase();
const initializedPersistentFeatures = new Set();

const featureRoutes = [
    // Generic features that run on most pages
    {
        paths: ['*'],
        once: true,
        features: [
            initSettingsPage,
            initQuickPlay,
            initEasterEggLinks,
            initCssFixes,
            initWhatAmIJoining,
            initServerListener,
            initOnboarding,
            initVideoTest,
            initStreamerMode,
            initMarkDownTest,
            initTests,
            initBirthdayTracker,
            initServerTracker,
            initFriendsListTracking,
            initTransactionsTracking,
            initBadgesTracking,
            initAvatarInventoryTracking,
            initUserCurrencyTracking,
            initClientChannelTracker,
            initQoLToggles,
            initCopyId,
            initBetaPrograms,
            initPreviousPrice,
            initQuickSearch,
            initRenderTest,
            initPrivateGames,
            initBannedUsers,
            initGroupFunds,
            initTransactionsLink,
            initDocsLink,
            initStatus,
            initCustomFont,
            initRobuxIcons,
            initProfileBackground,
            initAvatarBorder,
            initDisplayNameGradient,
            initPurchasePromptItemId,
            initCurrentlyPlayingSubplace,
            initUrlTracker,
            initModernIcons,
            initLessPlus,
            initKidsTheme,
            initKidsThemeText,
            initSidebarCollapse,
            initSidebarLayout,
            initRemoveDownloadButton,
            initFriendGameLink,
            initThemeSwitcher,
            initCustomThemeEditor,
            initThemeCatalogPage,
        ],
    },
    // pretty much just the 40% method
    {
        paths: ['/catalog', '/bundles', '/game-pass', '/games'],
        features: [init40Method, initPurchasePrompt, initDonationLink],
    },
    {
        paths: ['/developer-product/'],
        features: [initPurchasePrompt, initDeveloperProductAutoBuy],
    },
    // Game pass viewer for 404 pages
    {
        paths: ['/game-pass/'],
        features: [initGamePassViewer],
    },
    // Catalog and bundle pages
    {
        paths: ['/catalog', '/bundles'],
        features: [
            initDependencies,
            initItemSales,
            initPriceFloor,
            initCatalogBannerTest,
            initParentItem,
            initItemTrading,
            initLastEquipped,
            initItemRender,
            initCatalogExplorer,
        ],
    },
    // Avatar pages
    {
        paths: ['/looks'],
        features: [initItemRender],
    },
    // Group pages
    {
        paths: ['/communities/'],
        features: [
            initHiddenGroupGames,
            initAntiBots,
            initPendingRobux,
            initDraggableGroups,
            initPlaceVisits,
            initGroupCreateDate,
            initItemRender,
        ],
    },
    // Communities list page (My Communities) — matches /communities and /communities/...
    {
        paths: ['/communities'],
        features: [initBulkLeaveGroups],
    },
    // Game pages
    {
        paths: ['/games/'],
        features: [
            initDeveloperProductsSection,
            initGameBanner,
            initServerIdExtraction,
            initBotDetector,
            initServerList,
            initRegionPlayButton,
            bannertest,
            initGameTrailers,
            quickOutfits,
            initRecentServers,
            initPrivateServerControls,
            initHeatmap,
            initPlusPrivateServerTooltip,
            initCatalogExplorer,
            initUnderReviewPill,
        ],
    },
    // private games and game pages
    {
        paths: ['/games/', '/private-games'],
        features: [
            initDevProductLoader,
            initSubplaces,
            initTotalSpentGames,
            initEvents,
            initHiddenBadges,
            initBadgeLayoutToggle,
            initBadgeOwnership,
        ],
    },
    // Private games page and unavailable game redirects
    {
        paths: ['/games/', '/private-games/'],
        features: [initPrivateGames],
    },
    // avatar
    {
        paths: ['/my/avatar'],
        features: [
            initAvatarFilters,
            initR6Warning,
            initAvatarRotator,
            initMultiEquip,
        ],
    },
    // Roblox Plus Page
    {
        paths: ['/plus'],
        features: [initRobloxPlusStats, initRobloxPlusTransferLimits],
    },
    // User profile pages
    {
        paths: ['/users/'],
        features: [
            initDonationLink,
            initRap,
            initInstantJoiner,
            initOutfits,
            initPrivateServers,
            initUserGames,
            initTrustedFriends,
            initProfileRender,
            initIdVerificationBadge,
            initFriendsSince,
            initUnfriend,
            initLastPlayed,
            initProfileViews,
            initCurrentlyPlayingLink,
            initCurrentlyPlayingSubplace,
            initGroupRole,
            initCurrencyTransfer,
            initGroupFilters,
            initAvatarDownload,
            initChatEligibilityTooltip,
            initProfileCustomization,
        ],
    },
    {
        paths: ['/users/', '/banned-users/'],
        features: [initCategorizeWearing, initRovalraBadges, initUsernameColor],
    },

    // Transactions page
    {
        paths: ['/transactions'],
        features: [initTotalSpent, initPendingRobuxTrans, initTotalEarned],
    },
    {
        paths: ['/upgrades/paymentmethods'],
        features: [initPaymentMethodBonusItems],
    },
    // Trading
    {
        paths: ['/trades', '/trade', '/users'],
        features: [
            initConfirmTrade,
            initItemValues,
            initTradePreview,
            initTradeFilter,
            initTradeSearch,
            initTradeProof,
        ],
    },

    // API Docs
    {
        paths: ['/docs'],
        features: [initApiDocs],
    },
    // Moderation Panel
    {
        paths: ['/moderation'],
        features: [initModeration],
    },
    // create
    {
        paths: ['/store/asset'],
        features: [initCreateDownload],
    },
    {
        paths: ['/home'],
        features: [
            initHomeLayout,
            initUnderratedGamesHome,
            initAccurateContinue,
        ],
    },
    {
        paths: ['/my/account'],
        features: [initFirstAccount, initLegacyThemeSwitcher],
    },
    // Scam prevention
    {
        paths: ['/NewLogin', '/Login'],
        features: [initLoginBanner],
    },
];

const startTime = performance.now();
let lastGamePageHashbangHash = null;

function isGamePagePath(pathname = window.location.pathname) {
    return /^(?:\/[a-z]{2}(?:-[a-z]{2})?)?\/games\//i.test(pathname);
}

function getHashbangStrippedVariants(hash) {
    if (!hash.startsWith('#!')) return [];

    const fragment = hash.slice(2);
    const strippedFragment = fragment.startsWith('/')
        ? fragment.slice(1)
        : fragment;

    return [`#${strippedFragment}`, `#/${strippedFragment}`];
}

function normalizeGamePageHash() {
    if (!isGamePagePath()) {
        lastGamePageHashbangHash = null;
        return false;
    }

    const currentHash = window.location.hash;

    if (!currentHash) {
        lastGamePageHashbangHash = null;
        return false;
    }

    if (currentHash.startsWith('#!')) {
        lastGamePageHashbangHash = currentHash;
        return false;
    }

    if (!lastGamePageHashbangHash) return false;

    const strippedVariants = getHashbangStrippedVariants(
        lastGamePageHashbangHash,
    );
    if (!strippedVariants.includes(currentHash)) {
        lastGamePageHashbangHash = null;
        return false;
    }

    const oldUrl = window.location.href;
    window.history.replaceState(
        history.state,
        '',
        `${window.location.pathname}${window.location.search}${lastGamePageHashbangHash}`,
    );
    window.dispatchEvent(
        new HashChangeEvent('hashchange', {
            oldURL: oldUrl,
            newURL: window.location.href,
        }),
    );
    return true;
}

function runFeaturesForPage() {
    const path = window.location.pathname.toLowerCase();
    const normalizedPath = path.replace(/^\/[a-z]{2}(?:-[a-z]{2})?\//, '/');
    const featuresRunThisPass = new Set();

    featureRoutes.forEach((route) => {
        if (
            route.paths.some((p) => {
                const lowerP = p.toLowerCase();
                return (
                    lowerP === '*' ||
                    path.startsWith(lowerP) ||
                    normalizedPath.startsWith(lowerP)
                );
            })
        ) {
            if (route.features && Array.isArray(route.features)) {
                route.features.forEach((init) => {
                    if (featuresRunThisPass.has(init)) return;
                    if (route.once && initializedPersistentFeatures.has(init)) {
                        return;
                    }

                    featuresRunThisPass.add(init);
                    if (route.once) initializedPersistentFeatures.add(init);

                    try {
                        init();
                    } catch (error) {
                        console.error('RoValra: Feature init failed', error);
                    }
                });
            }
        }
    });
}

async function initializePage() {
    if (window.top !== window.self || pageLoaded) return;
    pageLoaded = true;

    initializeObserver();
    const observerStatus = startObserving();

    getValidAccessToken(false, false).catch((error) =>
        console.error('RoValra: OAuth token initialization failed', error),
    );
    startAuthFavoriteCleanupMonitor();

    const runSettingsMaintenance = () => {
        refreshRemoteSettingLocks()
            .catch((error) =>
                console.error(
                    'RoValra: Failed to refresh remote settings config.',
                    error,
                ),
            )
            .finally(() =>
                enforceSettingOverrides().catch((error) =>
                    console.error(
                        'RoValra: Failed to enforce setting overrides.',
                        error,
                    ),
                ),
            );
    };

    const scheduleSettingsMaintenance = () => {
        if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(runSettingsMaintenance, { timeout: 5000 });
            return;
        }

        setTimeout(runSettingsMaintenance, 0);
    };

    const startFeatures = async () => {
        const featureStartTime = performance.now();

        await t('__i18n_ready__').catch(() => {});
        detectTheme().then((theme) => dispatchThemeEvent(theme));
        runFeaturesForPage();
        scheduleSettingsMaintenance();

        const endTime = performance.now();

        console.log(
            `%cRoValra Initialized`,
            'font-size: 1.5em; color: #FF4500;',
            `\n(Observer: ${observerStatus})` +
                `\nFeature Load Time: ${(endTime - featureStartTime).toFixed(2)}ms` +
                `\nTotal Load Time: ${(endTime - startTime).toFixed(2)}ms`,
        );
    };

    if (document.body) {
        startFeatures().catch((error) =>
            console.error('RoValra: Feature initialization failed', error),
        );
    } else {
        const docObserver = new MutationObserver((_, obs) => {
            if (document.body) {
                obs.disconnect();
                startFeatures().catch((error) =>
                    console.error(
                        'RoValra: Feature initialization failed',
                        error,
                    ),
                );
            }
        }); //Verified
        docObserver.observe(document.documentElement, { childList: true });
    }
}

async function handleUrlChange() {
    const currentPath = window.location.pathname.toLowerCase();

    if (currentPath !== lastPath) {
        console.log(
            `%cRoValra: URL changed from ${lastPath} to ${currentPath}`,
            'color: #FF4500;',
        );
        lastPath = currentPath;

        runFeaturesForPage();

        detectTheme().then((theme) => dispatchThemeEvent(theme));
    }
}

function setupUrlChangeListeners() {
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
        originalPushState.apply(this, args);
        normalizeGamePageHash();
        handleUrlChange();
    };

    history.replaceState = function (...args) {
        originalReplaceState.apply(this, args);
        normalizeGamePageHash();
        handleUrlChange();
    };

    window.addEventListener('popstate', handleUrlChange);
    window.addEventListener('hashchange', normalizeGamePageHash);

    setInterval(() => {
        if (window.location.pathname.toLowerCase() !== lastPath) {
            handleUrlChange();
        }
    }, 500);

    normalizeGamePageHash();
}

initializePage();
setupUrlChangeListeners();
