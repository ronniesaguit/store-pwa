import { onRequest } from './functions/api/[[path]].js';

async function call(action, data = {}) {
  const request = new Request('http://local/api', {
    method: 'POST',
    body: JSON.stringify({ action, storeKey: 'CHECK_STORE', data })
  });
  const response = await onRequest({ request, env: {} });
  const json = await response.json();
  if (!json.success) throw new Error(action + ': ' + json.error);
  return json.data;
}

const checks = {};

checks.registry = (await call('getRegistryStatus')).api === 'local';

const pr = await call('createPurchaseRequisition', { items: [{ productId: 'P1', quantity: 2 }] });
checks.purchaseRequisition = !!pr.id && (await call('getPurchaseRequisitions')).length >= 1;

const receiving = await call('receiveStock', { poId: 'PO1', items: [{ productId: 'P1', qtyReceived: 1 }] });
checks.receiving = !!receiving.id && (await call('getReceivingHistory')).length >= 1;

const transfer = await call('createBranchTransfer', {
  sourceBranchId: 'main',
  targetBranchId: 'warehouse',
  items: [{ productId: 'P1', quantity: 1 }]
});
await call('submitBranchTransfer', { id: transfer.id });
await call('approveBranchTransfer', { id: transfer.id });
await call('markBranchTransferSent', { id: transfer.id });
const completedTransfer = await call('receiveBranchTransfer', { id: transfer.id });
checks.stockTransfer = completedTransfer.status === 'received';

checks.vendorPayments = !!(await call('createVendorPayment', { supplierId: 'S1', amount: 100 })).id;
checks.customerReturns = !!(await call('createCustomerReturn', { productId: 'P1', quantity: 1 })).id;
checks.promotions = !!(await call('createPromotion', { name: 'Test Promo', discountValue: 10 })).id;
checks.voids = !!(await call('voidSale', { saleId: 'SALE1', reason: 'Test' })).id;
checks.settings = (await call('updateTaxSettings', { vat_enabled: true, vat_rate: 12 })).vat_rate === 12;

const failed = Object.keys(checks).filter((key) => !checks[key]);
console.log(JSON.stringify({ checks, failed }, null, 2));
if (failed.length) process.exit(1);
