import { observeElement } from '../../../core/observer.js';
import { createRobuxIcon } from '../../../core/ui/robuxIcon.js';
import { getPlaceIdFromUrl } from '../../../core/idExtractor.js';
import { getGameSpending } from '../../../core/utils/trackers/transactions.js';
import { t } from '../../../core/locale/i18n.js';

let isTotalSpentGamesInitialized = false;

export function init() {
    if (isTotalSpentGamesInitialized) {
        return;
    }
    isTotalSpentGamesInitialized = true;

    observeElement(
        '#rbx-game-passes, #roseal-game-passes',
        async (container) => {
            if (container.dataset.totalSpentAdded) return;

            const storageResult = await chrome.storage.local.get(
                'TotalSpentGamesEnabled',
            );
            const isEnabled = storageResult.TotalSpentGamesEnabled ?? true;
            if (!isEnabled) return;

            const placeId = getPlaceIdFromUrl();
            if (!placeId) return;

            const totalContainer = document.createElement('div');
            totalContainer.style.cssText = `
                margin-bottom: 16px;
                font-weight: 400;
                font-size: 14px;
                margin-top: 2px;
            `;

            const valueContainer = document.createElement('div');
            valueContainer.style.display = 'flex';
            valueContainer.style.alignItems = 'center';
            valueContainer.style.gap = '4px';
            valueContainer.textContent = await t('totalSpent.calculatingText');

            totalContainer.appendChild(valueContainer);

            container.prepend(totalContainer);
            container.dataset.totalSpentAdded = 'true';

            try {
                const gameSpending = await getGameSpending(placeId);

                if (gameSpending.isScanning) {
                    valueContainer.textContent = await t(
                        'totalSpentGames.stillCalculating',
                    );
                    return;
                }

                valueContainer.textContent = `${await t('totalSpent.totalRobuxSpent')} `;

                const robuxIcon = createRobuxIcon({ size: '17px' });
                const amountText = document.createElement('span');
                amountText.className = 'text-robux';
                amountText.textContent =
                    gameSpending.totalSpent.toLocaleString();

                valueContainer.appendChild(robuxIcon);
                valueContainer.appendChild(amountText);

                if (gameSpending.totalTransactions > 0) {
                    const txCount = document.createElement('span');
                    txCount.style.cssText =
                        'font-size: 12px; opacity: 0.7; margin-left: 8px;';
                    const purchaseLabel =
                        gameSpending.totalTransactions === 1
                            ? await t('totalSpentGames.singlePurchase')
                            : await t('totalSpentGames.multiplePurchases', {
                                  count: gameSpending.totalTransactions,
                              });
                    txCount.textContent = `(${purchaseLabel})`;
                    valueContainer.appendChild(txCount);
                }
            } catch (error) {
                valueContainer.textContent = await t('totalSpent.errorTitle');
                console.error('RoValra: Failed to load game spending', error);
            }
        },
        {
            multiple: false,
            subtree: true,
        },
    );
}

export default init;
