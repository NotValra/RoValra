import { createGameCard } from '../../core/ui/games/gameCard.js';
import { observeElement } from '../../core/observer.js';
import { createItemCard } from '../../core/ui/items/items.js';
import { createRadioButton } from '../../core/ui/general/radio.js';
import { createToggle } from '../../core/ui/general/toggle.js';
import { createPill } from '../../core/ui/general/pill.js';
function removeHomeElement() {
    const homeElementToRemove = document.querySelector('li.cursor-pointer.btr-nav-node-header_home.btr-nav-header_home');
    if (homeElementToRemove) homeElementToRemove.remove();
}

async function renderTestPage(contentDiv) {
    if (window.location.pathname.toLowerCase() !== '/test') return;

    contentDiv.innerHTML = '';
    contentDiv.style.position = 'relative';

    const headerContainer = document.createElement('div');
    headerContainer.style.marginBottom = '20px';
    headerContainer.style.padding = '20px 0';

    const h1 = document.createElement('h1');
    h1.textContent = 'RoValra General UI Test';
    h1.style.fontWeight = '800';
    h1.style.fontSize = '2.5em';
    h1.style.margin = '0';

    headerContainer.appendChild(h1);
    contentDiv.appendChild(headerContainer);

    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.gap = '20px';
    container.style.flexWrap = 'wrap';
    contentDiv.appendChild(container);

    const gameId = 1818;
    const card = createGameCard(gameId);
    container.appendChild(card);
    const fregameId = 1537690962;
    const frecard = createGameCard(fregameId);
    container.appendChild(frecard);
    const LonggameId = 14056754882;
    const Longcard = createGameCard(LonggameId);
    container.appendChild(Longcard);
    const itemId = 48894692;
    const itemCard = createItemCard(itemId);
    container.appendChild(itemCard);
    const freeitemId = 3443038622;
    const freeitemCard = createItemCard(freeitemId);
    container.appendChild(freeitemCard);


    const limiteduid = 16477149823;
    const limiteduitemCard = createItemCard(limiteduid);
    container.appendChild(limiteduitemCard);
    const limitedid = 76233968067050;
    const limiteditemCard = createItemCard(limitedid);
    container.appendChild(limiteditemCard);
    const radio = createRadioButton();
    container.appendChild(radio);
    const toggle = createToggle("RoValra-Toggle");
    container.appendChild(toggle);
    const pill = createPill("Test test");
    container.appendChild(pill);
    removeHomeElement();
}

export function init() {
    chrome.storage.local.get('eastereggslinksEnabled', (result) => {
        if (result.eastereggslinksEnabled) {
            observeElement('.content#content', (cDiv) => {
                renderTestPage(cDiv);
            });
        }
    });
}