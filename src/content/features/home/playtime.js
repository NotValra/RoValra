import { callRobloxApiJson } from '../../core/api.js';
import {
    getUniverseIdFromPlaceId,
    getUniversesDetails,
    getUniversesVotes,
} from '../../core/apis/games.js';
import { observeElement } from '../../core/observer.js';
import { createDropdown } from '../../core/ui/dropdown.js';
import { Icon } from '../../core/ui/buildericon.js';
import { t, ts } from '../../core/locale/i18n.js';
import { settings } from '../../core/settings/getSettings.js';

const TOPIC_ID = 10000013061;
const SUB_ID = 'rovalra-playtime';
const SDUI_ROW_CLASS = 'rovalra-sdui-extra-row';
const PERIOD_KEYS = [
    ['day', 'playtime.today'],
    ['week', 'playtime.thisWeek'],
    ['month', 'playtime.thisMonth'],
    ['year', 'playtime.thisYear'],
    ['all_time', 'playtime.allTime'],
];
let initialized = false;
let period = 'all_time';
let periods = [];
let periodAriaLabel = '';
let generation = 0;
let playtimes = new Map();
let games = [];

function chunk(values, size = 50) {
    const chunks = [];
    for (let i = 0; i < values.length; i += size) {
        chunks.push(values.slice(i, i + size));
    }
    return chunks;
}

function formatPlaytime(seconds) {
    if (seconds >= 3600) {
        const hours = seconds / 3600;
        const value = hours >= 10 ? Math.round(hours) : hours.toFixed(1);
        return ts('playtime.hours', { value });
    }
    return ts('playtime.minutes', {
        value: Math.max(1, Math.round(seconds / 60)),
    });
}

async function publish() {
    const topic = await t('playtime.topic');
    const emptyTitle = await t('playtime.previewOwnTitle');
    document.dispatchEvent(
        new CustomEvent('rovalra-home-extra-sorts', {
            detail: {
                source: SUB_ID,
                sorts: [
                    {
                        topic,
                        topicId: TOPIC_ID,
                        subId: SUB_ID,
                        treatmentType: 'Carousel',
                        numberOfRows: 1,
                        topicLayoutData: { hideSeeAll: 'true', linkPath: '' },
                        rovalraKeepEmpty: true,
                        rovalraPlaceholder: { title: emptyTitle },
                        games,
                        recommendationList: games.map((game) => ({
                            contentType: 'Game',
                            contentId: game.universeId,
                            contentStringId: '',
                            contentMetadata: {},
                            analyticsData: {},
                        })),
                        nextPageTokenForTopic: null,
                        analyticsData: {},
                    },
                ],
            },
        }),
    );
}

async function load() {
    const version = ++generation;
    const result = await callRobloxApiJson({
        subdomain: 'apis',
        isRovalraApi: true,
        endpoint: `/v1/playtime?period=${encodeURIComponent(period)}`,
    });
    if (version !== generation) return;
    const entries = (
        result?.status === 'success' ? result.playtime : []
    ).filter((entry) => Number(entry.placeId) > 0 && Number(entry.seconds) > 0);
    playtimes = new Map(
        entries.map((entry) => [String(entry.placeId), Number(entry.seconds)]),
    );
    const universeIdByPlaceId = new Map();
    const placeIds = [
        ...new Set(entries.map((entry) => String(entry.placeId))),
    ];
    for (const ids of chunk(placeIds, 10)) {
        await Promise.all(
            ids.map(async (placeId) => {
                const universeId = await getUniverseIdFromPlaceId(placeId);
                if (universeId) universeIdByPlaceId.set(placeId, universeId);
            }),
        );
        if (version !== generation) return;
    }
    const places = entries.map((entry) => ({
        entry,
        detail: {
            universeId: universeIdByPlaceId.get(String(entry.placeId)),
        },
    }));
    const universeIds = [
        ...new Set(
            places
                .map(({ detail }) => Number(detail?.universeId))
                .filter(Boolean),
        ),
    ];
    const universeChunks = chunk(universeIds);
    const [details, votes] = await Promise.all([
        Promise.all(universeChunks.map(getUniversesDetails)).then((r) =>
            r.flat(),
        ),
        Promise.all(universeChunks.map(getUniversesVotes)).then((r) =>
            r.flat(),
        ),
    ]);
    if (version !== generation) return;
    const votesById = new Map(
        votes.map((vote) => [Number(vote.universeId), vote]),
    );
    const detailById = new Map(details.map((game) => [Number(game.id), game]));
    games = places
        .flatMap(({ entry, detail }) => {
            const universeId = Number(detail?.universeId);
            const game = detailById.get(universeId);
            if (!game) return [];
            const vote = votesById.get(universeId);
            return [
                {
                    ...game,
                    universeId,
                    playerCount: game.playing,
                    totalUpVotes: vote?.upVotes || 0,
                    totalDownVotes: vote?.downVotes || 0,
                    rovalraPlaytime: Number(entry.seconds),
                },
            ];
        })
        .sort((a, b) => b.rovalraPlaytime - a.rovalraPlaytime);
    await publish();
    decorateCards();
}

