// Triage buttons for a violation. Only the actions the state machine
// allows are shown: open violations get approve/dismiss, decided ones
// get undo (reopen).
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function TriageButtons({ violationId, status }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  async function act(action) {
    setError('');
    setBusy(true);
    try {
      const res = await fetch(`/api/violations/${violationId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'request_failed');
        return;
      }
      router.refresh();
    } catch {
      setError('request_failed');
    } finally {
      setBusy(false);
    }
  }

  if (status === 'open') {
    return (
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button
          className="btn btn-primary"
          type="button"
          disabled={busy}
          onClick={() => act('approve')}
        >
          {busy ? 'Working...' : 'Approve change'}
        </button>
        <button className="btn" type="button" disabled={busy} onClick={() => act('false_positive')}>
          False positive
        </button>
        {error && <span className="error">{error}</span>}
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
      <button className="btn" type="button" disabled={busy} onClick={() => act('reopen')}>
        {busy ? 'Working...' : 'Undo (reopen)'}
      </button>
      {error && <span className="error">{error}</span>}
    </div>
  );
}
