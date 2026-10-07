// Issue a new API key for a service. The plaintext is returned once and
// kept in local state only; the dashboard stores just the sha256 hash.
'use client';

import { useState } from 'react';
import { CodeBlock } from './ui.js';

export default function NewKeyButton({ serviceId }) {
  const [label, setLabel] = useState('');
  const [key, setKey] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function issue() {
    setError('');
    setBusy(true);
    try {
      const res = await fetch(`/api/services/${serviceId}/keys`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ label }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'request_failed');
        return;
      }
      setKey(data.key);
      setLabel('');
    } catch {
      setError('request_failed');
    } finally {
      setBusy(false);
    }
  }

  if (key) {
    return (
      <div>
        <p style={{ color: 'var(--amber)', fontSize: 13 }}>
          Copy this key now. It will not be shown again.
        </p>
        <CodeBlock code={key} />
        <div style={{ marginTop: 12 }}>
          <button className="btn" type="button" onClick={() => setKey(null)}>
            Issue another key
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="form-row" style={{ maxWidth: 420 }}>
        <input
          type="text"
          placeholder="Key label (optional, e.g. ci)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          aria-label="Key label"
        />
        <button className="btn btn-primary" type="button" onClick={issue} disabled={busy}>
          {busy ? 'Issuing...' : 'New key'}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
