import DOMPurify from 'dompurify';

export const sanitizeStrict = (content) => {
    return DOMPurify.sanitize(content, {
        ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'u', 's', 'p', 'div', 'span', 'br', 'ul', 'ol', 'li'],
        ALLOWED_ATTR: []
    });
};

export const safeHtml = (strings, ...values) => {
    let result = strings[0];
    values.forEach((val, i) => {
        const valueStr = (val === null || val === undefined) ? '' : String(val);
        const escaped = valueStr
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
        result += escaped + strings[i + 1];
    });
    return DOMPurify.sanitize(result);
};

export default DOMPurify;