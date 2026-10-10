import {
    getUserIdFromUrl,
    getUserIdFromFriendUrl,
} from '../../../core/idExtractor.js';
import { getAuthenticatedUserId } from '../../../core/user.js';
import { observeElement } from '../../../core/observer.js';
import { settings } from '../../../core/settings/getSettings.js';
import { getMutualFriends } from '../../../core/apis/users.js';
import { getBatchThumbnails } from '../../../core/thumbnail/thumbnails.js';
import { createPill } from '../../../core/ui/general/pill.js';
import { batchFetchPresence } from '../../../core/ui/profile/userCard.js';
import { t, ts } from '../../../core/locale/i18n.js';

const PILL_CLASS = 'rovalra-mutual-friends-pill';
const MAX_PREVIEW_AVATARS = 3;

const MUTUALS_HASH = '#!/mutuals';
const DEFAULT_TAB_HASH = '#!/friends';
const TAB_ACTIVE_CLASS = 'rovalra-mutuals-tab-active';
const HEADING_CLASS = 'rovalra-mutuals-heading';
const PANE_CLASS = 'rovalra-mutuals-pane';

// Read before the friends page router replaces an unknown hash with #!/friends.
const initialHash = window.location.hash;

function isFriendsPage() {
    return /^(?:\/[a-z]{2}(?:-[a-z]{2})?)?\/users\/\d+\/friends/i.test(
        window.location.pathname,
    );
}

async function getMutualIds(userId) {
    const mutuals = await getMutualFriends(userId);
    const ids = Object.keys(mutuals)
        .map(Number)
        .filter((id) => id > 0);
    return { mutuals, ids };
}

function createPillContent(thumbnails, label) {
    const content = document.createElement('span');
    content.className = 'rovalra-mutual-friends-content';

    const avatars = document.createElement('span');
    avatars.className = 'rovalra-mutual-friends-avatars';
    thumbnails.forEach((thumb) => {
        if (thumb.state !== 'Completed' || !thumb.imageUrl) return;
        const img = document.createElement('img');
        img.src = thumb.imageUrl;
        img.alt = '';
        avatars.appendChild(img);
    });

    const text = document.createElement('span');
    text.textContent = label;

    content.append(avatars, text);
    return content;
}

async function initProfilePill(userId, ids) {
    if (ids.length === 0) return;

    const [thumbnails, label, tooltip] = await Promise.all([
        getBatchThumbnails(
            ids.slice(0, MAX_PREVIEW_AVATARS),
            'AvatarHeadshot',
            '48x48',
        ),
        t('mutualFriends.pill', { count: ids.length }),
        t('mutualFriends.tooltip'),
    ]);

    const pill = createPill(createPillContent(thumbnails, label), tooltip, {
        href: `/users/${userId}/friends${MUTUALS_HASH}`,
    });
    pill.classList.add(PILL_CLASS);

    // The pill goes after Following and before Last seen in the header row of
    // Friends, Followers and Following. That row is rendered with a count of
    // 0 and no links, then gets its href once the counts load, so the header is
    // watched for both new nodes and href changes.
    const placePill = (header) => {
        const friendsLink = header.querySelector(
            'a[href*="/friends#!/friends"]',
        );
        const row = friendsLink?.parentElement;
        if (!row || pill.parentElement === row) return;

        const lastSeenPill = row.querySelector(
            '.rovalra-last-online-pill, .roseal-user-last-seen-v2',
        );
        if (lastSeenPill) {
            row.insertBefore(pill, lastSeenPill);
        } else {
            row.appendChild(pill);
        }
    };

    observeElement(
        '.user-profile-header',
        (header) => {
            placePill(header);
            new MutationObserver(() => placePill(header)).observe(header, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['href'],
            });
        },
        { multiple: true },
    );
}

function getPresenceLabel(presence) {
    const type = presence?.userPresenceType ?? 0;
    if (type === 2 && presence.lastLocation) {
        if (!presence.rootPlaceId) return presence.lastLocation;
        const link = document.createElement('a');
        link.href = `/games/${presence.rootPlaceId}`;
        link.textContent = presence.lastLocation;
        return link;
    }
    if (type === 1) return presence.lastLocation || ts('common.website');
    if (type === 3) return ts('common.studio');
    return ts('common.offline');
}

const PRESENCE_ICON_CLASSES = {
    1: 'online icon-online',
    2: 'game icon-game',
    3: 'studio icon-studio',
};

