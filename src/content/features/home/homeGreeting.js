import { observeElement } from '../../core/observer.js';
import { settings } from '../../core/settings/getSettings.js';
import {
    getAuthenticatedUserId,
    getAuthenticatedUsername,
} from '../../core/user.js';
import {
    createThumbnailElement,
    fetchThumbnails,
} from '../../core/thumbnail/thumbnails.js';
import { getUserProfileData } from '../../core/apis/users.js';
import { isRobloxAdmin } from '../../core/apis/robloxAdmin.js';
import { Icon } from '../../core/ui/buildericon.js';
import { t } from '../../core/locale/i18n.js';
import { getUserSettings } from '../../core/donators/settingHandler.js';
import { applyDisplayNameGradientToElement } from '../profile/header/displayNameGradient.js';

const SETTING_NAME = 'homeGreetingEnabled';
const STYLE_ID = 'rovalra-home-greeting-style';
const GREETING_CLASS = 'rovalra-home-greeting';
const HEADER_SELECTOR = '#HomeContainer .section .col-xs-12.container-header';
const NAME_MARKER = '\u0000';

function getGreetingKey(hour = new Date().getHours()) {
    if (hour >= 5 && hour < 12) return 'homeGreeting.morning';
    if (hour >= 12 && hour < 17) return 'homeGreeting.afternoon';
    if (hour >= 17 && hour < 21) return 'homeGreeting.evening';
    return 'homeGreeting.night';
}

function getAuthenticatedDisplayName() {
    const userDataMeta = document.querySelector('meta[name="user-data"]');
    return userDataMeta?.getAttribute('data-displayname') || null;
}

