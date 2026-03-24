import { parseMarkdown } from '../../core/utils/markdown.js';
import { observeElement } from '../../core/observer.js';

let observerActive = false;

function removeHomeElement() {
    const homeElementToRemove = document.querySelector('li.cursor-pointer.btr-nav-node-header_home.btr-nav-header_home');
    if (homeElementToRemove) homeElementToRemove.remove();
}

function renderMarkdownPage(contentDiv) {
    if (window.location.pathname.toLowerCase() !== '/markdown') return;
    
    contentDiv.innerHTML = '';
    contentDiv.style.position = 'relative';

    const headerContainer = document.createElement('div');
    headerContainer.style.marginBottom = '20px';
    headerContainer.style.padding = '20px 0';

    const h1 = document.createElement('h1');
    h1.textContent = 'RoValra Markdown Test';
    h1.style.fontWeight = '800';
    h1.style.fontSize = '2.5em';
    h1.style.margin = '0';

    headerContainer.appendChild(h1);
    contentDiv.appendChild(headerContainer);

    const testMarkdown = `
# Heading 1
## Heading 2
### Heading 3
#### Heading 4
##### Heading 5
###### Heading 6

---

### Text Formatting
This is a paragraph with **bold text**, *italic text*, and ~~strikethrough~~.
You can also combine them: ***bold and italic***.

### Lists
Unordered:
- Item 1
- Item 2
  - Nested Item 2.1
  - Nested Item 2.2

Ordered:
1. First
2. Second
3. Third

### Links & Images
[RoValra Repository](https://github.com/NotValra/RoValra)
![Image Test](https://tr.rbxcdn.com/180DAY-bae15f4fd078a8cb4229bee3c0bfebf3/150/150/Decal/Webp/noFilter)

### Code
Inline code: \`console.log('Hello')\`

Block code:
\`\`\`javascript
const test = 'Hello World';
function run() {
    console.log(test);
}
\`\`\`

### Blockquotes
> This is a blockquote.
> It can span multiple lines.

### Bullet points
- This is a bullet point
- This is another bullet point

### Tables
| Header 1 | Header 2 |
| --- | --- |
|Data 1|Data 2|
|Data 3|Data 4|

### Custom Colors (RoValra Specific)
{{This text is red red}}
{{This text is blue blue}}
{{This text is green #00FF00}}
{{This text uses theme color text-color}}
`;

    const themeColors = {
        red: '#ff5555',
        blue: '#5555ff',
        'text-color': 'var(--rovalra-main-text-color)'
    };

    const renderedHtml = parseMarkdown(testMarkdown, themeColors);
    
    const container = document.createElement('div');
    container.style.padding = '20px';
    container.innerHTML = renderedHtml; // Verified
    // Static and a test page so we should be good
    
    contentDiv.appendChild(container);

    removeHomeElement();
}

export function init() {
    chrome.storage.local.get('eastereggslinksEnabled', (result) => {
        if (result.eastereggslinksEnabled) {
            if (window.location.pathname.toLowerCase() !== '/markdown') return;

            const contentDiv = document.querySelector('.content#content');
            if (contentDiv) {
                renderMarkdownPage(contentDiv);
            }

            if (!observerActive) {
                observerActive = true;
                observeElement('.content#content', (cDiv) => {
                    renderMarkdownPage(cDiv);
                });
            }
        }
    });
}