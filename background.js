chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getRobloxCookie") {
      getRobloxCookie()
        .then(cookie => {
          sendResponse({ success: true, cookie: cookie });
        })
        .catch(error => {
          sendResponse({ success: false, message: error });
        });
      return true;  // Keep the message channel open for the async response
    }
  });
  
  // Function to get .ROBLOSECURITY cookie
  function getRobloxCookie() {
    return new Promise((resolve, reject) => {
      chrome.cookies.get({ url: "https://www.roblox.com", name: ".ROBLOSECURITY" }, (cookie) => {
        if (cookie) {
          resolve(cookie.value);
        } else {
          reject("No .ROBLOSECURITY cookie found");
        }
      });
    });
  }
  
  
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "fetchHiddenGames") {
        const userId = message.userId;
        const apiUrl = `https://games.roblox.com/v2/users/${userId}/games?accessFilter=2&limit=10&sortOrder=Asc`;

        fetch(apiUrl)
            .then(response => response.json())
            .then(data => {
                const hiddenGames = data.data.filter(game => {
                    return !document.querySelector(`[data-game-id="${game.id}"]`);
                });

                const newTabHtml = hiddenGames.map(game => `
                    <div>
                        <h3>${game.name}</h3>
                        <a href="https://www.roblox.com/games/${game.id}" target="_blank">
                            ${game.name}
                        </a>
                    </div>
                `).join("");

                const newTabContent = `
                    <html>
                    <head>
                        <title>Hidden Games</title>
                    </head>
                    <body>
                        <h1>Hidden Games for User ${userId}</h1>
                        ${newTabHtml || "<p>No hidden games found.</p>"}
                    </body>
                    </html>
                `;

                const blob = new Blob([newTabContent], { type: 'text/html' });
                const url = URL.createObjectURL(blob);

                chrome.tabs.create({ url });
            })
            .catch(error => console.error('Error fetching hidden games:', error));
    }
});
