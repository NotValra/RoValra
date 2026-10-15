import { observeElement } from '../../core/observer.js';
import { settings } from '../../core/settings/getSettings.js';
import { t } from '../../core/locale/i18n.js';
import {
    addTradeActionButton,
    getTradePartnerId,
} from '../../core/trade/ui/tradeActionButton.js';

let observerRequest = null;
const sendButtons = new Map();

async function addSendTradeButton(container) {
    if (sendButtons.has(container)) return;

    const actionButton = addTradeActionButton(container, {
        className: 'rovalra-send-trade-button',
        onClick: () => {
            const userId = getTradePartnerId(container);
            if (!userId) return;

            window.location.href = `https://www.roblox.com/users/${userId}/trade`;
        },
    });
    sendButtons.set(container, actionButton);

    actionButton.button.hidden = true;
    actionButton.setLabel(await t('sendTrade.send'));
    actionButton.button.hidden = false;
}

function removeSendTradeButton(container) {
    sendButtons.get(container)?.remove();
    sendButtons.delete(container);
}

export async function init() {
    if (!(await settings.sendTradeEnabled)) return;

    const path = window.location.pathname;
    if (!path.startsWith('/trades')) {
        observerRequest?.disconnect();
        observerRequest = null;
        [...sendButtons.keys()].forEach(removeSendTradeButton);
        return;
    }
    if (observerRequest) return;

    observerRequest = observeElement(
        '.trades-list-detail .trade-buttons',
        addSendTradeButton,
        { multiple: true, onRemove: removeSendTradeButton },
    );
}
