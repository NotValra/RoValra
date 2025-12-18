import { createThumbnailElement } from '../../core/thumbnail/thumbnails.js';


export const createGameCard = (game, likeMap, playerMap, thumbnailCache) => {
    const gameElement = document.createElement('div');
    gameElement.className = 'game-card-container';
    gameElement.style.justifySelf = 'center';
    gameElement.style.width = '150px';
    gameElement.style.height = '240px';

    const gameLink = document.createElement('a');
    gameLink.className = 'game-card-link';
    Object.assign(gameLink.style, { display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' });
    gameLink.href = `https://www.roblox.com/games/${game.rootPlace.id}`;

    const thumbContainer = document.createElement('div');
    thumbContainer.className = 'game-card-thumb-container';

    const thumbnailData = thumbnailCache.get(game.id);
    const thumbnailElement = createThumbnailElement(thumbnailData, game.name, 'game-card-thumb');
    
    thumbContainer.appendChild(thumbnailElement);

    const gameName = document.createElement('div');
    gameName.className = 'game-card-name game-name-title';
    gameName.title = game.name;
    gameName.textContent = game.name;

    const cardInfo = document.createElement('div');
    cardInfo.className = 'game-card-info';
    const voteData = likeMap.get(game.id) || { ratio: 0, total: 0 };
    const playerCount = playerMap.get(game.id) || 0;
    const votePercentageClass = voteData.total > 0 ? '' : 'hidden';
    const noVoteClass = voteData.total === 0 ? '' : 'hidden';
    cardInfo.innerHTML = `
        <span class="info-label icon-votes-gray"></span>
        <span class="info-label vote-percentage-label ${votePercentageClass}">${voteData.ratio}%</span>
        <span class="info-label no-vote ${noVoteClass}"></span>
        <span class="info-label icon-playing-counts-gray"></span>
        <span class="info-label playing-counts-label" title="${playerCount.toLocaleString()}">${playerCount.toLocaleString()}</span>
    `;

    const topSection = document.createElement('div');
    topSection.append(thumbContainer, gameName);
    gameLink.append(topSection, cardInfo);
    gameElement.appendChild(gameLink);
    return gameElement;
};