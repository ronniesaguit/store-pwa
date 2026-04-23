function getUpstreamBase(env) {
  return String(env.UPSTREAM_API_BASE || '').replace(/\/+$/, '');
}

function buildUpstreamUrl(requestUrl, upstreamBase) {
  const incoming = new URL(requestUrl);
  const suffix = incoming.pathname.replace(/^\/api/, '');
  return new URL((suffix || '/') + incoming.search, upstreamBase + '/');
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

async function readActionPayload(request) {
  const text = await request.clone().text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
}

async function callUpstreamAction(upstreamBase, payload) {
  const response = await fetch(new URL('/', upstreamBase + '/').toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch (error) {
    throw new Error('Upstream API returned invalid JSON.');
  }

  if (!parsed || parsed.success !== true) {
    throw new Error((parsed && parsed.error) || ('Upstream API error (HTTP ' + response.status + ').'));
  }

  return parsed.data;
}

function normalizeSubscription(feature) {
  return {
    module_code: feature.module_code || feature.code || '',
    feature_name: feature.feature_name || feature.name || feature.module_code || feature.code || 'Add-on',
    short_description: feature.short_description || feature.shortDescription || '',
    status: feature.tenant_status || feature.status || 'locked',
    trial_ends_at: feature.trial_ends_at || null,
    monthly_price: Number(feature.monthly_price || feature.display_monthly_price || 0) || 0
  };
}

function buildRevenueState(store, subscriptions) {
  const baseRecurringAmount = Number(store && store.Monthly_Fee) || 0;
  const addonStatuses = new Set(['active_paid']);
  const addonsRecurringAmount = (subscriptions || []).reduce((sum, sub) => {
    return addonStatuses.has(sub.status) ? (sum + (Number(sub.monthly_price) || 0)) : sum;
  }, 0);

  return {
    base_recurring_amount: baseRecurringAmount,
    addons_recurring_amount: addonsRecurringAmount,
    total_recurring_amount: baseRecurringAmount + addonsRecurringAmount
  };
}

function normalizePlanId(planId) {
  const raw = String(planId || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  const aliases = {
    STARTER: 'NEGOSYO_HUB',
    BASIC: 'NEGOSYO_HUB',
    NEGOSYO: 'NEGOSYO_HUB',
    STANDARD: 'BUSINESS_HUB',
    GROWTH: 'BUSINESS_HUB',
    PRO: 'BUSINESS_HUB',
    BUSINESS: 'BUSINESS_HUB',
    ELITE: 'NEXORA_HUB',
    NEXORA: 'NEXORA_HUB'
  };
  return aliases[raw] || raw || 'NEGOSYO_HUB';
}

function getStaffPolicy(planId) {
  const policies = {
    TRIAL: { includedUsers: 2, extraStaffPrice: 10 },
    NEGOSYO_HUB: { includedUsers: 2, extraStaffPrice: 10 },
    BUSINESS_HUB: { includedUsers: 4, extraStaffPrice: 15 },
    NEXORA_HUB: { includedUsers: 11, extraStaffPrice: 20 },
    CUSTOM: { includedUsers: null, extraStaffPrice: null }
  };
  const normalized = normalizePlanId(planId);
  const policy = policies[normalized] || policies.NEGOSYO_HUB;
  return {
    planId: normalized,
    includedUsers: policy.includedUsers,
    includedStaff: policy.includedUsers === null ? null : Math.max(0, policy.includedUsers - 1),
    extraStaffPrice: policy.extraStaffPrice
  };
}

function buildStaffSeatState(store, users) {
  const policy = getStaffPolicy(store && store.Plan);
  const staffCount = (Array.isArray(users) ? users : []).filter((user) => String(user && user.Role || '').toUpperCase() !== 'OWNER').length;
  const extraStaff = policy.includedStaff === null ? 0 : Math.max(0, staffCount - policy.includedStaff);
  return {
    policy,
    staff_count: staffCount,
    included_users: policy.includedUsers,
    included_staff: policy.includedStaff,
    extra_staff_count: extraStaff,
    extra_staff_price: policy.extraStaffPrice,
    extra_staff_amount: extraStaff * (Number(policy.extraStaffPrice) || 0)
  };
}

async function handleAdminGetStoreCommercialState(upstreamBase, payload) {
  const adminToken = payload && payload.adminToken;
  const storeId = payload && payload.data && payload.data.storeId;
  if (!adminToken) {
    return jsonResponse({ success: false, error: 'Admin not logged in.' }, 401);
  }
  if (!storeId) {
    return jsonResponse({ success: false, error: 'Store ID is required.' }, 400);
  }

  const [stores, featureCatalog] = await Promise.all([
    callUpstreamAction(upstreamBase, { action: 'adminGetStores', adminToken, data: {} }),
    callUpstreamAction(upstreamBase, { action: 'adminGetFeatureCatalog', adminToken, data: {} }).catch(() => [])
  ]);

  const store = (Array.isArray(stores) ? stores : []).find((item) => String(item && item.Store_ID) === String(storeId));
  if (!store) {
    return jsonResponse({ success: false, error: 'Store not found.' }, 404);
  }
  if (!store.API_Key) {
    return jsonResponse({
      success: true,
      data: {
        featureCatalog: Array.isArray(featureCatalog) ? featureCatalog : [],
        subscriptions: [],
        revenueState: buildRevenueState(store, []),
        staffSeatState: buildStaffSeatState(store, [])
      }
    });
  }

  const [marketplace, storeUsers] = await Promise.all([
    callUpstreamAction(upstreamBase, {
      action: 'getFeatureMarketplace',
      storeKey: String(store.API_Key),
      data: {}
    }),
    callUpstreamAction(upstreamBase, {
      action: 'getStoreUsers',
      storeKey: String(store.API_Key),
      data: {}
    }).catch(() => [])
  ]);

  const subscriptions = (Array.isArray(marketplace) ? marketplace : [])
    .map(normalizeSubscription)
    .filter((feature) => feature.module_code && feature.status !== 'locked');

  const revenueState = buildRevenueState(store, subscriptions);
  const staffSeatState = buildStaffSeatState(store, storeUsers);
  if (staffSeatState.extra_staff_amount) {
    revenueState.staff_overage_amount = staffSeatState.extra_staff_amount;
    revenueState.total_recurring_amount += staffSeatState.extra_staff_amount;
  }

  return jsonResponse({
    success: true,
    data: {
      featureCatalog: Array.isArray(featureCatalog) ? featureCatalog : [],
      subscriptions,
      revenueState,
      staffSeatState
    }
  });
}

export async function onRequest(context) {
  const upstreamBase = getUpstreamBase(context.env);
  if (!upstreamBase) {
    return jsonResponse({
      success: false,
      error: 'UPSTREAM_API_BASE is not configured for this Pages deployment.'
    }, 500);
  }
  if (context.request.method === 'POST') {
    const payload = await readActionPayload(context.request);
    if (payload && payload.action === 'adminGetStoreCommercialState') {
      try {
        return await handleAdminGetStoreCommercialState(upstreamBase, payload);
      } catch (error) {
        return jsonResponse({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to load commercial state.'
        }, 500);
      }
    }
  }
  const upstreamUrl = buildUpstreamUrl(context.request.url, upstreamBase);
  const upstreamRequest = new Request(upstreamUrl.toString(), context.request);
  return fetch(upstreamRequest);
}
