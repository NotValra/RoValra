export function createJSXElement(tag: string, props: Record<string, any>, ...children: unknown[]): HTMLElement {
    const element = document.createElement(tag);

    if (props) {
        for (const [name, value] of Object.entries(props)) {
            if (name.startsWith('on') && typeof value === 'function') {
                element.addEventListener(name.slice(2).toLowerCase(), value);
            } else {
                element.setAttribute(name, String(value));
            }
        }
    }

    for (const child of children.flat(Infinity)) {
        if (child === null || child === undefined || child === false) {
            continue;
        }

        element.append(
            child instanceof Node
                ? child
                : (function _(): HTMLElement {
                    const e = document.createElement("p");
                    e.innerHTML = `${String(child)}`;
                    return e;
                })(),
        );
    }

    return element;
}

declare global {
    namespace JSX {
        export type Element = HTMLElement;

        interface IntrinsicElements {
            [tagName: string]: Record<string, unknown>;
        }
    }
}
