import { observeElement } from '../../core/observer.js';
import { getPlaceIdFromUrl } from '../../core/idExtractor.js';
import { callRobloxApi, callRobloxApiJson } from '../../core/api.js';
import { settings } from '../../core/settings/getSettings.js';
import { t, ts } from '../../core/locale/i18n.js';
import { createDropdown } from '../../core/ui/dropdown.js';
import { createStyledInput } from '../../core/ui/catalog/input.js';
import { createButton } from '../../core/ui/buttons.js';
import { showConfirmationPrompt } from '../../core/ui/confirmationPrompt.js';
import { Icon } from '../../core/ui/buildericon.js';
import { initSidebarLink } from '../../core/ui/sidebarLink.js';

const SETTING_NAME = 'cloudPlayEnabled';
const PAGE_PATH = '/cloudplay';
const DEFAULT_PLACE_ID = '1818';
const DEFAULT_DEVICE = 'Windows';
const DEVICE_STORAGE_KEY = 'rovalraCloudPlayDevice';
const CONNECT_TIMEOUT_MS = 30000;
const MAX_ERROR_LENGTH = 200;
const ICE_SERVERS = [
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:stun.l.google.com:19302' },
];

const DEVICES = [
    { value: 'Windows', label: 'Windows' },
    { value: 'OSX', label: 'macOS' },
    { value: 'IOS', label: 'iOS' },
    { value: 'Android', label: 'Android' },
    { value: 'XBoxOne', label: 'Xbox' },
    { value: 'PS4', label: 'PlayStation 4' },
    { value: 'PS5', label: 'PlayStation 5' },
    { value: 'MetaOS', label: 'Meta Quest' },
];
const isDevice = (value) => DEVICES.some((device) => device.value === value);

const MotionAction = { DOWN: 0, UP: 1, MOVE: 2 };
const ControlType = { KEYCODE: 0x00, TOUCH: 0x02, TEXT: 0x03 };
const KeyAction = { DOWN: 0, UP: 1 };
const Meta = { SHIFT: 0x1, ALT: 0x2, CTRL: 0x1000 };

const KEYCODES = (() => {
    const map = {
        Enter: 66,
        Escape: 111,
        Backspace: 67,
        Tab: 61,
        Space: 62,
        ArrowUp: 19,
        ArrowDown: 20,
        ArrowLeft: 21,
        ArrowRight: 22,
        ShiftLeft: 59,
        ShiftRight: 60,
        ControlLeft: 113,
        ControlRight: 114,
        AltLeft: 57,
        AltRight: 58,
    };
    for (let i = 0; i < 26; i++) {
        map[`Key${String.fromCharCode(65 + i)}`] = 29 + i;
    }
    for (let i = 0; i < 10; i++) map[`Digit${i}`] = 7 + i;
    for (let i = 1; i <= 12; i++) map[`F${i}`] = 130 + i;
    return map;
})();

class PacketWriter {
    constructor(size) {
        this.buffer = new ArrayBuffer(size);
        this.view = new DataView(this.buffer);
        this.offset = 0;
    }
    byte(v) {
        this.view.setUint8(this.offset++, v);
        return this;
    }
    short(v) {
        this.view.setInt16(this.offset, v | 0, false);
        this.offset += 2;
        return this;
    }
    int(v) {
        this.view.setInt32(this.offset, v | 0, false);
        this.offset += 4;
        return this;
    }
    long(v) {
        this.view.setBigInt64(this.offset, BigInt(v), false);
        this.offset += 8;
        return this;
    }
    bytes(arr) {
        new Uint8Array(this.buffer, this.offset, arr.length).set(arr);
        this.offset += arr.length;
        return this;
    }
    done() {
        return new Uint8Array(this.buffer);
    }
}

function textPacket(text) {
    const bytes = new TextEncoder().encode(text);
    return new PacketWriter(5 + bytes.length)
        .byte(ControlType.TEXT)
        .int(bytes.length)
        .bytes(bytes)
        .done();
}

function keyPacket(event) {
    let meta = 0;
    if (event.ctrlKey) meta |= Meta.CTRL;
    if (event.shiftKey) meta |= Meta.SHIFT;
    if (event.altKey) meta |= Meta.ALT;
    return new PacketWriter(14)
        .byte(ControlType.KEYCODE)
        .byte(event.type === 'keydown' ? KeyAction.DOWN : KeyAction.UP)
        .int(KEYCODES[event.code] || 0)
        .int(event.repeat ? 1 : 0)
        .int(meta)
        .done();
}

