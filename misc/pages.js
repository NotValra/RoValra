// u did not see this
if (window.location.href === 'https://www.roblox.com/cats') {


    let contentDiv = document.getElementById('content');

    const clearContentAndLoadCats = () => {
        if (contentDiv) {

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
                            if (!response.ok) {
                                throw new Error(`HTTP error! status: ${response.status}`);
                            }
                            return response.json();
                        })
                        .then(data => {
                            if (data && data.length > 0 && data[0].url) {
                                return data[0].url;
                            } else {
                                console.warn("Invalid API response or missing image URL in one of the requests.");
                                return null;
                            }
                        })
                        .catch(error => {
                            console.error("Error fetching cat image:", error);
                            return null;
                        })
                );
            }

            Promise.all(catImagePromises)
                .then(catImageUrls => {

                    catImageUrls.forEach((catImageUrl, index) => {
                        if (catImageUrl) {
                            const imgElement = document.createElement('img');
                            imgElement.src = catImageUrl;
                            imgElement.alt = 'Random cat image';
                            imgElement.style.maxWidth = '150px';
                            imgElement.style.maxHeight = '150px';
                            imgElement.style.display = 'inline-block';
                            imgElement.style.pointerEvents = 'none';

                            const marginRange = 20;
                            const marginTop = Math.random() * marginRange - (marginRange / 2);
                            const marginLeft = Math.random() * marginRange - (marginRange / 2);
                            imgElement.style.marginTop = `${marginTop}px`;
                            imgElement.style.marginBottom = `${marginTop}px`;
                            imgElement.style.marginLeft = `${marginLeft}px`;
                            imgElement.style.marginRight = `${marginLeft}px`;

                            const verticalAlignOptions = ['top', 'middle', 'bottom'];
                            imgElement.style.verticalAlign = verticalAlignOptions[Math.floor(Math.random() * verticalAlignOptions.length)];

                            contentDiv.appendChild(imgElement);
                        }
                    });


                })
                .catch(error => {
                    console.error("Error processing cat image promises:", error);
                    contentDiv.textContent = "Failed to load cat images :CCCCCCCCC";
                });
        } else {
            console.warn("Content div NOT found even after polling. Likely the page structure has changed.");
        }
    };

    if (contentDiv) {
        clearContentAndLoadCats();
    } else {
        const contentCheckInterval = setInterval(function() {
            contentDiv = document.getElementById('content');
            if (contentDiv) {
                clearInterval(contentCheckInterval); 
                clearContentAndLoadCats(); 
            } else {
            }
        }, 2); 

        setTimeout(function() {
            clearInterval(contentCheckInterval);
            if (!contentDiv) {
                console.warn("Timeout reached, content div was never found. Stopping check.");
            }
        }, 10000); 
    }
} else if (window.location.href === 'https://www.roblox.com/fishstrap') {
    window.location.href = 'https://fishstrap.app';
} else if (window.location.href === 'https://www.roblox.com/rovalra') {
    window.location.href = 'https://rovalra.com';
} else if (window.location.href === 'https://www.roblox.com/roseal') {
    window.location.href = 'https://www.roseal.live';
} else if (window.location.href === 'https://www.roblox.com/rokitty') {
    window.location.href = 'https://www.rokitty.app';
} else if (window.location.href === 'https://www.roblox.com/roqol') {
    window.location.href = 'https://roqol.io/';
}
