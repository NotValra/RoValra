import { observeElement } from '../../../core/observer.js';
import { callRobloxApiJson } from '../../../core/api.js';
import { streamRobloxVideo } from '../../../core/utils/videoStreamer.js';

function injectVideoStyles() {
    const styleId = 'rovalra-video-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
        .carousel-item.carousel-video > *:not(#rovalra-trailer-video) {
            display: none !important;
            opacity: 0 !important;
            visibility: hidden !important;
        }
        
        #rovalra-trailer-video {
            background: #000;
        }
    `;
    
    const target = document.head || document.documentElement;
    if (target) target.appendChild(style);
}

async function hijackFirstSlot(videoId, assetType, carouselContainer, shouldAutoplay) {
    injectVideoStyles();

    let targetItem = carouselContainer.querySelector('.carousel-item');
    if (!targetItem) {
        await new Promise(resolve => {
            const tempObserver = new MutationObserver(() => {
                if (carouselContainer.querySelector('.carousel-item')) {
                    tempObserver.disconnect();
                    resolve();
                }
            });
            tempObserver.observe(carouselContainer, { childList: true });
        });
        targetItem = carouselContainer.querySelector('.carousel-item');
    }

    if (!targetItem) return;

    let lastUserInteraction = 0;
    const registerInteraction = () => { lastUserInteraction = Date.now(); };
    
    const attachNavListeners = () => {
        const controls = carouselContainer.querySelectorAll('.carousel-controls, .carousel-indicators li');
        controls.forEach(btn => btn.addEventListener('click', registerInteraction, true));
    };
    attachNavListeners();
    observeElement('.carousel-controls-container', () => attachNavListeners());

    const videoElement = document.createElement('video');
    videoElement.id = 'rovalra-trailer-video';
    
    videoElement.autoplay = shouldAutoplay; 
    
    videoElement.loop = false; 
    videoElement.muted = true;
    videoElement.playsInline = true;
    videoElement.controls = true;
    
    videoElement.style.cssText = `
        width: 100%; height: 100%; border: 0; background: #000;
        object-fit: contain; position: absolute; top: 0; left: 0; z-index: 10;
        display: block;
    `;
    
    videoElement.addEventListener('click', (e) => e.stopPropagation());

    targetItem.classList.add('carousel-video');
    targetItem.appendChild(videoElement);

    let wasActive = false;

    const enforceLoop = () => {
        if (targetItem && !targetItem.contains(videoElement)) {
            targetItem.appendChild(videoElement);
        }
        if (targetItem && !targetItem.classList.contains('carousel-video')) {
            targetItem.classList.add('carousel-video');
        }

        const isPlaying = !videoElement.paused && !videoElement.ended && videoElement.readyState > 2;
        const userJustClicked = (Date.now() - lastUserInteraction < 800);

        const shouldLock = isPlaying && !userJustClicked;

        if (shouldLock) {
            if (!targetItem.classList.contains('carousel-item-active')) {
                targetItem.classList.add('carousel-item-active');
            }
            
            if (targetItem.classList.contains('carousel-item-active-out')) targetItem.classList.remove('carousel-item-active-out');
            if (targetItem.classList.contains('carousel-item-left')) targetItem.classList.remove('carousel-item-left');
            if (targetItem.classList.contains('carousel-item-right')) targetItem.classList.remove('carousel-item-right');

            const siblings = carouselContainer.querySelectorAll('.carousel-item');
            for (const sib of siblings) {
                if (sib !== targetItem) {
                    if (sib.classList.contains('carousel-item-active')) sib.classList.remove('carousel-item-active');
                    if (sib.classList.contains('carousel-item-next')) sib.classList.remove('carousel-item-next');
                    if (sib.classList.contains('carousel-item-prev')) sib.classList.remove('carousel-item-prev');
                }
            }
        }

        const isActive = targetItem.classList.contains('carousel-item-active');
        const isNext = targetItem.classList.contains('carousel-item-next');
        const isPrev = targetItem.classList.contains('carousel-item-prev');
        const isSliding = targetItem.classList.contains('carousel-item-left') || targetItem.classList.contains('carousel-item-right');
        
        const currentlyVisible = isActive || isNext || isPrev || isSliding;

        if (currentlyVisible) {
            if (!wasActive) {
                videoElement.currentTime = 0;
                if (shouldAutoplay) {
                    videoElement.play().catch(() => {});
                }
            }
        } else {
            if (!videoElement.paused) {
                videoElement.pause();
            }
        }

        wasActive = currentlyVisible;

        requestAnimationFrame(enforceLoop);
    };

    requestAnimationFrame(enforceLoop);

    try {
        const fetchAssetData = async (type) => {
            return await callRobloxApiJson({
                subdomain: 'assetdelivery',
                endpoint: '/v1/assets/batch',
                method: 'POST',
                body: [{ assetId: videoId, assetType: type, requestId: "0" }]
            });
        };

        let data = await fetchAssetData(assetType);
        
        if (data && data.length > 0 && data[0].errors) {
            const fallback = (assetType === "Video") ? "GamePreviewVideo" : "Video";
            data = await fetchAssetData(fallback);
        }

        await streamRobloxVideo(data, videoElement, () => {});
    } catch (error) {
    }
}

export function init() {
    chrome.storage.local.get(['EnableGameTrailer', 'Enableautoplay'], (result) => {
        if (result && result.EnableGameTrailer === true) {
            
            const shouldAutoplay = result.Enableautoplay === true;

            document.addEventListener('rovalra-game-media-response', (event) => {
                const mediaData = event.detail;
                const videoAsset = mediaData?.data?.find(item => 
                    (item.assetType === "Video" || item.assetType === "GamePreviewVideo") 
                    && item.approved
                );

                if (videoAsset && videoAsset.videoId) {
                    observeElement('#game-details-carousel-container [data-testid="carousel"]', (carousel) => {
                        if (carousel.dataset.rovalraInjected) return;
                        carousel.dataset.rovalraInjected = "true";

                        hijackFirstSlot(videoAsset.videoId, videoAsset.assetType, carousel, shouldAutoplay);
                    });
                }
            });
        }
    });
}