function toVideoCoords(video, event) {
    const rect = video.getBoundingClientRect();
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh || !rect.width || !rect.height) return [0, 0];

    const videoRatio = vw / vh;
    const boxRatio = rect.width / rect.height;
    const scale = videoRatio > boxRatio ? rect.height / vh : rect.width / vw;
    const offsetX = (rect.width - vw * scale) / 2;
    const offsetY = (rect.height - vh * scale) / 2;

    const x = (event.clientX - rect.left - offsetX) / scale;
    const y = (event.clientY - rect.top - offsetY) / scale;
    return [
        Math.max(0, Math.min(vw, Math.round(x))),
        Math.max(0, Math.min(vh, Math.round(y))),
    ];
}

function touchPacket(video, action, pointerId, event) {
    const [x, y] = toVideoCoords(video, event);
    return new PacketWriter(32)
        .byte(ControlType.TOUCH)
        .byte(action)
        .long(pointerId)
        .int(x)
        .int(y)
        .short(video.videoWidth)
        .short(video.videoHeight)
        .short((event.pressure * 65536) | 0)
        .int(event.button)
        .int(event.buttons)
        .done();
}

class PointerIds {
    constructor() {
        this.lastSeen = new Map();
        this.assigned = new Map();
        this.free = new Set([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
        this.moveCounter = 0;
    }
    acquire(id) {
        const now = performance.now();
        this.lastSeen.set(id, now);
        for (const [other, seen] of this.lastSeen) {
            if (other !== id && seen < now - 200) this.release(other);
        }
        if (!this.assigned.has(id)) {
            const slot = this.free.values().next().value;
            if (slot !== undefined) this.free.delete(slot);
            this.assigned.set(id, slot ?? id);
        }
        return this.assigned.get(id);
    }
    release(id) {
        const slot = this.assigned.get(id) ?? id;
        if (slot >= 2 && slot <= 11) this.free.add(slot);
        this.lastSeen.delete(id);
        this.assigned.delete(id);
        return slot;
    }
    idFor(event, releasing = false) {
        if (event.pointerType !== 'touch') return event.pointerId;
        return releasing
            ? this.release(event.pointerId)
            : this.acquire(event.pointerId);
    }
    shouldSendMove() {
        this.moveCounter = (this.moveCounter + 1) | 0;
        return (this.moveCounter & 1) === 1;
    }
}

async function requestServerOffer({ sdp, placeId, device }) {
    const probeResults = await callRobloxApiJson({
        subdomain: 'apis',
        endpoint: '/stratus/regional-endpoints',
        noCache: true,
    });

    const response = await callRobloxApi({
        subdomain: 'apis',
        endpoint: '/stratus/offer',
        method: 'POST',
        noCache: true,
        body: {
            sdp,
            placeId: String(placeId),
            platform: device,
            probeResults,
            cookie: '',
            screen: {
                width: window.screen.width,
                height: window.screen.height,
                dpi: (window.devicePixelRatio * 144) | 0,
            },
        },
    });

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(
            `${response.status} ${text}`.trim().slice(0, MAX_ERROR_LENGTH),
        );
    }
    return response.json();
}

class CloudSession {
    constructor({ placeId, device, onEnd }) {
        this.placeId = placeId;
        this.device = device;
        this.onEnd = onEnd;
        this.pointers = new PointerIds();
        this.listeners = new AbortController();
        this.ended = false;
        this.root = this.buildPlayer();
    }

    buildPlayer() {
        const root = document.createElement('div');
        root.className = 'rovalra-cloudplay-player';

        this.video = document.createElement('video');
        this.video.className = 'rovalra-cloudplay-video';
        this.video.autoplay = true;
        this.video.playsInline = true;
        this.video.muted = true;

        this.audio = document.createElement('audio');
        this.audio.autoplay = true;

        this.status = document.createElement('div');
        this.status.className = 'rovalra-cloudplay-status';

        const toolbar = document.createElement('div');
        toolbar.className = 'rovalra-cloudplay-toolbar';
        toolbar.append(
            createButton(ts('cloudPlay.fullscreen'), 'secondary', {
                onClick: () => root.requestFullscreen?.().catch(() => {}),
            }),
            createButton(ts('cloudPlay.exit'), 'secondary', {
                onClick: () => this.end(null),
            }),
        );

        root.append(this.video, this.audio, this.status, toolbar);
        return root;
    }

    setStatus(text) {
        this.status.textContent = text || '';
        this.status.hidden = !text;
    }

    send(packet) {
        if (this.channel?.readyState === 'open') this.channel.send(packet);
    }

