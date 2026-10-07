// Register a service: POST /api/services, then show the API key once.
// Client component because the plaintext key lives in local state and is
// never stored anywhere.
'use client';

import { useState } from 'react';
import CopyButton from './CopyButton.js';
import { CodeBlock } from './ui.js';

export default function NewServiceForm() {
  const [name, setName] = useState('');
  const [origin, setOrigin] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/services', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, origin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'request_failed');
        return;
      }
      setResult(data);
      setName('');
      setOrigin('');
    } catch {
      setError('request_failed');
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="panel">
        <h3>Service created</h3>
        <p>
          This API key is shown once. Copy it now; the dashboard stores only its hash.
        </p>
        <CodeBlock code={result.apiKey} />
        <div style={{ marginTop: 12 }}>
          <a className="btn btn-primary" href={`/s/${result.service.id}/setup`}>
            Continue to setup
          </a>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="panel" style={{ maxWidth: 560 }}>
      <div className="form-row">
        <input
          type="text"
          placeholder="Service name (e.g. billing-api)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Service name"
        />
        <input
          type="text"
          placeholder="Origin URL (e.g. https://api.example.com)"
          value={origin}
          onChange={(e) => setOrigin(e.target.value)}
          aria-label="Origin URL"
        />
      </div>
      {error && <p className="error">{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy || !name || !origin}>
        {busy ? 'Creating...' : 'Create service'}
      </button>
    </form>
  );
}
