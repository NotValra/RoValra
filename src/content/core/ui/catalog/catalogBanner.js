// Creates a banner on game pages with markdown support
import { parseMarkdown } from '../../utils/markdown.js';
import { observeElement, startObserving } from '../../observer.js';
import DOMPurify from 'dompurify';
let isInitialized = false;

export function init() {
    if (isInitialized) return;
    isInitialized = true;

    startObserving();

    const BANNER_ID = 'rovalra-catalog-notice-banner';
    const TARGET_PARENT_SELECTOR = '.page-content.menu-shown';

    if (!window.CatalogBannerManager) {
        window.CatalogBannerManager = {
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
                entry.className = 'rovalra-catalog-notice-entry';
                entry.style.display = 'flex';
                entry.style.alignItems = 'center';
                entry.style.gap = '10px';

                let iconContent = '';
                if (iconHtml) {
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = DOMPurify.sanitize(iconHtml);
                    const svgElement = tempDiv.querySelector('svg');
                    const imgElement = tempDiv.querySelector('img');

                    if (svgElement) {
                        svgElement.setAttribute('fill', 'currentColor');
                        const modifiedIconHtml = svgElement.outerHTML;
                        iconContent = `<div class="rovalra-catalog-notice-icon" style="display: flex; flex-shrink: 0; align-items: center;">${modifiedIconHtml}</div>`;
                    } else if (imgElement) {
                        const styleWidth = imgElement.style.width ? parseInt(imgElement.style.width) : 0;
                        const attrWidth = imgElement.getAttribute('width') ? parseInt(imgElement.getAttribute('width')) : 0;

                        if (styleWidth > 48 || attrWidth > 48) {
                            banner.classList.add('rovalra-banner-compact');
                        }

                        iconContent = `<div class="rovalra-catalog-notice-icon" style="display: flex; flex-shrink: 0; align-items: center;">${tempDiv.innerHTML}</div>`;
                    }
                }

                const textContainer = document.createElement('div');
                textContainer.className = 'rovalra-catalog-notice-text-container';
                textContainer.style.flex = '1';

                const titleDiv = document.createElement('div');
                titleDiv.className = 'rovalra-catalog-notice-title';
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
                    descDiv.className = 'rovalra-catalog-notice-description';
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
                banner.style.flexDirection = 'column';
                banner.style.gap = '10px';
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
