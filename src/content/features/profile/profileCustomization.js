import { callRobloxApi } from '../../core/api.js';
import { getBorders } from '../../core/configs/borders.js';
import {
    findFrameByLink,
    getFrames,
    groupFramesByCategory,
} from '../../core/configs/frames.js';
import {
    getUserSettings,
    updateUserSettingViaApi,
} from '../../core/donators/settingHandler.js';
import { getUserIdFromUrl } from '../../core/idExtractor.js';
import {
    observeChildren,
    observeElement,
    observeIntersection,
} from '../../core/observer.js';
import { getAuthenticatedUserId } from '../../core/user.js';
import {
    getCurrentUserTier,
    handleSaveSettings,
} from '../../core/settings/handlesettings.js';
import { settings as rovalraSettings } from '../../core/settings/getSettings.js';
import { getBatchThumbnails } from '../../core/thumbnail/thumbnails.js';
import { ts } from '../../core/locale/i18n.js';
import { createOverlay } from '../../core/ui/overlay.js';
import { createPill } from '../../core/ui/general/pill.js';
import { createPillToggle } from '../../core/ui/general/pillToggle.js';
import { createUserCard } from '../../core/ui/profile/userCard.js';
import { createSquareButton } from '../../core/ui/profile/header/squarebutton.js';
import { applyBorderToContainer, findInBorders } from './avatarBorder.js';
import { applyFrameToHolder } from './profileFrame.js';
import { getUserDisplayName } from '../../core/apis/users.js';

let ownedBordersCache = null;
let overlayInstance = null;
let profileCustomizationObserver = null;
let profileCustomizationInitGeneration = 0;

function getUserProfileHref(userId) {
    return userId ? `https://www.roblox.com/users/${userId}/profile` : '';
}

function hasBorderGamepassId(gamepassId) {
    const normalizedId =
        gamepassId === null || gamepassId === undefined
            ? ''
            : String(gamepassId).trim().toLowerCase();

    return (
        normalizedId !== '' &&
        normalizedId !== 'null' &&
        normalizedId !== 'undefined'
    );
}

function isBorderOwned({ value, gamepassId, ownedData, tier }) {
    if (tier >= 3) return true;
    if (!hasBorderGamepassId(gamepassId)) return true;
    if (ownedData.borders.has(value)) return true;
    return ownedData.gamepasses.has(String(gamepassId));
}

async function getOwnedBorders() {
    if (ownedBordersCache) return ownedBordersCache;

    try {
        const response = await callRobloxApi({
            subdomain: 'apis',
            endpoint: '/v1/auth/borders',
            method: 'GET',
            isRovalraApi: true,
        });

        if (response.ok) {
            const data = await response.json();
            ownedBordersCache = {
                borders: new Set(data.owned_borders || []),
                gamepasses: new Set(
                    (data.owned_gamepasses || []).map((id) => String(id)),
                ),
            };
            return ownedBordersCache;
        }
    } catch (error) {
        console.warn('RoValra: Failed to fetch owned profile borders.', error);
    }

    return { borders: new Set(), gamepasses: new Set() };
}

async function getOwnedFrames() {
    try {
        const response = await callRobloxApi({
            subdomain: 'apis',
            endpoint: '/v1/auth/berts',
            method: 'GET',
            isRovalraApi: true,
        });

        if (response.ok) {
            const data = await response.json();
            const owned = new Set();
            for (const bert of data.owned_berts || []) {
                if (bert && typeof bert === 'object') {
                    if (bert.value != null) owned.add(String(bert.value));
                    if (bert.link != null) owned.add(String(bert.link));
                } else if (bert != null) {
                    owned.add(String(bert));
                }
            }
            return owned;
        }
    } catch (error) {
        console.warn('RoValra: Failed to fetch owned profile frames.', error);
    }
    return new Set();
}

function createFramePreview(thumbData) {
    const holder = document.createElement('div');
    holder.className = 'rovalra-profile-frame-preview';
    const scene = document.createElement('div');
    scene.className = 'rovalra-profile-frame-preview-scene';
    if (thumbData?.imageUrl) {
        const image = document.createElement('img');
        image.src = thumbData.imageUrl;
        image.alt = '';
        image.decoding = 'async';
        scene.appendChild(image);
    }
    holder.appendChild(scene);
    return holder;
}

async function saveProfileFrame(link) {
    const value = link || 'none';
    await handleSaveSettings('profileFrameChoice', value).catch(() => {});
    document.dispatchEvent(
        new CustomEvent('rovalra:syncProfileFrame', {
            detail: { frameUrl: value },
        }),
    );
    await updateUserSettingViaApi('berts', link || '').catch(() => {});
}

