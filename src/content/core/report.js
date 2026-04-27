import { callRobloxApiJson } from './api.js';
import { showSystemAlert } from './ui/roblox/alert.js';

export async function reportUserContent(userId, configKey) {
    if (!userId || !configKey) {
        console.error(
            'RoValra (Report): Missing required reporting parameters.',
        );
        throw new Error(
            'user_id and config_key are required to file a content report.',
        );
    }

    try {
        const result = await callRobloxApiJson({
            isRovalraApi: true,
            endpoint: '/v1/auth/moderation/report',
            method: 'POST',
            body: {
                user_id: parseInt(userId, 10),
                config_key: configKey,
            },
        });

        if (result && result.status === 'success' && result.message) {
            showSystemAlert(result.message, 'success');
        }

        return result;
    } catch (error) {
        if (error.status === 409 && error.response && error.response.message) {
            showSystemAlert(error.response.message, 'warning');
        } else {
            showSystemAlert('Something went wrong', 'warning');
        }

        throw error;
    }
}
