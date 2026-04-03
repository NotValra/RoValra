import DOMPurify from '../../packages/dompurify';
import {
    createThumbnailElement,
    getBatchThumbnails,
} from '../../thumbnail/thumbnails';
import { callRobloxApiJson } from '../../api';

const PRESENCE_MAP = {
    0: { class: 'offline icon-offline', title: 'Offline' },
    1: { class: 'online icon-online', title: 'Website' },
    2: { class: 'game icon-game', title: 'Playing' },
    3: { class: 'studio icon-studio', title: 'Studio' },
};

export function updateUserCardPresence(card, presenceType, gameName) {
    const presence = PRESENCE_MAP[presenceType] || PRESENCE_MAP[0];
    const presenceTitle =
        presenceType === 2 && gameName ? gameName : presence.title;
    const icon = card.querySelector('[data-testid="presence-icon"]');
    if (icon) {
        icon.className = presence.class;
        icon.title = presenceTitle;
    }
    const sublabel = card.querySelector('.user-card-subname');
    if (sublabel) {
        if (gameName) {
            sublabel.textContent = gameName;
            sublabel.style.fontSize = '9.6px';
        }
    }
}

export async function updateFriendTilePresence(card, userId) {
    try {
        const res = await callRobloxApiJson({
            subdomain: 'presence',
            endpoint: '/v1/presence/users',
            method: 'POST',
            body: { userIds: [userId] },
        }).catch(() => null);
        if (!res?.userPresences?.length) return;
        const p = res.userPresences[0];
        const presenceType = p.userPresenceType ?? 0;
        const gameName =
            presenceType === 2 && p.lastLocation ? p.lastLocation : null;
        updateUserCardPresence(card, presenceType, gameName);
    } catch (e) {}
}

export async function batchFetchPresence(userIds) {
    try {
        const res = await callRobloxApiJson({
            subdomain: 'presence',
            endpoint: '/v1/presence/users',
            method: 'POST',
            body: { userIds },
        }).catch(() => null);
        return new Map((res?.userPresences || []).map((p) => [p.userId, p]));
    } catch (e) {
        return new Map();
    }
}

export function createUserCard({
    displayName,
    username,
    thumbData,
    href,
    showUsername = true,
    presenceInfo = 0,
    gameName,
}) {
    const presence = PRESENCE_MAP[presenceInfo] || PRESENCE_MAP[0];
    const showSublabel = showUsername && gameName ? true : showUsername;
    const sublabelText = showUsername && gameName ? gameName : username;
    const sublabelFontSize = gameName ? '9.6px' : '12px';
    const presenceTitle =
        presenceInfo === 2 && gameName ? gameName : presence.title;

    const tileContainer = document.createElement('div');
    tileContainer.className = 'user-card';
    const innerHtml = `
        <div class="user-card-content" style="width: 90px;">
            <div class="avatar avatar-card-fullbody" style="width: 90px; height: 90px; position: relative;">
                ${href ? `<a href="${href}" class="avatar-card-link">` : ''}
                    <span class="thumbnail-2d-container avatar-card-image" style="width: 100%; height: 100%; display: block; overflow: hidden; border-radius: 50%; background: var(--rovalra-button-background-color);"></span>
                ${href ? `</a>` : ''}
                <div class="avatar-status"><span data-testid="presence-icon" title="${presenceTitle}" class="${presence.class}"></span></div>
            </div>
            ${
                showSublabel
                    ? `
            <div class="user-card-labels" style="display: block; margin-top: 8px; max-width: 90px; width: 90px;">
                <div class="user-card-name" style="overflow: hidden; line-height: 1.2;">
                    <span style="font-weight: 400; font-size: 12.8px; color: var(--rovalra-main-text-color); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block; max-width: 90px; text-align: center; transition: text-decoration 0.2s ease;">${displayName}</span>
                </div>
                <div class="user-card-subname" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: ${sublabelFontSize}; color: var(--rovalra-secondary-text-color); max-width: 90px; display: block; text-align: center; transition: text-decoration 0.2s ease;">${sublabelText}</div>
            </div>
            `
                    : `
            <div class="user-card-labels-no-username" style="margin-top: 8px; max-width: 90px; width: 90px; text-align: center;">
                <div class="user-card-name" style="overflow: hidden; line-height: 1.2;">
                    <span style="font-weight: 400; font-size: 12.8px; color: var(--rovalra-main-text-color); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block; max-width: 90px; text-align: center; transition: text-decoration 0.2s ease;">${displayName}</span>
                </div>
            </div>
            `
            }
        </div>
    `;
    tileContainer.innerHTML = DOMPurify.sanitize(
        `<div class="user-card-inner">${innerHtml}</div>`,
    );
    const thumbEl = createThumbnailElement(thumbData, displayName, '', {
        width: '90px',
        height: '90px',
    });
    tileContainer.querySelector('.avatar-card-image').appendChild(thumbEl);
    const card = tileContainer.firstElementChild;
    card.style.cursor = href ? 'pointer' : 'default';
    card.addEventListener('mouseenter', () => {
        const nameSpan = card.querySelector('.user-card-name span');
        if (nameSpan) nameSpan.style.textDecoration = 'underline';
        const subname = card.querySelector('.user-card-subname');
        if (subname) subname.style.textDecoration = 'underline';
    });
    card.addEventListener('mouseleave', () => {
        const nameSpan = card.querySelector('.user-card-name span');
        if (nameSpan) nameSpan.style.textDecoration = 'none';
        const subname = card.querySelector('.user-card-subname');
        if (subname) subname.style.textDecoration = 'none';
    });
    return card;
}

