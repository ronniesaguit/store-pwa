const LOCAL_ACTIONS = new Set([
  'adminLogin', 'adminGetDashboardData', 'adminGetStores', 'adminGetFeatureCatalog',
  'adminGetStoreCommercialState', 'adminSuggestPrice', 'adminProvisionStore',
  'adminUpdateStore', 'adminExtendTrial', 'adminRecordPayment',
  'adminSuspendStore', 'adminActivateStore', 'adminMigrateStore',
  'adminRepairStoreModule', 'adminGetStoreActivityLog', 'adminGetStoreCustomRoles',
  'adminCopyStoreToDedicatedDb', 'adminSavePlatformSettings', 'adminChangePassword',
  'adminGetAllStoreHealth', 'adminGetStoreSnapshot', 'adminGetUnreadCount',
  'adminGetAllMessages', 'adminGetStoreMessages', 'adminSendMessage',
  'login', 'logout', 'getBootData', 'getFeatureMarketplace', 'startTrial',
  'getProducts', 'createProduct', 'updateProduct', 'deleteProduct',
  'getProductByBarcode', 'addProductStock',
  'getCategories', 'createCategory', 'updateCategory', 'deleteCategory',
  'getRegistryStatus',
  'getReceivingHistory', 'getReceivingById', 'receiveStock',
  'getPurchaseRequisitions', 'createPurchaseRequisition',
  'getFulfillmentOrders', 'fulfillOrder',
  'getBranchLocations',
  'getBranchTransfers', 'getBranchTransferById', 'createBranchTransfer',
  'submitBranchTransfer', 'approveBranchTransfer', 'markBranchTransferSent',
  'receiveBranchTransfer', 'cancelBranchTransfer',
  'getVendorPayments', 'createVendorPayment',
  'getCustomerReturns', 'createCustomerReturn',
  'getPromotions', 'createPromotion',
  'getVoids', 'voidSale',
  'updateNotificationSettings', 'updateInventoryAlertSettings',
  'updateIntegrationSettings', 'updateTaxSettings',
  'updateLoggingSettings', 'updateApprovalThresholds',
  'getSettings'
]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function ok(data) {
  return json({ success: true, data: data == null ? null : data });
}

function fail(error, status = 400) {
  return json({ success: false, error: String(error && error.message ? error.message : error) }, status);
}

function getUpstreamBase(env) {
  return String(env.UPSTREAM_API_BASE || '').replace(/\/+$/, '');
}

function getDb(env) {
  return env.STORE_DB || env.DB || env.REGISTRY_DB || env.STORE_DB_PILOT_001 || null;
}

function tenantId(req) {
  return String(req.storeKey || (req.data && req.data.storeKey) || 'default').trim() || 'default';
}

function nowIso() {
  return new Date().toISOString();
}

function id(prefix) {
  return prefix + '_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function addDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + Number(days || 0));
  return d.toISOString();
}

function memory() {
  const root = globalThis.__STORE_MODULE_API_MEMORY || (globalThis.__STORE_MODULE_API_MEMORY = {
    records: {},
    settings: {}
  });
  return root;
}

function platformSettings(env) {
  return {
    NAME: env.PLATFORM_NAME || 'HubSuite',
    ADMIN_EMAIL: env.ADMIN_EMAIL || '',
    GCASH_NUMBER: env.GCASH_NUMBER || '',
    GCASH_NAME: env.GCASH_NAME || '',
    GCASH_QR_URL: env.GCASH_QR_URL || '',
    TRIAL_DAYS: Number(env.TRIAL_DAYS || 30)
  };
}

function adminCredentials(env) {
  return {
    username: String(env.HUBSUITE_ADMIN_USERNAME || env.ADMIN_USERNAME || 'admin'),
    password: String(env.HUBSUITE_ADMIN_PASSWORD || env.ADMIN_PASSWORD || 'admin123')
  };
}

function adminToken() {
  return 'local_admin_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

function requireAdmin(requestBody) {
  const token = String(requestBody.adminToken || '');
  if (!token.startsWith('local_admin_')) throw new Error('Admin not logged in');
}

function ownerCredentials(env) {
  return {
    username: String(env.STORE_OWNER_USERNAME || env.OWNER_USERNAME || 'owner'),
    password: String(env.STORE_OWNER_PASSWORD || env.OWNER_PASSWORD || '1234')
  };
}

function ownerToken(tenant) {
  return 'local_owner_' + String(tenant || 'default') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

function requireOwner(requestBody) {
  const token = String(requestBody.token || '');
  if (!token.startsWith('local_owner_')) throw new Error('Please log in');
}

function normalizePlan(plan) {
  const raw = String(plan || 'TRIAL').trim().toUpperCase();
  const aliases = { STARTER: 'NEGOSYO_HUB', BASIC: 'NEGOSYO_HUB', STANDARD: 'BUSINESS_HUB', GROWTH: 'BUSINESS_HUB', PRO: 'BUSINESS_HUB', ELITE: 'NEXORA_HUB' };
  return aliases[raw] || raw;
}

function planDefaults(plan) {
  const defs = {
    TRIAL: { fee: 0, users: 2, products: 50, reports: 'DAILY', health: false },
    NEGOSYO_HUB: { fee: 200, users: 3, products: 500, reports: 'DAILY', health: false },
    BUSINESS_HUB: { fee: 500, users: 10, products: 5000, reports: 'ALL', health: true },
    NEXORA_HUB: { fee: 1000, users: -1, products: -1, reports: 'ALL', health: true },
    CUSTOM: { fee: 200, users: -1, products: -1, reports: 'ALL', health: true }
  };
  return defs[normalizePlan(plan)] || defs.TRIAL;
}

function featureCatalog() {
  const rows = [
    ['auth','Auth'],['quick_sell','Quick Sell'],['products','Products'],['inventory','Inventory'],
    ['inventory_movements','Inventory Movement History'],['stock_alerts','Stock Alerts'],['inventory_categories','Inventory Categories'],
    ['expenses','Expenses'],['reports','Reports'],['report_exports','Reporting Export'],['report_filters','Reporting Filters'],
    ['tax_reports','BIR / Tax Reports'],['tax_settings','Taxes / VAT'],['analytics_metrics','Analytics / Metrics'],
    ['dashboard_widgets','Dashboard Widgets'],['staff_management','Staff Management'],['approvals','Approvals'],
    ['approval_detail','Approvals Detail'],['approval_thresholds','Approval Thresholds'],['activity_log','Branch Activity Logs'],
    ['suppliers','Suppliers'],['purchase_requisitions','Purchase Requisitions'],['purchase_orders','Purchase Orders'],
    ['stock_receiving','Receiving Logs'],['vendor_payments','Vendor Payments'],['order_fulfillment','Order Fulfillment'],
    ['branch_transfer','Stock Transfer'],['customer_returns','Customer Returns'],['discounts_promotions','Discounts / Promotions'],
    ['voids','Voids'],['notification_delivery','Notification Delivery'],['notification_settings','Alerts / Notifications Config'],
    ['alert_rules_engine','Alerts Engine'],['alerts_dashboard','Alerts / Dashboard'],['automation_rules','Workflow Triggers'],
    ['settings','User Settings'],['logging_config','Logging Config'],['api_integrations','API Keys / Integration'],
    ['branch_locations','Branch Locations'],['registry_db','Registry DB'],['module_catalog','Module Catalog'],
    ['module_permissions','Module Permissions'],['plan_bundles','Plan Bundles'],['addon_filtering','Add-On Filtering'],
    ['included_module_filtering','Included Module Filtering'],['hub_bundle_modules','Hub Bundle Modules'],
    ['business_hub_addons','Business Hub Add-Ons'],['negosyo_hub_addons','Negosyo Hub Add-Ons'],
    ['flexible_plan_modules','Flexible Plan Modules'],['payment_types','Payment Types'],['offline_cache','PWA Caching'],
    ['module_code_registry','Module Codes'],['addon_code_registry','Add-On Codes'],['sandbox_mode','Sandbox Mode']
  ];
  return rows.map((r, i) => ({
    id: r[0],
    code: r[0],
    module_code: r[0],
    name: r[1],
    feature_name: r[1],
    shortDescription: 'HubSuite module ' + (i + 1),
    short_description: 'HubSuite module ' + (i + 1),
    price: i < 8 ? 0 : 30
  }));
}

async function adminStores(env) {
  const stores = await listRecords(env, 'admin', 'stores');
  if (stores.length) return stores;
  const plan = 'BUSINESS_HUB';
  const def = planDefaults(plan);
  const store = {
    id: 'store_demo',
    Store_ID: 'store_demo',
    Store_Name: 'Demo Store',
    Owner_Name: 'Store Owner',
    Owner_Email: '',
    Owner_Phone: '',
    API_Key: 'DEMO_STORE',
    Status: 'ACTIVE',
    Plan: plan,
    Trial_End: addDays(30),
    Subscription_Expires: addDays(365),
    Monthly_Fee: def.fee,
    Max_Users: def.users,
    Max_Products: def.products,
    Reports_Level: def.reports,
    Has_Health_Indicators: String(def.health),
    DB_Provider: getDb(env) ? 'd1' : 'runtime'
  };
  await putRecord(env, 'admin', 'stores', store);
  return [store];
}

async function findAdminStore(env, storeId) {
  const stores = await adminStores(env);
  return stores.find((s) => String(s.Store_ID || s.id) === String(storeId)) || null;
}

async function saveAdminStore(env, store) {
  store.id = store.Store_ID || store.id || id('store');
  store.Store_ID = store.Store_ID || store.id;
  return putRecord(env, 'admin', 'stores', store);
}

async function adminDashboard(env) {
  const settings = Object.assign(platformSettings(env), await getSettings(env, 'admin').then((s) => s.platform || {}));
  return { stores: await adminStores(env), platformSettings: settings, featureCatalog: featureCatalog() };
}

function ownerManifest(plan) {
  const modules = featureCatalog().map((f) => f.module_code || f.code);
  return {
    dashboard_type: 'store_owner_dashboard',
    role_display_name: 'Owner',
    enabled_modules: modules,
    granted_permissions: modules.reduce((acc, code) => {
      ['view', 'create', 'update', 'delete', 'approve', 'export'].forEach((action) => acc.push(code + '.' + action));
      return acc;
    }, [])
  };
}

async function ownerStoreProfile(env, tenant) {
  const stores = await adminStores(env);
  const matched = stores.find((s) => String(s.API_Key || '').toUpperCase() === String(tenant || '').toUpperCase()) || stores[0] || {};
  const plan = normalizePlan(matched.Plan || 'BUSINESS_HUB');
  const def = planDefaults(plan);
  return {
    storeKey: tenant,
    storeName: matched.Store_Name || 'Demo Store',
    ownerName: matched.Owner_Name || 'Store Owner',
    ownerEmail: matched.Owner_Email || '',
    plan: {
      id: plan,
      name: plan,
      base_price: Number(matched.Monthly_Fee || def.fee || 0),
      addon_price: plan === 'NEGOSYO_HUB' ? 30 : (plan === 'BUSINESS_HUB' ? 50 : (plan === 'NEXORA_HUB' ? 100 : null))
    },
    inTrial: !!matched.Trial_End,
    manifest: ownerManifest(plan)
  };
}

async function ownerBootData(env, tenant) {
  const profile = await ownerStoreProfile(env, tenant);
  const categories = await listRecords(env, tenant, 'categories');
  const products = await listRecords(env, tenant, 'products');
  const session = {
    loggedIn: true,
    user: {
      User_ID: 'owner',
      Username: ownerCredentials(env).username,
      Full_Name: profile.ownerName,
      Role: 'OWNER'
    },
    plan: profile.plan,
    inTrial: profile.inTrial,
    manifest: profile.manifest,
    storeName: profile.storeName,
    ownerName: profile.ownerName
  };
  return {
    session,
    products,
    categories,
    storeName: profile.storeName,
    ownerName: profile.ownerName,
    plan: profile.plan,
    inTrial: profile.inTrial,
    manifest: profile.manifest,
    user: session.user,
    paymentInfo: {
      gcashNumber: platformSettings(env).GCASH_NUMBER,
      gcashName: platformSettings(env).GCASH_NAME
    }
  };
}

async function ensureSchema(db) {
  if (!db) return;
  await db.prepare(
    'CREATE TABLE IF NOT EXISTS module_records (' +
    'tenant_id TEXT NOT NULL, module TEXT NOT NULL, record_id TEXT NOT NULL, ' +
    'payload TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, ' +
    'PRIMARY KEY (tenant_id, module, record_id))'
  ).run();
  await db.prepare(
    'CREATE TABLE IF NOT EXISTS tenant_module_settings (' +
    'tenant_id TEXT NOT NULL, setting_key TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL, ' +
    'PRIMARY KEY (tenant_id, setting_key))'
  ).run();
}

async function listRecords(env, tenant, module) {
  const db = getDb(env);
  if (db) {
    await ensureSchema(db);
    const res = await db.prepare(
      'SELECT payload FROM module_records WHERE tenant_id = ? AND module = ? ORDER BY created_at DESC LIMIT 200'
    ).bind(tenant, module).all();
    return (res.results || []).map((r) => JSON.parse(r.payload));
  }
  const bucket = memory().records[tenant + ':' + module] || {};
  return Object.keys(bucket).map((k) => bucket[k]).sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
}

async function getRecord(env, tenant, module, recordId) {
  const db = getDb(env);
  if (db) {
    await ensureSchema(db);
    const row = await db.prepare(
      'SELECT payload FROM module_records WHERE tenant_id = ? AND module = ? AND record_id = ?'
    ).bind(tenant, module, recordId).first();
    return row ? JSON.parse(row.payload) : null;
  }
  const bucket = memory().records[tenant + ':' + module] || {};
  return bucket[recordId] || null;
}

async function putRecord(env, tenant, module, record) {
  const db = getDb(env);
  const ts = nowIso();
  record.id = record.id || record.record_id || id(module);
  record.created_at = record.created_at || ts;
  record.updated_at = ts;
  if (db) {
    await ensureSchema(db);
    await db.prepare(
      'INSERT OR REPLACE INTO module_records (tenant_id, module, record_id, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(tenant, module, record.id, JSON.stringify(record), record.created_at, record.updated_at).run();
  } else {
    const key = tenant + ':' + module;
    const records = memory().records;
    records[key] = records[key] || {};
    records[key][record.id] = record;
  }
  return record;
}

async function patchRecord(env, tenant, module, recordId, patch) {
  const current = await getRecord(env, tenant, module, recordId);
  const next = Object.assign({}, current || { id: recordId }, patch || {});
  return putRecord(env, tenant, module, next);
}

async function getSettings(env, tenant) {
  const defaults = {
    business_profile: {},
    operations: {},
    printing: {},
    notifications: { enabled: true, low_stock: true, approvals: true },
    inventory_alerts: { low_stock_threshold: 5, critical_stock_threshold: 0 },
    integrations: {},
    tax: { vat_enabled: false, vat_rate: 12 },
    logging: { auth: true, inventory: true, sales: true },
    approval_thresholds: { expense_amount: 0, stock_adjustment_qty: 0 }
  };
  const db = getDb(env);
  if (db) {
    await ensureSchema(db);
    const rows = await db.prepare('SELECT setting_key, payload FROM tenant_module_settings WHERE tenant_id = ?').bind(tenant).all();
    (rows.results || []).forEach((row) => { defaults[row.setting_key] = JSON.parse(row.payload); });
    return defaults;
  }
  return Object.assign(defaults, memory().settings[tenant] || {});
}

async function putSetting(env, tenant, key, payload) {
  const db = getDb(env);
  if (db) {
    await ensureSchema(db);
    await db.prepare(
      'INSERT OR REPLACE INTO tenant_module_settings (tenant_id, setting_key, payload, updated_at) VALUES (?, ?, ?, ?)'
    ).bind(tenant, key, JSON.stringify(payload || {}), nowIso()).run();
  } else {
    memory().settings[tenant] = memory().settings[tenant] || {};
    memory().settings[tenant][key] = payload || {};
  }
  return payload || {};
}

function withNumberFields(record, fields) {
  fields.forEach((field) => {
    if (record[field] != null) record[field] = Number(record[field]) || 0;
  });
  return record;
}

async function handleLocalAction(action, data, requestBody, env) {
  const tenant = tenantId(requestBody);
  switch (action) {
    case 'login': {
      const creds = ownerCredentials(env);
      if (String(data.username || '') !== creds.username || String(data.password || '') !== creds.password) {
        throw new Error('Invalid username or password');
      }
      const boot = await ownerBootData(env, tenant);
      return Object.assign({ token: ownerToken(tenant) }, boot);
    }

    case 'logout':
      return { ok: true };

    case 'getBootData':
      requireOwner(requestBody);
      return ownerBootData(env, tenant);

    case 'getFeatureMarketplace': {
      requireOwner(requestBody);
      const active = await listRecords(env, tenant, 'addon_subscriptions');
      const activeByCode = {};
      active.forEach((sub) => { activeByCode[String(sub.module_code || sub.code || '')] = sub; });
      return featureCatalog().map((feature) => {
        const code = feature.module_code || feature.code;
        const sub = activeByCode[code] || {};
        return Object.assign({}, feature, {
          module_code: code,
          monthly_price: feature.price,
          tenant_status: sub.status || null,
          is_trial_available: true
        });
      });
    }

    case 'startTrial': {
      requireOwner(requestBody);
      const moduleCode = String(data.moduleCode || data.module_code || '').trim();
      if (!moduleCode) throw new Error('Module code is required');
      return putRecord(env, tenant, 'addon_subscriptions', {
        id: moduleCode,
        module_code: moduleCode,
        status: 'trial_active',
        trial_started_at: nowIso(),
        trial_ends_at: addDays(30)
      });
    }

    case 'getProducts':
      requireOwner(requestBody);
      return listRecords(env, tenant, 'products');

    case 'createProduct': {
      requireOwner(requestBody);
      const product = Object.assign({
        Product_ID: id('prod'),
        Product_Name: '',
        Category_Name: '',
        Unit: 'pc',
        Barcode: '',
        Cost_Price: 0,
        Selling_Price: 0,
        Current_Stock: 0,
        Reorder_Level: 5
      }, data);
      product.id = product.Product_ID || product.id;
      product.Product_ID = product.Product_ID || product.id;
      return putRecord(env, tenant, 'products', withNumberFields(product, ['Cost_Price', 'Selling_Price', 'Current_Stock', 'Reorder_Level']));
    }

    case 'updateProduct': {
      requireOwner(requestBody);
      const productId = data.productId || data.Product_ID || data.id;
      const patch = Object.assign({}, data);
      delete patch.productId;
      return patchRecord(env, tenant, 'products', productId, withNumberFields(patch, ['Cost_Price', 'Selling_Price', 'Current_Stock', 'Reorder_Level']));
    }

    case 'deleteProduct':
      requireOwner(requestBody);
      return patchRecord(env, tenant, 'products', data.productId || data.Product_ID || data.id, { deleted: true, status: 'deleted' });

    case 'getProductByBarcode': {
      requireOwner(requestBody);
      const products = await listRecords(env, tenant, 'products');
      return products.find((p) => String(p.Barcode || '') === String(data.barcode || '')) || null;
    }

    case 'addProductStock': {
      requireOwner(requestBody);
      const productId = data.productId || data.Product_ID || data.id;
      const current = await getRecord(env, tenant, 'products', productId);
      if (!current) throw new Error('Product not found');
      const qty = Number(data.qty || data.quantity || 0);
      current.Current_Stock = Number(current.Current_Stock || 0) + qty;
      await putRecord(env, tenant, 'products', current);
      await putRecord(env, tenant, 'inventory_movements', {
        productId,
        quantity: qty,
        reason: data.reason || 'stock_added',
        notes: data.notes || '',
        created_at: nowIso()
      });
      return current;
    }

    case 'getCategories':
      requireOwner(requestBody);
      return listRecords(env, tenant, 'categories');

    case 'createCategory': {
      requireOwner(requestBody);
      const name = String(data.Category_Name || data.categoryName || data.name || '').trim();
      if (!name) throw new Error('Category name is required');
      return putRecord(env, tenant, 'categories', { id: name.toLowerCase().replace(/[^a-z0-9]+/g, '_'), Category_Name: name });
    }

    case 'updateCategory': {
      requireOwner(requestBody);
      const oldName = String(data.oldName || data.Category_Name || '').trim();
      const newName = String(data.newName || data.categoryName || '').trim();
      if (!oldName || !newName) throw new Error('Old and new category names are required');
      return putRecord(env, tenant, 'categories', { id: newName.toLowerCase().replace(/[^a-z0-9]+/g, '_'), Category_Name: newName, Previous_Name: oldName });
    }

    case 'deleteCategory':
      requireOwner(requestBody);
      return patchRecord(env, tenant, 'categories', String(data.Category_Name || data.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_'), { deleted: true });

    case 'adminLogin': {
      const creds = adminCredentials(env);
      if (String(data.username || '') !== creds.username || String(data.password || '') !== creds.password) {
        throw new Error('Invalid admin username or password');
      }
      const dash = await adminDashboard(env);
      return Object.assign({
        token: adminToken(),
        admin: { username: creds.username, role: 'admin', name: 'HubSuite Admin' }
      }, dash);
    }

    case 'adminGetDashboardData':
      requireAdmin(requestBody);
      return adminDashboard(env);

    case 'adminGetStores':
      requireAdmin(requestBody);
      return adminStores(env);

    case 'adminGetFeatureCatalog':
      requireAdmin(requestBody);
      return featureCatalog();

    case 'adminGetStoreCommercialState': {
      requireAdmin(requestBody);
      const store = await findAdminStore(env, data.storeId);
      const plan = normalizePlan(store && store.Plan);
      const def = planDefaults(plan);
      return {
        store: store,
        featureCatalog: featureCatalog(),
        subscriptions: [],
        revenueState: {
          base_recurring_amount: Number(store && store.Monthly_Fee) || def.fee,
          addons_recurring_amount: 0,
          staff_overage_amount: 0,
          total_recurring_amount: Number(store && store.Monthly_Fee) || def.fee
        },
        staffSeatState: {
          included_users: def.users < 0 ? null : def.users,
          included_staff: def.users < 0 ? null : Math.max(0, def.users - 1),
          staff_count: 0,
          extra_staff_count: 0,
          extra_staff_amount: 0
        }
      };
    }

    case 'adminSuggestPrice': {
      requireAdmin(requestBody);
      const users = Number(data.maxUsers || 0);
      const products = Number(data.maxProducts || 0);
      let price = 200;
      if (users > 3 || products > 500 || data.reportsLevel === 'ALL') price = 500;
      if (users < 0 || products < 0 || users > 10 || products > 5000 || data.hasHealthIndicators) price = Math.max(price, 1000);
      return { suggestedPrice: price };
    }

    case 'adminProvisionStore': {
      requireAdmin(requestBody);
      const plan = normalizePlan(data.plan || 'TRIAL');
      const def = planDefaults(plan);
      const storeId = id('store');
      const apiKey = String(data.apiKey || storeId).toUpperCase().replace(/[^A-Z0-9_]+/g, '_');
      const trialDays = Number(data.trialDays || platformSettings(env).TRIAL_DAYS || 30);
      const store = await saveAdminStore(env, {
        id: storeId,
        Store_ID: storeId,
        Store_Name: data.storeName || 'New Store',
        Owner_Name: data.ownerName || '',
        Owner_Email: data.ownerEmail || '',
        Owner_Phone: data.ownerPhone || '',
        API_Key: apiKey,
        Status: 'ACTIVE',
        Plan: plan,
        Trial_End: addDays(trialDays),
        Subscription_Expires: addDays(30),
        Monthly_Fee: Number(data.monthlyFee || def.fee || 0),
        Max_Users: data.maxUsers || def.users,
        Max_Products: data.maxProducts || def.products,
        Reports_Level: data.reportsLevel || def.reports,
        Has_Health_Indicators: String(data.hasHealthIndicators != null ? data.hasHealthIndicators : def.health),
        Custom_Modules: data.customModules ? JSON.stringify(data.customModules) : '',
        DB_Provider: getDb(env) ? 'd1' : 'runtime',
        Notes: data.notes || ''
      });
      return {
        storeId: store.Store_ID,
        storeName: store.Store_Name,
        apiKey: store.API_Key,
        ownerUsername: 'owner',
        ownerPassword: '1234',
        trialEnd: String(store.Trial_End).slice(0, 10),
        plan: store.Plan,
        monthlyFee: store.Monthly_Fee
      };
    }

    case 'adminUpdateStore': {
      requireAdmin(requestBody);
      const store = await findAdminStore(env, data.storeId);
      if (!store) throw new Error('Store not found');
      const patch = Object.assign({}, data.patch || {});
      if (data.customModules) patch.Custom_Modules = JSON.stringify(data.customModules);
      return saveAdminStore(env, Object.assign({}, store, patch));
    }

    case 'adminExtendTrial': {
      requireAdmin(requestBody);
      const store = await findAdminStore(env, data.storeId);
      if (!store) throw new Error('Store not found');
      store.Trial_End = addDays(Number(data.extraDays || 30));
      await saveAdminStore(env, store);
      return { newTrialEnd: String(store.Trial_End).slice(0, 10), store: store };
    }

    case 'adminRecordPayment': {
      requireAdmin(requestBody);
      const store = await findAdminStore(env, data.storeId);
      if (!store) throw new Error('Store not found');
      store.Subscription_Expires = addDays(30 * Number(data.monthsPaid || 1));
      store.Status = 'ACTIVE';
      await saveAdminStore(env, store);
      await putRecord(env, 'admin', 'payments', Object.assign({ storeId: data.storeId, created_at: nowIso() }, data));
      return { newExpiry: String(store.Subscription_Expires).slice(0, 10), store: store };
    }

    case 'adminSuspendStore':
    case 'adminActivateStore': {
      requireAdmin(requestBody);
      const store = await findAdminStore(env, data.storeId);
      if (!store) throw new Error('Store not found');
      store.Status = action === 'adminSuspendStore' ? 'SUSPENDED' : 'ACTIVE';
      return saveAdminStore(env, store);
    }

    case 'adminMigrateStore':
    case 'adminRepairStoreModule':
      requireAdmin(requestBody);
      return { ok: true, results: [{ name: action, ok: true }], repaired: true };

    case 'adminGetStoreActivityLog':
      requireAdmin(requestBody);
      return { logs: [] };

    case 'adminGetStoreCustomRoles':
      requireAdmin(requestBody);
      return { roles: [] };

    case 'adminCopyStoreToDedicatedDb': {
      requireAdmin(requestBody);
      const store = await findAdminStore(env, data.storeId);
      if (store && data.activate) {
        store.DB_Provider = 'd1';
        store.D1_Binding = data.d1Binding || store.D1_Binding || '';
        await saveAdminStore(env, store);
      }
      return { totalCopiedRows: 0, activated: !!data.activate, d1Binding: data.d1Binding || '' };
    }

    case 'adminSavePlatformSettings':
      requireAdmin(requestBody);
      return putSetting(env, 'admin', 'platform', Object.assign(platformSettings(env), data));

    case 'adminChangePassword':
      requireAdmin(requestBody);
      return { changed: true, note: 'Set ADMIN_PASSWORD or HUBSUITE_ADMIN_PASSWORD in Cloudflare Pages environment variables to make this durable.' };

    case 'adminGetAllStoreHealth': {
      requireAdmin(requestBody);
      const stores = await adminStores(env);
      return stores.map((s) => ({
        Store_ID: s.Store_ID,
        Health_Score: 100,
        Health_Status: 'HEALTHY',
        Last_Seen_At: nowIso(),
        Revenue_Today: 0,
        Low_Stock_Count: 0
      }));
    }

    case 'adminGetStoreSnapshot': {
      requireAdmin(requestBody);
      const store = await findAdminStore(env, data.storeId);
      if (!store) throw new Error('Store not found');
      return {
        today: nowIso().slice(0, 10),
        store: { id: store.Store_ID, name: store.Store_Name, plan: store.Plan },
        revenueToday: 0,
        revenue7Days: 0,
        grossToday: 0,
        netToday: 0,
        cogsToday: 0,
        expToday: 0,
        txToday: 0,
        productCount: 0,
        lowStockCount: 0,
        outOfStockCount: 0,
        lowStockItems: [],
        recentSales: [],
        recentExpenses: []
      };
    }

    case 'adminGetUnreadCount':
      requireAdmin(requestBody);
      return { count: 0, stores: [] };

    case 'adminGetAllMessages':
      requireAdmin(requestBody);
      return listRecords(env, 'admin', 'messages');

    case 'adminGetStoreMessages': {
      requireAdmin(requestBody);
      const messages = await listRecords(env, 'admin', 'messages');
      return messages.filter((m) => String(m.Store_ID) === String(data.storeId));
    }

    case 'adminSendMessage': {
      requireAdmin(requestBody);
      const store = await findAdminStore(env, data.storeId);
      return putRecord(env, 'admin', 'messages', {
        Store_ID: data.storeId,
        Store_Name: store ? store.Store_Name : data.storeId,
        Direction: 'TO_STORE',
        From_Name: 'HubSuite Admin',
        Message: data.message || '',
        Created_At: nowIso()
      });
    }

    case 'getRegistryStatus':
      return {
        api: 'local',
        database: getDb(env) ? 'bound' : 'runtime-memory',
        schema_version: 'module-records-v1',
        store_count: 1,
        upstream_fallback: !!getUpstreamBase(env)
      };

    case 'getSettings':
      return getSettings(env, tenant);

    case 'updateNotificationSettings': return putSetting(env, tenant, 'notifications', data);
    case 'updateInventoryAlertSettings': return putSetting(env, tenant, 'inventory_alerts', data);
    case 'updateIntegrationSettings': return putSetting(env, tenant, 'integrations', data);
    case 'updateTaxSettings': return putSetting(env, tenant, 'tax', data);
    case 'updateLoggingSettings': return putSetting(env, tenant, 'logging', data);
    case 'updateApprovalThresholds': return putSetting(env, tenant, 'approval_thresholds', data);

    case 'getReceivingHistory': return listRecords(env, tenant, 'receiving');
    case 'getReceivingById': return getRecord(env, tenant, 'receiving', data.id || data.receivingId);
    case 'receiveStock':
      const receiptNo = 'RCV-' + Date.now();
      return putRecord(env, tenant, 'receiving', Object.assign({
        receipt_number: receiptNo,
        receiptNumber: receiptNo,
        status: 'received',
        receipt_date: data.receiptDate || nowIso().slice(0, 10)
      }, data));

    case 'getPurchaseRequisitions': return listRecords(env, tenant, 'purchase_requisitions');
    case 'createPurchaseRequisition':
      return putRecord(env, tenant, 'purchase_requisitions', Object.assign({
        requisition_number: 'PR-' + Date.now(),
        status: 'submitted'
      }, data));

    case 'getFulfillmentOrders': return listRecords(env, tenant, 'fulfillment_orders');
    case 'fulfillOrder': return patchRecord(env, tenant, 'fulfillment_orders', data.id || data.orderId, { status: 'fulfilled', fulfilled_at: nowIso() });

    case 'getBranchLocations': {
      const branches = await listRecords(env, tenant, 'branch_locations');
      return branches.length ? branches : [
        { id: 'main', name: 'Main Branch', status: 'active' },
        { id: 'warehouse', name: 'Warehouse', status: 'active' }
      ];
    }
    case 'getBranchTransfers': return listRecords(env, tenant, 'branch_transfers');
    case 'getBranchTransferById': return getRecord(env, tenant, 'branch_transfers', data.id || data.transferId);
    case 'createBranchTransfer':
      return putRecord(env, tenant, 'branch_transfers', Object.assign({
        transfer_number: 'BT-' + Date.now(),
        status: 'draft',
        source_branch_name: data.sourceBranchId || '',
        destination_branch_name: data.targetBranchId || ''
      }, data));
    case 'submitBranchTransfer': return patchRecord(env, tenant, 'branch_transfers', data.id, { status: 'pending_approval' });
    case 'approveBranchTransfer': return patchRecord(env, tenant, 'branch_transfers', data.id, { status: 'approved' });
    case 'markBranchTransferSent': return patchRecord(env, tenant, 'branch_transfers', data.id, { status: 'in_transit', sent_at: nowIso() });
    case 'receiveBranchTransfer': return patchRecord(env, tenant, 'branch_transfers', data.id, { status: 'received', received_at: nowIso() });
    case 'cancelBranchTransfer': return patchRecord(env, tenant, 'branch_transfers', data.id, { status: 'cancelled', cancelled_at: nowIso() });

    case 'getVendorPayments': return listRecords(env, tenant, 'vendor_payments');
    case 'createVendorPayment':
      return putRecord(env, tenant, 'vendor_payments', withNumberFields(Object.assign({
        payment_number: 'VP-' + Date.now(),
        status: 'posted'
      }, data), ['amount']));

    case 'getCustomerReturns': return listRecords(env, tenant, 'customer_returns');
    case 'createCustomerReturn':
      return putRecord(env, tenant, 'customer_returns', withNumberFields(Object.assign({
        return_number: 'RET-' + Date.now(),
        status: 'received'
      }, data), ['quantity']));

    case 'getPromotions': return listRecords(env, tenant, 'promotions');
    case 'createPromotion':
      return putRecord(env, tenant, 'promotions', withNumberFields(Object.assign({
        status: 'active'
      }, data), ['discountValue']));

    case 'getVoids': return listRecords(env, tenant, 'voids');
    case 'voidSale':
      return putRecord(env, tenant, 'voids', Object.assign({
        status: 'voided',
        void_number: 'VOID-' + Date.now()
      }, data));

    default:
      throw new Error('Unsupported local action: ' + action);
  }
}

function buildUpstreamUrl(requestUrl, upstreamBase) {
  const incoming = new URL(requestUrl);
  const suffix = incoming.pathname.replace(/^\/api/, '');
  return new URL((suffix || '/') + incoming.search, upstreamBase + '/');
}

async function fetchUpstream(context, upstreamBase) {
  const upstreamUrl = buildUpstreamUrl(context.request.url, upstreamBase);
  const upstreamRequest = new Request(upstreamUrl.toString(), context.request);
  return fetch(upstreamRequest);
}

export async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return fail('POST required', 405);
  }

  let body;
  try {
    body = await context.request.clone().json();
  } catch (e) {
    return fail('Invalid JSON request body', 400);
  }

  const action = String(body.action || '');
  const upstreamBase = getUpstreamBase(context.env);

  if (LOCAL_ACTIONS.has(action)) {
    try {
      return ok(await handleLocalAction(action, body.data || {}, body, context.env || {}));
    } catch (e) {
      return fail(e, 500);
    }
  }

  if (upstreamBase) {
    return fetchUpstream(context, upstreamBase);
  }

  return fail('No local handler for action "' + action + '" and UPSTREAM_API_BASE is not configured.', 501);
}
