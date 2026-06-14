import { callRobloxApi } from '../../../core/api.js';
import { observeElement } from '../../../core/observer.js';
import {
    fetchThumbnails,
    createThumbnailElement,
    getQueuedThumbnail,
} from '../../../core/thumbnail/thumbnails.js';
import { createPillToggle } from '../../../core/ui/general/pillToggle.js';
import { getPlaceIdFromUrl } from '../../../core/idExtractor.js';
import { launchGame } from '../../../core/utils/launcher.js';
import { ts } from '../../../core/locale/i18n.js';
import DOMPurify from '../../../core/packages/dompurify.js';

const eventThumbnailCache = new Map();
const eventRsvpCache = new Map();
const injectionLocks = new Set();

async function fetchUniverseId(placeId) {
    const metaData = document.getElementById('game-detail-meta-data');
    if (metaData && metaData.dataset.universeId) {
        return metaData.dataset.universeId;
    }

    try {
        const response = await callRobloxApi({
            subdomain: 'games',
            endpoint: `/v1/games/multiget-place-details?placeIds=${placeId}`,
            method: 'GET',
        });

        if (!response.ok) throw new Error('Failed to fetch universe ID');
        const data = await response.json();
        return data?.[0]?.universeId;
    } catch (error) {
        console.error('RoValra: Error fetching universe ID', error);
        return null;
    }
}

async function fetchActiveEvents(universeId) {
    const now = new Date().toISOString();
    try {
        const response = await callRobloxApi({
            subdomain: 'apis',
            endpoint: `/virtual-events/v1/universes/${universeId}/virtual-events?fromUtc=${encodeURIComponent(now)}`,
            method: 'GET',
        });

        if (!response.ok) throw new Error('Failed to fetch active events');
        const data = await response.json();
        return data?.data || [];
    } catch (error) {
        console.error('RoValra: Error fetching active events', error);
        return [];
    }
}

async function fetchPastEvents(universeId) {
    const now = new Date().toISOString();
    try {
        const response = await callRobloxApi({
            subdomain: 'apis',
            endpoint: `/virtual-events/v2/universes/${universeId}/experience-events?endsBefore=${encodeURIComponent(now)}&visibility=public&limit=40`,
            method: 'GET',
        });

        if (!response.ok) throw new Error('Failed to fetch past events');
        const data = await response.json();
        return data?.data || [];
    } catch (error) {
        console.error('RoValra: Error fetching past events', error);
        return [];
    }
}

async function fetchEventRsvps(eventId) {
    try {
        const response = await callRobloxApi({
            subdomain: 'apis',
            endpoint: `/virtual-events/v1/virtual-events/${eventId}/rsvps/counters`,
            method: 'GET',
        });

        if (!response.ok) throw new Error('Failed to fetch RSVPs');
        const data = await response.json();
        return data?.counters?.going || 0;
    } catch (error) {
        console.error('RoValra: Error fetching event RSVPs', error);
        return null;
    }
}

async function updateEventRsvp(eventId, rsvpStatus) {
    try {
        const response = await callRobloxApi({
            subdomain: 'apis',
            endpoint: `/virtual-events/v1/virtual-events/${eventId}/rsvps`,
            method: 'POST',
            body: { rsvpStatus },
        });

        return response.ok;
    } catch (error) {
        console.error('RoValra: Error updating event RSVP', error);
        return false;
    }
}

