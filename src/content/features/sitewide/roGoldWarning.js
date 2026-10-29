import { createOverlay } from '../../core/ui/overlay.js';
import { createButton } from '../../core/ui/buttons.js';
import { ts } from '../../core/locale/i18n.js';
import { observeElement } from '../../core/observer.js';
import { getAssets } from '../../core/assets.js';
import { SETTINGS_CONFIG } from '../../core/settings/settingConfig.js';

const ROGOLD_SELECTOR = '#rgu-shell-settling-style';
const DISMISSED_KEY = 'roGoldWarningDismissed';
const OBSERVE_TIMEOUT_MS = 20000;
const STEP_DELAY_SECONDS = 3;
const SOURCE_URL = 'https://github.com/NotValra/RoValra';
const OVERLAY_ID = 'rovalra-rogold-warning';
const FONT_SIZE = '13px';
let warningShown = false;

function setDisabled(button, disabled) {
    button.disabled = disabled;
    button.setAttribute('aria-disabled', String(disabled));
}

function forceFontSize(root) {
    [root, ...root.querySelectorAll('*')].forEach((el) => {
        el.style.setProperty('font-size', FONT_SIZE, 'important');
    });
}

function createParagraph(text, isLast = false) {
    const p = document.createElement('p');
    p.textContent = text;
    p.style.margin = isLast ? '0' : '0 0 10px';
    return p;
}

function createTextStep(paragraphs) {
    const step = document.createElement('div');
    paragraphs.forEach((text, index) => {
        step.appendChild(
            createParagraph(text, index === paragraphs.length - 1),
        );
    });
    return step;
}

function createFeatureStep({ title, description, image }) {
    const step = document.createElement('div');

    step.appendChild(createParagraph(ts('roGoldWarning.missingOut')));

    const img = document.createElement('img');
    img.src = image;
    img.alt = title;
    img.style.display = 'block';
    img.style.width = '100%';
    img.style.borderRadius = '8px';
    img.style.margin = '0 0 10px';
    step.appendChild(img);

    step.appendChild(createHeading(title));

    step.appendChild(createParagraph(description, true));
    return step;
}

function createHeading(text) {
    const heading = document.createElement('p');
    heading.textContent = text;
    heading.style.fontWeight = '700';
    heading.style.margin = '0 0 4px';
    return heading;
}

function createTitledStep(title, paragraphs) {
    const step = createTextStep(paragraphs);
    step.prepend(createHeading(title));
    return step;
}

function countFeatures() {
    return Object.values(SETTINGS_CONFIG)
        .filter((category) => !category.hidden)
        .flatMap((category) => Object.values(category.settings || {}))
        .filter((setting) => setting.type === 'checkbox' && !setting.hidden)
        .length;
}

function createOpenSourceStep() {
    const step = createTitledStep(ts('roGoldWarning.openSourceTitle'), [
        ts('roGoldWarning.openSource'),
    ]);
    step.lastChild.style.margin = '0 0 10px';

    const link = document.createElement('a');
    link.href = SOURCE_URL;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.className = 'text-link';
    link.textContent = ts('roGoldWarning.viewSource');
    step.appendChild(link);
    return step;
}