    bindInput() {
        const video = this.video;
        const opts = { signal: this.listeners.signal };

        const moveEvent =
            'onpointerrawupdate' in window ? 'pointerrawupdate' : 'pointermove';
        video.addEventListener(
            moveEvent,
            (e) => {
                e.preventDefault();
                if (e.buttons === 0 || !this.pointers.shouldSendMove()) return;
                this.send(
                    touchPacket(
                        video,
                        MotionAction.MOVE,
                        this.pointers.idFor(e),
                        e,
                    ),
                );
            },
            opts,
        );
        video.addEventListener(
            'pointerdown',
            (e) => {
                e.preventDefault();
                video.focus();
                this.send(
                    touchPacket(
                        video,
                        MotionAction.DOWN,
                        this.pointers.idFor(e),
                        e,
                    ),
                );
            },
            opts,
        );
        video.addEventListener(
            'pointerup',
            (e) => {
                e.preventDefault();
                this.send(
                    touchPacket(
                        video,
                        MotionAction.UP,
                        this.pointers.idFor(e, true),
                        e,
                    ),
                );
            },
            opts,
        );
        for (const type of [
            'touchstart',
            'touchmove',
            'touchend',
            'touchcancel',
        ]) {
            video.addEventListener(type, (e) => e.preventDefault(), {
                ...opts,
                passive: false,
            });
        }
        this.root.addEventListener(
            'contextmenu',
            (e) => e.preventDefault(),
            opts,
        );

        const onKey = (e) => {
            if (e.target instanceof HTMLInputElement) return;
            if (e.code === 'F11') return;
            e.preventDefault();
            e.stopPropagation();
            if (
                e.type === 'keydown' &&
                e.key.length === 1 &&
                !e.ctrlKey &&
                !e.altKey &&
                !e.metaKey
            ) {
                this.send(textPacket(e.key));
            }
            this.send(keyPacket(e));
        };
        window.addEventListener('keydown', onKey, { ...opts, capture: true });
        window.addEventListener('keyup', onKey, { ...opts, capture: true });
    }

    async start() {
        document.body.appendChild(this.root);
        document.documentElement.classList.add('rovalra-cloudplay-active');
        this.setStatus(ts('cloudPlay.requesting'));

        try {
            const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
            this.pc = pc;
            this.channel = pc.createDataChannel('chat', {});
            pc.addTransceiver('video', { direction: 'recvonly' });
            pc.addTransceiver('audio', { direction: 'recvonly' });

            let localCandidates = 0;
            pc.onicegatheringstatechange = () => {
                if (pc.iceGatheringState === 'complete' && !localCandidates) {
                    this.end(ts('cloudPlay.noCandidates'));
                }
            };
            pc.onicecandidate = (e) => {
                if (e.candidate?.candidate) localCandidates++;
            };

            this.video.addEventListener(
                'playing',
                () => {
                    window.clearTimeout(this.connectTimeout);
                    this.setStatus(null);
                },
                { once: true },
            );

            pc.ontrack = (event) => {
                const target =
                    event.track.kind === 'video' ? this.video : this.audio;
                target.srcObject = event.streams[0];
            };
            pc.onconnectionstatechange = () => {
                const state = pc.connectionState;
                if (state === 'connected') {
                    window.clearTimeout(this.connectTimeout);
                    this.setStatus(null);
                } else if (state === 'connecting') {
                    this.setStatus(ts('cloudPlay.connecting'));
                } else if (
                    state === 'disconnected' ||
                    state === 'failed' ||
                    state === 'closed'
                ) {
                    this.end(ts('cloudPlay.disconnected'));
                }
            };

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            const answer = await requestServerOffer({
                sdp: pc.localDescription.sdp,
                placeId: this.placeId,
                device: this.device,
            });
            if (this.ended) return;

            this.connectTimeout = window.setTimeout(() => {
                this.end(
                    ts('cloudPlay.timedOut', {
                        state: `${pc.connectionState} / ICE ${pc.iceConnectionState}`,
                    }),
                );
            }, CONNECT_TIMEOUT_MS);

            await pc.setRemoteDescription({
                type: answer.type,
                sdp: answer.sdp,
            });
            this.setStatus(ts('cloudPlay.connecting'));
            this.bindInput();
        } catch (error) {
            console.warn('RoValra: Cloud Play failed to start', error);
            this.end(
                ts('cloudPlay.failed', {
                    error: String(error?.message || error).slice(
                        0,
                        MAX_ERROR_LENGTH,
                    ),
                }),
            );
        }
    }