// Mirrors the markup of the native friends page cards so Roblox styles apply.
function createMutualCard(userId, names, thumb, presence) {
    const profileUrl = `/users/${userId}/profile`;

    const card = document.createElement('li');
    card.className = 'list-item avatar-card';

    const container = document.createElement('div');
    container.className = 'avatar-card-container';
    const content = document.createElement('div');
    content.className = 'avatar-card-content';

    const avatar = document.createElement('div');
    avatar.className = 'avatar avatar-card-fullbody';
    const avatarLink = document.createElement('a');
    avatarLink.className = 'avatar-card-link';
    avatarLink.href = profileUrl;
    const imageContainer = document.createElement('span');
    imageContainer.className = 'thumbnail-2d-container avatar-card-image';
    if (thumb?.state === 'Completed' && thumb.imageUrl) {
        const img = document.createElement('img');
        img.src = thumb.imageUrl;
        img.alt = names.displayName || names.username || '';
        imageContainer.appendChild(img);
    }
    avatarLink.appendChild(imageContainer);
    avatar.appendChild(avatarLink);

    const status = document.createElement('div');
    status.className = 'avatar-status';
    const iconClass = PRESENCE_ICON_CLASSES[presence?.userPresenceType];
    if (iconClass) {
        const icon = document.createElement('span');
        icon.className = iconClass;
        status.appendChild(icon);
    }
    avatar.appendChild(status);

    const caption = document.createElement('div');
    caption.className = 'avatar-card-caption';
    const captionInner = document.createElement('span');

    const nameContainer = document.createElement('div');
    nameContainer.className = 'avatar-name-container';
    const nameLink = document.createElement('a');
    nameLink.className = 'text-overflow avatar-name';
    nameLink.href = profileUrl;
    nameLink.textContent = names.displayName || names.username || '';
    nameContainer.appendChild(nameLink);

    const usernameLabel = document.createElement('div');
    usernameLabel.className = 'avatar-card-label';
    usernameLabel.textContent = names.username ? `@${names.username}` : '';

    const presenceLabel = document.createElement('div');
    presenceLabel.className = 'avatar-card-label';
    presenceLabel.append(getPresenceLabel(presence));

    captionInner.append(nameContainer, usernameLabel, presenceLabel);
    caption.appendChild(captionInner);
    content.append(avatar, caption);
    container.appendChild(content);
    card.appendChild(container);
    return card;
}

async function renderMutualsPane(pane, mutuals, ids) {
    const section = document.createElement('div');
    section.className = 'friends-content section';

    const headerWrapper = document.createElement('div');
    const header = document.createElement('div');
    header.className = 'container-header';
    const subtitle = document.createElement('div');
    subtitle.className = 'friends-subtitle';
    const title = document.createElement('h2');
    title.textContent = await t('mutualFriends.title', { count: ids.length });
    subtitle.appendChild(title);
    header.appendChild(subtitle);
    headerWrapper.appendChild(header);
    section.appendChild(headerWrapper);

    if (ids.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'section-content-off';
        empty.textContent = await t('mutualFriends.empty');
        section.appendChild(empty);
        pane.replaceChildren(section);
        return;
    }

    const [thumbnails, presenceMap] = await Promise.all([
        getBatchThumbnails(ids, 'AvatarHeadshot', '150x150'),
        batchFetchPresence(ids),
    ]);
    const thumbMap = new Map(
        thumbnails.map((thumb) => [thumb.targetId, thumb]),
    );

    const list = document.createElement('ul');
    list.className = 'hlist avatar-cards';
    ids.forEach((id) => {
        list.appendChild(
            createMutualCard(
                id,
                mutuals[id] || {},
                thumbMap.get(id),
                presenceMap.get(id),
            ),
        );
    });
    section.appendChild(list);
    pane.replaceChildren(section);
}

