import { observeElement } from '../../core/observer.js';
import { callRobloxApi } from '../../core/api.js';
import { createDropdown } from '../../core/ui/dropdown.js';
import { createOverlay } from '../../core/ui/overlay.js';
import DOMPurify from 'dompurify';
import {
    createThumbnailElement,
    getBatchThumbnails,
} from '../../core/thumbnail/thumbnails.js';
import { createInteractiveTimestamp } from '../../core/ui/time/time.js';
import { createStyledInput } from '../../core/ui/catalog/input.js';
import { safeHtml } from '../../core/packages/dompurify.js';

function removeHomeElement() {
    const homeElementToRemove = document.querySelector(
        'li.cursor-pointer.btr-nav-node-header_home.btr-nav-header_home',
    );
    if (homeElementToRemove) homeElementToRemove.remove();
}

async function checkModeratorStatus() {
    try {
        const response = await callRobloxApi({
            subdomain: 'apis',
            endpoint: '/v1/auth/moderator/check',
            method: 'GET',
            isRovalraApi: true,
        });

        if (response.ok) {
            return await response.json();
        }
    } catch (err) {
        console.error('Moderator check failed', err);
    }
    return null;
}

async function fetchModerationReasons() {
    try {
        const response = await callRobloxApi({
            subdomain: 'apis',
            endpoint: '/v1/auth/moderator/reasons',
            method: 'GET',
            isRovalraApi: true,
        });

        if (response.ok) {
            const data = await response.json();
            return data.reasons || [];
        }
    } catch (err) {
        console.error('Failed to fetch reasons', err);
    }
    return [];
}

async function fetchConfigDefinitions() {
    try {
        const response = await callRobloxApi({
            subdomain: 'apis',
            endpoint: '/v1/auth/moderator/config/definitions',
            method: 'GET',
            isRovalraApi: true,
        });

        if (response.ok) {
            const data = await response.json();
            return data.definitions || [];
        }
    } catch (err) {
        console.error('Failed to fetch definitions', err);
    }
    return [];
}

async function resolveUsernames(ids) {
    if (!ids || ids.length === 0) return new Map();
    try {
        const response = await callRobloxApi({
            subdomain: 'users',
            endpoint: '/v1/users',
            method: 'POST',
            body: { userIds: ids, excludeBannedUsers: false },
        });

        if (response.ok) {
            const data = await response.json();
            return new Map(data.data.map((u) => [u.id, u.name]));
        }
    } catch (err) {
        console.error('Failed to resolve usernames', err);
    }
    return new Map();
}

async function resolveAppeal(userId, status, response, internalNote) {
    try {
        const res = await callRobloxApi({
            subdomain: 'apis',
            endpoint: '/v1/auth/moderator/appeal/resolve',
            method: 'POST',
            isRovalraApi: true,
            body: {
                user_id: parseInt(userId),
                status: parseInt(status),
                response,
                internal_note: internalNote,
            },
        });
        return res.ok;
    } catch (err) {
        return false;
    }
}

async function showAppealDetailsOverlay(appeal, userName) {
    const body = document.createElement('div');
    body.style.minHeight = '200px';
    body.innerHTML =
        '<div style="padding: 40px; text-align: center;">Loading user details...</div>';

    const overlay = createOverlay({
        title: `Appeal Details: @${userName}`,
        bodyContent: body,
        maxWidth: '700px',
        showLogo: true,
    });

    try {
        const response = await callRobloxApi({
            subdomain: 'apis',
            endpoint: `/v1/auth/moderator/user/${appeal.roblox_user_id}`,
            method: 'GET',
            isRovalraApi: true,
        });

        if (!response.ok) throw new Error('Failed to fetch user data');
        const data = await response.json();
        const profile = data.moderation_profile || {};
        const donator = data.donator_info || {};
        const modReason = profile.moderation_reason || {};

        body.innerHTML = '';
        body.style.display = 'flex';
        body.style.flexDirection = 'column';
        body.style.gap = '20px';

        const infoGrid = document.createElement('div');
        infoGrid.style.display = 'grid';
        infoGrid.style.gridTemplateColumns = '1fr 1fr';
        infoGrid.style.gap = '15px';

        const tiers = [];
        if (donator.donator_1) tiers.push('Tier 1');
        if (donator.donator_2) tiers.push('Tier 2');
        if (donator.donator_3) tiers.push('Tier 3');
        if (donator.legacy_donator) tiers.push('Legacy');
        const tierDisplay = tiers.length > 0 ? tiers.join(', ') : 'None';

        infoGrid.innerHTML = DOMPurify.sanitize(`
            <div style="background: rgba(0,0,0,0.1); padding: 15px; border-radius: 8px; font-size: 13px;">
                <h4 style="margin: 0 0 10px 0; color: #ffb800; font-size: 14px;">Donator Information</h4>
                <div><strong>Total Donated:</strong> ${donator.total_donated || 0} Robux</div>
                <div><strong>Active Tiers:</strong> ${tierDisplay}</div>
                <div><strong>Moderator Tier:</strong> ${donator.moderator_tier || 0}</div>
                <div style="margin-top: 5px; opacity: 0.6; font-size: 11px;">Scope: ${donator.scope || 'openid'}</div>
            </div>
            <div style="background: rgba(0,0,0,0.1); padding: 15px; border-radius: 8px; font-size: 13px;">
                <h4 style="margin: 0 0 10px 0; font-size: 14px;">Moderation Meta</h4>
                <div><strong>Status Level:</strong> ${RESTRICTION_LEVELS[profile.moderation_status] || profile.moderation_status}</div>
                <div style="display: flex; gap: 5px; align-items: center;"><strong>Moderated:</strong> <span class="mod-date-container"></span></div>
                <div><strong>Moderator ID:</strong> ${profile.moderated_by || 'System'}</div>
                <div><strong>Automated:</strong> ${profile.automated ? 'Yes' : 'No'}</div>
            </div>
        `);

        if (profile.moderated_at) {
            infoGrid
                .querySelector('.mod-date-container')
                .appendChild(createInteractiveTimestamp(profile.moderated_at));
        } else {
            infoGrid.querySelector('.mod-date-container').textContent = 'N/A';
        }

        body.appendChild(infoGrid);

        const detailBox = document.createElement('div');
        detailBox.style.padding = '15px';
        detailBox.style.borderRadius = '8px';
        detailBox.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';

        const detailHeader = document.createElement('div');
        detailHeader.style.display = 'flex';
        detailHeader.style.justifyContent = 'space-between';
        detailHeader.style.alignItems = 'start';
        detailHeader.style.marginBottom = '15px';

        detailHeader.innerHTML = DOMPurify.sanitize(`
            <div style="flex: 1;">
            <h4 style="margin: 0 0 10px 0; font-size: 14px;">Reason: ${modReason.title || 'N/A'}</h4>
                <p style="opacity: 0.8; margin: 0;">${modReason.description || ''}</p>
            </div>
        `);

        const submissionTime = document.createElement('div');
        submissionTime.style.textAlign = 'right';
        submissionTime.style.fontSize = '11px';
        submissionTime.style.opacity = '0.7';
        submissionTime.innerHTML =
            '<div style="font-weight: bold; text-transform: uppercase; margin-bottom: 2px;">Created</div>';

        const dateSource = profile.created_at || profile.appeal_submitted_at;
        if (dateSource) {
            submissionTime.appendChild(createInteractiveTimestamp(dateSource));
        } else {
            const span = document.createElement('span');
            span.textContent = 'Unknown';
            submissionTime.appendChild(span);
        }

        if (profile.updated_at) {
            const updatedTime = document.createElement('div');
            updatedTime.style.marginTop = '10px';
            updatedTime.innerHTML = DOMPurify.sanitize(`
                <div style="font-weight: bold; text-transform: uppercase; margin-bottom: 2px;">Updated</div>
            `);
            updatedTime.appendChild(
                createInteractiveTimestamp(profile.updated_at),
            );
            submissionTime.appendChild(updatedTime);
        }

        detailHeader.appendChild(submissionTime);
        detailBox.appendChild(detailHeader);
        const modContent = profile.moderated_content_history || [];
        const modContentHtml =
            modContent.length > 0
                ? `
            <div style="margin-top: 15px; padding-top: 10px; border-top: 1px solid rgba(128,128,128,0.2);">
                <div style="color: #f93e3e; font-weight: bold; text-transform: uppercase; font-size: 11px; margin-bottom: 8px;">Moderated Content</div>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    ${modContent
                        .map(
                            (item) => `
                        <div style="background: rgba(0,0,0,0.1); padding: 8px; border-radius: 4px; font-size: 12px;">
                            <div style="font-weight: bold; color: var(--rovalra-secondary-text-color); font-size: 10px; text-transform: uppercase; margin-bottom: 4px;">${item.config_key}</div>
                            <div style="word-break: break-word;">${item.content_value}</div>
                        </div>
                    `,
                        )
                        .join('')}
                </div>
            </div>
            `
                : '';

        const messageArea = document.createElement('div');
        messageArea.innerHTML = DOMPurify.sanitize(`
            <div style="color: var(--rovalra-secondary-text-color); font-weight: bold; text-transform: uppercase; font-size: 11px; margin-bottom: 8px;">Appeal Message</div>
            <div style="font-style: ${profile.appeal_message ? 'normal' : 'italic'}; opacity: ${profile.appeal_message ? '1' : '0.6'}; background: rgba(0,0,0,0.2); padding: 10px; border-radius: 4px;">
                ${profile.appeal_message || 'User has not submitted an appeal message yet.'}
            </div>
            ${modContentHtml}

            ${
                profile.internal_notes
                    ? `
                <div style="margin-top: 15px; padding-top: 10px; border-top: 1px solid rgba(128,128,128,0.2);">
                    <div style="color: #ff9f43; font-weight: bold; text-transform: uppercase; font-size: 11px; margin-bottom: 4px;">System Internal Notes</div>
                    <div style="font-size: 12px;">${typeof profile.internal_notes === 'object' ? profile.internal_notes.note : profile.internal_notes}</div>
                </div>
            `
                    : ''
            }
            ${
                profile.appeal_internal_notes
                    ? `
                <div style="margin-top: 15px; padding-top: 10px; border-top: 1px solid rgba(128,128,128,0.2);">
                    <div style="color: #4facfe; font-weight: bold; text-transform: uppercase; font-size: 11px; margin-bottom: 4px;">Appeal Internal Notes</div>
                    <div style="font-size: 12px;">${profile.appeal_internal_notes}</div>
                </div>
            `
                    : ''
            }
        `);

        detailBox.appendChild(messageArea);
        body.appendChild(detailBox);

        const responseArea = document.createElement('div');
        responseArea.style.marginTop = '15px';
        const responseLabel = document.createElement('div');
        responseLabel.style.fontSize = '11px';
        responseLabel.style.fontWeight = 'bold';
        responseLabel.style.textTransform = 'uppercase';
        responseLabel.style.marginBottom = '5px';
        responseLabel.textContent = 'Resolution Response';
        const responseInput = document.createElement('textarea');
        responseInput.className = 'form-control input-field';
        responseInput.placeholder = 'Enter response to the user...';
        responseInput.style.minHeight = '80px';
        responseArea.append(responseLabel, responseInput);
        body.appendChild(responseArea);

        const actionRow = document.createElement('div');
        actionRow.style.display = 'flex';
        actionRow.style.gap = '10px';

        const approveBtn = document.createElement('button');
        approveBtn.className = 'btn-primary-md';
        approveBtn.textContent = 'Approve Appeal';
        approveBtn.style.flex = '1';

        const denyBtn = document.createElement('button');
        denyBtn.className = 'btn-secondary-md';
        denyBtn.textContent = 'Deny Appeal';
        denyBtn.style.flex = '1';

        const handleResolve = async (status) => {
            const msg = responseInput.value.trim();
            if (!msg) {
                alert('Please enter a response for the user.');
                return;
            }
            [approveBtn, denyBtn].forEach((b) => (b.disabled = true));
            const success = await resolveAppeal(
                appeal.roblox_user_id,
                status,
                msg,
                'Resolved via Moderation Panel Overlay',
            );
            if (success) {
                alert('Appeal resolved successfully.');
                overlay.remove();
                window.location.reload();
            } else {
                alert('Failed to resolve appeal.');
                [approveBtn, denyBtn].forEach((b) => (b.disabled = false));
            }
        };

        approveBtn.onclick = () => handleResolve(3);
        denyBtn.onclick = () => handleResolve(2);

        if (profile.appeal_status !== 1 || !profile.appeal_message) {
            [approveBtn, denyBtn].forEach((btn) => {
                btn.disabled = true;
                btn.style.opacity = '0.5';
                btn.style.cursor = 'not-allowed';
            });
        }

        actionRow.append(approveBtn, denyBtn);
        body.appendChild(actionRow);
    } catch (err) {
        body.innerHTML = safeHtml`<div style="padding: 40px; text-align: center; color: #f93e3e;">Error: ${err.message}</div>`;
    }
}

