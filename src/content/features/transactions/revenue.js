import { observeElement } from '../../core/observer.js';
import { getGroupIdFromUrl } from '../../core/idExtractor.js';
import { getAuthenticatedUserId } from '../../core/user.js';
import { settings } from '../../core/settings/getSettings.js';
import { ts } from '../../core/locale/i18n.js';
import {
    getSalesData,
    getSalesKey,
    scanSales,
    trackGroupSales,
} from '../../core/utils/trackers/transactions.js';
import { addBreakdownSection, ROW_MARKER, ROW_SELECTOR } from './spending.js';

const REVENUE_MARKER = 'data-rovalra-revenue';
const GROUP_REVENUE_SELECTOR =
    'span[ng-bind="$ctrl.revenueSummary.pendingRobux | number"]';

const REVENUE_KEYS = {
    'spending.title': 'revenue.title',
    'spending.creators': 'revenue.buyers',
    'spending.viewPurchases': 'revenue.viewSales',
    'spending.noPurchases': 'revenue.noSales',
    'spending.noPurchasesInPeriod': 'revenue.noSalesInPeriod',
    'spending.loadError': 'revenue.loadError',
    'spentPerCreator.mostSpent': 'revenue.mostRevenue',
    'spentPerCreator.mostPurchases': 'revenue.mostSales',
    'spentPerCreator.singlePurchase': 'revenue.singleSale',
    'spentPerCreator.multiplePurchases': 'revenue.multipleSales',
    'spentPerCreator.unknownCreator': 'revenue.unknownBuyer',
};
const revenueTs = (key, options) => ts(REVENUE_KEYS[key] || key, options);

function addRevenueSection(table, ownerType, ownerId) {
    if (!ownerId) return;
    addBreakdownSection(table, {
        marker: REVENUE_MARKER,
        t: revenueTs,
        isRevenue: true,
        dataKey: getSalesKey(ownerType, ownerId),
        loadData: () => getSalesData(ownerType, ownerId),
        anchor:
            table.parentElement?.querySelector(`section[${ROW_MARKER}]`) ||
            table,
    });
    scanSales(ownerType, ownerId);
}

async function processUserRevenue(row) {
    if (!window.location.pathname.startsWith('/transactions')) return;
    const table = row.closest('#transactions-web-app .summary table.summary');
    if (table)
        addRevenueSection(table, 'users', await getAuthenticatedUserId());
}

function processGroupRevenue(span) {
    const table = span.closest('table');
    if (!table) return;
    const groupId = getGroupIdFromUrl();
    addRevenueSection(table, 'groups', groupId);
    trackGroupSales(groupId);
}

export async function init() {
    if (!(await settings.revenueEnabled)) return;
    if (/\/(groups|communities)\/configure/.test(window.location.pathname)) {
        observeElement(GROUP_REVENUE_SELECTOR, processGroupRevenue, {
            multiple: true,
        });
        return;
    }
    observeElement(ROW_SELECTOR, processUserRevenue, { multiple: true });
}
