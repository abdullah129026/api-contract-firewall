// Root layout: sidebar nav, top bar with global search, page content.
// Force dynamic so missing DB env vars render an empty state at request
// time instead of failing the build.
import './globals.css';
import { dbFromEnv } from '../lib/db.js';
import NavLinks from '../components/NavLinks.js';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'API Contract Firewall' };

export default async function RootLayout({ children }) {
  const db = dbFromEnv();
  const services = db ? await db.listServices().catch(() => []) : [];

  return (
    <html lang="en">
      <body>
        <aside className="sidebar">
          <a className="brand" href="/">
            <span className="brand-mark" aria-hidden="true" />
            Contract Firewall
          </a>
          <NavLinks services={services.map((s) => ({ id: s.id, name: s.name }))} />
        </aside>
        <main className="main">
          <header className="topbar">
            <form action="/violations" method="GET" className="topbar-search" role="search">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <line x1="16.5" y1="16.5" x2="21" y2="21" />
              </svg>
              <input type="text" name="q" placeholder="Search violations…" aria-label="Search violations" />
            </form>
          </header>
          {children}
        </main>
      </body>
    </html>
  );
}
