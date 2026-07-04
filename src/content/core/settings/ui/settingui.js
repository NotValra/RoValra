import { getAssets } from '../../assets.js';
import { callRobloxApi } from '../../api.js';
import { SETTINGS_CONFIG } from '../settingConfig.js';
import { createDropdown } from '../../ui/dropdown.js';

const ACCOUNT_STANDING_TAB_IDS = new Set([
    'info',
    'credits',
    'donatorPerks',
    'store',
    'changelogs',
]);

function isAccountStandingDirectLink() {
    const rovalraTab = new URLSearchParams(window.location.search).get(
        'rovalra',
    );
    return rovalraTab?.toLowerCase() === 'account standing';
}

function hasModerationHistory(data) {
    const appealStatus = data?.appeal?.appeal_status;
    if (
        appealStatus !== null &&
        appealStatus !== undefined &&
        appealStatus !== 0
    ) {
        return true;
    }

    const moderation = data?.moderation;
    if (!moderation) return false;

    const status = Number(moderation.moderation_status ?? 0);
    if (status > 0) return true;
    if (moderation.moderated_at) return true;

    return (
        Array.isArray(moderation.moderated_content_history) &&
        moderation.moderated_content_history.length > 0
    );
}

async function shouldShowAccountStandingTab(settings) {
    if (
        settings.alwaysShowAccountStandingTab === true ||
        isAccountStandingDirectLink()
    ) {
        return true;
    }

    try {
        const response = await callRobloxApi({
            subdomain: 'apis',
            endpoint: '/v1/auth/moderation/status',
            method: 'GET',
            isRovalraApi: true,
        });

        if (!response.ok) return false;
        return hasModerationHistory(await response.json());
    } catch (error) {
        console.warn(
            'RoValra: Failed to check account standing tab visibility',
            error,
        );
        return false;
    }
}

function shouldShowStaticTab(item, accountStandingTabVisible) {
    if (item.id === 'accountStanding') return accountStandingTabVisible;
    return ACCOUNT_STANDING_TAB_IDS.has(item.id);
}

function ensureDeveloperSettings() {
    if (!SETTINGS_CONFIG.Developer) {
        SETTINGS_CONFIG.Developer = { title: 'Developer', settings: {} };
    }
}

function shouldShowSettingsSection(sectionName, options = {}) {
    if (sectionName === 'Developer' && !options.devTabAdded) return false;
    if (sectionName === 'FunStuff' && !options.funStuffTabEnabled) return false;
    return true;
}

