import { callRobloxApiJson } from '../../core/api.js';
import { getAssetIdFromUrl } from '../../core/idExtractor.js';
import { t } from '../../core/locale/i18n.js';
import { createButton } from '../../core/ui/buttons.js';
import { createOverlay } from '../../core/ui/overlay.js';
import { parseMarkdown } from '../../core/utils/markdown.js';

function sleep(milliseconds: number): Promise<void> {
    return new Promise((resolve) => {
        window.setTimeout(resolve, milliseconds);
    });
}

type RequestType = {
    action: 'view-ids',
    data: {
        targetId: string | number
    }
};

const CONFIG = Object.freeze({
    PrimaryTableID: "rovalra-viewid-" + crypto.randomUUID(),
    TaxonomyTableID: "rovalra-viewid-" + crypto.randomUUID(),
    BundledItemsID: "rovalra-viewid-" + crypto.randomUUID()
} as const);

const popupMarkdown = `
<h2 align="center">Primary</h2>

<div id="{{PrimaryTableID}}" class="rovalra-viewid-table">

| Property | Value |
| -------- | ----- |
| Asset ID | {{assetid}} |
| Product ID | {{productid}} |
<p class="rovalra-viewid-copy"><small>Click to copy</small></p>

</div>

<h2 align="center">Taxonomy</h2>

<div id="{{TaxonomyTableID}}" class="rovalra-viewid-table">

| # | Name | ID |
| - | ---- | -- |
{{taxonomy}}
<p class="rovalra-viewid-copy"><small>Click to copy</small></p>

</div>

<h2 align="center">Bundled Items</h2>

<div id="{{BundledItemsID}}" class="rovalra-viewid-table">

| # | Name | Type | ID |
| - | ---- | ---- | -- |
{{bundled}}
<p class="rovalra-viewid-copy"><small>Click to copy</small></p>

</div>
`;

function formatMarkdown(assetId: number, productId: number, taxonomy: Array<{taxonomyName: string, taxonomyId: string}>,
    bundledItems: Array<{name: string, type: string, id: number}>): [HTMLElement, string, string] {

    let resultMarkdown = popupMarkdown;
    resultMarkdown = resultMarkdown.replaceAll("{{assetid}}", String(assetId));
    resultMarkdown = resultMarkdown.replaceAll("{{productid}}", String(productId));
    resultMarkdown = resultMarkdown.replaceAll("{{PrimaryTableID}}", CONFIG.PrimaryTableID);
    resultMarkdown = resultMarkdown.replaceAll("{{TaxonomyTableID}}", CONFIG.TaxonomyTableID);
    resultMarkdown = resultMarkdown.replaceAll("{{BundledItemsID}}", CONFIG.BundledItemsID);

    let taxonomyMarkdown = "";
    for (let i = 0; i < taxonomy.length; i++) {
        const item = taxonomy[i];
        taxonomyMarkdown += `| ${i} | ${item.taxonomyName} | ${item.taxonomyId} |\n`;
    }
    if (taxonomy.length === 0)
        taxonomyMarkdown = `| | | |\n`;
    resultMarkdown = resultMarkdown.replaceAll("{{taxonomy}}", taxonomyMarkdown);

    let bundledMarkdown = "";
    for (let i = 0; i < bundledItems.length; i++) {
        const item = bundledItems[i];
        bundledMarkdown += `| ${i} | ${item.name} | ${item.type} | ${item.id} |\n`;
    }
    if (bundledItems.length === 0)
        bundledMarkdown = `| | | | |\n`;
    resultMarkdown = resultMarkdown.replaceAll("{{bundled}}", bundledMarkdown);

    let resultHtml = parseMarkdown(resultMarkdown);

    const container = document.createElement("div");
    container.innerHTML = resultHtml;

    async function onEvent(event: Event, elem?: HTMLElement) {
        const noteElement = elem?.querySelector("p.rovalra-viewid-copy small");
        if (!noteElement || noteElement === null) {
            console.warn(`Note element not found.`);
            return;
        }
        const textBefore = noteElement?.textContent;
        noteElement.textContent = "Copied!";
        await sleep(1000);
        noteElement.textContent = textBefore;
    }

    const getPrimary = () => `Asset ID: rbxassetid://${assetId}\nProduct ID: rbxassetid://${productId}\n`;
    const getTaxonomy = () => {
        let text = "";
        for (let i = 0; i < taxonomy.length; i++) {
            const taxonomyItem = taxonomy[i];
            text += `${i} - "${taxonomyItem.taxonomyName}" - ${taxonomyItem.taxonomyId}\n`;
        }
        return text;
    }
    const getBundled = () => {
        let text = "";
        for (let i = 0; i < bundledItems.length; i++) {
            const bundleItem = bundledItems[i];
            text += `${bundleItem.type} "${bundleItem.name}": rbxassetid://${bundleItem.id}\n`;
        }
        return text;
    }

    container.querySelector(`div#${CONFIG.PrimaryTableID}`)?.addEventListener("click", async (event) => {
        await navigator.clipboard.writeText(getPrimary());
        await onEvent(event, container.querySelector(`div#${CONFIG.PrimaryTableID}`));
    });

    container.querySelector(`div#${CONFIG.TaxonomyTableID}`)?.addEventListener("click", async (event) => {
        const text = getTaxonomy();
        if (text)
            await navigator.clipboard.writeText(text);
        await onEvent(event, container.querySelector(`div#${CONFIG.TaxonomyTableID}`));
    });

    container.querySelector(`div#${CONFIG.BundledItemsID}`)?.addEventListener("click", async (event) => {
        const text = getBundled();
        if (text)
            await navigator.clipboard.writeText(text);
        await onEvent(event, container.querySelector(`div#${CONFIG.BundledItemsID}`));
    });

    const fullCopy = getPrimary() + "\nTaxonomy:\n" + getTaxonomy() + "\nBundled Items:\n" + getBundled();

    return [container, resultMarkdown, fullCopy];
}
 
