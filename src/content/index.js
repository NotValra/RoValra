import { initializeObserver, startObserving } from './core/observer.js';
import { detectTheme, dispatchThemeEvent } from './core/theme.js';
// Site wide
import { init as initOnboarding } from './features/onboarding/onboarding.js';
import { init as initWhatAmIJoining } from './features/games/revertlogo.js';
import { init as initEasterEggLinks } from './features/sitewide/easterEggs/links.js';
import { init as initCssFixes } from './features/sitewide/cssfixes.js';
import { init as initHiddenCatalog } from './features/catalog/hiddenCatalog.js';
import { init as initServerListener } from './features/games/serverlistener.js';
import { init as initBetaPrograms } from './features/navigation/betaprograms.js';
import { init as initVideoTest } from './features/developer/videotest.js';
import { init as initStreamerMode } from './features/sitewide/streamermode.js';
import { init as initMarkDownTest } from './features/developer/markdowntest.js';
import { init as initTests } from './features/developer/tests.js';
import { init as initApiDocs } from './features/developer/apiDocs.js';
import { init as initApiKey } from './core/utils/trackers/apiKey.js';
import { init as initServerTracker } from './core/utils/trackers/servers.js';
import { initFriendsListTracking } from './core/utils/trackers/friendslist.js';
import { initTransactionsTracking } from './core/utils/trackers/transactions.js';
import { init as initPrivateGames } from './features/games/privateGames.js';
import { init as initQoLToggles } from './features/navigation/QoLToggles.js';
import { init as initCopyId } from './features/sitewide/copyid.js';
import { init as initQuickSearch } from './features/navigation/search/quicksearch.js';
import { init as initRenderTest } from './features/developer/rendertest.js';
import { init as initGroupFunds } from './features/navigation/groupfunds.js';
import { init as initCustomFont } from './features/sitewide/customFont.js';
import { init as initTransactionsLink } from './features/navigation/transactionslink.js';

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

// Games
import { init as initBotDetector } from './features/games/about/botDetector.js';
import { init as initQuickPlay } from './features/games/quickplay.js';
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
import { init as initHeatmap } from './features/games/tab/updateHistory.js';
import { init as initTotalSpentGames } from './features/games/tab/totalSpentGames.js';
import { init as initEvents } from './features/games/about/events.js';
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
import { init as initPlaceVisits } from './features/groups/placevisits.js';
import { init as initGroupCreateDate } from './features/groups/createDate.js';
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
import { init as initPreviousPrice } from './features/sitewide/PreviousPrice.js';
import { init as initCategorizeWearing } from './features/profile/categorizeWearing.js';
import { init as initBannedUsers } from './features/profile/bannedusers.js';
import { init as initTrustedFriends } from './features/profile/trustedfriends.js';
import { init as initProfileRender } from './features/profile/header/ProfileRender.js';
import { init as initStatus } from './features/profile/header/status.js';
import { init as initLastPlayed } from './features/profile/header/lastplayed.js';
import { init as initFriendsSince } from './features/profile/friends/friendsSince.js';
import { init as initUnfriend } from './features/profile/friends/unfriend.js';
import { init as initProfileBackground } from './features/profile/header/profileBackground.js';
import { init as initRobuxIcons } from './core/ui/robuxIcon.js';
import { init as initPurchasePromptItemId } from './core/catalog/purchasePromptItemId.js';

// Settings
import { init as initSettingsPage } from './features/settings/index.js';
import { init as initFirstAccount } from './features/settings/roblox/firstAccount.js';
import { init as initLegacyThemeSwitcher } from './features/settings/roblox/legacyThemeSwitcher.js';
// create
import { init as initCreateDownload } from './features/create.roblox.com/download.js';

let pageLoaded = false;
let lastPath = window.location.pathname;

const featureRoutes = [
    // Generic features that run on most pages
    {
        paths: ['*'],
        features: [
            initSettingsPage,
            initQuickPlay,
            initEasterEggLinks,
            initCssFixes,
            initWhatAmIJoining,
            initHiddenCatalog,
            initServerListener,
            initOnboarding,
            initVideoTest,
            initStreamerMode,
            initMarkDownTest,
            initTests,
            initApiKey,
            initServerTracker,
            initFriendsListTracking,
            initTransactionsTracking,
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
            initStatus,
            initCustomFont,
            initRobuxIcons,
            initProfileBackground,
            initPurchasePromptItemId,
        ],
    },
    // pretty much just the 40% method
    {
        paths: ['/catalog', '/bundles', '/game-pass', '/games'],
        features: [init40Method, initPurchasePrompt],
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
        ],
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
        ],
    },
    // Game pages
    {
        paths: ['/games/'],
        features: [
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
        ],
    },
    // Private games page
    {
        paths: ['/private-games/'],
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
            initFriendsSince,
            initUnfriend,
            initLastPlayed,
            initGroupRole,
        ],
    },
    {
        paths: ['/users/', '/banned-users/'],
        features: [initCategorizeWearing, initRovalraBadges],
    },

    // Transactions page
    {
        paths: ['/transactions'],
        features: [initTotalSpent, initPendingRobuxTrans, initTotalEarned],
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
    // create
    {
        paths: ['/store/asset'],
        features: [initCreateDownload],
    },
    {
        paths: ['/my/account'],
        features: [initFirstAccount, initLegacyThemeSwitcher],
    },
];

function runFeaturesForPage() {
    const path = window.location.pathname;
    const normalizedPath = path.replace(/^\/[a-z]{2}(?:-[a-z]{2})?\//, '/');

    featureRoutes.forEach((route) => {
        if (
            route.paths.some(
                (p) =>
                    p === '*' ||
                    path.startsWith(p) ||
                    normalizedPath.startsWith(p),
            )
        ) {
            if (route.features && Array.isArray(route.features)) {
                route.features.forEach((init) => {
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

    const onDomReady = async () => {
        detectTheme().then((theme) => dispatchThemeEvent(theme));

        runFeaturesForPage();
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', onDomReady);
    } else {
        onDomReady();
    }

    console.log(
        `%cRoValra Initialized`,
        'font-size: 1.5em; color: #FF4500;',
        `(Observer: ${observerStatus})`,
    );
}

async function handleUrlChange() {
    const currentPath = window.location.pathname;

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
        handleUrlChange();
    };

    history.replaceState = function (...args) {
        originalReplaceState.apply(this, args);
        handleUrlChange();
    };

    window.addEventListener('popstate', handleUrlChange);

    let urlCheckInterval = setInterval(() => {
        if (window.location.pathname !== lastPath) {
            handleUrlChange();
        }
    }, 500);
}

initializePage();
setupUrlChangeListeners();