export async function buildSettingsPage({
    handleSearch,
    debounce,
    loadTabContent,
    buttonData,
    REGIONS,
    initSettings,
}) {
    const settings = await new Promise((resolve) => {
        chrome.storage.local.get(
            [
                'alwaysShowDeveloperSettings',
                'FunStuffEnabled',
                'alwaysShowAccountStandingTab',
            ],
            resolve,
        );
    });

    let devTabAdded = settings.alwaysShowDeveloperSettings === true;
    let funStuffTabEnabled = settings.FunStuffEnabled === true;
    let accountStandingTabVisible = await shouldShowAccountStandingTab(settings);
    if (devTabAdded) ensureDeveloperSettings();
    const assets = getAssets();
    const containerMain = document.querySelector('main.container-main');
    if (!containerMain) {
        console.error(
            'RoValra: Main container not found. Cannot build settings page.',
        );
        return {};
    }

    const roproThemeFrame = containerMain.querySelector('#roproThemeFrame');
    let roproThemeFrameHTML = roproThemeFrame ? roproThemeFrame.outerHTML : '';
    containerMain.innerHTML = roproThemeFrameHTML;

    let reactUserAccountBaseDiv = document.createElement('div');
    reactUserAccountBaseDiv.id = 'react-user-account-base';
    let contentDiv = document.createElement('div');
    contentDiv.classList.add('content');
    contentDiv.id = 'content';
    let userAccountDiv = document.createElement('div');
    userAccountDiv.classList.add(
        'row',
        'page-content',
        'new-username-pwd-rule',
    );
    userAccountDiv.id = 'user-account';

    let headerContainer = document.createElement('div');
    headerContainer.style.cssText =
        'display: flex; align-items: center; justify-content: center; margin-bottom: 20px;';

    let rovalraIcon = document.createElement('img');
    rovalraIcon.dataset.rovalraAsset = 'rovalraIcon';
    rovalraIcon.src = assets.rovalraIcon;
    rovalraIcon.style.cssText =
        'width: 35px; height: 35px; margin-left: 5px;  user-select: none;';

    let rovalraHeader = document.createElement('h1');
    rovalraHeader.textContent = 'RoValra Settings';
    rovalraHeader.style.margin = '0';
    rovalraHeader.style.color = 'var(--rovalra-main-text-color)';

    headerContainer.appendChild(rovalraHeader);
    rovalraHeader.appendChild(rovalraIcon);

    let settingsContainer = document.createElement('div');
    settingsContainer.id = 'settings-container';

    userAccountDiv.appendChild(reactUserAccountBaseDiv);
    reactUserAccountBaseDiv.appendChild(headerContainer);
    reactUserAccountBaseDiv.appendChild(settingsContainer);
    contentDiv.appendChild(userAccountDiv);
    containerMain.appendChild(contentDiv);

    contentDiv.style.cssText = `width: 100% !important; height: auto !important; border-radius: 10px !important; overflow: hidden !important; padding-bottom: 25px !important; padding-top: 25px !important; min-height: 800px !important; position: relative !important;`;

    if (userAccountDiv) {
        userAccountDiv.style.cssText = `display: flex !important; flex-direction: column !important; align-items: center !important; justify-content: center !important; padding-left: 0px !important; padding-right: 0px !important; margin-left: auto !important; margin-right: auto !important; width: 100% !important;`;
    }

    const mobileMenuContainer = document.createElement('div');
    mobileMenuContainer.id = 'rovalra-mobile-menu-container';
    mobileMenuContainer.style.width = '100%';

    settingsContainer.appendChild(mobileMenuContainer);

    const renderMobileDropdown = () => {
        mobileMenuContainer.innerHTML = '';

        const urlParams = new URLSearchParams(window.location.search);
        const initialTab = urlParams.get('rovalra') || 'info';
        const dropdownItems = [];

        buttonData
            .filter((item) =>
                shouldShowStaticTab(item, accountStandingTabVisible),
            )
            .forEach((item) => {
                dropdownItems.push({
                    value: item.text.toLowerCase(),
                    label: item.text,
                });
            });

        Object.keys(SETTINGS_CONFIG).forEach((sectionName) => {
            if (
                !shouldShowSettingsSection(sectionName, {
                    devTabAdded,
                    funStuffTabEnabled,
                })
            )
                return;
            dropdownItems.push({
                value: sectionName.toLowerCase(),
                label: SETTINGS_CONFIG[sectionName].title,
            });
        });

        const mobileDropdown = createDropdown({
            items: dropdownItems,
            initialValue: initialTab,
            placeholder: 'Select Setting...',
            onValueChange: async (value) => {
                const newUrl = new URL(window.location.href);
                if (newUrl.searchParams.get('rovalra') !== value) {
                    newUrl.searchParams.set('rovalra', value);
                    history.pushState(
                        null,
                        '',
                        newUrl.pathname + newUrl.search,
                    );
                }

                const selectedItem = dropdownItems.find(
                    (item) => item.value === value,
                );

                if (selectedItem) {
                    const textSpan =
                        mobileDropdown.trigger.querySelector(
                            '.text-truncate-split span',
                        ) || mobileDropdown.trigger.querySelector('span');
                    if (textSpan) {
                        textSpan.textContent = selectedItem.label;
                    }
                }

                await loadTabContent(value);
                stripInlineStyles(document.getElementById('content-container'));
            },
        });

        mobileDropdown.element.style.width = '100%';
        mobileDropdown.element.style.display = 'block';
        mobileDropdown.trigger.style.width = '100%';
        mobileMenuContainer.appendChild(mobileDropdown.element);

        const currentItem = dropdownItems.find(
            (item) => item.value === initialTab,
        );
        if (currentItem) {
            const textSpan =
                mobileDropdown.trigger.querySelector(
                    '.text-truncate-split span',
                ) || mobileDropdown.trigger.querySelector('span');
            if (textSpan) textSpan.textContent = currentItem.label;
        }
    };

    renderMobileDropdown();

    const uiContainer = document.createElement('div');
    uiContainer.id = 'rovalra-ui-container';
    uiContainer.style.cssText =
        'display: flex; flex-direction: row; gap: 10px; align-items: flex-start; position: relative; overflow: visible; width: 100%; justify-content: flex-start;';

    settingsContainer.appendChild(uiContainer);
    settingsContainer.style.cssText =
        'display: block; position: relative; overflow: visible; width: 100%;';

    settingsContainer.insertAdjacentElement('afterbegin', rovalraHeader);

    uiContainer.innerHTML = '';

    const contentContainer = document.createElement('div');
    contentContainer.id = 'content-container';

    contentContainer.style.cssText = `
        width: 800px; 
        flex-shrink: 0;
        overflow-y: auto; 
        overflow-x: auto; 
        padding-left: 0px; 
        position: relative; 
        margin-top: 7px; 
        background-color: transparent; 
        min-width: 0;
    `;

    const unifiedMenu = createUnifiedMenu({
        handleSearch,
        debounce,
        buttonData,
        devTabAdded,
        funStuffTabEnabled,
        accountStandingTabVisible,
        loadTabContent,
        REGIONS,
        initSettings,
    });

    rovalraIcon.addEventListener('click', () => {
        let rovalraIconClickCount = (rovalraIcon.dataset.clickCount || 0) * 1;
        rovalraIconClickCount++;
        rovalraIcon.dataset.clickCount = rovalraIconClickCount;

        if (rovalraIconClickCount >= 10 && !devTabAdded) {
            devTabAdded = true;
            ensureDeveloperSettings();
            addDeveloperTabUI({
                REGIONS,
                initSettings,
                menuList: unifiedMenu,
                loadTabContent,
                renderMobileDropdown,
            });
        }
    });

    document.addEventListener('rovalra:settingSaved', (event) => {
        if (event.detail?.name === 'FunStuffEnabled') {
            funStuffTabEnabled = event.detail.value === true;
            updateFunStuffTabUI({
                enabled: funStuffTabEnabled,
                menuList: unifiedMenu,
                loadTabContent,
                renderMobileDropdown,
            });
            return;
        }

        if (event.detail?.name === 'alwaysShowAccountStandingTab') {
            accountStandingTabVisible =
                event.detail.value === true || isAccountStandingDirectLink();
            updateAccountStandingTabUI({
                enabled: accountStandingTabVisible,
                buttonData,
                menuList: unifiedMenu,
                loadTabContent,
                renderMobileDropdown,
            });
        }
    });

    uiContainer.appendChild(unifiedMenu);
    uiContainer.appendChild(contentContainer);

    return { rovalraHeader, settingsContainer, contentDiv, userAccountDiv };
}

