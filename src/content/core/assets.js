const assetPaths = {
    rovalraIcon: 'public/Assets/RoValraLogo.png',
    oldRovalraIcon: 'public/Assets/OldLogo/OldLogo.png',
    contributorIcon: 'public/Assets/Contributor.png',
    communityFeedbackProgramIcon:
        'public/Assets/two-people-speech-bubble.svg',
    creatorEventsIcon: 'public/Assets/person-rectangle-horizontal-line.svg',
    videoStarIcon: `data:image/svg+xml,${encodeURIComponent('<svg version="1.1" xmlns="http://www.w3.org/2000/svg" width="46" height="45" viewBox="0 0 46 45"><path d="M0 0 C4.22411365 1.52787089 6.20185551 4.04747769 8.2734375 8.0390625 C9.97511659 12.63176629 9.49053434 16.65748496 7.8125 21.25 C3.41172843 27.92703273 -2.20578285 29.08415448 -9.625 30.875 C-13.17243772 32.05747924 -15.15932343 33.63276952 -18 36 C-18.99 36 -19.98 36 -21 36 C-20.67 34.02 -20.34 32.04 -20 30 C-25.68845639 33.68161518 -29.2854128 37.35518669 -32.67578125 43.2421875 C-33.33126953 44.11230469 -33.33126953 44.11230469 -34 45 C-34.99 45 -35.98 45 -37 45 C-36.77855044 33.92752222 -29.99112506 23.24594238 -23 15 C-25.31 14.01 -27.62 13.02 -30 12 C-29.67 11.01 -29.34 10.02 -29 9 C-27.09278506 8.56502115 -25.18434325 8.13458796 -23.26953125 7.734375 C-19.85805724 6.63049012 -17.41771439 4.58335695 -14.6640625 2.33984375 C-10.36760402 -1.11951132 -5.26988729 -0.40478844 0 0 Z M-6 4 C-6.185625 4.598125 -6.37125 5.19625 -6.5625 5.8125 C-8.72273753 9.09981799 -11.35107655 9.64854687 -15 11 C-14.01 11.7734375 -14.01 11.7734375 -13 12.5625 C-10.34362457 15.79995755 -10.68657868 17.92552281 -11 22 C-9.7625 21.814375 -8.525 21.62875 -7.25 21.4375 C-4.23720423 21.05288777 -1.89989173 20.9125406 1 22 C0.9175 20.9275 0.835 19.855 0.75 18.75 C1 15 1 15 3 12.5625 C3.66 12.046875 4.32 11.53125 5 11 C3.88625 10.5875 2.7725 10.175 1.625 9.75 C-0.99320695 8.64453484 -1.83493089 8.25119213 -3.4375 5.8125 C-3.623125 5.214375 -3.80875 4.61625 -4 4 C-4.66 4 -5.32 4 -6 4 Z" fill="#FFFFFF" transform="translate(37,0)"/></svg>')}`,
    donatorTier1Icon: 'public/Assets/DonatorTiers/Bronze.png',
    donatorTier2Icon: 'public/Assets/DonatorTiers/Silver.png',
    donatorTier3Icon: 'public/Assets/DonatorTiers/Gold.png',
    donatorDiamondIcon: 'public/Assets/DonatorTiers/Diamond.png',
    translateGilbert: 'public/Assets/icon-128-translate.png',
    ratBadgeIcon: 'https://www.rovalra.com/static/img/return_request.png',
    fishConfetti: 'https://www.rovalra.com/static/img/fishstrap.png',
    rolimonsIcon: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1094 1466.2"><path fill="#0084dd" d="M1094 521.6 0 0v469.5l141-67.4 250 119.2L0 707.8v369.7l815.6 388.7L315 893l779-371.4z"></path></svg>')}`,
    onboarding: 'public/Assets/onboarding.png',
    serverListJson: 'public/Assets/data/ServerList.json',
    itemsJson: 'public/Assets/data/items.json',
    globeInitializer: 'public/Assets/data/globe_initializer.js',
    mapDark: 'public/Assets/data/map_dark.png',
    mapLight: 'public/Assets/data/map_light.png',
    // countriesJson: 'public/Assets/data/countries.json',
    verifiedBadge:
        "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 28 28' fill='none'%3E%3Cg clip-path='url(%23clip0_8_46)'%3E%3Crect x='5.88818' width='22.89' height='22.89' transform='rotate(15 5.88818 0)' fill='%230066FF'/%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M20.543 8.7508L20.549 8.7568C21.15 9.3578 21.15 10.3318 20.549 10.9328L11.817 19.6648L7.45 15.2968C6.85 14.6958 6.85 13.7218 7.45 13.1218L7.457 13.1148C8.058 12.5138 9.031 12.5138 9.633 13.1148L11.817 15.2998L18.367 8.7508C18.968 8.1498 19.942 8.1498 20.543 8.7508Z' fill='white'/%3E%3C/g%3E%3Cdefs%3E%3CclipPath id='clip0_8_46'%3E%3Crect width='28' height='28' fill='white'/%3E%3C/clipPath%3E%3C/defs%3E%3C/svg%3E",
    downloadIcon: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M5 20h14v-2H5zM19 9h-4V3H9v6H5l7 7z"></path></svg>')}`,
    priceFloorIcon: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8"></path></svg>')}`,
    TerminalIcon: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="white" d="M20 4H4c-1.11 0-2 .9-2 2v12c0 1.1.89 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.89-2-2-2m0 14H4V8h16zm-2-1h-6v-2h6zM7.5 17l-1.41-1.41L8.67 13l-2.59-2.59L7.5 9l4 4z"></path></svg>')}`,
    qolIcon: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M3 13h2v-2H3zm0 4h2v-2H3zm0-8h2V7H3zm4 4h14v-2H7zm0 4h14v-2H7zM7 7v2h14V7z"></path></svg>')}`,
    sidebarCollapseIcon: `data:image/svg+xml,${encodeURIComponent('<svg class="MuiSvgIcon-root MuiSvgIcon-fontSizeMedium css-1phnduy" focusable="false" aria-hidden="true" viewBox="0 0 24 24"><path fill="currentColor" d="M3 18h18v-2H3zm0-5h18v-2H3zm0-7v2h18V6z"></path></svg>')}`,
    ageThemeIcon: `data:image/svg+xml,${encodeURIComponent('<svg class="MuiSvgIcon-root MuiSvgIcon-fontSizeMedium css-1phnduy" focusable="false" aria-hidden="true" viewBox="0 0 24 24"><path fill="white" d="M21 3H3C2 3 1 4 1 5v14c0 1.1.9 2 2 2h18c1 0 2-1 2-2V5c0-1-1-2-2-2M5 17l3.5-4.5 2.5 3.01L14.5 11l4.5 6z"></path></svg>')}`,
    BlockIcon: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2M4 12c0-4.42 3.58-8 8-8 1.85 0 3.55.63 4.9 1.69L5.69 16.9C4.63 15.55 4 13.85 4 12m8 8c-1.85 0-3.55-.63-4.9-1.69L18.31 7.1C19.37 8.45 20 10.15 20 12c0 4.42-3.58 8-8 8"></path></svg>')}`,
    blahaj: 'https://www.rovalra.com/static/img/blahaj.png',
    ListAlt: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" class="MuiSvgIcon-root MuiSvgIcon-fontSizeMedium css-1phnduy" focusable="false" aria-hidden="true" viewBox="0 0 24 24"><path d="M19 5v14H5V5zm1.1-2H3.9c-.5 0-.9.4-.9.9v16.2c0 .4.4.9.9.9h16.2c.4 0 .9-.5.9-.9V3.9c0-.5-.5-.9-.9-.9M11 7h6v2h-6zm0 4h6v2h-6zm0 4h6v2h-6zM7 7h2v2H7zm0 4h2v2H7zm0 4h2v2H7z"></path></svg>')}`,
    description: `data:image/svg+xml,${encodeURIComponent('<svg class="MuiSvgIcon-root MuiSvgIcon-fontSizeMedium css-mdjgi4" focusable="false" aria-hidden="true" viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8zm2 16H8v-2h8zm0-4H8v-2h8zm-3-5V3.5L18.5 9z"></path></svg>')}`,
    // Explorer thumbnail button icon (Material "account_tree").
    explorerTreeIcon: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M22 11V3h-7v3H9V3H2v8h7V8h2v10h4v3h7v-8h-7v3h-2V8h2v3z"></path></svg>')}`,
    cam: 'https://www.rovalra.com/static/img/cam.gif',
    lock: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2m-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2m3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1z"></path></svg>')}`,
    banHammer: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="m5.2494 8.0688 2.83-2.8269 14.1343 14.15-2.83 2.8269zm4.2363-4.2415 2.828-2.8289 5.6577 5.656-2.828 2.8289zM.9989 12.3147l2.8284-2.8285 5.6569 5.6569-2.8285 2.8284zM1 21h12v2H1z"></path></svg>')}`,
    delete: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" class="MuiSvgIcon-root MuiSvgIcon-fontSizeMedium css-1phnduy" focusable="false" aria-hidden="true" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6zM19 4h-3.5l-1-1h-5l-1 1H5v2h14z"></path></svg>')}`,
    Emotes: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" class="MuiSvgIcon-root MuiSvgIcon-fontSizeMedium css-1phnduy" focusable="false" aria-hidden="true" viewBox="0 0 24 24"><path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2M9.8 8.9 7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6z"></path></svg>')}`,
    settings: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" class="MuiSvgIcon-root MuiSvgIcon-fontSizeMedium css-1phnduy" focusable="false" aria-hidden="true" viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6"></path></svg>')}`,
    alice: 'https://www.rovalra.com/static/img/alice.gif',
    verifiedShield: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" class="MuiSvgIcon-root MuiSvgIcon-fontSizeMedium css-1phnduy" focusable="false" aria-hidden="true" viewBox="0 0 24 24"><path fill="#335fff" d="M12 2 4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5zm-1.06 13.54L7.4 12l1.41-1.41 2.12 2.12 4.24-4.24 1.41 1.41z"></path></svg>')}`,
    UnverifiedShield: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" class="MuiSvgIcon-root MuiSvgIcon-fontSizeMedium css-1phnduy" focusable="false" aria-hidden="true" viewBox="0 0 24 24"><path fill="#636363" d="M12 2 4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5zm3.5 12.09-1.41 1.41L12 13.42 9.91 15.5 8.5 14.09 10.59 12 8.5 9.91 9.91 8.5 12 10.59l2.09-2.09 1.41 1.41L13.42 12z"></path></svg>')}`,
    betaVR: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M8 1.248c1.857 0 3.526.641 4.65 1.794a5 5 0 0 1 2.518 1.09C13.907 1.482 11.295 0 8 0 4.75 0 2.12 1.48.844 4.122a5 5 0 0 1 2.289-1.047C4.236 1.872 5.974 1.248 8 1.248"/><path d="M12 12a4 4 0 0 1-2.786-1.13l-.002-.002a1.6 1.6 0 0 0-.276-.167A2.2 2.2 0 0 0 8 10.5c-.414 0-.729.103-.935.201a1.6 1.6 0 0 0-.277.167l-.002.002A4 4 0 1 1 4 4h8a4 4 0 0 1 0 8"/></svg>')}`,
    betaPlaystation: `data:image/svg+xml,${encodeURIComponent('<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="m21.58 16.09-1.09-7.66C20.21 6.46 18.52 5 16.53 5H7.47C5.48 5 3.79 6.46 3.51 8.43l-1.09 7.66C2.2 17.63 3.39 19 4.94 19c.68 0 1.32-.27 1.8-.75L9 16h6l2.25 2.25c.48.48 1.13.75 1.8.75 1.56 0 2.75-1.37 2.53-2.91M11 11H9v2H8v-2H6v-1h2V8h1v2h2zm4-1c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1m2 3c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1"></path></svg>')}`,
    betaXbox: `data:image/svg+xml,${encodeURIComponent('<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M15 7.5V2H9v5.5l3 3zM7.5 9H2v6h5.5l3-3zM9 16.5V22h6v-5.5l-3-3zM16.5 9l-3 3 3 3H22V9z"></path></svg>')}`,
    betaMacPlayer: `data:image/svg+xml,${encodeURIComponent('<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20 18c1.1 0 1.99-.9 1.99-2L22 5c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2H0c0 1.1.9 2 2 2h20c1.1 0 2-.9 2-2zM4 5h16v11H4zm8 14c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1"></path></svg>')}`,
    betaWindowsStudio: `data:image/svg+xml,${encodeURIComponent('<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20 3H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h6v2H8v2h8v-2h-2v-2h6c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2"></path></svg>')}`,
    betaAndroid: `data:image/svg+xml,${encodeURIComponent('<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H8C6.34 1 5 2.34 5 4v16c0 1.66 1.34 3 3 3h8c1.66 0 3-1.34 3-3V4c0-1.66-1.34-3-3-3m-2 20h-4v-1h4zm3.25-3H6.75V4h10.5z"></path></svg>')}`,
    betaIos: `data:image/svg+xml,${encodeURIComponent('<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 1h-8C6.12 1 5 2.12 5 3.5v17C5 21.88 6.12 23 7.5 23h8c1.38 0 2.5-1.12 2.5-2.5v-17C18 2.12 16.88 1 15.5 1m-4 21c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5m4.5-4H7V4h9z"></path></svg>')}`,
    betaAllowlist: `data:image/svg+xml,${encodeURIComponent('<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5m0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5m0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5M7 19h14v-2H7zm0-6h14v-2H7zm0-8v2h14V5z"></path></svg>')}`,
    dragHandle:
        'data:image/svg+xml,' +
        encodeURIComponent(
            '<svg class="MuiSvgIcon-root MuiSvgIcon-fontSizeMedium css-1phnduy" focusable="false" aria-hidden="true" viewBox="0 0 24 24"><path d="M11 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2m-2-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2m0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2m6 4c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2m0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2m0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2"></path></svg>',
        ),
    edit: `data:image/svg+xml,${encodeURIComponent('<svg class="MuiSvgIcon-root MuiSvgIcon-fontSizeMedium css-1phnduy" focusable="false" aria-hidden="true" viewBox="0 0 24 24"><path d="M7 17V9.93L13.93 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-8.93L14.07 17z"></path><path d="M9 15h4.24l7.2-7.2-4.24-4.24-7.2 7.2zM22.91 2.49 21.5 1.08c-.78-.78-2.05-.78-2.83 0l-1.06 1.06 4.24 4.24 1.06-1.06c.79-.78.79-2.05 0-2.83"></path></svg>')}`,
    betaRcc: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="100%" height="100%"><path d="M20 13H4c-.55 0-1 .45-1 1v6c0 .55.45 1 1 1h16c.55 0 1-.45 1-1v-6c0-.55-.45-1-1-1M7 19c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2M20 3H4c-.55 0-1 .45-1 1v6c0 .55.45 1 1 1h16c.55 0 1-.45 1-1V4c0-.55-.45-1-1-1M7 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2"></path></svg>')}`,
    testerIcon: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="100%" height="100%"><path d="M20 8h-2.81c-.45-.78-1.07-1.45-1.82-1.96L17 4.41 15.59 3l-2.17 2.17C12.96 5.06 12.49 5 12 5s-.96.06-1.41.17L8.41 3 7 4.41l1.62 1.63C7.88 6.55 7.26 7.22 6.81 8H4v2h2.09c-.05.33-.09.66-.09 1v1H4v2h2v1c0 .34.04.67.09 1H4v2h2.81c1.04 1.79 2.97 3 5.19 3s4.15-1.21 5.19-3H20v-2h-2.09c.05-.33.09-.66.09-1v-1h2v-2h-2v-1c0-.34-.04-.67-.09-1H20zm-6 8h-4v-2h4zm0-4h-4v-2h4z"></path></svg>')}`,
    artistIcon: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><defs><linearGradient id="g" x1="1" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ff0000"/><stop offset="20%" stop-color="#ff9900"/><stop offset="40%" stop-color="#ffff00"/><stop offset="60%" stop-color="#33cc33"/><stop offset="80%" stop-color="#3399ff"/><stop offset="100%" stop-color="#cc33ff"/></linearGradient></defs><path d="M7 14c-1.66 0-3 1.34-3 3 0 1.31-1.16 2-2 2 .92 1.22 2.49 2 4 2 2.21 0 4-1.79 4-4 0-1.66-1.34-3-3-3" fill="#ffffff"/><path d="M20.71 4.63l-1.34-1.34a.996.996 0 0 0-1.41 0L9 12.25 11.75 15l8.96-8.96c.39-.39.39-1.02 0-1.41" fill="url(#g)"/></svg>')}`,
    translateIcon: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="rgb(0, 89, 255)" width="100%" height="100%"><path d="m12.87 15.07-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2zm-2.62 7 1.62-4.33L19.12 17z"></path></svg>')}`,
    projectedWarning: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" viewBox="0 0 64 64"><path d="M63.37 53.52C53.982 36.37 44.59 19.22 35.2 2.07a3.687 3.687 0 00-6.522 0C19.289 19.22 9.892 36.37.508 53.52c-1.453 2.649.399 6.083 3.258 6.083h56.35c1.584 0 2.648-.853 3.203-2.01.698-1.102.885-2.565.055-4.075" fill="#ffdd15"></path><path d="M28.917 34.477l-.889-13.262c-.166-2.583-.246-4.439-.246-5.565 0-1.534.4-2.727 1.202-3.588.805-.856 1.863-1.286 3.175-1.286 1.583 0 2.646.551 3.178 1.646.537 1.102.809 2.684.809 4.751 0 1.215-.066 2.453-.198 3.708l-1.19 13.649c-.129 1.626-.404 2.872-.827 3.739-.426.871-1.128 1.301-2.109 1.301-.992 0-1.69-.419-2.072-1.257-.393-.841-.668-2.12-.833-3.836m3.072 18.217c-1.125 0-2.106-.362-2.947-1.093-.841-.728-1.26-1.748-1.26-3.058 0-1.143.4-2.12 1.202-2.921.805-.806 1.786-1.206 2.951-1.206s2.153.4 2.977 1.206c.815.801 1.234 1.778 1.234 2.921 0 1.29-.419 2.308-1.246 3.044a4.245 4.245 0 01-2.911 1.107" fill="currentcolor"></path></svg>')}`,
    launchIcon: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3z"></path></svg>')}`,
    closeIcon: `data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20height%3D%2224px%22%20viewBox%3D%220%20-960%20960%20960%22%20width%3D%2224px%22%20fill%3D%22%23FFFFFF%22%3E%3Cpath%20d%3D%22m256-200-56-56%20224-224-224-224%2056-56%20224%20224%20224-224%2056%2056-224%20224%20224%20224-56%2056-224-224-224%20224Z%22%2F%3E%3C%2Fsvg%3E`,
    viewInArIcon: `data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20height%3D%2224px%22%20viewBox%3D%220%20-960%20960%20960%22%20width%3D%2224px%22%20fill%3D%22%23FFFFFF%22%3E%3Cpath%20d%3D%22M440-181%20240-296q-19-11-29.5-29T200-365v-230q0-22%2010.5-40t29.5-29l200-115q19-11%2040-11t40%2011l200%20115q19%2011%2029.5%2029t10.5%2040v230q0%2022-10.5%2040T720-296L520-181q-19%2011-40%2011t-40-11Zm0-92v-184l-160-93v185l160%2092Zm80%200%20160-92v-185l-160%2093v184ZM80-680v-120q0-33%2023.5-56.5T160-880h120v80H160v120H80ZM280-80H160q-33%200-56.5-23.5T80-160v-120h80v120h120v80Zm400%200v-80h120v-120h80v120q0%2033-23.5%2056.5T800-80H680Zm120-600v-120H680v-80h120q33%200%2056.5%2023.5T880-800v120h-80ZM480-526l158-93-158-91-158%2091%20158%2093Zm0%2045Zm0-45Zm40%2069Zm-80%200Z%22%2F%3E%3C%2Fsvg%3E`,
    apparelIcon: `data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20height%3D%2224px%22%20viewBox%3D%220%20-960%20960%20960%22%20width%3D%2224px%22%20fill%3D%22%23FFFFFF%22%3E%3Cpath%20d%3D%22m240-522-40%2022q-14%208-30%204t-24-18L66-654q-8-14-4-30t18-24l230-132h70q9%200%2014.5%205.5T400-820v20q0%2033%2023.5%2056.5T480-720q33%200%2056.5-23.5T560-800v-20q0-9%205.5-14.5T580-840h70l230%20132q14%208%2018%2024t-4%2030l-80%20140q-8%2014-23.5%2017.5T760-501l-40-20v361q0%2017-11.5%2028.5T680-120H280q-17%200-28.5-11.5T240-160v-362Zm80-134v456h320v-456l124%2068%2042-70-172-100q-15%2051-56.5%2084.5T480-640q-56%200-97.5-33.5T326-758L154-658l42%2070%20124-68Zm160%20177Z%22%2F%3E%3C%2Fsvg%3E`,
    apparelFillIcon: `data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20height%3D%2224px%22%20viewBox%3D%220%20-960%20960%20960%22%20width%3D%2224px%22%20fill%3D%22%23FFFFFF%22%3E%3Cpath%20d%3D%22m240-522-40%2022q-14%208-30%204t-24-18L66-654q-8-14-4-30t18-24l230-132h70q9%200%2014.5%205.5T400-820v20q0%2033%2023.5%2056.5T480-720q33%200%2056.5-23.5T560-800v-20q0-9%205.5-14.5T580-840h70l230%20132q14%208%2018%2024t-4%2030l-80%20140q-8%2014-23.5%2017.5T760-501l-40-20v361q0%2017-11.5%2028.5T680-120H280q-17%200-28.5-11.5T240-160v-362Z%22%2F%3E%3C%2Fsvg%3E`,
    rareIcon:
        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' aria-hidden='true' style='-ms-transform:rotate(360deg);-webkit-transform:rotate(360deg)' viewBox='0 0 128 128' transform='rotate(360)'%3E%3Cpath d='M63.85 123.84l60.1-87.8.05-.02v-.03L96.04 4H32.01L4 35.93v.03l.03.07 59.42 87.45.32.44.07-.09-.22-.83.23.84z' fill='%2381D4FA'/%3E%3ClinearGradient id='a' x1='4.111' x2='123.89' y1='64' y2='64' gradientUnits='userSpaceOnUse'%3E%3Cstop stop-color='%2381D4FA' offset='.001'/%3E%3Cstop stop-color='%2329B6F6' offset='1'/%3E%3C/linearGradient%3E%3Cpath fill='url(%23a)' d='M63.79 123.93L4.11 36.03l27.9-31.96h64.03l27.85 31.96z'/%3E%3Cpath fill='none' d='M64 4l-.05.07h.1z'/%3E%3ClinearGradient id='b' x1='63.599' x2='63.599' y1='123.89' y2='36.003' gradientUnits='userSpaceOnUse'%3E%3Cstop stop-color='%2381D4FA' offset='0'/%3E%3Cstop stop-color='%237DD3FA' offset='.221'/%3E%3Cstop stop-color='%2372CFF9' offset='.431'/%3E%3Cstop stop-color='%235EC8F8' offset='.638'/%3E%3Cstop stop-color='%2344BFF7' offset='.841'/%3E%3Cstop stop-color='%2329B6F6' offset='1'/%3E%3C/linearGradient%3E%3Cpath fill='url(%23b)' d='M63.78 123.89L87.55 36l-47.9.05z'/%3E%3Cpath fill='%2381D4FA' d='M87.55 36h.39l-.28-.38z'/%3E%3ClinearGradient id='c' x1='93.897' x2='93.897' y1='123.91' y2='36' gradientUnits='userSpaceOnUse'%3E%3Cstop stop-color='%23039BE5' offset='0'/%3E%3Cstop stop-color='%230398E2' offset='.369'/%3E%3Cstop stop-color='%230390D9' offset='.638'/%3E%3Cstop stop-color='%230282C9' offset='.874'/%3E%3Cstop stop-color='%230277BD' offset='1'/%3E%3C/linearGradient%3E%3Cpath fill='url(%23c)' d='M124 36.02L87.58 36l-23.79 87.91L124 36.03z'/%3E%3ClinearGradient id='d' x1='33.944' x2='33.944' y1='123.91' y2='35.968' gradientUnits='userSpaceOnUse'%3E%3Cstop stop-color='%2329B6F6' offset='0'/%3E%3Cstop stop-color='%2325B3F4' offset='.331'/%3E%3Cstop stop-color='%231AABEF' offset='.646'/%3E%3Cstop stop-color='%23079EE7' offset='.954'/%3E%3Cstop stop-color='%23039BE5' offset='1'/%3E%3C/linearGradient%3E%3Cpath fill='url(%23d)' d='M39.86 36.59L39 37.75l.86-1.16-.17-.61-35.52-.01-.06.06 59.67 87.88z'/%3E%3ClinearGradient id='e' x1='29.51' x2='21.783' y1='5.457' y2='36.366' gradientUnits='userSpaceOnUse'%3E%3Cstop stop-color='%23B3E5FC' offset='.005'/%3E%3Cstop stop-color='%234FC3F7' offset='1'/%3E%3C/linearGradient%3E%3Cpath fill='url(%23e)' d='M40 36L32 4.1 3.74 36.05z'/%3E%3ClinearGradient id='f' x1='105.87' x2='105.87' y1='7.06' y2='37.027' gradientUnits='userSpaceOnUse'%3E%3Cstop stop-color='%2381D4FA' offset='.009'/%3E%3Cstop stop-color='%2329B6F6' offset='1'/%3E%3C/linearGradient%3E%3Cpath fill='url(%23f)' d='M87.74 36l8-31.9L124 36.05z'/%3E%3ClinearGradient id='g' x1='63.644' x2='63.644' y1='6.738' y2='35.715' gradientUnits='userSpaceOnUse'%3E%3Cstop stop-color='%23E1F5FE' offset='0'/%3E%3Cstop stop-color='%23D3F0FD' offset='.275'/%3E%3Cstop stop-color='%23B3E5FC' offset='1'/%3E%3C/linearGradient%3E%3Cpath fill='url(%23g)' d='M39.74 36l24-31.96L87.55 36z'/%3E%3ClinearGradient id='h' x1='47.868' x2='47.868' y1='4.484' y2='37.34' gradientUnits='userSpaceOnUse'%3E%3Cstop stop-color='%2381D4FA' offset='.009'/%3E%3Cstop stop-color='%2329B6F6' offset='1'/%3E%3C/linearGradient%3E%3Cpath fill='url(%23h)' d='M64 4.04L40 36.05 31.74 4z'/%3E%3ClinearGradient id='i' x1='63.736' x2='96' y1='20.023' y2='20.023' gradientUnits='userSpaceOnUse'%3E%3Cstop stop-color='%234FC3F7' offset='.011'/%3E%3Cstop stop-color='%2329B6F6' offset='1'/%3E%3C/linearGradient%3E%3Cpath fill='url(%23i)' d='M63.74 4.04l24 32.01L96 4z'/%3E%3Cpath d='M94.67 7l25.53 29.2-56.42 82.41L7.76 36.19 33.37 7h61.3m1.37-3H32.01L4 35.93v.03l.03.07 59.74 87.9 60.18-87.9.05-.02v-.03L96.04 4z' fill='%23424242' opacity='.2'/%3E%3C/svg%3E",
    robux: 'https://www.rovalra.com/static/img/robux.png',
    modernRobuxIcon: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32' width='16' height='16'%3E%3Cpath d='M15.0762 7.29574C15.6479 6.96571 16.3521 6.96571 16.9238 7.29574L23.0762 10.8479C23.6479 11.1779 24 11.7878 24 12.4479V19.5521C24 20.2122 23.6479 20.8221 23.0762 21.1521L16.9238 24.7043C16.3521 25.0343 15.6479 25.0343 15.0762 24.7043L8.92376 21.1521C8.35214 20.8221 8 20.2122 8 19.5521V12.4479C8 11.7878 8.35214 11.1779 8.92376 10.8479L15.0762 7.29574ZM11.9998 13V19C11.9998 19.5523 12.4475 20 12.9998 20H18.9998C19.5521 20 19.9998 19.5523 19.9998 19V13C19.9998 12.4477 19.5521 12 18.9998 12H12.9998C12.4475 12 11.9998 12.4477 11.9998 13Z' fill='%2393979a'/%3E %3Cpath d='M13.8556 2.56068C15.1825 1.81311 16.8175 1.81311 18.1444 2.56068L26.8556 7.46819C28.1825 8.21577 29 9.59734 29 11.0925V20.9075C29 22.4027 28.1825 23.7842 26.8556 24.5318L18.1444 29.4393C16.8175 30.1869 15.1825 30.1869 13.8556 29.4393L5.14444 24.5318C3.81746 23.7842 3 22.4027 3 20.9075V11.0925C3 9.59734 3.81746 8.21577 5.14444 7.46819L13.8556 2.56068ZM17.1628 4.30319C16.4452 3.89894 15.5548 3.89894 14.8372 4.30319L6.12611 9.2107C5.41362 9.61209 5 10.336 5 11.0925V20.9075C5 21.664 5.41362 22.3879 6.12611 22.7893L14.8372 27.6968C15.5548 28.1011 16.4452 28.1011 17.1628 27.6968L25.8739 22.7893C26.5864 22.3879 27 21.664 27 20.9075V11.0925C27 10.336 26.5864 9.61209 25.8739 9.2107L17.1628 4.30319Z' fill='%2393979a'/%3E%3C/svg%3E`,
    brokenAvatar: 'https://www.rovalra.com/static/img/broken-avatar-200px.png',
    verifiedBadgeMono:
        'data:image/svg+xml,' +
        encodeURIComponent(
            "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32' width='32' height='32'><path d='M10.1641 3.06852C9.09906 2.78315 8.00434 3.41518 7.71897 4.48022L3.06852 21.8359C2.78315 22.9009 3.41518 23.9957 4.48022 24.281L21.8359 28.9315C22.9009 29.2169 23.9957 28.5848 24.281 27.5198L28.9315 10.1641C29.2169 9.09906 28.5848 8.00434 27.5198 7.71897L10.1641 3.06852ZM21.7071 12.2929C22.0976 12.6834 22.0976 13.3166 21.7071 13.7071L14.7071 20.7071C14.3166 21.0976 13.6834 21.0976 13.2929 20.7071L10.2929 17.7071C9.90237 17.3166 9.90237 16.6834 10.2929 16.2929C10.6834 15.9024 11.3166 15.9024 11.7071 16.2929L14 18.5858L20.2929 12.2929C20.6834 11.9024 21.3166 11.9024 21.7071 12.2929Z' fill='#335fff'/></svg>",
        ),
    playingIcon:
        'data:image/svg+xml,' +
        encodeURIComponent(
            "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32' width='32' height='32'><path d='M11.7142 2.56785C12.0165 1.43977 13.176 0.77031 14.3041 1.07258L20.4318 2.71451C21.5599 3.01678 22.2294 4.17631 21.9271 5.3044L20.2852 11.4321C19.9829 12.5602 18.8234 13.2297 17.6953 12.9274L11.5676 11.2855C10.4395 10.9832 9.77001 9.82369 10.0723 8.6956L11.7142 2.56785Z' fill='currentColor'/><path d='M6.83768 18.9378C7.33735 16.6394 9.37144 15 11.7236 15H20.2758C22.2895 15 24.0702 16.2016 24.8544 17.9896C22.0823 16.4893 18.9997 18.6863 18.9997 21.558V30.292C18.9997 30.4921 19.0147 30.689 19.0435 30.8816C18.1348 30.9572 17.1239 31 15.9997 31C9.18851 31 6.53782 29.4282 5.57598 28.5242C5.06195 28.0411 5.00192 27.3824 5.1067 26.9004L6.83768 18.9378Z' fill='currentColor'/><path d='M30.5172 25.0405C31.1605 25.4412 31.1605 26.4088 30.5172 26.8095L23.5048 31.1764C22.8901 31.5592 22.1202 31.1604 22.0124 30.4603C22.0041 30.4059 21.9997 30.3497 21.9997 30.292V21.558C21.9997 20.7563 22.8424 20.2611 23.5048 20.6736L30.5172 25.0405Z' fill='currentColor'/></svg>",
        ),
    profileViewsIcon:
        'data:image/svg+xml,' +
        encodeURIComponent(
            "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32' width='32' height='32'><path d='M6.48218 4.43208C6.76806 3.36514 7.86474 2.73198 8.93167 3.01786L13.7613 4.31196C14.8282 4.59784 15.4614 5.69452 15.1755 6.76145L13.8814 11.5911C13.5955 12.658 12.4989 13.2912 11.4319 13.0053L6.6023 11.7112C5.53537 11.4253 4.9022 10.3286 5.18808 9.26171L6.48218 4.43208ZM8.41403 4.94972L7.11994 9.77934L11.9496 11.0734L13.2437 6.24381L8.41403 4.94972Z' fill='currentColor'/><path d='M26.9998 8.00024C26.9998 10.7617 24.7612 13.0002 21.9998 13.0002C19.2383 13.0002 16.9998 10.7617 16.9998 8.00024C16.9998 5.23882 19.2383 3.00024 21.9998 3.00024C24.7612 3.00024 26.9998 5.23882 26.9998 8.00024ZM24.9998 8.00024C24.9998 6.34339 23.6566 5.00024 21.9998 5.00024C20.3429 5.00024 18.9998 6.34339 18.9998 8.00024C18.9998 9.65709 20.3429 11.0002 21.9998 11.0002C23.6566 11.0002 24.9998 9.65709 24.9998 8.00024Z' fill='currentColor'/><path d='M17.3646 27.2124C16.325 27.7332 14.1127 28.5002 10.116 28.5002C6.11937 28.5002 3.90705 27.7332 2.8675 27.2124C2.03267 26.7942 1.78056 25.8943 1.95044 25.1663L3.24064 19.6369C3.87427 16.9213 6.29521 15.0002 9.08369 15.0002H11.1484C13.9369 15.0002 16.3578 16.9213 16.9915 19.6369L18.2817 25.1663C18.4515 25.8943 18.1994 26.7942 17.3646 27.2124ZM16.3063 25.502L15.0438 20.0913C14.6214 18.281 13.0074 17.0002 11.1484 17.0002H9.08369C7.22471 17.0002 5.61074 18.281 5.18833 20.0913L3.92583 25.502C4.7473 25.8779 6.6317 26.5002 10.116 26.5002C13.6004 26.5002 15.4848 25.8779 16.3063 25.502Z' fill='currentColor'/><path d='M23.1484 15.0002C25.9369 15.0002 28.3578 16.9213 28.9915 19.6369L30.2817 25.1663C30.4515 25.8943 30.1994 26.7942 29.3646 27.2124C28.3251 27.7332 26.1127 28.5002 22.1161 28.5002C21.7445 28.5002 21.3884 28.4936 21.0473 28.4812C20.4953 28.4611 20.0642 27.9973 20.0844 27.4454C20.1045 26.8935 20.5682 26.4624 21.1201 26.4825C21.4365 26.494 21.7683 26.5002 22.1161 26.5002C25.6004 26.5002 27.4848 25.8779 28.3063 25.502L27.0438 20.0913C26.6214 18.281 25.0074 17.0002 23.1484 17.0002H21.0837C20.528 17.0002 19.9954 17.1144 19.51 17.3224C19.0023 17.5399 18.4144 17.3047 18.1969 16.797C17.9794 16.2894 18.2147 15.7015 18.7223 15.484C19.452 15.1714 20.2521 15.0002 21.0837 15.0002H23.1484Z' fill='currentColor'/></svg>",
        ),
    thumbsUp:
        'data:image/svg+xml,' +
        encodeURIComponent(
            "<svg viewBox='0 0 2048 2105.0047' xmlns='http://www.w3.org/2000/svg'><path d='M1179 192q-37 0-64 27t-27 64v202q0 27-19 46L805 795q-18 18-27.5 41.5T768 885v606q0 21 8.5 41.5T800 1568q47 47 145 87 82 33 180 54 88 19 141 19h361q25 0 48.5-9.5t41.5-27.5l11-11q22-22 31.5-53t3.5-62l-7-31q-5-29 2.5-58t27.5-52l26-30q21-23 28-53.5t0-61.5l-18-72q-7-26-2.5-53t19.5-49l12-17q21-32 21-71v-57q0-35-17-64.5t-46.5-46.5q-29.5-17-64.5-17h-415q-1 0-1.5-1t.5-1q38-50 59-110.5t21-124.5V421q0-63-30.5-115.5t-83-83Q1242 192 1179 192zM348 1773l390-89q-15-12-28-25-34-34-52-77.5t-18-90.5V885q0-62 28-117H320q-35 0-64.5 17T209 831.5Q192 861 192 896v752q0 40 22.5 72t58.5 47q36 15 75 6z' fill='currentColor'/></svg>",
        ),
    thumbsDown:
        'data:image/svg+xml,' +
        encodeURIComponent(
            "<svg viewBox='0 0 2048 2105.0047' xmlns='http://www.w3.org/2000/svg'><path d='M1179 1856q-37 0-64-27t-27-65v-202q0-26-19-45l-264-264q-18-18-27.5-41.5T768 1163V557q0-22 8.5-42t23.5-35q47-47 145-87 82-33 180-54 88-19 141-19h361q25 0 48.5 9.5T1717 357l11 10q22 23 31.5 54t3.5 62l-7 31q-5 29 2.5 58t27.5 51l26 30q21 24 28 54.5t0 61.5l-18 72q-7 26-2.5 52.5T1839 943l12 17q21 32 21 71v57q0 35-17 64t-46.5 46.5Q1779 1216 1744 1216h-415q-1 0-1.5.5t.5 1.5q38 50 59 110.5t21 124.5v174q0 62-30.5 114.5t-83 83.5q-52.5 31-115.5 31zM348 275l390 89q-15 12-28 25-34 34-52 77.5T640 557v606q0 62 28 117H320q-35 0-64.5-17.5T209 1216q-17-29-17-64V400q0-40 22.5-72t58.5-47q36-15 75-6z' fill='currentColor'/></svg>",
        ),
};
let resolvedAssets = null;
let useOldRovalraLogo = false;
let rovalraLogoPreferenceLoaded = false;
let rovalraLogoPreferencePromise = null;

