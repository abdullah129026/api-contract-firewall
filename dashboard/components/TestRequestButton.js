// Send one request through the proxy with a given API key and show the
// result. The key goes to our own API route, which forwards it; it is
// never stored or logged.
'use client';

import { useState } from 'react';

export default function TestRequestButton({ serviceId, proxyUrl }) {
  const [apiKey, setApiKey] = useState('');
  const [path, setPath] = useState('/health');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function send() {
    setError('');
    setResult(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/services/${serviceId}/test-request`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ apiKey, path }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'request_failed');
        return;
      }
      setResult(data);
    } catch {
      setError('request_failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="form-row" style={{ maxWidth: 560 }}>
        <input
          type="password"
          placeholder="Paste an API key"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          aria-label="API key"
          autoComplete="off"
        />
        <input
          type="text"
          placeholder="/health"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          aria-label="Path"
          style={{ maxWidth: 160 }}
        />
        <button className="btn" type="button" onClick={send} disabled={busy || !apiKey}>
          {busy ? 'Sending...' : 'Test request'}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {result && (
        <p className="result-line">
          {result.ok ? (
            <span className="result-ok">
              {result.status} through the proxy in {result.ms}ms
            </span>
          ) : (
            <span className="result-bad">
              {result.status ? `proxy answered ${result.status}` : result.error || 'request failed'}
            </span>
          )}
        </p>
      )}
      <p className="muted" style={{ fontSize: 12 }}>
        Sends GET {proxyUrl}
        {path} with your key.
      </p>
    </div>
  );
}
