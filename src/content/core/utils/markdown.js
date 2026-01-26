import { marked } from 'marked'; // Better markdown!!!

export function parseMarkdown(text, themeColors = {}) {
    if (!text) return '';

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