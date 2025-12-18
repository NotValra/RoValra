// SPINNY!!!!
export function createSpinner({ size = '24px', color = 'currentColor', className = '' } = {}) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 20 20');
    svg.setAttribute('fill', 'none');
    svg.style.width = size;
    svg.style.height = size;
    svg.style.animation = 'rovalra-spinner-rotation 1s linear infinite';
    
    if (className) {
        svg.className = className;
    }

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('fill-rule', 'evenodd');
    path.setAttribute('clip-rule', 'evenodd');
    path.setAttribute('fill', color);
    path.setAttribute('d', 'M10 2.75C8.56609 2.75 7.16438 3.1752 5.97212 3.97185C4.77986 4.76849 3.85061 5.90078 3.30188 7.22554C2.75314 8.55031 2.60957 10.008 2.88931 11.4144C3.16905 12.8208 3.85955 14.1126 4.87348 15.1265C5.88741 16.1405 7.17924 16.831 8.5856 17.1107C9.99196 17.3904 11.4497 17.2469 12.7745 16.6981C14.0992 16.1494 15.2315 15.2201 16.0282 14.0279C16.8248 12.8356 17.25 11.4339 17.25 10C17.25 9.58579 17.5858 9.25 18 9.25C18.4142 9.25 18.75 9.58579 18.75 10C18.75 11.7306 18.2368 13.4223 17.2754 14.8612C16.3139 16.3002 14.9473 17.4217 13.3485 18.0839C11.7496 18.7462 9.9903 18.9195 8.29296 18.5819C6.59563 18.2443 5.03653 17.4109 3.81282 16.1872C2.58911 14.9635 1.75575 13.4044 1.41813 11.707C1.08051 10.0097 1.25379 8.25037 1.91606 6.65152C2.57832 5.05267 3.69983 3.6861 5.13876 2.72464C6.57769 1.76318 8.26942 1.25 10 1.25C10.4142 1.25 10.75 1.58579 10.75 2C10.75 2.41421 10.4142 2.75 10 2.75Z');

    svg.appendChild(path);

    if (!document.getElementById('rovalra-spinner-keyframes')) {
        const style = document.createElement('style');
        style.id = 'rovalra-spinner-keyframes';
        style.textContent = `
            @keyframes rovalra-spinner-rotation {
                from { transform: rotate(0deg); }
                to { transform: rotate(359deg); }
            }
        `;
        document.head.appendChild(style);
    }

    return svg;
}


export function createSpinnerContainer({ 
    size = '24px', 
    color = 'currentColor', 
    className = '', 
    containerClass = '',
    containerStyle = {}
} = {}) {
    const container = document.createElement('div');
    
    if (containerClass) {
        container.className = containerClass;
    }
    
    Object.assign(container.style, {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...containerStyle
    });

    const spinner = createSpinner({ size, color, className });
    container.appendChild(spinner);

    return container;
}