async function renderFramePicker(container, userId) {
    container.innerHTML = '';
    try {
        const [frames, ownedFrames, userSettings, userData] = await Promise.all(
            [
                getFrames(),
                getOwnedFrames(),
                getUserSettings(userId).catch(() => null),
                getAuthedFramePreviewData(userId),
            ],
        );

        if (!frames.length) {
            const empty = document.createElement('p');
            empty.style.color = 'var(--rovalra-secondary-text-color)';
            empty.textContent = ts('profileCustomization.noFrames');
            container.appendChild(empty);
            return;
        }

        const currentFrame = findFrameByLink(frames, userSettings?.berts);
        let currentValue = currentFrame?.value || 'none';
        const previewWrapper = document.createElement('div');
        previewWrapper.style.cssText =
            'display:flex; flex-direction:column; align-items:center; padding:20px; background:var(--rovalra-container-background-color); border-radius:12px; margin-bottom:20px;';
        previewWrapper.innerHTML = `<div style="font-weight:700; font-size:12px; text-transform:uppercase; margin-bottom:10px; color:var(--rovalra-secondary-text-color);">${ts('profileFrame.currentPreview')}</div><div class="setting-label-divider" style="width:100%; margin-bottom:15px;"></div>`;
        const preview = createFramePreview(userData.thumbData);
        preview.style.maxWidth = '520px';
        previewWrapper.appendChild(preview);
        if (currentFrame) {
            applyFrameToHolder(preview, currentFrame.link, {
                mountDirectly: true,
            });
        }
        container.appendChild(previewWrapper);

        const unequipButton = createSquareButton({
            content: ts('profileFrame.unequip'),
            onClick: async () => {
                currentValue = 'none';
                applyFrameToHolder(preview, null);
                unequipButton.style.opacity = '0.5';
                unequipButton.style.cursor = 'not-allowed';
                await saveProfileFrame(null);
                container
                    .querySelectorAll('[data-profile-frame-option]')
                    .forEach((item) => {
                        if (item.dataset.profileFrameOwned === 'true') {
                            item.textContent = ts('profileCustomization.equip');
                        }
                    });
            },
            width: '120px',
            height: 'height-1000',
            paddingX: 'padding-x-medium',
            radius: 'radius-medium',
            disableTextTruncation: true,
        });
        unequipButton.style.cssText = `margin-top:15px; opacity:${currentFrame ? '1' : '0.5'}; cursor:${currentFrame ? 'pointer' : 'not-allowed'};`;
        previewWrapper.appendChild(unequipButton);

        const sections = [];
        const categories = groupFramesByCategory(frames);
        const categoryTabs = document.createElement('div');
        categoryTabs.style.cssText =
            'display:flex; margin:0 0 16px; overflow-x:auto; max-width:100%;';
        const emptyMessage = document.createElement('p');
        emptyMessage.style.color = 'var(--rovalra-secondary-text-color)';
        emptyMessage.textContent = ts('profileCustomization.noFramesInTab');
        emptyMessage.hidden = true;
        container.appendChild(categoryTabs);

        const applyCategory = (value) => {
            let visible = 0;
            for (const section of sections) {
                const show = value === 'all' || value === section.value;
                section.header.hidden = !show;
                section.grid.hidden = !show;
                if (show) visible += 1;
            }
            emptyMessage.hidden = visible > 0;
        };
        const tabs = createPillToggle({
            options: [
                { text: ts('profileCustomization.all'), value: 'all' },
                ...categories.map((category) => ({
                    text: category.label,
                    value: category.value,
                })),
            ],
            initialValue: 'all',
            onChange: applyCategory,
        });
        tabs.style.flexWrap = 'wrap';
        categoryTabs.appendChild(tabs);
        container.appendChild(emptyMessage);

        for (const category of categories) {
            const header = document.createElement('h3');
            header.style.cssText =
                'color:var(--rovalra-main-text-color); font-size:16px; margin:20px 0 10px; padding-bottom:8px; border-bottom:1px solid var(--rovalra-border-color);';
            header.textContent = category.label;
            const grid = document.createElement('div');
            grid.style.cssText =
                'display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:16px; margin-bottom:10px;';
            container.append(header, grid);
            sections.push({ value: category.value, header, grid });

            for (const frame of category.frames) {
                const owned =
                    frame.isFree ||
                    ownedFrames.has(frame.value) ||
                    ownedFrames.has(frame.link);
                const card = document.createElement('div');
                card.style.cssText =
                    'display:flex; flex-direction:column; align-items:center; padding:12px; background:var(--rovalra-container-background-color); border-radius:12px;';
                const cardPreview = createFramePreview(userData.thumbData);
                card.appendChild(cardPreview);
                const label = document.createElement('div');
                label.style.cssText =
                    'color:var(--rovalra-main-text-color); font-weight:600; font-size:13px; text-align:center; margin:8px 0 4px;';
                label.textContent = frame.label;
                card.appendChild(label);
                const button = createPill(
                    owned && currentValue === frame.value
                        ? ts('profileCustomization.equipped')
                        : owned
                          ? ts('profileCustomization.equip')
                          : ts('profileCustomization.unowned'),
                    owned
                        ? ts('profileCustomization.equipTooltip')
                        : ts('profileCustomization.unownedTooltip'),
                    { isButton: true },
                );
                button.style.cssText =
                    'width:100%; justify-content:center; font-size:12px; font-weight:700;';
                if (!owned) {
                    button.style.opacity = '0.6';
                    button.style.cursor = 'not-allowed';
                } else {
                    button.addEventListener('click', async () => {
                        const nextFrame =
                            currentValue === frame.value ? null : frame;
                        applyFrameToHolder(preview, nextFrame?.link || null, {
                            mountDirectly: true,
                        });
                        currentValue = nextFrame?.value || 'none';
                        unequipButton.style.opacity =
                            currentValue === 'none' ? '0.5' : '1';
                        unequipButton.style.cursor =
                            currentValue === 'none' ? 'not-allowed' : 'pointer';
                        await saveProfileFrame(nextFrame?.link);
                        container
                            .querySelectorAll('[data-profile-frame-option]')
                            .forEach((item) => {
                                if (item.dataset.profileFrameOwned !== 'true')
                                    return;
                                item.textContent =
                                    item.dataset.profileFrameOption ===
                                    currentValue
                                        ? ts('profileCustomization.equipped')
                                        : ts('profileCustomization.equip');
                            });
                    });
                }
                button.dataset.profileFrameOption = frame.value;
                button.dataset.profileFrameOwned = owned ? 'true' : 'false';
                card.appendChild(button);
                grid.appendChild(card);
                applyFrameToHolder(cardPreview, frame.link);
            }
        }
        applyCategory('all');
    } catch (error) {
        console.error('RoValra: Failed to render profile frames.', error);
        container.textContent = ts('profileCustomization.failedToLoad');
    }
}

