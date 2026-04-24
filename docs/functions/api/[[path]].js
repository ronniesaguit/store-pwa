function getUpstreamBase(env) {
  return String(env.UPSTREAM_API_BASE || '').replace(/\/+$/, '');
}

function buildUpstreamUrl(requestUrl, upstreamBase) {
  const incoming = new URL(requestUrl);
  const suffix = incoming.pathname.replace(/^\/api/, '');
  return new URL((suffix || '/') + incoming.search, upstreamBase + '/');
}

export async function onRequest(context) {
  const upstreamBase = getUpstreamBase(context.env);
  if (!upstreamBase) {
    return new Response(JSON.stringify({
      success: false,
      error: 'UPSTREAM_API_BASE is not configured for this Pages deployment.'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  const upstreamUrl = buildUpstreamUrl(context.request.url, upstreamBase);
  const upstreamRequest = new Request(upstreamUrl.toString(), context.request);
  return fetch(upstreamRequest);
}
