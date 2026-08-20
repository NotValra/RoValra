import { observeElement } from '../../core/observer.js';
import { t } from '../../core/locale/i18n.js';
import { settings } from '../../core/settings/getSettings.js';

const MORE_BUTTON_SELECTOR = 'button.more-btn[aria-label="more"]';
const SECTION_CLASS = 'rovalra-social-links';

const SOCIAL_LINKS = [
    ['facebook', 'icon-regular-facebook'],
    ['x', 'icon-regular-twitter'],
    ['twitter', 'icon-regular-twitter'],
    ['youtube', 'icon-regular-youtube'],
    ['twitch', 'icon-regular-twitch'],
    ['guilded', 'icon-regular-guilded'],
    ['discord', 'icon-regular-discord'],
];

let profileSocialLinks = null;

function getSocialLinks(data) {
    const socialLinks = data?.components?.About?.socialLinks;
    if (!socialLinks || typeof socialLinks !== 'object') return [];

    const seen = new Set();
    return SOCIAL_LINKS.flatMap(([type, icon]) => {
        const link = socialLinks[type];
        if (!link?.url || !link?.target || seen.has(link.url)) return [];

        let url;
        try {
            url = new URL(link.url);
        } catch {
            return [];
        }
        if (!['http:', 'https:'].includes(url.protocol)) return [];

        seen.add(link.url);
        return [{ type, icon, url: url.href, target: link.target }];
    });
}

async function renderSocialLinks(moreButton) {
    if (!moreButton?.isConnected) return;

    moreButton.parentElement?.querySelector(`.${SECTION_CLASS}`)?.remove();
    if (!profileSocialLinks?.length) return;

    const section = document.createElement('div');
    section.className = 'gap-small flex flex-col';
    section.classList.add(SECTION_CLASS);
    section.style.marginTop = '10px';

    const heading = document.createElement('span');
    heading.className =
        'group-description-dialog-body-header text-heading-small block';
    heading.textContent = await t('profile.socialLinks');

    const links = document.createElement('div');
    links.className = 'gap-small flex flex-row';

    profileSocialLinks.forEach(({ icon, url, target }) => {
        const link = document.createElement('a');
        link.target = '_blank';
        link.rel = 'noreferrer noopener';
        link.href = url;
        link.setAttribute('aria-disabled', 'false');
        link.className =
            'foundation-web-button relative clip group/interactable focus-visible:outline-focus disabled:outline-none cursor-pointer flex items-center justify-center stroke-none padding-y-none select-none radius-medium text-label-small height-800 padding-x-small bg-action-subtle content-action-standard';
        link.style.textDecoration = 'none';

        const stateLayer = document.createElement('div');
        stateLayer.ariaHidden = 'true';
        stateLayer.dataset.testid = 'foundation-web-state-layer';
        stateLayer.className =
            'absolute inset-[0] transition-colors group-hover/interactable:bg-[var(--color-state-hover)] group-active/interactable:bg-[var(--color-state-press)] group-disabled/interactable:bg-none';

        const outer = document.createElement('span');
        outer.className = 'flex items-center min-width-0 gap-xsmall';
        const textWrapper = document.createElement('span');
        textWrapper.className =
            'padding-y-xsmall text-truncate-end text-no-wrap';
        const content = document.createElement('div');
        content.className = 'items-center gap-xsmall flex';
        const iconWrapper = document.createElement('span');
        iconWrapper.className = 'social-link-icon content-emphasis flex';
        const iconElement = document.createElement('span');
        iconElement.ariaHidden = 'true';
        iconElement.dataset.testid = 'foundation-web-icon';
        iconElement.className = `grow-0 shrink-0 basis-auto icon ${icon} size-[var(--icon-size-small)]`;
        const label = document.createElement('span');
        label.className = 'content-emphasis text-caption-medium';
        label.style.fontSize = '12px';
        label.textContent = target;

        iconWrapper.append(iconElement);
        content.append(iconWrapper, label);
        textWrapper.append(content);
        outer.append(textWrapper);
        link.append(stateLayer, outer);
        links.append(link);
    });

    section.append(heading, links);
    moreButton.insertAdjacentElement('afterend', section);
}

function renderAllSocialLinks() {
    document.querySelectorAll(MORE_BUTTON_SELECTOR).forEach((button) => {
        renderSocialLinks(button).catch((error) =>
            console.error('RoValra: Failed to render social links', error),
        );
    });
}

export async function init() {
    if (!(await settings.socialLinksEnabled)) return;

    window.addEventListener('rovalra-profile-platform-response', (event) => {
        if (!event.detail?.components?.About) return;
        profileSocialLinks = getSocialLinks(event.detail);
        renderAllSocialLinks();
    });

    observeElement(
        MORE_BUTTON_SELECTOR,
        (button) => {
            renderSocialLinks(button).catch((error) =>
                console.error('RoValra: Failed to render social links', error),
            );
        },
        { multiple: true },
    );
}
