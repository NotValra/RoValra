import { SETTINGS_CONFIG } from './settingConfig.js';
import { parseMarkdown } from '../utils/markdown.js';
import { getFullRegionName, getContinent } from '../regions.js';
import { getCurrentTheme, THEME_CONFIG } from '../theme.js';
import { createDropdown } from '../ui/dropdown.js';
import { createFileUpload } from '../ui/fileupload.js';
import { createPill } from '../ui/general/pill.js';
import { handleSaveSettings } from './handlesettings.js';
import { createStyledInput } from '../ui/catalog/input.js';
import DOMPurify from 'dompurify';
import { addTooltip } from '../ui/tooltip.js';
import { createButton } from '../ui/buttons.js';
import { showConfirmationPrompt } from '../ui/confirmationPrompt.js';

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

        const color1 = createSwatch('c1');
        const color2 = createSwatch('c2');
        color1.value = setting.default.color1;
        color2.value = setting.default.color2;

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
            const s1 = (100 - val.fade) / 2;
            const s2 = 100 - s1;
            preview.style.background = `linear-gradient(${currentAngle}deg, ${val.color1} ${s1}%, ${val.color2} ${s2}%)`;
            angleLine.style.transform = `rotate(${currentAngle}deg)`;
            if (save) handleSaveSettings(settingName, val);
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
        fadeSlider.addEventListener('input', () => update());

        wrapper.rovalraGradientApi = {
            setValue: (val) => {
                if (!val) return;
                toggleInput.checked = val.enabled !== false;
                color1.value = val.color1;
                color2.value = val.color2;
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
    } else if (setting.type === 'banGenerator') {
        return createBanGeneratorUI(setting);
    }
    return document.createElement('div');
}

