import { callRobloxApi, callRobloxApiJson } from '../api.js';
import { getAuthenticatedUserId } from '../user.js';
import {
    getUserDescription,
    updateUserDescription,
    isTextFiltered,
} from '../profile/descriptionhandler.js';

const settingsCache = new Map();

async function getStatusFromDescription(userId) {
    const description = await getUserDescription(userId);
    if (description === null) return null;

    const statusLine = description
        .split('\n')
        .find((line) => line.trim().startsWith('s:'));
    let status = statusLine ? statusLine.trim().substring(2).trim() : null;

    if (status && (await isTextFiltered(status))) {
        status = null;
    }
    return status;
}

async function getEnvironmentFromDescription(userId) {
    const description = await getUserDescription(userId);
    if (!description) return null;
    const envLine = description
        .split('\n')
        .find((line) => line.trim().startsWith('e:'));
    if (envLine) {
        const parsedId = parseInt(envLine.trim().substring(2), 10);
        if (!isNaN(parsedId)) {
            return parsedId;
        }
    }
    return null;
}

async function fetchAndProcessSettings(userId) {
    const authenticatedUserId = await getAuthenticatedUserId();
    const isOwnProfile =
        authenticatedUserId && String(authenticatedUserId) === String(userId);

    try {
        const data = await callRobloxApiJson({
            isRovalraApi: true,
            subdomain: 'apis',
            endpoint: `/v1/users/${userId}/settings`,
            method: 'GET',
            skipAutoAuth: true,
        });

        if (data.status === 'success' && data.settings) {
            let { status, environment } = data.settings;
            let canUseApi = Object.keys(data.settings).length > 0;

            if (isOwnProfile) {
                const statusFromDesc = await getStatusFromDescription(userId);
                const envFromDesc = await getEnvironmentFromDescription(userId);
                let descriptionModified = false;
                let currentDescription = await getUserDescription(userId);

                if (statusFromDesc && !status) {
                    try {
                        const res = await callRobloxApi({
                            isRovalraApi: true,
                            subdomain: 'apis',
                            endpoint: '/v1/auth/settings',
                            method: 'POST',
                            body: { key: 'status', value: statusFromDesc },
                        });
                        if (res.ok) {
                            status = statusFromDesc;
                            currentDescription = currentDescription
                                .split('\n')
                                .filter((line) => !line.trim().startsWith('s:'))
                                .join('\n')
                                .trimEnd();
                            descriptionModified = true;
                            canUseApi = true;
                        }
                    } catch (e) {
                        console.error('Failed to migrate status.', e);
                    }
                }

                if (envFromDesc && (!environment || environment === 1)) {
                    try {
                        const res = await callRobloxApi({
                            isRovalraApi: true,
                            subdomain: 'apis',
                            endpoint: '/v1/auth/settings',
                            method: 'POST',
                            body: {
                                key: 'environment',
                                value: String(envFromDesc),
                            },
                        });
                        if (res.ok) {
                            environment = envFromDesc;
                            currentDescription = currentDescription
                                .split('\n')
                                .filter((line) => !line.trim().startsWith('e:'))
                                .join('\n')
                                .trimEnd();
                            descriptionModified = true;
                            canUseApi = true;
                        }
                    } catch (e) {
                        console.error('Failed to migrate environment.', e);
                    }
                }

                if (descriptionModified) {
                    await updateUserDescription(userId, currentDescription);
                }

                if (!status && statusFromDesc) {
                    status = statusFromDesc;
                }
                if ((!environment || environment === 1) && envFromDesc) {
                    environment = envFromDesc;
                }
            } else if (!canUseApi) {
                status = await getStatusFromDescription(userId);
                environment = await getEnvironmentFromDescription(userId);
            }

            if (status && (await isTextFiltered(status))) {
                status = null;
            }

            return { status, environment: environment || 1, canUseApi };
        }
    } catch (error) {
        console.error(
            'RoValra: Failed to fetch settings from API, falling back to description.',
            error,
        );
    }

    const statusFromDesc = await getStatusFromDescription(userId);
    const envFromDesc = await getEnvironmentFromDescription(userId);
    return {
        status: statusFromDesc,
        environment: envFromDesc || 1,
        canUseApi: false,
    };
}

export function getUserSettings(userId) {
    if (!settingsCache.has(userId)) {
        settingsCache.set(userId, fetchAndProcessSettings(userId));
    }
    return settingsCache.get(userId);
}
