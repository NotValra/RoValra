// This is basically just a navigator ig, mostly to avoid stupid stuff where scripts that arent meant for that link run there still
const utilsScript = document.createElement('script');
utilsScript.src = chrome.runtime.getURL('misc/utils.js');
document.head.appendChild(utilsScript);

const styleScript = document.createElement('script');
styleScript.src = chrome.runtime.getURL('misc/style.js');
document.head.appendChild(styleScript);

utilsScript.onload = function () {
    styleScript.onload = async function() {
        if (window.location.pathname.startsWith('/catalog') || window.location.pathname.startsWith('/bundles')) {
            const itemSalesScript = document.createElement('script');
            itemSalesScript.src = chrome.runtime.getURL('misc/item_sales.js');
            document.head.appendChild(itemSalesScript);
        } else if (window.location.pathname.startsWith('/communities')) {
          const groupGamesScript = document.createElement('script');
            groupGamesScript.src = chrome.runtime.getURL('HiddenGames/group_games.js');
            document.head.appendChild(groupGamesScript);
        } else if (window.location.pathname.startsWith('/users/')) {
            const userGamesScript = document.createElement('script');
            userGamesScript.src = chrome.runtime.getURL('HiddenGames/user_games.js');
            const userSniper = document.createElement('script');
            userSniper.src = chrome.runtime.getURL('misc/userSniper.js');
            document.head.appendChild(userGamesScript);
              window.addEventListener('loadNonBtroblox', () => {
                loadNonBtrobloxFile();
              })
        } 
    }
}