function decorateCards() {
    addDropdown();
    document
        .querySelectorAll(
            `#HomeContainer a.game-card-link[href*="sortSubId=${SUB_ID}"]`,
        )
        .forEach((card) => {
            const placeId = card.href.match(/\/games\/(\d+)/)?.[1];
            const seconds = playtimes.get(placeId);
            const row =
                card.querySelector('[data-testid="game-tile-stats"]') ||
                card.querySelector('[data-testid="text-icon-row-text"]')
                    ?.parentElement;
            if (!seconds || !row) return;
            let label = card.querySelector('.rovalra-home-playtime');
            if (!label) {
                label = document.createElement('span');
                label.className = 'info-label rovalra-home-playtime';
                const icon = Icon({
                    icon: 'clock',
                    size: '18px',
                    filled: true,
                });
                icon.style.marginRight = '5px';
                icon.style.marginLeft = '3px';
                label.append(icon);
                const value = document.createElement('span');
                value.className = 'rovalra-home-playtime-value';
                label.append(value);
                row.append(label);
            }
            label.querySelector('.rovalra-home-playtime-value').textContent =
                formatPlaytime(seconds);
        });
    decorateSduiTiles();
}

function decorateSduiTiles() {
    document
        .querySelectorAll(
            `#HomeContainer .${SDUI_ROW_CLASS}[data-rovalra-sort-sub-id="${SUB_ID}"] [data-testid="sdui-game-tile"]`,
        )
        .forEach((tile) => {
            const seconds = games.find(
                (game) =>
                    String(game.universeId) === tile.dataset.rovalraUniverseId,
            )?.rovalraPlaytime;
            const footer = tile.querySelector(
                '[data-testid="tile-footer-right"]',
            );
            const text = footer?.querySelector('[data-sdui-text]');
            if (!seconds || !text) return;
            if (!footer.dataset.rovalraPlaytime) {
                footer.dataset.rovalraPlaytime = 'true';
                const icon = Icon({
                    icon: 'clock',
                    size: '16px',
                    filled: true,
                });
                footer
                    .querySelector('[data-testid="icon-component"]')
                    ?.replaceWith(icon);
            }
            text.textContent = formatPlaytime(seconds);
        });
}

function addDropdown() {
    for (const wrapper of document.querySelectorAll(
        `#HomeContainer .game-sort-carousel-wrapper, #HomeContainer .${SDUI_ROW_CLASS}[data-rovalra-sort-sub-id="${SUB_ID}"]`,
    )) {
        const isSdui = wrapper.classList.contains(SDUI_ROW_CLASS);
        if (
            !isSdui &&
            !wrapper.querySelector(
                `a.game-card-link[href*="sortSubId=${SUB_ID}"]`,
            )
        )
            continue;
        const row = wrapper.querySelector(
            isSdui
                ? '[data-testid="section-header"] [data-testid="text-icon-row"]'
                : '.home-sort-header-container [data-testid="text-icon-row"]',
        );
        if (!row) continue;
        const existing = row.querySelector('.rovalra-playtime-filter');
        if (existing) {
            existing._rovalraSetValue?.(period);
            continue;
        }
        const dropdown = createDropdown({
            items: periods,
            initialValue: period,
            onValueChange: (value) => {
                period = value;
                load().catch(console.warn);
            },
        });
        dropdown.element.classList.add('rovalra-playtime-filter');
        dropdown.element.style.marginLeft = '8px';
        dropdown.element.style.flexShrink = '0';
        dropdown.trigger.setAttribute('aria-label', periodAriaLabel);
        dropdown.element._rovalraSetValue = dropdown.setValue;
        row.append(dropdown.element);
    }
}

export async function init() {
    if (initialized) return;
    initialized = true;
    if ((await settings.homePlaytimeEnabled) !== true) return;
    periods = await Promise.all(
        PERIOD_KEYS.map(async ([value, key]) => ({
            value,
            label: await t(key),
        })),
    );
    periodAriaLabel = await t('playtime.period');
    observeElement(
        `#HomeContainer .home-sort-header-container, #HomeContainer .game-sort-header-container, #HomeContainer .container-header, #HomeContainer .${SDUI_ROW_CLASS} [data-testid="section-header"]`,
        addDropdown,
        { multiple: true },
    );
    observeElement(
        `#HomeContainer a.game-card-link[href*="sortSubId=${SUB_ID}"], #HomeContainer .${SDUI_ROW_CLASS} [data-testid="sdui-game-tile"]`,
        decorateCards,
        { multiple: true },
    );
    await load().catch((error) =>
        console.warn('RoValra: Failed to load playtime', error),
    );
}
