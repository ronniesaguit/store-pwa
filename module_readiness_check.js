const fs = require('fs');
const vm = require('vm');

const hubSrc = fs.readFileSync('hubsuite.js', 'utf8');
const appSrc = fs.readFileSync('app.js', 'utf8');
const apiSrc = fs.readFileSync('api.js', 'utf8');
const adminSrc = fs.readFileSync('admin.js', 'utf8');
const swSrc = fs.readFileSync('sw.js', 'utf8');
const proxySrc = fs.readFileSync('functions/api/[[path]].js', 'utf8');

const context = { window: {} };
vm.createContext(context);
vm.runInContext(hubSrc, context);
const HUB = context.window.HUBSUITE;

const modules = [
  { n: 1, name: 'Approvals', code: 'approvals', ui: ['renderApprovalsQueue', 'renderApprovalDetail'], api: ['getApprovals', 'getApprovalById', 'approveApproval', 'rejectApproval'] },
  { n: 2, name: 'Auth', code: 'auth', ui: ['renderLogin', 'logout'], api: ['login', 'logout', 'getBootData'] },
  { n: 3, name: 'Inventory', code: 'inventory', ui: ['renderInventoryMenu', 'renderAddStock', 'renderInventoryAdvancedSummary'], api: ['getProducts', 'addProductStock', 'getInventoryAdvancedSummary'] },
  { n: 4, name: 'Reports', code: 'reports', ui: ['renderReports', 'loadReport', 'renderAdvancedReportsHome'], api: ['getDailyReport', 'getWeeklyReport', 'getMonthlyReport', 'getPeriodReport', 'getAdvancedReport'] },
  { n: 5, name: 'Staff Management', code: 'staff_management', ui: ['renderManageStaff', 'renderStaffList', 'renderStaffDetail'], api: ['getStoreUsers', 'createStoreUser', 'getStaffById', 'updateStaff'] },
  { n: 6, name: 'Purchase Orders', code: 'purchase_orders', ui: ['renderPurchaseOrders', 'renderPODetail', 'renderCreatePO'], api: ['getPurchaseOrders', 'getPurchaseOrderById', 'createPurchaseOrder', 'submitPurchaseOrder', 'approvePurchaseOrder', 'cancelPurchaseOrder'] },
  { n: 7, name: 'Suppliers', code: 'suppliers', ui: ['renderSuppliers', 'renderSupplierDetail', 'renderAddSupplierForm'], api: ['getSuppliers', 'getSupplierById', 'createSupplier', 'updateSupplier', 'deactivateSupplier'] },
  { n: 8, name: 'Notification Delivery', code: 'notification_delivery', ui: ['renderNotificationsCenter', 'markAndReadNotif'], api: ['getNotifications', 'markNotificationRead', 'getUnreadCount'] },
  { n: 9, name: 'Sandbox Mode', code: 'sandbox_mode', ui: ['renderSandboxMode', 'doSandboxEnter', 'doSandboxReset', 'doSandboxExit'], api: ['getSandbox', 'enterSandbox', 'resetSandbox', 'exitSandbox'] },
  { n: 10, name: 'BIR / Tax Reports', code: 'tax_reports', ui: ['renderBIRData', 'loadBIRData', 'renderBIRScreen'], api: ['getBIRData'] },
  { n: 11, name: 'Inventory Movement History', code: 'inventory_movements', ui: ['renderInventoryMovements', 'renderMovementDetail'], api: ['getInventoryMovements', 'getProductInventoryDetail'] },
  { n: 12, name: 'Module Catalog', code: 'module_catalog', hub: ['getCustomModuleCatalog', 'getCoreModuleCatalog', 'getAddOnCatalog'] },
  { n: 13, name: 'Purchase Requisitions', code: 'purchase_requisitions', ui: ['renderPurchaseRequisitions'], api: ['getPurchaseRequisitions', 'createPurchaseRequisition'] },
  { n: 14, name: 'Receiving Logs', code: 'stock_receiving', ui: ['renderReceiveForm', 'submitReceiveStock', 'renderReceivingLogs', 'renderReceivingDetail'], api: ['receiveStock', 'getReceivingHistory', 'getReceivingById'] },
  { n: 15, name: 'Order Fulfillment', code: 'order_fulfillment', ui: ['renderOrderFulfillment'], api: ['getFulfillmentOrders', 'fulfillOrder'] },
  { n: 16, name: 'Stock Transfer', code: 'branch_transfer', ui: ['renderBranchTransfers', 'renderBranchTransferDetail', 'renderCreateBranchTransfer', 'submitCreateBranchTransfer'], api: ['getBranchTransfers', 'getBranchTransferById', 'createBranchTransfer', 'submitBranchTransfer', 'approveBranchTransfer', 'markBranchTransferSent', 'receiveBranchTransfer', 'cancelBranchTransfer'] },
  { n: 17, name: 'Vendor Payments', code: 'vendor_payments', ui: ['renderVendorPayments'], api: ['getVendorPayments', 'createVendorPayment'] },
  { n: 18, name: 'Customer Returns', code: 'customer_returns', ui: ['renderCustomerReturns'], api: ['getCustomerReturns', 'createCustomerReturn'] },
  { n: 19, name: 'Discounts / Promotions', code: 'discounts_promotions', ui: ['renderDiscountsPromotions'], api: ['getPromotions', 'createPromotion'] },
  { n: 20, name: 'Voids', code: 'voids', ui: ['renderVoids'], api: ['voidSale', 'getVoids'] },
  { n: 21, name: 'Alerts Engine', code: 'alert_rules_engine', ui: ['renderAlertsCenter'], api: ['getAlerts'] },
  { n: 22, name: 'Registry DB', code: 'registry_db', ui: ['renderRegistryDbStatus'], api: ['getRegistryStatus'], backend: ['UPSTREAM_API_BASE'] },
  { n: 23, name: 'Branch Activity Logs', code: 'activity_log', ui: ['renderActivityLog'], api: ['getActivityLog'] },
  { n: 24, name: 'Approvals Detail', code: 'approval_detail', ui: ['renderApprovalDetail'], api: ['getApprovalById'] },
  { n: 25, name: 'Module Permissions', code: 'module_permissions', ui: ['renderCreateCustomRole'], api: ['getPermissionCatalog', 'createCustomRole'] },
  { n: 26, name: 'Staff Roles', code: 'staff_management', ui: ['renderCreateCustomRole', 'renderAssignRoleForm'], api: ['getCustomRoles', 'getPermissionCatalog', 'createCustomRole'] },
  { n: 27, name: 'Plan Bundles', code: 'plan_bundles', hub: ['getCoreModuleCodes', 'getCoreModuleCatalog'] },
  { n: 28, name: 'Add-On Filtering', code: 'addon_filtering', hub: ['getAddOnCatalog'] },
  { n: 29, name: 'Included Module Filtering', code: 'included_module_filtering', hub: ['getCoreModuleCatalog', 'getAddOnCatalog'] },
  { n: 30, name: 'Alerts / Notifications Config', code: 'notification_settings', ui: ['renderFullSettings', 'saveNotificationSettings'], api: ['updateNotificationSettings'] },
  { n: 31, name: 'Reporting Export', code: 'report_exports', ui: ['printReport', 'printLastReport', 'exportLastReportCsv'], api: [] },
  { n: 32, name: 'Stock Alerts', code: 'stock_alerts', ui: ['renderMonitors'], api: ['getBusinessMonitors'] },
  { n: 33, name: 'HQ Control Center', code: 'hq_control_center', ui: ['renderHQControlCenter'], api: ['getHqControlCenter'] },
  { n: 34, name: 'Dashboard Widgets', code: 'dashboard_widgets', ui: ['renderOwnerDashboard', 'renderManagerDashboard'], api: ['getManagerDashboard'] },
  { n: 35, name: 'Hub Bundle Modules', code: 'hub_bundle_modules', hub: ['getCoreModuleCodes', 'getCoreModuleCatalog'] },
  { n: 36, name: 'Business Hub Add-Ons', code: 'business_hub_addons', hub: ['getAddOnCatalog'] },
  { n: 37, name: 'Negosyo Hub Add-Ons', code: 'negosyo_hub_addons', hub: ['getAddOnCatalog'] },
  { n: 38, name: 'Flexible Plan Modules', code: 'flexible_plan_modules', hub: ['getCustomModuleCatalog', 'computeCustomPrice'] },
  { n: 39, name: 'Inventory Alerts Config', code: 'stock_alerts', ui: ['renderFullSettings', 'saveInventoryAlertSettings'], api: ['updateInventoryAlertSettings'] },
  { n: 40, name: 'Reporting Filters', code: 'report_filters', ui: ['renderReports', 'selectAdvancedReportPeriod'], api: ['getPeriodReport'] },
  { n: 41, name: 'API Keys / Integration', code: 'api_integrations', ui: ['renderFullSettings', 'saveIntegrationSettings'], api: ['updateIntegrationSettings'] },
  { n: 42, name: 'Branch Locations', code: 'branch_locations', ui: ['renderHQControlCenter', 'renderBranchTransfers'], api: ['getHqControlCenter', 'getBranchTransfers'] },
  { n: 43, name: 'Payment Types', code: 'payment_types', ui: ['renderQuickSell'], api: ['createSale'] },
  { n: 44, name: 'Taxes / VAT', code: 'tax_settings', ui: ['renderBIRData', 'saveTaxSettings'], api: ['getBIRData', 'updateTaxSettings'] },
  { n: 45, name: 'User Settings', code: 'settings', ui: ['renderFullSettings', 'changePasswordFromSettings'], api: ['getSettings', 'updateBusinessProfile', 'updateOperationsSettings', 'changePassword'] },
  { n: 46, name: 'Logging Config', code: 'logging_config', ui: ['renderActivityLog', 'saveLoggingSettings'], api: ['getActivityLog', 'updateLoggingSettings'] },
  { n: 47, name: 'Approval Thresholds', code: 'approval_thresholds', ui: ['renderFullSettings', 'saveApprovalThresholds'], api: ['updateApprovalThresholds'] },
  { n: 48, name: 'PWA Caching', code: 'offline_cache', sw: ['STATIC_ASSETS', 'CACHE', 'fetch'] },
  { n: 49, name: 'Alerts / Dashboard', code: 'alerts_dashboard', ui: ['renderAlertsCenter'], api: ['getAlerts'] },
  { n: 50, name: 'Inventory Categories', code: 'inventory_categories', ui: ['showCategoryModal', 'addNewCategory', 'editCategory', 'deleteCategory'], api: ['getCategories', 'createCategory', 'updateCategory', 'deleteCategory'] },
  { n: 51, name: 'Module Codes', code: 'module_code_registry', hub: ['resolveModuleId'] },
  { n: 52, name: 'Add-On Codes', code: 'addon_code_registry', hub: ['getAddOnCatalog'] },
  { n: 53, name: 'Workflow Triggers', code: 'automation_rules', ui: ['renderAutomationRules', 'renderCreateAutoRule'], api: ['getAutomationRules', 'createAutomationRule', 'updateAutomationRuleStatus'] },
  { n: 54, name: 'Analytics / Metrics', code: 'analytics_metrics', ui: ['renderExecutiveDashboard', 'renderMonitors'], api: ['getExecutiveDashboard', 'getBusinessMonitors'] }
];

