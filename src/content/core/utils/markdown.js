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

        .rovalra-markdown table {
            border-collapse: collapse;
            width: 100%;
            margin: 15px 0;
        }

        .rovalra-markdown th, .rovalra-markdown td {
            border: 1px solid var(--rovalra-container-background-color);
            padding: 8px 12px;
            text-align: left;
        }

        .rovalra-markdown th {
            background-color: rgba(255, 255, 255, 0.05);
            font-weight: bold;
        }

        .rovalra-markdown blockquote {
            border-left: 4px solid var(--rovalra-container-background-color);
            margin: 15px 0;
            padding-left: 15px;
            color: var(--rovalra-secondary-text-color);
        }

        .rovalra-markdown code {
            background-color: rgba(255, 255, 255, 0);
            padding: 2px 5px;
            border-radius: 4px;
            font-family: monospace;
        }

        .rovalra-markdown pre {
            background-color: rgba(0, 0, 0, 0.2);
            padding: 15px;
            border-radius: 8px;
            overflow-x: auto;
            margin: 15px 0;
        }

        .rovalra-markdown img {
            max-width: 100%;
            border-radius: 4px;
        }

        .rovalra-markdown ul, .rovalra-markdown ol {
            padding-left: 20px;
            margin: 15px 0;
        }

        .rovalra-markdown ul {
            list-style-type: disc;
        }

        .rovalra-markdown ol {
            list-style-type: decimal;
        }

        .rovalra-markdown li {
            margin-bottom: 5px;
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