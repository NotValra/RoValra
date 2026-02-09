import { initializeObserver, startObserving } from './core/observer.js';
import { detectTheme, dispatchThemeEvent } from './core/theme.js';
// --- Feature Imports --- //
// Site wide
import { init as initOnboarding } from './features/onboarding/onboarding.js';
import { init as initWhatAmIJoining } from './features/games/revertlogo.js';
import { init as initEasterEggLinks } from './features/sitewide/easterEggs/links.js';
import { init as initCssFixes } from './features/sitewide/cssfixes.js';
import { init as initHiddenCatalog } from './features/catalog/hiddenCatalog.js';
import { init as initServerListener } from './features/games/serverlistener.js';
import { init as initVideoTest } from './features/developer/videotest.js';
import { init as initStreamerMode } from './features/sitewide/streamermode.js';
import { init as initMarkDownTest } from './features/developer/markdowntest.js'
import { init as initApiDocs } from './features/developer/apiDocs.js';
import { init as initServerTracker } from './core/utils/trackers/servers.js';
import { init as initQoLToggles } from './features/navigation/QoLToggles.js';

// Avatar
import { init as initAvatarFilters } from './features/avatar/filters.js';
import { init as initR6Warning } from './features/avatar/R6Warning.js';

// Catalog
import { init as initItemSales } from './features/catalog/itemsales.js';
import { init as init40Method } from './features/catalog/40method.js';
import { init as initDependencies } from './features/catalog/depenencies.js';
import { init as initPriceFloor } from './features/catalog/pricefloor.js';

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
// transactions
import { init as initTotalSpent } from './features/transactions/totalspent.js';
import { init as initPendingRobuxTrans } from './features/transactions/pendingRobuxTrans.js';
import { init as initTotalEarned } from './features/transactions/totalearned.js';
// group
import { init as initHiddenGroupGames } from './features/groups/hiddenGroupGames.js';
import { init as initAntiBots } from './features/groups/Antibots.js';
import { init as initPendingRobux } from './features/groups/pendingRobux.js';
import { init as initDraggableGroups } from './features/groups/draggableGroups.js';
// Profile
import { init as initDonationLink } from './features/profile/header/donationlink.js';
import { init as initRap } from './features/profile/header/rap.js';
import { init as initInstantJoiner } from './features/profile/header/instantjoiner.js';
import { init as initOutfits } from './features/profile/outfits.js';
import { init as initPrivateServers } from './features/profile/privateserver.js';
import { init as initRovalraBadges } from './features/profile/header/RoValraBadges.js';
import { init as initUserGames } from './features/profile/hiddengames.js';
import { init as initPrivateServerControls } from './features/games/privateserver.js';

// Settings
import { init as initSettingsPage } from './features/settings/index.js';

// create
import { init as initCreateDownload } from './features/create.roblox.com/download.js'

let pageLoaded = false;
let lastPath = window.location.pathname;

const featureRoutes = [
  // Generic features that run on most pages
  {
    paths: ['*'],
    features: [initSettingsPage, initQuickPlay, initEasterEggLinks, initCssFixes, initWhatAmIJoining, initHiddenCatalog, initServerListener, initOnboarding, initVideoTest, initStreamerMode, initMarkDownTest, initServerTracker, initQoLToggles],
  },
  // pretty much just the 40% method
  {
    paths: ['/catalog', '/bundles', '/game-pass', '/games'],
    features: [init40Method],
  },
  // Catalog and bundle pages
  {
    paths: ['/catalog', '/bundles'],
    features: [initDependencies, initItemSales, initPriceFloor],
  },
  // Group pages
  {
    paths: ['/communities/'],
    features: [initHiddenGroupGames, initAntiBots, initPendingRobux, initDraggableGroups],
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
      initSubplaces,
      bannertest,
      initGameTrailers,
      quickOutfits,
      initRecentServers,
      initPrivateServerControls
    ],
  },
  // avatar
  {
    paths: ['/my/avatar'],
    features: [initAvatarFilters, initR6Warning],
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
      initRovalraBadges,
      initUserGames,
    ],
  },

  // Transactions page
  { paths: ['/transactions'], features: [initTotalSpent, initPendingRobuxTrans, initTotalEarned] },

  // API Docs
  {
    paths: ['/docs'],
    features: [initApiDocs],
  },
  // create
  {
    paths: ['/store/asset'],
    features: [initCreateDownload]
  }
];


function runFeaturesForPage() {
  const path = window.location.pathname;
  const normalizedPath = path.replace(/^\/[a-z]{2}(?:-[a-z]{2})?\//, '/');

  featureRoutes.forEach((route) => {
    if (route.paths.some((p) => p === '*' || path.startsWith(p) || normalizedPath.startsWith(p))) {
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

  console.log(`%cRoValra Initialized`, 'font-size: 1.5em; color: #FF4500;', `(Observer: ${observerStatus})`);
}


function handleUrlChange() {
  const currentPath = window.location.pathname;

  if (currentPath !== lastPath) {
    console.log(`%cRoValra: URL changed from ${lastPath} to ${currentPath}`, 'color: #FF4500;');
    lastPath = currentPath;

    runFeaturesForPage();

    detectTheme().then(theme => dispatchThemeEvent(theme));
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
