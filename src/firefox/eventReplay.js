// Firefox only, MAIN world. Added to the Firefox build by scripts/build-firefox.js and
// runs before intercept.js.
//
// Firefox starts content scripts later than Chrome, so events that MAIN world scripts
// dispatch early (e.g. rovalra-profile-platform-response) can fire before the content
// script has added its listener. This remembers the recent rovalra events of each type
// so src/content/core/firefoxCompat.js can hand them to listeners that were added late.
(() => {
    const REPLAY_PREFIX = 'rovalra-firefox-replay';
    const MAX_EVENTS_PER_TYPE = 10;
    const isReplayableType = (type) =>
        typeof type === 'string' &&
        /^rovalra[-:_]/i.test(type) &&
        !type.startsWith(REPLAY_PREFIX);

    const recentEvents = new Map();
    const nativeDocumentDispatch = document.dispatchEvent.bind(document);

    [
        ['window', window],
        ['document', document],
    ].forEach(([targetName, target]) => {
        const nativeDispatch = target.dispatchEvent;
        target.dispatchEvent = function dispatchEvent(event) {
            if (event && isReplayableType(event.type) && 'detail' in event) {
                const key = `${targetName}|${event.type}`;
                const events = recentEvents.get(key) || [];
                events.push({ detail: event.detail, href: location.href });
                if (events.length > MAX_EVENTS_PER_TYPE) events.shift();
                recentEvents.set(key, events);
            }
            return nativeDispatch.call(this, event);
        };
    });

    document.addEventListener(`${REPLAY_PREFIX}-request`, (event) => {
        const { type, target } = event.detail || {};
        const details = (recentEvents.get(`${target}|${type}`) || [])
            .filter((entry) => entry.href === location.href)
            .map((entry) => entry.detail);
        nativeDocumentDispatch(
            new CustomEvent(`${REPLAY_PREFIX}-response`, {
                detail: { details },
            }),
        );
    });
})();
