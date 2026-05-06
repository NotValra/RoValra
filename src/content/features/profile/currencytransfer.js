import { callRobloxApiJson } from '../../core/api.js';
import { getUserIdFromUrl } from '../../core/idExtractor.js';
import { launchDeeplink } from '../../core/utils/launcher.js';
import { showConfirmationPrompt } from '../../core/ui/confirmationPrompt.js';
import { t } from '../../core/locale/i18n.js';
import { User } from '../../core/user.js';
import * as CacheHandler from '../../core/storage/cacheHandler.js';
import {
    registerProfileContextMenuAction,
    createContextMenuButton,
} from '../../core/ui/profile/contextMenu.js';

async function getCurrencyTransferStatus() {
    const authedUserId = await User.uid();
    if (!authedUserId) return false;

    const cacheKey = `is_roblox_plus_${authedUserId}`;
    const cached = await CacheHandler.get('profile_data', cacheKey, 'session');
    if (cached !== undefined) return cached;

    const profileApiPayload = {
        profileId: authedUserId.toString(),
        profileType: 'User',
        components: [{ component: 'UserProfileHeader' }],
        includeComponentOrdering: true,
    };

    const statusPromise = (async () => {
        try {
            const profileResponse = await callRobloxApiJson({
                subdomain: 'apis',
                endpoint: '/profile-platform-api/v1/profiles/get',
                method: 'POST',
                body: profileApiPayload,
            });

            const isRobloxPlus =
                profileResponse?.components?.UserProfileHeader?.isRobloxPlus ===
                true;

            await CacheHandler.set(
                'profile_data',
                cacheKey,
                isRobloxPlus,
                'session',
            );
            return isRobloxPlus;
        } catch (err) {
            console.error(
                'RoValra: Failed to fetch currency transfer status.',
                err,
            );
            return false;
        }
    })();

    return statusPromise;
}

async function addCurrencyTransferButton(menu) {
    if (menu.dataset.rovalraCurrencyTransferBtnAdded) {
        return;
    }
    menu.dataset.rovalraCurrencyTransferBtnAdded = 'true';

    const authedUserId = await User.uid();
    const userId = getUserIdFromUrl();
    if (!userId || String(userId) === String(authedUserId)) return;

    const canTransfer = await getCurrencyTransferStatus();
    if (!canTransfer) return;

    const { button } = createContextMenuButton(
        await t('profile.currencyTransfer', {
            defaultValue: 'Transfer Currency',
        }),
    );

    button.addEventListener('click', async () => {
        showConfirmationPrompt({
            title: await t('profile.currencyTransfer', {
                defaultValue: 'Transfer Currency',
            }),
            message: await t('profile.currencyTransferConfirmation', {
                defaultValue:
                    'This will open the Roblox client to complete the currency transfer.',
            }),
            confirmText: await t('profile.openClient', {
                defaultValue: 'Open Client',
            }),
            onConfirm: () => {
                const params = new URLSearchParams({
                    direction: 'send',
                    transferOrigination: 'Profile',
                    userId: userId,
                });
                launchDeeplink(
                    `roblox://navigation/currency_transfer?${params.toString()}`,
                );
            },
        });
    });

    const container = menu.querySelector('[role="group"]') || menu;
    const menuItems = container.querySelectorAll('[role="menuitem"]');

    if (menuItems.length > 0) {
        menuItems[0].insertAdjacentElement('afterend', button);
    } else {
        container.appendChild(button);
    }
}

export function init() {
    chrome.storage.local.get({ currencyTransferEnabled: true }, (settings) => {
        if (!settings.currencyTransferEnabled) return;

        registerProfileContextMenuAction(addCurrencyTransferButton, () => {
            getCurrencyTransferStatus();
        });
    });
}
