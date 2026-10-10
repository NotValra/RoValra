import { ts } from '../../locale/i18n.js';
import { createInteractiveTimestamp } from '../time/time.js';

const UPDATED_SORTS = new Set(['default', 'updated']);

export function createSortStatLine(sort, gameId, stats) {
    const line = document.createElement('div');
    line.className = 'rovalra-game-card-sort-stat';

    if (UPDATED_SORTS.has(sort)) {
        const updated = stats?.updated?.get(gameId);
        const date = updated ? new Date(updated) : null;
        if (!date || isNaN(date) || date.getFullYear() < 2000) {
            line.textContent = ts('gameSortStat.updatedUnknown');
            return line;
        }
        line.append(
            `${ts('gameSortStat.updated')} `,
            createInteractiveTimestamp(date, { initialFormat: 'relative' }),
        );
        return line;
    }

    if (sort === 'subplace-updated') {
        const latest = stats?.latestPlace?.get(gameId);
        if (!latest) {
            line.textContent = ts('gameSortStat.updatedUnknown');
            return line;
        }
        line.title = latest.placeName || '';
        line.append(
            `${ts('gameSortStat.placeUpdated')} `,
            createInteractiveTimestamp(latest.updated, {
                initialFormat: 'relative',
            }),
        );
        return line;
    }

    const votes = stats?.likes?.get(gameId);
    const fmt = (n) => (n || 0).toLocaleString();

    if (sort === 'like-ratio') {
        line.textContent =
            votes?.total > 0
                ? ts('gameSortStat.likeRatio', {
                      ratio: votes.ratio,
                      total: fmt(votes.total),
                  })
                : ts('gameSortStat.noVotes');
    } else if (sort === 'likes') {
        line.textContent = ts('gameSortStat.likes', {
            count: fmt(votes?.upVotes),
        });
    } else if (sort === 'dislikes') {
        line.textContent = ts('gameSortStat.dislikes', {
            count: fmt(votes?.downVotes),
        });
    } else if (sort === 'players') {
        line.textContent = ts('gameSortStat.players', {
            count: fmt(stats?.players?.get(gameId)),
        });
    } else {
        return null;
    }
    return line;
}

export function addSortStatToCard(card, sort, gameId, stats) {
    const line = createSortStatLine(sort, gameId, stats);
    if (!line) return card;
    (card.querySelector('.game-card-link') || card).appendChild(line);
    return card;
}
