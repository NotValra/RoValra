

if (window.location.pathname.startsWith('/catalog') || window.location.pathname.startsWith('/bundles')) {

    // Extract the item ID from the URL
    const itemId = parseInt(window.location.pathname.split('/')[2], 10);
    console.log("Extracted item ID:", itemId);

    fetch('https://raw.githubusercontent.com/workframes/roblox-owner-counts/refs/heads/main/items.json') 
        .then(response => response.json())
        .then(data => {
            const items = data.item || [];

            if (items.length === 0) {
                console.log('No items found in the fetched data.');
                return;
            }

            const item = items.find(item => item.id === itemId || parseInt(item.id, 10) === itemId);

            if (item) {
                console.log("Item found:", item);

                const retryFindElement = (selector, maxRetries, retryInterval, callback, fallbackSelector) => {
                    let retries = 0;
                    const interval = setInterval(() => {
                        let element = document.querySelector(selector);
                        if (!element && fallbackSelector) {
                            element = document.querySelector(fallbackSelector);
                        }

                        if (element) {
                            clearInterval(interval);
                            callback(element);
                        } else if (retries >= maxRetries) {
                            clearInterval(interval);
                            console.log(`${selector} and fallback ${fallbackSelector} not found after ${maxRetries} retries.`);
                        }
                        retries++;
                    }, retryInterval);
                };

                retryFindElement(
                    ".text-label.row-label.price-label", 
                    20, 
                    100, 
                    (foundElement) => {
                        const salesDiv = document.createElement('div');
                        salesDiv.classList.add('item-sales');
                        salesDiv.innerHTML = `<strong>Sales:</strong> ${item.sales.toLocaleString()}`;
                        salesDiv.style.color = "#bdbebe";
                        salesDiv.style.marginTop = "10px";
                        salesDiv.style.marginLeft = "0px";
                        foundElement.appendChild(salesDiv);
                        const revenueDiv = document.createElement('div');
                        revenueDiv.classList.add('item-revenue');
                        revenueDiv.innerHTML = `<strong>Revenue:</strong> $${(item.revenue / 100).toFixed(2)}`;
                        revenueDiv.style.color = "#bdbebe";
                        revenueDiv.style.marginTop = "10px";
                        revenueDiv.style.marginLeft = "0";
                        foundElement.appendChild(revenueDiv);
                    },
                    ".price-row-container"
                );
            } else {
                console.log("Item not found.");
            }
        })
        .catch(error => {
            console.error('Error fetching data:', error);
        });
}