function openSubmitAppealOverlay(onSave) {
    const container = document.createElement('div');
    Object.assign(container.style, {
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        paddingTop: '5px',
        alignItems: 'center',
    });

    const { container: inputContainer, input } = createStyledInput({
        id: 'rovalra-appeal-message-input',
        label: 'Enter your appeal message (20-3000 characters)',
        value: '',
        multiline: true,
    });
    inputContainer.style.width = '222px';
    input.minLength = 20;
    input.maxLength = 3000;

    container.appendChild(inputContainer);

    const errorDisplay = document.createElement('p');
    errorDisplay.className = 'text-error';
    Object.assign(errorDisplay.style, {
        display: 'none',
        marginTop: '-4px',
        marginBottom: '0',
    });
    container.appendChild(errorDisplay);

    const submitBtn = document.createElement('button');
    submitBtn.className = 'btn-primary-md';
    submitBtn.textContent = 'Submit Appeal';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn-control-md';
    cancelBtn.textContent = 'Cancel';

    const { close } = createOverlay({
        title: 'Submit Appeal',
        bodyContent: container,
        actions: [cancelBtn, submitBtn],
        maxWidth: '330px',
        preventBackdropClose: true,
    });

    cancelBtn.onclick = close;

    submitBtn.onclick = async () => {
        const appealMessage = input.value.trim();

        if (appealMessage.length < 20 || appealMessage.length > 3000) {
            errorDisplay.textContent =
                'Appeal message must be between 20 and 3000 characters.';
            errorDisplay.style.display = 'block';
            return;
        }

        errorDisplay.style.display = 'none';
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting...';

        const success = await onSave(appealMessage);

        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Appeal';

        if (success) {
            close();
            window.location.reload();
        } else {
            errorDisplay.textContent =
                'Failed to submit appeal. Please try again.';
            errorDisplay.style.display = 'block';
        }
    };
}

async function resolveReport(type, reportId, action) {
    const endpoint =
        type === 'review'
            ? '/v1/auth/moderator/reports/resolve'
            : '/v1/auth/moderator/content-reports/resolve';

    try {
        const res = await callRobloxApi({
            subdomain: 'apis',
            endpoint,
            method: 'POST',
            isRovalraApi: true,
            body: {
                report_id: parseInt(reportId),
                action: action,
            },
        });
        return res.ok;
    } catch (err) {
        return false;
    }
}

