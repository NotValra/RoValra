import { createScrollButtons } from '../general/scrollButtons.js';

function applyStyles(element, styles) {
    Object.assign(element.style, styles);
    return element;
}

export function createProfileCarouselSection({
    title,
    href = '',
    className = '',
    listId = '',
    scrollId = '',
    itemGap = '12px',
    scrollAmount = 600,
    marginTop = '24px',
    includeScrollButtons = true,
} = {}) {
    const section = applyStyles(document.createElement('div'), { marginTop });
    section.className = ['profile-carousel', className]
        .filter(Boolean)
        .join(' ');

    const container = document.createElement('div');
    container.className = 'css-17g81zd-collectionCarouselContainer';

    const header = applyStyles(document.createElement('div'), {
        marginBottom: '12px',
    });

    const titleElement = document.createElement('h2');
    titleElement.className =
        'content-emphasis text-heading-small padding-none inline-block';
    titleElement.style.margin = '0';
    titleElement.textContent = title || '';

    if (href) {
        const link = document.createElement('a');
        link.href = href;
        link.className = 'items-center inline-flex';
        link.style.textDecoration = 'none';
        link.appendChild(titleElement);

        const chevron = document.createElement('span');
        chevron.className = 'icon-chevron-heavy-right';
        chevron.style.marginLeft = '4px';
        link.appendChild(chevron);
        header.appendChild(link);
    } else {
        const titleWrapper = document.createElement('div');
        titleWrapper.className = 'items-center inline-flex';
        titleWrapper.appendChild(titleElement);
        header.appendChild(titleWrapper);
    }

    const carouselContainer = applyStyles(document.createElement('div'), {
        overflow: 'show',
        maxWidth: '100%',
        width: '100%',
        margin: '0',
    });
    carouselContainer.className = 'css-1jynqc0-carouselContainer';

    const scrollContainer = includeScrollButtons
        ? applyStyles(document.createElement('div'), {
              overflowX: 'auto',
              maxWidth: '100%',
              paddingBottom: '10px',
              scrollbarWidth: 'none',
              scrollBehavior: 'smooth',
              flexGrow: '1',
              minWidth: '0',
          })
        : carouselContainer;
    if (scrollId) scrollContainer.id = scrollId;

    const list = document.createElement('div');
    list.className = 'css-1i465w8-carousel';
    if (listId) list.id = listId;
    applyStyles(list, {
        display: 'flex',
        gap: itemGap,
        width: 'max-content',
    });

    let refreshControls = () => {};

    if (includeScrollButtons) {
        const scrollWrapper = applyStyles(document.createElement('div'), {
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            width: '100%',
            minWidth: '0',
        });

        const { leftButton, rightButton } = createScrollButtons({
            onLeftClick: () => {
                scrollContainer.scrollLeft -= scrollAmount;
            },
            onRightClick: () => {
                scrollContainer.scrollLeft += scrollAmount;
            },
        });

        leftButton.classList.add('rovalra-scroll-btn', 'left');
        rightButton.classList.add('rovalra-scroll-btn', 'right');

        refreshControls = () => {
            const { scrollLeft, scrollWidth, clientWidth } = scrollContainer;
            const isScrollable = scrollWidth > clientWidth + 5;
            leftButton.style.display = isScrollable ? 'flex' : 'none';
            rightButton.style.display = isScrollable ? 'flex' : 'none';
            leftButton.classList.toggle(
                'rovalra-btn-disabled',
                scrollLeft <= 5,
            );
            rightButton.classList.toggle(
                'rovalra-btn-disabled',
                scrollLeft + clientWidth >= scrollWidth - 5,
            );
        };

        scrollContainer.addEventListener('scroll', refreshControls);
        scrollContainer.appendChild(list);
        scrollWrapper.append(leftButton, scrollContainer, rightButton);
        carouselContainer.appendChild(scrollWrapper);
    } else {
        scrollContainer.appendChild(list);
    }

    container.append(header, carouselContainer);
    section.appendChild(container);

    return { section, list, scrollContainer, refreshControls };
}

export function createProfileCarouselItem({ width = '150px' } = {}) {
    const item = document.createElement('div');
    item.id = 'collection-carousel-item';
    item.className = 'css-1j6j8e0-carouselItem';
    item.style.flexShrink = '0';
    item.style.width = width;
    return item;
}
