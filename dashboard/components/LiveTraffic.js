// Live traffic indicator: polls the service status and shows whether the
// proxy has reported traffic recently.
'use client';

import { useEffect, useState } from 'react';

function label(lastSeenAt, live) {
  if (!lastSeenAt) return 'no traffic yet';
  if (live) return 'receiving traffic now';
  const s = Math.max(0, Math.round((Date.now() - new Date(lastSeenAt).getTime()) / 1000));
  const ago =
    s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`;
  return `last request seen ${ago}`;
}

export default function LiveTraffic({ serviceId }) {
  const [lastSeenAt, setLastSeenAt] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    async function poll() {
      try {
        const res = await fetch(`/api/services/${serviceId}/status`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (alive) {
          setLastSeenAt(data.lastSeenAt);
          setFailed(false);
        }
      } catch {
        if (alive) setFailed(true);
      }
    }
    poll();
    const t = setInterval(poll, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [serviceId]);

  if (failed) return <span className="live muted">status unavailable</span>;
  const live =
    lastSeenAt && Date.now() - new Date(lastSeenAt).getTime() < 90 * 1000;

  return (
    <span className="live">
      <span className={`dot ${live ? 'dot-live' : 'dot-idle'}`} />
      {label(lastSeenAt, live)}
    </span>
  );
}
