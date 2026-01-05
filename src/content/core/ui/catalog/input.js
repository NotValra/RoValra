// Creates a input box styled like robloxs input box on the catalog (this was a pain)
let isCssInjected = false;


function injectInputCss() {
    if (isCssInjected) return;
    isCssInjected = true;

    const style = document.createElement('style');
    style.id = 'rovalra-catalog-input-style';
    style.textContent = `
        .rovalra-catalog-input-wrapper {
            position: relative;
            overflow: visible !important; 
        }
        .rovalra-catalog-input-base {
            position: relative;
            border-radius: 8px;
            height: 40px;
        }
        .rovalra-catalog-input-label {
            color: var(--rovalra-secondary-text-color);
            font-family: "Builder Sans", "Helvetica Neue", Helvetica, Arial, "Lucida Grande", sans-serif;
            font-weight: 400;
            font-size: 1rem;
            line-height: 1.4375em;
            padding: 0;
            position: absolute;
            left: 14px;
            top: 50%; 
            transform: translateY(-50%);
            transition: color 200ms cubic-bezier(0.0, 0, 0.2, 1) 0ms, transform 200ms cubic-bezier(0.0, 0, 0.2, 1) 0ms;
            pointer-events: none;
            z-index: 1; 
        }
        .rovalra-catalog-input-field {
            background-color: transparent !important;
            border: none !important;
            
            outline: none !important;
            box-shadow: none !important;
            width: 100%;
            height: 40px;
            padding: 8px 14px;
            position: relative;
            color: var(--rovalra-main-text-color) !important;
            font-family: "Builder Sans", "Helvetica Neue", Helvetica, Arial, "Lucida Grande", sans-serif !important;
            font-size: 16px !important;
            box-sizing: border-box !important;
        }
        
        .rovalra-catalog-input-field::-webkit-search-decoration,
        .rovalra-catalog-input-field::-webkit-search-cancel-button,
        .rovalra-catalog-input-field::-webkit-search-results-button,
        .rovalra-catalog-input-field::-webkit-search-results-decoration {
            display: none;
        }

        .rovalra-catalog-input-field[readonly] {
            cursor: text !important;
            background-color: transparent !important;
        }


    .rovalra-catalog-input-fieldset { 
        border: 1px solid rgb(66 65 65 / 45%);
        position: absolute;
        top: -5px; 
        height: 45px; 
        left: 0;
        right: 0;
        margin: 0;
        border-radius: inherit;
        pointer-events: none; 
        transition: border-color 200ms ease; 
    }
        .rovalra-catalog-input-legend {
            padding: 0;
            text-align: left;
            transition: max-width 200ms cubic-bezier(0.0, 0, 0.2, 1) 0ms;
            line-height: 23px;
            height: 11px;
            max-width: 0.01px;
            background-color: transparent; 
            transition: background-color 200ms ease; 
        }
        .rovalra-catalog-input-legend span {
            display: inline-block;
            padding-left: 5px;
            padding-right: 0px;
            visibility: hidden; 
            font-size: 12px;
        }
        .rovalra-catalog-input-label.MuiInputLabel-shrink {
            transform: translate(0, -27px) scale(0.75);
            transform-origin: top left; 
        }
        .rovalra-catalog-input-label.Mui-focused {
        }
        .rovalra-catalog-input-base.Mui-focused .rovalra-catalog-input-fieldset {
            border: 2px solid rgb(51, 95, 255); 
        }
        .rovalra-catalog-input-label.MuiInputLabel-shrink ~ .rovalra-catalog-input-base .rovalra-catalog-input-legend {

            max-width: calc(100% * 0.70 + 0px);
        }
    `;
    document.head.appendChild(style);
}


export function createStyledInput({ id, label = '', placeholder = ' ' }) {
    injectInputCss();

    const container = document.createElement('div');
    container.className = 'rovalra-catalog-input-wrapper';

    const inputBase = document.createElement('div');
    inputBase.className = 'rovalra-catalog-input-base';

    const input = document.createElement('input');

    input.type = 'text'; 
    input.id = id;
    
    input.name = id; 
    
    input.className = 'rovalra-catalog-input-field';
    input.placeholder = placeholder;
    // THIS IS SO FUN!
    input.setAttribute('autocomplete', 'off'); 
    input.setAttribute('autocorrect', 'off'); 
    input.setAttribute('autocapitalize', 'off'); 
    input.setAttribute('spellcheck', 'false'); 
    
    input.setAttribute('data-lpignore', 'true'); 
    input.setAttribute('data-1p-ignore', 'true'); 
    input.setAttribute('data-bwignore', 'true'); 
    input.setAttribute('data-form-type', 'other'); 
    

    const labelElement = document.createElement('label');
    labelElement.htmlFor = id;
    labelElement.className = 'rovalra-catalog-input-label';
    labelElement.textContent = label;

    const fieldset = document.createElement('fieldset');
    fieldset.setAttribute('aria-hidden', 'true');
    fieldset.className = 'rovalra-catalog-input-fieldset'; 

    const legend = document.createElement('legend');
    legend.className = 'rovalra-catalog-input-legend';
    legend.innerHTML = `<span>${label || '&#8203;'}</span>`; 
    fieldset.appendChild(legend);

    const checkShrink = () => {
        if (input.value || input.classList.contains('Mui-focused')) {
            labelElement.classList.add('MuiInputLabel-shrink');
        } else {
            labelElement.classList.remove('MuiInputLabel-shrink');
        }
    };

    input.addEventListener('focus', () => {
        
        labelElement.classList.add('Mui-focused');
        inputBase.classList.add('Mui-focused'); 
        container.classList.add('Mui-focused'); 
        input.classList.add('Mui-focused'); 
        checkShrink();
    });

    input.addEventListener('blur', () => {

        labelElement.classList.remove('Mui-focused');
        container.classList.remove('Mui-focused'); 
        inputBase.classList.remove('Mui-focused'); 
        input.classList.remove('Mui-focused'); 
        checkShrink();
    });

    input.addEventListener('input', checkShrink);

    inputBase.append(input, fieldset);
    container.append(labelElement, inputBase);
    checkShrink(); 

    return { container, input, label: labelElement };
}