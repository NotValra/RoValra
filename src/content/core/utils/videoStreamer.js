// Turns Robloxs videos into watchable videos!!!
import { callRobloxApi } from '../api.js';

const MIME_TYPE = 'video/webm; codecs="vp9,opus"';
const BUFFER_AHEAD_SECONDS = 30;

export async function streamRobloxVideo(
    requestJson,
    videoElement,
    onProgress = () => {},
    options = {},
) {
    if (!Array.isArray(requestJson) || !requestJson[0]?.location) {
        throw new Error('Invalid video data: Asset is likely not a video.');
    }
    const masterUrl = resolveVideoUrl(requestJson[0].location);
    options.signal?.throwIfAborted();
    const mediaSource = new MediaSource();
    const collectChunks = options.collectChunks !== false;
    const controller = new AbortController();
    const { signal } = controller;
    const stop = () =>
        controller.abort(
            new DOMException('Video stream stopped', 'AbortError'),
        );
    options.signal?.addEventListener('abort', stop, { once: true });
    let objectUrl;
    let revoked = false;
    let timer;
    let sourceBuffer;
    const revoke = () => {
        if (objectUrl && !revoked) {
            URL.revokeObjectURL(objectUrl);
            revoked = true;
        }
    };
    const checkVideo = () => {
        if (
            (!collectChunks && !videoElement.isConnected) ||
            videoElement.src !== objectUrl
        )
            stop();
    };
    const onError = () => controller.abort(new Error('Video playback failed'));
    mediaSource.addEventListener('sourceclose', stop);
    videoElement.addEventListener('error', onError);
    // Cancellable previews must not share an in-flight API request with another hover.
    const requestOptions =
        options.signal || !collectChunks ? { signal, noCache: true } : {};

    try {
        objectUrl = URL.createObjectURL(mediaSource);
        const opening = waitForEvent(mediaSource, 'sourceopen', signal);
        videoElement.src = objectUrl;
        timer = setInterval(checkVideo, 250);
        checkVideo();
        await opening;
        revoke();

        const fetchData = async (url, type) => {
            signal.throwIfAborted();
            const response = await waitFor(
                callRobloxApi({
                    fullUrl: resolveVideoUrl(url),
                    credentials: 'omit',
                    ...requestOptions,
                }),
                signal,
            );
            signal.throwIfAborted();
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return waitFor(response[type](), signal);
        };
        onProgress('Fetching master playlist...');
        const masterText = await fetchData(masterUrl, 'text');
        const variables = getPlaylistVariables(masterText, masterUrl);
        const stream = getBestStream(
            masterText,
            masterUrl,
            variables,
            options.maxHeight,
        );
        if (!stream)
            throw new Error('Could not determine a supported stream URL');
        sourceBuffer = mediaSource.addSourceBuffer(stream.mimeType);
        sourceBuffer.mode = 'sequence';

        onProgress('Fetching segment list...');
        const segmentText = await fetchData(stream.url, 'text');
        const { initUrl, segments } = parseSegmentUrls(
            segmentText,
            stream.url,
            variables,
        );
        if (segments.length === 0) throw new Error('No video segments found');
        const fullFileChunks = [];
        const append = async (chunk) => {
            signal.throwIfAborted();
            await waitForEvent(sourceBuffer, 'updateend', signal, () =>
                sourceBuffer.appendBuffer(chunk),
            );
            if (collectChunks) fullFileChunks.push(chunk);
        };
        if (initUrl) {
            onProgress('Initializing...');
            await append(await fetchData(initUrl, 'arrayBuffer'));
        }
        for (let index = 0; index < segments.length; index++) {
            while (shouldPauseBuffering(videoElement)) {
                signal.throwIfAborted();
                await delay(1000, signal);
            }
            signal.throwIfAborted();
            onProgress(`Buffering ${index + 1}/${segments.length}`);
            let chunk;
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    chunk = await fetchData(segments[index], 'arrayBuffer');
                    break;
                } catch (error) {
                    signal.throwIfAborted();
                    if (attempt === 2) throw error;
                    await delay(1000, signal);
                }
            }
            await append(chunk);
        }
        signal.throwIfAborted();
        mediaSource.endOfStream();
        onProgress('Complete');
        return collectChunks
            ? new Blob(fullFileChunks, { type: stream.mimeType.split(';')[0] })
            : null;
    } finally {
        clearInterval(timer);
        options.signal?.removeEventListener('abort', stop);
        mediaSource.removeEventListener('sourceclose', stop);
        videoElement.removeEventListener('error', onError);
        revoke();
        stop();
        try {
            if (mediaSource.readyState === 'open') {
                if (sourceBuffer?.updating) sourceBuffer.abort();
                mediaSource.endOfStream('network');
            }
        } catch {
            // The video can detach while the source is being closed.
        }
    }
}

function waitFor(promise, signal) {
    return new Promise((resolve, reject) => {
        const onAbort = () => reject(signal.reason);
        signal.addEventListener('abort', onAbort, { once: true });
        Promise.resolve(promise).then(
            (value) => {
                signal.removeEventListener('abort', onAbort);
                resolve(value);
            },
            (error) => {
                signal.removeEventListener('abort', onAbort);
                reject(error);
            },
        );
        if (signal.aborted) onAbort();
    });
}