const ROVALRA_LOGO_SETTING_NAME = 'useOldRovalraLogo';
const ROVALRA_LOGO_DEPENDENT_ASSETS = [
    'rovalraIcon',
    'donatorTier1Icon',
    'donatorTier2Icon',
    'donatorTier3Icon',
    'donatorDiamondIcon',
];

function resolveAssetPath(path) {
    if (
        path.startsWith('data:') ||
        path.startsWith('http:') ||
        path.startsWith('https:')
    ) {
        return path;
    }

    return chrome.runtime.getURL(path);
}

function getRovalraLogoPath() {
    return useOldRovalraLogo
        ? assetPaths.oldRovalraIcon
        : assetPaths.rovalraIcon;
}

function getAssetPath(assetName) {
    if (assetName === 'rovalraIcon') return getRovalraLogoPath();
    if (
        useOldRovalraLogo &&
        [
            'donatorTier1Icon',
            'donatorTier2Icon',
            'donatorTier3Icon',
            'donatorDiamondIcon',
        ].includes(assetName)
    ) {
        return assetPaths.oldRovalraIcon;
    }

    return assetPaths[assetName];
}

function updateResolvedDynamicAssets() {
    if (!resolvedAssets) return;
    ROVALRA_LOGO_DEPENDENT_ASSETS.forEach((assetName) => {
        resolvedAssets[assetName] = resolveAssetPath(getAssetPath(assetName));
    });
}

