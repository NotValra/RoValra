import { observeElement } from '../../core/observer.js';
import { settings } from '../../core/settings/getSettings.js';
import { getUserIdFromUrl } from '../../core/idExtractor.js';
import { t } from '../../core/locale/i18n.js';

let observerRequest = null;

function getTradePartnerId(container) {
    const link = container
        .closest('.trades-list-detail')
        ?.querySelector('.paired-name');
    return link ? getUserIdFromUrl(link.href) : null;
}

async function addSendTradeButton(container) {
    if (container.querySelector('.rovalra-send-trade-button')) return;

    const button = document.createElement('button');
    button.className = 'btn-control-md rovalra-send-trade-button';
    button.textContent = await t('sendTrade.send');

    button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const userId = getTradePartnerId(container);
        if (!userId) return;

        window.location.href = `https://www.roblox.com/users/${userId}/trade`;
    });

    container.appendChild(button);
}

export async function init() {
    if (!(await settings.sendTradeEnabled)) return;

    const path = window.location.pathname;
    if (!path.startsWith('/trades')) {
        if (observerRequest) {
            observerRequest.active = false;
            observerRequest = null;
        }
        return;
    }
    if (observerRequest) return;

    observerRequest = observeElement('.trade-buttons', addSendTradeButton, {
        multiple: true,
    });
}