export function init() {
    chrome.runtime.onMessage.addListener(async (request: any | RequestType) => {
        if (request.action === 'view-ids') {
            request = request as RequestType;
            const id = Number(request.data.targetId);

            const bundledata = (await callRobloxApiJson({
                subdomain: 'catalog',
                endpoint: `/v1/bundles/details?bundleIds=${id}`
            }))?.[0];

            const itemType: number = (!!bundledata) ? 2 : 1;

            const itemdata = (await callRobloxApiJson({
                subdomain: 'catalog',
                endpoint: '/v1/catalog/items/details',
                method: 'POST',
                body: {
                  "items": [
                    {
                      "itemType": itemType,
                      "id": id
                    }
                  ]
                }
            }))?.["data"]?.[0];

            if (itemdata === undefined)
                console.error(`RoValra: Failed to retrieve item data for ${itemType === 1 ? "Asset" : "Bundle"} ${id}.`);

            console.log(itemdata);

            const result = formatMarkdown(itemdata.id, itemdata.productId, itemdata.taxonomy, itemdata.bundledItems);
            const bodyContentContainer = result[0];
            const bodyContentMarkdown = result[1];
            const fullCopyableData = result[2];

            const copyHtmlBtn = createButton(await t('viewid.popup.button.copyMd'), 'secondary', {
                onClick: async () => {
                    await navigator.clipboard.writeText(bodyContentMarkdown);
                },
                id: "rovalra-viewid-button-sec"
            })

            const copyDataBtn = createButton(await t('viewid.popup.button.copy'), 'primary', {
                onClick: async () => {
                    await navigator.clipboard.writeText(fullCopyableData);
                },
                id: "rovalra-viewid-button-main"
            })

            const overlay = createOverlay(
                {
                    title: await t(`viewid.popup.title`),
                    bodyContent: bodyContentContainer,
                    showLogo: true,
                    actions: [copyDataBtn, copyHtmlBtn],
                    onClose: () => { },
                }
            );
        }
    });

    document.addEventListener(
        'mousedown',
        async (e) => {
            if (e.button !== 2) return;

            const link = e.target?.closest('a');
            const ids = [];
            const translation = await t("viewid.viewId");

            if (link) {
                const url = link.href;

                const bundleMatch = url.match(/\/bundles\/(\d+)/);
                const catalogMatch = url.match(/\/catalog\/(\d+)/);
                const gamePassMatch = url.match(/\/game-pass\/(\d+)/);
                const badgeMatch = url.match(/\/badges\/(\d+)/);
                const groupMatch = url.match(/\/(?:groups|communities)\/(\d+)/);
                const eventMatch = url.match(/\/events\/(\d+)/);
                const devProductMatch = url.match(
                    /\/developer-product\/\d+\/product\/(\d+)/,
                );

                let targetId;

                if (bundleMatch) {
                    ids.push(bundleMatch[1]);
                } else if (catalogMatch) {
                    ids.push(catalogMatch[1]);
                } else if (gamePassMatch) {
                    ids.push(gamePassMatch[1]);
                } else if (badgeMatch) {
                    ids.push(badgeMatch[1]);
                } else if (groupMatch) {
                    ids.push(groupMatch[1]);
                } else if (eventMatch) {
                    ids.push(eventMatch[1]);
                } else if (devProductMatch) {
                    ids.push(devProductMatch[1]);
                } else {
                    const assetId = getAssetIdFromUrl(url);
                    if (assetId)
                        ids.push(assetId);
                }
            }

            chrome.runtime.sendMessage({
                action: 'updateContextMenu',
                feature: 'viewid',
                ids: ids,
                data: {
                    title: translation
                }
            });
        },
        { capture: true },
    );
}