async function renderReportsTab(container) {
    container.innerHTML = '<h3>Report Queue</h3>';

    const listContainer = document.createElement('div');
    listContainer.style.display = 'flex';
    listContainer.style.flexDirection = 'column';
    listContainer.style.gap = '15px';
    listContainer.style.marginTop = '20px';
    container.appendChild(listContainer);

    const fetchAndRender = async (type) => {
        const endpoint =
            type === 'review'
                ? '/v1/auth/moderator/reports'
                : '/v1/auth/moderator/content-reports';
        try {
            const res = await callRobloxApi({
                subdomain: 'apis',
                endpoint,
                isRovalraApi: true,
            });
            if (!res.ok) return;
            const data = await res.json();
            const reports = data.reports || [];

            if (reports.length === 0) return;

            reports.forEach((report) => {
                const card = document.createElement('div');
                card.style.padding = '15px';
                card.style.borderRadius = '8px';
                card.style.backgroundColor =
                    'var(--rovalra-container-background-color)';
                card.style.borderLeft = `4px solid ${type === 'review' ? '#4facfe' : '#ff9f43'}`;

                const title =
                    type === 'review'
                        ? 'Universe Review Report'
                        : `Profile Content: ${report.config_key}`;

                card.innerHTML = DOMPurify.sanitize(`
                    <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                        <strong style="text-transform:uppercase; font-size:11px; opacity:0.7;">${title}</strong>
                        <div class="report-time"></div>
                    </div>
                    <div style="margin-bottom:15px; font-size:13px;">
                        ${type === 'review' ? `Review: <em>"${report.review_text}"</em>` : `Content: <strong>${report.content_value}</strong>`}
                        <div style="margin-top:5px; opacity:0.8;">Target User: ${report.user_id || report.roblox_user_id}</div>
                    </div>
                    <div style="display:flex; gap:10px;">
                        <button class="btn-primary-xs resolve-btn" data-action="${type === 'review' ? 'delete' : 'accept'}">
                            ${type === 'review' ? 'Delete Review' : 'Confirm Violation'}
                        </button>
                        <button class="btn-secondary-xs resolve-btn" data-action="dismiss">Dismiss</button>
                    </div>
                `);

                card.querySelector('.report-time').appendChild(
                    createInteractiveTimestamp(report.created_at),
                );

                card.querySelectorAll('.resolve-btn').forEach((btn) => {
                    btn.onclick = async () => {
                        btn.disabled = true;
                        const success = await resolveReport(
                            type,
                            report.id || report.report_id,
                            btn.dataset.action,
                        );
                        if (success) card.remove();
                        else btn.disabled = false;
                    };
                });

                listContainer.appendChild(card);
            });
        } catch (e) {}
    };

    await Promise.all([fetchAndRender('review'), fetchAndRender('content')]);
    if (listContainer.children.length === 0) {
        listContainer.innerHTML =
            '<p style="opacity:0.6;">No pending reports found.</p>';
    }
}

function renderModerationPage(contentDiv) {
    if (window.location.pathname.toLowerCase() !== '/moderation') return;

    contentDiv.innerHTML = '';
    contentDiv.style.position = 'relative';
    contentDiv.style.minHeight = 'calc(100vh - 60px)';

    const container = document.createElement('div');
    container.style.padding = '20px';
    container.style.maxWidth = '1200px';
    container.style.margin = '0 auto';

    const header = document.createElement('div');
    header.style.marginBottom = '30px';
    header.style.borderBottom = '1px solid var(--rovalra-secondary-text-color)';
    header.style.paddingBottom = '20px';

    const h1 = document.createElement('h1');
    h1.textContent = 'Moderation Panel';
    h1.style.fontWeight = '800';
    h1.style.fontSize = '2.5em';
    h1.style.margin = '0 0 10px 0';
    h1.style.color = 'var(--rovalra-main-text-color)';

    const p = document.createElement('p');
    p.textContent = 'RoValra Moderation Management System';
    p.style.color = 'var(--rovalra-secondary-text-color)';
    p.style.margin = '0';

    header.appendChild(h1);
    header.appendChild(p);
    container.appendChild(header);

    const tabsContainer = document.createElement('div');
    tabsContainer.style.display = 'flex';
    tabsContainer.style.gap = '10px';
    tabsContainer.style.marginBottom = '20px';
    tabsContainer.style.flexWrap = 'wrap';

    const contentArea = document.createElement('div');

    const tabs = [
        { id: 'status', label: 'My Status', permission: 0 },
        { id: 'reports', label: 'Reports', permission: 1 },
        { id: 'appeals', label: 'Appeals', permission: 1 },
        { id: 'users', label: 'User Search', permission: 1 },
        { id: 'ban', label: 'Ban / Unban', permission: 2 },
        { id: 'logs', label: 'Action Logs', permission: 2 },
        { id: 'config', label: 'Config', permission: 3 },
    ];

    let activeTab = 'status';
    let moderatorData = null;

    const renderTabContent = async (tabId) => {
        contentArea.innerHTML =
            '<div style="padding: 40px; text-align: center;">Loading...</div>';

        try {
            switch (tabId) {
                case 'status':
                    await renderUserStatusTab(contentArea);
                    break;
                case 'reports':
                    await renderReportsTab(contentArea);
                    break;
                case 'appeals':
                    await renderAppealsTab(contentArea);
                    break;
                case 'users':
                    await renderUserSearchTab(contentArea);
                    break;
                case 'ban':
                    await renderBanTab(contentArea);
                    break;
                case 'logs':
                    await renderLogsTab(contentArea);
                    break;
                case 'config':
                    await renderConfigTab(contentArea);
                    break;
            }
        } catch (err) {
            contentArea.innerHTML = safeHtml`<div style="padding: 40px; text-align: center; color: #f93e3e;">Error loading tab: ${err.message}</div>`;
        }
    };

    checkModeratorStatus().then((data) => {
        moderatorData = data;

        tabs.forEach((tab) => {
            if (
                (moderatorData &&
                    moderatorData.moderator_tier >= tab.permission) ||
                tab.permission === 0
            ) {
                const tabBtn = document.createElement('button');
                tabBtn.textContent = tab.label;
                tabBtn.className =
                    activeTab === tab.id
                        ? 'btn-primary-md'
                        : 'btn-secondary-md';
                tabBtn.style.padding = '8px 16px';
                tabBtn.style.cursor = 'pointer';

                tabBtn.onclick = () => {
                    activeTab = tab.id;
                    tabsContainer.querySelectorAll('button').forEach((btn) => {
                        btn.className = 'btn-secondary-md';
                    });
                    tabBtn.className = 'btn-primary-md';
                    renderTabContent(activeTab);
                };

                tabsContainer.appendChild(tabBtn);
            }
        });

        renderTabContent(activeTab);
    });

    container.appendChild(tabsContainer);
    container.appendChild(contentArea);
    contentDiv.appendChild(container);

    removeHomeElement();
}

const RESTRICTION_LEVELS = [
    'None / No restrictions',
    'Limited',
    'Very Limited',
    'At Risk',
    'Suspended',
];
const APPEAL_STATUSES = [
    'Not appealed',
    'Appeal Pending',
    'Appeal Denied',
    'Appeal Accepted',
];
const APPEAL_STATUS_COLORS = ['#808080', '#FFA500', '#f93e3e', '#49cc90'];

