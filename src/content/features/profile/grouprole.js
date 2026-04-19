import { callRobloxApiJson } from '../../core/api.js';
import { observeElement, observeChildren } from '../../core/observer.js';
import { getUserIdFromUrl, getGroupIdFromUrl } from '../../core/idExtractor.js';

let rolesPromise = null;
let lastUserId = null;

async function getGroupRoles(userId) {
    if (rolesPromise && lastUserId === userId) return rolesPromise;

    lastUserId = userId;
    rolesPromise = (async () => {
        try {
            const res = await callRobloxApiJson({
                subdomain: 'groups',
                endpoint: `/v1/users/${userId}/groups/roles?includeLocked=true`,
            });
            return new Map(
                res?.data?.map((item) => [item.group.id, item.role.name]) || [],
            );
        } catch (e) {
            console.error('RoValra: Failed to fetch group roles', e);
            rolesPromise = null;
            return new Map();
        }
    })();

    return rolesPromise;
}

export function init() {
    chrome.storage.local.get({ groupRoleEnabled: true }, (data) => {
        if (!data.groupRoleEnabled) return;

        const userId = getUserIdFromUrl();
        if (!userId) return;

        observeElement(
            '.css-1i465w8-carousel #collection-carousel-item .base-tile a[href*="/communities/"]',
            async (groupLink) => {
                if (groupLink.dataset.rovalraGroupRoleProcessed) return;
                groupLink.dataset.rovalraGroupRoleProcessed = 'true';

                const cleanupIfDuplicate = () => {
                    if (groupLink.querySelector('.user-community-role')) {
                        groupLink
                            .querySelector('.rovalra-group-role')
                            ?.remove();
                        return true;
                    }
                    return false;
                };

                if (cleanupIfDuplicate()) return;

                const observer = observeChildren(groupLink, () => {
                    if (cleanupIfDuplicate()) observer.disconnect();
                });

                const href = groupLink.getAttribute('href');
                const groupIdString = getGroupIdFromUrl(href);
                if (!groupIdString) return;

                const groupId = parseInt(groupIdString, 10);
                const rolesMap = await getGroupRoles(userId);
                const roleName = rolesMap.get(groupId);

                if (roleName) {
                    const metadataContainer = groupLink.querySelector(
                        '.base-tile-metadata > div',
                    );

                    if (
                        metadataContainer &&
                        !groupLink.querySelector('.user-community-role')
                    ) {
                        let roleDiv = metadataContainer.querySelector(
                            '.rovalra-group-role',
                        );

                        if (!roleDiv) {
                            roleDiv = document.createElement('div');
                            roleDiv.className = 'rovalra-group-role';
                            metadataContainer.appendChild(roleDiv);
                        }

                        roleDiv.textContent = roleName;
                        Object.assign(roleDiv.style, {
                            color: 'var(--rovalra-secondary-text-color)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        });
                    }
                }
            },
            { multiple: true },
        );
    });
}
