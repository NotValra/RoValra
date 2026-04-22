import { callRobloxApi } from '../../../core/api.js';
import { observeElement } from '../../../core/observer.js';
import {
    fetchThumbnails,
    createThumbnailElement,
} from '../../../core/thumbnail/thumbnails.js';
import { createPillToggle } from '../../../core/ui/general/pillToggle.js';
import { getPlaceIdFromUrl } from '../../../core/idExtractor.js';
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

function createEventCard(
    event,
    isPast = false,
    thumbnailData = null,
    overridePillText = null,
    rsvpCount = null,
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
        ? new Date(event.eventTime.endUtc).toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
          })
        : category;

    const buttonText = isPast
        ? 'View Event'
        : event.userRsvpStatus === 'going'
          ? 'Unfollow Event'
          : 'Notify Me';

    const rsvpCountHtml =
        typeof rsvpCount === 'number'
            ? `
        <span class="info-label icon-playing-counts-gray"></span>
        <span class="info-label playing-counts-label">${rsvpCount.toLocaleString()}</span>
    `
            : '';

    const innerHtml = `
    <div class="featured-game-container game-card-container">
        <a class="game-card-link" href="https://www.roblox.com/events/${event.id}" tabindex="0">
            <div class="featured-game-icon-container">
                <div class="thumbnail-placeholder"></div>
                <div class="game-card-text-pill">
                    <div class="game-card-info">${overridePillText || defaultPillText}</div>
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
    if (playButton && !isPast) {
        playButton.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();

            const span = playButton.querySelector('span');
            const isGoing = span.textContent === 'Leave Event';
            const nextStatus = isGoing ? 'notGoing' : 'going';
            const nextText = isGoing ? 'Join Event' : 'Leave Event';

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
                        counterEl.textContent.replace(/,/g, ''),
                        10,
                    );
                    if (!isNaN(currentCount)) {
                        const newCount = isGoing
                            ? currentCount - 1
                            : currentCount + 1;
                        const finalCount = Math.max(0, newCount);
                        counterEl.textContent = finalCount.toLocaleString();
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
        const thumbEl = createThumbnailElement(thumbData, event.title, '', {
            width: '100%',
            height: '100%',
            borderRadius: '8px 8px 0 0',
        });
        thumbEl.classList.add('brief-game-icon');
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

    let activeEvents = [];

    const headerContainer = eventsContainer.querySelector('.container-header');
    const gridContainer = eventsContainer.querySelector(
        '.game-details-page-events-grid',
    );

    if (!headerContainer || !gridContainer) return;

    const originalEvents = Array.from(gridContainer.children);
    const originalPillTexts = new Map();

    originalEvents.forEach((el) => {
        if (el.id) {
            const info = el.querySelector('.game-card-info');
            if (info)
                originalPillTexts.set(String(el.id), info.textContent.trim());
        }
    });

    const renderEvents = async (
        events,
        isPast = false,
        initialLoad = false,
    ) => {
        gridContainer.innerHTML = '';
        if (events.length === 0) {
            const noEventsMessage = isPast
                ? 'No past events.'
                : 'No ongoing or upcoming events.';
            gridContainer.innerHTML = DOMPurify.sanitize(
                `<div class="section-content-off" style="padding: 10px; text-align: center; width: 100%;">${noEventsMessage}</div>`,
            );
            return;
        }

        const apiEvents = events.filter((e) => !(e instanceof HTMLElement));
        const thumbIdsToFetch = apiEvents
            .map((e) => e.thumbnails?.[0]?.mediaId)
            .filter(
                (id) =>
                    id && !isNaN(id) && !eventThumbnailCache.has(Number(id)),
            );

        const rsvpIdsToFetch = apiEvents
            .map((e) => e.id)
            .filter((id) => id && !eventRsvpCache.has(id));

        const promises = [];
        if (rsvpIdsToFetch.length > 0) {
            rsvpIdsToFetch.forEach((id) => {
                promises.push(
                    fetchEventRsvps(id).then((count) => {
                        if (count !== null) eventRsvpCache.set(id, count);
                    }),
                );
            });
        }

        if (thumbIdsToFetch.length > 0) {
            promises.push(
                (async () => {
                    try {
                        const fetchedMap = await fetchThumbnails(
                            thumbIdsToFetch.map((id) => ({ id })),
                            'Asset',
                            '420x420',
                        );
                        fetchedMap.forEach((data, id) => {
                            eventThumbnailCache.set(id, data);
                        });
                    } catch (e) {
                        console.warn(
                            'RoValra: Failed to fetch event thumbnails',
                            e,
                        );
                    }
                })(),
            );
        }

        if (promises.length > 0) {
            await Promise.all(promises);
        }

        events.forEach((event) => {
            if (event instanceof HTMLElement) {
                gridContainer.appendChild(event);
            } else {
                const mediaId = event.thumbnails?.[0]?.mediaId;
                const thumbData = mediaId
                    ? eventThumbnailCache.get(Number(mediaId))
                    : null;
                const overrideText = originalPillTexts.get(String(event.id));
                const rsvpCount = eventRsvpCache.get(event.id);
                const card = createEventCard(
                    event,
                    isPast,
                    thumbData,
                    overrideText,
                    rsvpCount,
                );
                gridContainer.appendChild(card);
            }
        });
    };

    const [fetchedActiveEvents, fetchedPastEvents] = await Promise.all([
        fetchActiveEvents(universeId),
        fetchPastEvents(universeId),
    ]);

    activeEvents = fetchedActiveEvents;
    let pastEvents = fetchedPastEvents;

    let initialTab = 'active';
    let eventsToRenderInitially = activeEvents;
    let isPastInitially = false;

    if (activeEvents.length === 0 && pastEvents.length === 0) {
        gridContainer.innerHTML =
            '<div class="section-content-off" style="padding: 10px; text-align: center; width: 100%;">No events found.</div>';
        return;
    }

    const toggle = createPillToggle({
        options: [
            { text: 'Upcoming', value: 'active' },
            { text: 'Past', value: 'past' },
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
    title.textContent = 'Events';

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

        observeElement('#tab-events', () => {
            document
                .querySelectorAll('.virtual-event-game-details-container')
                .forEach((el) => el.remove());
        });

        if (document.getElementById('tab-events')) return;

        observeElement(
            '.virtual-event-game-details-container',
            (eventsContainer) => {
                if (document.getElementById('tab-events')) {
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

        observeElement(
            '#game-details-about-tab-container',
            (tabContainer) => {
                if (tabContainer.dataset.rovalraEventsObserved === 'true')
                    return;
                tabContainer.dataset.rovalraEventsObserved = 'true';

                if (document.getElementById('tab-events')) return;

                const placeId = getPlaceIdFromUrl();
                if (!placeId) return;

                setTimeout(
                    () => checkAndInjectEvents(tabContainer, placeId),
                    500,
                );
            },
            { multiple: true },
        );
    });
}
