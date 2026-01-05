// used to search for games in a stylized dropdown only used in the instant joiner atm
import { searchGames } from '../../gameSearch/gameSearch.js';
import { formatPlayerCount } from '../../games/playerCount.js';
import { getGameDetailsFromPlaceId } from '../../games/gameDetails.js';




function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => { clearTimeout(timeout); func(...args); };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

export function createSearchInput({ placeholder = 'Search', onResultSelect, style = {} }) {
    let selectedGameName = null;
    let currentIcon = null;

    const container = document.createElement('div');
    container.className = 'form-group';
    Object.assign(container.style, {
        position: 'relative', 
        ...style
    });

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'form-control input-field search-input input-rounded';
    input.placeholder = placeholder;
    input.maxLength = 50;
    input.autocomplete = 'off';
    input.autocorrect = 'off';
    input.spellcheck = false;

    const searchIcon = document.createElement('span');
    searchIcon.className = 'icon-search';
    Object.assign(searchIcon.style, {
        position: 'absolute',
        left: '12px',
        paddingRight: '6px', 
        top: '50%',
        transform: 'translateY(-50%) scale(0.8)', 
        pointerEvents: 'none', 
        color: 'var(--icon-secondary)' 
    });
    input.style.paddingLeft = '38px'; 

    const dropdown = document.createElement('div');
    dropdown.className = 'foundation-web-menu bg-surface-100 stroke-standard stroke-default shadow-transient-high radius-large';
    Object.assign(dropdown.style, {
        position: 'absolute',
        top: '100%',
        left: '0',
        right: '0',
        marginTop: '4px', 
        zIndex: '1001', 
        display: 'none', 
    });

    const dropdownContent = document.createElement('div');
    dropdownContent.className = 'padding-small flex-dropdown-menu';
    dropdown.appendChild(dropdownContent);

    container.append(input, searchIcon, dropdown);

    const performSearch = async () => {
        const query = input.value;
        const isPlaceId = /^\d+$/.test(query);

        if (currentIcon && query !== selectedGameName) {
            const originalSearchIcon = createSearchIcon();
            currentIcon.replaceWith(originalSearchIcon);
            currentIcon = originalSearchIcon;
            selectedGameName = null; 
        }

        if (query.length < 2 && !isPlaceId) {
            clearDropdown();
            return;
        }

        let games = [];
        if (isPlaceId) {
            const gameFromId = await getGameDetailsFromPlaceId(query);
            if (gameFromId) {
                games.push(gameFromId);
            }
        } else {
            const userDataEl = document.querySelector('meta[name="user-data"]');
            const sessionId = userDataEl ? userDataEl.dataset.userid : '0';
            games = await searchGames(query, sessionId);
        }
    
        const dropdownItems = games.map(game => {
            if (!game) { 
                const errorItem = document.createElement('div');
                errorItem.className = 'foundation-web-menu-item text-body-medium padding-x-medium padding-y-small text-secondary';
                errorItem.textContent = 'Unable to find experience.';
                errorItem.style.pointerEvents = 'none';
                errorItem.style.textAlign = 'center';
                return errorItem;
            }


            const thumbUrl = game.thumbnail?.imageUrl;
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'relative clip group/interactable focus-visible:outline-focus disabled:outline-none foundation-web-menu-item flex items-center content-default text-truncate-split focus-visible:hover:outline-none cursor-pointer stroke-none bg-none text-align-x-left width-full text-body-medium padding-x-medium padding-y-small gap-x-medium radius-medium';

            const presentationDiv = document.createElement('div');
            presentationDiv.setAttribute('role', 'presentation');
            presentationDiv.className = 'absolute inset-[0] transition-colors group-hover/interactable:bg-[var(--color-state-hover)] group-active/interactable:bg-[var(--color-state-press)] group-disabled/interactable:bg-none';

            const img = document.createElement('img');
            img.src = thumbUrl;
            Object.assign(img.style, {
                width: '36px', height: '36px', borderRadius: '4px',
                backgroundColor: 'var(--ui-base-color-secondary)', flexShrink: '0'
            });

            const textContainer = document.createElement('div');
            textContainer.className = 'grow-1 text-truncate-split flex flex-col gap-y-xsmall';

            const titleSpan = document.createElement('span');
            titleSpan.className = 'foundation-web-menu-item-title text-no-wrap text-truncate-split content-emphasis';
            titleSpan.textContent = game.name; 
 
            const playerCountContainer = document.createElement('div');
            playerCountContainer.className = 'game-card-info';
            Object.assign(playerCountContainer.style, { display: 'flex', alignItems: 'center', gap: '5px' });
 
            const playingIcon = document.createElement('span');
            playingIcon.className = 'info-label icon-playing-counts-gray';
 
            const playingCountLabel = document.createElement('span');
            playingCountLabel.className = 'info-label playing-counts-label'; 
            playingCountLabel.textContent = formatPlayerCount(game.playerCount);
 
            playerCountContainer.append(playingIcon, playingCountLabel);
            textContainer.append(titleSpan, playerCountContainer);
            item.append(presentationDiv, img, textContainer);

            item.addEventListener('click', () => {
                if (onResultSelect) {
                    onResultSelect(game);
                    selectedGameName = game.name;
                }

                const gameIcon = document.createElement('img');
                gameIcon.src = thumbUrl;
                Object.assign(gameIcon.style, {
                    position: 'absolute', left: '8px', top: '50%',
                    transform: 'translateY(-50%)', width: '24px', height: '24px',
                    borderRadius: '4px'
                });

                const iconToReplace = currentIcon && currentIcon.parentNode ? currentIcon : searchIcon;
                iconToReplace.replaceWith(gameIcon);
                currentIcon = gameIcon; 
            });
            return item;
        });
        updateDropdown(dropdownItems);
    };

    const debouncedSearch = debounce(performSearch, 171);

    input.addEventListener('input', debouncedSearch);

    input.addEventListener('focus', performSearch);

    document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    });

    const clearDropdown = () => {
        dropdownContent.innerHTML = '';
        dropdown.style.display = 'none';
    };

    const updateDropdown = (items) => {
        dropdownContent.innerHTML = '';
        items.forEach(item => dropdownContent.appendChild(item));
        dropdown.style.display = items.length > 0 ? 'block' : 'none';
    };

    const hideDropdown = () => dropdown.style.display = 'none';

    return {
        element: container,
        input: input,
        clearDropdown,
        updateDropdown,
        hideDropdown,
        getSelectedGameName: () => selectedGameName 
    };
}

function createSearchIcon() {
    const icon = document.createElement('span');
    icon.className = 'icon-search';
    Object.assign(icon.style, {
        position: 'absolute',
        left: '12px',
        paddingRight: '6px',
        top: '50%',
        transform: 'translateY(-50%) scale(0.8)',
        pointerEvents: 'none',
        color: 'var(--icon-secondary)'
    });
    return icon;
}