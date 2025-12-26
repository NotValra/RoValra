const customRobuxImg = chrome.runtime.getURL("public/Assets/YapDollar.png");

const style = document.createElement("style");
style.textContent = `
    /* This targets almost all instances of the Robux icon on the site */
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
