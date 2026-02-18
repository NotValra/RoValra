import { createNavbarButton } from '../../core/ui/navbarButton.js';
import { createRadioButton } from '../../core/ui/general/radio.js';
import { callRobloxApi, callRobloxApiJson } from '../../core/api.js';
import { createDropdownMenu } from '../../core/ui/dropdown.js';
import { createSpinner } from '../../core/ui/spinner.js';
import { getAssets } from '../../core/assets.js';

async function optInBeta(programId) {
    return callRobloxApi({
        subdomain: 'apis',
        endpoint: '/test-pilot-api/v1/opt-in',
        method: 'POST',
        body: { programId }
    });
}

async function optOutBeta() {
    return callRobloxApi({
        subdomain: 'apis',
        endpoint: '/test-pilot-api/v1/opt-in',
        method: 'POST',
        body: { programId: "" }
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
        tooltipText: "Toggle Beta Programs"
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
                programsDataPromise = callRobloxApiJson({ subdomain: 'apis', endpoint: '/test-pilot-api/v1/beta-programs' })
                    .then(data => {
                        cachedBetaPrograms = data;
                        return data;
                    });
            }

            const [programsData, optInData] = await Promise.all([
                programsDataPromise,
                callRobloxApiJson({ subdomain: 'apis', endpoint: '/test-pilot-api/v1/opt-in' })
            ]);

            const betaPrograms = programsData.betaPrograms || [];
            const currentOptInId = optInData.optIn?.programId;

            const menuItems = betaPrograms.map(program => ({
                label: program.displayName,
                value: program.id,
                description: program.description,
                checked: program.id === currentOptInId
            }));
            
            if (!menu) {
                menu = createDropdownMenu({
                    trigger: button,
                    items: [],
                    onValueChange: () => {},
                    position: 'center'
                });

                menu.panel.style.transform = 'translateX(-50%)';
                menu.panel.style.setProperty('min-width', '300px', 'important');
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
                noProgramsEl.textContent = 'You are not enrolled into any beta programs.';
                noProgramsEl.style.textAlign = 'center';
                noProgramsEl.style.padding = '10px';
                menu.panel.appendChild(noProgramsEl);
            } else {
                let currentCheckedRadio = null;
                const radios = [];

                menuItems.forEach(item => {
                    const itemEl = document.createElement('div');
                    itemEl.className = 'rovalra-dropdown-item flex items-center justify-between p-2';
                    itemEl.style.padding = '8px 12px';
                    itemEl.style.cursor = 'pointer';
                    
                    const textContainer = document.createElement('div');
                    textContainer.className = 'flex flex-col';
                    textContainer.style.marginRight = '10px';

                    const label = document.createElement('span');
                    label.className = 'text-body-emphasis';
                    label.textContent = item.label;
                    textContainer.appendChild(label);

                    if (item.description) {
                        const desc = document.createElement('span');
                        desc.className = 'text-caption-subtle';
                        desc.textContent = item.description;
                        textContainer.appendChild(desc);
                    }

                    const handleRadioChange = async (newState) => {
                        if (newState) {
                            radios.forEach(r => {
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
                        onChange: handleRadioChange
                    });
                    radios.push(radio);

                    if (item.checked) {
                        currentCheckedRadio = radio;
                    }

                    itemEl.addEventListener('click', (e) => {
                        if (radio.contains(e.target)) return;
                        const currentChecked = radio.getAttribute('aria-checked') === 'true';
                        radio.setChecked(!currentChecked);
                        handleRadioChange(!currentChecked);
                    });

                    itemEl.appendChild(textContainer);
                    itemEl.appendChild(radio);
                    menu.panel.appendChild(itemEl);
                });
            }

            menu.toggle(true);

        } catch (error) {
            console.error('RoValra: Failed to fetch beta programs', error);
            if (menu) menu.toggle(false);
        } finally {
            isLoading = false;
            button.innerHTML = originalIcon; //Verified
        }
    });
}
export function init() {
    chrome.storage.local.get({ betaProgramsEnabled: true }, (settings) => {
        if (!settings.betaProgramsEnabled) {
            return;
        }
        addNavbarButton();
    }
    )
}