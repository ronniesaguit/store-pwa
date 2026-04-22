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
    staff: 'staff_management',
    staff_accounts: 'staff_management',
    activity_logs: 'activity_log',
    tax_report: 'tax_reports',
    tax_reporting: 'tax_reports'
  };

  var MODULE_CATALOG = {
    quick_sell: {
      code: 'quick_sell',
      name: 'Quick Sell',
      icon: '💰',
      shortDescription: 'POS checkout, cart, receipts and sales history.',
      sellAsAddOn: false
    },
    products: {
      code: 'products',
      name: 'Products',
      icon: '📦',
      shortDescription: 'Product catalog, categories, barcodes and item setup.',
      sellAsAddOn: false
    },
    inventory: {
      code: 'inventory',
      name: 'Inventory',
      icon: '📋',
      shortDescription: 'Stock levels, restocking, adjustments and movement tracking.',
      sellAsAddOn: false
    },
    expenses: {
      code: 'expenses',
      name: 'Expenses',
      icon: '💸',
      shortDescription: 'Expense logging, categories and operating cost tracking.',
      sellAsAddOn: false
    },
    reports: {
      code: 'reports',
      name: 'Reports',
      icon: '📊',
      shortDescription: 'Sales, profit and printable business reports.',
      sellAsAddOn: false
    },
    tax_reports: {
      code: 'tax_reports',
      name: 'Tax Reports',
      icon: '🧾',
      shortDescription: 'Tax-ready summaries, filing references and compliance exports.'
    },
    activity_log: {
      code: 'activity_log',
      name: 'Activity Log',
      icon: '📜',
      shortDescription: 'Operational audit trail, user actions and store event history.'
    },
    staff_management: {
      code: 'staff_management',
      name: 'Staff Management',
      icon: '👥',
      shortDescription: 'Staff accounts, role assignment and access control.',
      sellAsAddOn: false
    },
    feature_marketplace: {
      code: 'feature_marketplace',
      name: 'Hub Add-ons',
      icon: '🛒',
      shortDescription: 'Browse and activate optional HubSuite add-ons.',
      sellAsAddOn: false
    },
    hardware_profiles: {
      code: 'hardware_profiles',
      name: 'Hardware Setup',
      icon: '🖨️',
      shortDescription: 'Printer, scanner and hardware profile setup.',
      sellAsAddOn: false
    },
    settings: {
      code: 'settings',
      name: 'Settings',
      icon: '⚙️',
      shortDescription: 'Business, operations and printing settings.',
      sellAsAddOn: false
    },
    support: {
      code: 'support',
      name: 'Support',
      icon: '📞',
      shortDescription: 'Help desk access and support messaging.',
      sellAsAddOn: false
    },
    suppliers: {
      code: 'suppliers',
      name: 'Suppliers',
      icon: '🏭',
      shortDescription: 'Supplier directory, profiles and sourcing information.'
    },
    purchase_orders: {
      code: 'purchase_orders',
      name: 'Purchase Orders',
      icon: '📋',
      shortDescription: 'PO creation, approval and stock receiving workflow.'
    },
    approvals: {
      code: 'approvals',
      name: 'Approvals',
      icon: '✅',
      shortDescription: 'Approval queues for controlled store actions.'
    },
    monitors: {
      code: 'monitors',
      name: 'Monitors',
      icon: '📡',
      shortDescription: 'Health, KPI and operational monitoring dashboards.'
    },
    internal_chat: {
      code: 'internal_chat',
      name: 'Internal Chat',
      icon: '💬',
      shortDescription: 'Store-to-admin and internal messaging tools.'
    },
    sandbox_mode: {
      code: 'sandbox_mode',
      name: 'Sandbox Mode',
      icon: '🧪',
      shortDescription: 'Safe demo and training environment with sample data.'
    },
    roi: {
      code: 'roi',
      name: 'ROI Monitor',
      icon: '📈',
      shortDescription: 'Capital, returns and investment health monitoring.'
    },
    branch_transfer: {
      code: 'branch_transfer',
      name: 'Branch Transfers',
      icon: '🔄',
      shortDescription: 'Inter-branch stock transfer workflow and receiving.'
    },
    hq_control_center: {
      code: 'hq_control_center',
      name: 'HQ Control',
      icon: '🏢',
      shortDescription: 'Multi-branch command center and consolidated views.'
    },
    custom_role_builder: {
      code: 'custom_role_builder',
      name: 'Custom Roles',
      icon: '🎭',
      shortDescription: 'Custom role templates and granular permission design.'
    },
    automation_rules: {
      code: 'automation_rules',
      name: 'Automation',
      icon: '⚡',
      shortDescription: 'Rule-based automation for recurring business actions.'
    },
    data_import_tools: {
      code: 'data_import_tools',
      name: 'Import & Migration',
      icon: '📥',
      shortDescription: 'Bulk import, migration and onboarding data tools.'
    }
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

  var PLAN_CORE_MODULES = {};
  PLAN_CORE_MODULES[PLAN_IDS.TRIAL] = [
    'quick_sell',
    'products',
    'inventory',
    'expenses',
    'reports',
    'staff_management',
    'feature_marketplace',
    'hardware_profiles',
    'settings',
    'support'
  ];
  PLAN_CORE_MODULES[PLAN_IDS.NEGOSYO_HUB] = PLAN_CORE_MODULES[PLAN_IDS.TRIAL].slice();
  PLAN_CORE_MODULES[PLAN_IDS.BUSINESS_HUB] = PLAN_CORE_MODULES[PLAN_IDS.NEGOSYO_HUB].concat([
    'suppliers',
    'purchase_orders',
    'approvals',
    'monitors',
    'internal_chat',
    'sandbox_mode'
  ]);
  PLAN_CORE_MODULES[PLAN_IDS.NEXORA_HUB] = PLAN_CORE_MODULES[PLAN_IDS.BUSINESS_HUB].concat([
    'roi',
    'branch_transfer',
    'hq_control_center',
    'custom_role_builder',
    'automation_rules',
    'data_import_tools'
  ]);

  var BASIC_FEATURES = {
    NEGOSYO_HUB: ['Quick Sell', 'Products', 'Inventory', 'Expenses', 'Reports', 'Staff Management', 'Feature Marketplace', 'Hardware Setup'],
    BUSINESS_HUB: ['Everything in Negosyo Hub', 'Suppliers', 'Purchase Orders', 'Approvals', 'Monitors', 'Internal Chat', 'Sandbox Mode'],
    NEXORA_HUB: ['Everything in Business Hub', 'ROI Monitor', 'HQ Control', 'Branch Transfers', 'Custom Roles', 'Automation', 'Import & Migration']
  };

  function _titleizeModule(moduleId) {
    return String(moduleId || '')
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, function(ch) { return ch.toUpperCase(); });
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

  function _uniqueModules(list) {
    var seen = {};
    return (list || []).map(resolveModuleId).filter(function(code) {
      if (!code || seen[code]) return false;
      seen[code] = true;
      return true;
    });
  }

  function getModuleMeta(moduleId) {
    var code = resolveModuleId(moduleId);
    var meta = MODULE_CATALOG[code];
    if (meta) return meta;
    return {
      code: code,
      name: _titleizeModule(code),
      icon: '🧩',
      shortDescription: '',
      sellAsAddOn: true
    };
  }

  function getCoreModuleCodes(planId) {
    var normalizedPlan = normalizePlanId(planId);
    if (normalizedPlan === PLAN_IDS.CUSTOM) return null;
    return _uniqueModules(PLAN_CORE_MODULES[normalizedPlan] || PLAN_CORE_MODULES[PLAN_IDS.NEGOSYO_HUB]);
  }

  function getCoreModuleCatalog(planId) {
    var core = getCoreModuleCodes(planId) || [];
    return core.map(function(code) { return getModuleMeta(code); });
  }

  function isCoreModule(planId, moduleId) {
    var core = getCoreModuleCodes(planId);
    if (!core) return false;
    return core.indexOf(resolveModuleId(moduleId)) !== -1;
  }

  function isAddOnEligible(planId, moduleId) {
    var meta = getModuleMeta(moduleId);
    if (meta.sellAsAddOn === false) return false;
    return !isCoreModule(planId, moduleId);
  }

  function getAddOnCatalog(planId, featureCatalog) {
    var normalizedPlan = normalizePlanId(planId);
    var addOnPrice = getAddOnPrice(normalizedPlan);
    var featureMap = {};

    Object.keys(MODULE_CATALOG).forEach(function(moduleCode) {
      var resolvedCode = resolveModuleId(moduleCode);
      featureMap[resolvedCode] = Object.assign({}, getModuleMeta(resolvedCode), {
        module_code: resolvedCode,
        code: resolvedCode,
        feature_name: getModuleMeta(resolvedCode).name,
        short_description: getModuleMeta(resolvedCode).shortDescription,
        icon: getModuleMeta(resolvedCode).icon,
        tenant_status: 'locked',
        action_state: 'start_trial',
        is_trial_available: true,
        trial_days: 30,
        display_monthly_price: addOnPrice,
        display_price_note: addOnPrice !== null ? ('₱' + addOnPrice + '/month after trial') : ''
      });
    });

    (Array.isArray(featureCatalog) ? featureCatalog : []).forEach(function(feature) {
      var code = resolveModuleId(feature && (feature.module_code || feature.code));
      if (!code) return;
      var meta = getModuleMeta(code);
      featureMap[code] = Object.assign({}, featureMap[code] || {}, meta, feature || {}, {
        module_code: code,
        code: code,
        feature_name: (feature && (feature.feature_name || feature.name)) || meta.name,
        short_description: (feature && feature.short_description) || meta.shortDescription,
        icon: (feature && feature.icon) || meta.icon
      });
      if (featureMap[code].display_monthly_price == null && addOnPrice !== null) {
        featureMap[code].display_monthly_price = addOnPrice;
      }
      if (!featureMap[code].display_price_note && addOnPrice !== null) {
        featureMap[code].display_price_note = '₱' + addOnPrice + '/month after trial';
      }
      if (!featureMap[code].tenant_status) featureMap[code].tenant_status = 'locked';
      if (!featureMap[code].action_state && featureMap[code].tenant_status === 'locked') {
        featureMap[code].action_state = 'start_trial';
      }
      if (featureMap[code].is_trial_available == null) featureMap[code].is_trial_available = true;
      if (!featureMap[code].trial_days) featureMap[code].trial_days = 30;
    });

    return Object.keys(featureMap).map(function(code) {
      if (!isAddOnEligible(normalizedPlan, code)) return null;
      return featureMap[code];
    }).filter(Boolean);
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
    moduleCatalog: MODULE_CATALOG,
    planCoreModules: PLAN_CORE_MODULES,
    basicFeatures: BASIC_FEATURES,
    normalizePlanId: normalizePlanId,
    getTier: getTier,
    getPlanLabel: getPlanLabel,
    getAddOnPrice: getAddOnPrice,
    resolveModuleId: resolveModuleId,
    getModuleMeta: getModuleMeta,
    getCoreModuleCodes: getCoreModuleCodes,
    getCoreModuleCatalog: getCoreModuleCatalog,
    isCoreModule: isCoreModule,
    isAddOnEligible: isAddOnEligible,
    getAddOnCatalog: getAddOnCatalog,
    getPlanOptions: getPlanOptions,
    logoMarkup: logoMarkup
  };
})(window);
