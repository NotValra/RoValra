let activePopup_bottomRight: HTMLElement | undefined;

export function showSidePopup_BottomRight(title: string, message: string) {
    if (!document.body) {
        console.warn(`Called showSidePopup_BottomRight() before document.body exists`);
        return;
    }

    activePopup_bottomRight?.remove();

    const element = document.createElement("div");
    element.classList.add("popup-bottomright");

    const titlee = document.createElement("p");
    titlee.style.fontSize = "1.2em";
    titlee.innerHTML = title;

    const descriptione = document.createElement("p");
    descriptione.style.fontSize = "0.8em";
    descriptione.innerHTML = message;

    element.append(titlee, descriptione);
    document.body.appendChild(element);

    activePopup_bottomRight = element;

    console.debug(`Showing popup: ${title}`);

    setTimeout(() => {
        console.debug(`Starting fade-out for popup: ${title}`);
        element.style.opacity = "0";

        setTimeout(() => {
            try {
                console.debug(`Deleting popup: ${title}`);
                element.remove();
            } catch {}
        }, 4500);
    }, 2000);
}
