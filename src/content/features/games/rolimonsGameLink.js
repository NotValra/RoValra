import { getAssets } from '../../core/assets.js';
import { getPlaceIdFromUrl } from '../../core/idExtractor.js';
import { observeElement } from '../../core/observer.js';
import { t } from '../../core/locale/i18n.js';
import { addTooltip } from '../../core/ui/tooltip.js';

const STATS_SELECTOR = '#game-details-about-tab-container .game-stat-container';
const LINK_CONTAINER_CLASS = 'rovalra-rolimons-game-link-container';

function addRolimonsLink(statsContainer, labelText, tooltipText) {
    if (
        statsContainer.dataset.rovalraRolimonsLink === 'true' ||
        !statsContainer.isConnected
    ) {
        return;
    }

    const placeId = getPlaceIdFromUrl();
    if (!/^\d+$/.test(placeId || '')) return;

    statsContainer.dataset.rovalraRolimonsLink = 'true';

    const link = document.createElement('a');
    link.className = 'btn-secondary-md rovalra-rolimons-game-link';
    link.href = `https://www.rolimons.com/game/${placeId}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';

    const icon = document.createElement('img');
    icon.src = getAssets().rolimonsIcon;
    icon.alt = '';
    link.appendChild(icon);

    const label = document.createElement('span');
    label.textContent = labelText;
    link.appendChild(label);

    addTooltip(link, tooltipText, { position: 'top' });

    const linkContainer = document.createElement('li');
    linkContainer.className = LINK_CONTAINER_CLASS;
    linkContainer.appendChild(link);
    statsContainer.appendChild(linkContainer);
}

export async function init() {
    const [label, tooltip] = await Promise.all([
        t('rolimonsGameLink.label'),
        t('rolimonsGameLink.tooltip'),
    ]);
    observeElement(
        STATS_SELECTOR,
        (statsContainer) => addRolimonsLink(statsContainer, label, tooltip),
        { multiple: true },
    );
}
