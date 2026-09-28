// Turns Robloxs videos into watchable videos!!!
import { callRobloxApi, callRobloxApiJson } from '../api.js';
const MIME_TYPE = 'video/webm; codecs="vp9,opus"';
const BUFFER_AHEAD_SECONDS = 30;
const HLS_REPRESENTATION = btoa(JSON.stringify([{ format: 'hls', majorVersion: '1', fidelity: 'main' }]));

// Asks assetdelivery for the HLS version of a video asset, the same way Roblox's own player does.
// The response ({ locations: [...] }) can be passed straight into streamRobloxVideo.
export async function getHlsVideoAsset(assetId) {
    return await callRobloxApiJson({
        subdomain: 'assetdelivery',
        endpoint: `/v2/asset?Id=${assetId}&ContentRepresentationPriorityList=${encodeURIComponent(HLS_REPRESENTATION)}`,
        method: 'GET',
    });
}

// Accepts either the /v1/assets/batch array or the /v2/asset response ({ locations: [...] }).
// Options:
//  - targetHeight: picks the smallest stream at least this tall instead of the highest quality one.
//  - keepChunks: keeps every segment in memory so the promise resolves with the full video as a Blob.
export function streamRobloxVideo(requestJson, videoElement, onProgress = () => {}, options = {}) {
    const { targetHeight = null, keepChunks = true } = options;
    const locations = Array.isArray(requestJson) ? requestJson : requestJson?.locations;

    return new Promise((resolve, reject) => {
        if (!locations?.[0]?.location) {
            return reject(new Error("Invalid video data: Asset is likely not a video."));
        }

        let mediaSource = new MediaSource();
        const objectUrl = URL.createObjectURL(mediaSource);
        videoElement.src = objectUrl;

        const cleanup = () => {
            if (videoElement.src === objectUrl) URL.revokeObjectURL(objectUrl);
        };

        const isClosed = () => mediaSource.readyState !== 'open';

        mediaSource.addEventListener('sourceopen', async () => {
            URL.revokeObjectURL(objectUrl);
            
            if (!MediaSource.isTypeSupported(MIME_TYPE)) {
                reject(new Error(`Browser does not support ${MIME_TYPE}`));
                return;
            }

            let sourceBuffer;
            try {
                sourceBuffer = mediaSource.addSourceBuffer(MIME_TYPE);
                sourceBuffer.mode = 'sequence';
            } catch (e) { return; }

            const fullFileChunks = []; 

            try {
                const masterUrl = locations[0].location;
                onProgress("Fetching master playlist...");

                const masterText = await fetchText(masterUrl);
                if (isClosed()) return;

                const streamUrl = getBestStreamUrl(masterText, masterUrl, targetHeight);
                if (!streamUrl) throw new Error("Could not determine stream URL");

                onProgress("Fetching segment list...");
                const segmentText = await fetchText(streamUrl);
                if (isClosed()) return;

                const { initUrl, segments } = parseSegmentUrls(segmentText, streamUrl);

                if (segments.length === 0) throw new Error("No video segments found");

                if (initUrl) {
                    onProgress("Initializing...");
                    const initChunk = await fetchBuffer(initUrl);
                    if (isClosed()) return;
                    
                    if (keepChunks) fullFileChunks.push(initChunk);
                    await appendChunk(sourceBuffer, initChunk);
                }

                let currentSegment = 0;

                while (currentSegment < segments.length) {
                    if (isClosed()) break;

                    if (shouldPauseBuffering(videoElement)) {
                        await new Promise(r => setTimeout(r, 1000));
                        continue; 
                    }

                    onProgress(`Buffering ${currentSegment + 1}/${segments.length}`);

                    let chunk = null;
                    let attempts = 0;
                    
                    while (!chunk && attempts < 3) {
                        if (isClosed()) break;
                        try {
                            chunk = await fetchBuffer(segments[currentSegment]);
                        } catch (e) {
                            attempts++;
                            console.warn(`Retry ${attempts}/3 for segment ${currentSegment}`);
                            await new Promise(r => setTimeout(r, 1000));
                        }
                    }

                    if (!chunk && !isClosed()) {
                        throw new Error(`Failed to load segment ${currentSegment}`);
                    }
                    
                    if (isClosed()) break;

                    if (keepChunks) fullFileChunks.push(chunk);
                    await appendChunk(sourceBuffer, chunk);
                    
                    currentSegment++;
                }

                if (!isClosed()) {
                    mediaSource.endOfStream();
                    onProgress("Complete");
                    resolve(keepChunks ? new Blob(fullFileChunks, { type: 'video/webm' }) : null);
                }

            } catch (err) {
                console.error("Streamer Error:", err);
                if (!isClosed()) mediaSource.endOfStream('network');
                cleanup();
                reject(err);
            }
        });
    });
}


function shouldPauseBuffering(video) {
    if (video.error) return false;
    if (video.paused && video.buffered.length > 0) {

        const bufferedEnd = video.buffered.end(video.buffered.length - 1);
        if (bufferedEnd > video.currentTime + 10) return true;
    }
    
    for (let i = 0; i < video.buffered.length; i++) {
        const start = video.buffered.start(i);
        const end = video.buffered.end(i);
        
        if (video.currentTime >= start && video.currentTime <= end) {
            return (end - video.currentTime) > BUFFER_AHEAD_SECONDS;
        }
    }
    return false;
}


