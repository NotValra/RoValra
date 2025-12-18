document.addEventListener('DOMContentLoaded', function() {

  const links = {
    'settings-link': 'https://www.roblox.com/my/account?rovalra=info#!/info',
    'discord-link': 'https://discord.gg/GHd5cSKJRk',
    'donate-link': 'https://www.roblox.com/games/9676908657/Gamepasses#!/store',
    'github-link': 'https://github.com/NotValra/RoValra'
  };


  function addLinkListener(id, url) {
    const element = document.getElementById(id);
    if (element) {
      element.addEventListener('click', () => chrome.tabs.create({ url }));
    }
  }

  for (const id in links) {
    addLinkListener(id, links[id]);
  }
});