function findBorderItem(categories, value) {
    if (!value || value === 'none') return null;

    for (const category of categories) {
        if (category.value === value) return category;
        if (!Array.isArray(category.variants)) continue;

        for (const variant of category.variants) {
            if (variant.value === value) return variant;
            if (!Array.isArray(variant.animated)) continue;

            for (const animatedVariant of variant.animated) {
                if (animatedVariant.value === value) return animatedVariant;
            }
        }
    }

    return null;
}

function buildBorderCategories(
    borderCategories,
    ownedData,
    tier,
    ownershipMode,
) {
    return borderCategories
        .filter((category) => category.value !== 'none' && category.variants)
        .map((category) => {
            const variants = category.variants
                .map((variant) => {
                    const gamepassId = variant.gamepassId;
                    const staticOwned = isBorderOwned({
                        value: variant.value,
                        gamepassId,
                        ownedData,
                        tier,
                    });
                    const ownedAnimated = (variant.animated || []).filter(
                        (animatedVariant) =>
                            isBorderOwned({
                                value: animatedVariant.value,
                                gamepassId:
                                    animatedVariant.gamepassId || gamepassId,
                                ownedData,
                                tier,
                            }),
                    );
                    const unownedAnimated = (variant.animated || []).filter(
                        (animatedVariant) =>
                            !isBorderOwned({
                                value: animatedVariant.value,
                                gamepassId:
                                    animatedVariant.gamepassId || gamepassId,
                                ownedData,
                                tier,
                            }),
                    );

                    const includeStatic =
                        ownershipMode === 'owned' ? staticOwned : !staticOwned;
                    const visibleAnimated =
                        ownershipMode === 'owned'
                            ? ownedAnimated
                            : unownedAnimated;

                    if (!includeStatic && visibleAnimated.length === 0)
                        return null;

                    return {
                        ...variant,
                        animated: visibleAnimated,
                        rovalraStaticVisible: includeStatic,
                        rovalraStaticOwned: staticOwned,
                        rovalraOwnershipMode: ownershipMode,
                    };
                })
                .filter(Boolean);

            return variants.length
                ? { ...category, variants, rovalraOwnershipMode: ownershipMode }
                : null;
        })
        .filter(Boolean);
}

async function getAuthedUserData(userId) {
    const [displayName, thumbnails] = await Promise.all([
        getUserDisplayName ? getUserDisplayName(userId) : 'User',
        getBatchThumbnails([userId], 'AvatarHeadshot', '150x150'),
    ]);

    return {
        displayName:
            typeof displayName === 'string'
                ? displayName
                : displayName || 'User',
        thumbData: thumbnails[0] || { state: 'Error' },
        profileHref: getUserProfileHref(userId),
    };
}

