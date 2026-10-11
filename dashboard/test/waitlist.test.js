// Waitlist email rules: normalize then validate. The route and the db
// layer share these, so the tests pin them here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEmail, isValidEmail } from '../lib/waitlist.js';

test('normalizeEmail trims and lowercases', () => {
  assert.equal(normalizeEmail('  Ada@Example.COM '), 'ada@example.com');
});

test('normalizeEmail returns empty string for non-strings', () => {
  assert.equal(normalizeEmail(null), '');
  assert.equal(normalizeEmail(undefined), '');
  assert.equal(normalizeEmail(42), '');
});

test('isValidEmail accepts ordinary addresses', () => {
  assert.ok(isValidEmail('ada@example.com'));
  assert.ok(isValidEmail('first.last+tag@sub.example.co'));
});

test('isValidEmail rejects the usual typos', () => {
  assert.ok(!isValidEmail(''));
  assert.ok(!isValidEmail('not-an-email'));
  assert.ok(!isValidEmail('missing@domain'));
  assert.ok(!isValidEmail('@example.com'));
  assert.ok(!isValidEmail('spaces in@example.com'));
  assert.ok(!isValidEmail('a@b')); // no dot in domain
});

test('isValidEmail rejects overlong input', () => {
  assert.ok(!isValidEmail(`${'a'.repeat(250)}@example.com`));
});
