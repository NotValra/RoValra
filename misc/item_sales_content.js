let currentTheme = 'light';
window.addEventListener('themeDetected', (event) => {
    currentTheme = event.detail.theme;
    applyTheme();
});

const url = window.location.href;
const regex = /https:\/\/www\.roblox\.com\/(?:[a-z]{2}\/)?(?:catalog|bundles)\/(\d+)/;
const match = url.match(regex);
const itemId = parseInt(match[1], 10);
const itemsURL = document.currentScript.dataset.itemsUrl;
const isBundlePage = url.includes('/bundles/');


function applyTheme() {
     const isDarkMode = currentTheme === 'dark';
     const textColor = isDarkMode ? "#bdbebe" : "rgb(96, 97, 98)";

     const salesDiv = document.querySelector(".item-sales");
     const revenueDiv = document.querySelector(".item-revenue");
     const inaccurateDiv = document.querySelector(".item-inaccurate");


    if(salesDiv){
         salesDiv.style.color = textColor;
     }
    if(revenueDiv){
        revenueDiv.style.color = textColor;
    }
    if(inaccurateDiv){
        inaccurateDiv.style.color = textColor;
    }

}


async function checkItemOnSale(itemId, isBundle) {
    const itemType = isBundle ? 'bundle' : 'asset';
    const detailsURL = `https://catalog.roblox.com/v1/catalog/items/${itemId}/details?itemType=${itemType}`;
    try {
        const response = await fetch(detailsURL, {credentials: "include"});
        if (!response.ok) {
            console.error(`HTTP error! status: ${response.status}`);
            return null;
        }
        const data = await response.json();
        return data;
    } catch (error) {
        console.error("Error fetching item details:", error);
        return null; 
    }
}


fetch(itemsURL)
    .then(response => response.json())
    .then(data => {
        const items = data.item || [];
         if (items.length === 0) {
            return;
         }
            const item = items.find(item => item.id === itemId || parseInt(item.id, 10) === itemId);

            if (item) {

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
                        }
                        retries++;
                    }, retryInterval);
                };

                retryFindElement(
                    ".text-label.row-label.price-label",
                    50,
                    100,
                    async (foundElement) => {
                        const salesDiv = document.createElement('div');
                        salesDiv.classList.add('item-sales');
                        salesDiv.innerHTML = `<strong>Sales:</strong> ${item.sales.toLocaleString()}`;
                       salesDiv.style.marginTop = "10px";
                        salesDiv.style.marginLeft = "0px";
                        foundElement.appendChild(salesDiv);

                        const revenueDiv = document.createElement('div');
                        revenueDiv.classList.add('item-revenue');
                        revenueDiv.innerHTML = `<strong>Revenue:</strong> $${(item.revenue / 100).toFixed(2)}`;
                        revenueDiv.style.marginTop = "10px";
                        revenueDiv.style.marginLeft = "0";
                        foundElement.appendChild(revenueDiv);

                        const itemDetails = await checkItemOnSale(itemId, isBundlePage);
                        if (itemDetails && itemDetails.isOffSale !== true) {
                            const inaccurateDiv = document.createElement('div');
                            inaccurateDiv.classList.add('item-inaccurate');
                            inaccurateDiv.textContent = "Sales and Revenue are likely inaccurate";
                            inaccurateDiv.style.marginTop = "10px";
                            inaccurateDiv.style.marginLeft = "0";
                            inaccurateDiv.style.fontStyle = "italic";
                            inaccurateDiv.style.fontSize = "0.9em";
                            foundElement.appendChild(inaccurateDiv);
                        }


                         if(currentTheme){
                            applyTheme();
                         }
                    },
                    ".price-row-container"
                );
            } else {
            }
        })
    .catch(error => console.error("item_sales_content.js: Error loading items.json", error));