function createPreviewUserCard(authedUserData, borderLink) {
    const card = createUserCard({
        displayName: authedUserData?.displayName || 'User',
        username: '',
        thumbData: authedUserData?.thumbData || { state: 'Error' },
        href: authedUserData?.profileHref || '',
        presenceInfo: 0,
        hidePresence: true,
    });

    card.dataset.rovalraBorderApplied = 'true';
    card.style.pointerEvents = 'none';
    card.classList.add('rovalra-profile-customization-user-card');

    const labels = card.querySelector(
        '.user-card-labels, .user-card-labels-no-username',
    );
    labels?.remove();

    const avatarEl = card.querySelector('.avatar.avatar-card-fullbody');
    avatarEl?.classList.remove('user-profile-header-details-avatar-container');
    avatarEl
        ?.querySelector('.avatar-card-image')
        ?.classList.add('rovalra-profile-customization-avatar-image');
    avatarEl?.querySelector('.avatar-status')?.remove();

    if (avatarEl && borderLink) {
        applyPreviewBorder(avatarEl, borderLink);
    }

    return card;
}

function clearPreviewBorder(avatarEl) {
    avatarEl.querySelector('.rovalra-avatar-border')?.remove();

    const clip = avatarEl.querySelector('.rovalra-avatar-border-clip');
    if (clip) {
        while (clip.firstChild) avatarEl.appendChild(clip.firstChild);
        clip.remove();
    }

    delete avatarEl.dataset.rovalraBorderLoading;
    delete avatarEl.dataset.rovalraIntendedBorder;
}

function applyPreviewBorder(avatarEl, borderLink) {
    if (!avatarEl || !borderLink) return;

    clearPreviewBorder(avatarEl);
    applyBorderToContainer(avatarEl, borderLink, true);
}

function updatePreviewAndButtons(
    selectedValue,
    link,
    container,
    previewHolder,
) {
    const avatarEl = previewHolder.querySelector(
        '.avatar.avatar-card-fullbody',
    );

    if (avatarEl) {
        clearPreviewBorder(avatarEl);
        if (link) {
            applyPreviewBorder(avatarEl, link);
        }
    }

    container.querySelectorAll('[data-equip-btn]').forEach((button) => {
        if (button.dataset.borderOwned !== 'true') return;

        const isSelected = button.dataset.equipBtn === selectedValue;
        const text = isSelected
            ? ts('profileCustomization.equipped')
            : ts('profileCustomization.equip');
        const contentSpan = button.querySelector('span');

        if (contentSpan) {
            contentSpan.textContent = text;
        } else {
            button.textContent = text;
        }
    });

    const currentUnequipButton = container.querySelector(
        '[data-current-unequip-btn]',
    );
    if (currentUnequipButton) {
        const hasEquippedBorder = selectedValue !== 'none';
        currentUnequipButton.disabled = !hasEquippedBorder;
        currentUnequipButton.setAttribute(
            'aria-disabled',
            String(!hasEquippedBorder),
        );
        currentUnequipButton.style.opacity = hasEquippedBorder ? '1' : '0.5';
        currentUnequipButton.style.cursor = hasEquippedBorder
            ? 'pointer'
            : 'not-allowed';
    }
}

function createBorderActionButton({
    variant,
    isSelected,
    isOwned,
    container,
    previewHolder,
}) {
    const btnContainer = document.createElement('div');
    btnContainer.style.cssText =
        'margin-top: 8px; width: 100%; display: flex; justify-content: center;';

    const pill = createPill(
        isOwned
            ? isSelected
                ? ts('profileCustomization.equipped')
                : ts('profileCustomization.equip')
            : ts('profileCustomization.unowned'),
        isOwned
            ? isSelected
                ? ts('profileCustomization.unequipTooltip')
                : ts('profileCustomization.equipTooltip')
            : ts('profileCustomization.unownedTooltip'),
        { isButton: true },
    );
    pill.dataset.equipBtn = variant.value;
    pill.dataset.variantLink = variant.link || '';
    pill.dataset.borderOwned = isOwned ? 'true' : 'false';
    pill.style.cssText =
        'width: 100%; justify-content: center; font-size: 12px; font-weight: 700;';

    if (!isOwned) {
        pill.style.opacity = '0.6';
        pill.style.cursor = 'not-allowed';
        btnContainer.appendChild(pill);
        return btnContainer;
    }

    pill.addEventListener('click', (event) => {
        event.stopPropagation();

        const isCurrentlyEquipped =
            pill.textContent.trim() === ts('profileCustomization.equipped');
        const nextValue = isCurrentlyEquipped ? 'none' : variant.value;
        const nextLink = isCurrentlyEquipped ? null : variant.link;

        updateUserSettingViaApi('border', nextLink || '').catch(() => {});
        updatePreviewAndButtons(nextValue, nextLink, container, previewHolder);
    });

    btnContainer.appendChild(pill);
    return btnContainer;
}

