import { callRobloxApiJson } from '../../core/api.js';
import { observeElement } from '../../core/observer.js';
import { getGroupIdFromUrl } from '../../core/idExtractor.js';
import { createPill } from '../../core/ui/general/pill.js';
import { createRobuxIcon } from '../../core/ui/robuxIcon.js';
import { Icon } from '../../core/ui/buildericon.js';
import { t } from '../../core/locale/i18n.js';

const PILL_CLASS = 'rovalra-group-funds-pill';

async function fetchFundsVisibility(groupId) {
    try {
        const settings = await callRobloxApiJson({
            subdomain: 'groups',
            endpoint: `/v1/groups/${groupId}/settings`,
        });
        return typeof settings?.areGroupFundsVisible === 'boolean'
            ? settings.areGroupFundsVisible
            : null;
    } catch {
        return null;
    }
}

async function fetchFundsInfo(groupId) {
    const membership = await callRobloxApiJson({
        subdomain: 'groups',
        endpoint: `/v1/groups/${groupId}/membership`,
    });
    const economy = membership?.permissions?.groupEconomyPermissions;
    if (!economy?.spendGroupFunds && !economy?.viewGroupPayouts) return null;

    const [currency, isPublic] = await Promise.all([
        callRobloxApiJson({
            subdomain: 'economy',
            endpoint: `/v1/groups/${groupId}/currency`,
        }),
        fetchFundsVisibility(groupId),
    ]);
    if (!Number.isFinite(currency?.robux)) return null;

    return { funds: currency.robux, isPublic };
}

function getTooltipKey(isPublic) {
    if (isPublic === true) return 'groupFundsPill.tooltip';
    if (isPublic === false) return 'groupFundsPill.privateTooltip';
    return 'groupFundsPill.roleTooltip';
}

async function addFundsPill(container) {
    const groupId = getGroupIdFromUrl();
    if (!groupId) return;

    const info = await fetchFundsInfo(groupId).catch(() => null);
    if (!info || !container.isConnected) return;
    if (getGroupIdFromUrl() !== groupId) return;
    if (container.querySelector(`.${PILL_CLASS}`)) return;

    const amount = document.createElement('span');
    amount.className = 'rovalra-streamer-robux-value';
    amount.textContent = await t('groupFundsPill.label', {
        count: info.funds.toLocaleString(),
    });

    const content = document.createElement('span');
    content.className = 'flex items-center gap-xsmall';
    content.append(createRobuxIcon({ size: '12px' }), amount);

    if (info.isPublic === false) {
        content.append(
            Icon({ icon: 'visibility_off', material: true, size: '14px' }),
        );
    }

    const pill = createPill(content, await t(getTooltipKey(info.isPublic)), {
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
