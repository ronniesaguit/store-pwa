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
    multi_branch: 'hq_control_center',
    custom_roles: 'custom_role_builder',
    data_import: 'data_import_tools',
    staff: 'staff_management'
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
    { code: 'quick_sell',          name: 'Quick Sell (POS)',       price: 60, description: 'Point-of-sale and sales transactions' },
    { code: 'products',            name: 'Products',               price: 60, description: 'Product catalog management' },
    { code: 'inventory',           name: 'Inventory',              price: 60, description: 'Stock tracking and adjustments' },
    { code: 'expenses',            name: 'Expenses',               price: 60, description: 'Expense tracking and fixed costs' },
    { code: 'reports',             name: 'Reports',                price: 60, description: 'Sales and financial reports' },
    { code: 'monitors',            name: 'Business Monitors',      price: 60, description: 'KPI dashboards and health indicators' },
    { code: 'staff_management',    name: 'Staff Management',       price: 60, description: 'Staff accounts, roles, and permissions' },
    { code: 'approvals',           name: 'Approvals',              price: 60, description: 'Approval workflows for store operations' },
    { code: 'activity_log',        name: 'Activity Log',           price: 60, description: 'Audit trail for all store actions' },
    { code: 'suppliers',           name: 'Supplier Management',    price: 60, description: 'Supplier records and contacts' },
    { code: 'purchase_orders',     name: 'Purchase Orders',        price: 60, description: 'Create and track purchase orders' },
    { code: 'stock_receiving',     name: 'Stock Receiving',        price: 60, description: 'Receive and verify incoming stock' },
    { code: 'branch_transfer',     name: 'Branch Transfers',       price: 60, description: 'Transfer stock between branches' },
    { code: 'data_import_tools',   name: 'Data Import',            price: 60, description: 'Bulk import products and inventory' },
    { code: 'custom_role_builder', name: 'Custom Roles',           price: 60, description: 'Create and assign custom staff roles' },
    { code: 'alert_rules_engine',  name: 'Alerts & Automation',    price: 60, description: 'Automated alerts and rules engine' },
    { code: 'internal_chat',       name: 'Internal Chat',          price: 40, description: 'Team messaging within the store' }
  ];
  var CUSTOM_PLAN_MIN_FEE = 200;

  function computeCustomPrice(selectedModuleCodes) {
    var codes = Array.isArray(selectedModuleCodes) ? selectedModuleCodes : [];
    var total = codes.reduce(function(sum, code) {
      var entry = CUSTOM_MODULE_CATALOG.find(function(m) { return m.code === code; });
      return sum + (entry ? entry.price : 0);
    }, 0);
    return Math.max(CUSTOM_PLAN_MIN_FEE, total);
  }

  function getCustomModuleCatalog() {
    return CUSTOM_MODULE_CATALOG;
  }

  var PLAN_MODULES = {
    TRIAL:        ['auth','quick_sell','products','inventory','expenses','reports','monitors','roi','staff_management','settings','support','internal_chat','activity_log','feature_marketplace'],
    NEGOSYO_HUB:  ['auth','quick_sell','products','inventory','expenses','reports','monitors','settings','support','staff_management','feature_marketplace','notification_delivery','alert_rules_engine','hardware_profiles'],
    BUSINESS_HUB: ['auth','quick_sell','products','inventory','expenses','reports','monitors','staff_management','settings','support','approvals','alert_rules_engine','notification_delivery','suppliers','purchase_orders','stock_receiving','branch_transfer','data_import_tools','feature_marketplace'],
    NEXORA_HUB:   ['auth','quick_sell','products','inventory','expenses','reports','monitors','roi','staff_management','settings','support','internal_chat','tax_reports','approvals','activity_log','executive_dashboard','branch_transfer','consolidated_executive_dashboard','hq_control_center','multi_branch_advanced_reports','custom_role_builder','alert_rules_engine','notification_delivery','automation_rules','data_import_tools','legacy_migration_tools','feature_marketplace','sandbox_mode','hardware_profiles','billing_events','suppliers','purchase_orders','stock_receiving'],
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

  function getAddOnCatalog(planId, features) {
    return features || [];
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
    return MODULE_ALIASES[moduleId] || moduleId;
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
    getAddOnCatalog: getAddOnCatalog,
    customModuleCatalog: CUSTOM_MODULE_CATALOG,
    customPlanMinFee: CUSTOM_PLAN_MIN_FEE,
    computeCustomPrice: computeCustomPrice,
    getCustomModuleCatalog: getCustomModuleCatalog
  };
})(window);
