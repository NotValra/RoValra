// Creates a banner on game pages with markdown support
import { parseMarkdown } from '../../utils/markdown.js';
import { observeElement, startObserving } from '../../observer.js';
import DOMPurify from 'dompurify';
let isInitialized = false;

export function init() {
    if (isInitialized) return;
    isInitialized = true;

    startObserving();

    const BANNER_ID = 'rovalra-game-notice-banner';
    const TARGET_PARENT_SELECTOR = '#game-detail-page';

    if (!window.GameBannerManager) {
        window.GameBannerManager = {
            addNotice: function (title, iconHtml = '', description = '') {
                const banner = document.getElementById(BANNER_ID);
                if (!banner) return;

                let fontSize = '20px';
                if (title.length > 100) {
                    fontSize = '14px';
                } else if (title.length > 50) {
                    fontSize = '16px';
                }

                const parsedTitle = DOMPurify.sanitize(parseMarkdown(title));
                const parsedDescription = DOMPurify.sanitize(
                    parseMarkdown(description),
                );

                const entry = document.createElement('div');
                entry.className = 'rovalra-game-notice-entry';

                let iconContent = '';
                if (iconHtml) {
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = DOMPurify.sanitize(iconHtml);
                    const svgElement = tempDiv.querySelector('svg');

                    if (svgElement) {
                        svgElement.setAttribute('fill', 'currentColor');
                        const modifiedIconHtml = svgElement.outerHTML;
                        iconContent = `<div class="rovalra-game-notice-icon">${modifiedIconHtml}</div>`;
                    }
                }

                const textContainer = document.createElement('div');
                textContainer.className = 'rovalra-game-notice-text-container';

                const titleDiv = document.createElement('div');
                titleDiv.className = 'rovalra-game-notice-title';
                titleDiv.innerHTML = parsedTitle; // Verified

                titleDiv.style.fontSize = fontSize;
                titleDiv.style.fontWeight = description ? '600' : '400';

                const mdWrapper = titleDiv.querySelector('.rovalra-markdown');
                if (mdWrapper) {
                    mdWrapper.style.display = 'contents';
                }

                const paragraphs = titleDiv.querySelectorAll('p');
                paragraphs.forEach((p) => {
                    p.style.margin = '0';
                    p.style.padding = '0';
                    p.style.display = 'inline';
                    p.style.color = 'inherit';
                    p.style.fontWeight = 'inherit';
                    p.style.fontSize = 'inherit';
                });

                textContainer.appendChild(titleDiv);

                if (description) {
                    const descDiv = document.createElement('div');
                    descDiv.className = 'rovalra-game-notice-description';
                    descDiv.innerHTML = parsedDescription; // Verified

                    const descWrapper =
                        descDiv.querySelector('.rovalra-markdown');
                    if (descWrapper) descWrapper.style.display = 'contents';

                    const descParagraphs = descDiv.querySelectorAll('p');
                    descParagraphs.forEach((p) => {
                        p.style.margin = '0';
                        p.style.color = 'inherit';
                    });

                    textContainer.appendChild(descDiv);
                }

                entry.innerHTML = iconContent; // Verified
                entry.appendChild(textContainer);

                banner.appendChild(entry);
                banner.style.display = 'flex';
            },
        };
    }

    function initializeBannerContainer() {
        if (document.getElementById(BANNER_ID)) return;

        const parent = document.querySelector(TARGET_PARENT_SELECTOR);
        if (parent) {
            const banner = document.createElement('div');
            banner.id = BANNER_ID;

            parent.prepend(banner);
        }
    }

    observeElement(TARGET_PARENT_SELECTOR, initializeBannerContainer);
}
