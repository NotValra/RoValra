import { observeElement } from '../../core/observer.js';
import { getCachedRolimonsItem } from '../../core/trade/itemHandler.js';
import { callRobloxApiJson } from '../../core/api.js';
import { getAuthenticatedUsername } from '../../core/user.js';

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

    const scrapeOffer = (offerEl) => {
        const itemNames = [];
        let totalValue = 0;

        offerEl.querySelectorAll('.item-card-container').forEach((card) => {
            const assetId = card.dataset.rovalraAssetId;
            const roli = assetId ? getCachedRolimonsItem(assetId) : null;

            if (roli) {
                itemNames.push(roli.acronym || roli.name);
                totalValue +=
                    roli.default_price !== undefined &&
                    roli.default_price !== null
                        ? roli.default_price
                        : roli.rap || 0;
            } else {
                const nameEl = card.querySelector('.item-card-name');
                if (nameEl) itemNames.push(nameEl.innerText.trim());

                const valLabel = card.querySelector(
                    '.rovalra-value-label .text-robux',
                );
                if (valLabel) {
                    totalValue += parseInt(
                        valLabel.innerText.replace(/,/g, ''),
                        10,
                    );
                } else {
                    const robuxLabel = card.querySelector('.text-robux');
                    if (robuxLabel)
                        totalValue += parseInt(
                            robuxLabel.innerText.replace(/,/g, ''),
                            10,
                        );
                }
            }
        });

        const robuxValEl = offerEl.querySelector('.robux-line-value');
        if (robuxValEl) {
            const rVal = parseInt(robuxValEl.innerText.replace(/,/g, ''), 10);
            if (!isNaN(rVal) && rVal > 0) {
                totalValue += rVal;
            }
        }

        return {
            items: itemNames.length > 0 ? itemNames.join(', ') : 'None',
            value: totalValue,
        };
    };

    const sideA = scrapeOffer(offers[0]); // Give
    const sideB = scrapeOffer(offers[1]); // Receive

    const authedUsername = await getAuthenticatedUsername();

    const partnerLink =
        container.querySelector('a.paired-name') ||
        document.querySelector('.trade-list-detail-header .text-label a');
    let partnerUsername = 'Unknown';
    if (partnerLink) {
        const userIdMatch = partnerLink.href.match(/\/users\/(\d+)/);
        if (userIdMatch) {
            try {
                const userData = await callRobloxApiJson({
                    subdomain: 'users',
                    endpoint: `/v1/users/${userIdMatch[1]}`,
                    method: 'GET',
                });
                if (userData && userData.name) {
                    partnerUsername = userData.name;
                }
            } catch (e) {
                const usernameSpan = partnerLink.querySelector(
                    'span.element:last-of-type',
                );
                partnerUsername = usernameSpan
                    ? usernameSpan.innerText.trim()
                    : 'Unknown';
            }
        }
    }

    const myUsername = authedUsername || 'Me';

    const activeRow = document.querySelector('.trade-row.active');
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
