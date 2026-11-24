import { getAssets } from '../../assets.js';
import { ts } from '../../locale/i18n.js';
import {
    getServerUptime,
    getServerUptimeIsEstimate,
    formatUptime,
} from '../../apis/serverApi.js';

const ROW_CLASS = 'rovalra-details-li';

function createIcon(assetName) {
    const icon = document.createElement('span');
    icon.className = 'rovalra-join-info-icon';
    icon.setAttribute('aria-hidden', 'true');
    const url = getAssets()[assetName];
    icon.style.maskImage = `url("${url}")`;
    icon.style.webkitMaskImage = `url("${url}")`;
    return icon;
}

function createLabel(text) {
    const label = document.createElement('strong');
    label.textContent = text;
    return label;
}

function createRow(...children) {
    const row = document.createElement('li');
    row.className = ROW_CLASS;
    row.append(...children.filter(Boolean));
    return row;
}

function createServerIdRow(serverId) {
    const value = document.createElement('span');
    value.className = 'rovalra-spoiler';
    value.textContent = serverId;

    const row = createRow(createLabel(ts('revertLogo.serverId')), ' ', value);
    row.classList.add('rovalra-join-nowrap');
    return row;
}

function createOwnerRow(owner) {
    let avatar;
    if (owner.thumbnailUrl) {
        avatar = document.createElement('img');
        avatar.src = owner.thumbnailUrl;
        avatar.alt = '';
    } else {
        avatar = document.createElement('span');
    }
    avatar.className = 'rovalra-join-owner-avatar';

    const link = document.createElement('a');
    link.href = `https://www.roblox.com/users/${owner.id}/profile`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.className = 'rovalra-join-owner-link';
    link.textContent = owner.displayName;

    return createRow(avatar, createLabel(ts('revertLogo.owner')), ' ', link);
}

function createRegionRow(regionCode, regionName) {
    const countryCode = regionCode.toLowerCase().split('-')[0];
    const flag = document.createElement('img');
    flag.src = `https://flagcdn.com/w20/${encodeURIComponent(countryCode)}.png`;
    flag.alt = regionCode;

    return createRow(flag, ` ${regionName}`);
}

function createUptimeRow(serverId, uptime) {
    const value = document.createElement('span');
    value.className = 'uptime-value';
    value.textContent = formatUptime(
        uptime,
        getServerUptimeIsEstimate(serverId),
    );

    const row = createRow(
        createIcon('serverUptimeIcon'),
        ' ',
        createLabel(ts('revertLogo.uptime')),
        ' ',
        value,
    );
    return { row, value };
}

function createChannelRow(channel) {
    const text = channel || ts('revertLogo.production');

    const wrapper = document.createElement('div');
    wrapper.className = 'rovalra-channel-wrapper';

    const truncated = document.createElement('span');
    truncated.className = 'rovalra-channel-truncated';
    truncated.textContent = text;

    const tooltip = document.createElement('span');
    tooltip.className = 'rovalra-channel-tooltip';
    tooltip.textContent = text;

    wrapper.append(truncated, tooltip);

    return createRow(
        createIcon('serverChannelIcon'),
        ' ',
        createLabel(ts('revertLogo.serverChannel')),
        ' ',
        wrapper,
    );
}

export function buildServerInfoList(info = {}) {
    const {
        serverId,
        isPrivateServer,
        owner,
        regionCode,
        regionName,
        placeVersion,
        channel,
        rccVersion,
    } = info;

    const items = [];
    let uptimeValueElement = null;

    if (serverId) items.push(createServerIdRow(serverId));

    if (isPrivateServer) {
        items.push(
            createRow(
                createIcon('lock'),
                createLabel(ts('revertLogo.privateServer')),
            ),
        );
    }

    if (owner) items.push(createOwnerRow(owner));

    if (regionCode && regionName) {
        items.push(createRegionRow(regionCode, regionName));
    }

    if (placeVersion) {
        items.push(
            createRow(
                createIcon('serverVersionIcon'),
                ' ',
                createLabel(ts('revertLogo.version')),
                ` ${placeVersion}`,
            ),
        );
    }

    const uptime = serverId ? getServerUptime(serverId) : null;
    if (uptime !== null) {
        const { row, value } = createUptimeRow(serverId, uptime);
        uptimeValueElement = value;
        items.push(row);
    }

    if (rccVersion) {
        items.push(
            createRow(
                createIcon('serverRccIcon'),
                ' ',
                createLabel(ts('revertLogo.rcc')),
                ` ${rccVersion}`,
            ),
        );
    }

    items.push(createChannelRow(channel));

    const startLiveUpdates = () => {
        if (!uptimeValueElement) return () => {};

        const intervalId = setInterval(() => {
            if (!uptimeValueElement.isConnected) {
                clearInterval(intervalId);
                return;
            }
            const current = getServerUptime(serverId);
            if (current === null) return;
            uptimeValueElement.textContent = formatUptime(
                current,
                getServerUptimeIsEstimate(serverId),
            );
        }, 1000);

        return () => clearInterval(intervalId);
    };

    return { items, startLiveUpdates };
}
