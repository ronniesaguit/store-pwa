const fs = require('fs');
const vm = require('vm');

const src = fs.readFileSync('hubsuite.js', 'utf8');
const context = { window: {} };
vm.createContext(context);
vm.runInContext(src, context);

const HUB = context.window.HUBSUITE;
const requested = [
  'approvals', 'auth', 'inventory', 'reports', 'staff_management',
  'purchase_orders', 'suppliers', 'notification_delivery', 'sandbox_mode',
  'tax_reports', 'inventory_movements', 'module_catalog',
  'purchase_requisitions', 'stock_receiving', 'order_fulfillment',
  'branch_transfer', 'vendor_payments', 'customer_returns',
  'discounts_promotions', 'voids', 'alert_rules_engine', 'registry_db',
  'activity_log', 'approval_detail', 'module_permissions', 'staff_roles',
  'plan_bundles', 'addon_filtering', 'included_module_filtering',
  'notification_settings', 'report_exports', 'stock_alerts',
  'hq_control_center', 'dashboard_widgets', 'hub_bundle_modules',
  'business_hub_addons', 'negosyo_hub_addons', 'flexible_plan_modules',
  'inventory_alerts_config', 'report_filters', 'api_integrations',
  'branch_locations', 'payment_types', 'tax_settings', 'user_settings',
  'logging_config', 'approval_thresholds', 'offline_cache',
  'alerts_dashboard', 'inventory_categories', 'module_code_registry',
  'addon_code_registry', 'automation_rules', 'analytics_metrics'
];

const catalog = HUB.getCustomModuleCatalog().map((m) => m.code);
const missing = requested.filter((code) => !catalog.includes(HUB.resolveModuleId(code)));
const businessCore = HUB.getCoreModuleCodes('BUSINESS_HUB') || [];
const businessAddons = HUB.getAddOnCatalog('BUSINESS_HUB', HUB.getCustomModuleCatalog()).map((m) => m.code);
const overlap = businessAddons.filter((code) => businessCore.includes(code));

if (missing.length || overlap.length) {
  console.error(JSON.stringify({ missing, overlap }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  requested: requested.length,
  catalog: catalog.length,
  businessCore: businessCore.length,
  businessAddons: businessAddons.length
}, null, 2));