async function renderUserStatusTab(container) {
    container.innerHTML = '';

    try {
        const response = await callRobloxApi({
            subdomain: 'apis',
            endpoint: '/v1/auth/moderation/status',
            method: 'GET',
            isRovalraApi: true,
        });

        if (response.ok) {
            const data = await response.json();

            const statusCard = document.createElement('div');
            statusCard.style.padding = '20px';
            statusCard.style.borderRadius = '8px';
            statusCard.style.backgroundColor =
                'var(--rovalra-container-background-color)';
            statusCard.style.marginBottom = '20px';

            const modReasonRaw = data.moderation.moderation_reason;
            const reasonTitle =
                typeof modReasonRaw === 'string'
                    ? modReasonRaw
                    : modReasonRaw?.title || 'None';
            const reasonDesc =
                typeof modReasonRaw === 'object'
                    ? modReasonRaw?.description
                    : null;

            statusCard.innerHTML = DOMPurify.sanitize(`
                <h3 style="margin-top: 0; margin-bottom: 15px;">Your Moderation Status</h3>
                <div style="display: grid; gap: 10px;">
                    <div><strong>Status:</strong> ${RESTRICTION_LEVELS[data.moderation.moderation_status] || `Unknown Level (${data.moderation.moderation_status})`}</div>
                    <div><strong>Reason:</strong> ${reasonTitle}</div>
                    ${reasonDesc ? `<div style="font-size: 12px; opacity: 0.8; margin-left: 10px;">${reasonDesc}</div>` : ''}
                    <div><strong>Moderator Note:</strong> ${data.moderation.public_moderator_note || 'None'}</div>
                        <div style="display: flex; gap: 5px; align-items: center;"><strong>Moderated At:</strong> <span class="status-mod-time"></span></div>
                </div>
            `);

            const timeSpan = statusCard.querySelector('.status-mod-time');
            if (data.moderation.moderated_at) {
                timeSpan.appendChild(
                    createInteractiveTimestamp(data.moderation.moderated_at),
                );
            } else {
                timeSpan.textContent = 'Never';
            }

            container.appendChild(statusCard);

            if (data.appeal && data.appeal.appeal_status !== null) {
                const appealCard = document.createElement('div');
                appealCard.style.padding = '20px';
                appealCard.style.borderRadius = '8px';
                appealCard.style.backgroundColor =
                    'var(--rovalra-container-background-color)';
                appealCard.style.marginBottom = '20px';

                appealCard.innerHTML = DOMPurify.sanitize(`
                    <h3 style="margin-top: 0; margin-bottom: 15px;">Appeal Status</h3>
                    <div style="display: grid; gap: 10px;">
                        <div><strong>Status:</strong> ${APPEAL_STATUSES[data.appeal.appeal_status] || 'None'}</div>
                        <div><strong>Your Message:</strong> ${data.appeal.appeal_message || 'None'}</div>
                        <div><strong>Response:</strong> ${data.appeal.appeal_response || 'Awaiting response'}</div>
                            <div style="display: flex; gap: 5px; align-items: center;"><strong>Submitted:</strong> <span class="status-appeal-time"></span></div>
                    </div>
                `);

                const appealTimeSpan = appealCard.querySelector(
                    '.status-appeal-time',
                );
                if (data.appeal.appeal_submitted_at) {
                    appealTimeSpan.appendChild(
                        createInteractiveTimestamp(
                            data.appeal.appeal_submitted_at,
                        ),
                    );
                } else {
                    appealTimeSpan.textContent = 'Never';
                }

                container.appendChild(appealCard);
            }

            if (
                data.moderation.moderation_status !== 0 &&
                data.appeal.appeal_status !== 1 &&
                data.appeal.appeal_status !== 3
            ) {
                const submitAppealBtn = document.createElement('button');
                submitAppealBtn.className = 'btn-primary-md';
                submitAppealBtn.textContent = 'Submit New Appeal';
                submitAppealBtn.style.marginTop = '20px';
                submitAppealBtn.style.width = '100%';

                submitAppealBtn.onclick = () => {
                    openSubmitAppealOverlay(async (appealMessage) => {
                        try {
                            const response = await callRobloxApi({
                                subdomain: 'apis',
                                endpoint: '/v1/auth/moderation/appeal',
                                method: 'POST',
                                isRovalraApi: true,
                                body: { message: appealMessage },
                            });

                            if (response.ok) {
                                return true;
                            } else {
                                const errorData = await response.json();
                                throw new Error(
                                    errorData.message || 'Unknown error',
                                );
                            }
                        } catch (error) {
                            console.error('Error submitting appeal:', error);
                            return false;
                        }
                    });
                };
                container.appendChild(submitAppealBtn);
            }

            const testsContainer = document.createElement('div');
            testsContainer.style.padding = '20px';
            testsContainer.style.borderRadius = '8px';
            testsContainer.style.backgroundColor =
                'var(--rovalra-container-background-color)';

            testsContainer.innerHTML = `
                    <h3 style="margin-top: 0; margin-bottom: 5px;">Security Integrity Checks</h3>
                    <p style="font-size: 12px; color: var(--rovalra-secondary-text-color); margin-bottom: 15px;">Verification of endpoint restrictions for your account.</p>
                    <div class="test-results" style="display: grid; gap: 10px;"></div>
                `;
            container.appendChild(testsContainer);

            const resultsDiv = testsContainer.querySelector('.test-results');

            try {
                const res = await callRobloxApi({
                    subdomain: 'apis',
                    endpoint: '/v1/auth/moderator/permissions',
                    isRovalraApi: true,
                });
                const permsData = await res.json();
                const userTier = permsData.user_tier || 0;
                const permissions = permsData.permissions || {};

                resultsDiv.innerHTML = '';

                for (const [key, perm] of Object.entries(permissions)) {
                    const shouldHaveAccess = userTier >= perm.tier;

                    const row = document.createElement('div');
                    row.style.display = 'flex';
                    row.style.justifyContent = 'space-between';
                    row.style.alignItems = 'center';
                    row.style.padding = '10px 15px';
                    row.style.background = 'rgba(0,0,0,0.1)';
                    row.style.borderRadius = '6px';

                    const name = key
                        .replace(/_/g, ' ')
                        .replace(/\b\w/g, (l) => l.toUpperCase());
                    row.innerHTML = safeHtml`<span>${name}</span><span class="test-status" style="font-weight: bold;">...</span>`;
                    resultsDiv.appendChild(row);

                    const statusEl = row.querySelector('.test-status');

                    if (shouldHaveAccess) {
                        statusEl.textContent = 'AUTHORIZED';
                        statusEl.style.color = '#4facfe';
                        continue;
                    }

                    try {
                        const probeRes = await callRobloxApi({
                            subdomain: 'apis',
                            endpoint: perm.url.replace(/<[^>]+>/g, '1'),
                            method: key.startsWith('get_') ? 'GET' : 'POST',
                            isRovalraApi: true,
                            body: !key.startsWith('get_') ? {} : null,
                        });

                        const actualAccess = probeRes.status !== 403;
                        const isSecure = !actualAccess;

                        statusEl.textContent = isSecure ? 'SECURE' : 'BYPASS';
                        statusEl.style.color = isSecure ? '#49cc90' : '#f93e3e';
                    } catch (probeErr) {
                        statusEl.textContent = 'ERROR';
                        statusEl.style.color = '#f93e3e';
                    }
                }
            } catch (e) {
                resultsDiv.querySelectorAll('.test-status').forEach((s) => {
                    s.textContent = 'ERROR';
                    s.style.color = '#f93e3e';
                });
            }
        }
    } catch (err) {
        container.innerHTML = `<div style="color: #f93e3e;">Failed to load status: ${err.message}</div>`; //Verified
    }
}

