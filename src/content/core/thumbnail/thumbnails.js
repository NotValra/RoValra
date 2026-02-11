// Everything thumbnail related should go through this.

// TODO Update playertoken / serverlist thumbnails to handle invalid thumbnails correctly
import { callRobloxApi } from '../api.js';

const BATCH_SIZE = 50;
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 1500;


const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));


async function fetchBatchData(batch, type, size, isCircular, signal, noCache = false) {
    const results = [];

    if (type === 'PlayerToken') {
        const requestBody = batch.map(item => ({
            token: item.id,
            type: 'AvatarHeadshot',
            size: size,
            isCircular: isCircular,
            requestId: `0:${item.id}:AvatarHeadshot:${size}:png:regular`
        }));

        try {
            const response = await callRobloxApi({
                subdomain: 'thumbnails',
                endpoint: '/v1/batch',
                method: 'POST',
                body: requestBody,
                signal: signal,
                noCache: noCache
            });

            if (response.ok) {
                const data = await response.json();
                if (data && data.data) return data.data;
            }
        } catch (error) {
            console.error(`RoValra Thumbnails: Failed to fetch batch for "PlayerToken".`, error);
        }
        return results;
    }

    const endpointMapping = {
        'AvatarHeadshot': { path: '/v1/users/avatar-headshot', idParam: 'userIds' },
        'GameIcon': { path: '/v1/games/icons', idParam: 'universeIds' },
        'Asset': { path: '/v1/assets', idParam: 'assetIds' },
        'BundleThumbnail': { path: '/v1/bundles/thumbnails', idParam: 'bundleIds' },
        'PlaceIcon': { path: '/v1/places/gameicons', idParam: 'placeIds' },
        'UserOutfit': { path: '/v1/users/outfits', idParam: 'userOutfitIds' },
        'Outfit': { path: '/v1/users/outfits', idParam: 'userOutfitIds' },
        'GamePass': { path: '/v1/game-passes', idParam: 'gamePassIds' }
    };

    const mapping = endpointMapping[type];
    if (!mapping) return results;

    const ids = batch.map(item => item.id).join(',');

    try {
        let endpointUrl = `${mapping.path}?${mapping.idParam}=${ids}&size=${size}&format=Png&returnPolicy=PlaceHolder`;
        if (isCircular) endpointUrl += `&isCircular=true`;

        const response = await callRobloxApi({
            subdomain: 'thumbnails',
            endpoint: endpointUrl,
            signal: signal,
            noCache: noCache
        });

        if (response.ok) {
            const data = await response.json();
            if (data && data.data) return data.data;
        }
    } catch (error) {
        console.error(`RoValra Thumbnails: Failed to fetch batch for "${type}".`, error);
    }

    return results;
}