function stripInlineStyles(container) {
    if (!container) return;

    if (container.querySelector('#settings-content')) {
        return;
    }

    const selectors = [
        '.setting',
        '.setting-description',
        '.setting-controls',
        '.setting-label-divider',
        'label',
        'span:not(.rovalra-markdown-color)',
        'div',
    ];
    const elements = container.querySelectorAll(selectors.join(','));
    elements.forEach((el) => {
        if (el.style.color) el.style.removeProperty('color');
        if (el.style.backgroundColor)
            el.style.removeProperty('background-color');
    });
}

function createUnifiedMenu({
    handleSearch,
    debounce,
    buttonData,
    devTabAdded,
    funStuffTabEnabled,
    accountStandingTabVisible,
    loadTabContent,
    REGIONS,
    initSettings,
}) {
    const menuList = document.createElement('ul');
    menuList.id = 'unified-menu';
    menuList.className = 'menu-vertical rovalra-sidebar';
    menuList.setAttribute('role', 'tablist');

    const searchListItem = document.createElement('li');
    searchListItem.id = 'search-tab';
    searchListItem.className = 'menu-option search-container';
    searchListItem.style.padding = '0px';
    searchListItem.style.marginBottom = '10px';

    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.id = 'settings-search-input';
    searchInput.placeholder = 'Search Settings...';
    searchInput.style.cssText =
        'width: 89%; padding: 8px; border-radius: 0px; font-size: 14px; border: 0px solid var(--rovalra-container-background-color) !important; background: transparent !important; color: var(--rovalra-main-text-color) !important;';

    const performSearch = debounce((query) => {
        try {
            const mockEvent = {
                target: {
                    value: query,
                },
            };
            handleSearch(mockEvent);
        } catch (error) {
            console.warn('RoValra: Search handler failed:', error);
        }
    }, 300);

    searchInput.addEventListener('input', (e) => {
        performSearch(e.target.value);
    });

    searchInput.addEventListener('focus', () => {
        document
            .querySelectorAll('#unified-menu .menu-option-content')
            .forEach((el) => {
                el.classList.remove('active');
                el.removeAttribute('aria-current');
            });
        const newUrl = new URL(window.location.href);
        if (newUrl.searchParams.get('rovalra') !== 'search') {
            newUrl.searchParams.set('rovalra', 'search');
            history.pushState(
                null,
                '',
                newUrl.pathname + newUrl.search + '#!/search',
            );
            loadTabContent('search');
        }
    });

    searchListItem.appendChild(searchInput);
    menuList.appendChild(searchListItem);

    const staticItems = buttonData.filter(
        (item) => shouldShowStaticTab(item, accountStandingTabVisible),
    );
    staticItems.forEach((item) => {
        const listItem = document.createElement('li');
        listItem.id = `${item.text.toLowerCase()}-tab`;
        listItem.dataset.text = item.text;
        listItem.dataset.staticId = item.id;
        listItem.className = 'menu-option';
        listItem.setAttribute('role', 'tab');
        const link = document.createElement('a');
        link.className = 'menu-option-content';
        link.href = `#!/${item.text.toLowerCase()}`;
        const span = document.createElement('span');
        span.className = 'font-caption-header';
        span.textContent = item.text;
        link.appendChild(span);
        listItem.appendChild(link);
        menuList.appendChild(listItem);
        link.addEventListener('click', async (e) => {
            e.preventDefault();
            const newHashKey = item.text.toLowerCase();
            const newUrl = new URL(window.location.href);
            if (newUrl.searchParams.get('rovalra') !== newHashKey) {
                newUrl.searchParams.set('rovalra', newHashKey);
                history.pushState(null, '', newUrl.pathname + newUrl.search);
            }
            await loadTabContent(newHashKey);
            stripInlineStyles(document.getElementById('content-container'));

            const dropdownTrigger = document.querySelector(
                '#rovalra-mobile-menu-container .rovalra-dropdown-trigger span',
            );
            if (dropdownTrigger) dropdownTrigger.textContent = item.text;
        });
    });

    const separator = document.createElement('li');
    separator.classList.add('menu-separator');
    separator.style.cssText =
        'height: 1px; background-color: var(--rovalra-secondary-text-color); opacity: 0.3; margin: 10px 0;';
    separator.setAttribute('role', 'separator');
    menuList.appendChild(separator);

    Object.keys(SETTINGS_CONFIG).forEach((sectionName) => {
        if (
            !shouldShowSettingsSection(sectionName, {
                devTabAdded,
                funStuffTabEnabled,
            })
        )
            return;
        const listItem = createSidebarItem(
            sectionName,
            SETTINGS_CONFIG[sectionName].title,
            loadTabContent,
        );
        menuList.appendChild(listItem);
    });
    return menuList;
}