async function renderAppealsTab(container) {
    container.innerHTML = '';
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.marginBottom = '20px';

    const title = document.createElement('h3');
    title.textContent = 'Appeals Management';
    title.style.margin = '0';
    header.appendChild(title);

    const controls = document.createElement('div');
    controls.style.display = 'flex';
    controls.style.gap = '15px';
    controls.style.alignItems = 'center';

    const { container: searchWrapper, input: searchInput } = createStyledInput({
        id: 'appeal-search',
        label: 'Search User ID / Username',
        placeholder: 'Search...',
    });
    searchWrapper.style.width = '250px';

    let dropdownResult = null;
    let sortDropdown = null;

    const updateFilters = () => {
        const searchTerm = searchInput.value.toLowerCase();
        const statusValue = dropdownResult?.trigger?.dataset?.value || 'all';
        const sortValue = sortDropdown?.trigger?.dataset?.value || 'desc';

        const cards = Array.from(
            appealsContainer.querySelectorAll('.appeal-card'),
        );

        cards.forEach((card) => {
            const matchesStatus =
                statusValue === 'all' || card.dataset.status === statusValue;
            const matchesSearch =
                !searchTerm || card.dataset.search.includes(searchTerm);
            card.style.display =
                matchesStatus && matchesSearch ? 'block' : 'none';
        });

        const sortedCards = cards.sort((a, b) => {
            const tA = parseInt(a.dataset.timestamp);
            const tB = parseInt(b.dataset.timestamp);
            return sortValue === 'desc' ? tB - tA : tA - tB;
        });

        sortedCards.forEach((card) => appealsContainer.appendChild(card));
    };

    searchInput.addEventListener('input', updateFilters);

    const filterOptions = [
        { label: 'All Appeals', value: 'all' },
        { label: 'Not Appealed', value: '0' },
        { label: 'Pending', value: '1' },
        { label: 'Denied', value: '2' },
        { label: 'Accepted', value: '3' },
    ];

    const appealsContainer = document.createElement('div');
    appealsContainer.style.display = 'flex';
    appealsContainer.style.flexDirection = 'column';
    appealsContainer.style.gap = '15px';

    const sortOptions = [
        { label: 'Newest First', value: 'desc' },
        { label: 'Oldest First', value: 'asc' },
    ];

    dropdownResult = createDropdown({
        items: filterOptions,
        initialValue: 'all',
        onValueChange: (val) => {
            if (dropdownResult) dropdownResult.trigger.dataset.value = val;
            updateFilters();
        },
    });
    dropdownResult.trigger.dataset.value = 'all';

    sortDropdown = createDropdown({
        items: sortOptions,
        initialValue: 'desc',
        onValueChange: (val) => {
            if (sortDropdown) sortDropdown.trigger.dataset.value = val;
            updateFilters();
        },
    });
    sortDropdown.trigger.dataset.value = 'desc';

    controls.append(
        searchWrapper,
        dropdownResult.element,
        sortDropdown.element,
    );

    header.appendChild(controls);
    container.appendChild(header);
    container.appendChild(appealsContainer);

    try {
        const response = await callRobloxApi({
            subdomain: 'apis',
            endpoint: '/v1/auth/moderator/appeals',
            method: 'GET',
            isRovalraApi: true,
        });

        if (response.ok) {
            const data = await response.json();

            if (data.appeals && data.appeals.length > 0) {
                const allUserIds = [
                    ...new Set([
                        ...data.appeals.map((a) => a.roblox_user_id),
                        ...data.appeals.map((a) => a.moderated_by),
                    ]),
                ].filter((id) => id);

                const [thumbnailMapArray, usernameMap] = await Promise.all([
                    getBatchThumbnails(allUserIds, 'AvatarHeadshot', '150x150'),
                    resolveUsernames(allUserIds),
                ]);

                const thumbnailMap = new Map(
                    thumbnailMapArray.map((t) => [t.targetId, t]),
                );

                data.appeals.forEach((appeal) => {
                    const userName =
                        usernameMap.get(appeal.roblox_user_id) || 'Unknown';
                    const modName =
                        usernameMap.get(appeal.moderated_by) || 'System';

                    const appealCard = document.createElement('div');
                    appealCard.className = 'appeal-card';
                    appealCard.dataset.status = String(appeal.appeal_status);
                    const timestamp = new Date(
                        appeal.created_at || appeal.appeal_submitted_at,
                    ).getTime();
                    appealCard.dataset.timestamp = String(timestamp);
                    appealCard.dataset.search = `${appeal.roblox_user_id} ${userName.toLowerCase()}`;
                    appealCard.style.padding = '15px';
                    appealCard.style.borderRadius = '8px';
                    appealCard.style.backgroundColor =
                        'var(--rovalra-container-background-color)';

                    appealCard.style.borderLeft = `4px solid ${APPEAL_STATUS_COLORS[appeal.appeal_status] || '#808080'}`;

                    const cardHeader = document.createElement('div');
                    cardHeader.style.display = 'flex';
                    cardHeader.style.justifyContent = 'space-between';
                    cardHeader.style.alignItems = 'center';
                    cardHeader.style.marginBottom = '12px';

                    const userInfo = document.createElement('a');
                    userInfo.href = `https://www.roblox.com/users/${appeal.roblox_user_id}/profile`;
                    userInfo.target = '_blank';
                    userInfo.style.display = 'flex';
                    userInfo.style.alignItems = 'center';
                    userInfo.style.gap = '10px';
                    userInfo.style.textDecoration = 'none';
                    userInfo.style.color = 'inherit';

                    const thumbData = thumbnailMap.get(appeal.roblox_user_id);
                    const thumbEl = createThumbnailElement(
                        thumbData,
                        appeal.roblox_user_id,
                        'appeal-thumb',
                        { width: '40px', height: '40px', borderRadius: '50%' },
                    );

                    const nameWrapper = document.createElement('div');
                    const nameText = document.createElement('strong');
                    nameText.textContent = `@${userName}`;
                    const statusText = document.createElement('div');
                    statusText.style.fontSize = '12px';
                    statusText.textContent =
                        APPEAL_STATUSES[appeal.appeal_status] || 'Unknown';

                    nameWrapper.appendChild(nameText);
                    nameWrapper.appendChild(statusText);
                    userInfo.appendChild(thumbEl);
                    userInfo.appendChild(nameWrapper);

                    const timesWrapper = document.createElement('div');
                    timesWrapper.style.textAlign = 'right';

                    const createdTime = createInteractiveTimestamp(
                        appeal.created_at || appeal.appeal_submitted_at,
                    );
                    createdTime.style.fontSize = '12px';
                    createdTime.style.color =
                        'var(--rovalra-secondary-text-color)';
                    timesWrapper.appendChild(createdTime);

                    if (appeal.updated_at) {
                        const updatedLabel = document.createElement('div');
                        updatedLabel.style.fontSize = '10px';
                        updatedLabel.style.color =
                            'var(--rovalra-secondary-text-color)';
                        updatedLabel.style.opacity = '0.7';
                        updatedLabel.style.marginTop = '2px';
                        updatedLabel.textContent = 'Updated: ';
                        updatedLabel.appendChild(
                            createInteractiveTimestamp(appeal.updated_at),
                        );
                        timesWrapper.appendChild(updatedLabel);
                    }

                    cardHeader.appendChild(userInfo);
                    cardHeader.appendChild(timesWrapper);
                    appealCard.appendChild(cardHeader);

                    const detailsGrid = document.createElement('div');
                    detailsGrid.style.display = 'grid';
                    detailsGrid.style.gridTemplateColumns = '1fr 1fr';
                    detailsGrid.style.gap = '15px';
                    detailsGrid.style.marginBottom = '15px';
                    detailsGrid.style.fontSize = '13px';

                    const modReason = appeal.moderation_reason || {};
                    const disabledFeatures = modReason.disabled_features || [];

                    detailsGrid.innerHTML = DOMPurify.sanitize(`
                        <div style="background: rgba(0,0,0,0.03); padding: 10px; border-radius: 6px;">
                            <div style="margin-bottom: 5px; color: var(--rovalra-secondary-text-color); font-weight: bold; text-transform: uppercase; font-size: 11px;">Moderation Info</div>
                            <div><strong>Reason:</strong> ${modReason.title || 'N/A'}</div>
                            <div style="opacity: 0.8; margin-top: 4px;">${modReason.description || ''}</div>
                            <div style="margin-top: 8px;"><strong>By:</strong> <a href="https://www.roblox.com/users/${appeal.moderated_by}/profile" target="_blank" style="color: inherit;">@${modName}</a> ${appeal.automated ? '<span style="padding: 2px 5px; background: #0084ff; color: white; border-radius: 4px; font-size: 10px; margin-left: 5px;">AUTOMATED</span>' : ''}</div>
                        </div>
                        <div style="background: rgba(0,0,0,0.03); padding: 10px; border-radius: 6px;">
                            <div style="margin-bottom: 5px; color: var(--rovalra-secondary-text-color); font-weight: bold; text-transform: uppercase; font-size: 11px;">Restrictions</div>
                            <div><strong>Level:</strong> ${RESTRICTION_LEVELS[appeal.moderation_status] || appeal.moderation_status}</div>
                            <div style="margin-top: 8px;"><strong>Disabled Features:</strong></div>
                            <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px;">
                                ${disabledFeatures.length > 0 ? disabledFeatures.map((f) => `<span style="background: rgba(0,0,0,0.1); padding: 2px 6px; border-radius: 10px; font-size: 11px;">${f}</span>`).join('') : 'None'}
                            </div>
                        </div>
                    `);
                    appealCard.appendChild(detailsGrid);

                    const moderatedContent =
                        appeal.moderated_content_history || [];
                    const moderatedContentHtml =
                        moderatedContent.length > 0
                            ? `
                        <div style="margin-top: 15px; padding-top: 10px; border-top: 1px solid rgba(128,128,128,0.1);">
                            <div style="color: #f93e3e; font-weight: bold; text-transform: uppercase; font-size: 11px; margin-bottom: 8px;">Moderated Content</div>
                            <div style="display: flex; flex-direction: column; gap: 5px;">
                                ${moderatedContent
                                    .map(
                                        (item) => `
                                    <div style="background: rgba(0,0,0,0.05); padding: 6px; border-radius: 4px; font-size: 11px;">
                                        <span style="font-weight: bold; opacity: 0.7;">${item.config_key}:</span> ${item.content_value}
                                    </div>
                                `,
                                    )
                                    .join('')}
                            </div>
                        </div>
                        `
                            : '';

                    const msgWrapper = document.createElement('div');
                    msgWrapper.style.padding = '12px';
                    msgWrapper.style.background = 'rgba(255, 255, 255, 0.05)';
                    msgWrapper.style.borderRadius = '6px';
                    msgWrapper.style.marginBottom = '15px';

                    msgWrapper.innerHTML = DOMPurify.sanitize(`
                        <div style="color: var(--rovalra-secondary-text-color); font-weight: bold; text-transform: uppercase; font-size: 11px; margin-bottom: 8px;">Appeal Message</div>
                        <div style="font-style: ${appeal.appeal_message ? 'normal' : 'italic'}; opacity: ${appeal.appeal_message ? '1' : '0.5'};">
                            ${appeal.appeal_message || 'User has not submitted an appeal message yet.'}
                        </div>
                        ${moderatedContentHtml}
                        ${
                            appeal.internal_notes
                                ? `
                            <div style="margin-top: 15px; padding-top: 10px; border-top: 1px solid rgba(128,128,128,0.1);">
                                <div style="color: #ff9f43; font-weight: bold; text-transform: uppercase; font-size: 11px; margin-bottom: 4px;">Internal Notes</div>
                                <div style="font-size: 12px;">${typeof appeal.internal_notes === 'object' ? appeal.internal_notes.note : appeal.internal_notes}</div>
                            </div>
                        `
                                : ''
                        }
                    `);
                    appealCard.appendChild(msgWrapper);

                    const detailsBtn = document.createElement('button');
                    detailsBtn.className = 'btn-secondary-md';
                    detailsBtn.textContent = 'View Full Details';
                    detailsBtn.style.width = '100%';
                    detailsBtn.onclick = () =>
                        showAppealDetailsOverlay(appeal, userName);
                    appealCard.appendChild(detailsBtn);

                    appealsContainer.appendChild(appealCard);
                });

                updateFilters();
            } else {
                container.innerHTML +=
                    '<p style="margin-top: 20px; color: var(--rovalra-secondary-text-color);">No pending appeals</p>';
            }
        }
    } catch (err) {
        container.innerHTML += safeHtml`<div style="margin-top: 20px; color: #f93e3e;">Failed to load appeals: ${err.message}</div>`;
    }
}

