// Sidebar nav with active states and section icons. Client component
// because usePathname is browser-only; the service list comes in as a
// prop from the layout.
'use client';

import { usePathname } from 'next/navigation';

// Tiny stroke icons, 14px, currentColor. Kept inline so the nav needs
// no asset pipeline.
const icons = {
  services: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  violations: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M12 3 2.5 20h19L12 3z" strokeLinejoin="round" />
      <line x1="12" y1="9.5" x2="12" y2="13.5" strokeLinecap="round" />
      <circle cx="12" cy="16.5" r="0.6" fill="currentColor" />
    </svg>
  ),
  setup: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <line x1="4" y1="7" x2="20" y2="7" strokeLinecap="round" />
      <circle cx="9" cy="7" r="2.2" fill="var(--bg-1)" />
      <line x1="4" y1="17" x2="20" y2="17" strokeLinecap="round" />
      <circle cx="15" cy="17" r="2.2" fill="var(--bg-1)" />
    </svg>
  ),
  gate: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z" strokeLinejoin="round" />
      <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

export default function NavLinks({ services }) {
  const path = usePathname();
  const under = (href) => path === href || path.startsWith(href + '/');

  return (
    <nav className="nav">
      <p className="nav-label">Monitor</p>
      <a href="/" className={path === '/' ? 'active' : ''}>
        {icons.services}
        Services
      </a>
      <a href="/violations" className={under('/violations') ? 'active' : ''}>
        {icons.violations}
        Violations
      </a>
      {services.map((s) => (
        <div className="nav-service" key={s.id}>
          <a href={`/s/${s.id}`} className={under(`/s/${s.id}`) ? 'active' : ''}>
            {s.name}
          </a>
          <div className="nav-sub">
            <a
              href={`/s/${s.id}/setup`}
              className={path === `/s/${s.id}/setup` ? 'active' : ''}
            >
              {icons.setup}
              Setup
            </a>
            <a
              href={`/s/${s.id}/gate`}
              className={path === `/s/${s.id}/gate` ? 'active' : ''}
            >
              {icons.gate}
              Gate
            </a>
          </div>
        </div>
      ))}
    </nav>
  );
}
