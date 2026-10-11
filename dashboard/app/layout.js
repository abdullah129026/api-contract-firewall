// Root layout: sidebar nav, slim top bar with a Docs link, page content.
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
            <a className="topbar-docs" href="https://github.com/abdullah129026/api-contract-firewall">
              Docs
            </a>
          </header>
          {children}
        </main>
      </body>
    </html>
  );
}
