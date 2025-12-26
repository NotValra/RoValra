const customRobuxImg = chrome.runtime.getURL("public/Assets/YapDollar.png");

let styleElement = null;

function applyYappDollar(enabled) {
    const existingStyle = document.getElementById('rovalra-yapp-dollar-style');
    
    if (enabled) {
        if (!existingStyle) {
            const style = document.createElement("style");
            style.id = 'rovalra-yapp-dollar-style';
            style.textContent = `
                /* it says hi to you */
                .icon-robux-28x28, 
                .icon-robux-gray-16x16, 
                .icon-robux-white-16x16, 
                .icon-robux-16x16,
                .icon-robux,
                .robux-icon,
                .icon-robux-gold-16x16,
                .navbar-robux-icon {
                    background-image: url("${customRobuxImg}") !important;
                    background-size: contain !important;
                    background-repeat: no-repeat !important;
                    background-position: center !important;
                    background-color: transparent !important; 
                }
            `;
            (document.head || document.documentElement).appendChild(style);
            styleElement = style;
        }
    } else {
        if (existingStyle) {
            existingStyle.remove();
            styleElement = null;
        }
    }
}

chrome.storage.local.get(['rovalra_settings'], (result) => {
    let settings = result.rovalra_settings || {};
    const yappDollarEnabled = settings.yappDollarEnabled !== false;
    applyYappDollar(yappDollarEnabled);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && (changes.rovalra_settings || changes.yappDollarEnabled)) {
        chrome.storage.local.get(['rovalra_settings'], (result) => {
            let settings = result.rovalra_settings || {};
            const yappDollarEnabled = settings.yappDollarEnabled !== false;
            applyYappDollar(yappDollarEnabled);
        });
    }
});