function renderPreviewToBlob(previewCard) {
    return new Promise((resolve, reject) => {
        const drawRoundedRect = (ctx, x, y, width, height, radius) => {
            ctx.beginPath();
            ctx.moveTo(x + radius, y);
            ctx.lineTo(x + width - radius, y);
            ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
            ctx.lineTo(x + width, y + height - radius);
            ctx.quadraticCurveTo(
                x + width,
                y + height,
                x + width - radius,
                y + height,
            );
            ctx.lineTo(x + radius, y + height);
            ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
            ctx.lineTo(x, y + radius);
            ctx.quadraticCurveTo(x, y, x + radius, y);
            ctx.closePath();
        };

        const getFont = (el) => {
            if (!el) return '14px sans-serif';
            const style = window.getComputedStyle(el);
            return `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        };

        const wrapText = (
            ctx,
            text,
            x,
            y,
            maxWidth,
            lineHeight,
            color,
            font,
        ) => {
            if (font) ctx.font = font;
            ctx.fillStyle = color;
            const words = String(text || '')
                .split(/\s+/)
                .filter(Boolean);
            let line = '';
            let currentY = y;

            words.forEach((word) => {
                const nextLine = line ? `${line} ${word}` : word;
                if (ctx.measureText(nextLine).width > maxWidth && line) {
                    ctx.fillText(line, x, currentY);
                    line = word;
                    currentY += lineHeight;
                } else {
                    line = nextLine;
                }
            });

            if (line) {
                ctx.fillText(line, x, currentY);
                currentY += lineHeight;
            }

            return currentY;
        };

        const drawBanPreview = (ctx, width, height) => {
            ctx.fillStyle = '#f1f1f4';
            drawRoundedRect(ctx, 0, 0, width, height, 18);
            ctx.fill();

            const title = previewCard.querySelector(
                '.rovalra-ban-preview-title',
            )?.textContent;
            const intro = previewCard.querySelector(
                '.rovalra-ban-preview-intro',
            )?.textContent;
            const whatHeading = previewCard.querySelector(
                '.rovalra-ban-preview-section-title',
            )?.textContent;
            const detailBlocks = Array.from(
                previewCard.querySelectorAll('.rovalra-ban-preview-detail'),
            ).filter(
                (element) =>
                    !element.classList.contains('rovalra-ban-hidden') &&
                    element.offsetParent !== null,
            );
            const footerNote = previewCard.querySelector(
                '.rovalra-ban-preview-footer-note',
            )?.textContent;

            let y = 34;
            const padX = 20;
            const panelX = 18;
            const panelWidth = width - panelX * 2;

            ctx.fillStyle = '#eda800';
            ctx.strokeStyle = '#eda800';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(padX + 11, y - 4);
            ctx.lineTo(padX, y + 16);
            ctx.lineTo(padX + 22, y + 16);
            ctx.closePath();
            ctx.stroke();
            ctx.fillRect(padX + 10.5, y + 1, 1.5, 8);
            ctx.fillRect(padX + 10.5, y + 12, 1.5, 1.5);

            ctx.fillStyle = '#2c3138';
            ctx.font = getFont(
                previewCard.querySelector('.rovalra-ban-preview-title'),
            );
            ctx.fillText(title || 'Warning', padX + 30, y + 14);
            y += 50;

            y = wrapText(
                ctx,
                intro,
                padX,
                y,
                width - padX * 2,
                22,
                '#343b43',
                getFont(
                    previewCard.querySelector('.rovalra-ban-preview-intro'),
                ),
            );
            y += 8;

            ctx.fillStyle = '#2d3339';
            ctx.font = getFont(
                previewCard.querySelector('.rovalra-ban-preview-section-title'),
            );
            ctx.fillText(whatHeading || 'What happened', padX, y);
            y += 12;

            const topDetails = detailBlocks.slice(0, 2);
            const bottomDetails = detailBlocks.slice(2);

            const drawDetailPanel = (blocks) => {
                const panelY = y;
                const lineHeight = 20;
                let contentY = panelY + 22;
                const estimatedHeight = Math.max(
                    92,
                    18 +
                        blocks.reduce((sum, block) => {
                            const spanEl = block.querySelector('span');
                            const span = spanEl?.textContent || '';
                            const font = getFont(spanEl);

                            const originalFont = ctx.font;
                            ctx.font = font;
                            const approxLines = Math.max(
                                1,
                                Math.ceil(
                                    ctx.measureText(span).width /
                                        (panelWidth - 32),
                                ),
                            );
                            ctx.font = originalFont;
                            return sum + 18 + approxLines * lineHeight + 10;
                        }, 0),
                );

                ctx.fillStyle = '#e0e3ea';
                drawRoundedRect(
                    ctx,
                    panelX,
                    panelY,
                    panelWidth,
                    estimatedHeight,
                    10,
                );
                ctx.fill();

                blocks.forEach((block, index) => {
                    const strongEl = block.querySelector('strong');
                    const spanEl = block.querySelector('span');
                    const strong = strongEl?.textContent || '';
                    const span = spanEl?.textContent || '';

                    ctx.fillStyle = '#232931';
                    ctx.font = getFont(strongEl);
                    ctx.fillText(strong, panelX + 16, contentY);
                    contentY += 18;

                    contentY = wrapText(
                        ctx,
                        span,
                        panelX + 16,
                        contentY,
                        panelWidth - 32,
                        lineHeight,
                        '#4b5460',
                        getFont(spanEl),
                    );

                    if (index !== blocks.length - 1) {
                        contentY += 10;
                    }
                });

                y = panelY + estimatedHeight + 24;
            };

            if (topDetails.length) {
                drawDetailPanel(topDetails);
            }

            ctx.fillStyle = '#2d3339';
            ctx.font = getFont(
                previewCard.querySelector('.rovalra-ban-preview-section-title'),
            );
            ctx.fillText('Latest activity we reviewed', padX, y);
            y += 12;

            if (bottomDetails.length) {
                drawDetailPanel(bottomDetails);
            }

            y += 4;
            ctx.fillStyle = '#7a838e';
            ctx.fillRect(padX, y, width - padX * 2, 1);
            y += 18;
            wrapText(
                ctx,
                footerNote ||
                    'Moderation previews are generated locally for entertainment purposes only.',
                padX,
                y,
                width - padX * 2,
                18,
                '#6c7682',
                getFont(
                    previewCard.querySelector(
                        '.rovalra-ban-preview-footer-note',
                    ),
                ),
            );
        };

        const drawAppealPreview = (ctx, width, height) => {
            ctx.fillStyle = '#242526';
            ctx.fillRect(0, 0, width, height);

            const title = previewCard.querySelector(
                '.rovalra-appeal-page-title',
            )?.textContent;
            const breadcrumb = previewCard.querySelector(
                '.rovalra-appeal-breadcrumb',
            )?.textContent;
            const items = Array.from(
                previewCard.querySelectorAll('.rovalra-appeal-timeline-item'),
            );

            let y = 34;
            const padX = 26;

            ctx.fillStyle = '#ffffff';
            ctx.font = getFont(
                previewCard.querySelector('.rovalra-appeal-page-title'),
            );
            ctx.fillText(title || 'Details', padX, y);
            y += 30;

            y = wrapText(
                ctx,
                breadcrumb,
                padX,
                y + 10,
                width - padX * 2,
                24,
                '#d8d8d8',
                getFont(
                    previewCard.querySelector('.rovalra-appeal-breadcrumb'),
                ),
            );
            y += 8;

            const lineX = padX + 12;
            const lineTop = y + 10;
            const lineBottom = height - 30;
            ctx.strokeStyle = 'rgba(255,255,255,0.7)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(lineX, lineTop);
            ctx.lineTo(lineX, lineBottom);
            ctx.stroke();

            items.forEach((item) => {
                const itemY = y;
                const titleText = item.querySelector(
                    '.rovalra-appeal-entry-title',
                )?.textContent;
                const dateText = item.querySelector(
                    '.rovalra-appeal-entry-date',
                )?.textContent;
                const paragraphs = Array.from(
                    item.querySelectorAll('.rovalra-appeal-entry-text'),
                );
                const detailRows = Array.from(
                    item.querySelectorAll('.rovalra-appeal-detail-row'),
                );

                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(lineX, itemY + 10, 8, 0, Math.PI * 2);
                ctx.fill();

                let contentY = itemY + 8;
                const contentX = padX + 34;

                ctx.fillStyle = '#ffffff';
                ctx.font = getFont(
                    item.querySelector('.rovalra-appeal-entry-title'),
                );
                ctx.fillText(titleText || '', contentX, contentY);
                contentY += 24;

                ctx.fillStyle = '#d4d4d4';
                ctx.font = getFont(
                    item.querySelector('.rovalra-appeal-entry-date'),
                );
                ctx.fillText(dateText || '', contentX, contentY);
                contentY += 26;

                paragraphs.forEach((paragraph) => {
                    contentY = wrapText(
                        ctx,
                        paragraph.textContent,
                        contentX,
                        contentY,
                        width - contentX - 26,
                        24,
                        '#e0e0e0',
                        getFont(paragraph),
                    );
                    contentY += 10;
                });

                if (detailRows.length) {
                    const boxX = contentX;
                    const boxWidth = Math.min(440, width - contentX - 30);

                    let measuredHeight = 24;
                    detailRows.forEach((row) => {
                        const valueEl = row.querySelector(
                            '.rovalra-appeal-detail-value',
                        );
                        const value = valueEl?.textContent || '';
                        measuredHeight += 24;

                        const font = getFont(valueEl);
                        const originalFont = ctx.font;
                        ctx.font = font;

                        const words = String(value)
                            .split(/\s+/)
                            .filter(Boolean);
                        let line = '';
                        let rowLines = 0;
                        const maxWidth = boxWidth - 44;
                        words.forEach((word) => {
                            const nextLine = line ? `${line} ${word}` : word;
                            if (
                                ctx.measureText(nextLine).width > maxWidth &&
                                line
                            ) {
                                rowLines++;
                                line = word;
                            } else {
                                line = nextLine;
                            }
                        });
                        if (line || words.length === 0) rowLines++;
                        ctx.font = originalFont;

                        measuredHeight += rowLines * 22;
                        measuredHeight += 12;
                    });

                    const boxHeight = measuredHeight;
                    const boxY = contentY;
                    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
                    drawRoundedRect(ctx, boxX, boxY, boxWidth, boxHeight, 0);
                    ctx.stroke();

                    let rowY = boxY + 24;
                    detailRows.forEach((row) => {
                        const labelEl = row.querySelector(
                            '.rovalra-appeal-detail-label',
                        );
                        const valueEl = row.querySelector(
                            '.rovalra-appeal-detail-value',
                        );
                        const label = labelEl?.textContent;
                        const value = valueEl?.textContent;

                        ctx.fillStyle = '#cfcfcf';
                        ctx.font = getFont(labelEl);
                        ctx.fillText(label || '', boxX + 22, rowY);
                        rowY += 24;

                        ctx.fillStyle = '#ffffff';
                        rowY = wrapText(
                            ctx,
                            value,
                            boxX + 22,
                            rowY,
                            boxWidth - 44,
                            22,
                            '#ffffff',
                            getFont(valueEl),
                        );
                        rowY += 12;
                    });
                    contentY = boxY + boxHeight + 18;
                }

                y = contentY + 12;
            });
        };

        const rect = previewCard.getBoundingClientRect();
        const width = Math.max(1, Math.ceil(rect.width));
        const height = Math.max(1, Math.ceil(rect.height));
        const scale = 2;

        const canvas = document.createElement('canvas');
        canvas.width = width * scale;
        canvas.height = height * scale;
        const ctx = canvas.getContext('2d');
        ctx.scale(scale, scale);
        ctx.clearRect(0, 0, width, height);

        if (previewCard.classList.contains('rovalra-appeal-page')) {
            drawAppealPreview(ctx, width, height);
        } else {
            drawBanPreview(ctx, width, height);
        }

        canvas.toBlob((blob) => {
            if (blob) {
                resolve(blob);
            } else {
                reject(new Error('Failed to create blob'));
            }
        }, 'image/png');
    });
}

function formatModerationReviewDate(date) {
    return (
        date.toLocaleDateString('en-US', {
            month: 'numeric',
            day: 'numeric',
            year: 'numeric',
        }) +
        ' ' +
        date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit',
            hour12: true,
        })
    );
}

function formatAppealTimelineDate(date) {
    return (
        date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        }) +
        ' | ' +
        date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
        })
    );
}

function renderBanGeneratorReferenceText(text, replacements) {
    const html = text
        .replaceAll('{date}', replacements.date)
        .replaceAll('{assetType}', replacements.assetType)
        .replaceAll(
            '{link}',
            `<a href="${replacements.linkHref}" target="_blank" rel="noopener noreferrer">`,
        )
        .replaceAll('{linkEnd}', '</a>');

    return DOMPurify.sanitize(html);
}

function createBanGeneratorUI(setting) {
    const TERMS_URL =
        'https://en.help.roblox.com/hc/en-us/articles/115004647846-Roblox-Terms-of-Use';
    const GUIDELINES_URL = 'https://about.roblox.com/community-standards';
    const SUPPORT_URL = 'https://www.roblox.com/support';
    const APPEALS_URL =
        'https://en.help.roblox.com/hc/en-us/articles/360000245263-Appeal-Your-Content-or-Account-Moderation';

    const wrapper = document.createElement('div');
    wrapper.className = 'rovalra-ban-generator';

    const modNotes = setting.moderatorNotes || {};
    const appealMessages = setting.appealMessages || {};
    let selectedDuration = setting.banDurations[5];
    let selectedReason = setting.banReasons[0];
    let selectedAppealType = 'Ban';
    let selectedAppealStatus = setting.appealStatuses?.[1] || 'Appeal denied';
    let selectedAssetType = setting.appealAssetTypes?.[0] || 'Model';
    let selectedAppealReason = selectedReason;

    const createScrollSection = (
        labelText,
        values,
        selectedValue,
        onSelect,
    ) => {
        const section = document.createElement('div');
        section.className = 'rovalra-ban-control-section';

        const label = document.createElement('div');
        label.className = 'rovalra-ban-control-label';
        label.textContent = labelText;
        section.appendChild(label);

        const list = document.createElement('div');
        list.className = 'rovalra-ban-scroll-list';

        values.forEach((value) => {
            const item = document.createElement('div');
            item.className = 'rovalra-ban-scroll-item';
            if (value === selectedValue) {
                item.classList.add('selected');
            }
            item.textContent = value;
            item.addEventListener('click', () => {
                list.querySelectorAll('.rovalra-ban-scroll-item').forEach(
                    (el) => el.classList.remove('selected'),
                );
                item.classList.add('selected');
                onSelect(value);
            });
            list.appendChild(item);
        });

        section.appendChild(list);
        return section;
    };

    const createTextControl = (labelText, value, placeholder) => {
        const section = document.createElement('div');
        section.className = 'rovalra-ban-control-section';

        const label = document.createElement('div');
        label.className = 'rovalra-ban-control-label';
        label.textContent = labelText;
        section.appendChild(label);

        const input = document.createElement('input');
        input.className = 'rovalra-ban-text-input';
        input.type = 'text';
        input.value = value;
        input.placeholder = placeholder;
        section.appendChild(input);

        return { section, input };
    };

    const createPreviewMenu = (container, getEditableElements) => {
        let isEditing = false;

        const finishEditingElement = (element) => {
            element.contentEditable = 'false';
            element.spellcheck = false;
            if (!isEditing) {
                element.classList.remove('rovalra-preview-editing');
            }
        };

        const applyEditingState = () => {
            getEditableElements().forEach((element) => {
                if (!element) return;
                element.contentEditable = isEditing ? 'true' : 'false';
                element.spellcheck = isEditing;
                element.classList.toggle('rovalra-preview-editing', isEditing);
            });
        };

        const enableDoubleClickEditing = () => {
            getEditableElements().forEach((element) => {
                if (!element || element.dataset.rovalraEditBound === 'true') {
                    return;
                }

                element.dataset.rovalraEditBound = 'true';
                element.title = 'Double-click to edit';
                element.addEventListener('dblclick', () => {
                    if (element.contentEditable === 'true') {
                        return;
                    }

                    element.contentEditable = 'true';
                    element.spellcheck = true;
                    element.classList.add('rovalra-preview-editing');
                    element.focus();

                    const selection = window.getSelection();
                    const range = document.createRange();
                    range.selectNodeContents(element);
                    selection.removeAllRanges();
                    selection.addRange(range);
                });

                element.addEventListener('keydown', (event) => {
                    if (event.key !== 'Enter' || event.shiftKey) {
                        return;
                    }

                    event.preventDefault();
                    element.blur();
                });

                element.addEventListener('blur', () => {
                    if (!isEditing) {
                        finishEditingElement(element);
                    }
                });
            });
        };

        const menu = document.createElement('div');
        menu.className = 'rovalra-preview-menu';

        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'rovalra-preview-menu-trigger';
        trigger.setAttribute('aria-label', 'Preview options');
        trigger.innerHTML = DOMPurify.sanitize(
            '<span></span><span></span><span></span>',
        );

        const doneButton = document.createElement('button');
        doneButton.type = 'button';
        doneButton.className =
            'rovalra-preview-menu-trigger rovalra-preview-menu-done rovalra-ban-hidden';
        doneButton.textContent = 'Done';

        const dropdown = document.createElement('div');
        dropdown.className = 'rovalra-preview-menu-dropdown rovalra-ban-hidden';

        const editButton = document.createElement('button');
        editButton.type = 'button';
        editButton.className = 'rovalra-preview-menu-action';
        editButton.textContent = 'Edit';

        trigger.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropdown.classList.toggle('rovalra-ban-hidden');
        });

        editButton.addEventListener('click', (e) => {
            e.preventDefault();
            isEditing = !isEditing;
            editButton.textContent = isEditing ? 'Done' : 'Edit';
            dropdown.classList.add('rovalra-ban-hidden');
            applyEditingState();
            trigger.classList.toggle('rovalra-ban-hidden', isEditing);
            doneButton.classList.toggle('rovalra-ban-hidden', !isEditing);
        });

        doneButton.addEventListener('click', (e) => {
            e.preventDefault();
            isEditing = false;
            editButton.textContent = 'Edit';
            applyEditingState();
            trigger.classList.remove('rovalra-ban-hidden');
            doneButton.classList.add('rovalra-ban-hidden');
            dropdown.classList.add('rovalra-ban-hidden');
            getEditableElements().forEach((element) => {
                if (element) {
                    finishEditingElement(element);
                }
            });
        });

        document.addEventListener('click', (e) => {
            if (!menu.contains(e.target)) {
                dropdown.classList.add('rovalra-ban-hidden');
            }
        });

        dropdown.appendChild(editButton);
        menu.appendChild(trigger);
        menu.appendChild(doneButton);
        menu.appendChild(dropdown);
        container.appendChild(menu);

        return {
            sync: () => {
                applyEditingState();
                enableDoubleClickEditing();
            },
            isEditing: () => isEditing,
        };
    };

    const buildReferenceCard = (title, sections, assetType) => {
        const card = document.createElement('div');
        card.className = 'rovalra-ban-reference-card';

        const cardTitle = document.createElement('div');
        cardTitle.className = 'rovalra-ban-reference-title';
        cardTitle.textContent = title;
        card.appendChild(cardTitle);

        sections.forEach(({ label, items, linkHref }) => {
            const heading = document.createElement('div');
            heading.className = 'rovalra-ban-reference-subtitle';
            heading.textContent = label;
            card.appendChild(heading);

            const list = document.createElement('ul');
            list.className = 'rovalra-ban-reference-list';

            items.forEach((item) => {
                const li = document.createElement('li');
                li.innerHTML = renderBanGeneratorReferenceText(item, {
                    date: new Date(
                        Date.now() + 7 * 24 * 60 * 60 * 1000,
                    ).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                    }),
                    assetType: assetType.toLowerCase(),
                    linkHref,
                });
                list.appendChild(li);
            });

            card.appendChild(list);
        });

        return card;
    };

    const disclaimer = document.createElement('div');
    disclaimer.className = 'rovalra-ban-disclaimer';
    disclaimer.innerHTML = DOMPurify.sanitize(
        '<strong>FOR FUN ONLY</strong> - This is a mock screen generator. It does <strong>not</strong> issue any real Roblox moderation action, ban, warning, or appeal result.',
    );
    wrapper.appendChild(disclaimer);

    const banSectionHeader = document.createElement('div');
    banSectionHeader.className = 'rovalra-ban-section-header';
    banSectionHeader.textContent = 'Mock Ban';
    wrapper.appendChild(banSectionHeader);

    const controls = document.createElement('div');
    controls.className = 'rovalra-ban-controls';

    controls.appendChild(
        createScrollSection(
            'Ban Duration',
            setting.banDurations,
            selectedDuration,
            (value) => {
                selectedDuration = value;
                updatePreview();
            },
        ),
    );

    controls.appendChild(
        createScrollSection(
            'Ban Reason',
            setting.banReasons,
            selectedReason,
            (value) => {
                selectedReason = value;
                if (modNotes[value]) {
                    noteInput.value = modNotes[value];
                }
                updatePreview();
            },
        ),
    );

    const noteSection = document.createElement('div');
    noteSection.className =
        'rovalra-ban-control-section rovalra-ban-note-section';

    const noteLabel = document.createElement('div');
    noteLabel.className = 'rovalra-ban-control-label';
    noteLabel.textContent = 'Moderator Note';
    noteSection.appendChild(noteLabel);

    const noteInput = document.createElement('textarea');
    noteInput.className = 'rovalra-ban-note-input';
    noteInput.placeholder = 'Leave empty to use the auto-generated note';
    noteInput.rows = 3;
    noteInput.value = modNotes[selectedReason] || '';
    noteInput.addEventListener('input', () => updatePreview());
    noteSection.appendChild(noteInput);
    controls.appendChild(noteSection);
    wrapper.appendChild(controls);

    const previewHeader = document.createElement('div');
    previewHeader.className = 'rovalra-ban-preview-header';

    const previewLabel = document.createElement('div');
    previewLabel.className = 'rovalra-ban-control-label';
    previewLabel.textContent = 'Ban Preview';
    previewHeader.appendChild(previewLabel);

    const previewHeaderHint = document.createElement('div');
    previewHeaderHint.className = 'rovalra-ban-preview-hint';
    previewHeaderHint.textContent =
        'You can also double-click to edit text, or use the hamburger menu and press Edit.';

    const copyBtn = createButton('Copy as Image', 'secondary');
    copyBtn.className = 'rovalra-ban-copy-btn btn-control-xs';
    previewHeader.appendChild(copyBtn);
    wrapper.appendChild(previewHeader);
    wrapper.appendChild(previewHeaderHint);

    const previewContainer = document.createElement('div');
    previewContainer.className = 'rovalra-ban-preview-container';

    const previewCard = document.createElement('div');
    previewCard.className = 'rovalra-ban-preview-card';

    const previewTopRow = document.createElement('div');
    previewTopRow.className = 'rovalra-ban-preview-toprow';

    const previewTitleWrap = document.createElement('div');
    previewTitleWrap.className = 'rovalra-ban-preview-titlewrap';

    const previewIcon = document.createElement('div');
    previewIcon.className = 'rovalra-ban-preview-icon';
    previewIcon.innerHTML = DOMPurify.sanitize(
        `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2.8 20h18.4L12 3Zm0 4.2 5.85 10.8H6.15L12 7.2Zm-1 3.1v4.8h2v-4.8h-2Zm0 6.2v2h2v-2h-2Z"></path></svg>`,
    );

    const previewTitle = document.createElement('h2');
    previewTitle.className = 'rovalra-ban-preview-title';

    previewTitleWrap.appendChild(previewIcon);
    previewTitleWrap.appendChild(previewTitle);
    previewTopRow.appendChild(previewTitleWrap);

    const previewBody = document.createElement('div');
    previewBody.className = 'rovalra-ban-preview-body';

    const previewIntro = document.createElement('p');
    previewIntro.className = 'rovalra-ban-preview-intro';

    const previewWhatHeading = document.createElement('div');
    previewWhatHeading.className = 'rovalra-ban-preview-section-title';
    previewWhatHeading.textContent = 'What happened';

    const previewWhatCard = document.createElement('div');
    previewWhatCard.className = 'rovalra-ban-preview-panel';

    const previewReason = document.createElement('div');
    previewReason.className = 'rovalra-ban-preview-detail';

    const previewModNote = document.createElement('div');
    previewModNote.className = 'rovalra-ban-preview-detail';

    previewWhatCard.appendChild(previewReason);
    previewWhatCard.appendChild(previewModNote);

    const previewLatestHeading = document.createElement('div');
    previewLatestHeading.className = 'rovalra-ban-preview-section-title';
    previewLatestHeading.textContent = 'Latest activity we reviewed';

    const previewActivityCard = document.createElement('div');
    previewActivityCard.className = 'rovalra-ban-preview-panel';

    const previewReviewed = document.createElement('div');
    previewReviewed.className = 'rovalra-ban-preview-detail';

    const previewPlaceId = document.createElement('div');
    previewPlaceId.className = 'rovalra-ban-preview-detail';

    const previewFooterNote = document.createElement('p');
    previewFooterNote.className = 'rovalra-ban-preview-footer-note';

    previewActivityCard.appendChild(previewReviewed);
    previewActivityCard.appendChild(previewPlaceId);

    previewCard.appendChild(previewTopRow);
    previewBody.appendChild(previewIntro);
    previewBody.appendChild(previewWhatHeading);
    previewBody.appendChild(previewWhatCard);
    previewBody.appendChild(previewLatestHeading);
    previewBody.appendChild(previewActivityCard);
    previewBody.appendChild(previewFooterNote);
    previewCard.appendChild(previewBody);
    previewContainer.appendChild(previewCard);

    const banPreviewMenu = createPreviewMenu(previewContainer, () => [
        previewTitle,
        previewIntro,
        previewWhatHeading,
        previewLatestHeading,
        previewReason,
        previewReviewed,
        previewPlaceId,
        previewModNote,
        previewFooterNote,
    ]);
    wrapper.appendChild(previewContainer);

    const sectionBreak = document.createElement('div');
    sectionBreak.className = 'rovalra-ban-disclaimer rovalra-ban-section-note';
    sectionBreak.innerHTML = DOMPurify.sanitize(
        '<strong>Mock Appeal</strong> - Build a follow-up appeal view for either a ban or an asset moderation action. The controls below only affect the local preview.',
    );
    wrapper.appendChild(sectionBreak);

    const appealSectionHeader = document.createElement('div');
    appealSectionHeader.className = 'rovalra-ban-section-header';
    appealSectionHeader.textContent = 'Mock Appeal';
    wrapper.appendChild(appealSectionHeader);

    const appealControls = document.createElement('div');
    appealControls.className =
        'rovalra-ban-controls rovalra-ban-appeal-controls';

    appealControls.appendChild(
        createScrollSection(
            'Appeal Type',
            ['Ban', 'Asset'],
            selectedAppealType,
            (value) => {
                selectedAppealType = value;
                updatePreview();
            },
        ),
    );

    appealControls.appendChild(
        createScrollSection(
            'Appeal Status',
            setting.appealStatuses || [],
            selectedAppealStatus,
            (value) => {
                selectedAppealStatus = value;
                updatePreview();
            },
        ),
    );

    const appealReasonSection = createScrollSection(
        'Ban Reason',
        setting.banReasons,
        selectedAppealReason,
        (value) => {
            selectedAppealReason = value;
            updatePreview();
        },
    );
    appealReasonSection.classList.add('rovalra-ban-dynamic-section');
    appealControls.appendChild(appealReasonSection);

    const assetTypeSection = createScrollSection(
        'Asset Type',
        setting.appealAssetTypes || [],
        selectedAssetType,
        (value) => {
            selectedAssetType = value;
            updatePreview();
        },
    );
    assetTypeSection.classList.add('rovalra-ban-dynamic-section');
    appealControls.appendChild(assetTypeSection);

    const assetNameControl = createTextControl(
        'Asset Name',
        'API Service',
        'Enter asset name',
    );
    const assetIdControl = createTextControl(
        'Asset ID',
        '7995685995',
        'Enter asset ID',
    );
    const violationControl = createTextControl(
        'Violation Label',
        'Misusing Roblox Systems',
        'Enter violation label',
    );

    const assetFields = [];
    [assetNameControl, assetIdControl, violationControl].forEach(
        ({ section, input }) => {
            input.addEventListener('input', () => updatePreview());
            section.classList.add('rovalra-ban-dynamic-section');
            assetFields.push(section);
            appealControls.appendChild(section);
        },
    );

    const appealCommentSection = document.createElement('div');
    appealCommentSection.className =
        'rovalra-ban-control-section rovalra-ban-note-section';

    const appealCommentLabel = document.createElement('div');
    appealCommentLabel.className = 'rovalra-ban-control-label';
    appealCommentLabel.textContent = 'Appeal Comment';
    appealCommentSection.appendChild(appealCommentLabel);

    const appealCommentInput = document.createElement('textarea');
    appealCommentInput.className = 'rovalra-ban-note-input';
    appealCommentInput.rows = 4;
    appealCommentInput.placeholder =
        'Describe why the moderation action should be reviewed';
    appealCommentInput.value =
        'This content is not in violation of the Roblox Community Standards. This asset keeps triggering the same false flag whenever it is updated.';
    appealCommentInput.addEventListener('input', () => updatePreview());
    appealCommentSection.appendChild(appealCommentInput);
    appealControls.appendChild(appealCommentSection);
    wrapper.appendChild(appealControls);

    const appealHeader = document.createElement('div');
    appealHeader.className = 'rovalra-ban-preview-header';

    const appealHeaderLabel = document.createElement('div');
    appealHeaderLabel.className = 'rovalra-ban-control-label';
    appealHeaderLabel.textContent = 'Appeal Preview';
    appealHeader.appendChild(appealHeaderLabel);

    const appealCopyBtn = createButton('Copy as Image', 'secondary');
    appealCopyBtn.className = 'rovalra-ban-copy-btn btn-control-xs';
    appealHeader.appendChild(appealCopyBtn);
    wrapper.appendChild(appealHeader);

    const appealPreview = document.createElement('div');
    appealPreview.className = 'rovalra-appeal-preview';

    const appealPage = document.createElement('div');
    appealPage.className = 'rovalra-appeal-page';

    const appealTitle = document.createElement('h2');
    appealTitle.className = 'rovalra-appeal-page-title';
    appealTitle.textContent = 'Details';

    const appealBreadcrumb = document.createElement('div');
    appealBreadcrumb.className = 'rovalra-appeal-breadcrumb';

    const appealTimeline = document.createElement('div');
    appealTimeline.className = 'rovalra-appeal-timeline';

    appealPage.appendChild(appealTitle);
    appealPage.appendChild(appealBreadcrumb);
    appealPage.appendChild(appealTimeline);
    appealPreview.appendChild(appealPage);

    const appealPreviewMenu = createPreviewMenu(appealPreview, () => {
        const editable = [appealTitle, appealBreadcrumb];
        appealTimeline
            .querySelectorAll(
                '.rovalra-appeal-entry-title, .rovalra-appeal-entry-date, .rovalra-appeal-entry-text, .rovalra-appeal-detail-value',
            )
            .forEach((element) => editable.push(element));
        return editable;
    });
    wrapper.appendChild(appealPreview);

    const referenceHeader = document.createElement('div');
    referenceHeader.className = 'rovalra-ban-preview-header';

    const referenceLabel = document.createElement('div');
    referenceLabel.className = 'rovalra-ban-control-label';
    referenceLabel.textContent = 'Reference';
    referenceHeader.appendChild(referenceLabel);
    wrapper.appendChild(referenceHeader);

    const referenceGrid = document.createElement('div');
    referenceGrid.className = 'rovalra-ban-reference-grid';
    wrapper.appendChild(referenceGrid);

    const bottomNote = document.createElement('div');
    bottomNote.className = 'rovalra-ban-bottom-note';
    bottomNote.textContent =
        'Everything shown here is generated locally for entertainment purposes only. No real moderation action is issued and no data is sent anywhere.';
    wrapper.appendChild(bottomNote);

    copyBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
            const blob = await renderPreviewToBlob(previewCard);
            await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob }),
            ]);
            copyBtn.textContent = 'Copied!';
            setTimeout(() => {
                copyBtn.textContent = 'Copy as Image';
            }, 2000);
        } catch {
            copyBtn.textContent = 'Failed';
            setTimeout(() => {
                copyBtn.textContent = 'Copy as Image';
            }, 2000);
        }
    });

    appealCopyBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
            const blob = await renderPreviewToBlob(appealPage);
            await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob }),
            ]);
            appealCopyBtn.textContent = 'Copied!';
            setTimeout(() => {
                appealCopyBtn.textContent = 'Copy as Image';
            }, 2000);
        } catch {
            appealCopyBtn.textContent = 'Failed';
            setTimeout(() => {
                appealCopyBtn.textContent = 'Copy as Image';
            }, 2000);
        }
    });

    function updatePreview() {
        const now = new Date();
        const noteText =
            noteInput.value.trim() ||
            modNotes[selectedReason] ||
            `Your account has been suspended for violating our Terms of Use for ${selectedReason.toLowerCase()}.`;
        const isTerminal = selectedDuration === 'Account Terminated';
        const isWarning = selectedDuration === 'Warning';
        const isBanAppeal = selectedAppealType === 'Ban';
        const appealTargetLabel = isBanAppeal
            ? 'ban'
            : selectedAssetType.toLowerCase();
        const appealReason = isBanAppeal
            ? selectedAppealReason
            : violationControl.input.value.trim() || selectedReason;
        const durationLabel = isWarning ? 'Warning' : selectedDuration;

        previewTitle.textContent = durationLabel;
        previewIntro.textContent = isWarning
            ? `Your behavior broke the rules against ${selectedReason.toLowerCase()}.`
            : `Your behavior broke Roblox rules related to ${selectedReason.toLowerCase()}.`;
        previewReason.innerHTML = DOMPurify.sanitize(
            `<strong>Reason:</strong><span>${selectedReason}</span>`,
        );
        previewModNote.innerHTML = DOMPurify.sanitize(
            `<strong>Moderator note:</strong><span>${noteText}</span>`,
        );
        previewReviewed.innerHTML = DOMPurify.sanitize(
            `<strong>Review date:</strong><span>${formatModerationReviewDate(now)} (CT)</span>`,
        );
        if (!previewPlaceId.textContent.trim()) {
            previewPlaceId.innerHTML = DOMPurify.sanitize(
                '<strong>Place ID:</strong><span>Edit</span>',
            );
        }
        previewFooterNote.textContent = isWarning
            ? 'This warning preview is generated locally for entertainment purposes only.'
            : `This ${isTerminal ? 'termination' : 'moderation'} preview is generated locally for entertainment purposes only.`;
        banPreviewMenu.sync();

        appealReasonSection.classList.toggle(
            'rovalra-ban-hidden',
            !isBanAppeal,
        );
        assetTypeSection.classList.toggle('rovalra-ban-hidden', isBanAppeal);
        assetFields.forEach((section) =>
            section.classList.toggle('rovalra-ban-hidden', isBanAppeal),
        );

        if (isBanAppeal) {
            appealBreadcrumb.textContent = `Violations & Appeals > ${selectedDuration}`;
        } else {
            appealBreadcrumb.textContent = `Violations & Appeals > ${selectedAssetType} removed`;
        }
        appealTimeline.replaceChildren();

        const timelineEntries = [
            {
                title: selectedAppealStatus,
                date: new Date(now.getTime() + 13 * 60 * 1000),
                paragraphs: [
                    appealMessages[selectedAppealStatus] ||
                        appealMessages['Appeal denied'],
                    selectedAppealStatus === 'Appeal denied'
                        ? `You've reached the maximum number of appeals. You may no longer appeal this ${appealTargetLabel}.`
                        : selectedAppealStatus === 'Appeal accepted'
                          ? `Any moderation consequence tied to this ${appealTargetLabel} has been reversed.`
                          : 'Your appeal is still under review.',
                ],
            },
            isBanAppeal
                ? {
                      title: selectedDuration,
                      date: new Date(now.getTime() + 9 * 60 * 1000),
                      paragraphs: [
                          `This account was moderated because it goes against Roblox Community Standards.`,
                          `Reason: ${appealReason}.`,
                      ],
                      detailBox: {
                          Duration: selectedDuration,
                          Violation: appealReason,
                          'Moderator Note':
                              noteInput.value.trim() ||
                              modNotes[appealReason] ||
                              'Your account has been suspended for violating our Terms of Use.',
                      },
                  }
                : {
                      title: `${selectedAssetType} removed`,
                      date: new Date(now.getTime() + 9 * 60 * 1000),
                      paragraphs: [
                          `This ${appealTargetLabel} was removed because it goes against Roblox Community Standards.`,
                      ],
                      detailBox: {
                          Violation: appealReason,
                          'Asset Name':
                              assetNameControl.input.value.trim() ||
                              'Untitled Asset',
                          'Asset ID':
                              assetIdControl.input.value.trim() || '0000000000',
                      },
                  },
        ];

        if (selectedAppealStatus !== 'Appeal received') {
            timelineEntries.splice(1, 0, {
                title: 'Appeal received',
                date: new Date(now.getTime() + 11 * 60 * 1000),
                paragraphs: [
                    appealMessages['Appeal received'],
                    `Your appeal comment: "${appealCommentInput.value.trim() || 'This content is not in violation of the Roblox Community Standards.'}"`,
                ],
            });
        } else {
            timelineEntries[0].paragraphs = [
                appealMessages['Appeal received'],
                `Your appeal comment: "${appealCommentInput.value.trim() || 'This content is not in violation of the Roblox Community Standards.'}"`,
            ];
        }

        timelineEntries.forEach((entry) => {
            const item = document.createElement('div');
            item.className = 'rovalra-appeal-timeline-item';

            const marker = document.createElement('div');
            marker.className = 'rovalra-appeal-marker';
            item.appendChild(marker);

            const content = document.createElement('div');
            content.className = 'rovalra-appeal-entry';

            const title = document.createElement('div');
            title.className = 'rovalra-appeal-entry-title';
            title.textContent = entry.title;
            content.appendChild(title);

            const date = document.createElement('div');
            date.className = 'rovalra-appeal-entry-date';
            date.textContent = formatAppealTimelineDate(entry.date);
            content.appendChild(date);

            entry.paragraphs.forEach((paragraph) => {
                const text = document.createElement('p');
                text.className = 'rovalra-appeal-entry-text';
                text.textContent = paragraph;
                content.appendChild(text);
            });

            if (entry.detailBox) {
                const detailBox = document.createElement('div');
                detailBox.className = 'rovalra-appeal-detail-box';

                Object.entries(entry.detailBox).forEach(([label, value]) => {
                    const row = document.createElement('div');
                    row.className = 'rovalra-appeal-detail-row';

                    const rowLabel = document.createElement('div');
                    rowLabel.className = 'rovalra-appeal-detail-label';
                    rowLabel.textContent = label;

                    const rowValue = document.createElement('div');
                    rowValue.className = 'rovalra-appeal-detail-value';
                    rowValue.textContent = value;

                    row.appendChild(rowLabel);
                    row.appendChild(rowValue);
                    detailBox.appendChild(row);
                });

                content.appendChild(detailBox);
            }

            item.appendChild(content);
            appealTimeline.appendChild(item);
        });
        appealPreviewMenu.sync();

        referenceGrid.replaceChildren(
            buildReferenceCard(
                'Appeals',
                [
                    {
                        label: 'Outcomes & Instructions',
                        items: setting.appealInformation || [],
                        linkHref: GUIDELINES_URL,
                    },
                    {
                        label: 'Errors & Support',
                        items: setting.appealErrors || [],
                        linkHref: SUPPORT_URL,
                    },
                ],
                selectedAssetType,
            ),
            buildReferenceCard(
                'Captcha Locations',
                [
                    {
                        label: 'Places Roblox may ask for a captcha',
                        items: setting.captchaLocations || [],
                        linkHref: APPEALS_URL,
                    },
                ],
                selectedAssetType,
            ),
        );
    }

    updatePreview();

    return wrapper;
}

