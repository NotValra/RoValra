import { observeElement, observeAttributes } from '../../core/observer.js';
import { callRobloxApiJson } from '../../core/api.js';
import { createItemCard } from '../../core/ui/items/items.js';
import { createPill } from '../../core/ui/general/pill.js';
import { createInteractiveTimestamp } from '../../core/ui/time/time.js';
import { getCurrentTheme } from '../../core/theme.js';
import { ts } from '../../core/locale/i18n.js';
import { settings } from '../../core/settings/getSettings.js';

const LANDING_PAGE_REGEX = /^(?:\/[a-z]{2}(?:-[a-z]{2})?)?\/catalog\/?$/i;
const TOP_BAR_SELECTOR = '.catalog-search-options-top-bar';
const WRAPPER_SELECTOR = '.organic-items-wrapper';
const ROSEAL_CONTAINER_SELECTOR = '.roseal-items-container';
const LANDING_CONTAINER_SELECTOR = '.marketplace-landing-container';
const SCREEN_SIZE = 'xLarge';

let widgetsPromise = null;
let heroContainer = null;
let initialized = false;

function fetchHeroUnits() {
    if (!widgetsPromise) {
        widgetsPromise = callRobloxApiJson({
            subdomain: 'apis',
            endpoint: `/marketplace-widgets/v1/widgets?screenSize=${SCREEN_SIZE}&context=catalog-tab:all&requestId=${crypto.randomUUID()}`,
            method: 'GET',
        })
            .then((data) =>
                Object.values(data?.widgets || {}).filter(
                    (widget) =>
                        widget?.type === 'HeroUnitWidget' &&
                        widget.content?.length,
                ),
            )
            .catch((e) => {
                console.warn('RoValra: Failed to fetch hero units', e);
                return [];
            });
    }
    return widgetsPromise;
}

function getBackgroundUrl(style) {
    const layers =
        style?.backgroundLayers?.[getCurrentTheme()] ||
        style?.backgroundLayers?.default;
    const layer = layers?.find((l) => l.type === 'ImageBackground');
    const resource =
        layer?.resourceIdentifier?.[SCREEN_SIZE] ||
        layer?.resourceIdentifier?.default;
    const id = resource?.match(/rbxassetid:\/\/(\d+)/)?.[1];
    return id ? `https://assetdelivery.roblox.com/v1/asset/?id=${id}` : null;
}

function createHeroUnit(widget) {
    const template = widget.template || {};

    const unit = document.createElement('div');
    unit.className = 'rovalra-hero-unit';
    const background = getBackgroundUrl(template.widgetStyle);
    if (background) {
        unit.style.backgroundImage = `url("${background}")`;
        unit.classList.add('dark-theme');
    }

    const info = document.createElement('div');
    info.className = 'rovalra-hero-unit-info';

    const title = document.createElement('h2');
    title.className = 'text-heading-large';
    title.textContent = template.localizedTitle || template.title || '';
    info.appendChild(title);

    if (template.localizedDescription) {
        const description = document.createElement('p');
        description.className = 'text-body-large';
        description.textContent = template.localizedDescription;
        info.appendChild(description);
    }

    if (template.availableUntil) {
        const pillContent = document.createElement('span');
        pillContent.append(
            `${ts('heroUnits.ends')} `,
            createInteractiveTimestamp(template.availableUntil),
        );
        const pill = createPill(pillContent);
        pill.classList.add('rovalra-hero-unit-pill');
        info.appendChild(pill);
    }

    const items = document.createElement('div');
    items.className = 'rovalra-hero-unit-items';
    const cardBackground = getBackgroundUrl(template.cardStyle);
    const columns = template.previewColumns?.[SCREEN_SIZE];

    widget.content.slice(0, columns || undefined).forEach((entry) => {
        const item = document.createElement('div');
        item.className = 'rovalra-hero-unit-item';
        if (cardBackground)
            item.style.backgroundImage = `url("${cardBackground}")`;
        item.appendChild(
            createItemCard(entry.id, {
                itemType: entry.type === 'Bundle' ? 'Bundle' : 'Asset',
            }),
        );
        items.appendChild(item);
    });

    unit.append(info, items);
    return unit;
}

function isLandingPage() {
    const topBar = document.querySelector(TOP_BAR_SELECTOR);
    return (
        LANDING_PAGE_REGEX.test(window.location.pathname) &&
        Boolean(topBar) &&
        !topBar.querySelector('.filter-select.selected')
    );
}

function placeHeroContainer() {
    if (document.querySelector(ROSEAL_CONTAINER_SELECTOR)) {
        const landing = document.querySelector(LANDING_CONTAINER_SELECTOR);
        if (!landing) return false;
        if (landing.firstElementChild !== heroContainer) {
            landing.prepend(heroContainer);
        }
        return true;
    }

    const wrapper = document.querySelector(WRAPPER_SELECTOR);
    if (!wrapper) return false;
    if (wrapper.previousElementSibling !== heroContainer) {
        wrapper.before(heroContainer);
    }
    return true;
}

function hasTarget() {
    return Boolean(
        document.querySelector(ROSEAL_CONTAINER_SELECTOR)
            ? document.querySelector(LANDING_CONTAINER_SELECTOR)
            : document.querySelector(WRAPPER_SELECTOR),
    );
}

async function update() {
    if (!hasTarget() || !isLandingPage()) {
        if (heroContainer) heroContainer.style.display = 'none';
        return;
    }

    if (!heroContainer) {
        const widgets = await fetchHeroUnits();
        if (!widgets.length || heroContainer) return;

        heroContainer = document.createElement('div');
        heroContainer.className = 'rovalra-hero-units';
        widgets.forEach((widget) =>
            heroContainer.appendChild(createHeroUnit(widget)),
        );
        return update();
    }

    heroContainer.style.display = placeHeroContainer() ? '' : 'none';
}

export async function init() {
    if (initialized || !(await settings.heroUnitsEnabled)) return;
    if (!LANDING_PAGE_REGEX.test(window.location.pathname)) return;
    initialized = true;

    observeElement(TOP_BAR_SELECTOR, (topBar) => {
        observeAttributes(topBar, update, ['class'], { subtree: true });
        update();
    });
    observeElement(`${TOP_BAR_SELECTOR} .filter-select.selected`, update, {
        multiple: true,
        onRemove: update,
    });
    observeElement(WRAPPER_SELECTOR, update);
    observeElement(ROSEAL_CONTAINER_SELECTOR, update, { onRemove: update });
    observeElement(LANDING_CONTAINER_SELECTOR, update);
}
