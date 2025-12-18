import { marked } from 'marked'; // Better markdown!!!

const injectMarkdownStyles = () => {
    if (document.getElementById('rovalra-markdown-styles')) return;

    const style = document.createElement('style');
    style.id = 'rovalra-markdown-styles';
    style.textContent = `
        .rovalra-markdown a {
            text-decoration: underline !important;
            cursor: pointer !important;
            color: inherit;
        }

        .rovalra-markdown a:hover {
            opacity: 0.95;
        }

        

    `;
    document.head.appendChild(style);
};

export function parseMarkdown(text, themeColors = {}) {
    if (!text) return '';

    injectMarkdownStyles();

    let processedText = text.replace(/\{\{(.*?) ([a-zA-Z0-9#-_]+)\}\}/g, (match, content, colorName) => {
        const colorValue = themeColors[colorName] || colorName || 'inherit';
        return `<span style="color:${colorValue};">${content}</span>`;
    });

    marked.setOptions({
        gfm: true,
        breaks: true,
    });


    return `<div class="rovalra-markdown">${marked.parse(processedText)}</div>`;
}