function renderLoadingState(container) {
    container.innerHTML = '';

    const previewShimmer = document.createElement('div');
    previewShimmer.style.cssText =
        'display: flex; flex-direction: column; align-items: center; padding: 20px; background: var(--rovalra-container-background-color); border-radius: 12px; margin-bottom: 20px;';
    previewShimmer.innerHTML = `
        <div class="shimmer" style="width: 180px; height: 12px; margin-bottom: 10px; border-radius: 4px;"></div>
        <div class="setting-label-divider" style="width: 100%; margin-bottom: 10px;"></div>
        <div class="shimmer" style="width: 110px; height: 110px; border-radius: 50%; margin: 25px 0;"></div>
    `;
    container.appendChild(previewShimmer);

    for (let i = 0; i < 3; i++) {
        const header = document.createElement('div');
        header.className = 'shimmer';
        header.style.cssText =
            'width: 130px; height: 18px; margin: 20px 0 10px 0; border-radius: 4px;';
        container.appendChild(header);

        const grid = document.createElement('div');
        grid.style.cssText =
            'display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; margin-bottom: 10px;';

        const card = document.createElement('div');
        card.style.cssText =
            'display: flex; flex-direction: column; padding: 12px; background: var(--rovalra-container-background-color); border-radius: 12px; gap: 12px; opacity: 0.8;';
        card.innerHTML = `
            <div style="display: flex; justify-content: center; gap: 15px;">
                <div class="shimmer" style="width: 100px; height: 100px; border-radius: 50%;"></div>
                <div class="shimmer" style="width: 100px; height: 100px; border-radius: 50%;"></div>
            </div>
            <div class="shimmer" style="width: 50%; height: 12px; align-self: center; border-radius: 4px;"></div>
            <div class="shimmer" style="width: 100px; height: 16px; align-self: center; border-radius: 20px; margin-top: 5px;"></div>
        `;
        grid.appendChild(card);
        container.appendChild(grid);
    }
}

