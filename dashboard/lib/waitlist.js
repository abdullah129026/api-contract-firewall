// Waitlist email handling: normalize and validate before insert.
// Kept in lib so the route and the tests share the same rules.

'use strict';

// Lowercase and trim. Email delivery is case-insensitive on the domain
// and case-sensitive local parts are vanishingly rare; storing one
// canonical form keeps the unique constraint meaningful.
export function normalizeEmail(raw) {
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

// Deliberately simple: one @, non-empty local and domain parts, a dot
// in the domain, no spaces, sane length. This is a signup form, not an
// RFC parser; obvious typos are what we are catching.
export function isValidEmail(email) {
  if (!email || email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
