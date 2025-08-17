(async function() { 
    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    if (window.location.pathname.includes('/games/')) {
        const expirationDate = new Date('2025-08-30T00:00:00Z');
        const currentDate = new Date();

        if (currentDate >= expirationDate) {
            return; 
        }


        const url = window.location.href;
        let placeId = null;
        const regex = /https:\/\/www\.roblox\.com\/(?:[a-z]{2}\/)?games\/(\d+)/;
        const match = url.match(regex);


        if (match && match[1]) {
            placeId = match[1]
        }
        let regionButtonAdded = false;
        let currentTheme = null;

        async function detectThemeAPI() {
            if (currentTheme) return currentTheme;

            if (document.body.classList.contains('dark-theme')) {
                currentTheme = 'dark';
            } else if (document.body.classList.contains('light-theme')) {
                currentTheme = 'light';
            } else {
                currentTheme = document.body.classList.contains('dark-theme') ? 'dark' : 'light';
            }
            return currentTheme;
        }

        async function applyTheme() {
            await detectThemeAPI();
        }

        async function updatePopup(retries = 5) {

            let gameTitleContainer = document.querySelector(".game-title-container") ||
                                       document.getElementById('game-detail-meta-data') ||
                                       document.querySelector('div[class^="game-calls-to-action"] > div:first-child') ||
                                       document.getElementById('game-details-play-button-container');
            if (!gameTitleContainer) {
                const header = document.querySelector('.container-header');
                if (header) gameTitleContainer = header.nextElementSibling;
            }
            if (!gameTitleContainer) {
                gameTitleContainer = document.querySelector('#game-details .content');
            }

            if (!gameTitleContainer) {
                if (retries > 0) {
                    await delay(1000);
                    await updatePopup(retries - 1);
                } else {
                }
                return;
            }

            const isDarkMode = currentTheme === 'dark';

            let existingRegionButton = document.getElementById("regionDropdownButton");
            if (existingRegionButton && regionButtonAdded) {
                const regionDropdown = document.getElementById('regionDropdown');
                const regionListContainer = document.getElementById('rovalra-region-list-container');

                if (regionDropdown && regionListContainer) {

                    regionDropdown.style.backgroundColor = isDarkMode ? 'rgb(39, 41, 48)' : '#ffffff';
                    regionDropdown.style.border = isDarkMode ? '1px solid rgba(255, 255, 255, 0.15)' : '1px solid #ccc';
                    regionDropdown.style.color = isDarkMode ? '#ffffff' : '#392213';
                    regionDropdown.className = isDarkMode ? 'dark' : 'light';

                    const headerContainer = regionDropdown.querySelector('div:first-child');
                    if (headerContainer) {
                            headerContainer.style.borderBottom = `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'}`;
                            const titleText = headerContainer.querySelector('p');
                            if (titleText) titleText.style.color = isDarkMode ? 'white' : 'rgb(39, 41, 48)';
                            const icon = headerContainer.querySelector('img');
                            if(icon && icon.alt === "RoValra Icon") { }
                    }
                    return;
                } else {
                    if (existingRegionButton) existingRegionButton.remove();
                    const existingDropdown = document.getElementById('regionDropdown');
                    if (existingDropdown) existingDropdown.remove();
                    regionButtonAdded = false;
                }
            }

            if (regionButtonAdded) return;


            const regionDropdownButton = document.createElement('button');
            regionDropdownButton.id = 'regionDropdownButton';
            regionDropdownButton.textContent = 'Regions ';
            const globeSVG = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            globeSVG.setAttribute("width", "17");
            globeSVG.setAttribute("height", "17");
            globeSVG.setAttribute("viewBox", "0 0 24 24");
            globeSVG.setAttribute("fill", "none");
            globeSVG.setAttribute("xmlns", "http://www.w3.org/2000/svg");
            globeSVG.style.display = 'inline-block';
            globeSVG.style.verticalAlign = 'middle';
            globeSVG.style.marginLeft = '1px';

            const pathSVG = document.createElementNS("http://www.w3.org/2000/svg", "path");
            pathSVG.setAttribute("d", "M15 2.4578C14.053 2.16035 13.0452 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 10.2847 21.5681 8.67022 20.8071 7.25945M17 5.75H17.005M10.5001 21.8883L10.5002 19.6849C10.5002 19.5656 10.5429 19.4502 10.6205 19.3596L13.1063 16.4594C13.3106 16.2211 13.2473 15.8556 12.9748 15.6999L10.1185 14.0677C10.0409 14.0234 9.97663 13.9591 9.93234 13.8814L8.07046 10.6186C7.97356 10.4488 7.78657 10.3511 7.59183 10.3684L2.06418 10.8607M21 6C21 8.20914 19 10 17 12C15 10 13 8.20914 13 6C13 3.79086 14.7909 2 17 2C19.2091 2 21 3.79086 21 6ZM17.25 5.75C17.25 5.88807 17.1381 6 17 6C16.8619 6 16.75 5.88807 16.75 5.75C16.75 5.61193 16.8619 5.5 17 5.5C17.1381 5.5 17.25 5.61193 17.25 5.75Z");
            pathSVG.setAttribute("stroke", isDarkMode ? "white" : "rgb(39, 41, 48)");
            pathSVG.setAttribute("stroke-width", "2");
            pathSVG.setAttribute("stroke-linecap", "round");
            pathSVG.setAttribute("stroke-linejoin", "round");

            globeSVG.appendChild(pathSVG);
            regionDropdownButton.appendChild(globeSVG);

            regionDropdownButton.style.cssText = `
                margin-left: 0px; padding: 2px 0px;
                background-color: ${isDarkMode ? 'rgba(255, 255, 255, 0)' : 'rgba(0, 0, 0, 0)'};
                border: 0px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)'};
                border-radius: 8px; cursor: pointer; font-size: 14px;
                font-family: "Builder Sans", "Helvetica Neue", Helvetica, Arial, "Lucida Grande", sans-serif;
                font-weight: 600; color: ${isDarkMode ? 'white' : 'rgb(39, 41, 48)'};
                transition: background-color 0.2s ease, border-color 0.2s ease;
                line-height: normal; white-space: nowrap;
            `;
            regionDropdownButton.addEventListener('mouseover', () => {
                regionDropdownButton.style.textDecoration = 'underline';
                pathSVG.setAttribute("stroke", isDarkMode ? "white" : "rgb(39, 41, 48)");
            });
            regionDropdownButton.addEventListener('mouseout', () => {
                regionDropdownButton.style.textDecoration = 'none';
                pathSVG.setAttribute("stroke", isDarkMode ? "white" : "rgb(39, 41, 48)");
            });

            const regionDropdown = document.createElement('div');
            regionDropdown.id = 'regionDropdown';
            regionDropdown.style.cssText = `
                position: absolute; top: 100%; left: 0;
                margin-top: 5px; display: none;
                background-color: ${isDarkMode ? 'rgb(39, 41, 48)' : '#ffffff'};
                border: 1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.15)' : '#ccc'};
                border-radius: 6px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                z-index: 10000; padding: 8px 0px 8px 8px; min-width: 420px; max-width: 500px;
                max-height: 550px; overflow: visible;
                color: ${isDarkMode ? '#ffffff' : '#392213'};
            `;

            regionDropdown.className = isDarkMode ? 'dark' : 'light';

            const headerContainer = document.createElement('div');
            headerContainer.style.cssText = `
                display: flex; align-items: center;
                padding: 4px 8px 12px 8px;
                border-bottom: 1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'};
                margin-bottom: 8px;
            `;
            const iconImage = document.createElement('img');
            try {
                iconImage.src = (typeof GM_getResourceURL === 'function') ? GM_getResourceURL("icon128") : chrome.runtime.getURL("Assets/icon-128.png");
            } catch (e) { iconImage.src = 'Assets/icon-128.png'; }
            iconImage.alt = "RoValra Icon";
            iconImage.style.cssText = 'width: 20px; height: 20px; margin-right: 8px;';
            const titleText = document.createElement('p');
            titleText.textContent = "RoValra Region Selector";
            titleText.style.cssText = `color: ${isDarkMode ? 'white' : 'rgb(39, 41, 48)'}; font-size: 16px; font-weight: 700; margin: 0; flex-grow: 1;`;

            const buttonContainer = document.createElement('div');
            buttonContainer.style.cssText = `display: flex; gap: 5px;`;

            headerContainer.appendChild(iconImage);
            headerContainer.appendChild(titleText);
            headerContainer.appendChild(buttonContainer);
            regionDropdown.appendChild(headerContainer);

            const regionListContainer = document.createElement('div');
            regionListContainer.id = 'rovalra-region-list-container';
            regionListContainer.style.cssText = `
                max-height: calc(550px - 60px);
                overflow-y: auto; overflow-x: hidden; padding-right: 0;
                overscroll-behavior: contain;
                scrollbar-width: thin;
                scrollbar-color: ${isDarkMode ? 'rgba(255, 255, 255, 0.2) transparent' : 'rgba(0, 0, 0, 0.15) transparent'};
                position: relative;
            `;

            const formattedDate = expirationDate.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                timeZone: 'UTC' 
            });
            const imageUrl = chrome.runtime.getURL("Assets/RegionSelectorPicture.png");

            regionListContainer.innerHTML = `
                <div style="text-align: center; padding: 5px; color: ${isDarkMode ? '#aaa' : '#666'};">
                    <p style="margin: 5px 0 10px 0; font-size: 16px;">The advanced region selector moved to the server list</p>
                    <p style="margin: 5px 0 10px 0; font-size: 14px;">Use the preferred region play button for a quick region selector instead.</p>
                    <p style="margin: 5px 0 10px 0; font-size: 14px;">Which can be found right beside the normal play button.</p>
                    <img src="${imageUrl}" alt="Region selector has moved" style="width: 95%; border-radius: 4px; display: block; margin: 0 auto;">
                    <p style="font-size: 12px; color: ${isDarkMode ? '#888' : '#999'}; margin-top: 10px;">
                        This notice will be removed after ${formattedDate}.
                    </p>
                </div>`;
            regionDropdown.appendChild(regionListContainer);

            if (window.getComputedStyle(gameTitleContainer).position === 'static') {
                gameTitleContainer.style.position = 'relative';
            }
            const playButton = gameTitleContainer.querySelector('[id^="game-details-play-button"], .btn-common-play-game-lg, .play-button-container > button');
            if (playButton && playButton.parentNode === gameTitleContainer) {
                playButton.parentNode.insertBefore(regionDropdownButton, playButton.nextSibling);
                gameTitleContainer.appendChild(regionDropdown);
            } else {
                gameTitleContainer.appendChild(regionDropdownButton);
                gameTitleContainer.appendChild(regionDropdown);
            }
            regionButtonAdded = true;

            regionDropdown.style.left = '0px';
            regionDropdown.style.transform = `translateX(${regionDropdownButton.offsetLeft}px)`;

            regionDropdownButton.addEventListener('click', (event) => {
                event.stopPropagation();
                const dropdown = regionDropdown;
                const isOpen = regionDropdown.style.display === 'block' || (dropdown.style.display === 'block' && !dropdown.classList.contains('closing'));
                regionDropdown.style.display = isOpen ? 'none' : 'block';
                if (!isOpen) {
                    dropdown.style.display = 'block';
                    dropdown.style.opacity = '0';
                    dropdown.style.transform = `translateX(${regionDropdownButton.offsetLeft}px)`;
                    setTimeout(() => {
                        dropdown.style.opacity = '';
                        dropdown.classList.add('opening');
                    }, 10);
                } else {
                    dropdown.classList.remove('opening');
                    dropdown.classList.add('closing');
                    setTimeout(() => {
                        dropdown.style.display = 'none';
                        dropdown.classList.remove('closing');
                    }, 100);
                }
            });

            document.addEventListener('mousedown', function(event) {
                const dropdown = document.getElementById('regionDropdown');
                const button = document.getElementById('regionDropdownButton');

                if (!dropdown || !button) return;

                if (!dropdown.contains(event.target) && !button.contains(event.target)) {
                    if (window.getComputedStyle(dropdown).display !== 'none' && !dropdown.classList.contains('closing')) {
                        dropdown.classList.remove('opening');
                        dropdown.classList.add('closing');

                        setTimeout(() => {
                            dropdown.style.display = 'none';
                            dropdown.classList.remove('closing');
                        }, 150);
                    }
                }
            }, { capture: true });

        }

        function injectRegionDropdownStyles() {
            if (document.getElementById('rovalra-region-dropdown-styles')) return;

            const styleElement = document.createElement('style');
            styleElement.id = 'rovalra-region-dropdown-styles';
            styleElement.textContent = `
                @keyframes dropdownOpen {
                    from {
                        opacity: 0;
                        transform: translateY(-10px) scale(0.95);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0) scale(1);
                    }
                }

                @keyframes dropdownClose {
                    from {
                        opacity: 1;
                        transform: translateY(0) scale(1);
                    }
                    to {
                        opacity: 0;
                        transform: translateY(-10px) scale(0.95);
                    }
                }

                #regionDropdown {
                    transform-origin: top center;
                    position: relative;
                }

                #regionDropdown.opening {
                    display: block !important;
                    animation: dropdownOpen 0.15s ease-out forwards;
                }

                #regionDropdown.closing {
                    display: block !important;
                    animation: dropdownClose 0.15s ease-in forwards;
                }

                /* Custom scrollbar styling */
                #rovalra-region-list-container::-webkit-scrollbar {
                    width: 6px;
                    position: absolute;
                    right: 2px;
                }

                #rovalra-region-list-container::-webkit-scrollbar-track {
                    background: transparent;
                }

                .dark #rovalra-region-list-container::-webkit-scrollbar-thumb {
                    background-color: rgba(255, 255, 255, 0.2);
                    border-radius: 10px;
                }

                .light #rovalra-region-list-container::-webkit-scrollbar-thumb {
                    background-color: rgba(0, 0, 0, 0.15);
                    border-radius: 10px;
                }
            `;
            document.head.appendChild(styleElement);
        }

        await applyTheme();
        injectRegionDropdownStyles();

        if (!placeId) {
            return;
        }

        await updatePopup();

    }
})();