async function renderOwnedBorderPicker(container, userId) {
    renderLoadingState(container);

    try {
        const [borderCategories, ownedData, userSettings, authedUserData] =
            await Promise.all([
                getBorders(),
                getOwnedBorders(),
                getUserSettings(userId).catch(() => null),
                getAuthedUserData(userId),
            ]);

        const tier = getCurrentUserTier();
        const ownedCategories = buildBorderCategories(
            borderCategories,
            ownedData,
            tier,
            'owned',
        );
        const unownedCategories = buildBorderCategories(
            borderCategories,
            ownedData,
            tier,
            'unowned',
        );

        container.innerHTML = '';

        if (!ownedCategories.length && !unownedCategories.length) {
            const emptyMessage = document.createElement('p');
            emptyMessage.style.cssText =
                'color: var(--rovalra-secondary-text-color); margin: 0;';
            emptyMessage.textContent = ts('profileCustomization.noBorders');
            container.appendChild(emptyMessage);
            return;
        }

        let currentBorderValue = 'none';
        if (userSettings?.border && userSettings.border !== 'none') {
            const apiBorderItem = findInBorders(
                borderCategories,
                userSettings.border,
                'link',
            );
            currentBorderValue = apiBorderItem ? apiBorderItem.value : 'none';
        }

        const previewWrapper = document.createElement('div');
        previewWrapper.style.cssText =
            'display: flex; flex-direction: column; align-items: center; padding: 20px; background: var(--rovalra-container-background-color); border-radius: 12px; margin-bottom: 20px;';
        previewWrapper.innerHTML = `
            <div style="font-weight: 700; font-size: 12px; text-transform: uppercase; margin-bottom: 10px; color: var(--rovalra-secondary-text-color);">${ts('profileCustomization.currentPreview')}</div>
            <div class="setting-label-divider" style="width: 100%; margin-bottom: 10px;"></div>
            <div id="rovalra-profile-customization-preview-holder"></div>
        `;
        container.appendChild(previewWrapper);

        const previewHolder = previewWrapper.querySelector(
            '#rovalra-profile-customization-preview-holder',
        );
        const previewCard = createPreviewUserCard(authedUserData);
        previewCard.style.transform = 'scale(1.2)';
        previewCard.style.margin = '25px 0';
        previewHolder.appendChild(previewCard);

        const currentBorder = findBorderItem(
            borderCategories,
            currentBorderValue,
        );
        const currentAvatarEl = previewCard.querySelector(
            '.avatar.avatar-card-fullbody',
        );
        if (currentAvatarEl && currentBorder?.link) {
            applyPreviewBorder(currentAvatarEl, currentBorder.link);
        }

        const unequipButton = createSquareButton({
            content: ts('profileCustomization.unequip'),
            onClick: () => {
                updateUserSettingViaApi('border', '').catch(() => {});
                updatePreviewAndButtons('none', null, container, previewHolder);
            },
            disabled: currentBorderValue === 'none',
            width: '120px',
            height: 'height-1000',
            paddingX: 'padding-x-medium',
            radius: 'radius-medium',
            disableTextTruncation: true,
        });
        unequipButton.dataset.currentUnequipBtn = 'true';
        unequipButton.style.marginTop = '-6px';
        unequipButton.style.opacity =
            currentBorderValue === 'none' ? '0.5' : '1';
        unequipButton.style.cursor =
            currentBorderValue === 'none' ? 'not-allowed' : 'pointer';
        previewWrapper.appendChild(unequipButton);

        const storeSections = [];
        const emptyTabMessage = document.createElement('p');
        emptyTabMessage.style.cssText =
            'color: var(--rovalra-secondary-text-color); margin: 16px 0 0 0;';
        emptyTabMessage.textContent = ts('profileCustomization.noBordersInTab');
        emptyTabMessage.hidden = true;

        const categoriesByOwnership = {
            owned: ownedCategories,
            unowned: unownedCategories,
        };
        let activeOwnershipTab = ownedCategories.length ? 'owned' : 'unowned';
        let activeCategoryTab = 'all';
        let categoryTabs = null;

        const getCategoryOptions = (ownershipTab) => {
            const categories = categoriesByOwnership[ownershipTab] || [];
            const options = [
                { text: ts('profileCustomization.all'), value: 'all' },
            ];

            if (categories.some((category) => category.new === true)) {
                options.push({
                    text: ts('profileCustomization.new'),
                    value: 'new',
                });
            }

            options.push(
                ...categories.map((category) => ({
                    text: category.label,
                    value: category.value,
                })),
            );

            return options;
        };

        const categoryTabExists = (ownershipTab, categoryTab) =>
            getCategoryOptions(ownershipTab).some(
                (option) => option.value === categoryTab,
            );

        const applyStoreFilters = () => {
            let visibleCount = 0;
            for (const section of storeSections) {
                const isVisible =
                    section.ownershipMode === activeOwnershipTab &&
                    (activeCategoryTab === 'all' ||
                        (activeCategoryTab === 'new' && section.isNew) ||
                        activeCategoryTab === section.categoryValue);

                section.header.style.display = isVisible ? '' : 'none';
                section.grid.style.display = isVisible ? 'grid' : 'none';
                if (isVisible) visibleCount += 1;
            }
            emptyTabMessage.hidden = visibleCount > 0;
        };

        const ownershipTabControls = document.createElement('div');
        ownershipTabControls.style.cssText =
            'display: flex; justify-content: flex-start; margin: 0 0 16px 0; overflow-x: auto; max-width: 100%;';
        const categoryTabControls = document.createElement('div');
        categoryTabControls.style.cssText =
            'display: flex; justify-content: flex-start; margin: 0 0 16px 0; overflow-x: auto; max-width: 100%;';

        const renderCategoryTabs = () => {
            activeCategoryTab = categoryTabExists(
                activeOwnershipTab,
                activeCategoryTab,
            )
                ? activeCategoryTab
                : 'all';

            categoryTabControls.replaceChildren();
            categoryTabs = createPillToggle({
                options: getCategoryOptions(activeOwnershipTab),
                initialValue: activeCategoryTab,
                onChange: (tab) => {
                    activeCategoryTab = tab;
                    applyStoreFilters();
                },
            });
            categoryTabs.style.flexWrap = 'wrap';
            categoryTabs.style.maxWidth = '100%';
            categoryTabControls.appendChild(categoryTabs);
        };

        const ownershipTabs = createPillToggle({
            options: [
                { text: ts('profileCustomization.owned'), value: 'owned' },
                { text: ts('profileCustomization.unowned'), value: 'unowned' },
            ],
            initialValue: activeOwnershipTab,
            onChange: (tab) => {
                activeOwnershipTab = tab;
                activeCategoryTab = 'all';
                renderCategoryTabs();
                applyStoreFilters();
            },
        });
        ownershipTabs.style.flexWrap = 'wrap';
        ownershipTabs.style.maxWidth = '100%';
        ownershipTabControls.appendChild(ownershipTabs);
        renderCategoryTabs();
        container.append(
            ownershipTabControls,
            categoryTabControls,
            emptyTabMessage,
        );

        for (const category of [...ownedCategories, ...unownedCategories]) {
            const categoryHeader = document.createElement('h3');
            categoryHeader.style.cssText =
                'color: var(--rovalra-main-text-color); font-size: 16px; margin: 20px 0 10px 0; padding-bottom: 8px; border-bottom: 1px solid var(--rovalra-border-color);';
            categoryHeader.textContent = category.label;
            container.appendChild(categoryHeader);

            const variantsGrid = document.createElement('div');
            variantsGrid.style.cssText =
                'display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; margin-bottom: 10px; align-items: flex-start;';
            container.appendChild(variantsGrid);
            storeSections.push({
                categoryValue: category.value,
                isNew: category.new === true,
                ownershipMode: category.rovalraOwnershipMode,
                header: categoryHeader,
                grid: variantsGrid,
            });

            for (const variant of category.variants) {
                const visibleLoaders = [];
                const visibleVariants = [
                    variant.rovalraStaticVisible ? variant : null,
                    ...(variant.animated || []),
                ].filter(Boolean);

                const variantCard = document.createElement('div');
                variantCard.dataset.borderCard = '';
                variantCard.style.cssText =
                    'display: flex; flex-direction: column; padding: 12px; background: var(--rovalra-container-background-color); border-radius: 12px; border: 2px solid transparent;';

                const previewRow = document.createElement('div');
                previewRow.style.cssText =
                    'display: flex; align-items: center; justify-content: center; gap: 15px; margin-bottom: 8px;';

                for (const ownedVariant of visibleVariants) {
                    const variantContainer = document.createElement('div');
                    variantContainer.dataset.variantValue = ownedVariant.value;
                    variantContainer.style.cssText =
                        'display: flex; flex-direction: column; align-items: center; flex: 1; border: 1.5px solid transparent; border-radius: 10px; padding: 6px;';

                    const card = createPreviewUserCard(authedUserData);
                    card.style.transform = 'scale(1.1)';
                    card.style.margin = '5px 0';
                    const avatarEl = card.querySelector(
                        '.avatar.avatar-card-fullbody',
                    );
                    if (avatarEl) {
                        visibleLoaders.push(() =>
                            applyPreviewBorder(avatarEl, ownedVariant.link),
                        );
                    }

                    const label = document.createElement('div');
                    label.style.cssText =
                        'font-size: 11px; color: var(--rovalra-secondary-text-color); text-align: center; white-space: nowrap; margin-top: 5px; font-weight: 700;';
                    label.textContent =
                        ownedVariant === variant
                            ? ts('profileCustomization.static')
                            : ts('profileCustomization.animated');

                    const isVariantOwned =
                        category.rovalraOwnershipMode === 'owned';
                    const equipButton = createBorderActionButton({
                        variant: ownedVariant,
                        isSelected: currentBorderValue === ownedVariant.value,
                        isOwned: isVariantOwned,
                        container,
                        previewHolder,
                    });

                    variantContainer.append(card, label, equipButton);
                    previewRow.appendChild(variantContainer);
                }

                const variantLabel = document.createElement('div');
                variantLabel.style.cssText =
                    'color: var(--rovalra-main-text-color); font-weight: 600; font-size: 13px; text-align: center; margin-bottom: 4px;';
                variantLabel.textContent = variant.label;

                const ownedLabel = document.createElement('div');
                ownedLabel.textContent =
                    category.rovalraOwnershipMode === 'owned'
                        ? tier >= 3
                            ? ts('profileCustomization.free')
                            : ts('profileCustomization.owned')
                        : ts('profileCustomization.unowned');
                ownedLabel.style.cssText =
                    'font-size: 12px; font-weight: 600; color: var(--rovalra-secondary-text-color); text-align: center;';

                variantCard.append(previewRow, variantLabel, ownedLabel);
                variantsGrid.appendChild(variantCard);

                const intersection = observeIntersection(
                    variantCard,
                    (entry) => {
                        if (!entry.isIntersecting) return;

                        intersection.unobserve();
                        for (const load of visibleLoaders) load();
                    },
                    { threshold: 0.01 },
                );
            }
        }

        applyStoreFilters();
    } catch (error) {
        console.error(
            'RoValra: Failed to render profile customization.',
            error,
        );
        container.innerHTML = `<p style="color: var(--rovalra-secondary-text-color);">${ts('profileCustomization.failedToLoad')}</p>`;
    }
}

