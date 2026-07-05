import { observeElement } from '../observer.js';
import { SETTINGS_CONFIG } from './settingConfig.js';
import { getCachedBorders } from '../configs/borders.js';
import { parseMarkdown } from '../utils/markdown.js';
import { getFullRegionName, getContinent } from '../regions.js';
import { getCurrentTheme, THEME_CONFIG } from '../theme.js';
import { createDropdown } from '../ui/dropdown.js';
import { createFileUpload } from '../ui/fileupload.js';
import { createPill } from '../ui/general/pill.js';
import { handleSaveSettings, loadSettings } from './handlesettings.js';
import { createStyledInput } from '../ui/catalog/input.js';
import DOMPurify from 'dompurify';
import { addTooltip } from '../ui/tooltip.js';
import { createButton } from '../ui/buttons.js';
import { showConfirmationPrompt } from '../ui/confirmationPrompt.js';
import {
    getBatchThumbnails,
    createThumbnailElement,
} from '../thumbnail/thumbnails.js';
import { getUserDisplayName } from '../apis/users.js';
import { createUserCard } from '../ui/profile/userCard.js';
import { getAuthenticatedUserId } from '../user.js';
import { getBorders } from '../configs/borders.js';
import { applyBorderToContainer } from '../../features/profile/avatarBorder.js';

const DEFAULT_CONTRIBUTOR_ID = 447170745;
const contributorCache = new Map();

async function attachContributors(container, config, isChild = false) {
    if (
        isChild &&
        !Object.prototype.hasOwnProperty.call(config, 'contributors')
    )
        return;

    const contributors = config.contributors || [];
    const ids =
        contributors.length > 0
            ? contributors
            : isChild
              ? []
              : [DEFAULT_CONTRIBUTOR_ID];

    if (ids.length === 0) return;

    const contributorsWrapper = document.createElement('div');
    contributorsWrapper.className = 'setting-contributors';
    contributorsWrapper.style.cssText =
        'display: flex; flex-wrap: wrap; gap: 6px; margin-top: -2px; justify-content: flex-start;';
    container.appendChild(contributorsWrapper);

    const renderContributor = (id, displayName, thumbData) => {
        const item = document.createElement('div');
        item.className = 'rovalra-donator-card';
        item.style.cssText =
            'display: flex; align-items: center; background: var(--rovalra-container-background-color); padding: 4px 10px 4px 4px; border-radius: 20px; border: none;';

        const link = document.createElement('a');
        link.className = 'avatar-card-link';
        link.href = `https://www.roblox.com/users/${id}/profile`;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.style.cssText =
            'display: flex; align-items: center; gap: 6px; text-decoration: none; cursor: pointer; color: inherit; width: 100%;';

        addTooltip(
            link,
            `${displayName || id} contributed in the making of this feature.`,
            { position: 'top' },
        );

        const thumbContainer = document.createElement('div');
        thumbContainer.className = 'avatar-card-image';
        thumbContainer.style.cssText =
            'width: 20px; height: 20px; border-radius: 50%; overflow: hidden; display: flex; align-items: center; justify-content: center; background: #393b3d; flex-shrink: 0;';

        const thumbEl = createThumbnailElement(thumbData, 'Contributor', '', {
            width: '100%',
            height: '100%',
        });
        thumbContainer.appendChild(thumbEl);

        const name = document.createElement('span');
        name.style.cssText =
            'font-size: 11px; font-weight: 600; color: var(--rovalra-main-text-color); white-space: nowrap;';
        name.textContent = displayName || 'Unknown';

        link.append(thumbContainer, name);
        item.appendChild(link);
        contributorsWrapper.appendChild(item);
    };

    const allInCache = ids.every((id) => contributorCache.has(String(id)));
    if (allInCache) {
        ids.forEach((id) => {
            const data = contributorCache.get(String(id));
            renderContributor(id, data.displayName, data.thumbData);
        });
        return;
    }

    const shimmerFragment = document.createDocumentFragment();
    for (let i = 0; i < ids.length; i++) {
        const shimmerItem = document.createElement('div');
        shimmerItem.className = 'rovalra-donator-card';
        shimmerItem.style.cssText =
            'display: flex; align-items: center; gap: 6px; background: var(--rovalra-container-background-color); padding: 4px 10px 4px 4px; border-radius: 20px; border: none;';

        const shimmerAvatar = document.createElement('div');
        shimmerAvatar.className = 'shimmer avatar-card-image';
        shimmerAvatar.style.cssText =
            'width: 20px; height: 20px; border-radius: 50%;';

        const shimmerName = document.createElement('div');
        shimmerName.className = 'shimmer';
        shimmerName.style.cssText =
            'width: 60px; height: 11px; border-radius: 4px;';

        shimmerItem.append(shimmerAvatar, shimmerName);
        shimmerFragment.appendChild(shimmerItem);
    }
    contributorsWrapper.appendChild(shimmerFragment);

    try {
        const [thumbnails, ...displayNames] = await Promise.all([
            getBatchThumbnails(ids, 'AvatarHeadshot', '48x48'),
            ...ids.map((id) => getUserDisplayName(id)),
        ]);

        contributorsWrapper.innerHTML = '';

        ids.forEach((id, index) => {
            const displayName = displayNames[index];
            const thumbData = thumbnails[index];

            contributorCache.set(String(id), { displayName, thumbData });
            renderContributor(id, displayName, thumbData);
        });
    } catch (error) {
        console.warn('RoValra: Failed to load contributors', error);
    }
}