function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        .${GREETING_CLASS} {
            display: flex;
            align-items: center;
            gap: 16px;
            margin-bottom: 12px;
        }
        .${GREETING_CLASS}-avatar {
            width: 150px;
            height: 150px;
            flex-shrink: 0;
            border-radius: 50%;
            overflow: hidden;
            background-color: var(--rovalra-container-background-color);
        }
        .${GREETING_CLASS}-avatar img {
            width: 100%;
            height: 100%;
            border-radius: 50%;
        }
        .${GREETING_CLASS}-info {
            display: flex;
            flex-direction: column;
            gap: 2px;
            min-width: 0;
        }
        .${GREETING_CLASS}-name-row {
            display: flex;
            align-items: center;
            gap: 6px;
            min-width: 0;
        }
        .${GREETING_CLASS}-badges {
            display: flex;
            align-items: center;
            gap: 4px;
            flex-shrink: 0;
        }
        .${GREETING_CLASS}-verified {
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .${GREETING_CLASS}-verified .${GREETING_CLASS}-verified-check {
            position: absolute;
            color: white;
        }
        .${GREETING_CLASS}-text,
        .${GREETING_CLASS}-username {
            margin: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .${GREETING_CLASS}-text {
            min-width: 0;
            padding: 0;
            font-size: 32px;
            font-weight: 700;
            line-height: 1.2;
            color: var(--rovalra-main-text-color);
        }
        .${GREETING_CLASS}-username {
            font-size: 14px;
            line-height: 1.2;
            color: var(--rovalra-secondary-text-color);
        }
    `;
    document.head.appendChild(style);
}

function createBadge(icon, label) {
    icon.setAttribute('aria-label', label);
    return icon;
}

async function createBadges(userId) {
    const [profiles, isAdmin] = await Promise.all([
        getUserProfileData([userId]),
        isRobloxAdmin(userId),
    ]);
    const profile = profiles?.profileDetails?.find(
        (p) => String(p.userId) === String(userId),
    );

    const badges = document.createElement('span');
    badges.className = `${GREETING_CLASS}-badges`;

    if (profile?.isVerified) {
        const verified = document.createElement('span');
        verified.className = `${GREETING_CLASS}-verified`;
        verified.append(
            Icon({
                icon: 'verified-backplate',
                filled: true,
                size: '35px',
                classes: 'content-system-emphasis',
            }),
            Icon({
                icon: 'verified-check',
                filled: true,
                size: '35px',
                classes: `${GREETING_CLASS}-verified-check`,
            }),
        );
        badges.appendChild(
            createBadge(verified, await t('quickSearch.verifiedBadge')),
        );
    }

    if (profile?.hasRobloxSubscription) {
        badges.appendChild(
            createBadge(
                Icon({
                    icon: 'roblox-plus',
                    size: '35px',
                    classes: 'content-system-contrast',
                }),
                await t('common.robloxPlusSubscriber'),
            ),
        );
    }

    if (isAdmin === true) {
        badges.appendChild(
            createBadge(
                Icon({
                    icon: 'tilt',
                    filled: true,
                    size: '35px',
                    classes: 'content-system-contrast',
                }),
                await t('robloxAdminBadges.badge'),
            ),
        );
    }

    return badges;
}

async function getGreetingText() {
    const [customEnabled, customMessage] = await Promise.all([
        settings.homeGreetingCustomEnabled,
        settings.homeGreetingCustomMessage,
    ]);
    if (customEnabled && customMessage?.trim()) {
        return customMessage
            .replaceAll(NAME_MARKER, '')
            .replace(/\{displayname\}/gi, NAME_MARKER);
    }

    return t(getGreetingKey(), {
        name: NAME_MARKER,
        interpolation: { escapeValue: false },
    });
}

async function applyNameGradient(nameEl, userId, hoverHost) {
    if (!(await settings.displayNameGradientEnabled)) return;

    try {
        const userSettings = await getUserSettings(userId, {
            useDescription: false,
        });
        applyDisplayNameGradientToElement(nameEl, userSettings, {
            animate: false,
            hoverHost,
        });
    } catch (error) {
        console.warn('RoValra: Failed to apply home greeting gradient', error);
    }
}

async function addGreeting(header) {
    if (header.querySelector(`.${GREETING_CLASS}`)) return;

    const greeting = document.createElement('div');
    greeting.className = GREETING_CLASS;

    const [userId, username] = await Promise.all([
        getAuthenticatedUserId(),
        getAuthenticatedUsername(),
    ]);
    if (!userId || !username) return;

    const displayName = getAuthenticatedDisplayName() || username;

    const avatar = document.createElement('a');
    avatar.className = `${GREETING_CLASS}-avatar`;
    avatar.href = `https://www.roblox.com/users/${userId}/profile`;

    const info = document.createElement('div');
    info.className = `${GREETING_CLASS}-info`;

    const text = document.createElement('h1');
    text.className = `${GREETING_CLASS}-text`;
    const [prefix, ...rest] = (await getGreetingText()).split(NAME_MARKER);
    text.append(prefix);
    rest.forEach((part) => {
        const nameText = document.createElement('span');
        nameText.textContent = displayName;
        text.append(nameText, part);
        applyNameGradient(nameText, userId, text);
    });

    const usernameText = document.createElement('span');
    usernameText.className = `${GREETING_CLASS}-username`;
    usernameText.textContent = `@${username}`;

    const nameRow = document.createElement('div');
    nameRow.className = `${GREETING_CLASS}-name-row`;
    nameRow.append(text, await createBadges(userId));

    info.append(nameRow, usernameText);
    greeting.append(avatar, info);

    if (header.querySelector(`.${GREETING_CLASS}`)) return;
    header.replaceChildren(greeting);

    const thumbnails = await fetchThumbnails(
        [{ id: userId }],
        'AvatarHeadshot',
        '150x150',
    );
    avatar.appendChild(
        createThumbnailElement(
            thumbnails.get(Number(userId)),
            displayName,
            `${GREETING_CLASS}-avatar-image`,
        ),
    );
}

export async function init() {
    if (!(await settings[SETTING_NAME])) return;

    injectStyles();
    observeElement(HEADER_SELECTOR, addGreeting);
}
