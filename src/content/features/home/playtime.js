import { callRobloxApiJson } from '../../core/api.js';
import {
    getPlaceDetails,
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

function formatPlaytime(seconds) {
    if (seconds >= 3600) {
        const hours = seconds / 3600;
        const value = hours >= 10 ? Math.round(hours) : hours.toFixed(1);
        return ts('playtime.hours', { value });
    }
    return ts('playtime.minutes', { value: Math.max(1, Math.round(seconds / 60)) });
}

async function publish() {
    const topic = await t('playtime.topic');
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
    const places = await Promise.all(
        entries.map(async (entry) => ({
            entry,
            detail: await getPlaceDetails(entry.placeId),
        })),
    );
    if (version !== generation) return;
    const universeIds = [
        ...new Set(
            places
                .map(({ detail }) => Number(detail?.universeId))
                .filter(Boolean),
        ),
    ];
    const [details, votes] = await Promise.all([
        getUniversesDetails(universeIds),
        getUniversesVotes(universeIds),
    ]);
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
}

function addDropdown() {
    for (const wrapper of document.querySelectorAll(
        '#HomeContainer .game-sort-carousel-wrapper',
    )) {
        if (
            !wrapper.querySelector(
                `a.game-card-link[href*="sortSubId=${SUB_ID}"]`,
            )
        ) continue;
        const row = wrapper.querySelector(
            '.home-sort-header-container [data-testid="text-icon-row"]',
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
        PERIOD_KEYS.map(async ([value, key]) => ({ value, label: await t(key) })),
    );
    periodAriaLabel = await t('playtime.period');
    observeElement(
        '#HomeContainer .home-sort-header-container, #HomeContainer .game-sort-header-container, #HomeContainer .container-header',
        addDropdown,
        { multiple: true },
    );
    observeElement(
        `#HomeContainer a.game-card-link[href*="sortSubId=${SUB_ID}"]`,
        decorateCards,
        { multiple: true },
    );
    await load().catch((error) =>
        console.warn('RoValra: Failed to load playtime', error),
    );
}
