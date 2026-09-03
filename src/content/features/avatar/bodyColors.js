import { observeElement, observeResize } from '../../core/observer.js';
import { settings } from '../../core/settings/getSettings.js';
import { getAuthenticatedUserId } from '../../core/user.js';
import {
    BODY_COLOR_KEYS,
    getBodyColorPalette,
    getCurrentAvatar,
    setBodyColors,
} from '../../core/apis/avatar.js';
import { showSystemAlert } from '../../core/ui/roblox/alert.js';
import { createButton } from '../../core/ui/buttons.js';
import { Icon } from '../../core/ui/buildericon.js';
import { t } from '../../core/locale/i18n.js';

const PRESETS_STORAGE_KEY = 'rovalra_body_color_presets';
const MAX_PRESETS = 12;
const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

// Roblox only exposes its own palette in the editor, so every part starts from
// a neutral value until the current avatar has been read.
const FALLBACK_COLOR = '#D3D3D3';

// Breathing room kept between the panel and the bottom of the window, plus the
// smallest the scroll area is allowed to get on very short screens.
const BOTTOM_GUTTER_PX = 16;
const MIN_BODY_HEIGHT_PX = 150;

/**
 * The translation key suffix for each body part, in the order they are shown.
 */
const BODY_PART_LABEL_KEYS = {
    headColor3: 'head',
    torsoColor3: 'torso',
    leftArmColor3: 'leftArm',
    rightArmColor3: 'rightArm',
    leftLegColor3: 'leftLeg',
    rightLegColor3: 'rightLeg',
};

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

async function loadPresets() {
    return new Promise((resolve) => {
        chrome.storage.local.get({ [PRESETS_STORAGE_KEY]: [] }, (data) => {
            const stored = data?.[PRESETS_STORAGE_KEY];
            if (!Array.isArray(stored)) {
                resolve([]);
                return;
            }
            resolve(stored.map(normalizeHex).filter(Boolean));
        });
    });
}

async function savePresets(presets) {
    return new Promise((resolve) => {
        chrome.storage.local.set({ [PRESETS_STORAGE_KEY]: presets }, resolve);
    });
}

/**
 * Roblox's avatar editor is a React app holding its own copy of the avatar, so
 * it does not notice writes made behind its back. The editor ships a redraw
 * control for exactly this situation, so let it pull the new colours in rather
 * than reloading the page.
 */
function refreshAvatarPreview() {
    document.querySelector('.redraw-avatar button')?.click();
}

function createSwatchButton(hex, label, onSelect) {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'rovalra-body-colors-swatch';
    swatch.style.backgroundColor = hex;
    swatch.title = label;
    swatch.setAttribute('aria-label', label);
    swatch.addEventListener('click', () => onSelect(hex));
    return swatch;
}