function showRoGoldWarning() {
    if (warningShown || !document.body) return;
    warningShown = true;

    const assets = getAssets();
    const features = [
        {
            title: ts('roGoldWarning.regionSelectorTitle'),
            description: ts('roGoldWarning.regionSelectorDescription'),
            image: assets.roGoldWarningRegionSelector,
        },
        {
            title: ts('roGoldWarning.saveRobuxTitle'),
            description: ts('roGoldWarning.saveRobuxDescription'),
            image: assets.roGoldWarningSaveRobux,
        },
        {
            title: ts('roGoldWarning.quickPlayTitle'),
            description: ts('roGoldWarning.quickPlayDescription'),
            image: assets.roGoldWarningQuickPlay,
        },
        {
            title: ts('roGoldWarning.hiddenGamesTitle'),
            description: ts('roGoldWarning.hiddenGamesDescription'),
            image: assets.roGoldWarningHiddenGames,
        },
    ];

    const featureCount = countFeatures();
    const steps = [
        createTextStep([
            ts('roGoldWarning.detected'),
            ts('roGoldWarning.notOurFault'),
        ]),
        ...features.map(createFeatureStep),
        createTitledStep(
            ts('roGoldWarning.featureCountTitle', { count: featureCount }),
            [ts('roGoldWarning.featureCount', { count: featureCount })],
        ),
        createTitledStep(ts('roGoldWarning.extensionSupportTitle'), [
            ts('roGoldWarning.extensionSupport'),
            ts('roGoldWarning.extensionSupportRoGold'),
        ]),
        createTitledStep(ts('roGoldWarning.noPaywallTitle'), [
            ts('roGoldWarning.noPaywall'),
            ts('roGoldWarning.noPaywallRoGold'),
        ]),
        createOpenSourceStep(),
        createTextStep([ts('roGoldWarning.choice')]),
    ];

    const bodyContent = document.createElement('div');
    bodyContent.className = 'text-body';
    bodyContent.style.lineHeight = '1.5';

    const stepCounter = document.createElement('p');
    stepCounter.className = 'text-secondary';
    stepCounter.style.margin = '0 0 10px';
    bodyContent.appendChild(stepCounter);

    const stepContainer = document.createElement('div');
    bodyContent.appendChild(stepContainer);

    features.forEach(({ image }) => {
        new Image().src = image;
    });

    let currentStep = 0;
    let countdownId = null;

    const backBtn = createButton(ts('roGoldWarning.back'), 'secondary', {
        onClick: () => goToStep(currentStep - 1),
    });
    const nextBtn = createButton(ts('roGoldWarning.next'), 'primary', {
        onClick: () => {
            if (currentStep < steps.length - 1) {
                goToStep(currentStep + 1);
            } else {
                close();
            }
        },
    });

    const { close, overlay } = createOverlay({
        title: ts('roGoldWarning.title'),
        bodyContent,
        actions: [backBtn, nextBtn],
        maxWidth: '450px',
        showLogo: true,
        preventBackdropClose: true,
        showCloseButton: false,
        onClose: () => {
            clearInterval(countdownId);
            chrome.storage.local.set({ [DISMISSED_KEY]: true });
        },
    });

    overlay.id = OVERLAY_ID;

    let introRead = false;

    function goToStep(index) {
        currentStep = index;
        clearInterval(countdownId);

        stepContainer.replaceChildren(steps[index]);
        stepCounter.textContent = ts('roGoldWarning.stepCounter', {
            current: index + 1,
            total: steps.length,
        });
        backBtn.style.display = index === 0 ? 'none' : '';

        const isLast = index === steps.length - 1;
        const nextText = isLast ? ts('common.close') : ts('roGoldWarning.next');

        if (index !== 0 || introRead) {
            nextBtn.textContent = nextText;
            setDisabled(nextBtn, false);
        } else {
            introRead = true;
            setDisabled(nextBtn, true);
            let remainingSeconds = STEP_DELAY_SECONDS;
            const updateCountdown = () => {
                if (remainingSeconds > 0) {
                    nextBtn.textContent = `${nextText} (${remainingSeconds})`;
                    remainingSeconds -= 1;
                    return;
                }
                nextBtn.textContent = nextText;
                setDisabled(nextBtn, false);
                clearInterval(countdownId);
            };
            updateCountdown();
            countdownId = setInterval(updateCountdown, 1000);
        }

        forceFontSize(overlay);
    }

    goToStep(0);
}

export async function init() {
    const { [DISMISSED_KEY]: dismissed } =
        await chrome.storage.local.get(DISMISSED_KEY);
    if (dismissed) return;

    const request = observeElement(ROGOLD_SELECTOR, () => {
        if (document.body) {
            showRoGoldWarning();
        } else {
            document.addEventListener('DOMContentLoaded', showRoGoldWarning, {
                once: true,
            });
        }
    });
    setTimeout(() => request.disconnect(), OBSERVE_TIMEOUT_MS);
}
