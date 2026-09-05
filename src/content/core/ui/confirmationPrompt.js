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
    onCancel,
    onCloseBtn,
    closeBtnCallsCancel = true,
    preventBackdropClose = false,
    closeDelay = 0,
}) {
    const bodyContent = document.createElement('div');
    bodyContent.innerHTML = DOMPurify.sanitize(
        `<p class="text-body" style="margin: 0; font-size: 14px; line-height: 1.5;">${message}</p>`,
    );

    let isConfirmed = false;
    let isCanceled = false;

    const confirmBtn = createButton(confirmText, confirmType, {
        onClick: () => {
            isConfirmed = true;
            close();
            if (onConfirm) onConfirm();
        },
    });

    const cancelBtn = createButton(cancelText, cancelType, {
        onClick: () => {
            isCanceled = true;
            close();
        },
    });

    const { close, overlay } = createOverlay({
        title,
        bodyContent,
        actions: [cancelBtn, confirmBtn],
        maxWidth: '400px',
        showLogo: true,
        preventBackdropClose,
        onClose: () => {
            if (!isConfirmed && onCancel && (closeBtnCallsCancel || isCanceled))
                onCancel();
            if (
                !closeBtnCallsCancel &&
                !isConfirmed &&
                !isCanceled &&
                onCloseBtn
            )
                onCloseBtn();
        },
    });

    if (closeDelay > 0) {
        const closeButton = overlay.querySelector(
            '.rovalra-overlay-close button',
        );
        const seconds = Math.ceil(closeDelay / 1000);
        let remainingSeconds = seconds;
        let countdownId;

        const setDisabled = (button, disabled) => {
            button.disabled = disabled;
            button.setAttribute('aria-disabled', String(disabled));
        };

        setDisabled(cancelBtn, true);
        setDisabled(confirmBtn, true);
        if (closeButton) setDisabled(closeButton, true);

        const updateCountdown = () => {
            if (remainingSeconds > 0) {
                cancelBtn.textContent = `${cancelText} (${remainingSeconds})`;
                remainingSeconds -= 1;
            } else {
                cancelBtn.textContent = cancelText;
                setDisabled(cancelBtn, false);
                setDisabled(confirmBtn, false);
                if (closeButton) setDisabled(closeButton, false);
                clearInterval(countdownId);
            }
        };

        updateCountdown();
        countdownId = setInterval(updateCountdown, 1000);
        window.setTimeout(() => clearInterval(countdownId), closeDelay + 1000);
    }
}
