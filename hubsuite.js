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

  var BASIC_FEATURES = {
    NEGOSYO_HUB: ['Quick Sell', 'Products', 'Inventory', 'Expenses', 'Daily Reports', 'Staff Accounts', 'Feature Marketplace', 'Hardware Setup'],
    BUSINESS_HUB: ['Everything in Negosyo Hub', 'Advanced Reports', 'Staff Management', 'Approvals', 'Suppliers', 'Purchase Orders', 'Stock Receiving', 'Sandbox Mode'],
    NEXORA_HUB: ['Everything in Business Hub', 'Executive Views', 'HQ Control', 'Branch Transfers', 'Custom Roles', 'Automation', 'Billing Visibility', 'Migration Tools']
  };

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
    normalizePlanId: normalizePlanId,
    getTier: getTier,
    getPlanLabel: getPlanLabel,
    getAddOnPrice: getAddOnPrice,
    resolveModuleId: resolveModuleId,
    getPlanOptions: getPlanOptions,
    logoMarkup: logoMarkup
  };
})(window);
