import { createThumbnailElement } from '../../thumbnail/thumbnails.js';
import { safeHtml } from '../../packages/dompurify.js';

export function createGameCard({
    game,
    stats,
    showVotes = true,
    showPlayers = true,
    thumbStyle = {},
}) {
    const voteData = stats?.likes?.get(game.id) || { ratio: 0, total: 0 };
    const playerCount = stats?.players?.get(game.id) || 0;
    const thumbnailData = stats?.thumbnails?.get(game.id);

    const card = document.createElement('div');
    card.className = 'rovalra-game-card';

    card.innerHTML = `
        <a class="game-card-link" href="https://www.roblox.com/games/${game.rootPlace.id}/unnamed">
            <div class="game-card-thumb-container"></div>
            ${safeHtml`<div class="game-card-name" title="${game.name}">${game.name}</div>`}
            <div class="game-card-info">
                ${
                    showVotes
                        ? `
                    <span class="info-label icon-votes-gray"></span>
                    <span class="info-label vote-percentage-label ${voteData.total > 0 ? '' : 'hidden'}">${voteData.ratio}%</span>
                    <span class="info-label no-vote ${voteData.total === 0 ? '' : 'hidden'}"></span>
                `
                        : ''
                }
                ${
                    showPlayers
                        ? `
                    <span class="info-label icon-playing-counts-gray"></span>
                    <span class="info-label playing-counts-label" title="${playerCount.toLocaleString()}">${playerCount.toLocaleString()}</span>
                `
                        : ''
                }
            </div>
        </a>
    `; // Verified

    const thumbContainer = card.querySelector('.game-card-thumb-container');
    if (thumbContainer) {
        thumbContainer.appendChild(
            createThumbnailElement(
                thumbnailData,
                game.name,
                'game-card-thumb',
                thumbStyle,
            ),
        );
    }

    return card;
}