function waitForEvent(target, eventName, signal, start) {
    return new Promise((resolve, reject) => {
        let timeout;
        const cleanup = () => {
            clearTimeout(timeout);
            target.removeEventListener(eventName, onEnd);
            target.removeEventListener('error', onError);
            target.removeEventListener('abort', onError);
            signal.removeEventListener('abort', onAbort);
        };
        const finish = (error) => {
            cleanup();
            if (error) reject(error);
            else resolve();
        };
        const onEnd = () => finish();
        const onError = () => finish(new Error('Video buffer failed'));
        const onAbort = () => finish(signal.reason);
        target.addEventListener(eventName, onEnd, { once: true });
        target.addEventListener('error', onError, { once: true });
        target.addEventListener('abort', onError, { once: true });
        signal.addEventListener('abort', onAbort, { once: true });
        timeout = setTimeout(
            () => finish(new Error('Video buffer timed out')),
            15000,
        );
        if (signal.aborted) return onAbort();
        try {
            start?.();
        } catch (error) {
            finish(error);
        }
    });
}

function delay(milliseconds, signal) {
    return new Promise((resolve, reject) => {
        const onAbort = () => {
            clearTimeout(timer);
            reject(signal.reason);
        };
        const timer = setTimeout(() => {
            signal.removeEventListener('abort', onAbort);
            resolve();
        }, milliseconds);
        signal.addEventListener('abort', onAbort, { once: true });
        if (signal.aborted) onAbort();
    });
}

function shouldPauseBuffering(video) {
    if (video.error) return false;
    if (video.paused && video.buffered.length > 0) {
        const bufferedEnd = video.buffered.end(video.buffered.length - 1);
        if (bufferedEnd > video.currentTime + 10) return true;
    }
    for (let index = 0; index < video.buffered.length; index++) {
        const start = video.buffered.start(index);
        const end = video.buffered.end(index);
        if (video.currentTime >= start && video.currentTime <= end) {
            return end - video.currentTime > BUFFER_AHEAD_SECONDS;
        }
    }
    return false;
}

function resolveVideoUrl(path, base, variables = {}) {
    const expanded = path.replace(/\{\$([^}]+)\}/g, (_, name) => {
        if (!Object.hasOwn(variables, name))
            throw new Error('Unknown video playlist variable');
        return variables[name];
    });
    const url = new URL(expanded, base);
    if (
        url.protocol !== 'https:' ||
        !/(^|\.)(roblox\.com|rbxcdn\.com)$/.test(url.hostname)
    ) {
        throw new Error('Unsupported video URL');
    }
    return url.href;
}

function getAttributes(line) {
    return Object.fromEntries(
        [...line.matchAll(/([A-Z0-9-]+)=(?:"([^"]*)"|([^,\s]+))/g)].map(
            (match) => [match[1], match[2] ?? match[3]],
        ),
    );
}

function getPlaylistVariables(text, url, inherited = {}) {
    const variables = { ...inherited };
    const query = new Map(
        new URL(url).search
            .slice(1)
            .split('&')
            .map((pair) => {
                const index = pair.indexOf('=');
                return [
                    decodeURIComponent(index < 0 ? pair : pair.slice(0, index)),
                    index < 0 ? '' : pair.slice(index + 1),
                ];
            }),
    );
    for (const line of text.split(/\r?\n/)) {
        if (!line.startsWith('#EXT-X-DEFINE:')) continue;
        const attributes = getAttributes(line);
        if (attributes.QUERYPARAM && query.has(attributes.QUERYPARAM)) {
            variables[attributes.QUERYPARAM] = query.get(attributes.QUERYPARAM);
        } else if (attributes.NAME && attributes.VALUE !== undefined) {
            variables[attributes.NAME] = attributes.VALUE;
        }
    }
    return variables;
}

function getMimeType(codecs) {
    const types = codecs
        ? [`video/webm; codecs="${codecs}"`, `video/mp4; codecs="${codecs}"`]
        : [MIME_TYPE];
    return types.find((type) => MediaSource.isTypeSupported(type));
}

function getBestStream(text, masterUrl, variables, maxHeight) {
    const streams = [];
    let attributes;
    for (const entry of text.split(/\r?\n/)) {
        const line = entry.trim();
        if (line.startsWith('#EXT-X-STREAM-INF:')) {
            attributes = getAttributes(line);
        } else if (line && !line.startsWith('#') && attributes) {
            const mimeType = getMimeType(attributes.CODECS);
            if (mimeType)
                streams.push({
                    url: resolveVideoUrl(line, masterUrl, variables),
                    bandwidth: Number(attributes.BANDWIDTH) || 0,
                    height: Number(attributes.RESOLUTION?.split('x')[1]) || 0,
                    mimeType,
                });
            attributes = null;
        }
    }
    if (Number.isFinite(maxHeight) && maxHeight > 0) {
        const sized = streams.filter((stream) => stream.height > 0);
        const underLimit = sized.filter((stream) => stream.height <= maxHeight);
        if (underLimit.length) {
            return underLimit.sort(
                (a, b) => b.height - a.height || a.bandwidth - b.bandwidth,
            )[0];
        }
        if (sized.length)
            return sized.sort(
                (a, b) => a.height - b.height || a.bandwidth - b.bandwidth,
            )[0];
        return streams.sort((a, b) => a.bandwidth - b.bandwidth)[0];
    }
    return streams.sort((a, b) => b.bandwidth - a.bandwidth)[0];
}

function parseSegmentUrls(text, baseUrl, inherited) {
    const variables = getPlaylistVariables(text, baseUrl, inherited);
    const segments = [];
    let initUrl = null;
    for (const entry of text.split(/\r?\n/)) {
        const line = entry.trim();
        if (line.startsWith('#EXT-X-MAP:')) {
            initUrl = resolveVideoUrl(
                getAttributes(line).URI,
                baseUrl,
                variables,
            );
        } else if (line && !line.startsWith('#') && !line.startsWith('<')) {
            segments.push(resolveVideoUrl(line, baseUrl, variables));
        }
    }
    return { initUrl, segments };
}