export function init() {
    if (!window.location.pathname.includes('/my/avatar')) return;

    // Roblox is a single page app, so the editor can be torn down and rebuilt
    // without a reload. Keep a handle on everything bound outside the panel so
    // it can be released when the column goes away.
    let teardown = null;

    const releaseListeners = () => {
        teardown?.();
        teardown = null;
    };

    const build = async (leftWrapper) => {
        if (!(await settings.bodyColorsEnabled)) return;
        if (document.getElementById('rovalra-body-colors')) return;

        const userId = await getAuthenticatedUserId();
        if (!userId) return;

        // `colors` is the working copy shown in the panel. It is only written
        // back to Roblox when the user presses Apply.
        const colors = {};
        for (const key of BODY_COLOR_KEYS) colors[key] = FALLBACK_COLOR;

        const rowControls = new Map();
        let applyToAllParts = true;
        // The part a swatch lands on when it is not covering the whole body.
        // Follows whichever row the user last touched.
        let activePart = 'headColor3';
        // Reading the current avatar into the panel is not a user edit, so it
        // must not light up the unsaved-changes hint.
        let seeded = false;
        let presets = await loadPresets();

        const container = document.createElement('div');
        container.id = 'rovalra-body-colors';
        container.className = 'rovalra-body-colors';

        const header = document.createElement('div');
        header.className = 'rovalra-body-colors-header';

        const heading = document.createElement('span');
        heading.className = 'rovalra-body-colors-heading';
        heading.textContent = await t('avatar.bodyColors.title');
        header.appendChild(heading);

        const collapseButton = document.createElement('button');
        collapseButton.type = 'button';
        collapseButton.className = 'rovalra-body-colors-collapse';
        collapseButton.appendChild(
            Icon({ icon: 'keyboard_arrow_up', size: 'small', material: true }),
        );
        header.appendChild(collapseButton);
        container.appendChild(header);

        const body = document.createElement('div');
        body.className = 'rovalra-body-colors-body';
        container.appendChild(body);

        collapseButton.addEventListener('click', () => {
            const collapsed = container.classList.toggle(
                'rovalra-body-colors-collapsed',
            );
            collapseButton.replaceChildren(
                Icon({
                    icon: collapsed
                        ? 'keyboard_arrow_down'
                        : 'keyboard_arrow_up',
                    size: 'small',
                    material: true,
                }),
            );
        });

        /**
         * Write one part into the working copy and sync its two controls. Rows
         * only ever edit their own part, so typing a hex into Left Leg never
         * disturbs the rest of the body.
         */
        const setPartColor = (key, hex) => {
            const normalized = normalizeHex(hex);
            if (!normalized) return;

            if (seeded && colors[key] !== normalized) {
                container.classList.add('rovalra-body-colors-dirty');
            }
            colors[key] = normalized;

            const controls = rowControls.get(key);
            if (!controls) return;
            controls.picker.value = normalized;
            controls.text.value = normalized;
            controls.text.classList.remove('rovalra-body-colors-invalid');
        };

        /**
         * Swatches are the "pick a skin tone" flow, so by default they cover the
         * whole body. Unticking the box narrows them to the row being edited.
         */
        const applySwatch = (hex) => {
            const targets = applyToAllParts ? BODY_COLOR_KEYS : [activePart];
            for (const key of targets) setPartColor(key, hex);
        };

        const linkRow = document.createElement('label');
        linkRow.className = 'rovalra-body-colors-link';

        const linkCheckbox = document.createElement('input');
        linkCheckbox.type = 'checkbox';
        linkCheckbox.checked = applyToAllParts;
        linkCheckbox.addEventListener('change', () => {
            applyToAllParts = linkCheckbox.checked;
        });

        const linkText = document.createElement('span');
        linkText.textContent = await t('avatar.bodyColors.applyToAll');

        linkRow.appendChild(linkCheckbox);
        linkRow.appendChild(linkText);
        body.appendChild(linkRow);

        const rowsWrapper = document.createElement('div');
        rowsWrapper.className = 'rovalra-body-colors-rows';
        body.appendChild(rowsWrapper);

        for (const key of BODY_COLOR_KEYS) {
            const row = document.createElement('div');
            row.className = 'rovalra-body-colors-row';

            const picker = document.createElement('input');
            picker.type = 'color';
            picker.className = 'rovalra-body-colors-picker';
            picker.value = colors[key];

            const label = document.createElement('span');
            label.className = 'rovalra-body-colors-label';
            label.textContent = await t(
                `avatar.bodyColors.parts.${BODY_PART_LABEL_KEYS[key]}`,
            );

            const text = document.createElement('input');
            text.type = 'text';
            text.className = 'rovalra-body-colors-hex';
            text.value = colors[key];
            text.maxLength = 7;
            text.spellcheck = false;
            text.setAttribute('aria-label', label.textContent);

            const markActive = () => {
                activePart = key;
            };
            picker.addEventListener('focus', markActive);
            text.addEventListener('focus', markActive);

            picker.addEventListener('input', () => {
                setPartColor(key, picker.value);
            });

            text.addEventListener('input', () => {
                const normalized = normalizeHex(text.value);
                if (!normalized) {
                    text.classList.add('rovalra-body-colors-invalid');
                    return;
                }
                text.classList.remove('rovalra-body-colors-invalid');
                setPartColor(key, normalized);
            });

            // Restore a valid value when the user leaves an unfinished hex.
            text.addEventListener('blur', () => {
                if (normalizeHex(text.value)) return;
                text.value = colors[key];
                text.classList.remove('rovalra-body-colors-invalid');
            });

            rowsWrapper.appendChild(row);
            row.appendChild(picker);
            row.appendChild(label);
            row.appendChild(text);

            rowControls.set(key, { picker, text });
        }

        const presetSection = document.createElement('div');
        presetSection.className = 'rovalra-body-colors-presets';
        body.appendChild(presetSection);

        const presetHeading = document.createElement('span');
        presetHeading.className = 'rovalra-body-colors-subheading';
        presetHeading.textContent = await t('avatar.bodyColors.savedColors');
        presetSection.appendChild(presetHeading);

        const presetList = document.createElement('div');
        presetList.className = 'rovalra-body-colors-swatches';
        presetSection.appendChild(presetList);

        const emptyPresets = document.createElement('span');
        emptyPresets.className = 'rovalra-body-colors-empty';
        emptyPresets.textContent = await t('avatar.bodyColors.noSavedColors');

        const removeHint = await t('avatar.bodyColors.removeSavedColor');

        const renderPresets = () => {
            presetList.replaceChildren();

            if (presets.length === 0) {
                presetList.appendChild(emptyPresets);
                return;
            }

            for (const hex of presets) {
                const swatch = createSwatchButton(hex, hex, applySwatch);
                // Right click removes a saved colour, matching how the rest of
                // the extension keeps destructive actions out of the way.
                swatch.title = `${hex} — ${removeHint}`;
                swatch.addEventListener('contextmenu', async (event) => {
                    event.preventDefault();
                    presets = presets.filter((entry) => entry !== hex);
                    await savePresets(presets);
                    renderPresets();
                });
                presetList.appendChild(swatch);
            }
        };

        renderPresets();

        const robloxPalette = await getBodyColorPalette();
        if (robloxPalette.length > 0) {
            const paletteHeading = document.createElement('span');
            paletteHeading.className = 'rovalra-body-colors-subheading';
            paletteHeading.textContent = await t(
                'avatar.bodyColors.robloxPalette',
            );
            presetSection.appendChild(paletteHeading);

            const paletteList = document.createElement('div');
            paletteList.className = 'rovalra-body-colors-swatches';
            for (const entry of robloxPalette) {
                paletteList.appendChild(
                    createSwatchButton(entry.hex, entry.name, applySwatch),
                );
            }
            presetSection.appendChild(paletteList);
        }

        // Kept outside the scrolling body so Apply is always on screen. It
        // used to sit below the ~60 swatch palette, where it was easy to miss.
        const actions = document.createElement('div');
        actions.className = 'rovalra-body-colors-actions';
        container.appendChild(actions);

        const applyLabel = await t('avatar.bodyColors.apply');
        const applyingLabel = await t('avatar.bodyColors.applying');

        const saveButton = createButton(
            await t('avatar.bodyColors.saveColor'),
            'secondary',
            {
                onClick: async () => {
                    const hex = colors[activePart];
                    if (presets.includes(hex)) return;
                    presets = [hex, ...presets].slice(0, MAX_PRESETS);
                    await savePresets(presets);
                    renderPresets();
                },
            },
        );

        const applyButton = createButton(applyLabel, 'primary', {
            onClick: async () => {
                applyButton.disabled = true;
                applyButton.textContent = applyingLabel;

                try {
                    const response = await setBodyColors({ ...colors });
                    if (!response.ok)
                        throw new Error(`HTTP ${response.status}`);

                    container.classList.remove('rovalra-body-colors-dirty');
                    showSystemAlert(
                        await t('avatar.bodyColors.applied'),
                        'success',
                    );
                    refreshAvatarPreview();
                } catch (error) {
                    console.error('RoValra: Failed to set body colors', error);
                    showSystemAlert(
                        await t('avatar.bodyColors.applyFailed'),
                        'warning',
                    );
                } finally {
                    applyButton.disabled = false;
                    applyButton.textContent = applyLabel;
                }
            },
        });

        actions.appendChild(saveButton);
        actions.appendChild(applyButton);

        leftWrapper.appendChild(container);

        // The editor's left column is sticky, so it never scrolls with the page
        // and anything the panel pushes past the fold would be unreachable.
        // Measure the room actually left underneath and scroll inside instead.
        let lastMaxHeight = null;

        const fitBodyToViewport = () => {
            if (container.classList.contains('rovalra-body-colors-collapsed')) {
                return;
            }

            const available =
                window.innerHeight -
                body.getBoundingClientRect().top -
                actions.offsetHeight -
                BOTTOM_GUTTER_PX;
            const next = Math.max(MIN_BODY_HEIGHT_PX, Math.round(available));

            // Only write when the value really changed, otherwise resizing the
            // panel feeds straight back into the resize observer below.
            if (next === lastMaxHeight) return;
            lastMaxHeight = next;
            body.style.maxHeight = `${next}px`;
        };

        collapseButton.addEventListener('click', fitBodyToViewport);

        // Measure once the browser has laid the panel out, then keep it in step
        // with the window and with the preview above it changing size.
        requestAnimationFrame(fitBodyToViewport);
        window.addEventListener('resize', fitBodyToViewport);
        const resizeHandle = observeResize(leftWrapper, fitBodyToViewport);

        releaseListeners();
        teardown = () => {
            window.removeEventListener('resize', fitBodyToViewport);
            resizeHandle.unobserve();
        };

        // Seed the panel with whatever the avatar is wearing right now. Done
        // last so a slow request never blocks the UI from rendering.
        try {
            const avatar = await getCurrentAvatar(userId);
            const current = avatar?.bodyColor3s;
            if (current) {
                for (const key of BODY_COLOR_KEYS) {
                    setPartColor(key, current[key]);
                }
            }
        } catch (error) {
            console.error('RoValra: Failed to read body colors', error);
        } finally {
            seeded = true;
        }
    };

    observeElement('.left-wrapper', build, { onRemove: releaseListeners });
}
