import { streamRobloxVideo } from '../../core/utils/videoStreamer.js';
import { callRobloxApiJson } from '../../core/api.js';

const VIDEO_ASSETS = [
    { id: 126397822635206, name: "Original Test" },
    { id: 80354346308494, name: "Video 2" },
    { id: 85723716754877, name: "Video 3" },
    { id: 90460839026431, name: "Video 4" },
    { id: 124530269490618, name: "Video 5" }
];

function waitForBody() {
    return new Promise(resolve => {
        if (document.body) return resolve();
        const observer = new MutationObserver(() => {
            if (document.body) {
                observer.disconnect();
                resolve();
            }
        }); // Verified 

        // Shouldnt matter too much as it is just a test page
        observer.observe(document.documentElement, { childList: true });
    });
}


async function loadVideo(assetId, videoElement, statusText, downloadBtn) {
    statusText.innerText = "Requesting Asset Data...";
    statusText.style.color = "var(--rovalra-secondary-text-color)";
    downloadBtn.style.display = 'none';
    downloadBtn.onclick = null; 

    videoElement.pause();
    videoElement.removeAttribute('src');
    videoElement.load();

    try {
        const fetchAssetData = async (assetType) => {
            return await callRobloxApiJson({
                subdomain: 'assetdelivery',
                endpoint: '/v1/assets/batch',
                method: 'POST',
                body: [{
                    "assetId": assetId,
                    "assetType": assetType,
                    "requestId": "0"
                }]
            });
        };

        let data = await fetchAssetData("Video");

        if (data && data.length > 0 && data[0].errors) {
            console.warn(`[RoValra] Asset ${assetId} failed as 'Video'. Errors:`, data[0].errors);
            statusText.innerText = "Retrying as GamePreviewVideo...";

            data = await fetchAssetData("GamePreviewVideo");

            if (data && data.length > 0 && data[0].errors) {
                const errInfo = data[0].errors[0];
                throw new Error(`API Error ${errInfo.code}: ${errInfo.message}`);
            }
        }


        const videoBlob = await streamRobloxVideo(data, videoElement, (status) => {
            if (videoElement.paused && videoElement.currentTime === 0) {
                statusText.innerText = status;
            } else {
                statusText.innerText = "Streaming...";
            }
        });

        downloadBtn.style.display = 'inline-block';
        downloadBtn.onclick = () => {
            const url = URL.createObjectURL(videoBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `roblox-video-${assetId}.webm`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        };

    } catch (err) {
        console.error(err);
        statusText.innerText = "Error: " + err.message;
        statusText.style.color = "#ff5555";
    }
}

export async function init() {
    if (window.location.pathname.toLowerCase() !== '/videotest') return;

    const isEnabled = await new Promise((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.get(['EnableVideoTest'], (result) => {
                resolve(result && result.EnableVideoTest === true);
            });
        } else {
            console.warn('[RoValra] Chrome Storage API not found.');
            resolve(false);
        }
    });

    if (!isEnabled) {
        return;
    }

    await waitForBody();

    document.documentElement.style.height = '100%';
    document.body.style.height = '100%';
    document.body.style.margin = '0';
    document.body.style.backgroundColor = 'var(--rovalra-container-background-color)';
    document.body.style.color = 'var(--rovalra-secondary-text-color)';
    document.body.style.display = 'flex';
    document.body.style.flexDirection = 'column';
    document.body.style.alignItems = 'center';
    document.body.style.justifyContent = 'center';

    const optionsHtml = VIDEO_ASSETS.map(v => 
        `<option value="${v.id}">${v.id} - ${v.name}</option>`
    ).join('');

    document.body.innerHTML = `
        <div style="text-align:center;">
            <h1>RoValra Video Test</h1>
            
            <div style="margin-bottom: 20px; display: flex; align-items: center; justify-content: center; gap: 10px;">
                <label for="video-selector" style="font-weight: bold;">Select Asset:</label>
                <select id="video-selector" style="padding: 8px; border-radius: 4px; border: 1px solid #555; background: #222; color: #fff; font-family: monospace;">
                    ${optionsHtml}
                </select>
                <button id="reload-btn" style="padding: 8px 12px; cursor: pointer; border-radius: 4px; border: none; background: #0084dd; color: white;">Reload</button>
            </div>

            <p id="status-text">Ready</p>
            
            <video id="rovalra-player" controls autoplay style="width: 80vw; max-width: 1000px; box-shadow: 0 0 20px #000; border-radius: 8px; background: #000;"></video>
            
            <br/>
            <button id="dl-btn" style="margin-top:20px; padding:10px 20px; cursor:pointer; display:none;">Save Full MP4</button>
        </div>
    `;// Verified

    const statusText = document.getElementById('status-text');
    const videoElement = document.getElementById('rovalra-player');
    const downloadBtn = document.getElementById('dl-btn');
    const selector = document.getElementById('video-selector');
    const reloadBtn = document.getElementById('reload-btn');

    const triggerLoad = () => {
        const assetId = parseInt(selector.value, 10);
        loadVideo(assetId, videoElement, statusText, downloadBtn);
    };

    selector.addEventListener('change', triggerLoad);
    reloadBtn.addEventListener('click', triggerLoad);

    triggerLoad();
}