function openCustomizationOverlay(userId) {
    if (String(getUserIdFromUrl()) !== String(userId)) return;
    if (overlayInstance) overlayInstance.close();

    const body = document.createElement('div');
    body.style.cssText = 'color: var(--rovalra-main-text-color);';

    const tabControls = document.createElement('div');
    tabControls.style.cssText =
        'display:flex; margin-bottom:16px; overflow-x:auto; max-width:100%;';
    const content = document.createElement('div');
    const bordersContent = document.createElement('div');
    const framesContent = document.createElement('div');
    content.append(bordersContent, framesContent);
    body.append(tabControls, content);

    const tabs = createPillToggle({
        options: [
            { text: ts('profileCustomization.tabFrames'), value: 'frames' },
            { text: ts('profileCustomization.tabBorders'), value: 'borders' },
        ],
        initialValue: 'frames',
        onChange: (tab) => {
            bordersContent.hidden = tab !== 'borders';
            framesContent.hidden = tab !== 'frames';
            if (tab === 'frames' && !framesContent.dataset.loaded) {
                framesContent.dataset.loaded = 'true';
                renderFramePicker(framesContent, userId);
            }
        },
    });
    tabs.style.flexWrap = 'wrap';
    tabControls.appendChild(tabs);
    bordersContent.hidden = true;
    framesContent.dataset.loaded = 'true';
    renderFramePicker(framesContent, userId);

    const getMoreButton = createSquareButton({
        content: ts('profileCustomization.getMore'),
        onClick: () => {
            window.location.href =
                'https://www.roblox.com/my/account?rovalra=store';
        },
        width: '180px',
        height: 'height-1200',
        paddingX: 'padding-x-large',
        radius: 'radius-medium',
        fontSize: '16px',
        disableTextTruncation: true,
    });

    overlayInstance = createOverlay({
        title: ts('profileCustomization.title'),
        bodyContent: body,
        actions: [getMoreButton],
        maxWidth: '900px',
        maxHeight: 'calc(100vh - 60px)',
        showLogo: true,
        onClose: () => {
            overlayInstance = null;
        },
    });

    renderOwnedBorderPicker(bordersContent, userId);
}

