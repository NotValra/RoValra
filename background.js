chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "fetchHiddenGames") {
        const userId = message.userId;
        const apiUrl = `https://games.roblox.com/v2/users/${userId}/games?accessFilter=2&limit=10&sortOrder=Asc`;

        fetch(apiUrl)
            .then(response => response.json())
            .then(data => {
                const hiddenGames = data.data.filter(game => {
                    // Exclude games already visible in "hlist btr-games-list"
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
