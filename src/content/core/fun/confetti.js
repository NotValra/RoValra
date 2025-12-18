
export function createConfetti(element, imageUrl) {
    const rect = element.getBoundingClientRect();
    const confettiContainer = document.createElement('div');
    Object.assign(confettiContainer.style, {
        position: 'fixed',
        left: `${rect.left + rect.width / 2}px`,
        top: `${rect.top + rect.height / 2}px`,
        width: '1px',
        height: '1px',
        zIndex: '1000',
        pointerEvents: 'none'
    });
    document.body.appendChild(confettiContainer);

    for (let i = 0; i < 50; i++) {
        const confetti = document.createElement('img');
        confetti.src = imageUrl;
        Object.assign(confetti.style, { position: 'absolute', width: '15px', height: '15px', opacity: '0' });

        const angle = Math.random() * 2 * Math.PI;
        const distance = Math.random() * 100 + 50;
        const duration = Math.random() * 1500 + 1000;

        confetti.animate([
            { transform: 'translate(-50%, -50%) rotate(0deg)', opacity: 1 },
            { transform: `translate(calc(-50% + ${Math.cos(angle) * distance}px), calc(-50% + ${Math.sin(angle) * distance}px)) rotate(720deg)`, opacity: 0 }
        ], { duration, easing: 'ease-out', fill: 'forwards' });
        confettiContainer.appendChild(confetti);
    }

    setTimeout(() => { if (document.body.contains(confettiContainer)) document.body.removeChild(confettiContainer); }, 3000);
}