async function getAuthedFramePreviewData(userId) {
    const thumbnails = await getBatchThumbnails([userId], 'Avatar', '420x420');
    return {
        thumbData: thumbnails[0] || { state: 'Error' },
    };
}

function keepPillAfterUsernameDetails(targetContainer, pill) {
    const appendPill = () => {
        if (!pill.isConnected || pill.parentElement !== targetContainer) return;

        const profileViewsPill = targetContainer.querySelector(
            ':scope > .rovalra-profile-views-pill',
        );
        const roproLikeCount = targetContainer.querySelector(
            ':scope > #reputationDiv',
        );
        const subplaceChip = targetContainer.querySelector(
            [
                ':scope > .rovalra-profile-subplace-legacy-chip',
                ':scope > .rovalra-profile-subplace-legacy-row',
            ].join(','),
        );

        if (profileViewsPill) {
            if (profileViewsPill.nextElementSibling !== pill) {
                profileViewsPill.after(pill);
            }
            return;
        }

        if (roproLikeCount) {
            if (roproLikeCount.nextElementSibling !== pill) {
                roproLikeCount.after(pill);
            }
            return;
        }

        if (subplaceChip) {
            if (pill.nextElementSibling !== subplaceChip) {
                subplaceChip.before(pill);
            }
            return;
        }

        if (targetContainer.lastElementChild !== pill) {
            targetContainer.appendChild(pill);
        }
    };

    appendPill();
    [0, 250, 1000, 2500].forEach((delay) => {
        setTimeout(appendPill, delay);
    });
}

async function initProfileCustomization() {
    const initGeneration = ++profileCustomizationInitGeneration;
    profileCustomizationObserver?.disconnect();
    profileCustomizationObserver = null;

    if (!(await rovalraSettings.profileCustomizationEnabled)) return;

    const [profileUserId, authedUserId] = await Promise.all([
        Promise.resolve(Number(getUserIdFromUrl())),
        getAuthenticatedUserId(),
    ]);

    if (initGeneration !== profileCustomizationInitGeneration) return;
    if (!profileUserId || !authedUserId) return;
    if (String(profileUserId) !== String(authedUserId)) return;

    profileCustomizationObserver = observeElement(
        '.user-profile-header-info .stylistic-alts-username',
        (username) => {
            if (!username?.isConnected || !username.parentElement) return;
            if (String(getUserIdFromUrl()) !== String(profileUserId)) return;

            const targetContainer = username.parentElement;
            if (
                !targetContainer.isConnected ||
                !targetContainer.contains(username)
            )
                return;
            if (
                targetContainer.querySelector(
                    '.rovalra-profile-customization-pill',
                )
            ) {
                return;
            }

            const pill = createPill(
                ts('profileCustomization.pill'),
                ts('profileCustomization.pillTooltip'),
                { size: 'small', isButton: true },
            );
            pill.classList.add('rovalra-profile-customization-pill');
            Object.assign(pill.style, {
                height: '24px',
                minHeight: '24px',
                paddingLeft: '10px',
                paddingRight: '10px',
                fontSize: '11px',
                lineHeight: '18px',
                width: 'fit-content',
                marginTop: '0px',
            });
            pill.addEventListener('click', () => {
                if (String(getUserIdFromUrl()) !== String(profileUserId))
                    return;
                openCustomizationOverlay(profileUserId);
            });

            targetContainer.appendChild(pill);
            keepPillAfterUsernameDetails(targetContainer, pill);
            observeChildren(targetContainer, () =>
                keepPillAfterUsernameDetails(targetContainer, pill),
            );
        },
    );
}

export function init() {
    initProfileCustomization();
}
