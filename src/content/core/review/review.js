import { createOverlay } from '../../core/ui/overlay.js';
import { observeElement } from '../../core/observer.js';

const REVIEW_URL = "https://chromewebstore.google.com/detail/rovalra-roblox-improved/njcickgebhnpgmoodjdgohkclfplejli/reviews";
const STATUS_KEY = "rovalra_review_popup_status";
const STATS_KEY = "rovalra_review_stats";

// Revuew algoritm
const SOURCE_WEIGHTS = {
    'region_filters': 10,
    'quickplay': 5,
    'outfits': 5,
    'totalspent': 5,
    'antibots': 5,
    'default': 2
};
const MIN_DAYS_INSTALLED = 0; // Prevent instant pop up when installing
const COOLDOWN_DAYS = 7; // Prevent it getting annoying
const SCORE_THRESHOLD = 150; // Ensure usage depth

function createButton(text, className, onClick) {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.className = className;
    if (onClick) btn.addEventListener('click', onClick);
    return btn;
}

export function showReviewPopup(source = 'unknown') {
    observeElement('body', () => {
        chrome.storage.local.get([STATUS_KEY, STATS_KEY, 'forceReviewPopup'], (result) => {
            const forceShow = result.forceReviewPopup === true;

            if (!forceShow && result[STATUS_KEY] === 'dont_show') return;

            const now = Date.now();
            const stats = result[STATS_KEY] || {
                firstSeen: now,
                lastDismissed: 0,
                interactionScore: 0,
                sources: [],
                dismissCount: 0
            };

            if (!stats.firstSeen) stats.firstSeen = now;
            if (!stats.lastDismissed) stats.lastDismissed = 0;
            if (!stats.interactionScore) stats.interactionScore = 0;
            if (!stats.sources) stats.sources = [];
            if (typeof stats.dismissCount !== 'number') stats.dismissCount = 0;

            const weight = SOURCE_WEIGHTS[source] || SOURCE_WEIGHTS['default'];
            stats.interactionScore += weight;

            if (!stats.sources.includes(source)) stats.sources.push(source);

            chrome.storage.local.set({ [STATS_KEY]: stats });

            if (!forceShow) {
                if ((now - stats.firstSeen) / (1000 * 60 * 60 * 24) < MIN_DAYS_INSTALLED) return; 
                if (stats.interactionScore < SCORE_THRESHOLD) return; 
                const currentCooldown = COOLDOWN_DAYS + stats.dismissCount;
                if (stats.lastDismissed > 0 && (now - stats.lastDismissed) / (1000 * 60 * 60 * 24) < currentCooldown) return; 
            }

            setTimeout(() => {
                if (document.querySelector('.rovalra-global-overlay')) {
                    let obsRequest;
                    const onOverlayRemoved = () => {
                        if (obsRequest) {
                            obsRequest.active = false;
                        }
                        setTimeout(() => showReviewPopup(source), 100);
                    };
                    obsRequest = observeElement('.rovalra-global-overlay', () => {}, { onRemove: onOverlayRemoved });
                    return;
                }
                if (document.querySelector('.rovalra-review-popup-marker')) return;

                const bodyContent = document.createElement('div');
                bodyContent.className = 'rovalra-review-popup-marker';
                bodyContent.style.display = 'flex';
                bodyContent.style.flexDirection = 'column';
                bodyContent.style.gap = '10px';

                const text = document.createElement('p');
                text.textContent = "It looks like you've been getting value from RoValra!\n Would you mind leaving a 5-star review?\n It helps keep RoValra free for everyone without paywalls.";
                text.style.fontSize = "16px";
                text.style.lineHeight = "1.5";
                text.style.whiteSpace = "pre-line";
                bodyContent.appendChild(text);

                let actionTaken = false;

                const reviewBtn = createButton("Leave a Review", "btn-primary-md", () => {
                    actionTaken = true;
                    window.open(REVIEW_URL, '_blank');
                    chrome.storage.local.set({ [STATUS_KEY]: 'dont_show' });
                    close();
                });

                const notNowBtn = createButton("Not right now", "btn-control-md", () => {
                    actionTaken = true;
                    stats.lastDismissed = Date.now();
                    stats.dismissCount++;
                    chrome.storage.local.set({ [STATS_KEY]: stats });
                    close();
                });

                const { close } = createOverlay({
                    title: "Rate RoValra",
                    bodyContent: bodyContent,
                    actions: [notNowBtn, reviewBtn],
                    showLogo: true,
                    preventBackdropClose: true,
                    onClose: () => {
                        if (actionTaken) return;
                        stats.lastDismissed = Date.now();
                        stats.dismissCount++;
                        chrome.storage.local.set({ [STATS_KEY]: stats });
                    }
                });
            }, 2000);
        });
    });
}