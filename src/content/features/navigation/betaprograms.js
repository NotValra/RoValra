import { createNavbarButton } from '../../core/ui/navbarButton.js';
import { createRadioButton } from '../../core/ui/general/radio.js';
import { callRobloxApi, callRobloxApiJson } from '../../core/api.js';
import { createDropdownMenu } from '../../core/ui/dropdown.js';
import { createSpinner } from '../../core/ui/spinner.js';
import { t } from '../../core/locale/i18n.js';
import { getAssets } from '../../core/assets.js';
import { addTooltip } from '../../core/ui/tooltip.js';

async function optInBeta(programId) {
    return callRobloxApi({
        subdomain: 'apis',
        endpoint: '/test-pilot-api/v1/opt-in',
        method: 'POST',
        body: { programId },
    });
}

async function optOutBeta() {
    return callRobloxApi({
        subdomain: 'apis',
        endpoint: '/test-pilot-api/v1/opt-in',
        method: 'POST',
        body: { programId: '' },
    });
}

let cachedBetaPrograms = null;

export async function addNavbarButton() {
    if (document.getElementById('rovalra-beta-programs-toggle')) return;

    const assets = getAssets();
    const icon = assets.TerminalIcon;

    const button = await createNavbarButton({
        id: 'rovalra-beta-programs-toggle',
        iconSvgData: icon,
        tooltipText: await t('betaPrograms.toggleTooltip'),
    });

    if (!button) return;

    let menu = null;
    let isLoading = false;

    button.addEventListener('click', async (e) => {
        if (menu) e.stopImmediatePropagation();
        if (isLoading) return;

        if (menu && menu.panel.getAttribute('data-state') === 'open') {
            menu.toggle(false);
            return;
        }

        isLoading = true;
        const originalIcon = button.innerHTML;
        button.innerHTML = '';
        button.appendChild(createSpinner({ size: '28px' }));

        try {
            let programsDataPromise;
            if (cachedBetaPrograms) {
                programsDataPromise = Promise.resolve(cachedBetaPrograms);
            } else {
                programsDataPromise = callRobloxApiJson({
                    subdomain: 'apis',
                    endpoint: '/test-pilot-api/v1/beta-programs',
                }).then((data) => {
                    cachedBetaPrograms = data;
                    return data;
                });
            }

            const [programsData, optInData] = await Promise.all([
                programsDataPromise,
                callRobloxApiJson({
                    subdomain: 'apis',
                    endpoint: '/test-pilot-api/v1/opt-in',
                }),
            ]);

            const betaPrograms = programsData.betaPrograms || [];
            const currentOptInId = optInData.optIn?.programId;

            const menuItems = betaPrograms.map((program) => ({
                label: program.displayName,
                value: program.id,
                description: program.description,
                checked: program.id === currentOptInId,
                activeStatus: program.activeStatus,
                platforms: program.platforms || [],
            }));

            if (!menu) {
                menu = createDropdownMenu({
                    trigger: button,
                    items: [],
                    onValueChange: () => {},
                    position: 'center',
                });

                menu.panel.style.transform = 'translateX(-50%)';
                menu.panel.style.setProperty('min-width', '320px', 'important');
                menu.panel.style.maxHeight = '400px';
                menu.panel.style.overflowY = 'auto';

                const updatePosition = () => {
                    if (button.offsetWidth > 0) {
                        menu.panel.style.marginLeft = `${button.offsetWidth / 2}px`;
                    }
                };
                button.addEventListener('click', updatePosition);
                updatePosition();
            }

            menu.panel.innerHTML = '';

            if (menuItems.length === 0) {
                const noProgramsEl = document.createElement('div');
                noProgramsEl.className = 'rovalra-dropdown-item';
                noProgramsEl.textContent = await t('betaPrograms.noPrograms');
                noProgramsEl.style.textAlign = 'center';
                noProgramsEl.style.padding = '10px';
                menu.panel.appendChild(noProgramsEl);
            } else {
                let currentCheckedRadio = null;
                const radios = [];

                for (const item of menuItems) {
                    const itemEl = document.createElement('div');
                    itemEl.className =
                        'rovalra-dropdown-item flex items-center justify-between p-2';
                    itemEl.style.padding = '10px 12px';
                    itemEl.style.cursor = 'pointer';

                    const textContainer = document.createElement('div');
                    textContainer.className = 'flex flex-col';
                    textContainer.style.marginRight = '10px';
                    textContainer.style.flex = '1';

                    const label = document.createElement('span');
                    label.className = 'text-body-emphasis';
                    label.style.fontWeight = '600';
                    label.textContent = item.label;
                    textContainer.appendChild(label);

                    if (item.description) {
                        const desc = document.createElement('span');
                        desc.className = 'text-caption-subtle';
                        desc.textContent = item.description;
                        textContainer.appendChild(desc);
                    }

                    const iconsRow = document.createElement('div');
                    iconsRow.style.display = 'flex';
                    iconsRow.style.alignItems = 'center';
                    iconsRow.style.gap = '8px';
                    iconsRow.style.marginTop = '6px';
                    iconsRow.style.flexWrap = 'wrap';
                    iconsRow.style.color = 'var(--rovalra-main-text-color)';

                    const addPlatIcon = (assetKey, tooltipText) => {
                        const el = document.createElement('div');
                        el.style.display = 'flex';
                        el.style.alignItems = 'center';
                        el.style.justifyContent = 'center';
                        const svgData = assets[assetKey];
                        if (svgData.startsWith('data:image/svg+xml,')) {
                            el.innerHTML = decodeURIComponent(
                                svgData.split(',')[1],
                            ); // verified
                        }
                        addTooltip(el, tooltipText, { position: 'bottom' });
                        iconsRow.appendChild(el);
                    };

                    // Allowlist Icon
                    if (
                        item.activeStatus === 'PROGRAM_ACTIVE_STATUS_ALLOWLIST'
                    ) {
                        addPlatIcon(
                            'betaAllowlist',
                            await t('betaPrograms.allowlist'),
                        );
                    }

                    const p = item.platforms;

                    // Group Windows
                    const win = [];
                    if (p.includes('PROGRAM_PLATFORM_WINDOWS_PLAYER'))
                        win.push('Player');
                    if (p.includes('PROGRAM_PLATFORM_WINDOWS_STUDIO'))
                        win.push('Studio');
                    if (win.length > 0)
                        addPlatIcon(
                            'betaWindowsStudio',
                            `Windows (${win.join(' & ')})`,
                        );

                    // Group Mac
                    const mac = [];
                    if (p.includes('PROGRAM_PLATFORM_MAC_PLAYER'))
                        mac.push('Player');
                    if (p.includes('PROGRAM_PLATFORM_MAC_STUDIO'))
                        mac.push('Studio');
                    if (mac.length > 0)
                        addPlatIcon(
                            'betaMacPlayer',
                            `macOS (${mac.join(' & ')})`,
                        );

                    // Group Android
                    const andr = [];
                    if (p.includes('PROGRAM_PLATFORM_GOOGLE_ANDROID_APP'))
                        andr.push('Google Play');
                    if (p.includes('PROGRAM_PLATFORM_AMAZON_ANDROID_APP'))
                        andr.push('Amazon');
                    if (p.includes('PROGRAM_PLATFORM_TENCENT_ANDROID_APP'))
                        andr.push('Tencent');
                    if (andr.length > 0)
                        addPlatIcon(
                            'betaAndroid',
                            `Android (${andr.join(', ')})`,
                        );

                    // iOS
                    if (p.includes('PROGRAM_PLATFORM_IOS_APP'))
                        addPlatIcon('betaIos', 'iOS');

                    // PlayStation
                    const ps = [];
                    if (p.includes('PROGRAM_PLATFORM_PS4_APP')) ps.push('PS4');
                    if (p.includes('PROGRAM_PLATFORM_PS5_APP')) ps.push('PS5');
                    if (ps.length > 0)
                        addPlatIcon('betaPlaystation', ps.join(' & '));

                    // Xbox
                    if (p.includes('PROGRAM_PLATFORM_XBOX_APP'))
                        addPlatIcon('betaXbox', 'Xbox');

                    // Quest / VR
                    if (p.includes('PROGRAM_PLATFORM_QUEST_ANDROID_APP'))
                        addPlatIcon('betaVR', 'Meta Quest');

                    if (iconsRow.children.length > 0) {
                        textContainer.appendChild(iconsRow);
                    }

                    const handleRadioChange = async (newState) => {
                        if (newState) {
                            radios.forEach((r) => {
                                if (r !== radio) r.setChecked(false);
                            });
                            currentCheckedRadio = radio;
                            await optInBeta(item.value);
                        } else {
                            if (currentCheckedRadio === radio) {
                                currentCheckedRadio = null;
                                await optOutBeta();
                            }
                        }
                    };

                    const radio = createRadioButton({
                        checked: item.checked,
                        onChange: handleRadioChange,
                    });
                    radios.push(radio);

                    if (item.checked) currentCheckedRadio = radio;

                    itemEl.addEventListener('click', (e) => {
                        if (radio.contains(e.target)) return;
                        const currentChecked =
                            radio.getAttribute('aria-checked') === 'true';
                        radio.setChecked(!currentChecked);
                        handleRadioChange(!currentChecked);
                    });

                    itemEl.appendChild(textContainer);
                    itemEl.appendChild(radio);
                    menu.panel.appendChild(itemEl);
                }
            }

            menu.toggle(true);
        } catch (error) {
            console.error('RoValra: Failed to fetch beta programs', error);
            if (menu) menu.toggle(false);
        } finally {
            isLoading = false;
            button.innerHTML = originalIcon; // Verified
        }
    });
}

export function init() {
    chrome.storage.local.get({ betaProgramsEnabled: true }, (settings) => {
        if (!settings.betaProgramsEnabled) return;
        addNavbarButton();
    });
}
