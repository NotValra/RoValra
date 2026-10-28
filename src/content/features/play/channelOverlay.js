import { settings } from '../../core/settings/getSettings.js';
import { ts } from '../../core/locale/i18n.js';
import { createFloatingPanel } from '../../core/ui/floatingPanel.js';

const SETTING_NAME = 'channelOverlayEnabled';
const STATE_KEY = 'rovalraChannelOverlayState';
const SUPPORTED_HOST = 'play.roblox.com';
const OVERRIDE_KEY = 'rovalra_channelOverride';
const CURRENT_KEY = 'rovalra_currentChannel';
const LIVE_CHANNEL = 'LIVE';

let initialized = false;
let mounted = false;
let currentChannel = null;
let channelUpdater = null;

function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

function getOverride() {
    try {
        return localStorage.getItem(OVERRIDE_KEY);
    } catch {
        return null;
    }
}

function setOverride(channel) {
    try {
        if (channel) localStorage.setItem(OVERRIDE_KEY, channel);
        else localStorage.removeItem(OVERRIDE_KEY);
    } catch {
        return;
    }
}

function readCurrentChannel() {
    try {
        return sessionStorage.getItem(CURRENT_KEY);
    } catch {
        return null;
    }
}

function onChannelDetected(event) {
    currentChannel = event.detail?.channel ?? currentChannel;
    channelUpdater?.();
}

function createButton(className, type, onClick) {
    const button = createElement(
        'button',
        `rovalra-channel-overlay-button ${className}`,
    );
    button.type = type;
    if (onClick) button.addEventListener('click', onClick);
    return button;
}

function build(context) {
    const status = createElement('div', 'rovalra-channel-overlay-channel');
    const dot = createElement('span', 'rovalra-channel-overlay-dot');
    const name = createElement('span', 'rovalra-channel-overlay-channel-name');
    status.append(dot, name);

    const input = createElement('input', 'rovalra-channel-overlay-input');
    input.type = 'text';
    input.spellcheck = false;
    input.autocomplete = 'off';
    input.value = getOverride() ?? '';

    const apply = () => {
        const channel = input.value.trim();
        setOverride(channel);
        context.saveState({ channel: channel || null });
        window.location.reload();
    };
    const reset = () => {
        input.value = '';
        apply();
    };

    const form = createElement('form', 'rovalra-channel-overlay-form');
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        apply();
    });

    const applyButton = createButton('rovalra-channel-overlay-apply', 'submit');
    const resetButton = createButton(
        'rovalra-channel-overlay-reset',
        'button',
        reset,
    );
    const actions = createElement('div', 'rovalra-channel-overlay-actions');
    actions.append(resetButton, applyButton);
    form.append(input, actions);

    channelUpdater = () => {
        const channel = currentChannel ?? readCurrentChannel();
        const isLive = channel?.toUpperCase() === LIVE_CHANNEL;

        status.dataset.live = String(isLive);
        status.dataset.known = String(Boolean(channel));
        name.textContent = channel
            ? isLive
                ? ts('channelOverlay.live')
                : channel
            : ts('channelOverlay.unknown');
        name.title = name.textContent;
    };

    context.track(() => {
        input.placeholder = ts('channelOverlay.placeholder');
        input.setAttribute('aria-label', ts('channelOverlay.change'));
        applyButton.textContent = ts('channelOverlay.apply');
        resetButton.textContent = ts('channelOverlay.reset');
        channelUpdater();
    });

    context.body.append(status, form);
}

const panel = createFloatingPanel({
    id: 'channel-overlay',
    stateKey: STATE_KEY,
    titleKey: 'channelOverlay.title',
    labelKeys: {
        collapse: 'channelOverlay.collapse',
        hide: 'channelOverlay.hide',
    },
    keybind: 'F2',
    customButtons: true,
    isolateInput: true,
    build,
});

async function mount() {
    if (mounted) return;
    mounted = true;

    const { [STATE_KEY]: state } = await chrome.storage.local.get(STATE_KEY);
    if (state?.channel && !getOverride()) {
        setOverride(state.channel);
        if (getOverride() === state.channel) {
            window.location.reload();
            return;
        }
    }

    document.addEventListener('rovalra-channel-detected', onChannelDetected);
    await panel.mount({ hidden: false });
}

function unmount() {
    if (mounted) {
        mounted = false;
        document.removeEventListener(
            'rovalra-channel-detected',
            onChannelDetected,
        );
        panel.unmount();
        channelUpdater = null;
    }

    if (getOverride()) {
        setOverride(null);
        window.location.reload();
    }
}

function applySetting(enabled) {
    if (enabled) mount();
    else unmount();
}

export async function init() {
    if (initialized || window.location.hostname !== SUPPORTED_HOST) return;
    initialized = true;

    applySetting((await settings[SETTING_NAME]) === true);

    document.addEventListener('rovalra:settingSaved', (event) => {
        if (event.detail?.name !== SETTING_NAME) return;

        applySetting(event.detail.value === true);
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local' || !changes[SETTING_NAME]) return;

        applySetting(changes[SETTING_NAME].newValue === true);
    });
}