function formatCategoryString(category) {
    if (!category) return '';
    return category
        .replace(/([A-Z])/g, ' $1')
        .trim()
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

function isEventOngoing(event, now = new Date()) {
    const start = event.eventTime?.startUtc
        ? new Date(event.eventTime.startUtc)
        : null;
    const end = event.eventTime?.endUtc ? new Date(event.eventTime.endUtc) : null;

    return Boolean(start && start <= now && (!end || end > now));
}

function updateRsvpCountLabel(counterEl, count) {
    const formattedCount = count.toLocaleString();
    const textNode = Array.from(counterEl.childNodes).find(
        (node) =>
            node.nodeType === Node.TEXT_NODE &&
            node.textContent.trim().length > 0,
    );

    if (textNode) {
        textNode.textContent = formattedCount;
    } else if (counterEl.querySelector('.rovalra-modern-icon')) {
        counterEl.appendChild(document.createTextNode(formattedCount));
    } else {
        counterEl.textContent = formattedCount;
    }
}

function createEventCard(
    event,
    isPast = false,
    thumbnailData = null,
    overridePillText = null,
    rsvpCount = null,
    fallbackPlaceId = null,
) {
    const li = document.createElement('li');
    li.className =
        'list-item hover-game-tile experience-events-tile image-overlay contained-tile';
    Object.assign(li.style, {
        maxHeight: '272px',
        maxWidth: '312px',
        width: '100%',
    });
    li.dataset.testid = 'wide-game-tile';
    li.id = event.id;

    const category = event.eventCategories?.[0]?.category || 'newContent';
    const thumbnailId = event.thumbnails?.[0]?.mediaId;

    const thumbData =
        thumbnailData ||
        (thumbnailId
            ? {
                  state: 'Completed',
                  imageUrl: `https://tr.rbxcdn.com/${thumbnailId}/384/216/Image/Jpeg/noFilter`,
              }
            : { state: 'Blocked', imageUrl: '' });

    const defaultPillText = isPast
        ? new Date(event.eventTime.endUtc).toLocaleDateString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
          })
        : category;

    const isOngoing = !isPast && isEventOngoing(event);
    const eventUrl = `https://www.roblox.com/events/${event.id}`;
    const launchPlaceId = event.placeId || event.rootPlaceId || fallbackPlaceId;

    const buttonText = isPast
        ? ts('events.buttons.viewEvent')
        : isOngoing
          ? ts('events.buttons.joinEvent')
        : event.userRsvpStatus === 'going'
          ? ts('events.buttons.unfollowEvent')
          : ts('events.buttons.notifyMe');

    const rsvpCountHtml =
        typeof rsvpCount === 'number'
            ? `
        <span class="info-label icon-playing-counts-gray"></span>
        <span class="info-label playing-counts-label">${rsvpCount.toLocaleString()}</span>
    `
            : '<span class="rovalra-rsvp-container"></span>';

    const innerHtml = `
    <div class="featured-game-container game-card-container">
        <a class="game-card-link" href="${eventUrl}" tabindex="0">
            <div class="featured-game-icon-container" style="height: 175px; min-height: 175px; max-height: 175px; overflow: hidden; border-radius: 8px 8px 0 0;">
                <div class="thumbnail-placeholder"></div>
                <div class="game-card-text-pill">
                    <div class="game-card-info">${overridePillText || formatCategoryString(defaultPillText)}</div>
                </div>
            </div>
            <div class="info-container">
                <div class="info-metadata-container">
                    <div class="game-card-name game-name-title" data-testid="game-tile-game-title" title="${event.title}">${event.title}</div>
                    <div class="wide-game-tile-metadata">
                        <div class="base-metadata">
                            <div class="game-card-info" data-testid="game-tile-stats-text-footer" style="display: flex; gap: 4px; overflow: hidden; align-items: center;">
                                <span class="info-label text-overflow" style="flex: 1; min-width: 0;">${event.subtitle || event.description || ''}</span>
                                ${rsvpCountHtml}
                            </div>
                            <button type="button" class="btn-growth-xs play-button wide-event-play-button" aria-label="${buttonText}">
                                <span>${buttonText}</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </a>
        <div class="sg-system-feedback">
            <div class="alert-system-feedback">
                <div class="alert">
                    <span class="alert-content"></span>
                </div>
            </div>
        </div>
    </div>
    `;
    li.innerHTML = DOMPurify.sanitize(innerHtml);

    const playButton = li.querySelector('.wide-event-play-button');
    if (playButton && isOngoing) {
        playButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (launchPlaceId) {
                launchGame(launchPlaceId);
            } else {
                window.location.href = eventUrl;
            }
        });
    } else if (playButton && !isPast) {
        playButton.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();

            const span = playButton.querySelector('span');
            const isGoing = event.userRsvpStatus === 'going';
            const nextStatus = isGoing ? 'notGoing' : 'going';
            const nextText = isGoing
                ? ts('events.buttons.notifyMe')
                : ts('events.buttons.unfollowEvent');

            playButton.disabled = true;
            playButton.style.opacity = '0.5';

            const success = await updateEventRsvp(event.id, nextStatus);
            if (success) {
                span.textContent = nextText;
                playButton.setAttribute('aria-label', nextText);
                event.userRsvpStatus = nextStatus;

                const counterEl = li.querySelector('.playing-counts-label');
                if (counterEl) {
                    let currentCount = parseInt(
                        counterEl.textContent.replace(/[^\d]/g, ''),
                        10,
                    );
                    if (!isNaN(currentCount)) {
                        const newCount = isGoing
                            ? currentCount - 1
                            : currentCount + 1;
                        const finalCount = Math.max(0, newCount);
                        updateRsvpCountLabel(counterEl, finalCount);
                        eventRsvpCache.set(event.id, finalCount);
                    }
                }
            }

            playButton.disabled = false;
            playButton.style.opacity = '1';
        });
    }

    const placeholder = li.querySelector('.thumbnail-placeholder');
    if (placeholder) {
        const thumbEl = createThumbnailElement(
            thumbData,
            event.title,
            'brief-game-icon',
            {
                width: '100%',
                height: '100%',
                borderRadius: '8px 8px 0 0',
                objectFit: 'cover',
            },
        );
        placeholder.replaceWith(thumbEl);
    }

    return li;
}

