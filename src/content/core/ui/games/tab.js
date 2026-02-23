import { observeElement } from '../../observer.js';

export function createTab({ id, label, container, contentContainer, hash }) {
    const tab = document.createElement('li');
    tab.id = `tab-${id}`;
    tab.className = `rbx-tab tab-${id}`;
    tab.innerHTML = `<a class="rbx-tab-heading"><span class="text-lead">${label}</span></a>`;

    const contentPane = document.createElement('div');
    contentPane.className = 'tab-pane';
    contentPane.id = `${id}-content-pane`;

    container.appendChild(tab);
    contentContainer.appendChild(contentPane);

    const otherPanes = contentContainer.querySelectorAll('.tab-pane');
    const hasPaneWithBackground = Array.from(otherPanes).some(pane => {
        if (pane === contentPane) return false;
        const style = window.getComputedStyle(pane);
        const bgColor = style.backgroundColor;
        return bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent';
    });
    if (hasPaneWithBackground) {
        contentPane.style.backgroundColor = 'var(--rovalra-container-background-color)';
    }

    container.style.display = 'flex';
    container.style.flexWrap = 'nowrap';

    observeElement('#horizontal-tabs .rbx-tab', (tab) => {
        tab.style.width = 'auto';
        tab.style.flex = '1 1 auto';
        tab.style.float = 'none';
        tab.style.minWidth = '0';
    }, { multiple: true });

    tab.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('.rbx-tab.active, .tab-pane.active').forEach(el => el.classList.remove('active'));
        tab.classList.add('active');
        contentPane.classList.add('active');
        if (hash && window.location.hash !== hash) window.location.hash = hash;
    });

    if (hash && window.location.hash === hash) {
        setTimeout(() => tab.click(), 200);
    }

    return { tab, contentPane };
}