// !! AI-Generated function
// TODO: Remake / Validate
function mkElement(selector) {
    const [, tag = "div", id, classes = ""] =
        selector.match(/^([\w-]+)?(?:#([\w-]+))?((?:\.[\w-]+)*)$/);

    const el = document.createElement(tag);

    if (id) el.id = id;
    el.className = classes.replaceAll(".", " ").trim();

    return el;
}

/**
 * Get a variable defined in CSS/SCSS
 * @param {Element | HTMLElement} rootElement Element to examine
 * @param {string} variableName A string starting with `--`
 * @returns {string}
 */
export default function getVariable(rootElement, variableName) {
    if (typeof rootElement === 'string') rootElement = mkElement(rootElement);
    let style = window.getComputedStyle(rootElement);
    return style.getPropertyValue(variableName)
}

/**
 * Get a variable defined in CSS/SCSS
 * @param {Element | HTMLElement} rootElement Element to examine
 * @param {string} variableName A string starting with `--`
 * @returns {string}
 */
export function getPropertyPriority(rootElement, variableName) {
    if (typeof rootElement === 'string') rootElement = mkElement(rootElement);
    let style = window.getComputedStyle(rootElement);
    return style.getPropertyPriority(variableName)
}

