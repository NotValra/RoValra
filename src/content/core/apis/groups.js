import { callRobloxApiJson } from '../api.js';
import * as CacheHandler from '../storage/cacheHandler.js';

const CLOUD_CACHE_SECTION = 'cloud_group_details';

export async function getCloudGroupDetails(groupId) {
    const cacheKey = String(groupId);

    const cached = await CacheHandler.get(
        CLOUD_CACHE_SECTION,
        cacheKey,
        'session',
    );
    if (cached) {
        return cached;
    }

    const data = await callRobloxApiJson({
        subdomain: 'apis',
        endpoint: `/cloud/v2/groups/${groupId}`,
        method: 'GET',
        useBackground: true,
        useApiKey: true,
    });

    if (!data) return null;

    await CacheHandler.set(CLOUD_CACHE_SECTION, cacheKey, data, 'session');
    return data;
}

export async function getGroupPath(groupId) {
    const data = await getCloudGroupDetails(groupId);
    return data?.path;
}

export async function getGroupCreateTime(groupId) {
    const data = await getCloudGroupDetails(groupId);
    return data?.createTime;
}

export async function getGroupUpdateTime(groupId) {
    const data = await getCloudGroupDetails(groupId);
    return data?.updateTime;
}

export async function getGroupDisplayName(groupId) {
    const data = await getCloudGroupDetails(groupId);
    return data?.displayName;
}

export async function getGroupDescription(groupId) {
    const data = await getCloudGroupDetails(groupId);
    return data?.description;
}

export async function getGroupOwner(groupId) {
    const data = await getCloudGroupDetails(groupId);
    return data?.owner;
}

export async function getGroupMemberCount(groupId) {
    const data = await getCloudGroupDetails(groupId);
    return data?.memberCount;
}

export async function getGroupPublicEntryAllowed(groupId) {
    const data = await getCloudGroupDetails(groupId);
    return data?.publicEntryAllowed;
}

export async function getGroupLocked(groupId) {
    const data = await getCloudGroupDetails(groupId);
    return data?.locked;
}

export async function getGroupVerified(groupId) {
    const data = await getCloudGroupDetails(groupId);
    return data?.verified;
}

export default {
    getCloudGroupDetails,
    getGroupPath,
    getGroupCreateTime,
    getGroupUpdateTime,
    getGroupDisplayName,
    getGroupDescription,
    getGroupOwner,
    getGroupMemberCount,
    getGroupPublicEntryAllowed,
    getGroupLocked,
    getGroupVerified,
};
