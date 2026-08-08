import { observeElement } from '../../core/observer.js';
import { getGroupIdFromUrl } from '../../core/idExtractor.js';
import { callRobloxApiJson } from '../../core/api.js';
import { t } from '../../core/locale/i18n.js';

const PROCESSED_ATTR = 'data-rovalra-pending-funds-processed';
const PENDING_ROW_CLASS = 'rovalra-group-pending-funds';
const ROBUX_ICON_VIEWBOX = '0 0 28 28';

async function fetchPendingRobux(groupId) {
    const data = await callRobloxApiJson({
        subdomain: 'apis',
        endpoint: `/transaction-records/v1/groups/${groupId}/revenue/summary/day`,
    });
    return Number(data?.pendingRobux) || 0;
}

function findFundsSection(dialogBody) {
    const headers = dialogBody.querySelectorAll(
        '.group-description-dialog-body-header',
    );
    for (const header of Array.from(headers)) {
        if ((header.textContent || '').trim().toLowerCase() === 'funds') {
            const section = header.parentElement;
            if (
                section &&
                section.querySelector('.group-description-dialog-body-content')
            ) {
                return section;
            }
        }
    }

    const robuxIcon = dialogBody.querySelector(
        `.group-description-dialog-body-content svg[viewBox="${ROBUX_ICON_VIEWBOX}"]`,
    );
    if (robuxIcon) {
        return robuxIcon.closest('.group-description-dialog-body-content')
            ?.parentElement;
    }

    return null;
}

async function injectPendingFunds(dialogBody) {
    const section = findFundsSection(dialogBody);
    if (!section) return;
    if (section.hasAttribute(PROCESSED_ATTR)) return;
    if (section.querySelector(`.${PENDING_ROW_CLASS}`)) return;

    const groupId = getGroupIdFromUrl();
    if (!groupId) return;

    section.setAttribute(PROCESSED_ATTR, 'true');

    let pendingRobux;
    try {
        pendingRobux = await fetchPendingRobux(groupId);
    } catch (error) {
        section.removeAttribute(PROCESSED_ATTR);
        return;
    }

    if (!document.body.contains(section)) return;

    const content = section.querySelector('.group-description-dialog-body-content');
    if (!content) return;

    const sourceIcon = content.querySelector(
        `svg[viewBox="${ROBUX_ICON_VIEWBOX}"]`,
    );

    const pendingRow = document.createElement('span');
    pendingRow.className = `flex items-center gap-xsmall ${PENDING_ROW_CLASS}`;
    pendingRow.style.marginTop = '4px';

    const label = document.createElement('span');
    label.className = 'text-body-medium content-default';
    label.textContent = await t('groupFunds.pending');

    pendingRow.appendChild(label);

    if (sourceIcon) {
        pendingRow.appendChild(sourceIcon.cloneNode(true));
    }

    const amount = document.createElement('span');
    amount.className = 'content-default';
    amount.textContent = pendingRobux.toLocaleString();
    pendingRow.appendChild(amount);

    content.appendChild(pendingRow);
}

export function init() {
    chrome.storage.local.get(
        { groupPendingFundsEnabled: true },
        (settings) => {
            if (!settings.groupPendingFundsEnabled) return;

            observeElement('.group-description-dialog-body', (dialogBody) => {
                injectPendingFunds(dialogBody).catch((error) => {
                    console.warn(
                        'RoValra: Failed to inject group pending funds',
                        error,
                    );
                });
            });
        },
    );
}
