import { observeElement } from '../../core/observer.js';
import { t, ts } from '../../core/locale/i18n.js';

const STATS_CLASS = 'rovalra-2016-card-stats';
const SEGMENTS = 4;

const CLASSIC_CARD = '.game-card-container, .rovalra-game-card';
const CLASSIC_STATS_ROW = `:is(${CLASSIC_CARD}) .game-card-info`;
const CLASSIC_LABEL_SELECTOR = `${CLASSIC_STATS_ROW} :is(.vote-percentage-label, .playing-counts-label)`;
const SDUI_STATS_ROW = '[data-testid="sdui-tile-footer-content"]';
const SDUI_LABEL_SELECTOR = `.sdui-game-tile ${SDUI_STATS_ROW} :is(.icon-rating-16x16, .icon-current-players-16x16)`;
const EVENT_LINK_SELECTOR = 'a[href*="/events/"]';

let observers = [];
let enabled = false;

function element(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text) node.textContent = text;
    return node;
}

function toPercent(text) {
    const percent = Number.parseFloat(text);
    return Number.isFinite(percent)
        ? Math.min(100, Math.max(0, percent))
        : null;
}

function readClassicStats(info) {
    return {
        percent: toPercent(
            info.querySelector('.vote-percentage-label')?.textContent,
        ),
        playing:
            info.querySelector('.playing-counts-label')?.textContent?.trim() ||
            null,
    };
}

function readSduiStat(footer, iconClass) {
    return footer
        .querySelector(`.${iconClass}`)
        ?.parentElement?.querySelector('[data-sdui-text]')
        ?.textContent?.trim();
}

function readSduiStats(footer) {
    return {
        percent: toPercent(readSduiStat(footer, 'icon-rating-16x16')),
        playing: readSduiStat(footer, 'icon-current-players-16x16') || null,
    };
}

function buildVoteBar(percent) {
    const bar = element('div', 'rovalra-2016-vote-bar');

    const up = element('div', 'rovalra-2016-vote-thumbs-up');
    up.append(element('span', 'rovalra-2016-icon-thumbs-up'));

    const container = element('div', 'rovalra-2016-vote-container');
    const background = element('div', 'rovalra-2016-vote-background');
    if (percent === null) background.classList.add('no-votes');
    const fill = element('div', 'rovalra-2016-vote-percentage');
    fill.style.width = `${percent ?? 0}%`;
    const mask = element('div', 'rovalra-2016-vote-mask');
    for (let i = 1; i <= SEGMENTS; i++) {
        mask.append(element('div', `rovalra-2016-vote-segment seg-${i}`));
    }
    container.append(background, fill, mask);

    const down = element('div', 'rovalra-2016-vote-thumbs-down');
    down.append(element('span', 'rovalra-2016-icon-thumbs-down'));

    bar.append(up, container, down);
    return bar;
}

function buildStats({ percent, playing }, isEvent) {
    const stats = element('div', STATS_CLASS);
    if (playing) {
        stats.append(
            element(
                'div',
                'rovalra-2016-card-playing',
                ts(
                    isEvent
                        ? 'roblox2016Theme.attending'
                        : 'roblox2016Theme.playing',
                    { count: playing },
                ),
            ),
        );
    }
    if (!isEvent) stats.append(buildVoteBar(percent));
    return stats;
}

function addStats(label, rowSelector, readStats, cardSelector) {
    const row = label.closest(rowSelector);
    const card = row?.closest(cardSelector);
    if (!card || card.querySelector(`.${STATS_CLASS}`)) return;
    const isEvent = Boolean(card.querySelector(EVENT_LINK_SELECTOR));
    row.after(buildStats(readStats(row), isEvent));
}

export async function enableGameCards() {
    if (enabled) return;
    enabled = true;
    await t('roblox2016Theme.playing');
    if (!enabled || observers.length) return;
    observers = [
        observeElement(
            CLASSIC_LABEL_SELECTOR,
            (label) =>
                addStats(
                    label,
                    CLASSIC_STATS_ROW,
                    readClassicStats,
                    CLASSIC_CARD,
                ),
            { multiple: true },
        ),
        observeElement(
            SDUI_LABEL_SELECTOR,
            (icon) =>
                addStats(
                    icon,
                    SDUI_STATS_ROW,
                    readSduiStats,
                    '.sdui-game-tile',
                ),
            { multiple: true },
        ),
    ];
}

export function disableGameCards() {
    enabled = false;
    observers.forEach((observer) => observer.disconnect());
    observers = [];
    document
        .querySelectorAll(`.${STATS_CLASS}`)
        .forEach((stats) => stats.remove());
}
