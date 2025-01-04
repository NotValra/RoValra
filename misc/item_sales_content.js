console.log("item_sales_content.js: Script started");

const itemId = parseInt(window.location.pathname.split('/')[2], 10);
console.log("item_sales_content.js: Extracted item ID:", itemId);
const itemsURL = document.currentScript.dataset.itemsUrl;

fetch(itemsURL)
    .then(response => response.json())
    .then(data => {
        const items = data.item || [];
         if (items.length === 0) {
            console.log("item_sales_content.js: No items found in the fetched data.");
            return;
         }
            const item = items.find(item => item.id === itemId || parseInt(item.id, 10) === itemId);

            if (item) {
                console.log("item_sales_content.js: Item found:", item);

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
                    50,
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
                console.log("item_sales_content.js: Item not found.");
            }
        })
    .catch(error => console.error("item_sales_content.js: Error loading items.json", error));