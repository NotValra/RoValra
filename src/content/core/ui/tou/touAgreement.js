import { showConfirmationPrompt } from '../confirmationPrompt.js';

const TOU_AGREEMENT_KEY = 'rovalra_tou_agreed';
const FORCE_GUIDELINES_POPUP_KEY = 'forceGuidelinesPopup';

/**
 * Initializes the Terms of Use check. If the user hasn't agreed,
 * it displays a confirmation prompt with key takeaways.
 * @param {Function} [onAgreed] - Optional callback to run once agreement is confirmed.
 * @param {object} [options] - Optional feature-specific agreement behavior.
 * @param {string} [options.agreementKey] - Storage key used for the agreement.
 * @param {Function} [options.onPrompt] - Callback run immediately before the prompt opens.
 * @param {Function} [options.onCancel] - Callback to run when the prompt is dismissed.
 */
export function ensureTouAgreement(onAgreed, options = {}) {
    const agreementKey = options.agreementKey || TOU_AGREEMENT_KEY;

    chrome.storage.local.get(
        [agreementKey, FORCE_GUIDELINES_POPUP_KEY],
        (result) => {
            const forcePopup = result[FORCE_GUIDELINES_POPUP_KEY] === true;

            if (forcePopup || !result[agreementKey]) {
                if (options.onPrompt) options.onPrompt();
                showConfirmationPrompt({
                    title: 'RoValra Guidelines',
                    message: `By using RoValra, you agree to follow our Terms of Use. Failure to follow these rules may result in the suspension of access to specific features, including status bubbles and pronouns.<br><br>
                         <b>Key Takeaways:</b><br>
                         • You cannot direct users off-platform.<br>
                         • You cannot do anything inappropriate.<br>
                         • You must not violate the Roblox Terms of Service.<br><br>
                         Read more at <a href="https://www.rovalra.com/tou/" target="_blank" style="color: #007bff; text-decoration: underline;">rovalra.com/tou</a>.`,
                    confirmText: 'I Understand',
                    onConfirm: () => {
                        chrome.storage.local.set(
                            { [agreementKey]: true },
                            () => {
                                if (onAgreed) onAgreed();
                            },
                        );
                    },
                    onCancel: options.onCancel,
                });
            } else if (onAgreed) {
                onAgreed();
            }
        },
    );
}

export function requestTouAgreement(options = {}) {
    return new Promise((resolve) => {
        ensureTouAgreement(() => resolve(true), {
            ...options,
            onCancel: () => resolve(false),
        });
    });
}
