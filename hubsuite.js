(function(global) {
  var PLAN_IDS = {
    TRIAL: 'TRIAL',
    NEGOSYO_HUB: 'NEGOSYO_HUB',
    BUSINESS_HUB: 'BUSINESS_HUB',
    NEXORA_HUB: 'NEXORA_HUB',
    CUSTOM: 'CUSTOM'
  };

  var PLAN_ALIASES = {
    STARTER: PLAN_IDS.NEGOSYO_HUB,
    BASIC: PLAN_IDS.NEGOSYO_HUB,
    STANDARD: PLAN_IDS.BUSINESS_HUB,
    GROWTH: PLAN_IDS.BUSINESS_HUB,
    PRO: PLAN_IDS.BUSINESS_HUB,
    ELITE: PLAN_IDS.NEXORA_HUB
  };

  var MODULE_ALIASES = {
    branch_transfers: 'branch_transfer',
    inventory_movement_history: 'inventory_movements',
    inventory_alerts_config: 'stock_alerts',
    stock_transfer: 'branch_transfer',
    receiving_logs: 'stock_receiving',
    alerts_engine: 'alert_rules_engine',
    alerts_dashboard: 'alerts_dashboard',
    alerts_notifications_config: 'notification_settings',
    bir_tax_reports: 'tax_reports',
    tax_reports_bir: 'tax_reports',
    order_fulfilment: 'order_fulfillment',
    multi_branch: 'hq_control_center',
    custom_roles: 'custom_role_builder',
    data_import: 'data_import_tools',
    staff: 'staff_management',
    staff_roles: 'staff_management',
    user_settings: 'settings',
    taxes_vat: 'tax_settings',
    pwa_caching: 'offline_cache',
    reporting_export: 'report_exports',
    reporting_filters: 'report_filters',
    api_keys_integration: 'api_integrations',
    workflow_triggers: 'automation_rules',
    analytics_metrics: 'analytics_metrics',
    module_codes: 'module_code_registry',
    add_on_codes: 'addon_code_registry'
  };

  var TIERS = {
    TRIAL: {
      id: PLAN_IDS.TRIAL,
      name: 'HubSuite Trial',
      shortName: 'Trial',
      basePrice: 0,
      addOnPrice: null,
      logoPath: './assets/branding/hubsuite-trial.svg'
    },
    NEGOSYO_HUB: {
      id: PLAN_IDS.NEGOSYO_HUB,
      name: 'Negosyo Hub',
      shortName: 'Negosyo',
      umbrella: 'HubSuite',
      audience: 'Sari-sari stores and small shops',
      basePrice: 200,
      addOnPrice: 30,
      logoPath: './assets/branding/negosyo-hub.svg'
    },
    BUSINESS_HUB: {
      id: PLAN_IDS.BUSINESS_HUB,
      name: 'Business Hub',
      shortName: 'Business',
      umbrella: 'HubSuite',
      audience: 'Growing establishments and staffed stores',
      basePrice: 500,
      addOnPrice: 50,
      logoPath: './assets/branding/business-hub.svg'
    },
    NEXORA_HUB: {
      id: PLAN_IDS.NEXORA_HUB,
      name: 'Nexora Hub',
      shortName: 'Nexora',
      umbrella: 'HubSuite',
      audience: 'Large retail and multi-branch operations',
      basePrice: 1000,
      addOnPrice: 100,
      logoPath: './assets/branding/nexora-hub.svg'
    },
    CUSTOM: {
      id: PLAN_IDS.CUSTOM,
      name: 'Custom HubSuite Plan',
      shortName: 'Custom',
      basePrice: 0,
      addOnPrice: null,
      logoPath: './assets/branding/hubsuite.svg'
    }
  };

  var CUSTOM_MODULE_CATALOG = [
    { code: 'auth', name: 'Auth', price: 0, description: 'Login, session, owner, admin, and staff identity controls.' },
    { code: 'quick_sell', name: 'Quick Sell (POS)', price: 60, description: 'Point-of-sale and sales transactions.' },
    { code: 'products', name: 'Products', price: 60, description: 'Product catalog management.' },
    { code: 'inventory', name: 'Inventory', price: 60, description: 'Stock tracking and adjustments.' },
    { code: 'inventory_movements', name: 'Inventory Movement History', price: 60, description: 'Movement audit trail for receiving, transfer, approval, and adjustment events.' },
    { code: 'stock_alerts', name: 'Stock Alerts', price: 40, description: 'Low-stock and out-of-stock thresholds and flags.' },
    { code: 'inventory_categories', name: 'Inventory Categories', price: 30, description: 'Category mapping for inventory and products.' },
    { code: 'expenses', name: 'Expenses', price: 60, description: 'Expense tracking and fixed costs.' },
    { code: 'reports', name: 'Reports', price: 60, description: 'Sales, inventory, and financial reports.' },
    { code: 'report_exports', name: 'Reporting Export', price: 40, description: 'CSV and PDF export capability.' },
    { code: 'report_filters', name: 'Reporting Filters', price: 30, description: 'Default report filters and date periods.' },
    { code: 'tax_reports', name: 'BIR / Tax Reports', price: 60, description: 'Tax support reports, quarterly totals, and annual totals.' },
    { code: 'tax_settings', name: 'Taxes / VAT', price: 30, description: 'VAT and tax formula configuration.' },
    { code: 'analytics_metrics', name: 'Analytics / Metrics', price: 50, description: 'Read-only operational metrics and analytics.' },
    { code: 'monitors', name: 'Business Monitors', price: 60, description: 'KPI dashboards and health indicators.' },
    { code: 'dashboard_widgets', name: 'Dashboard Widgets', price: 30, description: 'Dashboard visual alignment and widget configuration.' },
    { code: 'staff_management', name: 'Staff Management', price: 60, description: 'Staff accounts, roles, and permissions.' },
    { code: 'approvals', name: 'Approvals', price: 60, description: 'Approval workflows for store operations.' },
    { code: 'approval_detail', name: 'Approvals Detail', price: 30, description: 'Approval payload rendering and decision detail views.' },
    { code: 'approval_thresholds', name: 'Approval Thresholds', price: 30, description: 'Admin-configurable approval limits.' },
    { code: 'activity_log', name: 'Branch Activity Logs', price: 60, description: 'Audit trail, activity scoring, and branch action logs.' },
    { code: 'suppliers', name: 'Supplier Management', price: 60, description: 'Supplier records and contacts.' },
    { code: 'purchase_requisitions', name: 'Purchase Requisitions', price: 50, description: 'Request and approval workflow before purchase orders.' },
    { code: 'purchase_orders', name: 'Purchase Orders', price: 60, description: 'Create and track purchase orders.' },
    { code: 'stock_receiving', name: 'Receiving Logs', price: 60, description: 'Receive stock, keep receiving logs, and update inventory.' },
    { code: 'vendor_payments', name: 'Vendor Payments', price: 50, description: 'Supplier payment logging and reporting.' },
    { code: 'order_fulfillment', name: 'Order Fulfillment', price: 50, description: 'Branch-wise fulfillment tracking.' },
    { code: 'branch_transfer', name: 'Stock Transfer', price: 60, description: 'Transfer stock between source and target branches.' },
    { code: 'customer_returns', name: 'Customer Returns', price: 50, description: 'Return workflow and inventory restoration.' },
    { code: 'discounts_promotions', name: 'Discounts / Promotions', price: 40, description: 'Discount setup, promotion tracking, and reporting.' },
    { code: 'voids', name: 'Voids', price: 40, description: 'Cancellation and void handling.' },
    { code: 'notification_delivery', name: 'Notification Delivery', price: 40, description: 'Notification delivery, triggers, unread counts, and read status.' },
    { code: 'notification_settings', name: 'Alerts / Notifications Config', price: 30, description: 'Notification delivery channel and trigger configuration.' },
    { code: 'alert_rules_engine', name: 'Alerts Engine', price: 60, description: 'Automated alerts and branch-aware rules.' },
    { code: 'alerts_dashboard', name: 'Alerts / Dashboard', price: 30, description: 'Alert colors, severity levels, and dashboard display.' },
    { code: 'automation_rules', name: 'Workflow Triggers', price: 60, description: 'Event-based workflow triggers and automation rules.' },
    { code: 'internal_chat', name: 'Internal Chat', price: 40, description: 'Team messaging within the store.' },
    { code: 'support', name: 'Help & Support', price: 0, description: 'Store support channel.' },
    { code: 'settings', name: 'User Settings', price: 0, description: 'User defaults and override settings.' },
    { code: 'logging_config', name: 'Logging Config', price: 20, description: 'Safe logging configuration only.' },
    { code: 'api_integrations', name: 'API Keys / Integration', price: 40, description: 'External integration and key storage configuration.' },
    { code: 'payment_types', name: 'Payment Types', price: 20, description: 'Payment method configuration.' },
    { code: 'branch_locations', name: 'Branch Locations', price: 30, description: 'Branch and location dropdown lists.' },
    { code: 'registry_db', name: 'Registry DB', price: 40, description: 'Registry API and D1 database integration.' },
    { code: 'module_catalog', name: 'Module Catalog', price: 30, description: 'Module fallback and add-on catalog logic.' },
    { code: 'module_permissions', name: 'Module Permissions', price: 40, description: 'Add and remove module access.' },
    { code: 'module_code_registry', name: 'Module Codes', price: 20, description: 'Normalized module code registry.' },
    { code: 'addon_code_registry', name: 'Add-On Codes', price: 20, description: 'Add-on code filtering rules.' },
    { code: 'plan_bundles', name: 'Plan Bundles', price: 30, description: 'Negosyo, Business, and Nexora bundle rules.' },
    { code: 'addon_filtering', name: 'Add-On Filtering', price: 30, description: 'Included and excluded add-on logic.' },
    { code: 'included_module_filtering', name: 'Included Module Filtering', price: 30, description: 'Included module catalog rules and UI filtering.' },
    { code: 'hub_bundle_modules', name: 'Hub Bundle Modules', price: 30, description: 'Hub bundle fallback and catalog configuration.' },
    { code: 'business_hub_addons', name: 'Business Hub Add-Ons', price: 30, description: 'Business Hub add-on checkbox consistency.' },
    { code: 'negosyo_hub_addons', name: 'Negosyo Hub Add-Ons', price: 30, description: 'Negosyo Hub add-on and plan rules.' },
    { code: 'flexible_plan_modules', name: 'Flexible Plan Modules', price: 30, description: 'Selectable modules for custom plans.' },
    { code: 'feature_marketplace', name: 'Feature Marketplace', price: 0, description: 'Owner add-on discovery and trial activation.' },
    { code: 'sandbox_mode', name: 'Sandbox Mode', price: 40, description: 'Demo-data mode for safe testing.' },
    { code: 'offline_cache', name: 'PWA Caching', price: 0, description: 'Offline app shell and cache behavior.' },
    { code: 'hardware_profiles', name: 'Hardware Setup', price: 30, description: 'Scanner, receipt, and device profile setup.' },
    { code: 'data_import_tools', name: 'Data Import', price: 60, description: 'Bulk import products and inventory.' },
    { code: 'legacy_migration_tools', name: 'Legacy Migration', price: 60, description: 'Legacy data migration workflows.' },
    { code: 'custom_role_builder', name: 'Staff Roles', price: 60, description: 'Create and assign custom staff roles.' },
    { code: 'roi', name: 'ROI Monitor', price: 40, description: 'Capital, loan, and ROI monitoring.' },
    { code: 'executive_dashboard', name: 'Executive Dashboard', price: 60, description: 'Executive-level read-only dashboard.' },
    { code: 'consolidated_executive_dashboard', name: 'Consolidated Executive Dashboard', price: 60, description: 'Cross-branch executive rollups.' },
    { code: 'hq_control_center', name: 'HQ Control Center', price: 60, description: 'HQ branch attention and control dashboard.' },
    { code: 'multi_branch_advanced_reports', name: 'Multi-Branch Reports', price: 60, description: 'Advanced reports across branches.' },
    { code: 'billing_events', name: 'Billing Events', price: 30, description: 'Billing visibility and subscription events.' }
  ];
  var CUSTOM_PLAN_MIN_FEE = 200;

  function computeCustomPrice(selectedModuleCodes) {
    var codes = Array.isArray(selectedModuleCodes) ? selectedModuleCodes : [];
    var total = codes.reduce(function(sum, code) {
      var entry = CUSTOM_MODULE_CATALOG.find(function(m) { return m.code === resolveModuleId(code); });
      return sum + (entry ? entry.price : 0);
    }, 0);
    return Math.max(CUSTOM_PLAN_MIN_FEE, total);
  }

  function getCustomModuleCatalog() {
    return CUSTOM_MODULE_CATALOG;
  }

  var PLAN_MODULES = {
    TRIAL:        ['auth','quick_sell','products','inventory','inventory_categories','expenses','reports','report_filters','monitors','roi','staff_management','settings','payment_types','support','internal_chat','activity_log','feature_marketplace','offline_cache','module_catalog','module_code_registry','addon_code_registry'],
    NEGOSYO_HUB:  ['auth','quick_sell','products','inventory','inventory_movements','stock_alerts','inventory_categories','expenses','reports','report_filters','monitors','dashboard_widgets','settings','payment_types','support','staff_management','feature_marketplace','notification_delivery','notification_settings','alert_rules_engine','alerts_dashboard','hardware_profiles','offline_cache','module_catalog','module_permissions','plan_bundles','addon_filtering','included_module_filtering','hub_bundle_modules','negosyo_hub_addons','flexible_plan_modules','module_code_registry','addon_code_registry','approval_thresholds','logging_config'],
    BUSINESS_HUB: ['auth','quick_sell','products','inventory','inventory_movements','stock_alerts','inventory_categories','expenses','reports','report_exports','report_filters','tax_settings','analytics_metrics','monitors','dashboard_widgets','staff_management','settings','payment_types','support','approvals','approval_detail','approval_thresholds','activity_log','alert_rules_engine','alerts_dashboard','notification_delivery','notification_settings','suppliers','purchase_requisitions','purchase_orders','stock_receiving','vendor_payments','order_fulfillment','branch_transfer','customer_returns','discounts_promotions','voids','data_import_tools','feature_marketplace','sandbox_mode','hardware_profiles','offline_cache','api_integrations','registry_db','module_catalog','module_permissions','plan_bundles','addon_filtering','included_module_filtering','hub_bundle_modules','business_hub_addons','flexible_plan_modules','module_code_registry','addon_code_registry','workflow_triggers','logging_config'],
    NEXORA_HUB:   ['auth','quick_sell','products','inventory','inventory_movements','stock_alerts','inventory_categories','expenses','reports','report_exports','report_filters','tax_reports','tax_settings','analytics_metrics','monitors','dashboard_widgets','roi','staff_management','settings','payment_types','branch_locations','support','internal_chat','approvals','approval_detail','approval_thresholds','activity_log','executive_dashboard','branch_transfer','consolidated_executive_dashboard','hq_control_center','multi_branch_advanced_reports','custom_role_builder','alert_rules_engine','alerts_dashboard','notification_delivery','notification_settings','automation_rules','data_import_tools','legacy_migration_tools','feature_marketplace','sandbox_mode','hardware_profiles','billing_events','suppliers','purchase_requisitions','purchase_orders','stock_receiving','vendor_payments','order_fulfillment','customer_returns','discounts_promotions','voids','offline_cache','api_integrations','registry_db','module_catalog','module_permissions','plan_bundles','addon_filtering','included_module_filtering','hub_bundle_modules','business_hub_addons','negosyo_hub_addons','flexible_plan_modules','module_code_registry','addon_code_registry','workflow_triggers','logging_config'],
    CUSTOM:       null
  };

  var BASIC_FEATURES = {
    NEGOSYO_HUB: ['Quick Sell', 'Products', 'Inventory', 'Expenses', 'Daily Reports', 'Staff Accounts', 'Feature Marketplace', 'Hardware Setup'],
    BUSINESS_HUB: ['Everything in Negosyo Hub', 'Advanced Reports', 'Staff Management', 'Approvals', 'Suppliers', 'Purchase Orders', 'Stock Receiving', 'Sandbox Mode'],
    NEXORA_HUB: ['Everything in Business Hub', 'Executive Views', 'HQ Control', 'Branch Transfers', 'Custom Roles', 'Automation', 'Billing Visibility', 'Migration Tools']
  };

  function getCoreModuleCodes(planId) {
    var id = String(planId || '').trim().toUpperCase();
    id = PLAN_ALIASES[id] || id;
    if (!(id in PLAN_MODULES)) return null; // unknown plan → allow all
    return PLAN_MODULES[id]; // null for CUSTOM = allow all
  }

  function _moduleKey(code) {
    return resolveModuleId(String(code || '').trim()).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  function _moduleCodeOf(feature) {
    return feature && (feature.module_code || feature.code || feature.Module_Code || feature.Code);
  }

  function getCoreModuleCatalog(planId) {
    var codes = getCoreModuleCodes(planId);
    if (!Array.isArray(codes)) return [];
    var catalogMap = {};
    CUSTOM_MODULE_CATALOG.forEach(function(m) { catalogMap[_moduleKey(m.code)] = m; });
    return codes.map(function(code) {
      var key = _moduleKey(code);
      return catalogMap[key] || { code: key, module_code: key, name: key.replace(/_/g, ' '), feature_name: key.replace(/_/g, ' '), description: '' };
    });
  }

  function getAddOnCatalog(planId, features) {
    var plan = normalizePlanId(planId);
    var source = (features && features.length ? features : CUSTOM_MODULE_CATALOG) || [];
    if (plan === PLAN_IDS.CUSTOM) return source;
    var core = {};
    (getCoreModuleCodes(plan) || []).forEach(function(code) { core[_moduleKey(code)] = true; });
    return source.filter(function(feature) {
      var code = _moduleCodeOf(feature);
      return code && !core[_moduleKey(code)];
    });
  }

  function normalizePlanId(planId) {
    var normalized = String(planId || '').trim().toUpperCase();
    if (!normalized) return PLAN_IDS.TRIAL;
    return PLAN_ALIASES[normalized] || normalized;
  }

  function getTier(planId) {
    return TIERS[normalizePlanId(planId)] || TIERS.NEGOSYO_HUB;
  }

  function getPlanLabel(planId) {
    return getTier(planId).name;
  }

  function getAddOnPrice(planId) {
    var tier = getTier(planId);
    return typeof tier.addOnPrice === 'number' ? tier.addOnPrice : null;
  }

  function resolveModuleId(moduleId) {
    var key = String(moduleId || '').trim();
    return MODULE_ALIASES[key] || MODULE_ALIASES[key.toLowerCase()] || key;
  }

  function getStaffPolicy(planId) {
    var plan = normalizePlanId(planId);
    if (plan === PLAN_IDS.NEXORA_HUB) return { includedUsers: null, includedStaff: null, extraStaffPrice: 0 };
    if (plan === PLAN_IDS.BUSINESS_HUB) return { includedUsers: 10, includedStaff: 9, extraStaffPrice: 50 };
    if (plan === PLAN_IDS.NEGOSYO_HUB) return { includedUsers: 3, includedStaff: 2, extraStaffPrice: 30 };
    if (plan === PLAN_IDS.CUSTOM) return { includedUsers: null, includedStaff: null, extraStaffPrice: 0 };
    return { includedUsers: 2, includedStaff: 1, extraStaffPrice: 30 };
  }

  function getPlanOptions(includeCustom) {
    var options = [
      { value: PLAN_IDS.TRIAL, label: 'Free Trial' },
      { value: PLAN_IDS.NEGOSYO_HUB, label: 'Negosyo Hub - PHP 200/mo' },
      { value: PLAN_IDS.BUSINESS_HUB, label: 'Business Hub - PHP 500/mo' },
      { value: PLAN_IDS.NEXORA_HUB, label: 'Nexora Hub - PHP 1000/mo' }
    ];
    if (includeCustom) options.push({ value: PLAN_IDS.CUSTOM, label: 'Custom / Flexible' });
    return options;
  }

  function logoMarkup(planId, fallbackText) {
    var tier = getTier(planId);
    var text = fallbackText || tier.shortName || tier.name;
    return '<span style="display:inline-flex;align-items:center;gap:8px;">' +
      '<img src="' + tier.logoPath + '" alt="' + tier.name + ' logo" style="height:28px;width:auto;display:block;" onerror="this.style.display=\'none\';this.nextSibling.style.display=\'inline-flex\';">' +
      '<span style="display:none;font-weight:700;letter-spacing:.3px;">' + text + '</span>' +
      '</span>';
  }

  global.HUBSUITE = {
    umbrellaName: 'HubSuite',
    planIds: PLAN_IDS,
    tiers: TIERS,
    basicFeatures: BASIC_FEATURES,
    planModules: PLAN_MODULES,
    normalizePlanId: normalizePlanId,
    getTier: getTier,
    getPlanLabel: getPlanLabel,
    getAddOnPrice: getAddOnPrice,
    resolveModuleId: resolveModuleId,
    getPlanOptions: getPlanOptions,
    logoMarkup: logoMarkup,
    getCoreModuleCodes: getCoreModuleCodes,
    getCoreModuleCatalog: getCoreModuleCatalog,
    getAddOnCatalog: getAddOnCatalog,
    getStaffPolicy: getStaffPolicy,
    customModuleCatalog: CUSTOM_MODULE_CATALOG,
    customPlanMinFee: CUSTOM_PLAN_MIN_FEE,
    computeCustomPrice: computeCustomPrice,
    getCustomModuleCatalog: getCustomModuleCatalog
  };
})(window);
