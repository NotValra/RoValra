import { callRobloxApi } from "../../core/api";
import { settings } from "../../core/settings/getSettings";

const STATUS_SUBDOMAIN = 'status'
const STATUS_SLUG = 'rovalra'
const MAINTENANCE_GROUP_ID = 1;
const MAINTENANCE_MONITOR_ID = 2;
const SETTING_NAME = 'incidentTrackingEnabled'

async function incident(status) {
    if (!status.incidents || !status.incidents[0]) return;
    const incident = status.incidents[0];
    const incidentElParent = document.createElement('div');
    const incidentEl = document.createElement('div');
    const incidentTitleEl = document.createElement('span');
    const incidentLinkEl = document.createElement('a');

    incidentEl.classList.add('alert-info', 'rovalra-status-alert');
    incidentEl.role = 'alert';

    incidentTitleEl.innerText = (
        incident.title
        + (incident.title.endsWith(".") || incident.title.endsWith("!") || incident.title.endsWith("?")
            ? ' '
            : '. '
        )
    );

    incidentLinkEl.innerText = 'Click here to learn more.';
    incidentLinkEl.href = 'https://status.rovalra.com';
    incidentLinkEl.target = '_blank';
    incidentLinkEl.style.color = '#101217';
    incidentLinkEl.style.textDecoration = 'underline';

    incidentEl.append(incidentTitleEl, incidentLinkEl);
    incidentElParent.appendChild(incidentEl);

    const alertContainer = document.querySelector('.alert-container')
    if (alertContainer) {
        alertContainer.appendChild(incidentElParent);
    } else {
        console.warn('RoValra Incident Tracker: unable to find alert container to put element', incidentElParent);
    }
}

async function maintenance(status) {
    //@TODO at some point i dont wanna now.
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

        incident(statusRes);
        maintenance(statusRes);


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