function hasToken(src, token) {
  return src.indexOf(token) !== -1;
}

function check(item) {
  const resolved = HUB.resolveModuleId(item.code);
  const catalog = HUB.getCustomModuleCatalog().some((m) => m.code === resolved);
  const included = ['TRIAL', 'NEGOSYO_HUB', 'BUSINESS_HUB', 'NEXORA_HUB'].some((plan) => {
    const mods = HUB.getCoreModuleCodes(plan);
    return Array.isArray(mods) && mods.includes(resolved);
  });
  const ui = (item.ui || []).filter((fn) => hasToken(appSrc, `function ${fn}`) || hasToken(appSrc, `async function ${fn}`));
  const api = (item.api || []).filter((action) => hasToken(appSrc, `'${action}'`) || hasToken(apiSrc, `'${action}'`));
  const hub = (item.hub || []).filter((fn) => typeof HUB[fn] === 'function');
  const sw = (item.sw || []).filter((token) => hasToken(swSrc, token));
  const backend = (item.backend || []).filter((token) => hasToken(proxySrc, token));
  const expected = (item.ui || []).length + (item.api || []).length + (item.hub || []).length + (item.sw || []).length + (item.backend || []).length;
  const found = ui.length + api.length + hub.length + sw.length + backend.length;

  let status = 'PASS';
  if (!catalog) status = 'FAIL';
  else if (expected && found < expected) status = found ? 'PARTIAL' : 'FAIL';
  else if (!included && item.code !== 'staff_roles') status = 'PARTIAL';
  if (status === 'PASS' && item.forcePartial) status = 'PARTIAL';

  return {
    '#': item.n,
    module: item.name,
    code: resolved,
    status,
    catalog,
    included,
    ui: `${ui.length}/${(item.ui || []).length}`,
    api: `${api.length}/${(item.api || []).length}`,
    hub: `${hub.length}/${(item.hub || []).length}`,
    sw: `${sw.length}/${(item.sw || []).length}`,
    backend: `${backend.length}/${(item.backend || []).length}`,
    note: item.note || ''
  };
}

const rows = modules.map(check);
const summary = rows.reduce((acc, row) => {
  acc[row.status] = (acc[row.status] || 0) + 1;
  return acc;
}, {});

console.table(rows.map((row) => ({
  '#': row['#'],
  Module: row.module,
  Status: row.status,
  UI: row.ui,
  API: row.api,
  Note: row.note
})));
console.log(JSON.stringify(summary, null, 2));

if (summary.FAIL) process.exit(1);
if (summary.PARTIAL) process.exitCode = 2;