export function updateAssetElements(assetName = 'rovalraIcon', root = null) {
    root = root || (typeof document !== 'undefined' ? document : null);
    if (!root?.querySelectorAll) return;

    const assetUrl = getAssets()[assetName];
    if (!assetUrl) return;

    root.querySelectorAll(`[data-rovalra-asset="${assetName}"]`).forEach(
        (element) => {
            if ('src' in element) element.src = assetUrl;
        },
    );

    root.querySelectorAll(`[data-rovalra-asset-mask="${assetName}"]`).forEach(
        (element) => {
            element.style.webkitMask = `url("${assetUrl}") center / contain no-repeat`;
            element.style.mask = `url("${assetUrl}") center / contain no-repeat`;
        },
    );
}

function setRovalraLogoPreference(value) {
    const nextValue = value === true;
    if (useOldRovalraLogo === nextValue && rovalraLogoPreferenceLoaded) return;

    useOldRovalraLogo = nextValue;
    rovalraLogoPreferenceLoaded = true;
    updateResolvedDynamicAssets();
    ROVALRA_LOGO_DEPENDENT_ASSETS.forEach((assetName) => {
        updateAssetElements(assetName);
    });

    if (typeof document !== 'undefined') {
        document.dispatchEvent(
            new CustomEvent('rovalra:assetsUpdated', {
                detail: { assetNames: ROVALRA_LOGO_DEPENDENT_ASSETS },
            }),
        );
    }
}

