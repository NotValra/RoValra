// Turns Robloxs videos into watchable videos!!!
import { callRobloxApi } from '../api.js';
const MIME_TYPE = 'video/webm; codecs="vp9,opus"';
const BUFFER_AHEAD_SECONDS = 30; 

export function streamRobloxVideo(requestJson, videoElement, onProgress = () => {}) {
    return new Promise((resolve, reject) => {
        if (!requestJson || !Array.isArray(requestJson) || !requestJson[0]?.location) {
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
                const masterUrl = requestJson[0].location;
                onProgress("Fetching master playlist...");
                
                const masterText = await fetchText(masterUrl);
                if (isClosed()) return;

                const streamUrl = getBestStreamUrl(masterText, masterUrl);
                if (!streamUrl) throw new Error("Could not determine stream URL");

                onProgress("Fetching segment list...");
                const segmentText = await fetchText(streamUrl);
                if (isClosed()) return;

                const baseUrl = streamUrl.substring(0, streamUrl.lastIndexOf('/') + 1);
                const { initUrl, segments } = parseSegmentUrls(segmentText, baseUrl);

                if (segments.length === 0) throw new Error("No video segments found");

                if (initUrl) {
                    onProgress("Initializing...");
                    const initChunk = await fetchBuffer(initUrl);
                    if (isClosed()) return;
                    
                    fullFileChunks.push(initChunk);
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

                    fullFileChunks.push(chunk);
                    await appendChunk(sourceBuffer, chunk);
                    
                    currentSegment++;
                }

                if (!isClosed()) {
                    mediaSource.endOfStream();
                    onProgress("Complete");
                    resolve(new Blob(fullFileChunks, { type: 'video/webm' }));
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
    return await resp.arrayBuffer();
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


function getBestStreamUrl(m3u8Content, masterUrl) {
    const baseUriMatch = m3u8Content.match(/NAME="RBX-BASE-URI",\s*VALUE="(.*?)"/);
    const rbxBaseUri = baseUriMatch ? baseUriMatch[1] : "";
    const lines = m3u8Content.split(/\r?\n/);
    
    let bestBandwidth = -1;
    let bestPath = null;
    let pendingBandwidth = null;

    for (let line of lines) {
        line = line.trim();
        if (!line) continue;
        if (line.startsWith('#EXT-X-STREAM-INF')) {
            const bwMatch = line.match(/BANDWIDTH=(\d+)/);
            if (bwMatch) pendingBandwidth = parseInt(bwMatch[1], 10);
        } else if (!line.startsWith('#')) {
            if (pendingBandwidth !== null) {
                if (pendingBandwidth > bestBandwidth) {
                    bestBandwidth = pendingBandwidth;
                    bestPath = line;
                }
                pendingBandwidth = null; 
            }
        }
    }

    if (!bestPath) return null;
    if (bestPath.includes('{$RBX-BASE-URI}')) {
        bestPath = bestPath.replace('{$RBX-BASE-URI}', rbxBaseUri);
    }
    if (bestPath.startsWith('http')) return bestPath;
    const masterBase = masterUrl.substring(0, masterUrl.lastIndexOf('/') + 1);
    return masterBase + bestPath;
}

function parseSegmentUrls(m3u8Content, baseUrl) {
    const lines = m3u8Content.split(/\r?\n/);
    const segments = [];
    let initUrl = null;

    for (const line of lines) {
        const clean = line.trim();
        if (!clean) continue;
        if (clean.startsWith('#EXT-X-MAP:URI=')) {
            let uri = clean.substring(15);
            if (uri.startsWith('"') && uri.endsWith('"')) uri = uri.slice(1, -1);
            initUrl = uri.startsWith('http') ? uri : baseUrl + uri;
        } else if (!clean.startsWith('#') && !clean.startsWith('<')) {
            segments.push(clean.startsWith('http') ? clean : baseUrl + clean);
        }
    }
    return { initUrl, segments };
}