async function renderUserSearchTab(container) {
    container.innerHTML = '<h3>User Moderation Lookup</h3>';

    const searchGroup = document.createElement('div');
    searchGroup.style.display = 'flex';
    searchGroup.style.gap = '10px';
    searchGroup.style.marginBottom = '20px';

    const userIdInput = document.createElement('input');
    userIdInput.type = 'text';
    userIdInput.placeholder = 'Enter Roblox User ID';
    userIdInput.className = 'form-control input-field';
    userIdInput.style.flex = '1';

    const searchBtn = document.createElement('button');
    searchBtn.textContent = 'Lookup User';
    searchBtn.className = 'btn-primary-md';

    const resultArea = document.createElement('div');

    searchBtn.onclick = async () => {
        const userId = userIdInput.value.trim();
        if (!userId || !/^\d+$/.test(userId)) return;

        resultArea.innerHTML = 'Loading...';

        try {
            const response = await callRobloxApi({
                subdomain: 'apis',
                endpoint: `/v1/auth/moderator/user/${userId}`,
                method: 'GET',
                isRovalraApi: true,
            });

            if (response.ok) {
                const data = await response.json();
                resultArea.innerHTML = '';
                const resultCard = document.createElement('div');
                resultCard.style.padding = '20px';
                resultCard.style.backgroundColor =
                    'var(--rovalra-container-background-color)';
                resultCard.style.borderRadius = '8px';

                const profile = data.moderation_profile || {};
                const donator = data.donator_info || {};
                const tiers = [];
                if (donator.donator_1) tiers.push('1');
                if (donator.donator_2) tiers.push('2');
                if (donator.donator_3) tiers.push('3');

                resultCard.innerHTML = DOMPurify.sanitize(`
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                        <h4 style="margin: 0;">User: @${donator.roblox_username || userId} (${userId})</h4>
                        <div style="display: flex; gap: 8px;">
                            ${tiers.map((t) => `<span style="padding: 2px 8px; background: #ffb800; color: black; border-radius: 12px; font-size: 11px; font-weight: bold;">TIER ${t}</span>`).join('')}
                            ${donator.legacy_donator ? `<span style="padding: 2px 8px; background: #4facfe; color: white; border-radius: 12px; font-size: 11px; font-weight: bold;">LEGACY</span>` : ''}
                        </div>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                        <div style="background: rgba(0,0,0,0.05); padding: 15px; border-radius: 8px;">
                            <h5 style="margin: 0 0 10px 0; font-size: 12px; text-transform: uppercase; color: var(--rovalra-secondary-text-color);">Moderation Status</h5>
                            <div style="font-size: 14px; margin-bottom: 5px;"><strong>${RESTRICTION_LEVELS[profile.moderation_status] || 'Unknown'}</strong></div>
                            <div style="font-size: 12px; opacity: 0.8;">Reason: ${profile.moderation_reason?.title || 'None'}</div>
                        </div>
                        <div style="background: rgba(0,0,0,0.05); padding: 15px; border-radius: 8px;">
                            <h5 style="margin: 0 0 10px 0; font-size: 12px; text-transform: uppercase; color: var(--rovalra-secondary-text-color);">History</h5>
                            <div style="font-size: 12px; margin-bottom: 5px;">Total Donated: <strong>${donator.total_donated || 0} Robux</strong></div>
                            <div style="font-size: 12px; display: flex; gap: 5px; align-items: center;">Moderated: <span class="lookup-mod-time"></span></div>
                        </div>
                    </div>
                    ${
                        profile.internal_notes
                            ? `
                        <div style="margin-top: 15px; background: rgba(255, 159, 67, 0.1); border-left: 3px solid #ff9f43; padding: 10px; border-radius: 4px;">
                            <div style="font-size: 10px; font-weight: bold; text-transform: uppercase; color: #ff9f43; margin-bottom: 4px;">Internal System Notes</div>
                            <div style="font-size: 12px;">${profile.internal_notes}</div>
                        </div>
                    `
                            : ''
                    }
                    <div style="margin-top: 20px;">
                        <button class="btn-secondary-xs" id="copy-raw-json" style="width: 100%;">Copy Raw JSON Data</button>
                    </div>
                `);

                const timeContainer =
                    resultCard.querySelector('.lookup-mod-time');
                if (profile.moderated_at) {
                    timeContainer.appendChild(
                        createInteractiveTimestamp(profile.moderated_at),
                    );
                } else {
                    timeContainer.textContent = 'Never';
                }

                resultCard.querySelector('#copy-raw-json').onclick = () => {
                    navigator.clipboard.writeText(
                        JSON.stringify(data, null, 4),
                    );
                    alert('Copied to clipboard!');
                };

                resultArea.appendChild(resultCard);
            } else {
                resultArea.innerHTML = `<div style="color: #f93e3e;">Failed to load user data</div>`;
            }
        } catch (err) {
            resultArea.innerHTML = safeHtml`<div style="color: #f93e3e;">Error: ${err.message}</div>`;
        }
    };

    searchGroup.appendChild(userIdInput);
    searchGroup.appendChild(searchBtn);
    container.appendChild(searchGroup);
    container.appendChild(resultArea);
}

