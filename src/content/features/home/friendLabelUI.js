import { t, ts } from '../../core/locale/i18n.js';
import { Icon } from '../../core/ui/buildericon.js';
import { createButton } from '../../core/ui/buttons.js';
import { createStyledInput } from '../../core/ui/catalog/input.js';
import { createOverlay } from '../../core/ui/overlay.js';
import {
    loadFriendLabelStore,
    getFriendLabel,
    getLabelDefinitions,
    createLabelDefinition,
    updateLabelDefinition,
    deleteLabelDefinition,
    assignFriendLabel,
    removeFriendLabel,
} from './friendLabelStore.js';

const COLORS = ['#64748b', '#8b5cf6', '#3b82f6', '#10b981', '#eab308', '#ef4444', '#ec4899'];
const ICONS = ['none', 'star', 'favorite', 'shield', 'videogame_asset', 'workspace_premium', 'push_pin'];

function makeIcon(name, size = '16px') {
    return Icon({ icon: name, material: true, size });
}

export function updateFriendLabelBadge(element, label) {
    if (!label) {
        element.replaceChildren();
        return;
    }

    element.style.setProperty('--rovalra-label-color', label.color);
    element.title = label.name;
    element.setAttribute('aria-label', label.name);

    const name = document.createElement('span');
    name.className = 'rovalra-friend-label-text';
    name.textContent = label.name;

    if (label.icon === 'none') {
        element.replaceChildren(name);
    } else {
        const icon = makeIcon(label.icon, '13px');
        icon.classList.add('rovalra-friend-label-icon');
        icon.setAttribute('aria-hidden', 'true');
        element.replaceChildren(icon, name);
    }
}

export function ensureFriendLabelEditButton(card, { userId, displayName }, kind) {
    if (!card || !/^\d+$/.test(String(userId))) return;

    const existing = card.querySelector(
        `:scope > .rovalra-friend-label-edit[data-rovalra-label-kind="${kind}"]`,
    );
    if (existing) {
        existing.dataset.userId = String(userId);
        existing.dataset.displayName = displayName || '';
        return;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'rovalra-friend-label-edit';
    button.dataset.rovalraLabelKind = kind;
    button.dataset.userId = String(userId);
    button.dataset.displayName = displayName || '';
    button.setAttribute('aria-label', ts('friendLabels.menuAction'));
    button.title = ts('friendLabels.menuAction');
    button.appendChild(makeIcon('label', '15px'));

    button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openFriendLabelEditor({
            userId: button.dataset.userId,
            displayName: button.dataset.displayName,
        }).catch((error) => console.warn('RoValra: Friend label editor failed', error));
    });
    button.addEventListener('pointerdown', (event) => event.stopPropagation());

    card.appendChild(button);
}

