import DOMPurify from 'dompurify';

export function createSerialIcon(item, hideSerial) {
    if (item.serialNumber === null) return null;

    const serialVisibilityClass = hideSerial
        ? 'hover-reveal'
        : 'always-visible';
    const serialIconElement = document.createElement('div');
    serialIconElement.className = `rovalra-serial-container ${serialVisibilityClass}`;
    serialIconElement.innerHTML = DOMPurify.sanitize(`
        <div class="rovalra-serial-star">
            <span class="icon-shop-limited"></span>
        </div>
        <span class="rovalra-serial-number">#${item.serialNumber.toLocaleString()}</span>
    `);

    return serialIconElement;
}
