// POST /api/services/[id]/test-request — send one request through the
// proxy with a caller-supplied API key and report the outcome.
//
// Body: { apiKey, path }. The plaintext key passes through this request
// only: it is forwarded to the proxy in x-api-key and is never stored,
// hashed, or logged here.
export const dynamic = 'force-dynamic';

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }

  const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
  const path = typeof body.path === 'string' ? body.path.trim() : '';
  if (!apiKey || apiKey.length > 200) {
    return Response.json({ error: 'api_key_required' }, { status: 400 });
  }
  if (!path.startsWith('/')) {
    return Response.json({ error: 'path_must_start_with_slash' }, { status: 400 });
  }

  const proxyUrl = (process.env.NEXT_PUBLIC_PROXY_URL || process.env.PROXY_URL || '').replace(
    /\/$/,
    ''
  );
  if (!proxyUrl) return Response.json({ error: 'proxy_not_configured' }, { status: 503 });

  const started = Date.now();
  try {
    const res = await fetch(`${proxyUrl}${path}`, {
      headers: { 'x-api-key': apiKey },
      signal: AbortSignal.timeout(10000),
    });
    return Response.json({ ok: res.ok, status: res.status, ms: Date.now() - started });
  } catch {
    return Response.json({ ok: false, error: 'request_failed' });
  }
}