export async function openFriendLabelEditor({ userId, displayName }) {
    if (!/^\d+$/.test(String(userId))) return;
    await loadFriendLabelStore();
    const assigned = getFriendLabel(userId);
    const title = await t('friendLabels.dialogTitle', {
        displayName: displayName || (await t('friendLabels.friendFallback')),
    });

    let selectedId = assigned?.id || null;
    let selectedIcon = assigned?.icon || 'none';
    let selectedColor = assigned?.color || COLORS[0];
    let close = () => {};
    let busy = false;

    const body = document.createElement('div');
    body.className = 'rovalra-friend-label-editor';

    const presetHeader = document.createElement('div');
    presetHeader.className = 'rovalra-friend-label-editor-heading';
    presetHeader.textContent = ts('friendLabels.existingLabels');

    const presets = document.createElement('div');
    presets.className = 'rovalra-friend-label-suggestions';

    const { container: inputContainer, input } = createStyledInput({
        id: `rovalra-label-edit-${userId}`,
        label: ts('friendLabels.inputLabel'),
        value: assigned?.name || '',
    });
    input.maxLength = 24;

    const colorHeader = document.createElement('div');
    colorHeader.className = 'rovalra-friend-label-editor-heading';
    colorHeader.textContent = ts('friendLabels.color');
    const colors = document.createElement('div');
    colors.className = 'rovalra-friend-label-colors';

    const customColor = document.createElement('input');
    customColor.type = 'color';
    customColor.className = 'rovalra-friend-label-custom-color';
    customColor.setAttribute('aria-label', ts('friendLabels.color'));
    customColor.value = selectedColor;

    const iconHeader = document.createElement('div');
    iconHeader.className = 'rovalra-friend-label-editor-heading';
    iconHeader.textContent = ts('friendLabels.icon');
    const icons = document.createElement('div');
    icons.className = 'rovalra-friend-label-icons';

    const preview = document.createElement('span');
    preview.className = 'rovalra-friend-label rovalra-friend-label-preview';

    const manage = document.createElement('div');
    manage.className = 'rovalra-friend-label-manage';

    const newButton = createButton(ts('friendLabels.newLabel'), 'secondary');
    const updateButton = createButton(ts('friendLabels.updatePreset'), 'secondary');
    const deleteButton = createButton(ts('friendLabels.deletePreset'), 'secondary');
    const cancelButton = createButton(ts('friendLabels.cancel'), 'secondary');
    const saveButton = createButton(ts('friendLabels.save'), 'primary');
    const removeButton = assigned
        ? createButton(ts('friendLabels.remove'), 'secondary')
        : null;

    function draft() {
        return {
            name: input.value.trim().slice(0, 24),
            color: selectedColor,
            icon: selectedIcon,
        };
    }

    function paint() {
        customColor.value = selectedColor;
        updateFriendLabelBadge(preview, { ...draft(), color: selectedColor });
        const activeDefinition = getLabelDefinitions().find((item) => item.id === selectedId);
        updateButton.disabled = !activeDefinition;
        deleteButton.disabled = !activeDefinition;
        saveButton.disabled = !draft().name || busy;
        for (const button of presets.children) {
            button.classList.toggle('is-selected', button.dataset.labelId === selectedId);
        }
        for (const button of colors.querySelectorAll('button')) {
            button.classList.toggle('is-selected', button.dataset.color === selectedColor);
        }
        for (const button of icons.children) {
            button.classList.toggle('is-selected', button.dataset.icon === selectedIcon);
        }
    }

    function fill(definition) {
        selectedId = definition?.id || null;
        input.value = definition?.name || '';
        selectedColor = definition?.color || COLORS[0];
        selectedIcon = definition?.icon || 'none';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        paint();
    }

    function paintPresets() {
        presets.replaceChildren();
        for (const definition of getLabelDefinitions()) {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'rovalra-friend-label-suggestion';
            chip.dataset.labelId = definition.id;
            chip.style.setProperty('--rovalra-label-color', definition.color);
            updateFriendLabelBadge(chip, definition);
            chip.addEventListener('click', () => fill(definition));
            presets.appendChild(chip);
        }
        presetHeader.hidden = presets.childElementCount === 0;
        presets.hidden = presets.childElementCount === 0;
        paint();
    }

    for (const color of COLORS) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'rovalra-friend-label-color';
        button.dataset.color = color;
        button.style.background = color;
        button.setAttribute('aria-label', color);
        button.addEventListener('click', () => {
            selectedColor = color;
            paint();
        });
        colors.appendChild(button);
    }
    customColor.addEventListener('input', () => {
        selectedColor = customColor.value;
        paint();
    });
    colors.appendChild(customColor);

    for (const name of ICONS) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'rovalra-friend-label-icon-option';
        button.dataset.icon = name;
        button.setAttribute('aria-label', name);
        button.title = name;
        button.appendChild(makeIcon(name === 'none' ? 'block' : name, '18px'));
        button.addEventListener('click', () => {
            selectedIcon = name;
            paint();
        });
        icons.appendChild(button);
    }

    newButton.addEventListener('click', () => {
        fill(null);
        input.focus();
    });

    updateButton.addEventListener('click', async () => {
        if (!selectedId || !draft().name || busy) return;
        busy = true;
        try {
            await updateLabelDefinition(selectedId, draft());
            paintPresets();
        } finally {
            busy = false;
            paint();
        }
    });

    deleteButton.addEventListener('click', async () => {
        if (!selectedId || busy) return;
        if (!window.confirm(ts('friendLabels.confirmDeletePreset'))) return;
        busy = true;
        try {
            await deleteLabelDefinition(selectedId);
            fill(null);
            paintPresets();
        } finally {
            busy = false;
            paint();
        }
    });

    saveButton.addEventListener('click', async () => {
        if (!draft().name || busy) return;
        busy = true;
        saveButton.disabled = true;
        try {
            const current = getLabelDefinitions().find((item) => item.id === selectedId);
            const value = draft();
            const same = current && current.name === value.name &&
                current.color === value.color && current.icon === value.icon;
            const labelId = same ? selectedId : await createLabelDefinition(value);
            await assignFriendLabel(userId, labelId);
            close();
        } finally {
            busy = false;
            paint();
        }
    });

    removeButton?.addEventListener('click', async () => {
        await removeFriendLabel(userId);
        close();
    });
    cancelButton.addEventListener('click', () => close());
    input.addEventListener('input', paint);
    input.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        if (!saveButton.disabled) saveButton.click();
    });

    manage.append(newButton, updateButton, deleteButton);
    body.append(presetHeader, presets, inputContainer, colorHeader, colors,
        iconHeader, icons, preview, manage);

    const actions = [cancelButton];
    if (removeButton) actions.unshift(removeButton);
    actions.push(saveButton);

    close = createOverlay({
        title,
        bodyContent: body,
        actions,
        maxWidth: '440px',
    }).close;

    paintPresets();
    paint();
    requestAnimationFrame(() => input.focus());
}
