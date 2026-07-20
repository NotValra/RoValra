import { observeElement } from '../../core/observer.js';
import {
    getAuthenticatedUserId,
    getAuthenticatedUsername,
} from '../../core/user.js';
import {
    getLatestTradeDetailsId,
    getTradeAnalysis,
} from '../../core/trade/tradeDetailsHandler.js';

export function init() {
    chrome.storage.local.get({ tradeProofEnabled: true }, (settings) => {
        if (!settings.tradeProofEnabled) return;

        const path = window.location.pathname;
        if (!path.startsWith('/trades')) return;

        observeElement('.trades-list-detail', (container) => {
            if (container.querySelector('.rovalra-copy-proof-btn')) return;

            const btn = document.createElement('button');
            btn.className = 'btn-control-xs rovalra-copy-proof-btn';
            btn.innerText = 'Copy Proof';
            Object.assign(btn.style, {
                position: 'absolute',
                top: '12px',
                right: '15px',
                zIndex: '100',
            });

            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                copyTradeProof(container, btn);
            });

            container.style.position = 'relative';
            container.appendChild(btn);
        });
    });
}

async function copyTradeProof(container, btn) {
    const offers = container.querySelectorAll('.trade-list-detail-offer');
    if (offers.length < 2) return;

    const activeRow = document.querySelector('.trade-row.active');
    const tradeId = activeRow?.dataset.tradeId || getLatestTradeDetailsId();
    const myUserId = await getAuthenticatedUserId();
    const analysis = tradeId
        ? await getTradeAnalysis(tradeId, { myUserId }).catch(() => null)
        : null;

    if (!analysis) return;

    const formatOffer = (offer, isReceiving) => {
        const itemNames = offer.items.map(
            (item) => item.acronym || item.name || 'Unknown Item',
        );
        const robuxValue = isReceiving
            ? offer.stats.receivedRobux
            : offer.stats.offeredRobux;

        return {
            items: itemNames.length > 0 ? itemNames.join(', ') : 'None',
            value: offer.stats.value + robuxValue,
        };
    };

    const sideA = formatOffer(analysis.myOffer, false);
    const sideB = formatOffer(analysis.partnerOffer, true);

    const authedUsername = await getAuthenticatedUsername();
    const partnerUsername = analysis.partnerOffer.user?.name || 'Unknown';
    const myUsername = authedUsername || 'Me';

    let dateStr =
        container.dataset.createdDate || activeRow?.dataset.createdDate;
    if (!dateStr) {
        const d = new Date();
        dateStr = d.toISOString();
    }
    const tradeDate = new Date(dateStr);
    const formattedDate = `${String(tradeDate.getMonth() + 1).padStart(2, '0')}/${String(tradeDate.getDate()).padStart(2, '0')}/${tradeDate.getFullYear()}`;

    const diff = sideA.value - sideB.value;
    const opStr = diff !== 0 ? ` (${Math.abs(diff).toLocaleString()} op)` : '';

    const text = `${sideA.items} vs ${sideB.items}\n${sideA.value.toLocaleString()} vs ${sideB.value.toLocaleString()}${opStr}\nS:${myUsername}\nR:${partnerUsername}\nD:${formattedDate}`;

    try {
        await navigator.clipboard.writeText(text);
        const originalText = btn.innerText;
        btn.innerText = 'Copied!';
        setTimeout(() => {
            if (btn.isConnected) btn.innerText = originalText;
        }, 2000);
    } catch (err) {
        console.error('RoValra: Failed to copy proof', err);
    }
}
