import {
    observeElement,
    observeChildren,
    observeAttributes,
} from '../../core/observer.js';
import { settings } from '../../core/settings/getSettings.js';
import { getAuthenticatedUserId } from '../../core/user.js';
import {
    BODY_COLOR_KEYS,
    getCurrentAvatar,
    setBodyColors,
} from '../../core/apis/avatar.js';
import { showSystemAlert } from '../../core/ui/roblox/alert.js';
import { addTooltip } from '../../core/ui/tooltip.js';
import { Icon } from '../../core/ui/buildericon.js';
import { t, ts } from '../../core/locale/i18n.js';

const PRESETS_STORAGE_KEY = 'rovalra_body_color_presets';
const MAX_PRESETS = 12;
const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;
const DOT_MARKER = 'data-rovalra-body-color';

function normalizeHex(value) {
    if (typeof value !== 'string') return null;

    let hex = value.trim();
    if (!hex) return null;
    if (!hex.startsWith('#')) hex = `#${hex}`;

    if (hex.length === 4) {
        hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
    }

    return HEX_PATTERN.test(hex) ? hex.toUpperCase() : null;
}

function loadPresets() {
    return new Promise((resolve) => {
        chrome.storage.local.get({ [PRESETS_STORAGE_KEY]: [] }, (data) => {
            const stored = data?.[PRESETS_STORAGE_KEY];
            resolve(
                Array.isArray(stored)
                    ? stored.map(normalizeHex).filter(Boolean)
                    : [],
            );
        });
    });
}

function savePresets(presets) {
    return new Promise((resolve) => {
        chrome.storage.local.set({ [PRESETS_STORAGE_KEY]: presets }, resolve);
    });
}

// The editor won't notice a write made outside React, so use its redraw control.
function refreshAvatarPreview() {
    document.querySelector('.redraw-avatar button')?.click();
}

export function init() {
    if (!window.location.pathname.includes('/my/avatar')) return;

    let teardown = null;
    let activeList = null;

    const release = () => {
        teardown?.();
        teardown = null;
    };

    // Always after release(), otherwise the child observer puts them straight
    // back.
    const removeDots = (list) => {
        for (const dot of (list || document).querySelectorAll(
            `[${DOT_MARKER}]`,
        )) {
            dot.remove();
        }
    };

    const build = async (list) => {
        if (!(await settings.bodyColorsEnabled)) return;

        release();
        removeDots(list);

        const userId = await getAuthenticatedUserId();
        if (!userId) return;

        let presets = await loadPresets();
        let applying = false;
        let activeHex = null;

        const addHint = await t('avatar.bodyColors.addCustom');
        const failedText = await t('avatar.bodyColors.applyFailed');

        const picker = document.createElement('input');
        picker.type = 'color';
        picker.className = 'rovalra-body-colors-picker';
        picker.setAttribute('aria-label', addHint);

        const addDot = document.createElement('div');
        addDot.className = 'color-dot rovalra-body-colors-add';
        addDot.setAttribute(DOT_MARKER, 'add');
        addDot.append(
            Icon({ icon: 'add', size: 'small', material: true }),
            picker,
        );
        addTooltip(addDot, addHint);

        const apply = async (hex) => {
            if (applying) return false;
            applying = true;

            const body = {};
            for (const key of BODY_COLOR_KEYS) body[key] = hex;

            try {
                const response = await setBodyColors(body);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                activeHex = hex;
                syncActive();
                refreshAvatarPreview();
                return true;
            } catch (error) {
                console.error('RoValra: Failed to set body colours', error);
                showSystemAlert(failedText, 'warning');
                return false;
            } finally {
                applying = false;
            }
        };

        const createDot = (hex) => {
            const dot = document.createElement('div');
            dot.className = 'color-dot';
            dot.setAttribute(DOT_MARKER, 'saved');
            dot.dataset.rovalraHex = hex;
            dot.style.backgroundColor = hex;
            addTooltip(dot, ts('avatar.bodyColors.savedColor', { hex }));

            dot.addEventListener('click', () => apply(hex));
            dot.addEventListener('contextmenu', async (event) => {
                event.preventDefault();
                if (activeHex === hex) activeHex = null;
                presets = presets.filter((entry) => entry !== hex);
                await savePresets(presets);
                dot.remove();
            });

            return dot;
        };

        // The ring is drawn off the editor's own `active` class.
        const syncActive = () => {
            if (!activeHex) return;
            for (const dot of list.querySelectorAll('.color-dot')) {
                dot.classList.toggle(
                    'active',
                    dot.dataset.rovalraHex === activeHex,
                );
            }
        };

        // Moved by hand rather than left to the editor, which only rerenders when
        // its own selection changes and still thinks a preset is selected.
        const releaseActive = (event) => {
            if (!activeHex) return;

            const dot = event.target.closest('.color-dot');
            if (!dot || dot.hasAttribute(DOT_MARKER)) return;

            activeHex = null;
            for (const active of list.querySelectorAll('.color-dot.active')) {
                active.classList.remove('active');
            }
            dot.classList.add('active');
        };

        // The palette dims and locks its dots inline, so these have to follow.
        const syncDisabled = () => {
            const disabled = list.getAttribute('aria-disabled') === 'true';
            for (const dot of list.querySelectorAll(`[${DOT_MARKER}]`)) {
                dot.style.opacity = disabled ? '0.5' : '1';
                dot.style.pointerEvents = disabled ? 'none' : 'auto';
            }
        };

        // Rerenders drop these dots, so put them back. Only what's missing, or
        // this would keep waking the observer that called it.
        const syncDots = () => {
            if (!list.isConnected) return;

            if (!addDot.isConnected) list.appendChild(addDot);

            const present = new Set();
            for (const dot of list.querySelectorAll(
                `[${DOT_MARKER}="saved"]`,
            )) {
                if (presets.includes(dot.dataset.rovalraHex)) {
                    present.add(dot.dataset.rovalraHex);
                } else {
                    dot.remove();
                }
            }

            for (const hex of presets) {
                if (present.has(hex)) continue;
                list.insertBefore(createDot(hex), addDot);
            }

            syncDisabled();
            syncActive();
        };

        // Saved first because applying redraws, and the rebuild reads storage.
        picker.addEventListener('change', async () => {
            const hex = normalizeHex(picker.value);
            if (!hex) return;

            if (!presets.includes(hex)) {
                presets = [hex, ...presets].slice(0, MAX_PRESETS);
                await savePresets(presets);
                syncDots();
            }

            await apply(hex);
        });

        syncDots();

        list.addEventListener('click', releaseActive);

        const children = observeChildren(list, syncDots);
        const attributes = observeAttributes(list, syncDisabled, [
            'aria-disabled',
        ]);

        teardown = () => {
            list.removeEventListener('click', releaseActive);
            children.disconnect();
            attributes.disconnect();
        };

        try {
            const avatar = await getCurrentAvatar(userId);
            const current = normalizeHex(avatar?.bodyColor3s?.headColor3);
            if (!current) return;

            picker.value = current;

            if (presets.includes(current)) {
                activeHex = current;
                syncActive();
            }
        } catch (error) {
            console.error('RoValra: Failed to read body colours', error);
        }
    };

    observeElement(
        '#bodyColors .bodycolors-list',
        (list) => {
            activeList = list;
            build(list);
        },
        {
            onRemove: () => {
                activeList = null;
                release();
            },
        },
    );

    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace !== 'local' || !changes.bodyColorsEnabled) return;

        release();
        removeDots(activeList);

        if (changes.bodyColorsEnabled.newValue !== false && activeList) {
            build(activeList);
        }
    });
}
