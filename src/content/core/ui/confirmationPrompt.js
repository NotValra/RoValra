import { createOverlay } from './overlay.js';
import { createButton } from './buttons.js';
import DOMPurify from 'dompurify';

export function showConfirmationPrompt({
    title = 'Confirm Action',
    message = 'Are you sure you want to proceed?',
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    confirmType = 'primary',
    cancelType = 'secondary',
    onConfirm,
    onCancel
}) {
    const bodyContent = document.createElement('div');
    bodyContent.innerHTML = DOMPurify.sanitize(`<p class="text-body" style="margin: 0; font-size: 14px; line-height: 1.5;">${message}</p>`);

    let isConfirmed = false;

    const confirmBtn = createButton(confirmText, confirmType, {
        onClick: () => {
            isConfirmed = true;
            close();
            if (onConfirm) onConfirm();
        }
    });

    const cancelBtn = createButton(cancelText, cancelType, {
        onClick: () => {
            close();
        }
    });

    const { close } = createOverlay({
        title,
        bodyContent,
        actions: [cancelBtn, confirmBtn],
        maxWidth: '400px',
        showLogo: true,
        onClose: () => {
            if (!isConfirmed && onCancel) onCancel();
        }
    });
}
