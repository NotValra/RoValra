import { callRobloxApiJson } from '../../core/api.js';
import { getAssetIdFromUrl } from '../../core/idExtractor.js';
import { t } from '../../core/locale/i18n.js';
import { createButton } from '../../core/ui/buttons.js';
import { createOverlay } from '../../core/ui/overlay.js';
import { awaitSafe, sleep } from '../../core/utils/js/async';
import { parseMarkdown } from '../../core/utils/markdown.js';

type RequestType = {
    action: 'view-ids',
    data: {
        targetId: string | number
    }
};

const CONFIG = Object.freeze({
    PrimaryTableID: "rovalra-viewid-" + crypto.randomUUID(),
    TaxonomyTableID: "rovalra-viewid-" + crypto.randomUUID(),
    BundledItemsID: "rovalra-viewid-" + crypto.randomUUID(),

    NoteText: "Click to copy.",
    NoteTextClicked: "Copied!"
} as const);

const popupMarkdown = `
## Primary

| Property | Value |
| -------- | ----- |
| Asset ID | {{assetid}} |
| Product ID | {{productid}} |
<p class="rovalra-viewid-copy"><small>${CONFIG.NoteText}</small></p>

## Taxonomy

| # | Name | ID |
| - | ---- | -- |
{{taxonomy}}
<p class="rovalra-viewid-copy"><small>${CONFIG.NoteText}</small></p>

{{bundledsection}}
`;

const bundledSectionMarkdown = `
## Bundled Items

| # | Name | Type | ID |
| - | ---- | ---- | -- |
{{bundled}}
<p class="rovalra-viewid-copy"><small>${CONFIG.NoteText}</small></p>
`;

function formatUIMarkdown(assetId: number, productId: number, taxonomy: Array<{taxonomyName: string, taxonomyId: string}>,
    bundledItems: Array<{name: string, type: string, id: number}>): [HTMLElement, string, string] {

    taxonomy = Array.isArray(taxonomy) ? taxonomy : [];
    bundledItems = Array.isArray(bundledItems)
        ? bundledItems.filter((item) => item?.id != null)
        : [];

    let resultMarkdown = popupMarkdown;
    const copyableId = (id: string | number) =>
        `<span class="rovalra-viewid-single-copy" data-copy-value="${String(id)}">${String(id)}</span>`;

    resultMarkdown = resultMarkdown.replaceAll("{{assetid}}", copyableId(assetId));
    resultMarkdown = resultMarkdown.replaceAll("{{productid}}", copyableId(productId));

    let taxonomyMarkdown = "";
    for (let i = 0; i < taxonomy.length; i++) {
        const item = taxonomy[i];
        taxonomyMarkdown += `| ${i} | ${item.taxonomyName} | ${copyableId(item.taxonomyId)} |\n`;
    }
    if (taxonomy.length === 0)
        taxonomyMarkdown = `| | | |\n`;
    resultMarkdown = resultMarkdown.replaceAll("{{taxonomy}}", taxonomyMarkdown);

    let bundledMarkdown = "";
    for (let i = 0; i < bundledItems.length; i++) {
        const item = bundledItems[i];
        bundledMarkdown += `| ${i} | ${item.name} | ${item.type} | ${copyableId(item.id)} |\n`;
    }
    if (bundledItems.length === 0)
        bundledMarkdown = `| | | | |\n`;
    resultMarkdown = resultMarkdown.replaceAll("{{bundled}}", bundledMarkdown);
    resultMarkdown = resultMarkdown.replace(
        "{{bundledsection}}",
        bundledItems.length > 0
            ? bundledSectionMarkdown.replace("{{bundled}}", bundledMarkdown)
            : "",
    );

    let resultHtml = parseMarkdown(resultMarkdown);

    const container = document.createElement("div");
    container.innerHTML = resultHtml;

    const tables = Array.from(container.querySelectorAll("table"));
    const primaryTable = tables[0];
    const taxonomyTable = tables[1];
    const bundledTable = tables[2];
    [primaryTable, taxonomyTable, bundledTable].forEach((table, index) => {
        if (!table) return;
        table.id = [CONFIG.PrimaryTableID, CONFIG.TaxonomyTableID, CONFIG.BundledItemsID][index];
        table.classList.add("rovalra-viewid-table");
    });

    const getTableNote = (table?: HTMLTableElement) =>
        table?.nextElementSibling?.querySelector("small") ?? null;

    async function onEvent(table?: HTMLTableElement) {
        const noteElement = getTableNote(table);
        if (!noteElement || noteElement === null) {
            console.warn(`Note element not found.`);
            return;
        }
        noteElement.textContent = CONFIG.NoteTextClicked;
        await sleep(1000);
        noteElement.textContent = CONFIG.NoteText;
    }

    container.querySelectorAll<HTMLElement>(".rovalra-viewid-single-copy").forEach((element) => {
        element.addEventListener("click", async (event) => {
            event.stopPropagation();
            const value = element.dataset.copyValue;
            if (!value) return;

            await awaitSafe(navigator.clipboard.writeText.bind(navigator.clipboard), value);
            await onEvent(element.closest<HTMLTableElement>("table") ?? undefined);
        });
    });

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

    primaryTable?.addEventListener("click", async () => {
        await awaitSafe(navigator.clipboard.writeText.bind(navigator.clipboard), getPrimary());
        await onEvent(primaryTable);
    });

    taxonomyTable?.addEventListener("click", async () => {
        const text = getTaxonomy();
        if (text)
            await awaitSafe(navigator.clipboard.writeText.bind(navigator.clipboard), text);
        await onEvent(taxonomyTable);
    });

    bundledTable?.addEventListener("click", async () => {
        const text = getBundled();
        if (text)
            await awaitSafe(navigator.clipboard.writeText.bind(navigator.clipboard), text);
        await onEvent(bundledTable);
    });

    const fullCopy = getPrimary() + "\nTaxonomy:\n" + getTaxonomy() + "\nBundled Items:\n" + getBundled();

    return [container, resultMarkdown, fullCopy];
}
 
async function HandleMessage(request: RequestType) {
    request = request as RequestType;
    const id = Number(request.data.targetId);

    const bundledata = (await awaitSafe(callRobloxApiJson, {
        subdomain: 'catalog',
        endpoint: `/v1/bundles/details?bundleIds=${id}`
    }))?.[0];

    const itemType: number = (!!bundledata) ? 2 : 1;

    const itemdata = (await awaitSafe(callRobloxApiJson, {
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
        console.error(`RoValra: Failed to retrieve item data for ${itemType === 1 ? "Asset" : "Bundle"} ${id}.`)
    const result = formatUIMarkdown(itemdata.id, itemdata.productId, itemdata.taxonomy, itemdata.bundledItems);
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

async function OnMouseDown(event: MouseEvent) {
    if (event.button !== 2) return;

    const link = event.target?.closest('a');
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
}

export function init() {
    chrome.runtime.onMessage.addListener(async (request: any | RequestType) => {
        if (request.action === 'view-ids') {
            await HandleMessage(request);
        }
    });

    document.addEventListener(
        'mousedown',
        OnMouseDown,
        { capture: true },
    );
}
