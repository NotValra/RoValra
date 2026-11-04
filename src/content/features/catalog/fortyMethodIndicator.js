import { observeAttributes, observeElement } from '../../core/observer.js';
import { getPlaceIdFromUrl } from '../../core/idExtractor.js';
import { settings } from '../../core/settings/getSettings.js';
import { t } from '../../core/locale/i18n.js';
import { addTooltip } from '../../core/ui/tooltip.js';
import { getItemDetails } from '../../core/catalog/itemPrice.js';
import { loadCatalogItems } from '../../core/utils/purchasedItems.js';

const PILL_CLASS = 'rovalra-forty-method-pill';
const LIMITED_RESTRICTIONS = ['Collectible', 'Limited', 'LimitedUnique'];
const BATCH_DELAY = 100;
const CARD_STATUS_ATTR = 'data-rovalra-forty-method';
const FILTER_ATTR = 'data-rovalra-forty-method-filter';
const FILTER_OPTIONS = ['all', 'available'];

let text = {};
const pendingCards = new Set();
let batchTimeout = null;

function getStatus(item) {
    if (!item || !(item.price > 0)) return null;
    if (
        (item.itemRestrictions || []).some((restriction) =>
            LIMITED_RESTRICTIONS.includes(restriction),
        )
    )
        return false;
    return item.saleLocationType === 'ShopAndAllExperiences';
}

function getItemType(url) {
    return /\/bundles\//i.test(url) ? 'Bundle' : 'Asset';
}

function setPill(container, status) {
    container.querySelector(`:scope > .${PILL_CLASS}`)?.remove();
    if (status === null) return;

    const pill = document.createElement('div');
    pill.className = `${PILL_CLASS} text-caption-medium`;
    pill.classList.toggle('unsupported', !status);
    pill.textContent = status
        ? text.indicatorSupported
        : text.indicatorUnsupported;
    addTooltip(
        pill,
        status
            ? text.indicatorSupportedTooltip
            : text.indicatorUnsupportedTooltip,
        { position: 'top' },
    );
    container.appendChild(pill);
}

async function processCards() {
    const cards = [...pendingCards];
    pendingCards.clear();

    const entries = cards
        .map((card) => {
            const href = card.querySelector('a.item-card-link')?.href;
            const id = href ? getPlaceIdFromUrl(href) : null;
            const thumb = card.querySelector(
                '.item-card-thumb-container-inner',
            );
            return id && thumb
                ? { card, thumb, href, id, type: getItemType(href) }
                : null;
        })
        .filter(Boolean);
    if (!entries.length) return;

    const items = await loadCatalogItems(entries);
    entries.forEach((entry, index) => {
        if (entry.card.querySelector('a.item-card-link')?.href !== entry.href)
            return;
        const status = getStatus(items[index]);
        entry.card.setAttribute(
            CARD_STATUS_ATTR,
            status ? 'supported' : 'unsupported',
        );
        setPill(entry.thumb, status);
    });
}

function queueCard(card) {
    pendingCards.add(card);
    clearTimeout(batchTimeout);
    batchTimeout = setTimeout(processCards, BATCH_DELAY);
}

function createFilterOption(value, isSelected, onSelect) {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = `filter-option${isSelected ? ' selected-option' : ''}`;
    const label = document.createElement('div');
    const name = document.createElement('span');
    name.className = 'filter-option-name';
    name.textContent = value === 'all' ? text.filterAll : text.filterAvailable;
    label.appendChild(name);
    const radio = document.createElement('span');
    radio.className = isSelected
        ? 'icon-radio-check-circle-filled'
        : 'icon-radio-check-circle';
    option.append(label, radio);
    option.addEventListener('click', () => onSelect(value));
    return option;
}

function addFilter(bar) {
    if (bar.querySelector('.rovalra-forty-method-filter')) return;

    let applied = 'all';
    let selected = applied;

    const wrapper = document.createElement('div');
    wrapper.className = 'rovalra-forty-method-filter';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    const toggleText = document.createElement('span');
    toggleText.className = 'filter-display-text';
    const arrow = document.createElement('span');
    toggle.append(toggleText, arrow);

    const modal = document.createElement('div');
    modal.className = 'filters-modal-container';
    const header = document.createElement('div');
    header.className = 'header-container';
    const title = document.createElement('h3');
    title.textContent = text.filterTitle;
    const closeWrap = document.createElement('div');
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'header-close-button';
    const closeIcon = document.createElement('span');
    closeIcon.className = 'icon-close';
    close.appendChild(closeIcon);
    closeWrap.appendChild(close);
    header.append(title, closeWrap);

    const options = document.createElement('div');
    options.className = 'filter-options-container';
    const actions = document.createElement('div');
    actions.className = 'action-buttons-container';
    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'apply-button btn-primary-md btn-full-width';
    apply.textContent = text.filterApply;
    actions.appendChild(apply);
    modal.append(header, options, actions);

    const render = (isOpen) => {
        toggle.className = `filter-select ${isOpen || applied !== 'all' ? 'btn-primary-md' : 'btn-secondary-md'} btn-min-width`;
        toggleText.textContent =
            applied === 'all' ? text.filterTitle : text.filterAvailable;
        arrow.className =
            isOpen || applied !== 'all'
                ? 'icon-expand-arrow-selected'
                : 'icon-expand-arrow';
        modal.style.display = isOpen ? '' : 'none';
        apply.disabled = selected === applied;
        options.replaceChildren(
            ...FILTER_OPTIONS.map((value) =>
                createFilterOption(value, value === selected, (next) => {
                    selected = next;
                    render(true);
                }),
            ),
        );
    };

    toggle.addEventListener('click', () => {
        selected = applied;
        render(modal.style.display === 'none');
    });
    close.addEventListener('click', () => render(false));
    apply.addEventListener('click', () => {
        applied = selected;
        document.body.setAttribute(FILTER_ATTR, applied);
        render(false);
    });
    document.addEventListener('click', (event) => {
        if (!event.composedPath().includes(wrapper)) render(false);
    });

    wrapper.append(toggle, modal);
    bar.appendChild(wrapper);
    render(false);
}

async function processItemPage(container) {
    const itemId = getPlaceIdFromUrl();
    if (!itemId) return;
    const item = await getItemDetails(
        itemId,
        getItemType(window.location.pathname),
    ).catch(() => null);
    setPill(container, getStatus(item));
}

export async function init() {
    const [methodEnabled, indicatorEnabled] = await Promise.all([
        settings.SaveLotsRobuxEnabledv1,
        settings.fortyMethodIndicatorEnabled,
    ]);
    if (!methodEnabled || !indicatorEnabled) return;

    const keys = [
        'indicatorSupported',
        'indicatorUnsupported',
        'indicatorSupportedTooltip',
        'indicatorUnsupportedTooltip',
        'filterTitle',
        'filterAll',
        'filterAvailable',
        'filterApply',
    ];
    const values = await Promise.all(
        keys.map((key) => t(`fortyMethod.${key}`)),
    );
    text = Object.fromEntries(keys.map((key, index) => [key, values[index]]));

    observeElement(
        '.item-card-container',
        (card) => {
            queueCard(card);
            const link = card.querySelector('a.item-card-link');
            if (link) {
                observeAttributes(link, () => queueCard(card), ['href']);
            }
        },
        { multiple: true },
    );

    observeElement('.catalog-search-options-top-bar', addFilter);

    if (/\/(catalog|bundles)\/\d+/i.test(window.location.pathname)) {
        observeElement('.item-details-thumbnail-container', processItemPage);
    }
}