function createClearStorageButton(storageKey, inputElement, settingType) {
    const btn = createButton('', 'secondary');
    btn.classList.remove('btn-control-md');
    btn.classList.add('btn-control-xs');

    btn.style.marginLeft = '0px';
    btn.style.display = 'inline-flex';
    btn.style.alignItems = 'center';
    btn.style.justifyContent = 'center';
    btn.style.width = '32px';
    btn.style.height = '32px';

    const icon = document.createElement('div');
    icon.style.width = '20px';
    icon.style.height = '20px';
    icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="100%" height="100%"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6zM19 4h-3.5l-1-1h-5l-1 1H5v2h14z"></path></svg>`;
    btn.appendChild(icon);

    addTooltip(btn, 'Clear Storage', { position: 'top' });

    btn.onclick = (e) => {
        e.preventDefault();
        showConfirmationPrompt({
            title: 'Clear Storage',
            message:
                'Are you sure you want to clear the storage for this setting? This will clear stuff this feature stored for its functionality. This cannot be reverted.',
            confirmText: 'Clear',
            confirmType: 'secondary',
            cancelType: 'primary',
            onConfirm: () => {
                chrome.storage.local.remove(storageKey, () => {
                    if (settingType === 'file' && inputElement) {
                        const uploadApi =
                            inputElement._uploadApi ||
                            inputElement.rovalraFileUpload;
                        if (uploadApi) {
                            uploadApi.setFileName(null);
                            uploadApi.showClear(false);
                            uploadApi.clearPreview();
                        }
                    }
                });
            },
        });
    };
    return btn;
}

async function setupAvatarPreview(container, inputElement, settingName) {
    const userId = await getAuthenticatedUserId();
    if (!userId) return;

    const [displayRes, thumbnails] = await Promise.all([
        getUserDisplayName(userId),
        getBatchThumbnails([userId], 'AvatarHeadshot', '150x150'),
    ]);

    const card = createUserCard({
        displayName: displayRes || 'User',
        username: '',
        thumbData: thumbnails[0] || { state: 'Error' },
        href: `https://www.roblox.com/users/${userId}/profile`,
        presenceInfo: 1,
        hidePresence: true,
    });

    card.style.transform = 'scale(1.1)';
    card.style.margin = '20px 0';

    container.innerHTML = '';
    container.appendChild(card);

    let lastBorder = null;
    let lastGradient = null;

    const updatePreview = async (liveData = null) => {
        const avatarEl = card.querySelector('.avatar.avatar-card-fullbody');
        if (!avatarEl) return;

        const settings = await loadSettings();
        const borderChoice = settings.avatarBorderChoice || 'none';
        const grad = liveData || settings.profileGradient;

        if (borderChoice !== lastBorder) {
            const existingImg = avatarEl.querySelector(
                '.rovalra-avatar-border',
            );
            if (existingImg) existingImg.remove();

            const clip = avatarEl.querySelector('.rovalra-avatar-border-clip');
            if (clip) {
                while (clip.firstChild) avatarEl.appendChild(clip.firstChild);
                clip.remove();
            }

            delete avatarEl.dataset.rovalraBorderLoading;

            if (borderChoice !== 'none') {
                const borders = await getBorders();
                const border = borders.find((b) => b.value === borderChoice);
                if (border && border.link) {
                    applyBorderToContainer(avatarEl, border.link, true);
                }
            }
            lastBorder = borderChoice;
        }

        const gradString = grad ? JSON.stringify(grad) : '';
        if (gradString !== lastGradient) {
            const target =
                avatarEl.querySelector('.thumbnail-2d-container') || avatarEl;

            if (grad && grad.enabled) {
                const s1 = (100 - grad.fade) / 2;
                const s2 = 100 - s1;
                target.style.background = `linear-gradient(${grad.angle}deg, ${grad.color1} ${s1}%, ${grad.color2} ${s2}%)`;
            } else {
                target.style.background = '';
            }
            lastGradient = gradString;
        }
    };

    const globalSyncHandler = (e) => {
        const { name } = e.detail;
        if (name === 'avatarBorderChoice' || name === 'profileGradient') {
            updatePreview();
        }
    };

    document.addEventListener('rovalra:settingSaved', globalSyncHandler);

    const observer = observeElement(
        `.preview-card-holder[data-rovalra-preview="${settingName}"]`,
        () => {},
        {
            onRemove: () => {
                document.removeEventListener(
                    'rovalra:settingSaved',
                    globalSyncHandler,
                );
                observer.disconnect();
            },
        },
    );

    inputElement.addEventListener('change', () => updatePreview());
    inputElement.addEventListener('input', () => updatePreview());
    inputElement.addEventListener('rovalra-gradient-update', (e) =>
        updatePreview(e.detail),
    );

    updatePreview();
}