async function fetchText(url) {
    const resp = await callRobloxApi({ fullUrl: url, credentials: 'omit' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.text();
}


async function fetchBuffer(url) {
    const resp = await callRobloxApi({ fullUrl: url, credentials: 'omit' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await gunzipIfNeeded(await resp.arrayBuffer());
}


// Roblox stores some segments gzipped without a Content-Encoding header, so the browser hands us the raw gzip.
async function gunzipIfNeeded(buffer) {
    const header = new Uint8Array(buffer, 0, Math.min(2, buffer.byteLength));
    if (header[0] !== 0x1f || header[1] !== 0x8b) return buffer;

    const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
    return await new Response(stream).arrayBuffer();
}


function appendChunk(sourceBuffer, data) {
    return new Promise((resolve, reject) => {
        if (sourceBuffer.updating) {
            return reject(new Error("Buffer is busy"));
        }

        const onUpdateEnd = () => {
            cleanup();
            resolve();
        };

        const onError = (e) => {
            cleanup();
            reject(new Error("SourceBuffer append error"));
        };

        const cleanup = () => {
            sourceBuffer.removeEventListener('updateend', onUpdateEnd);
            sourceBuffer.removeEventListener('error', onError);
        };

        sourceBuffer.addEventListener('updateend', onUpdateEnd);
        sourceBuffer.addEventListener('error', onError);

        try {
            sourceBuffer.appendBuffer(data);
        } catch (e) {
            cleanup();
            if (e.name !== 'InvalidStateError') {
                reject(e);
            }
        }
    });
}


// Reads #EXT-X-DEFINE tags, both NAME/VALUE pairs (e.g. RBX-BASE-URI) and QUERYPARAM ones,
// which take their value from the query string of the playlist's own URL (the signed CDN token).
function getPlaylistVariables(m3u8Content, playlistUrl) {
    const queryParams = {};
    const rawQuery = playlistUrl.split('#')[0].split('?')[1] || '';
    for (const pair of rawQuery.split('&')) {
        const separator = pair.indexOf('=');
        if (separator > 0) queryParams[pair.slice(0, separator)] = pair.slice(separator + 1);
    }

    const variables = {};
    for (const line of m3u8Content.split(/\r?\n/)) {
        if (!line.startsWith('#EXT-X-DEFINE:')) continue;

        const queryParam = line.match(/QUERYPARAM="(.*?)"/)?.[1];
        const name = line.match(/(?:^|[:,])NAME="(.*?)"/)?.[1];
        const value = line.match(/VALUE="(.*?)"/)?.[1];

        if (queryParam && queryParam in queryParams) {
            variables[queryParam] = queryParams[queryParam];
        } else if (name && value !== undefined) {
            variables[name] = value;
        }
    }
    return variables;
}

function resolvePlaylistUri(uri, playlistUrl, variables) {
    const resolved = uri.replace(/\{\$([^}]+)\}/g, (match, name) =>
        name in variables ? variables[name] : match,
    );
    if (resolved.startsWith('http')) return resolved;
    const playlistBase = playlistUrl.split('?')[0];
    return playlistBase.substring(0, playlistBase.lastIndexOf('/') + 1) + resolved;
}

function getBestStreamUrl(m3u8Content, masterUrl, targetHeight = null) {
    const variables = getPlaylistVariables(m3u8Content, masterUrl);
    const lines = m3u8Content.split(/\r?\n/);
    const variants = [];
    let pendingVariant = null;

    for (let line of lines) {
        line = line.trim();
        if (!line) continue;
        if (line.startsWith('#EXT-X-STREAM-INF')) {
            pendingVariant = {
                bandwidth: Number(line.match(/[:,]BANDWIDTH=(\d+)/)?.[1] || 0),
                height: Number(line.match(/RESOLUTION=\d+x(\d+)/)?.[1] || 0),
            };
        } else if (!line.startsWith('#') && pendingVariant) {
            variants.push({ ...pendingVariant, path: line });
            pendingVariant = null;
        }
    }

    if (variants.length === 0) return null;

    const byBandwidth = (a, b) => b.bandwidth - a.bandwidth;
    let best = [...variants].sort(byBandwidth)[0];

    if (targetHeight) {
        const tallEnough = variants
            .filter((variant) => variant.height >= targetHeight)
            .sort((a, b) => a.height - b.height || byBandwidth(a, b));
        if (tallEnough.length > 0) best = tallEnough[0];
    }

    return resolvePlaylistUri(best.path, masterUrl, variables);
}

function parseSegmentUrls(m3u8Content, playlistUrl) {
    const variables = getPlaylistVariables(m3u8Content, playlistUrl);
    const lines = m3u8Content.split(/\r?\n/);
    const segments = [];
    let initUrl = null;

    for (const line of lines) {
        const clean = line.trim();
        if (!clean) continue;
        if (clean.startsWith('#EXT-X-MAP:URI=')) {
            let uri = clean.substring(15);
            if (uri.startsWith('"') && uri.endsWith('"')) uri = uri.slice(1, -1);
            initUrl = resolvePlaylistUri(uri, playlistUrl, variables);
        } else if (!clean.startsWith('#') && !clean.startsWith('<')) {
            segments.push(resolvePlaylistUri(clean, playlistUrl, variables));
        }
    }
    return { initUrl, segments };
}