async function renderBanTab(container) {
    container.innerHTML = '<h3>Ban / Unban User</h3>';

    const form = document.createElement('div');
    form.style.display = 'flex';
    form.style.flexDirection = 'column';
    form.style.gap = '15px';
    form.style.maxWidth = '600px';
    form.style.padding = '20px';
    form.style.backgroundColor = 'var(--rovalra-container-background-color)';
    form.style.borderRadius = '8px';
    form.style.marginTop = '20px';

    const userIdInput = document.createElement('input');
    userIdInput.type = 'text';
    userIdInput.placeholder = 'Roblox User ID';
    userIdInput.className = 'form-control input-field';

    const internalNoteInput = document.createElement('textarea');
    internalNoteInput.placeholder = 'Internal Note (Optional)';
    internalNoteInput.className = 'form-control input-field';
    internalNoteInput.style.minHeight = '60px';

    let selectedReasonId = null;
    const reasonDropdownContainer = document.createElement('div');
    reasonDropdownContainer.innerHTML =
        '<div style="padding: 10px; opacity: 0.6;">Loading reasons...</div>';

    fetchModerationReasons().then((reasons) => {
        reasonDropdownContainer.innerHTML = '';
        const items = reasons.map((r) => ({
            label: `${r.title} (ID: ${r.reason_id})`,
            value: String(r.reason_id),
        }));

        const dropdown = createDropdown({
            items,
            placeholder: 'Select a reason...',
            onValueChange: (val) => {
                selectedReasonId = val;
            },
        });
        reasonDropdownContainer.appendChild(dropdown.element);
    });

    let selectedConfigKey = null;
    const configDropdownContainer = document.createElement('div');
    configDropdownContainer.innerHTML =
        '<div style="padding: 10px; opacity: 0.6;">Loading configurations...</div>';

    fetchConfigDefinitions().then((definitions) => {
        configDropdownContainer.innerHTML = '';
        const items = definitions.map((d) => ({
            label: `Config: ${d.config_key}`,
            value: d.config_key,
        }));
        items.unshift({ label: 'No Config Override', value: '' });

        const dropdown = createDropdown({
            items,
            placeholder: 'Optional Config Override...',
            onValueChange: (val) => {
                selectedConfigKey = val || null;
            },
        });
        configDropdownContainer.appendChild(dropdown.element);
    });

    const buttonsContainer = document.createElement('div');
    buttonsContainer.style.display = 'flex';
    buttonsContainer.style.gap = '10px';

    const banBtn = document.createElement('button');
    banBtn.textContent = 'Ban User';
    banBtn.className = 'btn-primary-md';

    const unbanBtn = document.createElement('button');
    unbanBtn.textContent = 'Unban User';
    unbanBtn.className = 'btn-secondary-md';

    const resultArea = document.createElement('div');

    banBtn.onclick = async () => {
        const userId = userIdInput.value.trim();
        const reasonId = selectedReasonId;

        if (!userId || !/^\d+$/.test(userId) || !reasonId) return;

        resultArea.innerHTML = 'Processing...';

        try {
            const response = await callRobloxApi({
                subdomain: 'apis',
                endpoint: '/v1/auth/moderator/ban',
                method: 'POST',
                isRovalraApi: true,
                body: {
                    user_id: parseInt(userId),
                    reason_id: parseInt(reasonId),
                    internal_note: internalNoteInput.value.trim(),
                    config_key: selectedConfigKey,
                },
            });

            const data = await response.json();
            resultArea.innerHTML = DOMPurify.sanitize(
                `<div style="color: ${response.ok ? '#49cc90' : '#f93e3e'};">${data.message || 'Operation completed'}</div>`,
            );
        } catch (err) {
            resultArea.innerHTML = safeHtml`<div style="color: #f93e3e;">Error: ${err.message}</div>`;
        }
    };

    unbanBtn.onclick = async () => {
        const userId = userIdInput.value.trim();

        if (!userId || !/^\d+$/.test(userId)) return;

        resultArea.innerHTML = 'Processing...';

        try {
            const response = await callRobloxApi({
                subdomain: 'apis',
                endpoint: '/v1/auth/moderator/unban',
                method: 'POST',
                isRovalraApi: true,
                body: {
                    user_id: parseInt(userId),
                },
            });

            const data = await response.json();
            resultArea.innerHTML = DOMPurify.sanitize(
                `<div style="color: ${response.ok ? '#49cc90' : '#f93e3e'};">${data.message || 'Operation completed'}</div>`,
            );
        } catch (err) {
            resultArea.innerHTML = DOMPurify.sanitize(
                `<div style="color: #f93e3e;">Error: ${err.message}</div>`,
            );
        }
    };

    buttonsContainer.appendChild(banBtn);
    buttonsContainer.appendChild(unbanBtn);

    form.appendChild(userIdInput);
    form.appendChild(internalNoteInput);
    form.appendChild(reasonDropdownContainer);
    form.appendChild(configDropdownContainer);
    form.appendChild(buttonsContainer);
    form.appendChild(resultArea);

    container.appendChild(form);
}

