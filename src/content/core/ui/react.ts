import { render, ComponentChild, ContainerNode, createRef, isValidElement, cloneElement } from "preact";

export function renderElement(element: ComponentChild, parent?: ContainerNode): HTMLElement {
    if (!isValidElement(element)) {
        throw new Error();
    }

    const ref = createRef<HTMLElement>();
    const container = parent ?? document.createElement('div');

    render(cloneElement(element, { ref: ref }), container);
    
    if (!ref.current)
        throw new Error("Failed to create PReact element.");

    return ref.current;
}

declare module "preact" {
    namespace JSX {
        interface IntrinsicElements {
            "secondary": JSX.IntrinsicElements["div"];
        }
    }
}

