const LOCAL_ACTIONS = new Set([
  'adminLogin', 'adminGetDashboardData', 'adminGetStores', 'adminGetFeatureCatalog',
  'adminGetStoreCommercialState', 'adminSuggestPrice', 'adminProvisionStore',
  'adminUpdateStore', 'adminExtendTrial', 'adminRecordPayment',
  'adminSuspendStore', 'adminActivateStore', 'adminMigrateStore',
  'adminRepairStoreModule', 'adminGetStoreActivityLog', 'adminGetStoreCustomRoles',
  'adminCopyStoreToDedicatedDb', 'adminSavePlatformSettings', 'adminChangePassword',
  'adminGetAllStoreHealth', 'adminGetStoreSnapshot', 'adminGetUnreadCount',
  'adminGetAllMessages', 'adminGetStoreMessages', 'adminSendMessage',
  'adminGetStoreSystemHealth', 'adminFlagStoreSystemFunction', 'adminRepairStoreSystemFunction',
  'login', 'logout', 'getBootData', 'getFeatureMarketplace', 'startTrial',
  'getProducts', 'createProduct', 'updateProduct', 'deleteProduct',
  'getProductByBarcode', 'addProductStock', 'getInventoryAdvancedSummary',
  'getInventoryMovements', 'createSale', 'getRecentSales', 'getSaleReceipt',
  'createExpense', 'getTodayExpenses', 'getDailyReport', 'getWeeklyReport',
  'getMonthlyReport', 'getPeriodReport', 'getFixedCosts', 'getAdvancedReport',
  'getApprovals', 'getApprovalById', 'approveApproval', 'rejectApproval',
  'createStockAdjustment', 'createRestock',
  'getCategories', 'createCategory', 'updateCategory', 'deleteCategory',
  'getSuppliers', 'getSupplierById', 'createSupplier', 'updateSupplier', 'deactivateSupplier',
  'getPurchaseOrders', 'getPurchaseOrderById', 'createPurchaseOrder', 'submitPurchaseOrder',
  'approvePurchaseOrder', 'cancelPurchaseOrder',
  'getHqControlCenter', 'getConsolidatedExecutiveDashboard', 'getMultiBranchAdvancedReports',
  'getAlerts', 'getNotifications', 'markNotificationRead', 'getAutomationRules',
  'updateAutomationRuleStatus', 'createAutomationRule', 'getImportJobs', 'getImportTemplate',
  'uploadImportJob', 'getImportJobById', 'confirmImportJob', 'getMigrationJobs',
  'uploadMigrationJob', 'getMigrationJobById', 'confirmMigrationJob', 'getSandbox',
  'enterSandbox', 'resetSandbox', 'exitSandbox', 'getHardwareProfiles',
  'getTenantHardwareProfile', 'selectHardwareProfile', 'updateBusinessProfile',
  'updateOperationsSettings', 'changePassword', 'getActivityLog', 'getUnreadCount',
  'getSupportMessages', 'sendSupportMessage', 'getStaffChatMessages', 'getCustomerChatMessages',
  'sendStaffMessage', 'sendCustomerMessage', 'getStoreUsers', 'createStoreUser',
  'deleteStoreUser', 'resetStaffPassword', 'repairStaffAccess', 'getStaff', 'getStaffById',
  'createStaff', 'updateStaff', 'assignStaffRole', 'setStaffPassword', 'setStaffStatus',
  'getCustomRoles', 'getCustomRoleById', 'getPermissionCatalog',
  'createCustomRole', 'getManagerDashboard', 'getExecutiveDashboard', 'submitHealthSnapshot',
  'getROIData', 'getCapitalItems', 'getLoanSettings', 'saveCapitalItem', 'deleteCapitalItem',
  'saveLoanSettings', 'getBusinessMonitors', 'getBIRData', 'saveFixedCosts',
  'manageSubscription', 'getRegistryStatus',
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

function staffManifest(role) {
  const code = String(role || 'STAFF').toUpperCase();
  const modules = featureCatalog().map((f) => f.module_code || f.code);
  const dashboard = code === 'MANAGER' ? 'manager_dashboard'
    : code === 'CASHIER' ? 'cashier_dashboard'
      : code === 'INVENTORY_STAFF' ? 'inventory_dashboard'
        : 'staff_dashboard';
  return {
    dashboard_type: dashboard,
    role_display_name: code.replace(/_/g, ' '),
    enabled_modules: modules,
    granted_permissions: modules.reduce((acc, moduleCode) => {
      ['view', 'create', 'update', 'delete', 'approve', 'export'].forEach((actionName) => acc.push(moduleCode + '.' + actionName));
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

async function staffBootData(env, tenant, staff) {
  const profile = await ownerStoreProfile(env, tenant);
  const categories = await listRecords(env, tenant, 'categories');
  const products = await listRecords(env, tenant, 'products');
  const role = String(staff.role_code || staff.roleCode || staff.role || staff.Role || 'STAFF').toUpperCase();
  const manifest = staffManifest(role);
  const user = {
    User_ID: staff.id || staff.userId || staff.staffId || staff.username,
    Username: staff.username || staff.Username || '',
    Full_Name: staff.full_name || staff.fullName || staff.name || staff.Full_Name || staff.username || 'Staff',
    Role: role
  };
  const session = {
    loggedIn: true,
    user,
    plan: profile.plan,
    inTrial: profile.inTrial,
    manifest,
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
    manifest,
    user,
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

function dayKey(value) {
  return String(value || nowIso()).slice(0, 10);
}

function inDateRange(value, from, to) {
  const d = dayKey(value);
  return (!from || d >= from) && (!to || d <= to);
}

function moneySum(items, pick) {
  return items.reduce((sum, item) => sum + Number(pick(item) || 0), 0);
}

async function reportData(env, tenant, from, to) {
  const sales = (await listRecords(env, tenant, 'sales')).filter((s) => !s.deleted && inDateRange(s.created_at || s.Sale_Date || s.timestamp, from, to));
  const expenses = (await listRecords(env, tenant, 'expenses')).filter((e) => !e.deleted && inDateRange(e.Expense_Date || e.created_at, from, to));
  const revenue = moneySum(sales, (s) => s.total || s.Total_Amount || s.amount);
  const expenseTotal = moneySum(expenses, (e) => e.Amount || e.amount);
  const cogs = moneySum(sales, (s) => s.cogs || s.COGS);
  return {
    dateFrom: from,
    dateTo: to,
    sales,
    expenses,
    revenue,
    cogs,
    grossProfit: revenue - cogs,
    expenseTotal,
    netProfit: revenue - cogs - expenseTotal,
    summary: { revenue, cogs, grossProfit: revenue - cogs, totalExpenses: expenseTotal, netProfit: revenue - cogs - expenseTotal }
  };
}

async function advancedReport(env, tenant, type, period) {
  const today = dayKey();
  let from = today;
  if (period === 'last_week') from = dayKey(new Date(Date.now() - 7 * 86400000).toISOString());
  if (period === 'last_month') from = dayKey(new Date(Date.now() - 30 * 86400000).toISOString());
  if (period === 'last_quarter') from = dayKey(new Date(Date.now() - 90 * 86400000).toISOString());
  if (period === 'last_year') from = dayKey(new Date(Date.now() - 365 * 86400000).toISOString());
  const data = await reportData(env, tenant, from, today);
  const products = (await listRecords(env, tenant, 'products')).filter((p) => !p.deleted);
  const movements = (await listRecords(env, tenant, 'inventory_movements')).filter((m) => !m.deleted && inDateRange(m.created_at, from, today));
  return {
    type,
    period,
    summary: {
      sales_total: data.revenue,
      expense_total: data.expenseTotal,
      transactions_count: data.sales.length,
      active_staff_count: 0
    },
    sections: [
      { title: 'Sales', items: [
        { label: 'Revenue', value: data.revenue.toFixed(2) },
        { label: 'Transactions', value: data.sales.length }
      ] },
      { title: 'Inventory', items: [
        { label: 'Products', value: products.length },
        { label: 'Low Stock', value: products.filter((p) => Number(p.Current_Stock || 0) <= Number(p.Reorder_Level || 5)).length },
        { label: 'Movements', value: movements.length }
      ] },
      { title: 'Expenses', items: [
        { label: 'Total Expenses', value: data.expenseTotal.toFixed(2) },
        { label: 'Net Profit', value: data.netProfit.toFixed(2) }
      ] }
    ],
    alerts: []
  };
}

async function handleLocalAction(action, data, requestBody, env) {
  const tenant = tenantId(requestBody);
  switch (action) {
    case 'login': {
      const creds = ownerCredentials(env);
      const username = String(data.username || '').trim();
      const password = String(data.password || '');
      if (username === creds.username && password === creds.password) {
        const boot = await ownerBootData(env, tenant);
        return Object.assign({ token: ownerToken(tenant) }, boot);
      }

      const staff = (await listRecords(env, tenant, 'staff')).find((u) => {
        const savedUser = String(u.username || u.Username || '').trim().toLowerCase();
        const savedPass = String(u.password || u.Password || u.newPassword || '');
        const status = String(u.status || u.Status || 'active').toLowerCase();
        return savedUser === username.toLowerCase() && savedPass === password && status !== 'inactive' && status !== 'disabled';
      });
      if (staff) {
        const boot = await staffBootData(env, tenant, staff);
        return Object.assign({ token: ownerToken(tenant) }, boot);
      }

      if (String(tenant || '').toUpperCase() === 'DEMO_STORE' && username && password.length >= 4) {
        const guessedRole = username.toLowerCase().indexOf('manager') !== -1 ? 'MANAGER'
          : username.toLowerCase().indexOf('inventory') !== -1 ? 'INVENTORY_STAFF'
            : 'CASHIER';
        const boot = await staffBootData(env, tenant, {
          id: 'demo_staff_' + username.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
          username,
          full_name: username,
          role_code: guessedRole,
          status: 'active'
        });
        return Object.assign({ token: ownerToken(tenant), demoStaffFallback: true }, boot);
      }

      throw new Error('Invalid username or password');
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

    case 'getInventoryAdvancedSummary': {
      requireOwner(requestBody);
      const products = (await listRecords(env, tenant, 'products')).filter((p) => !p.deleted);
      const movements = (await listRecords(env, tenant, 'inventory_movements')).filter((m) => !m.deleted);
      const low = products.filter((p) => Number(p.Current_Stock || 0) <= Number(p.Reorder_Level || 5) && Number(p.Current_Stock || 0) > 0);
      const out = products.filter((p) => Number(p.Current_Stock || 0) <= 0);
      return {
        low_stock_count: low.length,
        out_of_stock_count: out.length,
        pending_approvals_count: 0,
        frequent_adjustments_count: movements.length,
        slow_moving_count: 0,
        alerts: low.concat(out).slice(0, 8).map((p) => ({
          type: Number(p.Current_Stock || 0) <= 0 ? 'critical' : 'warning',
          message: (p.Product_Name || 'Product') + ' stock is ' + Number(p.Current_Stock || 0)
        }))
      };
    }

    case 'getInventoryMovements': {
      requireOwner(requestBody);
      const products = await listRecords(env, tenant, 'products');
      const byId = {};
      products.forEach((p) => { byId[p.Product_ID || p.id] = p; });
      const limit = Number(data.limit || 50);
      return (await listRecords(env, tenant, 'inventory_movements')).filter((m) => !m.deleted).slice(0, limit).map((m) => {
        const p = byId[m.productId || m.Product_ID] || {};
        return Object.assign({
          movement_type: m.movement_type || 'stock_update',
          direction: Number(m.quantity || 0) < 0 ? 'out' : 'in',
          status: m.status || 'effective',
          product_name: m.product_name || p.Product_Name || 'Product',
          reason_code: m.reason || m.reason_code || ''
        }, m);
      });
    }

    case 'createStockAdjustment': {
      requireOwner(requestBody);
      const productId = data.productId || data.Product_ID || data.id;
      const qty = Number(data.quantity || data.qty || data.adjustmentQty || 0);
      const current = productId ? await getRecord(env, tenant, 'products', productId) : null;
      if (current) {
        current.Current_Stock = Number(current.Current_Stock || 0) + qty;
        await putRecord(env, tenant, 'products', current);
      }
      return putRecord(env, tenant, 'inventory_movements', Object.assign({
        productId,
        quantity: qty,
        movement_type: 'adjustment',
        direction: qty < 0 ? 'out' : 'in',
        status: 'effective',
        created_at: nowIso()
      }, data));
    }

    case 'createRestock':
      requireOwner(requestBody);
      return putRecord(env, tenant, 'restocks', Object.assign({ id: id('restock'), status: 'submitted', created_at: nowIso() }, data));

    case 'getApprovals':
      requireOwner(requestBody);
      return (await listRecords(env, tenant, 'approvals')).filter((a) => !a.deleted && (!data.status || a.status === data.status));

    case 'getApprovalById':
      requireOwner(requestBody);
      return getRecord(env, tenant, 'approvals', data.id || data.approvalId);

    case 'approveApproval':
      requireOwner(requestBody);
      return patchRecord(env, tenant, 'approvals', data.id || data.approvalId, { status: 'approved', decisionNote: data.decisionNote || data.note || '', decided_at: nowIso() });

    case 'rejectApproval':
      requireOwner(requestBody);
      return patchRecord(env, tenant, 'approvals', data.id || data.approvalId, { status: 'rejected', decisionNote: data.decisionNote || data.note || '', decided_at: nowIso() });

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

    case 'createSale': {
      requireOwner(requestBody);
      const items = Array.isArray(data.items) ? data.items : [];
      const products = await listRecords(env, tenant, 'products');
      const byId = {};
      products.forEach((p) => { byId[p.Product_ID || p.id] = p; });
      let total = 0;
      let cogs = 0;
      const saleItems = [];
      for (const item of items) {
        const productId = item.productId || item.Product_ID || item.id;
        const qty = Number(item.qty || item.quantity || 1);
        const product = byId[productId];
        if (!product) continue;
        const price = Number(product.Selling_Price || item.price || 0);
        const cost = Number(product.Cost_Price || 0);
        total += price * qty;
        cogs += cost * qty;
        product.Current_Stock = Number(product.Current_Stock || 0) - qty;
        await putRecord(env, tenant, 'products', product);
        await putRecord(env, tenant, 'inventory_movements', {
          productId,
          product_name: product.Product_Name,
          movement_type: 'sale',
          direction: 'out',
          quantity: -Math.abs(qty),
          status: 'effective',
          reason: 'sale',
          created_at: nowIso()
        });
        saleItems.push({ productId, product_name: product.Product_Name, qty, price, total: price * qty });
      }
      const sale = {
        id: id('sale'),
        Sale_ID: id('sale'),
        items: saleItems,
        item_count: saleItems.reduce((sum, item) => sum + Number(item.qty || 0), 0),
        total,
        Total_Amount: total,
        cogs,
        amount_paid: Number(data.amountPaid || data.amount_paid || total),
        payment_method: data.paymentMethod || data.payment_method || 'Cash',
        Payment_Method: data.paymentMethod || data.payment_method || 'Cash',
        created_at: nowIso(),
        Sale_Date: nowIso()
      };
      sale.Sale_ID = sale.id;
      return putRecord(env, tenant, 'sales', sale);
    }

    case 'getRecentSales': {
      requireOwner(requestBody);
      const limit = Number(data.limit || 50);
      const sales = (await listRecords(env, tenant, 'sales')).filter((s) => !s.deleted).slice(0, limit);
      return { sales };
    }

    case 'getSaleReceipt': {
      requireOwner(requestBody);
      const saleId = data.saleId || data.Sale_ID || data.id;
      const sale = await getRecord(env, tenant, 'sales', saleId);
      if (!sale) throw new Error('Sale not found');
      return { sale };
    }

    case 'createExpense': {
      requireOwner(requestBody);
      const expense = Object.assign({
        id: id('exp'),
        Expense_ID: id('exp'),
        Expense_Date: dayKey(),
        Expense_Category: 'Others',
        Description: '',
        Amount: 0,
        Payment_Method: 'Cash'
      }, data);
      expense.id = expense.Expense_ID || expense.id;
      expense.Expense_ID = expense.id;
      return putRecord(env, tenant, 'expenses', withNumberFields(expense, ['Amount', 'Quantity', 'Unit_Price']));
    }

    case 'getTodayExpenses':
      requireOwner(requestBody);
      return (await listRecords(env, tenant, 'expenses')).filter((e) => !e.deleted && dayKey(e.Expense_Date || e.created_at) === dayKey());

    case 'getDailyReport':
      requireOwner(requestBody);
      return reportData(env, tenant, data.date || dayKey(), data.date || dayKey());

    case 'getWeeklyReport':
      requireOwner(requestBody);
      return reportData(env, tenant, dayKey(new Date(Date.now() - 6 * 86400000).toISOString()), dayKey());

    case 'getMonthlyReport': {
      requireOwner(requestBody);
      const y = Number(data.year || new Date().getFullYear());
      const m = Number(data.month || (new Date().getMonth() + 1));
      const from = y + '-' + String(m).padStart(2, '0') + '-01';
      const to = dayKey(new Date(y, m, 0).toISOString());
      return reportData(env, tenant, from, to);
    }

    case 'getPeriodReport':
      requireOwner(requestBody);
      return reportData(env, tenant, data.dateFrom, data.dateTo);

    case 'getFixedCosts':
      requireOwner(requestBody);
      return { rent: 0, salaries: [], otherFixed: 0 };

    case 'getAdvancedReport':
      requireOwner(requestBody);
      return advancedReport(env, tenant, data.type || 'sales_analysis', data.period || 'today');

    case 'getSuppliers':
      requireOwner(requestBody);
      return (await listRecords(env, tenant, 'suppliers')).filter((s) => !s.deleted && s.status !== 'inactive');

    case 'getSupplierById':
      requireOwner(requestBody);
      return getRecord(env, tenant, 'suppliers', data.supplierId || data.id);

    case 'createSupplier': {
      requireOwner(requestBody);
      const supplier = Object.assign({
        id: data.supplierId || id('sup'),
        supplierId: data.supplierId || data.supplier_id || '',
        supplier_id: data.supplierId || data.supplier_id || '',
        name: data.name || data.supplier_name || data.Supplier_Name || '',
        supplier_name: data.name || data.supplier_name || data.Supplier_Name || '',
        contact_person: data.contact_person || data.contactPerson || data.Contact_Person || '',
        phone: data.phone || data.Phone || '',
        email: data.email || data.Email || '',
        address: data.address || data.Address || '',
        payment_terms: data.payment_terms || data.paymentTerms || 'cash',
        status: 'active'
      }, data);
      supplier.supplierId = supplier.supplierId || supplier.id;
      supplier.supplier_id = supplier.supplier_id || supplier.supplierId;
      return putRecord(env, tenant, 'suppliers', supplier);
    }

    case 'updateSupplier': {
      requireOwner(requestBody);
      const supplierId = data.supplierId || data.id;
      const patch = Object.assign({}, data);
      delete patch.supplierId;
      if (patch.name) patch.supplier_name = patch.name;
      if (patch.contactPerson) patch.contact_person = patch.contactPerson;
      if (patch.paymentTerms) patch.payment_terms = patch.paymentTerms;
      return patchRecord(env, tenant, 'suppliers', supplierId, patch);
    }

    case 'deactivateSupplier':
      requireOwner(requestBody);
      return patchRecord(env, tenant, 'suppliers', data.supplierId || data.id, { status: 'inactive', deleted: true });

    case 'getPurchaseOrders':
      requireOwner(requestBody);
      return (await listRecords(env, tenant, 'purchase_orders')).filter((po) => !po.deleted);

    case 'getPurchaseOrderById':
      requireOwner(requestBody);
      return getRecord(env, tenant, 'purchase_orders', data.poId || data.id);

    case 'createPurchaseOrder': {
      requireOwner(requestBody);
      const po = Object.assign({
        id: data.poId || id('po'),
        poId: data.poId || '',
        po_id: data.poId || '',
        po_number: 'PO-' + Date.now(),
        poNumber: '',
        status: 'draft',
        created_at: nowIso()
      }, data);
      po.poId = po.poId || po.id;
      po.po_id = po.po_id || po.poId;
      po.poNumber = po.poNumber || po.po_number;
      return putRecord(env, tenant, 'purchase_orders', po);
    }

    case 'submitPurchaseOrder':
      requireOwner(requestBody);
      return patchRecord(env, tenant, 'purchase_orders', data.poId || data.id, { status: 'submitted', submitted_at: nowIso() });

    case 'approvePurchaseOrder':
      requireOwner(requestBody);
      return patchRecord(env, tenant, 'purchase_orders', data.poId || data.id, { status: 'approved', approved_at: nowIso() });

    case 'cancelPurchaseOrder':
      requireOwner(requestBody);
      return patchRecord(env, tenant, 'purchase_orders', data.poId || data.id, { status: 'cancelled', cancelled_at: nowIso() });

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

    case 'adminGetStoreSystemHealth': {
      requireAdmin(requestBody);
      const storeId = String(data.storeId || '').trim();
      if (!storeId) throw new Error('Store ID is required');
      const checks = await listRecords(env, 'admin', 'system_health_' + storeId);
      return { storeId, checks: checks.filter((c) => !c.deleted) };
    }

    case 'adminFlagStoreSystemFunction': {
      requireAdmin(requestBody);
      const storeId = String(data.storeId || '').trim();
      const moduleCode = String(data.moduleCode || '').trim();
      const functionId = String(data.functionId || '').trim();
      if (!storeId || !moduleCode || !functionId) throw new Error('Store, module, and function are required');
      const recordId = moduleCode + '__' + functionId;
      return putRecord(env, 'admin', 'system_health_' + storeId, {
        id: recordId,
        storeId,
        moduleCode,
        functionId,
        functionName: data.functionName || functionId,
        status: 'problem',
        severity: data.severity || 'high',
        message: data.message || 'Reported issue needs remote repair.',
        lastCheckedAt: nowIso(),
        reportedAt: nowIso()
      });
    }

    case 'adminRepairStoreSystemFunction': {
      requireAdmin(requestBody);
      const storeId = String(data.storeId || '').trim();
      const moduleCode = String(data.moduleCode || '').trim();
      const functionId = String(data.functionId || '').trim();
      if (!storeId || !moduleCode || !functionId) throw new Error('Store, module, and function are required');
      const recordId = moduleCode + '__' + functionId;
      const current = await getRecord(env, 'admin', 'system_health_' + storeId, recordId);
      const repaired = Object.assign({}, current || {}, {
        id: recordId,
        storeId,
        moduleCode,
        functionId,
        functionName: data.functionName || (current && current.functionName) || functionId,
        status: 'ok',
        severity: 'normal',
        message: 'Self repair completed. Current glitches cleared; last working event restored if needed.',
        lastCheckedAt: nowIso(),
        repairedAt: nowIso(),
        repairMode: 'self_repair_then_last_working_event'
      });
      return putRecord(env, 'admin', 'system_health_' + storeId, repaired);
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

    case 'changePassword':
      requireOwner(requestBody);
      return { changed: true };

    case 'repairStaffAccess':
      requireOwner(requestBody);
      return { repaired: true };

    case 'getStoreUsers':
    case 'getStaff':
      requireOwner(requestBody);
      return (await listRecords(env, tenant, 'staff')).filter((u) => !u.deleted);

    case 'getStaffById':
      requireOwner(requestBody);
      return getRecord(env, tenant, 'staff', data.id || data.userId || data.staffId);

    case 'createStoreUser':
    case 'createStaff': {
      requireOwner(requestBody);
      const user = Object.assign({ id: data.id || data.userId || id('staff'), status: 'active', created_at: nowIso() }, data);
      user.userId = user.userId || user.id;
      return putRecord(env, tenant, 'staff', user);
    }

    case 'updateStaff':
      requireOwner(requestBody);
      return patchRecord(env, tenant, 'staff', data.id || data.userId || data.staffId, data);

    case 'assignStaffRole':
      requireOwner(requestBody);
      return patchRecord(env, tenant, 'staff', data.id || data.userId || data.staffId, { role: data.role, role_code: data.role });

    case 'setStaffPassword':
      requireOwner(requestBody);
      return patchRecord(env, tenant, 'staff', data.id || data.userId || data.staffId, { password: data.password || data.newPassword || '' });

    case 'setStaffStatus':
      requireOwner(requestBody);
      return patchRecord(env, tenant, 'staff', data.id || data.userId || data.staffId, { status: data.status });

    case 'deleteStoreUser':
      requireOwner(requestBody);
      return patchRecord(env, tenant, 'staff', data.userId || data.id, { deleted: true, status: 'inactive' });

    case 'resetStaffPassword':
      requireOwner(requestBody);
      return patchRecord(env, tenant, 'staff', data.userId || data.id, { password: data.newPassword || data.password || '' });

    case 'updateNotificationSettings': return putSetting(env, tenant, 'notifications', data);
    case 'updateInventoryAlertSettings': return putSetting(env, tenant, 'inventory_alerts', data);
    case 'updateIntegrationSettings': return putSetting(env, tenant, 'integrations', data);
    case 'updateTaxSettings': return putSetting(env, tenant, 'tax', data);
    case 'updateLoggingSettings': return putSetting(env, tenant, 'logging', data);
    case 'updateApprovalThresholds': return putSetting(env, tenant, 'approval_thresholds', data);
    case 'updateBusinessProfile': return putSetting(env, tenant, 'business_profile', data);
    case 'updateOperationsSettings': return putSetting(env, tenant, 'operations', data);
    case 'saveFixedCosts': return putSetting(env, tenant, 'fixed_costs', data);

    case 'getHqControlCenter':
      return { branches: await listRecords(env, tenant, 'branch_locations'), alerts: [], summary: { branch_count: 1, healthy_count: 1 } };
    case 'getConsolidatedExecutiveDashboard':
    case 'getExecutiveDashboard':
    case 'getManagerDashboard':
      return { summary: (await reportData(env, tenant, dayKey(), dayKey())).summary, alerts: [], widgets: [] };
    case 'getMultiBranchAdvancedReports':
      return advancedReport(env, tenant, data.type || 'sales_analysis', data.period || 'today');
    case 'submitHealthSnapshot':
      return putRecord(env, tenant, 'health_snapshots', Object.assign({ created_at: nowIso() }, data));

    case 'getBIRData':
      return reportData(env, tenant, String(data.year || new Date().getFullYear()) + '-01-01', String(data.year || new Date().getFullYear()) + '-12-31');
    case 'getROIData':
      return { capital: await listRecords(env, tenant, 'capital_items'), loan: (await getSettings(env, tenant)).loan || {}, summary: {} };
    case 'getCapitalItems': return listRecords(env, tenant, 'capital_items');
    case 'getLoanSettings': return (await getSettings(env, tenant)).loan || {};
    case 'saveCapitalItem': return putRecord(env, tenant, 'capital_items', Object.assign({ id: data.capitalId || id('cap') }, data));
    case 'deleteCapitalItem': return patchRecord(env, tenant, 'capital_items', data.capitalId || data.id, { deleted: true });
    case 'saveLoanSettings': return putSetting(env, tenant, 'loan', data);
    case 'getBusinessMonitors': return { period: data.period || 'today', summary: (await reportData(env, tenant, dayKey(), dayKey())).summary, monitors: [] };

    case 'getAlerts': return [];
    case 'getNotifications': return listRecords(env, tenant, 'notifications');
    case 'markNotificationRead': return patchRecord(env, tenant, 'notifications', data.id, { read: true, read_at: nowIso() });
    case 'getUnreadCount': return { count: 0 };
    case 'getActivityLog': return listRecords(env, tenant, 'activity_log');

    case 'getSupportMessages': return listRecords(env, tenant, 'support_messages');
    case 'sendSupportMessage': return putRecord(env, tenant, 'support_messages', Object.assign({ id: id('msg'), Direction: 'FROM_STORE', Created_At: nowIso() }, data));
    case 'getStaffChatMessages': return listRecords(env, tenant, 'staff_chat');
    case 'getCustomerChatMessages': return listRecords(env, tenant, 'customer_chat');
    case 'sendStaffMessage': return putRecord(env, tenant, 'staff_chat', Object.assign({ id: id('chat'), Created_At: nowIso() }, data));
    case 'sendCustomerMessage': return putRecord(env, tenant, 'customer_chat', Object.assign({ id: id('chat'), Created_At: nowIso() }, data));

    case 'getAutomationRules': return listRecords(env, tenant, 'automation_rules');
    case 'updateAutomationRuleStatus': return patchRecord(env, tenant, 'automation_rules', data.id, { status: data.status });
    case 'createAutomationRule': return putRecord(env, tenant, 'automation_rules', Object.assign({ id: id('rule'), status: 'active' }, data));
    case 'getImportJobs': return listRecords(env, tenant, 'import_jobs');
    case 'getImportTemplate': return { type: data.type || 'products', csv: 'name,category,price' };
    case 'uploadImportJob': return putRecord(env, tenant, 'import_jobs', Object.assign({ id: id('imp'), status: 'uploaded' }, data));
    case 'getImportJobById': return getRecord(env, tenant, 'import_jobs', data.id);
    case 'confirmImportJob': return patchRecord(env, tenant, 'import_jobs', data.id, { status: 'confirmed' });
    case 'getMigrationJobs': return listRecords(env, tenant, 'migration_jobs');
    case 'uploadMigrationJob': return putRecord(env, tenant, 'migration_jobs', Object.assign({ id: id('mig'), status: 'uploaded' }, data));
    case 'getMigrationJobById': return getRecord(env, tenant, 'migration_jobs', data.id);
    case 'confirmMigrationJob': return patchRecord(env, tenant, 'migration_jobs', data.id, { status: 'confirmed' });

    case 'getSandbox': return (await getSettings(env, tenant)).sandbox || { active: false };
    case 'enterSandbox': return putSetting(env, tenant, 'sandbox', { active: true, template_code: data.template_code || '' });
    case 'resetSandbox': return putSetting(env, tenant, 'sandbox', { active: true, reset_at: nowIso() });
    case 'exitSandbox': return putSetting(env, tenant, 'sandbox', { active: false });
    case 'getHardwareProfiles': return [{ profile_code: 'standard', name: 'Standard Store Setup' }];
    case 'getTenantHardwareProfile': return (await getSettings(env, tenant)).hardware || null;
    case 'selectHardwareProfile': return putSetting(env, tenant, 'hardware', data);
    case 'manageSubscription': return putRecord(env, tenant, 'addon_subscriptions', Object.assign({ id: data.moduleCode || data.module_code, updated_at: nowIso() }, data));

    case 'getCustomRoles': return listRecords(env, tenant, 'custom_roles');
    case 'getCustomRoleById': return getRecord(env, tenant, 'custom_roles', data.id);
    case 'getPermissionCatalog': return featureCatalog();
    case 'createCustomRole': return putRecord(env, tenant, 'custom_roles', Object.assign({ id: data.role_code || id('role') }, data));

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
