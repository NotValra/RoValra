import { createThumbnailElement } from '../../thumbnail/thumbnails.js';
import { safeHtml } from '../../packages/dompurify.js';
import { ts } from '../../locale/i18n.js';

export function createBadgeCard({ badge, thumbnail, labels }) {
    const name =
        badge.displayName ||
        badge.name ||
        ts('viewBadgesProfile.fallbackName', { id: badge.id });
    const stats = badge.statistics || {};
    const winRate = (stats.winRatePercentage ?? 0).toFixed(1);
    const awardedCount = (stats.awardedCount ?? 0).toLocaleString();
    const universe = badge.awardingUniverse || {};

    const card = document.createElement('div');
    card.className = 'rovalra-badge-card';

    const link = document.createElement('a');
    link.className = 'rovalra-badge-card-link';
    link.href = `https://www.roblox.com/badges/${badge.id}/${encodeURIComponent(name)}`;

    const thumbContainer = document.createElement('div');
    thumbContainer.className = 'rovalra-badge-card-thumb-container';
    thumbContainer.appendChild(
        createThumbnailElement(thumbnail, name, 'rovalra-badge-card-thumb'),
    );

    link.innerHTML = safeHtml`<div class="rovalra-badge-card-name" title="${name}">${name}</div>`;
    link.prepend(thumbContainer);

    const gameLink = document.createElement('a');
    gameLink.className = 'rovalra-badge-card-game';
    gameLink.textContent = universe.name || '';
    gameLink.title = universe.name || '';
    if (universe.rootPlaceId) {
        gameLink.href = `https://www.roblox.com/games/${universe.rootPlaceId}/unnamed`;
    }

    const statsRow = document.createElement('div');
    statsRow.className = 'rovalra-badge-card-stats';
    statsRow.innerHTML = safeHtml`
        <span class="rovalra-badge-card-stat" title="${labels.rarity}">${`${winRate}%`}</span>
        <span class="rovalra-badge-card-stat" title="${labels.awarded}">${awardedCount}</span>
    `;

    card.append(link, gameLink, statsRow);
    return card;
}
