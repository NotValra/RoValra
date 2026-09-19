import { callRobloxApi } from "../../core/api";
import { t } from '../../core/locale/i18n.js';
import { settings } from "../../core/settings/getSettings";

const STATUS_SUBDOMAIN = 'status'
const STATUS_SLUG = 'rovalra'
const MAINTENANCE_GROUP_ID = 1;
const MAINTENANCE_MONITOR_ID = 2;
const SETTING_NAME = 'incidentTrackingEnabled'
const SETTING_URL = 'https://www.roblox.com/my/account?rovalra=search&q=incidenttrackingenabled#!/search'

async function incident(status) {
    if (!status.incidents || !status.incidents[0]) return;
    const incident = status.incidents[0];
    const incidentElParent = document.createElement('div');
    const incidentEl = document.createElement('div');
    const incidentTitleEl = document.createElement('span');
    const incidentLinkEl = document.createElement('a');
    const settingLinkEl = document.createElement('a');

    incidentEl.classList.add('alert-info', 'rovalra-status-alert');
    incidentEl.role = 'alert';

    incidentTitleEl.innerText = (
        incident.title
        + (incident.title.endsWith(".") || incident.title.endsWith("!") || incident.title.endsWith("?")
            ? ' '
            : '. '
        )
    );

    incidentLinkEl.innerText = await t('navigation.incidentLearnMore');
    incidentLinkEl.href = 'https://status.rovalra.com';
    incidentLinkEl.target = '_blank';
    incidentLinkEl.style.color = 'unset';
    incidentLinkEl.style.textDecoration = 'underline';

    settingLinkEl.innerText = await t('navigation.incidentHideNotice');
    settingLinkEl.href = SETTING_URL;
    settingLinkEl.target = '_blank';
    settingLinkEl.rel = 'noopener noreferrer';
    settingLinkEl.style.color = 'unset';
    settingLinkEl.style.textDecoration = 'underline';

    incidentEl.append(incidentTitleEl, incidentLinkEl, ' ', settingLinkEl);
    incidentElParent.appendChild(incidentEl);

    const alertContainer = document.querySelector('.alert-container')
    if (alertContainer) {
        alertContainer.appendChild(incidentElParent);
    } else {
        console.warn('RoValra Incident Tracker: unable to find alert container to put element', incidentElParent);
    }
}

async function maintenance(status) {
    if (!status.scheduled_maintenances || !status.scheduled_maintenances[0]) return;
    const scheduledMaintenance = status.scheduled_maintenances[0];
    const maintenanceElParent = document.createElement('div');
    const maintenanceEl = document.createElement('div');
    const maintenanceTitleEl = document.createElement('span');
    const maintenanceLinkEl = document.createElement('a');
    const settingLinkEl = document.createElement('a');

    maintenanceEl.classList.add('alert-info', 'rovalra-status-alert');
    maintenanceEl.role = 'alert';

    const name = scheduledMaintenance.name || '';
    maintenanceTitleEl.innerText = (
        await t('navigation.maintenancePrefix') + ' '
        + name
        + (name.endsWith('.') || name.endsWith('!') || name.endsWith('?')
            ? ' '
            : '. '
        )
    );

    maintenanceLinkEl.innerText = await t('navigation.maintenanceLearnMore');
    maintenanceLinkEl.href = 'https://status.rovalra.com';
    maintenanceLinkEl.target = '_blank';
    maintenanceLinkEl.rel = 'noopener noreferrer';
    maintenanceLinkEl.style.color = 'unset';
    maintenanceLinkEl.style.textDecoration = 'underline';

    settingLinkEl.innerText = await t('navigation.incidentHideNotice');
    settingLinkEl.href = SETTING_URL;
    settingLinkEl.target = '_blank';
    settingLinkEl.rel = 'noopener noreferrer';
    settingLinkEl.style.color = 'unset';
    settingLinkEl.style.textDecoration = 'underline';

    maintenanceEl.append(maintenanceTitleEl, maintenanceLinkEl, ' ', settingLinkEl);
    maintenanceElParent.appendChild(maintenanceEl);

    const alertContainer = document.querySelector('.alert-container');
    if (alertContainer) {
        alertContainer.appendChild(maintenanceElParent);
    } else {
        console.warn('RoValra Maintenance Tracker: unable to find alert container to put element', maintenanceElParent);
    }
}

async function statusChecker() {
    try {

        const statusReq = await callRobloxApi({
            subdomain: STATUS_SUBDOMAIN,
            endpoint: `/api/status-page/${STATUS_SLUG}`,
            isRovalraApi: true,
            noCache: true,
        });

        const statusRes = await statusReq.json();

        await incident(statusRes);
        await maintenance(statusRes);


    } catch (err) {
        console.error("RoValra Status: failed to check status, possibly the status page is down?", err);
    }
}

async function removeStatuses() {
    document.querySelectorAll('.rovalra-status-alert').forEach((a) => a.parentElement.remove());
}

export async function init() {
    if (await settings[SETTING_NAME]) {
        statusChecker();
    }

    document.addEventListener('rovalra:settingSaved', async ({ detail }) => {
        if (!detail.name || detail.name !== SETTING_NAME) return;

        if (detail.value) {
            statusChecker();
        } else {
            removeStatuses();
        }
    })
}
