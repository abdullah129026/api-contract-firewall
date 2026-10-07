// Root layout: sidebar nav plus the page content.
// Force dynamic so missing DB env vars render an empty state at request
// time instead of failing the build.
import './globals.css';
import { dbFromEnv } from '../lib/db.js';

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
            <span className="dot dot-enforcing" style={{ marginRight: 6 }} />
            Contract Firewall
          </a>
          <nav className="nav">
            <p className="nav-label">Monitor</p>
            <a href="/">Services</a>
            {services.map((s) => (
              <div className="nav-service" key={s.id}>
                <a href={`/s/${s.id}`}>{s.name}</a>
                <div className="nav-sub">
                  <a href={`/s/${s.id}/setup`}>Setup</a>
                </div>
              </div>
            ))}
          </nav>
        </aside>
        <main className="main">{children}</main>
      </body>
    </html>
  );
}
