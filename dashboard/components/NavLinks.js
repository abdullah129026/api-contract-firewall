// Sidebar nav with active states. Client component because usePathname
// is browser-only; the service list comes in as a prop from the layout.
'use client';

import { usePathname } from 'next/navigation';

export default function NavLinks({ services }) {
  const path = usePathname();
  const under = (href) => path === href || path.startsWith(href + '/');

  return (
    <nav className="nav">
      <p className="nav-label">Monitor</p>
      <a href="/" className={path === '/' ? 'active' : ''}>
        Services
      </a>
      <a href="/violations" className={under('/violations') ? 'active' : ''}>
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
              Setup
            </a>
            <a
              href={`/s/${s.id}/gate`}
              className={path === `/s/${s.id}/gate` ? 'active' : ''}
            >
              Gate
            </a>
          </div>
        </div>
      ))}
    </nav>
  );
}
