import { callRobloxApiJson } from '../../core/api.js';
import { observeElement } from '../../core/observer.js';
import { getGroupIdFromUrl } from '../../core/idExtractor.js';
import { createPill } from '../../core/ui/general/pill.js';
import { createRobuxIcon } from '../../core/ui/robuxIcon.js';
import { t } from '../../core/locale/i18n.js';

const PILL_CLASS = 'rovalra-group-funds-pill';

async function fetchVisibleFunds(groupId) {
    const membership = await callRobloxApiJson({
        subdomain: 'groups',
        endpoint: `/v1/groups/${groupId}/membership`,
    });
    const economy = membership?.permissions?.groupEconomyPermissions;
    if (!economy?.spendGroupFunds && !economy?.viewGroupPayouts) return null;

    const currency = await callRobloxApiJson({
        subdomain: 'economy',
        endpoint: `/v1/groups/${groupId}/currency`,
    });
    return Number.isFinite(currency?.robux) ? currency.robux : null;
}

async function addFundsPill(container) {
    const groupId = getGroupIdFromUrl();
    if (!groupId) return;

    const funds = await fetchVisibleFunds(groupId).catch(() => null);
    if (funds === null || !container.isConnected) return;
    if (getGroupIdFromUrl() !== groupId) return;
    if (container.querySelector(`.${PILL_CLASS}`)) return;

    const amount = document.createElement('span');
    amount.className = 'rovalra-streamer-robux-value';
    amount.textContent = await t('groupFundsPill.label', {
        count: funds.toLocaleString(),
    });

    const content = document.createElement('span');
    content.className = 'flex items-center gap-xsmall';
    content.append(createRobuxIcon({ size: '12px' }), amount);

    const pill = createPill(content, await t('groupFundsPill.tooltip'), {
        size: 'small',
        href: `/communities/configure?id=${groupId}#!/revenue/summary`,
    });
    pill.classList.add('profile-insight-pill-button', PILL_CLASS);
    container.appendChild(pill);
}

export function init() {
    chrome.storage.local.get({ groupFundsPillEnabled: true }, (settings) => {
        if (!settings.groupFundsPillEnabled) return;

        observeElement(
            '.profile-insights-container.flex.gap-small',
            (container) => {
                addFundsPill(container).catch((error) =>
                    console.warn(
                        'RoValra: Failed to add the community funds pill',
                        error,
                    ),
                );
            },
        );
    });
}