export function isUsingOldRovalraLogo() {
    loadRovalraLogoPreference();
    return useOldRovalraLogo;
}

function loadRovalraLogoPreference() {
    if (
        rovalraLogoPreferenceLoaded ||
        rovalraLogoPreferencePromise ||
        typeof chrome === 'undefined' ||
        !chrome.storage?.local
    ) {
        return rovalraLogoPreferencePromise;
    }

    rovalraLogoPreferencePromise = chrome.storage.local
        .get({ [ROVALRA_LOGO_SETTING_NAME]: false })
        .then((settings) => {
            setRovalraLogoPreference(settings[ROVALRA_LOGO_SETTING_NAME]);
        })
        .catch((error) => {
            console.warn('RoValra: Failed to load logo preference.', error);
            rovalraLogoPreferenceLoaded = true;
        })
        .finally(() => {
            rovalraLogoPreferencePromise = null;
        });

    return rovalraLogoPreferencePromise;
}

if (typeof document !== 'undefined') {
    document.addEventListener('rovalra:settingSaved', (event) => {
        if (event.detail?.name !== ROVALRA_LOGO_SETTING_NAME) return;
        setRovalraLogoPreference(event.detail.value);
    });
}

if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local') return;
        const change = changes[ROVALRA_LOGO_SETTING_NAME];
        if (!change) return;
        setRovalraLogoPreference(change.newValue);
    });
}

export function getAssets() {
    if (resolvedAssets) {
        loadRovalraLogoPreference();
        return resolvedAssets;
    }

    resolvedAssets = {};
    for (const key in assetPaths) {
        const path = getAssetPath(key);
        resolvedAssets[key] = resolveAssetPath(path);
    }
    updateResolvedDynamicAssets();
    loadRovalraLogoPreference();
    return resolvedAssets;
}