export async function loadAndRenderEvents(eventsContainer, placeId) {
    if (eventsContainer.dataset.rovalraEventsLoaded === 'true') return;
    if (document.getElementById('tab-events')) return;
    eventsContainer.dataset.rovalraEventsLoaded = 'true';

    const universeId = await fetchUniverseId(placeId);
    if (!universeId) return;

    const now = new Date();

    const headerContainer = eventsContainer.querySelector('.container-header');
    const gridContainer = eventsContainer.querySelector(
        '.game-details-page-events-grid',
    );

    let renderIteration = 0;

    const renderEvents = async (
        events,
        isPast = false,
        initialLoad = false,
    ) => {
        const thisIteration = ++renderIteration;
        gridContainer.innerHTML = '';
        if (events.length === 0) {
            const noEventsMessage = isPast
                ? ts('events.empty.past')
                : ts('events.empty.active');
            gridContainer.innerHTML = DOMPurify.sanitize(
                `<div class="section-content-off" style="padding: 10px; text-align: center; width: 100%;">${noEventsMessage}</div>`,
            );
            return;
        }

        events.forEach((event) => {
            if (event instanceof HTMLElement) {
                gridContainer.appendChild(event);
            } else {
                const mediaId = event.thumbnails?.[0]?.mediaId;
                const thumbId = mediaId || event.placeId;
                const thumbType = mediaId ? 'Asset' : 'GameThumbnail';
                const thumbSize = mediaId ? '420x420' : '768x432';
                const cacheKey = mediaId
                    ? Number(mediaId)
                    : `game_${event.placeId}`;

                let thumbData = eventThumbnailCache.get(cacheKey);

                if (!thumbData) {
                    thumbData = {
                        state: 'Pending',
                        finalUpdate: getQueuedThumbnail(
                            thumbId,
                            thumbType,
                            thumbSize,
                        ).then((data) => {
                            if (data) eventThumbnailCache.set(cacheKey, data);
                            return data;
                        }),
                    };
                }

                const rsvpCount = eventRsvpCache.get(event.id);

                const hasEnded =
                    event.eventTime?.endUtc &&
                    new Date(event.eventTime.endUtc) <= now;
                const resolvedIsPast = isPast || hasEnded;

                const card = createEventCard(
                    event,
                    resolvedIsPast,
                    thumbData,
                    null,
                    rsvpCount,
                    placeId,
                );

                if (rsvpCount === undefined && event.id) {
                    fetchEventRsvps(event.id).then((count) => {
                        if (thisIteration !== renderIteration) return;
                        if (count !== null) {
                            eventRsvpCache.set(event.id, count);
                            const container = card.querySelector(
                                '.rovalra-rsvp-container',
                            );
                            if (container) {
                                container.innerHTML = DOMPurify.sanitize(`
                                    <span class="info-label icon-playing-counts-gray"></span>
                                    <span class="info-label playing-counts-label">${count.toLocaleString()}</span>
                                `);
                            }
                        }
                    });
                }

                gridContainer.appendChild(card);
            }
        });
    };

    const [fetchedActiveEvents, fetchedPastEvents] = await Promise.all([
        fetchActiveEvents(universeId),
        fetchPastEvents(universeId),
    ]);

    let activeEvents = fetchedActiveEvents.filter((e) => {
        const end = e.eventTime?.endUtc ? new Date(e.eventTime.endUtc) : null;
        return !end || end > now;
    });

    let pastEvents = [...fetchedPastEvents];

    fetchedActiveEvents.forEach((e) => {
        const end = e.eventTime?.endUtc ? new Date(e.eventTime.endUtc) : null;
        if (end && end <= now) {
            if (!pastEvents.some((pe) => pe.id === e.id)) {
                pastEvents.unshift(e);
            }
        }
    });

    pastEvents.sort((a, b) => {
        const tA = a.eventTime?.endUtc
            ? new Date(a.eventTime.endUtc).getTime()
            : 0;
        const tB = b.eventTime?.endUtc
            ? new Date(b.eventTime.endUtc).getTime()
            : 0;
        return tB - tA;
    });

    let initialTab = 'active';
    let eventsToRenderInitially = activeEvents;
    let isPastInitially = false;

    if (activeEvents.length === 0 && pastEvents.length === 0) {
        gridContainer.innerHTML =
            DOMPurify.sanitize(
                `<div class="section-content-off" style="padding: 10px; text-align: center; width: 100%;">${ts('events.empty.all')}</div>`,
            );
        return;
    }

    const toggle = createPillToggle({
        options: [
            { text: ts('events.tabs.upcoming'), value: 'active' },
            { text: ts('events.tabs.past'), value: 'past' },
        ],
        initialValue: initialTab,
        onChange: async (value) => {
            if (value === 'active') {
                await renderEvents(activeEvents, false);
            } else {
                await renderEvents(pastEvents, true);
            }
        },
    });

    headerContainer.innerHTML = '';
    const headerWrapper = document.createElement('div');
    headerWrapper.style.display = 'flex';
    headerWrapper.style.justifyContent = 'space-between';
    headerWrapper.style.alignItems = 'center';

    const title = document.createElement('h3');
    title.textContent = ts('events.title');

    headerWrapper.appendChild(title);
    headerWrapper.appendChild(toggle);
    headerContainer.appendChild(headerWrapper);

    await renderEvents(eventsToRenderInitially, isPastInitially, true);
}

