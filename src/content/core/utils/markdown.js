import { marked } from 'marked'; // Better markdown!!!
import DOMPurify from 'dompurify';

export function parseMarkdown(text, themeColors = {}) {
    if (!text) return '';

    let processedText = text.replace(
        /\{\{(.*?) ([a-zA-Z0-9#-_]+)\}\}/g,
        (match, content, colorName) => {
            const colorValue = themeColors[colorName] || colorName || 'inherit';
            return `<span class='rovalra-markdown-color' style="color:${colorValue};">${content}</span>`;
        },
    );

    processedText = processedText.replace(/^(\s*)-\s+/gm, '$1• ');

    marked.setOptions({
        gfm: true,
        breaks: true,
    });

    return `<div class="rovalra-markdown">${marked.parse(processedText)}</div>`;
}

/**
 * Format markdown from untrusted sources
 * @param {string} text
 * @param {{ fullMarkdown?: boolean, githubMentions?: boolean }} options
 * @returns {string} Safe HTML render
 */
export function parseUntrustedMarkdown(text, options = {}) {
    if (!text) return '';

    const githubMentionsEnabled = options.githubMentions === true;

    const addGithubMentions = (value) =>
        value.replace(
            /(^|[^\w/])@([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?)/g,
            (match, prefix, username) =>
                `${prefix}<a href="https://github.com/${username}" target="_blank" rel="noopener noreferrer" class="rovalra-github-mention">@${username}</a>`,
        );

    if (githubMentionsEnabled) {
        text = addGithubMentions(text);
    }

    if (options.fullMarkdown) {
        marked.setOptions({
            gfm: true,
            breaks: true,
        });

        return DOMPurify.sanitize(marked.parse(text), {
            ALLOWED_TAGS: [
                'a',
                'blockquote',
                'br',
                'code',
                'em',
                'h1',
                'h2',
                'h3',
                'h4',
                'li',
                'ol',
                'p',
                'pre',
                'strong',
                'ul',
            ],
            ALLOWED_ATTR: ['class', 'href', 'rel', 'target'],
        }).trim();
    }

    // Headings
    text = text.replace(/^# (.*)$/m, (match, heading) => {
        return `<u><b>${heading}</b></u><br>`;
    }); // allow ONE heading which is just bold text + newline

    // Bold Text
    text = text.replaceAll(/\*\*(.*?)\*\*/g, (match, bold) => {
        return `<b>${bold}</b>`;
    });

    text = text.replaceAll(/__(.*?)__/g, (match, bold) => {
        return `<b>${bold}</b>`;
    });

    // Italic Text
    text = text.replaceAll(/\*(.*?)\*/g, (match, italic) => {
        return `<i>${italic}</i>`;
    });

    text = text.replaceAll(/_(.*?)_/g, (match, italic) => {
        return `<i>${italic}</i>`;
    });

    // Inline Codeblocks
    text = text.replaceAll(/`(.*?)`/g, (match, codeblock) => {
        return `<code>${codeblock}</code>`;
    });

    text = text.replaceAll(/\r\n|\r|\n/g, '<br>');

    return DOMPurify.sanitize(text, {
        ALLOWED_TAGS: ['a', 'b', 'i', 'u', 'code', 'br'],
        ALLOWED_ATTR: ['class', 'href', 'rel', 'target'],
    }).trim();
}