function injectAvatarPreview(container, inputElement, settingName) {
    const previewWrapper = document.createElement('div');
    previewWrapper.className = 'rovalra-preview-section';
    previewWrapper.style.cssText =
        'display: flex; flex-direction: column; align-items: center; padding: 20px; background: var(--rovalra-container-background-color); border-radius: 12px; margin-top: 15px;';
    previewWrapper.innerHTML = `<div style="font-weight: 700; font-size: 12px; text-transform: uppercase; margin-bottom: 10px; color: var(--rovalra-secondary-text-color);">Preview</div><div class="setting-label-divider" style="width: 100%; margin-bottom: 5px;"></div><div class="preview-card-holder" data-rovalra-preview="${settingName}"></div>`;
    container.appendChild(previewWrapper);

    if (inputElement) {
        setupAvatarPreview(
            previewWrapper.querySelector('.preview-card-holder'),
            inputElement,
            settingName,
        );
    }
}

export function findSettingConfig(settingName) {
    for (const category of Object.values(SETTINGS_CONFIG)) {
        for (const [parentSettingName, parentSettingDef] of Object.entries(
            category.settings,
        )) {
            if (parentSettingName === settingName) {
                return parentSettingDef;
            }
            if (
                parentSettingDef.childSettings &&
                parentSettingDef.childSettings[settingName]
            ) {
                return parentSettingDef.childSettings[settingName];
            }
        }
    }
    return null;
}

