// Dashboard layout: sidebar nav, slim top bar with a Docs link, page
// content. Applies to every route in the (dashboard) group; the landing
// page uses its own layout instead.
import { dbFromEnv } from '../../lib/db.js';
import NavLinks from '../../components/NavLinks.js';

export default async function DashboardLayout({ children }) {
  const db = dbFromEnv();
  const services = db ? await db.listServices().catch(() => []) : [];

  return (
    <>
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
    </>
  );
}
