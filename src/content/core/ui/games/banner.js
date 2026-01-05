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

            addNotice: function(title, iconHtml = '', description = '') {
                const banner = document.getElementById(BANNER_ID);
                if (!banner) return; 

                let fontSize = '20px'; 
                if (title.length > 100) {
                    fontSize = '14px';
                } else if (title.length > 50) {
                    fontSize = '16px';
                }

                const parsedTitle = DOMPurify.sanitize(parseMarkdown(title));
                const parsedDescription = DOMPurify.sanitize(parseMarkdown(description));

                const entry = document.createElement('div');
                entry.style.cssText = `
                    display: flex;
                    position: relative;
                    align-items: center;
                    gap: 15px;
                    padding: 5px 0;
                    color: var(--rovalra-main-text-color);
                `;
                
                let iconContent = '';
                if(iconHtml) {
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = DOMPurify.sanitize(iconHtml);
                    const svgElement = tempDiv.querySelector('svg');

                    if (svgElement) {
                        svgElement.setAttribute('fill', 'currentColor');
                        const modifiedIconHtml = svgElement.outerHTML;
                        iconContent = `<div style="display:flex; align-items:center; justify-content:center; width:48px; height:48px; flex-shrink:0;">${modifiedIconHtml}</div>`;
                    }
                }

                const textContainer = document.createElement('div');
                textContainer.style.display = 'flex';
                textContainer.style.flexDirection = 'column';
                textContainer.style.justifyContent = 'center';

                const titleDiv = document.createElement('div');
                titleDiv.innerHTML = parsedTitle; 

                titleDiv.style.fontSize = fontSize;
                titleDiv.style.fontWeight = description ? '600' : '400'; 
                titleDiv.style.lineHeight = '1.2';
                titleDiv.style.color = 'var(--rovalra-main-text-color)';

                const mdWrapper = titleDiv.querySelector('.rovalra-markdown');
                if (mdWrapper) {
                    mdWrapper.style.display = 'contents'; 
                }

                const paragraphs = titleDiv.querySelectorAll('p');
                paragraphs.forEach(p => {
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
                    descDiv.innerHTML = parsedDescription; 
                    
                    descDiv.style.fontSize = '14px'; 
                    descDiv.style.marginTop = '4px';
                    descDiv.style.color = 'var(--rovalra-secondary-text-color)';
                    
                    const descWrapper = descDiv.querySelector('.rovalra-markdown');
                    if(descWrapper) descWrapper.style.display = 'contents';

                    const descParagraphs = descDiv.querySelectorAll('p');
                    descParagraphs.forEach(p => {
                        p.style.margin = '0';
                        p.style.color = 'inherit'; 
                    });
                    
                    textContainer.appendChild(descDiv);
                }

                entry.innerHTML = iconContent;
                entry.appendChild(textContainer);

                banner.appendChild(entry);
                banner.style.display = 'flex';
            }
        };
    }

    function initializeBannerContainer() {
        if (document.getElementById(BANNER_ID)) return;

        const parent = document.querySelector(TARGET_PARENT_SELECTOR);
        if (parent) {
            const banner = document.createElement('div');
            banner.id = BANNER_ID;

            banner.style.cssText = `
                background-color: var(--rovalra-container-background-color);
                width: 100%;
                padding: 10px 15px;
                margin-bottom: 12px;
                display: none;
                flex-direction: column;
            `;

            parent.prepend(banner);
        }
    }


    observeElement(TARGET_PARENT_SELECTOR, initializeBannerContainer);
}