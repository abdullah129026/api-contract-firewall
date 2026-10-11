// Root layout: html shell only. Dashboard chrome (sidebar, top bar)
// lives in app/(dashboard)/layout.js; the landing page in
// app/(landing)/ gets this bare shell so it stands alone.
// Inter loads via next/font so the real typeface ships, not a fallback.
// Force dynamic so missing DB env vars render an empty state at request
// time instead of failing the build.
import './globals.css';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

export const dynamic = 'force-dynamic';
export const metadata = { title: 'API Contract Firewall' };

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.className}>
      <body>{children}</body>
    </html>
  );
}