function addStaticTabItem(item, menuList, loadTabContent) {
    const listItem = document.createElement('li');
    listItem.id = `${item.text.toLowerCase()}-tab`;
    listItem.dataset.text = item.text;
    listItem.dataset.staticId = item.id;
    listItem.className = 'menu-option';
    listItem.setAttribute('role', 'tab');

    const link = document.createElement('a');
    link.className = 'menu-option-content';
    link.href = `#!/${item.text.toLowerCase()}`;

    const span = document.createElement('span');
    span.className = 'font-caption-header';
    span.textContent = item.text;
    link.appendChild(span);
    listItem.appendChild(link);

    link.addEventListener('click', async (e) => {
        e.preventDefault();
        const newHashKey = item.text.toLowerCase();
        const newUrl = new URL(window.location.href);
        if (newUrl.searchParams.get('rovalra') !== newHashKey) {
            newUrl.searchParams.set('rovalra', newHashKey);
            history.pushState(null, '', newUrl.pathname + newUrl.search);
        }
        await loadTabContent(newHashKey);
        stripInlineStyles(document.getElementById('content-container'));

        const dropdownTrigger = document.querySelector(
            '#rovalra-mobile-menu-container .rovalra-dropdown-trigger span',
        );
        if (dropdownTrigger) dropdownTrigger.textContent = item.text;
    });

    const separator = menuList.querySelector('.menu-separator');
    if (separator) {
        menuList.insertBefore(listItem, separator);
    } else {
        menuList.appendChild(listItem);
    }

    return listItem;
}

