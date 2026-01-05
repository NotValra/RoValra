export function showSystemAlert(message, type = 'success') {
    let feedbackContainer = document.querySelector('.sg-system-feedback');
    if (!feedbackContainer) {
        feedbackContainer = document.createElement('div');
        feedbackContainer.className = 'sg-system-feedback';
        document.body.appendChild(feedbackContainer);
    }

    const container = document.createElement('div');
    container.className = 'alert-system-feedback';

    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.setAttribute('role', 'alert');

    const span = document.createElement('span');
    span.className = 'alert-content';
    span.textContent = message;

    alertDiv.appendChild(span);
    container.appendChild(alertDiv);
    feedbackContainer.appendChild(container);

    void alertDiv.offsetWidth;
    alertDiv.classList.add('on');

    setTimeout(() => {
        alertDiv.classList.remove('on');
        setTimeout(() => container.remove(), 300);
    }, 3000);
}