async function renderLogsTab(container) {
    container.innerHTML = '<h3>Moderator Action Logs</h3>';

    try {
        const response = await callRobloxApi({
            subdomain: 'apis',
            endpoint: '/v1/auth/moderator/actions',
            method: 'GET',
            isRovalraApi: true,
        });

        if (response.ok) {
            const data = await response.json();

            if (data.actions && data.actions.length > 0) {
                const logsTable = document.createElement('div');
                logsTable.style.marginTop = '20px';
                logsTable.style.display = 'flex';
                logsTable.style.flexDirection = 'column';
                logsTable.style.gap = '10px';

                const allUserIds = [
                    ...new Set([
                        ...data.actions.map((a) => a.action_target),
                        ...data.actions.map((a) => a.moderator_id),
                    ]),
                ].filter((id) => id && /^\d+$/.test(id));

                const [thumbnailMapArray, usernameMap, reasonsList] =
                    await Promise.all([
                        getBatchThumbnails(
                            allUserIds,
                            'AvatarHeadshot',
                            '150x150',
                        ),
                        resolveUsernames(allUserIds.map(Number)),
                        fetchModerationReasons(),
                    ]);

                const reasonsMap = new Map(
                    reasonsList.map((r) => [r.reason_id, r]),
                );
                const thumbnailMap = new Map(
                    thumbnailMapArray.map((t) => [String(t.targetId), t]),
                );

                data.actions.forEach((action) => {
                    const targetName =
                        usernameMap.get(
                            Number(action.action_target || action.target_id),
                        ) ||
                        action.action_target ||
                        action.target_id;
                    const modName =
                        action.moderator_username ||
                        usernameMap.get(Number(action.moderator_id)) ||
                        action.moderator_id;

                    const logEntry = document.createElement('div');
                    logEntry.className = 'log-card';
                    logEntry.style.padding = '15px';
                    logEntry.style.borderRadius = '8px';
                    logEntry.style.backgroundColor =
                        'var(--rovalra-container-background-color)';
                    logEntry.style.display = 'flex';
                    logEntry.style.flexDirection = 'column';
                    logEntry.style.gap = '12px';

                    const headerRow = document.createElement('div');
                    headerRow.style.display = 'flex';
                    headerRow.style.justifyContent = 'space-between';
                    headerRow.style.alignItems = 'center';

                    const leftSide = document.createElement('div');
                    leftSide.style.display = 'flex';
                    leftSide.style.alignItems = 'center';
                    leftSide.style.gap = '15px';

                    const typeBadge = document.createElement('span');
                    typeBadge.textContent = (
                        action.action_type || action.action
                    ).replace(/_/g, ' ');
                    typeBadge.style.fontWeight = 'bold';
                    typeBadge.style.textTransform = 'uppercase';
                    typeBadge.style.fontSize = '11px';
                    typeBadge.style.padding = '2px 6px';
                    typeBadge.style.backgroundColor = 'rgba(0,0,0,0.1)';
                    typeBadge.style.borderRadius = '4px';

                    const targetLink = document.createElement('a');
                    targetLink.href = `https://www.roblox.com/users/${action.action_target || action.target_id}/profile`;
                    targetLink.target = '_blank';
                    targetLink.style.display = 'flex';
                    targetLink.style.alignItems = 'center';
                    targetLink.style.gap = '6px';
                    targetLink.style.textDecoration = 'none';
                    targetLink.style.color = 'inherit';

                    const thumbData = thumbnailMap.get(
                        String(action.action_target || action.target_id),
                    );
                    const thumbEl = createThumbnailElement(
                        thumbData,
                        action.action_target,
                        'log-thumb',
                        { width: '24px', height: '24px', borderRadius: '50%' },
                    );

                    const targetLabel = document.createElement('span');
                    targetLabel.innerHTML = safeHtml`Target: <strong>@${targetName}</strong>`;

                    targetLink.appendChild(thumbEl);
                    targetLink.appendChild(targetLabel);

                    const modInfo = document.createElement('span');
                    modInfo.style.color = 'var(--rovalra-secondary-text-color)';
                    modInfo.innerHTML = safeHtml`• By: <a href="https://www.roblox.com/users/${action.moderator_id}/profile" target="_blank" style="color:inherit; font-weight:500;">@${modName}</a>`;

                    leftSide.appendChild(typeBadge);
                    leftSide.appendChild(targetLink);
                    leftSide.appendChild(modInfo);

                    const rightSide = createInteractiveTimestamp(
                        action.created_at || action.timestamp,
                    );
                    rightSide.style.fontSize = '12px';
                    rightSide.style.color =
                        'var(--rovalra-secondary-text-color)';

                    headerRow.appendChild(leftSide);
                    headerRow.appendChild(rightSide);
                    logEntry.appendChild(headerRow);

                    const actionData = action.action_data || {};
                    const modReason =
                        reasonsMap.get(actionData.reason_id) || {};
                    const disabledFeatures = modReason.disabled_features || [];

                    const detailsGrid = document.createElement('div');
                    detailsGrid.style.display = 'grid';
                    detailsGrid.style.gridTemplateColumns = '1fr 1fr';
                    detailsGrid.style.gap = '15px';
                    detailsGrid.style.fontSize = '12px';

                    detailsGrid.innerHTML = DOMPurify.sanitize(`
                        <div style="background: rgba(0,0,0,0.03); padding: 10px; border-radius: 6px;">
                            <div style="margin-bottom: 5px; color: var(--rovalra-secondary-text-color); font-weight: bold; text-transform: uppercase; font-size: 10px;">Action Details</div>
                            <div><strong>Reason:</strong> ${modReason.title || 'N/A'} ${actionData.reason_id ? `(ID: ${actionData.reason_id})` : ''}</div>
                            <div style="opacity: 0.8; margin-top: 4px;">${modReason.description || ''}</div>
                        </div>
                        <div style="background: rgba(0,0,0,0.03); padding: 10px; border-radius: 6px;">
                            <div style="margin-bottom: 5px; color: var(--rovalra-secondary-text-color); font-weight: bold; text-transform: uppercase; font-size: 10px;">Resulting Restrictions</div>
                            <div><strong>Level:</strong> ${RESTRICTION_LEVELS[actionData.moderation_status] || actionData.moderation_status || 'N/A'}</div>
                            <div style="margin-top: 8px;"><strong>Disabled Features:</strong></div>
                            <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px;">
                                ${disabledFeatures.length > 0 ? disabledFeatures.map((f) => `<span style="background: rgba(0,0,0,0.1); padding: 2px 6px; border-radius: 10px; font-size: 10px;">${f}</span>`).join('') : 'None'}
                            </div>
                        </div>
                    `);
                    logEntry.appendChild(detailsGrid);

                    if (action.ip_hash || action.user_agent) {
                        const meta = document.createElement('div');
                        meta.style.fontSize = '11px';
                        meta.style.opacity = '0.6';
                        meta.style.marginTop = '4px';
                        meta.style.borderTop =
                            '1px solid rgba(128, 128, 128, 0.1)';
                        meta.style.paddingTop = '8px';

                        let metaHtml = '';
                        if (action.ip_hash)
                            metaHtml += `IP Hash: <code>${action.ip_hash}</code>`;
                        if (action.ip_hash && action.user_agent)
                            metaHtml += ' \u2022 ';
                        if (action.user_agent)
                            metaHtml += `UA: <code>${action.user_agent}</code>`;

                        meta.innerHTML = DOMPurify.sanitize(metaHtml);
                        logEntry.appendChild(meta);
                    }

                    logsTable.appendChild(logEntry);
                });

                container.appendChild(logsTable);
            } else {
                container.innerHTML +=
                    '<p style="margin-top: 20px; color: var(--rovalra-secondary-text-color);">No action logs found</p>';
            }
        }
    } catch (err) {
        container.innerHTML += safeHtml`<div style="margin-top: 20px; color: #f93e3e;">Failed to load logs: ${err.message}</div>`;
    }
}

async function renderConfigTab(container) {
    container.innerHTML = '<h3>Moderation Configuration</h3>';

    const form = document.createElement('div');
    form.style.display = 'flex';
    form.style.flexDirection = 'column';
    form.style.gap = '15px';
    form.style.maxWidth = '600px';
    form.style.padding = '20px';
    form.style.backgroundColor = 'var(--rovalra-container-background-color)';
    form.style.borderRadius = '8px';
    form.style.marginTop = '20px';

    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.placeholder = 'Ban Reason Title';
    titleInput.className = 'form-control input-field';

    const descInput = document.createElement('textarea');
    descInput.placeholder = 'Reason Description';
    descInput.className = 'form-control input-field';
    descInput.style.minHeight = '60px';

    const statusInput = document.createElement('input');
    statusInput.type = 'number';
    statusInput.placeholder = 'Moderation Status Level (1-3)';
    statusInput.className = 'form-control input-field';

    const featuresLabel = document.createElement('div');
    featuresLabel.textContent = 'Disabled Features:';
    featuresLabel.style.fontSize = '14px';
    featuresLabel.style.fontWeight = 'bold';

    const featuresContainer = document.createElement('div');
    featuresContainer.style.display = 'flex';
    featuresContainer.style.flexDirection = 'column';
    featuresContainer.style.gap = '8px';
    featuresContainer.style.maxHeight = '150px';
    featuresContainer.style.overflowY = 'auto';
    featuresContainer.style.padding = '10px';
    featuresContainer.style.border =
        '1px solid var(--rovalra-secondary-text-color)';
    featuresContainer.style.borderRadius = '4px';
    featuresContainer.style.backgroundColor = 'rgba(0,0,0,0.05)';

    fetchConfigDefinitions().then((definitions) => {
        definitions.forEach((def) => {
            const label = document.createElement('label');
            label.style.display = 'flex';
            label.style.alignItems = 'center';
            label.style.gap = '8px';
            label.style.cursor = 'pointer';
            if (def.description) label.title = def.description;

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = def.config_key;
            checkbox.className = 'feature-checkbox';
            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(def.config_key));
            featuresContainer.appendChild(label);
        });
    });

    const createBtn = document.createElement('button');
    createBtn.textContent = 'Create Ban Reason';
    createBtn.className = 'btn-primary-md';

    const resultArea = document.createElement('div');

    createBtn.onclick = async () => {
        const title = titleInput.value.trim();
        const description = descInput.value.trim();
        const moderationStatus = parseInt(statusInput.value);
        const disabledFeatures = Array.from(
            featuresContainer.querySelectorAll('.feature-checkbox:checked'),
        ).map((cb) => cb.value);

        if (!title || !description || isNaN(moderationStatus)) return;

        resultArea.innerHTML = 'Processing...';

        try {
            const response = await callRobloxApi({
                subdomain: 'apis',
                endpoint: '/v1/auth/moderator/reasons',
                method: 'POST',
                isRovalraApi: true,
                body: {
                    title: title,
                    description: description,
                    moderation_status: moderationStatus,
                    disabled_features: disabledFeatures,
                },
            });

            const data = await response.json();
            resultArea.innerHTML = DOMPurify.sanitize(
                `<div style="color: ${response.ok ? '#49cc90' : '#f93e3e'};">${data.message || 'Reason created successfully'} ${data.reason?.reason_id ? `(ID: ${data.reason.reason_id})` : ''}</div>`,
            );
        } catch (err) {
            resultArea.innerHTML = DOMPurify.sanitize(
                `<div style="color: #f93e3e;">Error: ${err.message}</div>`,
            );
        }
    };

    form.appendChild(titleInput);
    form.appendChild(descInput);
    form.appendChild(statusInput);
    form.appendChild(featuresLabel);
    form.appendChild(featuresContainer);
    form.appendChild(createBtn);
    form.appendChild(resultArea);
    container.appendChild(form);
}

export function init() {
    const path = window.location.pathname.toLowerCase();

    if (path === '/moderation') {
        observeElement('.content#content', (cDiv) => {
            renderModerationPage(cDiv);
        });
    }
}