function createSidebarItem(sectionName, title, loadTabContent) {
    const listItem = document.createElement('li');
    listItem.id = `${sectionName.toLowerCase()}-tab`;
    listItem.dataset.section = sectionName;
    listItem.setAttribute('role', 'tab');
    listItem.classList.add('menu-option');

    const link = document.createElement('a');
    link.classList.add('menu-option-content');
    link.href = `#!/${sectionName.toLowerCase()}`;

    const span = document.createElement('span');
    span.classList.add('font-caption-header');
    span.textContent = title;
    link.appendChild(span);
    listItem.appendChild(link);

    link.addEventListener('click', async function (e) {
        e.preventDefault();
        document
            .querySelectorAll('#unified-menu .menu-option-content')
            .forEach((el) => {
                el.classList.remove('active');
                el.removeAttribute('aria-current');
            });
        this.classList.add('active');
        this.setAttribute('aria-current', 'page');

        const newUrl = new URL(window.location.href);
        if (newUrl.searchParams.get('rovalra') !== sectionName.toLowerCase()) {
            newUrl.searchParams.set('rovalra', sectionName.toLowerCase());
            history.pushState(null, '', newUrl.pathname + newUrl.search);
        }

        await loadTabContent(sectionName);
        stripInlineStyles(document.getElementById('content-container'));

        const dropdownTrigger = document.querySelector(
            '#rovalra-mobile-menu-container .rovalra-dropdown-trigger span',
        );
        if (dropdownTrigger) dropdownTrigger.textContent = title;
    });

    return listItem;
}

function addDeveloperTabUI({ menuList, loadTabContent, renderMobileDropdown }) {
    if (menuList && loadTabContent) {
        const devItem = createSidebarItem(
            'Developer',
            'Developer',
            loadTabContent,
        );

        devItem.style.opacity = '0';
        devItem.style.transition = 'opacity 0.5s ease';

        menuList.appendChild(devItem);

        requestAnimationFrame(() => {
            devItem.style.opacity = '1';
        });
    }

    if (typeof renderMobileDropdown === 'function') {
        renderMobileDropdown();
    }
}

function updateFunStuffTabUI({
    enabled,
    menuList,
    loadTabContent,
    renderMobileDropdown,
}) {
    const existingItem = document.getElementById('funstuff-tab');

    if (enabled && !existingItem && menuList && loadTabContent) {
        const funItem = createSidebarItem(
            'FunStuff',
            SETTINGS_CONFIG.FunStuff.title,
            loadTabContent,
        );
        const developerItem = document.getElementById('developer-tab');

        if (developerItem) {
            menuList.insertBefore(funItem, developerItem);
        } else {
            menuList.appendChild(funItem);
        }
    } else if (!enabled && existingItem) {
        existingItem.remove();

        const currentTab = new URLSearchParams(window.location.search).get(
            'rovalra',
        );
        if (currentTab?.toLowerCase() === 'funstuff') {
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.set('rovalra', 'info');
            history.pushState(null, '', newUrl.pathname + newUrl.search);
            loadTabContent('info');
        }
    }

    if (typeof renderMobileDropdown === 'function') {
        renderMobileDropdown();
    }
}

function updateAccountStandingTabUI({
    enabled,
    buttonData,
    menuList,
    loadTabContent,
    renderMobileDropdown,
}) {
    const existingItem = document.querySelector(
        '#unified-menu li[data-static-id="accountStanding"]',
    );

    if (enabled && !existingItem && menuList && loadTabContent) {
        const accountStandingItem = buttonData.find(
            (item) => item.id === 'accountStanding',
        );
        if (accountStandingItem) {
            addStaticTabItem(accountStandingItem, menuList, loadTabContent);
        }
    } else if (!enabled && existingItem) {
        existingItem.remove();

        const currentTab = new URLSearchParams(window.location.search).get(
            'rovalra',
        );
        if (currentTab?.toLowerCase() === 'account standing') {
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.set('rovalra', 'info');
            history.pushState(null, '', newUrl.pathname + newUrl.search);
            loadTabContent('info');
        }
    }

    if (typeof renderMobileDropdown === 'function') {
        renderMobileDropdown();
    }
}