async function initMutualsTab(mutuals, ids) {
    const tabLabel = await t('mutualFriends.tab');

    let app = null;
    let heading = null;
    let pane = null;
    let suppressedHeading = null;
    let isActive = false;
    let rendered = false;
    // Only the hash the page was opened with, not later tab rebuilds.
    let openOnLoad = initialHash === MUTUALS_HASH;

    // The friends web app re-renders its own tabs, so while Mutuals is active
    // its headings are kept inactive and the Mutuals tab is kept last.
    const syncNav = (nav) => {
        const item = heading?.parentElement;
        if (item && nav.lastElementChild !== item) nav.appendChild(item);
        if (!isActive) return;
        nav.querySelectorAll(
            `.rbx-tab-heading.active:not(.${HEADING_CLASS})`,
        ).forEach((nativeHeading) => {
            suppressedHeading = nativeHeading;
            nativeHeading.classList.remove('active');
        });
    };

    const deactivate = () => {
        if (!isActive) return;
        isActive = false;
        app?.classList.remove(TAB_ACTIVE_CLASS);
        heading?.classList.remove('active');
        heading?.removeAttribute('aria-current');
        suppressedHeading?.classList.add('active');
        suppressedHeading = null;
    };

    const activate = () => {
        if (!app || !heading || !pane) return;
        if (!isActive) {
            isActive = true;
            heading.classList.add('active');
            heading.setAttribute('aria-current', 'page');
            app.classList.add(TAB_ACTIVE_CLASS);
        }
        const nav = heading.closest('ul');
        if (nav) syncNav(nav);
        if (window.location.hash !== MUTUALS_HASH) {
            history.replaceState(history.state, '', MUTUALS_HASH);
        }
        if (!rendered) {
            rendered = true;
            renderMutualsPane(pane, mutuals, ids).catch((error) => {
                rendered = false;
                console.warn(
                    'RoValra: Failed to render mutual friends.',
                    error,
                );
            });
        }
    };

    observeElement(
        '#friends-web-app ul.nav.nav-tabs',
        (nav) => {
            app = nav.closest('#friends-web-app');
            const tabContent = app?.querySelector('.rbx-tab-content');
            if (!app || !tabContent) return;

            if (!nav.querySelector(`.${HEADING_CLASS}`)) {
                const item = document.createElement('li');
                item.id = 'mutuals';
                item.setAttribute('role', 'tab');
                item.className = 'subtract-item rbx-tab';

                heading = document.createElement('a');
                heading.className = `rbx-tab-heading ${HEADING_CLASS}`;
                heading.href = MUTUALS_HASH;
                const lead = document.createElement('span');
                lead.className = 'text-lead';
                lead.textContent = tabLabel;
                const subtitle = document.createElement('span');
                subtitle.className = 'rbx-tab-subtitle';
                heading.append(lead, subtitle);
                item.appendChild(heading);
                nav.appendChild(item);

                heading.addEventListener('click', (event) => {
                    event.preventDefault();
                    activate();
                });
                // Runs before the app's own handler, which is delegated to its root.
                nav.addEventListener('click', (event) => {
                    const clicked = event.target.closest('.rbx-tab-heading');
                    if (clicked && clicked !== heading) deactivate();
                });
                new MutationObserver(() => syncNav(nav)).observe(nav, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    attributeFilter: ['class'],
                });
            }

            if (!tabContent.querySelector(`:scope > .${PANE_CLASS}`)) {
                pane = document.createElement('div');
                pane.className = `subtract-item tab-pane ${PANE_CLASS}`;
                tabContent.appendChild(pane);
                rendered = false;
            }

            if (isActive || openOnLoad) {
                openOnLoad = false;
                isActive = false;
                activate();
            }
        },
        { multiple: true },
    );

    window.addEventListener('hashchange', () => {
        const hash = window.location.hash;
        if (hash === MUTUALS_HASH) {
            activate();
            return;
        }
        if (!isActive) return;
        // The app redirects unknown hashes to its default tab; keep Mutuals.
        if (hash === DEFAULT_TAB_HASH) {
            history.replaceState(history.state, '', MUTUALS_HASH);
        } else {
            deactivate();
        }
    });
}

async function initMutualFriends() {
    if (!(await settings.mutualFriendsEnabled)) return;

    const onFriendsPage = isFriendsPage();
    const userId = Number(
        onFriendsPage ? await getUserIdFromFriendUrl() : getUserIdFromUrl(),
    );
    if (!userId) return;

    const authedUserId = Number(await getAuthenticatedUserId());
    if (!authedUserId || authedUserId === userId) return;

    const { mutuals, ids } = await getMutualIds(userId);

    if (onFriendsPage) {
        await initMutualsTab(mutuals, ids);
    } else {
        await initProfilePill(userId, ids);
    }
}

export function init() {
    initMutualFriends();
}
