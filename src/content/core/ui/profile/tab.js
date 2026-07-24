export function createTab({
    id,
    label,
    container,
    contentContainer,
    hash = `#!/${id}`,
    classes = [],
}) {
    const tab = document.createElement('li');
    tab.className = 'justify-center flex fill';

    const link = document.createElement('a');
    link.id = `tab-${id}`;
    link.href = hash;
    link.className =
        'profile-tab justify-center text-label-medium padding-bottom-xlarge padding-top-medium flex fill';
    link.textContent = label;
    link.setAttribute('aria-selected', 'false');
    tab.appendChild(link);

    const contentPane = document.createElement('div');
    contentPane.id = `${id}-content`;
    contentPane.className = ['tab-pane', ...classes].join(' ');
    contentPane.style.display = 'none';

    const getContentPanes = () =>
        Array.from(
            contentContainer.querySelectorAll(
                ':scope > .tab-pane, :scope > .profile-tab-content',
            ),
        );

    const setActiveTab = (activeLink, activePane) => {
        container.parentElement
            ?.querySelectorAll('.profile-tab')
            .forEach((tabLink) => {
                const isActive = tabLink === activeLink;
                tabLink.classList.toggle('active', isActive);
                tabLink.setAttribute('aria-selected', String(isActive));
            });

        getContentPanes().forEach((pane) => {
            const isActive = pane === activePane;
            pane.classList.toggle('active', isActive);
            pane.style.display = isActive ? 'block' : 'none';
        });
    };

    const activate = (updateHash = true) => {
        setActiveTab(link, contentPane);

        if (updateHash && hash && window.location.hash !== hash) {
            window.location.hash = hash;
        }
    };

    link.addEventListener('click', (event) => {
        event.preventDefault();
        activate();
    });

    container.addEventListener('click', (event) => {
        const clickedLink = event.target.closest('.profile-tab');
        if (!clickedLink || clickedLink === link) return;

        const links = Array.from(
            container.parentElement?.querySelectorAll('.profile-tab') || [],
        );
        const panes = getContentPanes();
        const pane = panes[links.indexOf(clickedLink)];
        if (pane) setActiveTab(clickedLink, pane);
    });

    container.appendChild(tab);
    contentContainer.appendChild(contentPane);

    if (window.location.hash === hash) activate(false);

    window.addEventListener('hashchange', () => {
        if (window.location.hash === hash) activate(false);
    });

    return { tab, link, contentPane, activate };
}