    end(message) {
        if (this.ended) return;
        this.ended = true;
        window.clearTimeout(this.connectTimeout);
        this.listeners.abort();
        try {
            this.channel?.close();
        } catch {}
        try {
            this.pc?.close();
        } catch {}
        if (document.fullscreenElement === this.root) {
            document.exitFullscreen?.().catch(() => {});
        }
        this.video.srcObject = null;
        this.audio.srcObject = null;
        this.root.remove();
        document.documentElement.classList.remove('rovalra-cloudplay-active');
        this.onEnd?.(message);
    }
}

async function getStoredDevice() {
    try {
        const { [DEVICE_STORAGE_KEY]: stored } =
            await chrome.storage.local.get(DEVICE_STORAGE_KEY);
        return isDevice(stored) ? stored : DEFAULT_DEVICE;
    } catch {
        return DEFAULT_DEVICE;
    }
}

function storeDevice(device) {
    chrome.storage.local.set({ [DEVICE_STORAGE_KEY]: device }).catch(() => {});
}

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

async function renderPage(content) {
    if (content.dataset.rovalraCloudPlay) return;
    content.dataset.rovalraCloudPlay = 'true';

    document.title = await t('cloudPlay.title');
    content.replaceChildren();

    const page = el('div', 'rovalra-cloudplay-page');
    page.append(
        el('h1', 'rovalra-cloudplay-title', ts('cloudPlay.title')),
        el('p', 'rovalra-cloudplay-subtitle', ts('cloudPlay.subtitle')),
    );

    const notes = el('ul', 'rovalra-cloudplay-notes');
    for (const key of ['experimental', 'keyboard', 'exit']) {
        notes.append(el('li', null, ts(`cloudPlay.notes.${key}`)));
    }
    page.append(notes);

    const form = el('div', 'rovalra-cloudplay-form');

    const urlPlaceId = getPlaceIdFromUrl();
    const placeInput = createStyledInput({
        id: 'rovalra-cloudplay-place-id',
        label: ts('cloudPlay.placeId'),
        value: /^\d+$/.test(urlPlaceId || '') ? urlPlaceId : DEFAULT_PLACE_ID,
    });
    placeInput.input.inputMode = 'numeric';

    let device = await getStoredDevice();
    const deviceField = el('div', 'rovalra-cloudplay-field');
    const deviceDropdown = createDropdown({
        items: DEVICES,
        initialValue: device,
        onValueChange: (value) => {
            device = value;
            storeDevice(value);
        },
    });
    deviceField.append(
        el('label', 'rovalra-cloudplay-label', ts('cloudPlay.device')),
        deviceDropdown.element,
    );

    const error = el('div', 'rovalra-cloudplay-error');
    error.hidden = true;
    const showError = (message) => {
        error.textContent = message || '';
        error.hidden = !message;
    };

    let session = null;
    const playButton = createButton(ts('cloudPlay.play'), 'primary', {
        classList: ['rovalra-cloudplay-play'],
        onClick: () => {
            if (session) return;
            const placeId = placeInput.input.value.trim();
            if (!/^\d+$/.test(placeId)) {
                showError(ts('cloudPlay.invalidPlaceId'));
                return;
            }
            showError(null);

            const url = new URL(window.location.href);
            url.searchParams.set('PlaceId', placeId);
            history.replaceState(history.state, '', url);

            playButton.disabled = true;
            showConfirmationPrompt({
                title: ts('cloudPlay.logoutWarning.title'),
                message: ts('cloudPlay.logoutWarning.message'),
                confirmText: ts('cloudPlay.logoutWarning.agree'),
                onConfirm: () => {
                    session = new CloudSession({
                        placeId,
                        device,
                        onEnd: (message) => {
                            session = null;
                            playButton.disabled = false;
                            showError(message);
                        },
                    });
                    session.start();
                },
                onCancel: () => {
                    playButton.disabled = false;
                },
            });
        },
    });

    placeInput.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') playButton.click();
    });

    form.append(placeInput.container, deviceField, playButton, error);
    page.append(form);
    content.append(page);
}

function isCloudPlayPath() {
    const path = window.location.pathname
        .toLowerCase()
        .replace(/^\/[a-z]{2}(?:-[a-z]{2})?(?=\/)/, '')
        .replace(/\/+$/, '');
    return path === PAGE_PATH;
}

export async function init() {
    if (init._run) return;
    init._run = true;

    initSidebarLink({
        id: 'cloud-play',
        path: PAGE_PATH,
        label: () => ts('cloudPlay.title'),
        createIcon: () =>
            Icon({
                material: false,
                size: 'medium',
                icon: 'controller',
                filled: false,
            }),
        settingKeys: [SETTING_NAME, 'cloudPlaySidebarLinkEnabled'],
    });

    if (!isCloudPlayPath()) return;
    if (!(await settings[SETTING_NAME])) return;

    observeElement('.content#content', (content) => {
        renderPage(content);
    });
}
