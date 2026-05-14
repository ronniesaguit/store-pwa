const LOCAL_ACTIONS = new Set([
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

function memory() {
  const root = globalThis.__STORE_MODULE_API_MEMORY || (globalThis.__STORE_MODULE_API_MEMORY = {
    records: {},
    settings: {}
  });
  return root;
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
