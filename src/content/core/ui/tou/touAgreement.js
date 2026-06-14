import { showConfirmationPrompt } from '../confirmationPrompt.js';

const TOU_AGREEMENT_KEY = 'rovalra_tou_agreed';

/**
 * Initializes the Terms of Use check. If the user hasn't agreed,
 * it displays a confirmation prompt with key takeaways.
 * @param {Function} [onAgreed] - Optional callback to run once agreement is confirmed.
 */
export function ensureTouAgreement(onAgreed) {
    chrome.storage.local.get([TOU_AGREEMENT_KEY], (result) => {
        if (!result[TOU_AGREEMENT_KEY]) {
            showConfirmationPrompt({
                title: 'RoValra Guidelines',
                message: `By using RoValra, you agree to follow our Terms of Use. Failure to follow these rules may result in the suspension of access to specific features, including status bubbles.<br><br>
                         <b>Key Takeaways:</b><br>
                         • You cannot direct users off-platform.<br>
                         • You cannot do anything inappropriate.<br>
                         • You must not violate the Roblox Terms of Service.<br><br>
                         Read more at <a href="https://www.rovalra.com/tou/" target="_blank" style="color: #007bff; text-decoration: underline;">rovalra.com/tou</a>.`,
                confirmText: 'I Understand',
                onConfirm: () => {
                    chrome.storage.local.set(
                        { [TOU_AGREEMENT_KEY]: true },
                        () => {
                            if (onAgreed) onAgreed();
                        },
                    );
                },
            });
        } else if (onAgreed) {
            onAgreed();
        }
    });
}