export async function fetchThumbnails(items, type, size = '150x150', isCircular = false, signal) {
    const thumbnailMap = new Map();
    if (!items || items.length === 0) return thumbnailMap;

    const processResults = (resultsArray) => {
        resultsArray.flat().forEach(thumb => {
            if (type === 'PlayerToken') {
                const token = thumb.requestId.split(':')[1];
                thumbnailMap.set(token, thumb);
            } else {
                thumbnailMap.set(thumb.targetId, thumb);
            }
        });
    };

    const initialPromises = [];
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const batch = items.slice(i, i + BATCH_SIZE);
        initialPromises.push(fetchBatchData(batch, type, size, isCircular, signal, false));
    }
    
    const initialResults = await Promise.all(initialPromises);
    processResults(initialResults);

    const pendingItems = [];
    const pendingResolvers = new Map(); 

    for (const [id, data] of thumbnailMap.entries()) {
        if (data.state === 'Pending' || data.state === 'InReview') {
            let resolver;
            const updatePromise = new Promise(resolve => { resolver = resolve; });
            
            data.finalUpdate = updatePromise;
            
            pendingItems.push({ id });
            pendingResolvers.set(String(id), resolver);
        }
    }

    if (pendingItems.length > 0) {
        (async () => {
            let currentPending = [...pendingItems];

            for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                if (currentPending.length === 0) break;
                if (signal?.aborted) break;
                
                await sleep(RETRY_DELAY_MS);
                if (signal?.aborted) break;

                const retryPromises = [];
                for (let i = 0; i < currentPending.length; i += BATCH_SIZE) {
                    const batch = currentPending.slice(i, i + BATCH_SIZE);
                    retryPromises.push(fetchBatchData(batch, type, size, isCircular, signal, true));
                }

                const retryResultsBatches = await Promise.all(retryPromises);
                const flatResults = retryResultsBatches.flat();

                const nextPending = [];

                flatResults.forEach(thumb => {
                    let id;
                    if (type === 'PlayerToken') {
                        id = thumb.requestId.split(':')[1];
                    } else {
                        id = String(thumb.targetId);
                    }

                    if (thumb.state === 'Completed') {
                        const resolve = pendingResolvers.get(id);
                        if (resolve) {
                            resolve(thumb);
                            pendingResolvers.delete(id);
                        }
                    } else if (thumb.state === 'Pending' || thumb.state === 'InReview') {
                        nextPending.push({ id });
                    } else {
                        const resolve = pendingResolvers.get(id);
                        if (resolve) {
                            resolve(thumb);
                            pendingResolvers.delete(id);
                        }
                    }
                });
                
                currentPending = nextPending;
            }


            currentPending.forEach(item => {
                const resolve = pendingResolvers.get(String(item.id));
                if (resolve) resolve(null); 
            });

        })();
    }

    return thumbnailMap;
}


export function createThumbnailElement(thumbnailData, altText, baseClass = 'game-card-thumb', style = { width: '100%', height: '100%' }) {
    let thumbnailElement;
    const state = thumbnailData ? thumbnailData.state : 'Error';

    const applyStyles = (el) => {
        el.alt = altText;
        Object.assign(el.style, style);
        return el;
    };

    if (state === 'Completed') {
        thumbnailElement = document.createElement('img');
        thumbnailElement.className = baseClass;
        thumbnailElement.src = thumbnailData.imageUrl;
        return applyStyles(thumbnailElement);
    } 
    
    if (state === 'Blocked') {
        thumbnailElement = document.createElement('div');
        thumbnailElement.className = 'thumbnail-2d-container icon-blocked';
        return applyStyles(thumbnailElement);
    }

    if (state === 'Pending' || state === 'InReview') {
        const container = document.createElement('div');
        container.className = 'thumbnail-2d-container shimmer'; 
        applyStyles(container);

        if (thumbnailData && thumbnailData.finalUpdate) {
            thumbnailData.finalUpdate.then(updatedData => {
                if (!updatedData) return; 

                if (updatedData.state === 'Completed') {
                    const img = document.createElement('img');
                    img.className = baseClass;
                    img.src = updatedData.imageUrl;
                    img.alt = altText;
                    Object.assign(img.style, style);
                    
                    if (container.parentNode) {
                        container.parentNode.replaceChild(img, container);
                    }
                } else if (updatedData.state === 'Blocked') {
                    container.className = 'thumbnail-2d-container icon-blocked';
                    container.classList.remove('shimmer');
                } else {
                    container.className = 'thumbnail-2d-container icon-broken'; 
                    container.classList.remove('shimmer');
                }
            }).catch(() => {
                container.className = 'thumbnail-2d-container icon-broken';
                container.classList.remove('shimmer');
            });
        }

        return container;
    }

    thumbnailElement = document.createElement('div');
    thumbnailElement.className = 'thumbnail-2d-container icon-broken';
    return applyStyles(thumbnailElement);
}

export async function getBatchThumbnails(ids, type, size = '150x150') {
    const items = ids.map(id => ({ id }));
    const thumbnailMap = await fetchThumbnails(items, type, size);
    return Array.from(thumbnailMap.values());
}