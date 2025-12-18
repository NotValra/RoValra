import { observeElement } from '../../../core/observer.js';

function handleCatsPage() {
    const clearContentAndLoadCats = (contentDiv) => {
        contentDiv.innerHTML = '';
        contentDiv.style.position = 'relative';

        const header = document.createElement('h1');
        header.textContent = 'CATS!!!!!';
        contentDiv.appendChild(header);

        const numberOfCats = 30;
        const catImagePromises = [];

        for (let i = 0; i < numberOfCats; i++) {
            catImagePromises.push(
                fetch('https://api.thecatapi.com/v1/images/search')
                    .then(response => {
                        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                        return response.json();
                    })
                    .then(data => (data && data.length > 0 && data[0].url) ? data[0].url : null)
                    .catch(error => {
                        console.error("Error fetching cat image:", error);
                        return null;
                    })
            );
        }

        Promise.all(catImagePromises).then(catImageUrls => {
            catImageUrls.forEach(catImageUrl => {
                if (catImageUrl) {
                    const imgElement = document.createElement('img');
                    imgElement.src = catImageUrl;
                    imgElement.alt = 'Random cat image';
                    Object.assign(imgElement.style, {
                        maxWidth: '150px', maxHeight: '150px', display: 'inline-block', pointerEvents: 'none',
                        marginTop: `${Math.random() * 40 - 20}px`, marginBottom: `${Math.random() * 40 - 20}px`,
                        marginLeft: `${Math.random() * 40 - 20}px`, marginRight: `${Math.random() * 40 - 20}px`,
                        verticalAlign: ['top', 'middle', 'bottom'][Math.floor(Math.random() * 3)]
                    });
                    contentDiv.appendChild(imgElement);
                }
            });
        }).catch(error => {
            console.error("Error processing cat image promises:", error);
            contentDiv.textContent = "Failed to load cat images :C";
        });
    };

    observeElement('#content', clearContentAndLoadCats);
}

export function init() {
    chrome.storage.local.get('eastereggslinksEnabled', (result) => {
        if (result.eastereggslinksEnabled) {
            const path = window.location.pathname;
            const redirects = {
                '/cats': handleCatsPage,
                '/fishstrap': () => window.location.href = 'https://fishstrap.app',
                '/rovalra': () => window.location.href = 'https://rovalra.com',
                '/roseal': () => window.location.href = 'https://www.roseal.live',
                '/rokitty': () => window.location.href = 'https://www.rokitty.app',
                '/roqol': () => window.location.href = 'https://roqol.io/',
            };
        
            if (redirects[path]) {
                redirects[path]();
            }
        }
    });
}