export function generateSingleSettingHTML(settingName, setting, REGIONS = {}) {
    const themeColors = THEME_CONFIG[getCurrentTheme()] || THEME_CONFIG.dark;
    const settingContainer = document.createElement('div');
    settingContainer.className = 'setting';
    settingContainer.id = `setting-container-${settingName}`;

    // Ban generator gets its own full-width layout (no side-by-side label)
    if (setting.type === 'banGenerator') {
        const inputElement = generateSettingInput(
            settingName,
            setting,
            REGIONS,
        );
        settingContainer.appendChild(inputElement);
        return settingContainer;
    }

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
            descElement.innerHTML = DOMPurify.sanitize(
                parseMarkdown(String(desc), themeColors),
            );
            settingContainer.appendChild(descElement);
        });
    }

    if (setting.requiredPermissions && setting.requiredPermissions.length > 0) {
        const permissionManager = document.createElement('div');
        permissionManager.className = 'permission-manager';
        permissionManager.dataset.permissionName =
            setting.requiredPermissions[0];
        permissionManager.dataset.permissionFor = settingName;
        permissionManager.style.cssText =
            'margin-top: 10px; padding: 10px; background-color: var(--rovalra-container-background-color, rgba(0,0,0,0.1)); border-radius: 8px;';

        const container = document.createElement('div');
        container.style.cssText =
            'display: flex; align-items: center; justify-content: space-between;';

        const text = document.createElement('span');
        text.textContent = `Enable ${setting.requiredPermissions[0]} permission`;
        text.style.cssText =
            'font-size: 15px; color: var(--rovalra-main-text-color); font-weight: 400;';

        const label = document.createElement('label');
        label.className = 'toggle-switch';
        label.innerHTML = DOMPurify.sanitize(`
            <input type="checkbox" class="permission-toggle" data-permission-name="${setting.requiredPermissions[0]}">
            <span class="slider"></span>`);

        container.appendChild(text);
        container.appendChild(label);
        permissionManager.appendChild(container);
        settingContainer.appendChild(permissionManager);
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
            const separator = document.createElement('div');
            separator.className = 'child-setting-separator';
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
                    childDescElement.innerHTML = DOMPurify.sanitize(
                        parseMarkdown(String(desc), themeColors),
                    );
                    childContainer.appendChild(childDescElement);
                });
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
        fragment.appendChild(
            generateSingleSettingHTML(settingName, setting, REGIONS),
        );
    }

    return fragment;
}