export function createFriendTile(
    item,
    thumbData,
    { displayName, username, isHidden },
) {
    const href = isHidden
        ? ''
        : `https://www.roblox.com/users/${item.id}/profile`;
    const card = createUserCard({
        displayName: displayName || '',
        username: isHidden ? '' : username || '',
        thumbData: thumbData || { state: 'Error' },
        href,
        presenceInfo: 0,
    });

    if (!isHidden) {
        callRobloxApiJson({
            subdomain: 'presence',
            endpoint: '/v1/presence/users',
            method: 'POST',
            body: { userIds: [item.id] },
        })
            .then((res) => {
                if (!res?.userPresences?.length) return;
                const p = res.userPresences[0];
                const presenceType = p.userPresenceType ?? 0;
                const gameName =
                    presenceType === 2 && p.lastLocation
                        ? p.lastLocation
                        : null;
                updateUserCardPresence(card, presenceType, gameName);
            })
            .catch(() => {});
    }

    return card;
}

export async function createFriendTiles(
    containerEl,
    items,
    thumbData,
    profiles,
) {
    const friendIds = items.filter((i) => i.id > 0).map((i) => i.id);
    const presenceMap = await batchFetchPresence(friendIds);

    items.forEach((item) => {
        const isHidden = item.id === -1;
        const profile = isHidden ? null : profiles.get(item.id);
        if (!isHidden && !profile) return;

        const thumb = isHidden ? { state: 'Error' } : thumbData.get(item.id);
        const displayName = isHidden
            ? 'Hidden User'
            : profile.names.combinedName;
        const username = isHidden ? '' : `@${profile.names.username}`;

        const presence = isHidden ? null : presenceMap.get(item.id);
        const presenceType = presence?.userPresenceType ?? 0;
        const gameName =
            presenceType === 2 && presence?.lastLocation
                ? presence.lastLocation
                : null;

        const card = createUserCard({
            displayName,
            username: gameName || username || '',
            thumbData: thumb,
            href: isHidden
                ? ''
                : `https://www.roblox.com/users/${item.id}/profile`,
            presenceInfo: presenceType,
            gameName: isHidden || !gameName ? '' : gameName,
        });
        containerEl.appendChild(card);
    });
}

export async function createUserCardsFromIds(containerEl, ids, limit = 7) {
    const validIds = ids.filter((id) => id > 0).slice(0, limit);
    if (validIds.length === 0) return;

    const [profilesRes, thumbs, presenceRes] = await Promise.all([
        callRobloxApiJson({
            subdomain: 'apis',
            endpoint: '/user-profile-api/v1/user/profiles/get-profiles',
            method: 'POST',
            body: {
                userIds: validIds,
                fields: ['names.combinedName', 'isVerified', 'names.username'],
            },
        }),
        getBatchThumbnails(validIds, 'AvatarHeadshot', '150x150'),
        callRobloxApiJson({
            subdomain: 'presence',
            endpoint: '/v1/presence/users',
            method: 'POST',
            body: { userIds: validIds },
        }).catch(() => null),
    ]);

    const profileMap = new Map(
        (profilesRes?.profileDetails || []).map((p) => [p.userId, p]),
    );
    const thumbMap = new Map(thumbs.map((t) => [t.targetId, t]));
    const presenceMap = new Map(
        (presenceRes?.userPresences || []).map((p) => [p.userId, p]),
    );

    validIds.forEach((id) => {
        const profile = profileMap.get(id);
        if (!profile) return;

        const presence = presenceMap.get(id);
        const presenceType = presence?.userPresenceType ?? 0;
        const gameName =
            presenceType === 2 && presence.lastLocation
                ? presence.lastLocation
                : null;

        const card = createUserCard({
            displayName: profile.names.combinedName,
            username: `@${profile.names.username}`,
            showUsername: true,
            thumbData: thumbMap.get(id) || { state: 'Error' },
            href: `https://www.roblox.com/users/${id}/profile`,
            presenceInfo: presenceType,
            gameName,
        });
        containerEl.appendChild(card);
    });
}
