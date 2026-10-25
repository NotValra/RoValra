import { callRobloxApiJson } from '../api.js';
import { fetchThumbnails } from '../thumbnail/thumbnails.js';
import { getAuthenticatedUserId } from '../user.js';

export async function getDecal(decalId) {
    const id = Number(decalId);
    if (!id) return null;

    try {
        const asset = await callRobloxApiJson({
            fullUrl: `https://apis.roblox.com/toolbox-service/v2/assets/${id}`,
            method: 'GET',
        });
        const textureId = Number(asset?.asset?.textureId);
        if (!textureId) return null;

        const thumbnails = await fetchThumbnails(
            [{ id: textureId }],
            'Asset',
            '768x432',
        );
        const thumbnail = thumbnails.get(textureId);
        if (!thumbnail || thumbnail.state === 'Error') return null;

        return {
            decalId: id,
            textureId,
            name: asset.asset.name || `Decal ${id}`,
            thumbnail,
        };
    } catch (error) {
        console.warn('RoValra: Failed to fetch decal.', error);
        return null;
    }
}

export async function openDecalReport(decal) {
    const submitterId = await getAuthenticatedUserId();
    if (!submitterId || !decal?.textureId) return;
    const custom = encodeURIComponent(JSON.stringify({ assetTypeId: '1' }));
    window.open(
        `https://www.roblox.com/report-abuse/?abuseVector=asset&custom=${custom}&submitterId=${submitterId}&targetId=${decal.textureId}`,
        '_blank',
        'noopener,noreferrer',
    );
}
