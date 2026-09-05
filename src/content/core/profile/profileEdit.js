import { observeElement } from '../observer.js';
import { getAssets } from '../assets.js';
import { ts } from '../locale/i18n.js';
import { createOverlay } from '../ui/overlay.js';
import {
    getProfileEditCategories,
    subscribeToProfileEditRegistry,
} from './profileEditRegistry.js';

const PROFILE_EDIT_PATH = '/users/profile/edit';
const SECTION_CLASS = 'rovalra-profile-edit-features';
const HEADER_CLASS = 'rovalra-profile-edit-features-header';

function isProfileEditPage() {
    return (
        window.location.pathname.toLowerCase().replace(/\/$/, '') ===
        PROFILE_EDIT_PATH
    );
}

function createProfileSettingRow(feature) {
    const item = document.createElement('li');
    item.style.listStyle = 'none';

    const button = document.createElement('button');
    button.className =
        'bg-none width-full flex gap-medium stroke-none foundation-web-list-item padding-y-none padding-x-medium relative clip group/interactable focus-visible:outline-focus disabled:outline-none cursor-pointer profile-setting-row';
    button.type = 'button';
    button.addEventListener('click', async () => {
        const overlayOptions = await feature.onOpen?.();
        if (overlayOptions) createOverlay(overlayOptions);
    });

    const stateLayer = document.createElement('div');
    stateLayer.className =
        'absolute inset-[0] transition-colors group-hover/interactable:bg-[var(--color-state-hover)] group-active/interactable:bg-[var(--color-state-press)] group-disabled/interactable:bg-none';
    stateLayer.setAttribute('aria-hidden', 'true');

    const content = document.createElement('div');
    content.className =
        'flex fill clip-x padding-y-large gap-x-medium relative';

    const labelWrapper = document.createElement('div');
    labelWrapper.className = 'flex flex-col fill clip-x justify-center';
    const label = document.createElement('div');
    label.className = 'content-emphasis text-align-x-start text-title-large';
    label.textContent = feature.labelKey ? ts(feature.labelKey) : feature.label;
    labelWrapper.appendChild(label);

    const valueWrapper = document.createElement('div');
    valueWrapper.className = 'flex flex-col justify-center';
    const valueContent = document.createElement('div');
    valueContent.className = 'flex items-center gap-small min-width-0';
    const value = document.createElement('span');
    value.className = 'text-body-medium profile-setting-row-value';
    value.dataset.rovalraProfileEditValue = feature.id;
    if (feature.settingName) {
        value.dataset.rovalraProfileEditSetting = feature.settingName;
    }
    const chevron = document.createElement('span');
    chevron.className =
        'grow-0 shrink-0 basis-auto icon icon-regular-chevron-large-right size-[var(--icon-size-small)] shrink-0';
    chevron.setAttribute('aria-hidden', 'true');
    valueContent.append(value, chevron);
    valueWrapper.appendChild(valueContent);

    content.append(labelWrapper, valueWrapper);
    button.append(stateLayer, content);
    item.appendChild(button);

    (feature.getValue ? feature.getValue() : Promise.resolve(''))
        .then((currentValue) => {
            value.textContent = currentValue || '';
        })
        .catch(() => {});
    return item;
}

function renderProfileEditFeatures(container) {
    if (!isProfileEditPage() || !container) return;
    const categories = getProfileEditCategories();
    if (!categories.length) return;

    const existingSections = new Map(
        [...container.querySelectorAll(`.${SECTION_CLASS}`)].map((section) => [
            section.dataset.rovalraProfileEditCategory,
            section,
        ]),
    );
    const firstSection = container.querySelector(`.${SECTION_CLASS}`);
    let insertionPoint =
        firstSection ||
        container.querySelector('ul.foundation-web-list:last-of-type');

    let header = container.querySelector(`.${HEADER_CLASS}`);
    if (!header) {
        header = document.createElement('div');
        header.className = HEADER_CLASS;
        Object.assign(header.style, {
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginTop: '20px',
            marginBottom: '8px',
            color: 'var(--rovalra-main-text-color)',
            fontSize: '18px',
            fontWeight: '700',
        });
        const logo = document.createElement('img');
        logo.src = getAssets().rovalraIcon;
        logo.alt = '';
        logo.width = 24;
        logo.height = 24;
        logo.style.objectFit = 'contain';
        const title = document.createElement('span');
        title.textContent = ts('profileEdit.featuresTitle');
        header.append(logo, title);
        if (!firstSection) {
            insertionPoint?.insertAdjacentElement('afterend', header);
            insertionPoint = header;
        } else {
            firstSection.before(header);
        }
    }

    for (const category of categories) {
        let section = existingSections.get(category.id);
        if (!section) {
            section = document.createElement('ul');
            section.className = `foundation-web-list width-full bg-shift-100 flex flex-col radius-large clip ${SECTION_CLASS}`;
            section.dataset.rovalraProfileEditCategory = category.id;
            section.setAttribute(
                'aria-label',
                category.labelKey ? ts(category.labelKey) : category.label,
            );
            insertionPoint?.insertAdjacentElement('afterend', section);
        }
        section.replaceChildren(
            ...category.features.map((feature) =>
                createProfileSettingRow(feature),
            ),
        );
        insertionPoint = section;
        existingSections.delete(category.id);
    }

    existingSections.forEach((section) => section.remove());
}

export function init() {
    if (!isProfileEditPage()) return;
    observeElement(
        'ul.foundation-web-list',
        (list) => renderProfileEditFeatures(list.parentElement),
        { multiple: true },
    );
    subscribeToProfileEditRegistry(() => {
        const section = document.querySelector(`.${SECTION_CLASS}`);
        renderProfileEditFeatures(section?.parentElement);
    });
    document.addEventListener('rovalra:settingSaved', (event) => {
        document
            .querySelectorAll(
                `[data-rovalra-profile-edit-setting="${event.detail?.name}"]`,
            )
            .forEach((value) => {
                value.textContent = event.detail.value || '';
            });
    });
}