export async function checkAndInjectEvents(tabContainer, placeId) {
    if (injectionLocks.has(placeId)) return;

    const target =
        tabContainer.querySelector('.game-about-tab-container') || tabContainer;

    if (target.querySelector('.virtual-event-game-details-container')) return;
    if (document.querySelector('.virtual-event-game-details-container')) return;
    if (document.getElementById('tab-events')) return;

    injectionLocks.add(placeId);

    try {
        const universeId = await fetchUniverseId(placeId);
        if (!universeId) return;

        const [active, past] = await Promise.all([
            fetchActiveEvents(universeId),
            fetchPastEvents(universeId),
        ]);

        if (active.length === 0 && past.length === 0) return;

        if (document.querySelector('.virtual-event-game-details-container'))
            return;
        if (target.querySelector('.virtual-event-game-details-container'))
            return;
        if (document.getElementById('tab-events')) return;

        const eventsContainer = document.createElement('div');
        eventsContainer.className = 'virtual-event-game-details-container';
        eventsContainer.innerHTML = `
            <div class="container-header"></div>
            <div class="stack">
                <ul class="game-grid wide-game-tile-game-grid game-details-page-events-grid" style="display: flex; flex-wrap: wrap; gap: 12px; --items-per-row: 3;"></ul>
            </div>
        `;

        target.prepend(eventsContainer);
    } finally {
        injectionLocks.delete(placeId);
    }
}

let hasLoaded = false;

export function init() {
    if (hasLoaded) return;
    hasLoaded = true;

    chrome.storage.local.get({ EnableImprovedEvents: true }, (settings) => {
        if (!settings.EnableImprovedEvents) return;

        if (document.getElementById('tab-events')) return;

        const activeRequests = [];

        const deactivateAll = () => {
            activeRequests.forEach((req) => {
                req.active = false;
            });
            activeRequests.length = 0;
        };

        const req1 = observeElement('#tab-events', () => {
            deactivateAll();
            document
                .querySelectorAll('.virtual-event-game-details-container')
                .forEach((el) => el.remove());
        });
        activeRequests.push(req1);

        const req2 = observeElement(
            '.virtual-event-game-details-container',
            (eventsContainer) => {
                if (document.getElementById('tab-events')) {
                    deactivateAll();
                    eventsContainer.remove();
                    return;
                }

                const activeContainer = document.querySelector(
                    '.virtual-event-game-details-container[data-rovalra-events-loaded="true"]',
                );
                if (activeContainer && activeContainer !== eventsContainer) {
                    eventsContainer.remove();
                    return;
                }

                const placeId = getPlaceIdFromUrl();
                if (!placeId) return;

                loadAndRenderEvents(eventsContainer, placeId);
            },
            { multiple: true },
        );
        activeRequests.push(req2);

        const req3 = observeElement(
            '#game-details-about-tab-container',
            (tabContainer) => {
                if (document.getElementById('tab-events')) {
                    deactivateAll();
                    return;
                }

                if (tabContainer.dataset.rovalraEventsObserved === 'true')
                    return;
                tabContainer.dataset.rovalraEventsObserved = 'true';

                const placeId = getPlaceIdFromUrl();
                if (!placeId) return;

                setTimeout(
                    () => checkAndInjectEvents(tabContainer, placeId),
                    500,
                );
            },
            { multiple: true },
        );
        activeRequests.push(req3);
    });
}
