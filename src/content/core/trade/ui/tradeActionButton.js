import { observeChildren } from '../../observer.js';
import { getUserIdFromUrl } from '../../idExtractor.js';
import { createFoundationButton } from '../../ui/buttons.js';

const MAX_MOVES_PER_TASK = 3;

function getTradePartnerLink(container) {
    return (
        container
            .closest('.trades-list-detail')
            ?.querySelector('.paired-name') || null
    );
}

export function getTradePartnerId(container) {
    const link = getTradePartnerLink(container);
    return link ? getUserIdFromUrl(link.href) : null;
}

export function getTradePartnerName(container) {
    const link = getTradePartnerLink(container);
    if (!link) return null;

    const parts = link.querySelectorAll('.element');
    const displayName = parts[0]?.textContent?.trim();
    const username = parts[1]?.textContent?.trim().replace(/^@/, '');
    if (!displayName) return null;
    return username ? `${displayName} (@${username})` : displayName;
}

function isRobloxButton(element) {
    return (
        element.tagName === 'BUTTON' &&
        ![...element.classList].some((className) =>
            className.startsWith('rovalra-'),
        ) &&
        [...element.classList].some(
            (className) =>
                className === 'foundation-web-button' ||
                className.startsWith('btn-'),
        )
    );
}

export function addTradeActionButton(container, { className, onClick }) {
    const button = createFoundationButton('', {
        size: 'medium',
        classList: ['rovalra-trade-action-button', className],
        onClick: (e) => {
            e.preventDefault();
            e.stopPropagation();
            onClick(e);
        },
    });
    const label = button.querySelector('.text-no-wrap');

    let moves = 0;
    const keepAfterRobloxButtons = () => {
        let misplaced = button.parentNode !== container;
        for (
            let next = button.nextElementSibling;
            next && !misplaced;
            next = next.nextElementSibling
        ) {
            misplaced = isRobloxButton(next);
        }
        if (!misplaced || moves >= MAX_MOVES_PER_TASK) return;

        moves++;
        setTimeout(() => (moves = 0));
        container.appendChild(button);
    };

    const childObserver = observeChildren(container, keepAfterRobloxButtons);
    container.appendChild(button);

    return {
        button,
        setLabel(text) {
            if (label.textContent !== text) label.textContent = text;
        },
        remove() {
            childObserver.disconnect();
            button.remove();
        },
    };
}