export function generateSettingInput(settingName, setting, REGIONS = {}) {
    const theme = getCurrentTheme();

    if (setting.type === 'checkbox') {
        const toggleClass = setting.disabled
            ? 'toggle-switch1'
            : 'toggle-switch';
        const label = document.createElement('label');
        label.className = toggleClass;
        label.innerHTML = DOMPurify.sanitize(`
            <input type="checkbox" id="${settingName}" data-setting-name="${settingName}"${setting.disabled ? ' disabled' : ''}>
            <span class="${setting.disabled ? 'slider1' : 'slider'}"></span>`);
        return label;
    } else if (setting.type === 'select') {
        let dropdownOptions = [];
        if (setting.options === 'REGIONS') {
            dropdownOptions.push({
                value: 'AUTO',
                label: getFullRegionName('AUTO'),
            });

            const regionsByContinent = {};
            Object.keys(REGIONS)
                .filter((rc) => rc !== 'AUTO')
                .forEach((regionCode) => {
                    const region = REGIONS[regionCode];
                    const countryCode = regionCode.split('-')[0];
                    const continent = getContinent(countryCode);

                    if (!regionsByContinent[continent]) {
                        regionsByContinent[continent] = [];
                    }

                    regionsByContinent[continent].push({
                        value: regionCode,
                        label: getFullRegionName(regionCode),
                        group: continent,
                    });
                });

            Object.values(regionsByContinent).forEach((regions) => {
                regions.sort((a, b) => a.label.localeCompare(b.label));
            });

            const continentOrder = [
                'North America',
                'South America',
                'Europe',
                'Asia',
                'Africa',
                'Oceania',
                'Other',
            ];
            continentOrder.forEach((continent) => {
                if (regionsByContinent[continent]) {
                    dropdownOptions.push(...regionsByContinent[continent]);
                }
            });
        } else if (setting.options === 'BORDERS') {
            dropdownOptions = getCachedBorders();
        } else if (Array.isArray(setting.options)) {
            dropdownOptions = setting.options;
        }

        const dropdown = createDropdown({
            items: dropdownOptions,
            initialValue: setting.default,
            showFlags: setting.showFlags || false,
            onValueChange: (value) => {
                const hiddenSelect = document.getElementById(settingName);
                if (hiddenSelect) {
                    hiddenSelect.value = value;
                    hiddenSelect.dispatchEvent(
                        new Event('change', { bubbles: true }),
                    );
                }
            },
        });

        const tempDiv = document.createElement('div');
        tempDiv.style.position = 'absolute';
        tempDiv.style.visibility = 'hidden';
        tempDiv.style.height = 'auto';
        tempDiv.style.width = 'auto';
        tempDiv.style.whiteSpace = 'nowrap';
        tempDiv.style.fontSize = '14px';
        tempDiv.style.fontWeight = '500';
        document.body.appendChild(tempDiv);
        let maxItemWidth = 0;
        dropdownOptions.forEach((item) => {
            tempDiv.textContent = item.label;
            maxItemWidth = Math.max(maxItemWidth, tempDiv.clientWidth);
        });
        document.body.removeChild(tempDiv);

        const hiddenSelect = document.createElement('select');
        hiddenSelect.id = settingName;
        hiddenSelect.dataset.settingName = settingName;
        hiddenSelect.style.display = 'none';
        dropdownOptions.forEach((opt) => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label;
            hiddenSelect.appendChild(option);
        });

        const wrapper = document.createElement('div');
        wrapper.style.marginLeft = 'auto';

        if (maxItemWidth > 0) {
            dropdown.element.style.minWidth = `${maxItemWidth + 60}px`;
        }

        hiddenSelect._dropdownApi = dropdown;

        wrapper.append(dropdown.element, hiddenSelect);
        return wrapper;
    } else if (setting.type === 'input') {
        const { container, input } = createStyledInput({
            id: settingName,
            label: setting.placeholder || 'Enter value',
            placeholder: ' ',
        });

        input.dataset.settingName = settingName;

        container.style.marginLeft = 'auto';
        container.style.width = '200px';

        return container;
    } else if (setting.type === 'gradient') {
        const wrapper = document.createElement('div');
        wrapper.id = settingName;
        wrapper.dataset.settingName = settingName;

        wrapper.style.marginLeft = 'auto';

        const toggleWrapper = document.createElement('label');
        toggleWrapper.className = 'toggle-switch';
        toggleWrapper.innerHTML = DOMPurify.sanitize(
            '<input type="checkbox"><span class="slider"></span>',
        );
        const toggleInput = toggleWrapper.querySelector('input');
        toggleInput.checked = setting.default.enabled ?? true;

        wrapper.append(toggleWrapper);

        const contentBody = document.createElement('div');
        contentBody.style.cssText = `
            display: flex; flex-direction: column; gap: 12px;
            background: var(--rovalra-container-background-color);
            padding: 15px; border-radius: 12px;
            margin-top: 10px; margin-left: 24px;
        `;
        wrapper.rovalraVisualizer = contentBody;

        const controls = document.createElement('div');
        controls.style.cssText =
            'display: flex; gap: 10px; align-items: center; justify-content: center;';

        const createSwatch = (id) => {
            const inp = document.createElement('input');
            inp.type = 'color';
            inp.style.cssText =
                'width: 32px; height: 32px; border: 2px solid var(--rovalra-main-text-color); border-radius: 8px; cursor: pointer; background: none; padding: 0;';
            return inp;
        };

        const supportsThirdColor =
            setting.colorCount >= 3 || Boolean(setting.default.color3);
        const color1 = createSwatch('c1');
        const color2 = createSwatch('c2');
        const color3 = supportsThirdColor ? createSwatch('c3') : null;
        color1.value = setting.default.color1;
        color2.value = setting.default.color2;
        if (color3)
            color3.value = setting.default.color3 || setting.default.color2;

        const fadeContainer = document.createElement('div');
        fadeContainer.style.cssText =
            'display: flex; flex-direction: column; gap: 10px; width: 100%;';

        const fadeLabel = document.createElement('div');
        fadeLabel.className = 'text-label-small';
        fadeLabel.textContent = 'Fade Strength';
        fadeLabel.style.fontSize = '12px';

        const fadeSlider = document.createElement('input');
        fadeSlider.type = 'range';
        fadeSlider.min = '0';
        fadeSlider.max = '100';
        fadeSlider.value = setting.default.fade;
        fadeSlider.style.cssText = `
            width: 100%; height: 6px; border-radius: 5px; background: var(--rovalra-border-color);
            outline: none; cursor: pointer; appearance: none;
        `;

        const rangeStyle = document.createElement('style');
        rangeStyle.textContent = `
            #${settingName} input[type=range]::-webkit-slider-thumb { appearance: none; width: 16px; height: 16px; border-radius: 50%; background: var(--rovalra-main-text-color); cursor: pointer; }
            #${settingName} input[type=range]::-moz-range-thumb { width: 16px; height: 16px; border-radius: 50%; background: var(--rovalra-main-text-color); cursor: pointer; border: none; }
        `;
        wrapper.append(rangeStyle);
        fadeContainer.append(fadeLabel, fadeSlider);

        const preview = document.createElement('div');
        preview.style.cssText = `
            width: 100%; height: 60px; border-radius: 8px; position: relative;
            box-shadow: inset 0 2px 4px rgba(0,0,0,0.2); overflow: hidden;
            cursor: crosshair; display: flex; align-items: center; justify-content: center;
        `;

        const angleCircle = document.createElement('div');
        angleCircle.style.cssText = `
            width: 40px; height: 40px; border: 2px dashed var(--rovalra-main-text-color);
            opacity: 0.5;
            border-radius: 50%; position: relative; pointer-events: none;
            background: var(--rovalra-container-background-color);
        `;

        const angleLine = document.createElement('div');
        angleLine.style.cssText = `
            position: absolute; width: 2px; height: 20px; background: var(--rovalra-main-text-color);
            bottom: 50%; left: calc(50% - 1px); transform-origin: bottom center;
        `;

        const handle = document.createElement('div');
        handle.style.cssText = `
            position: absolute; width: 14px; height: 14px; background: var(--rovalra-main-text-color);
            border: 2px solid var(--rovalra-main-background-color); border-radius: 50%; top: -7px; left: -6px;
        `;

        angleLine.appendChild(handle);
        angleCircle.appendChild(angleLine);
        preview.appendChild(angleCircle);
        controls.append(color1, color2);
        if (color3) controls.append(color3);
        contentBody.append(controls, fadeContainer, preview);

        let currentAngle = setting.default.angle;
        let isDragging = false;

        const update = (save = true) => {
            const isEnabled = toggleInput.checked;

            contentBody.style.opacity = isEnabled ? '1' : '0.5';
            contentBody.style.pointerEvents = isEnabled ? 'auto' : 'none';
            if (isEnabled) {
                contentBody.classList.remove('disabled-setting');
            } else {
                contentBody.classList.add('disabled-setting');
            }
            contentBody
                .querySelectorAll('input')
                .forEach((input) => (input.disabled = !isEnabled));

            const val = {
                enabled: isEnabled,
                color1: color1.value,
                color2: color2.value,
                angle: currentAngle,
                fade: parseInt(fadeSlider.value, 10),
            };
            if (color3) val.color3 = color3.value;
            const s1 = (100 - val.fade) / 2;
            const s2 = 100 - s1;
            preview.style.background = color3
                ? `linear-gradient(${currentAngle}deg, ${val.color1} ${s1}%, ${val.color2} 50%, ${val.color3} ${s2}%)`
                : `linear-gradient(${currentAngle}deg, ${val.color1} ${s1}%, ${val.color2} ${s2}%)`;
            angleLine.style.transform = `rotate(${currentAngle}deg)`;
            if (save) handleSaveSettings(settingName, val);
            wrapper.dispatchEvent(
                new CustomEvent('rovalra-gradient-update', { detail: val }),
            );
        };

        const onMove = (e) => {
            if (!isDragging) return;
            const rect = preview.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const dx = e.clientX - cx;
            const dy = e.clientY - cy;

            let angle = ((Math.atan2(dy, dx) * 180) / Math.PI + 90 + 360) % 360;

            const snapInterval = e.shiftKey ? 1 : 15;
            currentAngle = Math.round(angle / snapInterval) * snapInterval;

            currentAngle = currentAngle % 360;
            if (currentAngle < 0) currentAngle += 360;

            update();
        };

        preview.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            isDragging = true;
            onMove(e);
            window.addEventListener('mousemove', onMove);
            window.addEventListener(
                'mouseup',
                () => {
                    isDragging = false;
                    window.removeEventListener('mousemove', onMove);
                },
                { once: true },
            );
        });

        toggleInput.addEventListener('change', () => update());
        color1.addEventListener('input', () => update());
        color2.addEventListener('input', () => update());
        if (color3) color3.addEventListener('input', () => update());
        fadeSlider.addEventListener('input', () => update());

        wrapper.rovalraGradientApi = {
            setValue: (val) => {
                if (!val) return;
                toggleInput.checked = val.enabled !== false;
                color1.value = val.color1 || setting.default.color1;
                color2.value = val.color2 || setting.default.color2;
                if (color3) {
                    color3.value =
                        val.color3 ||
                        setting.default.color3 ||
                        setting.default.color2;
                }
                fadeSlider.value = val.fade ?? 100;
                currentAngle = val.angle;
                update(false);
            },
        };

        setTimeout(() => update(false), 0);

        return wrapper;
    } else if (setting.type === 'color') {
        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.id = settingName;
        colorInput.dataset.settingName = settingName;
        colorInput.style.cssText = `
            width: 32px; height: 32px; border: none; padding: 0; 
            background: none; cursor: pointer; margin-left: auto;
            border-radius: 4px;
        `;
        return colorInput;
    } else if (setting.type === 'file') {
        const fileUpload = createFileUpload({
            id: settingName,
            accept: setting.accept,
            compress: setting.compress !== false,
            compressSettingName: setting.compressSettingName,
            onFileSelect: (base64Data) => {
                handleSaveSettings(settingName, base64Data);
            },
            onFileClear: () => {
                handleSaveSettings(settingName, null);
            },
        });
        fileUpload.element.dataset.settingName = settingName;
        fileUpload.element._uploadApi = fileUpload;
        return fileUpload.element;
    } else if (setting.type === 'number') {
        const wrapper = document.createElement('div');
        wrapper.className = 'rovalra-number-input-wrapper';
        wrapper.style.cssText =
            'display: flex; align-items: center; gap: 12px; margin-left: auto;';
        wrapper.innerHTML = DOMPurify.sanitize(`
            <div class="rovalra-number-input-container" style="display: flex; align-items: center; gap: 8px; background-color: var(--rovalra-container-background-color); padding: 4px; border-radius: 8px;">
                <button type="button" class="rovalra-number-input-btn btn-control-xs" data-action="decrement" data-target="${settingName}" style="width: 32px; height: 32px; padding: 0; line-height: 0; border: none;">
                    <svg class="MuiSvgIcon-root MuiSvgIcon-fontSizeMedium css-1phnduy" focusable="false" aria-hidden="true" viewBox="0 0 24 24" style="width: 20px; height: 20px; fill: var(--rovalra-main-text-color);"><path d="M19 13H5v-2h14z"></path></svg>
                </button>
                <input type="number" id="${settingName}" data-setting-name="${settingName}" class="setting-number-input" 
                       min="${setting.min || 0}" max="${setting.max || 100}" step="${setting.step || 1}"
                       style="width: 60px; text-align: center; -moz-appearance: textfield; appearance: textfield; border-radius: 6px; border: 1px solid var(--rovalra-border-color); background-color: var(--rovalra-main-background-color); color: var(--rovalra-main-text-color); padding: 8px; font-weight: 500;">
                <button type="button" class="rovalra-number-input-btn btn-control-xs" data-action="increment" data-target="${settingName}" style="width: 32px; height: 32px; padding: 0; line-height: 0; border: none;">
                    <svg class="MuiSvgIcon-root MuiSvgIcon-fontSizeMedium css-1phnduy" focusable="false" aria-hidden="true" viewBox="0 0 24 24" style="width: 20px; height: 20px; fill: var(--rovalra-main-text-color);"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z"></path></svg>
                </button>
            </div>
            <label class="toggle-switch">
                <input type="checkbox" id="${settingName}-enabled" data-setting-name="${settingName}-enabled" data-controls-setting="${settingName}">
                <span class="slider"></span>
            </label>`);
        return wrapper;
    } else if (setting.type === 'button') {
        const button = createButton(
            setting.buttonText || 'Click Me',
            'secondary',
        );
        button.dataset.settingName = settingName;
        button.id = settingName;
        button.style.marginLeft = 'auto';

        if (setting.event) {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                document.dispatchEvent(new CustomEvent(setting.event));
            });
        }
        return button;
    } else if (setting.type === 'list') {
        const listContainer = document.createElement('div');
        listContainer.id = settingName;
        listContainer.dataset.settingName = settingName;
        listContainer.style.marginLeft = 'auto';
        listContainer.style.display = 'flex';
        listContainer.style.flexDirection = 'column';
        listContainer.style.gap = '8px';

        const inputsWrapper = document.createElement('div');
        inputsWrapper.className = 'list-inputs-wrapper';
        inputsWrapper.style.display = 'flex';
        inputsWrapper.style.flexDirection = 'column';
        inputsWrapper.style.gap = '8px';

        const saveList = () => {
            const values = Array.from(
                inputsWrapper.querySelectorAll('input'),
            ).map((input) => input.value);
            handleSaveSettings(settingName, values);
        };

        const createInputRow = (value = '') => {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.alignItems = 'center';
            row.style.gap = '8px';

            const { container: inputContainer, input } = createStyledInput({
                label: setting.placeholder || 'Enter value',
                placeholder: ' ',
            });
            input.value = value;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            inputContainer.style.width = '200px';

            const removeBtn = createButton('', 'secondary');
            removeBtn.classList.remove('btn-control-md');
            removeBtn.classList.add('btn-control-xs');
            removeBtn.style.width = '32px';
            removeBtn.style.height = '32px';
            removeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20px" height="20px"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"></path></svg>`;
            addTooltip(removeBtn, 'Remove');

            removeBtn.onclick = () => {
                row.remove();
                saveList();
            };

            row.appendChild(inputContainer);
            row.appendChild(removeBtn);

            input.addEventListener('change', saveList);

            return row;
        };

        const addBtn = createButton(
            setting.addButtonText || 'Add',
            'secondary',
        );
        addBtn.style.marginTop = '8px';
        addBtn.onclick = () => {
            inputsWrapper.appendChild(createInputRow());
            saveList();
        };

        listContainer.appendChild(inputsWrapper);
        listContainer.appendChild(addBtn);

        listContainer.rovalraList = {
            setValues: (values) => {
                inputsWrapper.innerHTML = '';
                if (values && values.length > 0) {
                    values.forEach((value) => {
                        inputsWrapper.appendChild(createInputRow(value));
                    });
                } else {
                    inputsWrapper.appendChild(createInputRow());
                }
            },
        };

        return listContainer;
    }
    return document.createElement('div');
}

export function generateSingleSettingHTML(settingName, setting, REGIONS = {}) {
    const themeColors = THEME_CONFIG[getCurrentTheme()] || THEME_CONFIG.dark;
    const settingContainer = document.createElement('div');
    settingContainer.className = 'setting';
    settingContainer.id = `setting-container-${settingName}`;

    const controlsContainer = document.createElement('div');
    controlsContainer.className = 'setting-controls';

    const label = document.createElement('label');
    label.textContent = setting.label;
    controlsContainer.appendChild(label);

    if (setting.experimental) {
        const experimentalPill = createPill(
            'Experimental',
            setting.experimental,
            'experimental',
        );
        controlsContainer.appendChild(experimentalPill);
    }
    if (setting.beta) {
        const betaPill = createPill('Beta', setting.beta, 'beta');
        controlsContainer.appendChild(betaPill);
    }
    if (setting.deprecated) {
        const deprecatedPill = createPill(
            'Deprecated',
            setting.deprecated,
            'deprecated',
        );
        controlsContainer.appendChild(deprecatedPill);
    }

    const inputElement = generateSettingInput(settingName, setting, REGIONS);

    if (setting.storageKey) {
        controlsContainer.appendChild(
            createClearStorageButton(
                setting.storageKey,
                inputElement,
                setting.type,
            ),
        );
    }

    controlsContainer.appendChild(inputElement);
    settingContainer.appendChild(controlsContainer);

    if (inputElement.rovalraVisualizer) {
        settingContainer.appendChild(inputElement.rovalraVisualizer);
    }

    if (setting.avatarPreview === true) {
        injectAvatarPreview(settingContainer, inputElement, settingName);
    }

    if (setting.description) {
        const divider = document.createElement('div');
        divider.className = 'setting-label-divider';
        settingContainer.appendChild(divider);

        const descriptions = Array.isArray(setting.description)
            ? setting.description
            : [String(setting.description)];
        descriptions.forEach((desc) => {
            const descElement = document.createElement('div');
            descElement.className = 'setting-description';
            // No need in sanitizing, it's trusted data
            descElement.innerHTML = parseMarkdown(String(desc), themeColors),  // Verified
            settingContainer.appendChild(descElement);
        });
    }

    attachContributors(settingContainer, setting);

    if (setting.requiredPermissions && setting.requiredPermissions.length > 0) {
        settingContainer.appendChild(
            createPermissionManager(
                settingName,
                setting.requiredPermissions[0],
            ),
        );
    }

    if (setting.type === 'file') {
        const uploadElement = inputElement;
        const uploadApi =
            uploadElement._uploadApi || uploadElement.rovalraFileUpload;

        if (uploadApi) {
            const previewElement = uploadApi.getPreviewElement();
            settingContainer.appendChild(previewElement);

            chrome.storage.local.get([settingName], (result) => {
                if (result[settingName]) {
                    const base64Data = result[settingName];

                    if (
                        !base64Data ||
                        typeof base64Data !== 'string' ||
                        !base64Data.startsWith('data:image/')
                    ) {
                        console.warn(
                            'Invalid image data detected for',
                            settingName,
                            '- clearing',
                        );
                        chrome.storage.local.set({ [settingName]: null });
                        return;
                    }

                    const size = Math.round((base64Data.length * 3) / 4);
                    uploadApi.setPreview(base64Data, size);
                }
            });
        } else {
            console.error('Upload API not found for', settingName);
        }
    }

    if (setting.childSettings) {
        for (const [childName, childSetting] of Object.entries(
            setting.childSettings,
        )) {
            if (childSetting.hidden) continue;

            const separator = document.createElement('div');
            separator.className = 'child-setting-separator';
            separator.dataset.childSettingName = childName;
            settingContainer.appendChild(separator);

            const childContainer = document.createElement('div');
            childContainer.className = 'child-setting-item';
            childContainer.id = `setting-${childName}`;
            if (childSetting.condition) {
                childContainer.style.display = 'none';
            }

            const childControls = document.createElement('div');
            childControls.className = 'setting-controls';

            const childLabel = document.createElement('label');
            childLabel.textContent = childSetting.label;
            childControls.appendChild(childLabel);

            if (childSetting.experimental) {
                const experimentalPill = createPill(
                    'Experimental',
                    childSetting.experimental,
                    'experimental',
                );
                childControls.appendChild(experimentalPill);
            }
            if (childSetting.beta) {
                const betaPill = createPill('Beta', childSetting.beta, 'beta');
                childControls.appendChild(betaPill);
            }
            if (childSetting.deprecated) {
                const deprecatedPill = createPill(
                    'Deprecated',
                    childSetting.deprecated,
                    'deprecated',
                );
                childControls.appendChild(deprecatedPill);
            }

            const childInput = generateSettingInput(
                childName,
                childSetting,
                REGIONS,
            );

            if (childSetting.storageKey) {
                childControls.appendChild(
                    createClearStorageButton(
                        childSetting.storageKey,
                        childInput,
                        childSetting.type,
                    ),
                );
            }

            childControls.appendChild(childInput);
            childContainer.appendChild(childControls);

            if (childInput.rovalraVisualizer) {
                childContainer.appendChild(childInput.rovalraVisualizer);
            }

            if (childSetting.avatarPreview === true) {
                injectAvatarPreview(childContainer, childInput, childName);
            }

            if (childSetting.description) {
                const childDivider = document.createElement('div');
                childDivider.className = 'setting-label-divider';
                childContainer.appendChild(childDivider);

                const childDescriptions = Array.isArray(
                    childSetting.description,
                )
                    ? childSetting.description
                    : [String(childSetting.description)];
                childDescriptions.forEach((desc) => {
                    const childDescElement = document.createElement('div');
                    childDescElement.className = 'setting-description';
                    childDescElement.innerHTML = parseMarkdown(String(desc), themeColors),  // Verified
                    childContainer.appendChild(childDescElement);
                });
            }

            attachContributors(childContainer, childSetting, true);

            if (
                childSetting.requiredPermissions &&
                childSetting.requiredPermissions.length > 0
            ) {
                childContainer.appendChild(
                    createPermissionManager(
                        childName,
                        childSetting.requiredPermissions[0],
                    ),
                );
            }

            if (childSetting.type === 'file') {
                const uploadElement = childInput;
                const uploadApi =
                    uploadElement._uploadApi || uploadElement.rovalraFileUpload;

                if (uploadApi) {
                    const previewElement = uploadApi.getPreviewElement();
                    childContainer.appendChild(previewElement);

                    chrome.storage.local.get([childName], (result) => {
                        if (result[childName]) {
                            const base64Data = result[childName];

                            if (
                                !base64Data ||
                                typeof base64Data !== 'string' ||
                                !base64Data.startsWith('data:image/')
                            ) {
                                console.warn(
                                    'Invalid image data detected for',
                                    childName,
                                    '- clearing',
                                );
                                chrome.storage.local.set({ [childName]: null });
                                return;
                            }

                            const size = Math.round(
                                (base64Data.length * 3) / 4,
                            );
                            uploadApi.setPreview(base64Data, size);
                        }
                    });
                } else {
                    console.error('Child upload API not found for', childName);
                }
            }

            settingContainer.appendChild(childContainer);
        }
    }

    return settingContainer;
}

export function generateSettingsUI(section, REGIONS = {}) {
    const fragment = document.createDocumentFragment();
    const sectionConfig = SETTINGS_CONFIG[section];

    if (!sectionConfig) return fragment;

    for (const [settingName, setting] of Object.entries(
        sectionConfig.settings,
    )) {
        if (setting.hidden) continue;

        fragment.appendChild(
            generateSingleSettingHTML(settingName, setting, REGIONS),
        );
    }

    return fragment;
}

function createPermissionManager(settingName, permissionName) {
    const permissionManager = document.createElement('div');
    permissionManager.className = 'permission-manager';
    permissionManager.dataset.permissionName = permissionName;
    permissionManager.dataset.permissionFor = settingName;
    permissionManager.style.cssText =
        'margin-top: 10px; padding: 10px; background-color: var(--rovalra-container-background-color, rgba(0,0,0,0.1)); border-radius: 8px;';

    const container = document.createElement('div');
    container.style.cssText =
        'display: flex; align-items: center; justify-content: space-between;';

    const text = document.createElement('span');
    text.textContent = `Enable ${permissionName} permission`;
    text.style.cssText =
        'font-size: 15px; color: var(--rovalra-main-text-color); font-weight: 400;';

    const label = document.createElement('label');
    label.className = 'toggle-switch';
    label.innerHTML = DOMPurify.sanitize(`
        <input type="checkbox" class="permission-toggle" data-permission-name="${permissionName}">
        <span class="slider"></span>`);

    container.appendChild(text);
    container.appendChild(label);
    permissionManager.appendChild(container);
    return permissionManager;
}
